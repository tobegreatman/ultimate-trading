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

  // 数据充足时，近60日为主(70%)，全期为辅(30%)，避免取max高估风险
  if (returns.length >= 60) {
    const recentSharpe = sharpeFromSlice(returns.slice(-60))
    return recentSharpe * 0.7 + fullSharpe * 0.3
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

// ==================== 流动性风险 ====================

/**
 * 流动性风险评分 (0-5, 分越高=流动性越好=风险越低)
 *
 * 设计：前三个风险子项（Sharpe/最大回撤/Beta）全是"价格怎么走"，完全没衡量
 * "能不能交易出去"。小盘股/地量股的 Sharpe 可以很好看，但出货就是死。本子项补这个盲区。
 *
 * 双信号 + 两修饰：
 *   主信号 平均换手率(近60日) —— 基础可交易性，已按流通盘归一（天然市值感知，
 *                                 小盘不会被误判）；A股 ±10% 涨跌停下比 Amihud 更稳，故作主信号
 *   副信号 Amihud 非流动性 —— 每亿元成交额的价格冲击(%)，捕捉"成交额看着行
 *                              但价格一碰就动"的薄盘股（换手率测不到）
 *   修饰① 换手率变异系数 CV —— 脉冲式成交（忽地量忽放量）降分，进出难度陡增
 *   修饰② 近5日成交额断崖萎缩 —— 出货窗口正在收窄的实时预警
 *
 * 数据：日K线对象数组，需含 close / amount(元) / turnover(%)。停牌日(amount=0)自动剔除。
 * 数据缺失（K线不足 / 无换手率，如腾讯兜底K线）返回占位项，与现有风险面口径一致。
 *
 * @param {Array<{close:number, amount:number, turnover:number}>} klines
 * @returns {{score:number, max:number, desc:string, _placeholder:boolean, _metrics:{avgTurnover:number, turnoverCv:number, impactPerYi:number|null}|null}}
 */
function calcLiquidityScore(klines) {
  const win = klines.slice(-60)
  if (win.length < 20) {
    return { score: 2, max: 4, desc: '数据不足', _placeholder: true, _metrics: null }
  }

  // ---- 主信号：平均换手率 + 变异系数 ----
  const turns = win.map(k => k.turnover).filter(t => Number.isFinite(t) && t > 0)
  const amts = win.map(k => k.amount).filter(a => Number.isFinite(a) && a > 0)
  if (turns.length < 20) {
    // 换手率缺失（如腾讯兜底K线不带 turnover）→ 占位，不硬算出噪声
    return { score: 2, max: 4, desc: '换手率数据不足', _placeholder: true, _metrics: null }
  }

  const avgTurn = turns.reduce((s, v) => s + v, 0) / turns.length
  const variance = turns.reduce((s, v) => s + (v - avgTurn) ** 2, 0) / turns.length
  const cv = avgTurn > 0 ? Math.sqrt(variance) / avgTurn : 0

  // ---- 副信号：Amihud 非流动性 → 每亿元价格冲击(%)
  // ILLIQ = mean(|r_t| / amount_t)，r 为小数、amount 为元；×1e8×100 即"投入1亿元推动价格多少%"
  let illiqSum = 0, illiqN = 0
  for (let i = 1; i < win.length; i++) {
    const amt = win[i].amount
    const prevClose = win[i - 1].close
    if (!amt || amt <= 0 || !prevClose || prevClose <= 0) continue   // 停牌日跳过
    illiqSum += Math.abs(win[i].close / prevClose - 1) / amt
    illiqN++
  }
  const impactPerYi = illiqN >= 20 ? (illiqSum / illiqN) * 1e8 * 100 : null

  // ---- 主分：基于平均换手率 ----
  let score, desc
  if (avgTurn >= 3.0) { score = cv <= 1.0 ? 4 : 3; desc = `换手率${avgTurn.toFixed(2)}%(充裕)` }
  else if (avgTurn >= 1.5) { score = 3; desc = `换手率${avgTurn.toFixed(2)}%(良好)` }
  else if (avgTurn >= 0.8) { score = 2; desc = `换手率${avgTurn.toFixed(2)}%(一般)` }
  else if (avgTurn >= 0.3) { score = cv > 1.5 ? 0 : 1; desc = `换手率${avgTurn.toFixed(2)}%(${cv > 1.5 ? '脉冲地量' : '偏弱'})` }
  else { score = 0; desc = `换手率${avgTurn.toFixed(2)}%(流动性差)` }

  // ---- 修饰①：薄盘预警（Amihud 价格冲击异常高）----
  if (impactPerYi != null && impactPerYi > 0.5 && score > 1) {
    score = Math.max(1, score - 1)
    desc += `,薄盘(1亿推动${impactPerYi.toFixed(2)}%)`
  }

  // ---- 修饰②：近5日成交额断崖萎缩（出货窗口收窄）----
  if (amts.length >= 30) {
    const recent5 = amts.slice(-5).reduce((s, v) => s + v, 0) / 5
    const baselineAmt = amts.reduce((s, v) => s + v, 0) / amts.length
    if (baselineAmt > 0 && recent5 < baselineAmt * 0.4 && score > 1) {
      score = Math.max(1, score - 1)
      desc += ',近期缩量'
    }
  }

  return {
    score, max: 4, desc, _placeholder: false,
    _metrics: { avgTurnover: +avgTurn.toFixed(3), turnoverCv: +cv.toFixed(2), impactPerYi: impactPerYi != null ? +impactPerYi.toFixed(3) : null }
  }
}

// ==================== 财务健康度 ====================

/**
 * 财务健康度评分 (0-5, 分越高=基本面越稳健=风险越低)
 *
 * 风险面前三项(Sharpe/MDD/Beta)+流动性全是价格/交易面风险，完全没衡量"公司本身会不会出事"。
 * 本子项用财务历史(24季度)补这个盲区，聚焦"稳定性/趋势/爆雷"——与基本面面只看"当前水平"错开：
 *
 *   1) 净利率稳定性(CV) —— 盈利是否可持续。用净利率(比率，跨报告期可比)而非 ROE：
 *      ROEJQ 是报告期累计值，Q1/H1/Q3/FY 窗口长度不同，跨期算 CV 会被窗口差异主导。
 *      净利率 = 净利润/营收，是比率，不受窗口影响（实测茅台 8 期均 ~52%）。
 *   2) 负债趋势(近4期 debtRatio 变化) —— 基本面面只看当前负债率水平，不看方向。
 *   3) 现金流质量(最新 ocfToProfitRatio) —— 作为"经营现金流为负"的爆雷 tripwire
 *      （与基本面面现金流项有轻度重叠，但风险面需独立 flag 爆雷风险）。
 *
 * 评分：基准 3 + 各信号调整，clamp 0-5。数据不足（历史<3期 / 无任何信号）→ 占位。
 *
 * @param {{history?:Array<{netMargin:number,debtRatio:number,ocfToProfitRatio:number}>, latest?:Object}|null} fundamental
 * @returns {{score:number, max:number, desc:string, _placeholder:boolean, _metrics:Object|null}}
 */
function calcFinancialHealthScore(fundamental) {
  const history = fundamental?.history
  if (!Array.isArray(history) || history.length < 3) {
    return { score: 2, max: 3, desc: '数据不足', _placeholder: true, _metrics: null }
  }

  // ---- 信号1：净利率稳定性(变异系数 CV)----
  const margins = history.map(h => h.netMargin).filter(m => Number.isFinite(m))
  let marginCv = null, marginMean = null
  if (margins.length >= 4) {
    marginMean = margins.reduce((s, v) => s + v, 0) / margins.length
    if (marginMean !== 0) {
      const variance = margins.reduce((s, v) => s + (v - marginMean) ** 2, 0) / margins.length
      marginCv = Math.sqrt(variance) / Math.abs(marginMean)
    }
  }

  // ---- 信号2：负债趋势(近4期 debtRatio 变化；history 降序 → debts[0] 最新)----
  const debts = history.slice(0, 4).map(h => h.debtRatio).filter(d => Number.isFinite(d))
  let debtDelta = null   // 最新 - 最早(近4期)；正值=上升
  if (debts.length >= 3) debtDelta = debts[0] - debts[debts.length - 1]

  // ---- 信号3：现金流质量(最新一期 ocfToProfitRatio)----
  const ocfRatio = history[0]?.ocfToProfitRatio ?? null

  // 三信号全缺 → 占位
  if (marginCv == null && marginMean == null && debtDelta == null && ocfRatio == null) {
    return { score: 2, max: 3, desc: '数据不足', _placeholder: true, _metrics: null }
  }

  // ---- 综合评分：基准 2 + 各信号调整，clamp 0-3 ----
  let score = 2
  const flags = []
  if (marginMean != null && marginMean < 0) {
    score -= 1; flags.push('净利率均值为负(持续亏损)')
  } else if (marginCv != null) {
    if (marginCv > 0.6) { score -= 1; flags.push(`净利率波动大(cv=${marginCv.toFixed(2)})`) }
    else if (marginCv < 0.3) { score += 1; flags.push(`净利率稳健(cv=${marginCv.toFixed(2)})`) }
  }
  if (debtDelta != null) {
    if (debtDelta > 10) { score -= 1; flags.push(`负债率急升${debtDelta.toFixed(0)}pp`) }
    else if (debtDelta > 5) { score -= 1; flags.push(`负债率上升${debtDelta.toFixed(0)}pp`) }
    else if (debtDelta < -5) { score += 1; flags.push(`负债率下降${debtDelta.toFixed(0)}pp`) }
  }
  if (ocfRatio != null) {
    if (ocfRatio < 0) { score -= 1; flags.push('经营现金流为负(造假/断裂风险)') }
    else if (ocfRatio < 0.5) { score -= 1; flags.push(`现金流偏弱(${ocfRatio.toFixed(2)})`) }
    else if (ocfRatio >= 1.0) { score += 1; flags.push(`现金流健康(${ocfRatio.toFixed(2)})`) }
  }

  score = Math.max(0, Math.min(3, score))
  return {
    score, max: 3, desc: flags.length ? flags.join('，') : '财务稳健', _placeholder: false,
    _metrics: {
      marginCv: marginCv != null ? +marginCv.toFixed(2) : null,
      marginMean: marginMean != null ? +marginMean.toFixed(2) : null,
      debtDelta: debtDelta != null ? +debtDelta.toFixed(1) : null,
      ocfRatio: ocfRatio != null ? +ocfRatio.toFixed(2) : null,
    }
  }
}

// ==================== 股权质押 ====================

/**
 * 股权质押评分 (0-3, 分越高=质押率越低=越安全)
 *
 * A股结构性爆雷风险：控股股东高质押 → 熊市爆仓强平连锁。实测高质押率 TOP5 全是 ST 股，
 * 是天然的困境/爆雷信号（茅台0.06% / *ST三房78.74% 处在两个极端）。
 *
 * 数据：CSDC PLEDGE_RATIO（百分点 0-100，日频）。接口成功但无记录 → 无质押 → 0%（安全），
 *       与接口失败（pledgeRatio=null → 占位）区分。
 *
 * @param {number|null} pledgeRatio 质押比例（百分点 0-100）
 * @returns {{score:number, max:number, desc:string, _placeholder:boolean}}
 */
function calcPledgeScore(pledgeRatio) {
  if (pledgeRatio == null || !Number.isFinite(pledgeRatio)) {
    return { score: 2, max: 3, desc: '数据不足', _placeholder: true }
  }
  let score, desc
  const r = pledgeRatio.toFixed(2)
  if (pledgeRatio < 10) { score = 3; desc = `质押率${r}%(无风险)` }
  else if (pledgeRatio < 30) { score = 2; desc = `质押率${r}%(轻度)` }
  else if (pledgeRatio < 50) { score = 1; desc = `质押率${r}%(偏高,关注平仓线)` }
  else { score = 0; desc = `质押率${r}%(高危,ST集中区)` }
  return { score, max: 3, desc, _placeholder: false }
}

// ==================== 商誉风险 ====================

/**
 * 商誉风险评分 (0-3, 分越高=商誉占净资产比越低=越安全)
 *
 * 并购商誉在年报/减值测试时可能一次性大额计提减值，重创净资产、引发业绩变脸。
 * 数据：RPT_GOODWILL_STOCKDETAILS.SUMSHEQUITY_RATIO（商誉/归母净资产，小数 0.0139=1.39%）。
 *       无记录 → 无商誉 → 0%（安全）；接口失败 → 占位。
 *
 * @param {number|null} goodwillRatio 商誉/净资产（小数，0-1+）
 * @returns {{score:number, max:number, desc:string, _placeholder:boolean}}
 */
function calcGoodwillScore(goodwillRatio) {
  if (goodwillRatio == null || !Number.isFinite(goodwillRatio)) {
    return { score: 2, max: 3, desc: '数据不足', _placeholder: true }
  }
  const pct = (goodwillRatio * 100).toFixed(1)
  let score, desc
  if (goodwillRatio < 0.10) { score = 3; desc = `商誉占净资产${pct}%(无风险)` }
  else if (goodwillRatio < 0.30) { score = 2; desc = `商誉占净资产${pct}%(适中,年报减值压力)` }
  else if (goodwillRatio < 0.50) { score = 1; desc = `商誉占净资产${pct}%(偏高,减值可重创净资产)` }
  else { score = 0; desc = `商誉占净资产${pct}%(极高,并购爆雷型)` }
  return { score, max: 3, desc, _placeholder: false }
}

// ==================== 汇总：风险指标评分 ====================

/**
 * 计算风险指标并生成评分所需的子项
 * @param {number[]|Array<{close:number,amount:number,turnover:number}>} stockClosesOrKlines
 *   个股收盘价序列（旧调用）或完整日K线对象数组（新调用，启用流动性子项）。按时间正序，最旧在前。
 * @param {number[]|null} benchCloses - 基准指数收盘价序列（同上，可为 null）
 * @returns {{ items: Array<{name:string, score:number, max:number, desc:string}>, metrics: {sharpe:number|null, mdd:number|null, mddDays:number|null, benchMdd:number|null, excessMdd:number|null, beta:number|null, avgTurnover:number|null, turnoverCv:number|null, impactPerYi:number|null} }}
 */
export function calcRiskScoreItems(stockClosesOrKlines, benchCloses, style = 'mid', fundamental = null, pledgeRatio = null, goodwillRatio = null) {
  // 兼容旧调用：收盘价数组（旧，如 tmp_score 脚本）或完整K线对象数组（新，含 close/amount/turnover）
  const isObjArr = Array.isArray(stockClosesOrKlines) && stockClosesOrKlines.length > 0 && typeof stockClosesOrKlines[0] === 'object'
  const stockCloses = isObjArr ? stockClosesOrKlines.map(k => k.close) : stockClosesOrKlines
  const klines = isObjArr ? stockClosesOrKlines : null
  const stockReturns = calcDailyReturns(stockCloses)
  const items = []
  const metrics = { sharpe: null, mdd: null, mddDays: null, benchMdd: null, excessMdd: null, beta: null, avgTurnover: null, turnoverCv: null, impactPerYi: null, marginCv: null, marginMean: null, debtDelta: null, fhOcfRatio: null, pledgeRatio: null, goodwillRatio: null }

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
    items.push({ name: 'Sharpe', score: 2, max: 5, desc: '数据不足' })
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
    items.push({ name: '最大回撤', score: 2, max: 5, desc: '数据不足' })
  }

  // 3. Beta 系数 (0-4)
  if (benchCloses && benchCloses.length >= 20 && stockReturns.length >= 20) {
    const benchReturns = calcDailyReturns(benchCloses)
    const beta = calcBeta(stockReturns, benchReturns)
    metrics.beta = beta
    if (beta !== null) {
      let score, desc
      if (style === 'short') {
        if (beta >= 1.0 && beta <= 1.5) { score = 4; desc = `Beta=${beta.toFixed(2)}（进攻型适中）` }
        else if ((beta >= 0.5 && beta < 1.0) || (beta > 1.5 && beta <= 1.8)) { score = 2; desc = `Beta=${beta.toFixed(2)}（偏离）` }
        else if (beta >= 0.3) { score = 1; desc = `Beta=${beta.toFixed(2)}（偏低）` }
        else { score = 0; desc = `Beta=${beta.toFixed(2)}（极端）` }
      } else if (style === 'long') {
        if (beta >= 0.5 && beta < 0.8) { score = 4; desc = `Beta=${beta.toFixed(2)}（防御型适中）` }
        else if (beta >= 0.8 && beta < 1.0) { score = 3; desc = `Beta=${beta.toFixed(2)}（略偏高）` }
        else if ((beta >= 0.3 && beta < 0.5) || (beta >= 1.0 && beta < 1.3)) { score = 2; desc = `Beta=${beta.toFixed(2)}（偏离）` }
        else { score = 0; desc = `Beta=${beta.toFixed(2)}（极端）` }
      } else {
        if (beta >= 0.8 && beta <= 1.2) { score = 4; desc = `Beta=${beta.toFixed(2)}（适中）` }
        else if ((beta >= 0.5 && beta < 0.8) || (beta > 1.2 && beta <= 1.5)) { score = 2; desc = `Beta=${beta.toFixed(2)}（偏离）` }
        else { score = 0; desc = `Beta=${beta.toFixed(2)}（极端）` }
      }
      items.push({ name: 'Beta', score, max: 4, desc })
    } else {
      items.push({ name: 'Beta', score: 2, max: 4, desc: '数据不足' })
    }
  } else {
    items.push({ name: 'Beta', score: 2, max: 4, desc: '无基准数据' })
  }

  // 4. 流动性 (0-4) —— 需完整K线对象（含 amount/turnover）；旧调用传收盘价数组时走占位
  const liq = klines ? calcLiquidityScore(klines) : { score: 2, max: 4, desc: '数据不足', _metrics: null }
  if (liq._metrics) {
    metrics.avgTurnover = liq._metrics.avgTurnover
    metrics.turnoverCv = liq._metrics.turnoverCv
    metrics.impactPerYi = liq._metrics.impactPerYi
  }
  items.push({ name: '流动性', score: liq.score, max: liq.max, desc: liq.desc })

  // 5. 财务健康度 (0-3) —— 用财务历史(24季度)衡量基本面风险，与价格/交易面风险互补
  const fh = calcFinancialHealthScore(fundamental)
  if (fh._metrics) {
    metrics.marginCv = fh._metrics.marginCv
    metrics.marginMean = fh._metrics.marginMean
    metrics.debtDelta = fh._metrics.debtDelta
    metrics.fhOcfRatio = fh._metrics.ocfRatio
  }
  items.push({ name: '财务健康度', score: fh.score, max: fh.max, desc: fh.desc })

  // 6. 股权质押 (0-3) —— A股结构性爆雷风险，高质押率≈困境股（实测 TOP5 全 ST）
  const p = calcPledgeScore(pledgeRatio)
  metrics.pledgeRatio = Number.isFinite(pledgeRatio) ? +pledgeRatio.toFixed(2) : null
  items.push({ name: '股权质押', score: p.score, max: p.max, desc: p.desc })

  // 7. 商誉 (0-3) —— 并购商誉减值风险，年报/减值测试可能一次性计提
  const gw = calcGoodwillScore(goodwillRatio)
  metrics.goodwillRatio = Number.isFinite(goodwillRatio) ? +goodwillRatio.toFixed(4) : null
  items.push({ name: '商誉', score: gw.score, max: gw.max, desc: gw.desc })

  return { items, metrics }
}
