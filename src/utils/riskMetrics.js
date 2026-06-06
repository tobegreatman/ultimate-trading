/**
 * 风险指标计算模块
 * 提供 Sharpe 比率、最大回撤、Beta 系数的纯数学计算
 * 数据来源：个股日 K 线 + 基准指数日 K 线
 */

// ==================== 基础工具 ====================

/**
 * 计算日收益率序列
 * @param {number[]} closes - 收盘价序列（按时间正序，即最旧在前）
 * @returns {number[]} 日收益率序列（长度 = closes.length - 1）
 */
export function calcDailyReturns(closes) {
  if (!closes || closes.length < 2) return []
  const returns = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push(closes[i] / closes[i - 1] - 1)
    } else {
      returns.push(0)
    }
  }
  return returns
}

/** 均值 */
function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

/** 样本标准差 */
function stdDev(arr) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

// ==================== Sharpe 比率 ====================

/**
 * 计算年化 Sharpe 比率
 * @param {number[]} returns - 日收益率序列
 * @param {number} [riskFreeRate=0.015] - 年化无风险利率（默认 1.5%，约一年期定存）
 * @returns {number} 年化 Sharpe 比率，数据不足返回 null
 */
export function calcSharpe(returns, riskFreeRate = 0.015) {
  if (!returns || returns.length < 20) return null

  function sharpeFromSlice(rets) {
    const avgReturn = mean(rets)
    const vol = stdDev(rets)
    if (vol === 0) return 0
    const annualizedReturn = avgReturn * 252
    const annualizedVol = vol * Math.sqrt(252)
    return (annualizedReturn - riskFreeRate) / annualizedVol
  }

  const fullSharpe = sharpeFromSlice(returns)

  // 数据充足时，同时计算近60日Sharpe，取较优值
  if (returns.length >= 60) {
    const recentSharpe = sharpeFromSlice(returns.slice(-60))
    return Math.max(fullSharpe, recentSharpe)
  }

  return fullSharpe
}

// ==================== 最大回撤 ====================

/**
 * 计算最大回撤
 * @param {number[]} closes - 收盘价序列（按时间正序）
 * @returns {{ mdd: number, days: number } | null}
 *   mdd: 最大回撤比例（0~1，如 0.25 表示 25% 回撤）
 *   days: 从最高点到最大回撤谷底的交易日数
 */
export function calcMaxDrawdown(closes) {
  if (!closes || closes.length < 2) return null

  let peak = closes[0]
  let peakIdx = 0
  let mdd = 0
  let mddDays = 0

  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > peak) {
      peak = closes[i]
      peakIdx = i
    } else {
      const dd = (peak - closes[i]) / peak
      if (dd > mdd) {
        mdd = dd
        mddDays = i - peakIdx
      } else if (dd === mdd) {
        // 同等回撤取更长的持续天数
        mddDays = Math.max(mddDays, i - peakIdx)
      }
    }
  }

  return { mdd, days: mddDays }
}

// ==================== Beta 系数 ====================

/**
 * 计算个股相对于基准的 Beta 系数
 * @param {number[]} stockReturns - 个股日收益率序列
 * @param {number[]} benchReturns - 基准日收益率序列（与 stockReturns 等长且时间对齐）
 * @returns {number | null} Beta 系数，数据不足返回 null
 */
export function calcBeta(stockReturns, benchReturns) {
  if (!stockReturns || !benchReturns) return null
  const n = Math.min(stockReturns.length, benchReturns.length)
  if (n < 20) return null

  // 对齐最近n个数据点（修复：从尾部取而非头部）
  const sR = stockReturns.slice(-n)
  const bR = benchReturns.slice(-n)

  const meanS = mean(sR)
  const meanB = mean(bR)

  // 指数衰减加权：近期数据权重更大（halfLife=60天）
  const halfLife = 60
  const decay = Math.exp(-Math.log(2) / halfLife)

  let cov = 0
  let varB = 0
  let weightSum = 0
  let w = 1

  for (let i = 0; i < n; i++) {
    const ds = sR[i] - meanS
    const db = bR[i] - meanB
    cov += w * ds * db
    varB += w * db * db
    weightSum += w
    w /= decay
  }

  if (varB === 0 || weightSum === 0) return null
  return (cov / weightSum) / (varB / weightSum)
}

// ==================== 汇总：风险指标评分 ====================

/**
 * 计算风险指标并生成评分所需的子项
 * @param {number[]} stockCloses - 个股收盘价序列（按时间正序，最旧在前）
 * @param {number[]|null} benchCloses - 基准指数收盘价序列（同上，可为 null）
 * @returns {{ items: Array<{name:string, score:number, max:number, desc:string}>, metrics: {sharpe:number|null, mdd:number|null, mddDays:number|null, benchMdd:number|null, excessMdd:number|null, beta:number|null} }}
 */
export function calcRiskScoreItems(stockCloses, benchCloses, style = 'mid') {
  const stockReturns = calcDailyReturns(stockCloses)
  const items = []
  const metrics = { sharpe: null, mdd: null, mddDays: null, benchMdd: null, excessMdd: null, beta: null }

  // 1. Sharpe 比率 (0-5)
  const sharpe = calcSharpe(stockReturns)
  metrics.sharpe = sharpe
  if (sharpe !== null) {
    let score, desc
    if (sharpe >= 1.5) { score = 5; desc = `Sharpe=${sharpe.toFixed(2)}（优秀）` }
    else if (sharpe >= 1.0) { score = 4; desc = `Sharpe=${sharpe.toFixed(2)}（良好）` }
    else if (sharpe >= 0.5) { score = 3; desc = `Sharpe=${sharpe.toFixed(2)}（一般）` }
    else if (sharpe >= 0) { score = 2; desc = `Sharpe=${sharpe.toFixed(2)}（偏低）` }
    else if (sharpe >= -0.5) { score = 1; desc = `Sharpe=${sharpe.toFixed(2)}（较差）` }
    else { score = 0; desc = `Sharpe=${sharpe.toFixed(2)}（极差）` }
    items.push({ name: 'Sharpe', score, max: 5, desc })
  } else {
    items.push({ name: 'Sharpe', score: 3, max: 5, desc: '数据不足' })
  }

  // 2. 最大回撤 (0-5) — 基于超额回撤（相对基准）评分
  const ddResult = calcMaxDrawdown(stockCloses)
  if (ddResult) {
    metrics.mdd = ddResult.mdd
    metrics.mddDays = ddResult.days
    const mddPct = (ddResult.mdd * 100).toFixed(1)

    // 尝试获取基准最大回撤，计算超额回撤
    const benchDdResult = benchCloses ? calcMaxDrawdown(benchCloses) : null
    if (benchDdResult) {
      metrics.benchMdd = benchDdResult.mdd
      const excessMdd = ddResult.mdd - benchDdResult.mdd
      metrics.excessMdd = excessMdd
      const excessPct = (excessMdd * 100).toFixed(1)
      const benchPct = (benchDdResult.mdd * 100).toFixed(1)
      let score, desc
      if (excessMdd < 0) { score = 5; desc = `回撤${mddPct}%，超额${excessPct}%（跑赢基准${benchPct}%）` }
      else if (excessMdd === 0) { score = 5; desc = `回撤${mddPct}%，与基准持平` }
      else if (excessMdd <= 0.10) { score = 4; desc = `回撤${mddPct}%，超额+${excessPct}%（略逊基准${benchPct}%）` }
      else if (excessMdd <= 0.20) { score = 3; desc = `回撤${mddPct}%，超额+${excessPct}%（偏离基准${benchPct}%）` }
      else if (excessMdd <= 0.35) { score = 2; desc = `回撤${mddPct}%，超额+${excessPct}%（远逊基准${benchPct}%）` }
      else if (excessMdd <= 0.50) { score = 1; desc = `回撤${mddPct}%，超额+${excessPct}%（大幅跑输基准${benchPct}%）` }
      else { score = 0; desc = `回撤${mddPct}%，超额+${excessPct}%（极端跑输基准${benchPct}%）` }
      items.push({ name: '最大回撤', score, max: 5, desc })
    } else {
      // 无基准数据时退回绝对值评分（阈值适配 A 股个股）
      let score, desc
      if (ddResult.mdd <= 0.15) { score = 5; desc = `最大回撤${mddPct}%（极低）` }
      else if (ddResult.mdd <= 0.25) { score = 4; desc = `最大回撤${mddPct}%（较低）` }
      else if (ddResult.mdd <= 0.35) { score = 3; desc = `最大回撤${mddPct}%（适中）` }
      else if (ddResult.mdd <= 0.50) { score = 2; desc = `最大回撤${mddPct}%（较高）` }
      else if (ddResult.mdd <= 0.65) { score = 1; desc = `最大回撤${mddPct}%（高）` }
      else { score = 0; desc = `最大回撤${mddPct}%（极高）` }
      items.push({ name: '最大回撤', score, max: 5, desc })
    }
  } else {
    items.push({ name: '最大回撤', score: 3, max: 5, desc: '数据不足' })
  }

  // 3. Beta 系数 (0-5)
  if (benchCloses && benchCloses.length >= 20 && stockReturns.length >= 20) {
    const benchReturns = calcDailyReturns(benchCloses)
    const beta = calcBeta(stockReturns, benchReturns)
    metrics.beta = beta
    if (beta !== null) {
      let score, desc
      if (style === 'short') {
        // 短线：偏好高Beta（弹性大=机会多）
        if (beta >= 1.0 && beta <= 1.5) { score = 5; desc = `Beta=${beta.toFixed(2)}（进攻型适中）` }
        else if ((beta >= 0.5 && beta < 1.0) || (beta > 1.5 && beta <= 1.8)) { score = 3; desc = `Beta=${beta.toFixed(2)}（偏离）` }
        else if (beta >= 0.3) { score = 2; desc = `Beta=${beta.toFixed(2)}（偏低）` }
        else { score = 1; desc = `Beta=${beta.toFixed(2)}（极端）` }
      } else if (style === 'long') {
        // 长线：偏好低Beta（防御性=低回撤风险）
        if (beta >= 0.5 && beta < 0.8) { score = 5; desc = `Beta=${beta.toFixed(2)}（防御型适中）` }
        else if (beta >= 0.8 && beta < 1.0) { score = 4; desc = `Beta=${beta.toFixed(2)}（略偏高）` }
        else if ((beta >= 0.3 && beta < 0.5) || (beta >= 1.0 && beta < 1.3)) { score = 3; desc = `Beta=${beta.toFixed(2)}（偏离）` }
        else { score = 1; desc = `Beta=${beta.toFixed(2)}（极端）` }
      } else {
        // 中线：平衡（原逻辑）
        if (beta >= 0.8 && beta <= 1.2) { score = 5; desc = `Beta=${beta.toFixed(2)}（适中）` }
        else if ((beta >= 0.5 && beta < 0.8) || (beta > 1.2 && beta <= 1.5)) { score = 3; desc = `Beta=${beta.toFixed(2)}（偏离）` }
        else { score = 1; desc = `Beta=${beta.toFixed(2)}（极端）` }
      }
      items.push({ name: 'Beta', score, max: 5, desc })
    } else {
      items.push({ name: 'Beta', score: 3, max: 5, desc: '数据不足' })
    }
  } else {
    items.push({ name: 'Beta', score: 3, max: 5, desc: '无基准数据' })
  }

  return { items, metrics }
}
