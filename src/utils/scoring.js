/**
 * 动态权重评分引擎 — 个股综合分析
 * v3: 修复默认分抬高分值、移除ROE双重年化、增加高置信度、细化建议文案
 */

// ==================== 行业 PE 分档 ====================
const PE_THRESHOLDS = {
  default: { low: 15, fair: 25, high: 40 },
  bank: { low: 8, fair: 12, high: 18 },
  insurance: { low: 10, fair: 18, high: 30 },
  realestate: { low: 8, fair: 15, high: 25 },
  steel: { low: 8, fair: 15, high: 25 },
  coal: { low: 8, fair: 12, high: 20 },
  food: { low: 15, fair: 30, high: 50 },
  medicine: { low: 20, fair: 35, high: 55 },
  tech: { low: 20, fair: 40, high: 60 },
  semiconductor: { low: 25, fair: 50, high: 80 },
  military: { low: 25, fair: 45, high: 70 },
  newenergy: { low: 15, fair: 30, high: 50 },
  appliance: { low: 12, fair: 22, high: 35 },
  auto: { low: 12, fair: 25, high: 40 },
  utility: { low: 10, fair: 18, high: 28 },
  chemical: { low: 12, fair: 22, high: 35 },
  construction: { low: 8, fair: 14, high: 22 },
  broker: { low: 15, fair: 25, high: 40 },
  mining: { low: 10, fair: 20, high: 35 },
  agriculture: { low: 12, fair: 25, high: 40 },
  // 新增行业
  environmental: { low: 15, fair: 28, high: 45 },   // 环保
  education: { low: 15, fair: 30, high: 50 },        // 教育
  tourism: { low: 15, fair: 30, high: 55 },           // 文旅
  media: { low: 18, fair: 35, high: 55 },             // 传媒娱乐
  logistics: { low: 10, fair: 20, high: 35 },         // 物流运输
  textile: { low: 10, fair: 18, high: 30 },           // 纺织服装
}

// ==================== 行业 PB 分档 ====================
const PB_THRESHOLDS = {
  default: { low: 1.5, fair: 3.0, high: 6.0 },
  bank: { low: 0.8, fair: 1.2, high: 2.0 },
  insurance: { low: 1.0, fair: 2.0, high: 3.5 },
  realestate: { low: 0.5, fair: 1.0, high: 2.0 },
  steel: { low: 0.6, fair: 1.2, high: 2.0 },
  coal: { low: 0.8, fair: 1.5, high: 2.5 },
  food: { low: 2.0, fair: 5.0, high: 10.0 },
  medicine: { low: 2.0, fair: 4.0, high: 7.0 },
  tech: { low: 2.0, fair: 4.0, high: 8.0 },
  semiconductor: { low: 3.0, fair: 6.0, high: 10.0 },
  military: { low: 2.0, fair: 4.0, high: 7.0 },
  newenergy: { low: 1.5, fair: 3.0, high: 6.0 },
  appliance: { low: 1.5, fair: 3.0, high: 5.0 },
  auto: { low: 1.0, fair: 2.5, high: 4.0 },
  utility: { low: 1.0, fair: 2.0, high: 3.0 },
  chemical: { low: 1.0, fair: 2.5, high: 4.5 },
  construction: { low: 0.6, fair: 1.2, high: 2.0 },
  broker: { low: 1.0, fair: 1.8, high: 3.0 },
  mining: { low: 1.0, fair: 2.5, high: 4.5 },
  agriculture: { low: 1.0, fair: 2.5, high: 4.5 },
  // 新增行业
  environmental: { low: 1.0, fair: 2.0, high: 4.0 },
  education: { low: 1.5, fair: 3.5, high: 7.0 },
  tourism: { low: 1.5, fair: 3.5, high: 7.0 },
  media: { low: 1.5, fair: 3.5, high: 7.0 },
  logistics: { low: 1.0, fair: 2.0, high: 3.5 },
  textile: { low: 0.8, fair: 1.8, high: 3.5 },
}

// ==================== 行业负债率分档 ====================
const DEBT_THRESHOLDS = {
  default: { safe: 40, moderate: 60, high: 75 },
  bank: { safe: 88, moderate: 93, high: 96 },
  insurance: { safe: 80, moderate: 90, high: 95 },
  realestate: { safe: 60, moderate: 75, high: 85 },
  broker: { safe: 70, moderate: 80, high: 90 },
  utility: { safe: 55, moderate: 70, high: 80 },
  construction: { safe: 55, moderate: 70, high: 80 },
  // 新增行业
  medicine: { safe: 30, moderate: 45, high: 60 },
  tech: { safe: 25, moderate: 40, high: 55 },
  semiconductor: { safe: 25, moderate: 40, high: 55 },
  newenergy: { safe: 40, moderate: 55, high: 70 },
  chemical: { safe: 40, moderate: 55, high: 70 },
  auto: { safe: 40, moderate: 55, high: 70 },
  logistics: { safe: 35, moderate: 50, high: 65 },
  tourism: { safe: 35, moderate: 50, high: 65 },
  // 重资产行业补充
  steel: { safe: 45, moderate: 60, high: 75 },
  coal: { safe: 40, moderate: 55, high: 70 },
  mining: { safe: 40, moderate: 55, high: 70 },
  appliance: { safe: 40, moderate: 55, high: 65 },
  food: { safe: 30, moderate: 45, high: 60 },
  agriculture: { safe: 40, moderate: 55, high: 70 },
  environmental: { safe: 45, moderate: 60, high: 75 },
  education: { safe: 30, moderate: 45, high: 60 },
  media: { safe: 25, moderate: 40, high: 55 },
  textile: { safe: 35, moderate: 50, high: 65 },
}

// ==================== 行业毛利率分档 ====================
// 阈值: [优秀, 良好, 一般, 偏低]，低于最低值为"很低"
const GROSS_MARGIN_THRESHOLDS = {
  default: [40, 25, 15, 5],     // 通用基准
  // 高毛利行业：软件/半导体
  tech: [60, 45, 30, 15],
  semiconductor: [60, 45, 30, 15],
  // 中高毛利行业：医药/食品
  medicine: [50, 35, 20, 10],
  food: [50, 35, 20, 10],
  // 中等毛利行业
  newenergy: [35, 22, 12, 5],
  military: [35, 22, 12, 5],
  appliance: [35, 22, 12, 5],
  auto: [30, 20, 10, 5],
  mining: [30, 20, 10, 5],
  // 中低毛利行业：制造/化工
  chemical: [30, 20, 10, 5],
  construction: [25, 15, 8, 3],
  steel: [20, 12, 6, 2],
  coal: [30, 18, 10, 4],
  // 低毛利行业：零售/贸易/金融
  realestate: [30, 18, 10, 4],
  broker: [40, 25, 15, 5],
  bank: [3.0, 2.2, 1.5, 1.0],       // 银行使用净息差(NIM)而非传统毛利率
  insurance: [30, 18, 10, 4],
  utility: [35, 22, 12, 5],
  agriculture: [30, 18, 10, 4],
  // 新增行业
  environmental: [35, 22, 12, 5],
  education: [55, 40, 25, 12],
  tourism: [45, 30, 18, 8],
  media: [45, 30, 18, 8],
  logistics: [25, 15, 8, 3],
  textile: [25, 15, 8, 3],
}

/**
 * 计算个股综合评分
 * @param {Array} techSignals - 技术信号数组（来自 indicators.js）
 * @param {Object|null} fundamental - 基本面数据 { latest, history }
 * @param {Object|null} capitalFlow - 资金面数据 { priceVolumeSignal, volumeTrend, available }
 * @param {string} industry - 行业名称（可选，用于 PE 分档）
 * @returns {Object} { total, dimensions, suggestion, confidence, details }
 */
const STYLE_WEIGHTS = {
  short: { technical: 0.35, fundamental: 0.15, capital: 0.42, risk: 0.08 },
  mid:   { technical: 0.30, fundamental: 0.26, capital: 0.32, risk: 0.12 },
  long:  { technical: 0.22, fundamental: 0.40, capital: 0.20, risk: 0.18 },
}

export function calculateScore(techSignals = [], fundamental = null, capitalFlow = null, industry = '', style = 'short', riskItems = null) {
  const dimensions = {
    technical: { score: 0, max: 0, items: [] },  // max 由子项求和动态决定
    fundamental: { score: 0, max: 42, items: [] },
    capital: { score: 0, max: 29, items: [] },
    risk: { score: 0, max: 15, items: [] }
  }

  // ========== 技术面评分 (0-40) ==========
  const tech = dimensions.technical

  // 1. 均线排列 + 交叉 (0-10)
  const maBullish = techSignals.find(s => s.source === 'MA' && s.type === 'bullish')
  const maBearish = techSignals.find(s => s.source === 'MA' && s.type === 'bearish')
  const maCrosses = techSignals.filter(s => s.source === 'MA' && (s.text.includes('金叉') || s.text.includes('死叉')))
  if (maBullish?.text?.includes('多头排列')) {
    tech.items.push({ name: '均线排列', score: 10, max: 10, desc: '多头排列' })
  } else if (maBearish?.text?.includes('空头排列')) {
    tech.items.push({ name: '均线排列', score: 0, max: 10, desc: '空头排列' })
  } else if (maCrosses.length > 0) {
    // 多级别交叉按优先级评分：MA20/60 > MA10/20 > MA5/10
    let crossScore = 5, crossDesc = '中性'
    if (maCrosses.some(s => s.text.includes('MA20/60金叉'))) {
      crossScore = 8; crossDesc = 'MA20/60金叉'
    } else if (maCrosses.some(s => s.text.includes('MA20/60死叉'))) {
      crossScore = 2; crossDesc = 'MA20/60死叉'
    } else if (maCrosses.some(s => s.text.includes('MA10/20金叉'))) {
      crossScore = 7; crossDesc = 'MA10/20金叉'
    } else if (maCrosses.some(s => s.text.includes('MA10/20死叉'))) {
      crossScore = 3; crossDesc = 'MA10/20死叉'
    } else if (maCrosses.some(s => s.text.includes('MA5/10金叉'))) {
      crossScore = 6; crossDesc = maCrosses.find(s => s.text.includes('MA5/10金叉')).text
    } else if (maCrosses.some(s => s.text.includes('MA5/10死叉'))) {
      crossScore = 4; crossDesc = maCrosses.find(s => s.text.includes('MA5/10死叉')).text
    }
    tech.items.push({ name: '均线排列', score: crossScore, max: 10, desc: crossDesc })
  } else {
    tech.items.push({ name: '均线排列', score: 5, max: 10, desc: '中性' })
  }

  // 2. MACD 信号 (0-8) — 累加同源信号
  const macdBullish = techSignals.filter(s => s.source === 'MACD' && s.type === 'bullish')
  const macdBearish = techSignals.filter(s => s.source === 'MACD' && s.type === 'bearish')
  let macdScore = 4
  const macdDescs = []
  for (const s of macdBullish) {
    if (s.text.includes('金叉')) { macdScore += 2; macdDescs.push(s.text) }
    else if (s.text.includes('底背离')) { macdScore += 2; macdDescs.push(s.text) }
    else if (s.text.includes('DIF持续上行') || s.text.includes('多头动能增强')) { macdScore += 1; macdDescs.push(s.text) }
  }
  for (const s of macdBearish) {
    if (s.text.includes('死叉')) { macdScore -= 2; macdDescs.push(s.text) }
    else if (s.text.includes('顶背离')) { macdScore -= 2; macdDescs.push(s.text) }
    else if (s.text.includes('DIF持续下行') || s.text.includes('空头动能增强')) { macdScore -= 1; macdDescs.push(s.text) }
  }
  macdScore = Math.max(0, Math.min(8, macdScore))
  tech.items.push({ name: 'MACD', score: macdScore, max: 8, desc: macdDescs.length ? macdDescs.join('，') : '无明显信号' })

  // 3. KDJ 信号 (0-7) — 位置感知 + 背离加权
  const kdjSignals = techSignals.filter(s => s.source === 'KDJ')
  let kdjScore = 3
  const kdjDescs = []
  for (const s of kdjSignals) {
    if (s.text.includes('底背离')) { kdjScore += 3; kdjDescs.push(s.text) }
    else if (s.text.includes('高位死叉')) { kdjScore -= 3; kdjDescs.push(s.text) }
    else if (s.text.includes('低位金叉')) { kdjScore += 3; kdjDescs.push(s.text) }
    else if (s.type === 'bullish') { kdjScore += 2; kdjDescs.push(s.text) }
    else if (s.text.includes('顶背离')) { kdjScore -= 3; kdjDescs.push(s.text) }
    else if (s.type === 'bearish') { kdjScore -= 2; kdjDescs.push(s.text) }
  }
  kdjScore = Math.max(0, Math.min(5, kdjScore))
  tech.items.push({ name: 'KDJ', score: kdjScore, max: 5, desc: kdjDescs.length ? kdjDescs.join('，') : '正常区间' })

  // 4. RSI 信号 (0-7) — 共振优先，避免与单周期信号重复计分
  const rsiSignals = techSignals.filter(s => s.source === 'RSI')
  let rsiScore = 3
  const rsiDescs = []
  let hasResonanceBull = false
  let hasResonanceBear = false
  // 第一轮：检测多周期共振信号（已隐含单周期超买/超卖，后续跳过避免重复）
  for (const s of rsiSignals) {
    if (s.text.includes('共振超卖')) { rsiScore += 3; rsiDescs.push(s.text); hasResonanceBull = true }
    else if (s.text.includes('共振超买')) { rsiScore -= 3; rsiDescs.push(s.text); hasResonanceBear = true }
  }
  // 第二轮：计分非共振的单周期信号，但跳过已被共振覆盖的方向
  for (const s of rsiSignals) {
    if (s.text.includes('共振')) continue
    if (s.type === 'neutral') { rsiDescs.push(s.text); continue }
    if (hasResonanceBull && (s.text.includes('超卖'))) continue
    if (hasResonanceBear && (s.text.includes('超买'))) continue
    if (s.text.includes('严重超卖') || s.text.includes('底背离')) { rsiScore += 3; rsiDescs.push(s.text) }
    else if (s.text.includes('超卖') || s.text.includes('金叉')) { rsiScore += 2; rsiDescs.push(s.text) }
    else if (s.text.includes('严重超买') || s.text.includes('顶背离')) { rsiScore -= 3; rsiDescs.push(s.text) }
    else if (s.text.includes('超买') || s.text.includes('死叉')) { rsiScore -= 2; rsiDescs.push(s.text) }
  }
  rsiScore = Math.max(0, Math.min(5, rsiScore))
  tech.items.push({ name: 'RSI', score: rsiScore, max: 5, desc: rsiDescs.length ? rsiDescs.join('，') : '正常区间' })

  // 5. BOLL 信号 (0-4) — 结合趋势方向
  const bollSignals = techSignals.filter(s => s.source === 'BOLL')
  const bollPosition = bollSignals.find(s => !s.text.includes('收口'))
  const bollSqueeze = bollSignals.find(s => s.text.includes('收口'))
  let bollScore = 2
  let bollDesc = '中轨附近'
  if (bollPosition) {
    const t = bollPosition.text
    if (t.includes('突破') && t.includes('上轨') && bollPosition.type === 'bullish') {
      bollScore = 4; bollDesc = '突破上轨，趋势加速'
    } else if (t.includes('突破') && t.includes('上轨')) {
      bollScore = 2; bollDesc = '突破上轨，持续性待确认'
    } else if (t.includes('跌破') && bollPosition.type === 'bearish') {
      bollScore = 0; bollDesc = '跌破下轨，趋势加速下行'
    } else if (t.includes('跌破')) {
      bollScore = 1; bollDesc = '跌破下轨，或为假跌破'
    } else if (t.includes('沿') && t.includes('上轨')) {
      bollScore = 4; bollDesc = '沿上轨运行，趋势偏强'
    } else if (t.includes('触及') && t.includes('上轨')) {
      bollScore = 1; bollDesc = '触及上轨，超买预警'
    } else if (t.includes('沿') && t.includes('下轨')) {
      bollScore = 1; bollDesc = '沿下轨运行，趋势偏弱'
    } else if (t.includes('触及') && t.includes('下轨')) {
      bollScore = 2; bollDesc = '触及下轨，超卖区'
    } else if (t.includes('中轨上方')) {
      bollScore = 3; bollDesc = '中轨上方（偏强）'
    } else if (t.includes('中轨下方')) {
      bollScore = 2; bollDesc = '中轨下方（偏弱）'
    }
  }
  if (bollSqueeze) {
    bollDesc += '，收口预警'
  }
  tech.items.push({ name: 'BOLL', score: bollScore, max: 4, desc: bollDesc })

  // 6. 均线斜率 (0-4) — MA20 趋势强度，衡量中期方向性
  const slopeSignals = techSignals.filter(s => s.source === '均线斜率')
  const slopeSignal = slopeSignals[0]
  let slopeScore = 2
  let slopeDesc = '中性'
  if (slopeSignal) {
    if (slopeSignal.text.includes('强趋势向上')) { slopeScore = 4; slopeDesc = slopeSignal.text }
    else if (slopeSignal.text.includes('趋势向上')) { slopeScore = 3; slopeDesc = slopeSignal.text }
    else if (slopeSignal.text.includes('横盘')) { slopeScore = 2; slopeDesc = slopeSignal.text }
    else if (slopeSignal.text.includes('强趋势向下')) { slopeScore = 0; slopeDesc = slopeSignal.text }
    else if (slopeSignal.text.includes('趋势向下')) { slopeScore = 1; slopeDesc = slopeSignal.text }
  }
  tech.items.push({ name: '均线斜率', score: slopeScore, max: 4, desc: slopeDesc })

  // 7. 量能信号 (0-4) — 纯成交量强度，不结合价格方向，避免与资金面量价趋势重复计分
  const volStrSignals = techSignals.filter(s => s.source === '量能')
  const volStrSignal = volStrSignals[0]
  let volStrScore = 2
  let volStrDesc = '中性'
  if (volStrSignal) {
    const t = volStrSignal.text
    if (t.includes('极度放量') || t.includes('连续放量')) {
      volStrScore = 4; volStrDesc = t
    } else if (t.includes('成交量偏大')) {
      volStrScore = 3; volStrDesc = t
    } else if (t.includes('量能平稳')) {
      volStrScore = 2; volStrDesc = t
    } else if (t.includes('地量') || t.includes('连续缩量')) {
      volStrScore = 0; volStrDesc = t
    } else if (volStrSignal.type === 'bullish') {
      volStrScore = 3; volStrDesc = t
    } else if (volStrSignal.type === 'bearish') {
      volStrScore = 1; volStrDesc = t
    } else {
      volStrScore = 2; volStrDesc = t
    }
  }
  tech.items.push({ name: '量能', score: volStrScore, max: 4, desc: volStrDesc })

  // 8. 价格位置 (0-3) — 年度高低位百分位，补足 RSI 覆盖不到的中期超买识别
  const pricePosSignals = techSignals.filter(s => s.source === '价格位置')
  const pricePosSignal = pricePosSignals[0]
  let pricePosScore = 2
  let pricePosDesc = '中性'
  if (pricePosSignal) {
    const t = pricePosSignal.text
    if (t.includes('接近年度低位') || t.includes('价格位置偏低')) {
      pricePosScore = 3; pricePosDesc = t
    } else if (t.includes('价格位置中性偏上')) {
      pricePosScore = 2; pricePosDesc = t
    } else if (t.includes('价格位置偏高')) {
      pricePosScore = 1; pricePosDesc = t
    } else if (t.includes('接近年度高位')) {
      pricePosScore = 0; pricePosDesc = t
    }
  }
  tech.items.push({ name: '价格位置', score: pricePosScore, max: 3, desc: pricePosDesc })

  tech.score = tech.items.reduce((s, i) => s + i.score, 0)
  tech.max = tech.items.reduce((s, i) => s + i.max, 0)

  // P1: 多指标共振系数 — 多维度同向时加强信号权重（按指标来源去重，避免单指标多信号虚增）
  const bullSources = new Set(techSignals.filter(s => s.type === 'bullish').map(s => s.source))
  const bearSources = new Set(techSignals.filter(s => s.type === 'bearish').map(s => s.source))
  const bullCount = bullSources.size
  const bearCount = bearSources.size
  if (bullCount >= 5) {
    tech.score = Math.round(tech.score * 1.15)
    tech.resonance = '强多头共振'
  } else if (bullCount >= 4) {
    tech.score = Math.round(tech.score * 1.07)
    tech.resonance = '多头共振'
  } else if (bearCount >= 5) {
    tech.score = Math.round(tech.score * 0.85)
    tech.resonance = '强空头共振'
  } else if (bearCount >= 4) {
    tech.score = Math.round(tech.score * 0.93)
    tech.resonance = '空头共振'
  }
  // 共振后重新钳位
  tech.score = Math.max(0, Math.min(tech.max, tech.score))

  // ========== 基本面评分 (0-42) ==========
  const fund = dimensions.fundamental
  const latest = fundamental?.latest

  // 暂无数据默认分（从严：缺失=信息不足=风险，保证: 坏数据 < 无数据 < 中性 < 好数据）
  const FUND_MISSING = {
    PE: { score: 0, max: 8 },
    ROE: { score: 1, max: 8 },
    revenue: { score: 1, max: 5 },
    profit: { score: 1, max: 5 },
    debt: { score: 1, max: 4 },
    PB: { score: 1, max: 4 },
    cashflow: { score: 1, max: 4 },
    grossMargin: { score: 1, max: 4 },
  }

  if (latest) {
    // 东方财富 ROEJQ 字段本身就是报告期加权 ROE，无需再年化
    const roe = latest.roe

    // 1. PE 估值 (0-8)
    if (latest.pe != null) {
      const t = getPEThresholds(industry)
      const pe = latest.pe
      const midPE = Math.round((t.fair * 2 + t.high) / 3)
      if (pe < 0) {
        fund.items.push({ name: 'PE估值', score: 0, max: 8, desc: `PE ${pe.toFixed(1)}，亏损` })
      } else if (pe <= t.low) {
        fund.items.push({ name: 'PE估值', score: 8, max: 8, desc: `PE ${pe.toFixed(1)}，低估` })
      } else if (pe <= t.fair) {
        fund.items.push({ name: 'PE估值', score: 6, max: 8, desc: `PE ${pe.toFixed(1)}，合理` })
      } else if (pe <= midPE) {
        fund.items.push({ name: 'PE估值', score: 4, max: 8, desc: `PE ${pe.toFixed(1)}，略高` })
      } else if (pe <= t.high) {
        fund.items.push({ name: 'PE估值', score: 2, max: 8, desc: `PE ${pe.toFixed(1)}，偏高` })
      } else {
        fund.items.push({ name: 'PE估值', score: 1, max: 8, desc: `PE ${pe.toFixed(1)}，高估` })
      }
    } else {
      fund.items.push({ name: 'PE估值', ...FUND_MISSING.PE, desc: '暂无数据' })
    }

    // 2. ROE (0-8) — 直接使用后端返回值，不做年化
    if (roe != null) {
      if (roe < 0) {
        fund.items.push({ name: 'ROE', score: 0, max: 8, desc: `ROE ${roe.toFixed(1)}%，亏损` })
      } else if (roe >= 20) {
        fund.items.push({ name: 'ROE', score: 8, max: 8, desc: `ROE ${roe.toFixed(1)}%，优秀` })
      } else if (roe >= 12) {
        fund.items.push({ name: 'ROE', score: 6, max: 8, desc: `ROE ${roe.toFixed(1)}%，良好` })
      } else if (roe >= 6) {
        fund.items.push({ name: 'ROE', score: 4, max: 8, desc: `ROE ${roe.toFixed(1)}%，一般` })
      } else {
        fund.items.push({ name: 'ROE', score: 1, max: 8, desc: `ROE ${roe.toFixed(1)}%，偏弱` })
      }
    } else {
      fund.items.push({ name: 'ROE', ...FUND_MISSING.ROE, desc: '暂无数据' })
    }

    // 3. 营收增长 (0-5) — 用 >= 保持边界一致
    if (latest.revenueGrowth != null) {
      if (latest.revenueGrowth >= 20) {
        fund.items.push({ name: '营收增长', score: 5, max: 5, desc: `营收增长 ${latest.revenueGrowth.toFixed(1)}%，高增` })
      } else if (latest.revenueGrowth >= 10) {
        fund.items.push({ name: '营收增长', score: 4, max: 5, desc: `营收增长 ${latest.revenueGrowth.toFixed(1)}%，稳健` })
      } else if (latest.revenueGrowth >= 5) {
        fund.items.push({ name: '营收增长', score: 3, max: 5, desc: `营收增长 ${latest.revenueGrowth.toFixed(1)}%，中等` })
      } else if (latest.revenueGrowth >= 0) {
        fund.items.push({ name: '营收增长', score: 2, max: 5, desc: `营收增长 ${latest.revenueGrowth.toFixed(1)}%，低速` })
      } else {
        fund.items.push({ name: '营收增长', score: 0, max: 5, desc: `营收增长 ${latest.revenueGrowth.toFixed(1)}%，下滑` })
      }
    } else {
      fund.items.push({ name: '营收增长', ...FUND_MISSING.revenue, desc: '暂无数据' })
    }

    // 4. 利润增长 (0-5) — 亏损企业增速封顶，避免"减亏"被高估
    if (latest.profitGrowth != null) {
      const isLoss = latest.pe != null && latest.pe < 0
      if (isLoss) {
        fund.items.push({ name: '净利增长', score: 3, max: 5, desc: `净利增长 ${latest.profitGrowth.toFixed(1)}%，仍亏损` })
      } else if (latest.profitGrowth >= 20) {
        fund.items.push({ name: '净利增长', score: 5, max: 5, desc: `净利增长 ${latest.profitGrowth.toFixed(1)}%，高增` })
      } else if (latest.profitGrowth >= 10) {
        fund.items.push({ name: '净利增长', score: 4, max: 5, desc: `净利增长 ${latest.profitGrowth.toFixed(1)}%，稳健` })
      } else if (latest.profitGrowth >= 5) {
        fund.items.push({ name: '净利增长', score: 3, max: 5, desc: `净利增长 ${latest.profitGrowth.toFixed(1)}%，中等` })
      } else if (latest.profitGrowth >= 0) {
        fund.items.push({ name: '净利增长', score: 2, max: 5, desc: `净利增长 ${latest.profitGrowth.toFixed(1)}%，低速` })
      } else {
        fund.items.push({ name: '净利增长', score: 0, max: 5, desc: `净利增长 ${latest.profitGrowth.toFixed(1)}%，下滑` })
      }
    } else {
      fund.items.push({ name: '净利增长', ...FUND_MISSING.profit, desc: '暂无数据' })
    }

    // 5. 负债率（行业感知）(0-4)
    if (latest.debtRatio != null) {
      const dt = getDebtThresholds(industry || latest.industry || '')
      const dr = latest.debtRatio
      if (dr <= dt.safe) {
        fund.items.push({ name: '负债率', score: 4, max: 4, desc: `负债率 ${dr.toFixed(1)}%，安全` })
      } else if (dr <= dt.moderate) {
        fund.items.push({ name: '负债率', score: 3, max: 4, desc: `负债率 ${dr.toFixed(1)}%，适中` })
      } else if (dr <= dt.high) {
        fund.items.push({ name: '负债率', score: 1, max: 4, desc: `负债率 ${dr.toFixed(1)}%，偏高` })
      } else {
        fund.items.push({ name: '负债率', score: 0, max: 4, desc: `负债率 ${dr.toFixed(1)}%，高风险` })
      }
    } else {
      fund.items.push({ name: '负债率', ...FUND_MISSING.debt, desc: '暂无数据' })
    }

    // 6. PB 估值 (0-4) — 行业感知
    if (latest.pb != null) {
      const t = getPBThresholds(industry || latest.industry || '')
      const pb = latest.pb
      const midPB = +((t.fair * 2 + t.high) / 3).toFixed(2)
      if (pb <= 0) {
        fund.items.push({ name: 'PB估值', score: 0, max: 4, desc: `PB ${pb.toFixed(1)}，破净异常` })
      } else if (pb <= t.low) {
        fund.items.push({ name: 'PB估值', score: 4, max: 4, desc: `PB ${pb.toFixed(1)}，低估` })
      } else if (pb <= t.fair) {
        fund.items.push({ name: 'PB估值', score: 3, max: 4, desc: `PB ${pb.toFixed(1)}，合理` })
      } else if (pb <= midPB) {
        fund.items.push({ name: 'PB估值', score: 2, max: 4, desc: `PB ${pb.toFixed(1)}，略高` })
      } else if (pb <= t.high) {
        fund.items.push({ name: 'PB估值', score: 1, max: 4, desc: `PB ${pb.toFixed(1)}，偏高` })
      } else {
        fund.items.push({ name: 'PB估值', score: 0, max: 4, desc: `PB ${pb.toFixed(1)}，高估` })
      }
    } else {
      fund.items.push({ name: 'PB估值', ...FUND_MISSING.PB, desc: '暂无数据' })
    }

    // 7. 现金流质量 (0-4) — 每股经营现金流/每股收益
    if (latest.ocfToProfitRatio != null) {
      const ratio = latest.ocfToProfitRatio
      const r = ratio.toFixed(2)
      if (ratio >= 1.2) {
        fund.items.push({ name: '现金流质量', score: 4, max: 4, desc: `${r}，利润含金量高` })
      } else if (ratio >= 0.8) {
        fund.items.push({ name: '现金流质量', score: 3, max: 4, desc: `${r}，现金与利润匹配良好` })
      } else if (ratio >= 0.5) {
        fund.items.push({ name: '现金流质量', score: 2, max: 4, desc: `${r}，现金略少于账面利润` })
      } else if (ratio > 0) {
        fund.items.push({ name: '现金流质量', score: 1, max: 4, desc: `${r}，利润含金量偏低` })
      } else if (ratio > -1) {
        fund.items.push({ name: '现金流质量', score: 1, max: 4, desc: `${r}，经营现金流出，利润质量差` })
      } else {
        fund.items.push({ name: '现金流质量', score: 0, max: 4, desc: `${r}，经营现金大幅流出，需警惕` })
      }
    } else {
      fund.items.push({ name: '现金流质量', ...FUND_MISSING.cashflow, desc: '暂无数据' })
    }

    // 8. 毛利率 (0-4) — 行业感知阈值
    if (latest.grossMargin != null) {
      const gm = latest.grossMargin
      const [excellent, good, fair, low] = getGrossMarginThresholds(industry || latest.industry || '')
      if (gm >= excellent) {
        fund.items.push({ name: '毛利率', score: 4, max: 4, desc: `毛利率 ${gm.toFixed(1)}%，优秀` })
      } else if (gm >= good) {
        fund.items.push({ name: '毛利率', score: 3, max: 4, desc: `毛利率 ${gm.toFixed(1)}%，良好` })
      } else if (gm >= fair) {
        fund.items.push({ name: '毛利率', score: 2, max: 4, desc: `毛利率 ${gm.toFixed(1)}%，一般` })
      } else if (gm >= low) {
        fund.items.push({ name: '毛利率', score: 1, max: 4, desc: `毛利率 ${gm.toFixed(1)}%，偏低` })
      } else {
        fund.items.push({ name: '毛利率', score: 0, max: 4, desc: `毛利率 ${gm.toFixed(1)}%，很低` })
      }
    } else {
      fund.items.push({ name: '毛利率', ...FUND_MISSING.grossMargin, desc: '暂无数据' })
    }
  } else {
    // 整体无数据，使用保守默认分
    fund.items.push(
      { name: 'PE估值', ...FUND_MISSING.PE, desc: '暂无数据' },
      { name: 'ROE', ...FUND_MISSING.ROE, desc: '暂无数据' },
      { name: '营收增长', ...FUND_MISSING.revenue, desc: '暂无数据' },
      { name: '净利增长', ...FUND_MISSING.profit, desc: '暂无数据' },
      { name: '负债率', ...FUND_MISSING.debt, desc: '暂无数据' },
      { name: 'PB估值', ...FUND_MISSING.PB, desc: '暂无数据' },
      { name: '现金流质量', ...FUND_MISSING.cashflow, desc: '暂无数据' },
      { name: '毛利率', ...FUND_MISSING.grossMargin, desc: '暂无数据' },
    )
  }

  fund.score = fund.items.reduce((s, i) => s + i.score, 0)

  // ========== 资金面评分 ==========
  const cap = dimensions.capital
  const priceVolumeSignal = capitalFlow?.priceVolumeSignal

  // ---------- 季度数据感知工具 ----------
  /**
   * 根据投资风格和数据频率计算子项有效最大分
   * 季度数据在短线下大幅降权，长线下基本保持
   */
  function getEffectiveMax(baseMax, frequency) {
    if (!frequency || frequency === 'daily') return baseMax
    // frequency === 'quarterly': 按风格降低满分
    const styleScale = { short: 0.4, mid: 0.6, long: 0.85 }
    const scale = styleScale[style] ?? 0.6
    return Math.max(1, Math.round(baseMax * scale))
  }

  /**
   * 季度数据衰减：将原始分数向中性（满分的一半）回归
   * 衰减偏离量而非直接打折，避免极端信号被完全抹平
   */
  function applyStalenessDecay(rawScore, effectiveMax, frequency) {
    if (!frequency || frequency === 'daily') return rawScore
    const neutral = effectiveMax / 2
    const decayFactor = { short: 0.3, mid: 0.5, long: 0.8 }
    const factor = decayFactor[style] ?? 0.5
    return Math.round(neutral + (rawScore - neutral) * factor)
  }

  // 量价趋势评分 (0-5) — K线派生数据，权重低于真实资金流
  let volScore = 3
  let volDesc = priceVolumeSignal || '中性'
  if (priceVolumeSignal === '放量上涨') { volScore = 5; volDesc = '放量上涨' }
  else if (priceVolumeSignal === '温和上涨') { volScore = 4; volDesc = '温和上涨' }
  else if (priceVolumeSignal === '缩量回调（洗盘）') { volScore = 4; volDesc = priceVolumeSignal }
  else if (priceVolumeSignal === '缩量整理（蓄势）') { volScore = 4; volDesc = priceVolumeSignal }
  else if (priceVolumeSignal === '量价平稳') { volScore = 3; volDesc = priceVolumeSignal }
  else if (priceVolumeSignal === '缩量调整（弱势）') { volScore = 2; volDesc = priceVolumeSignal }
  else if (priceVolumeSignal === '温和下跌') { volScore = 2; volDesc = '温和下跌' }
  else if (priceVolumeSignal === '缩量下跌（弱势）') { volScore = 1; volDesc = priceVolumeSignal }
  else if (priceVolumeSignal === '放量下跌') { volScore = 0; volDesc = '放量下跌' }

  cap.items.push({ name: '量价趋势', score: volScore, max: 5, desc: volDesc })

  // 主力资金评分 (0-8) — 真实交易所资金流向数据，资金面最高权重
  const mfLatest = capitalFlow?._mainForceLatest
  const mfSummary = capitalFlow?._mainForceSummary
  if (mfLatest?.mainNetInflow != null) {
    let mfScore = 3
    let mfDesc = '主力进出持平'
    // 综合今日主力净占比 + 近5日趋势判断
    const todayPct = mfLatest.mainNetPct ?? 0
    const avg5Pct = mfSummary?.mainNetAvgPct5 ?? 0
    let combinedPct = todayPct * 0.5 + avg5Pct * 0.5
    if (isNaN(combinedPct)) combinedPct = 0
    // 格化流入/流出金额
    const netInflow = mfLatest.mainNetInflow
    const fmtAmt = (v) => {
      const abs = Math.abs(v)
      const sign = v < 0 ? '-' : '+'
      if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`
      if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)}万`
      return `${sign}${abs.toFixed(0)}元`
    }
    const amtStr = netInflow > 0 ? `净流入${fmtAmt(netInflow)}` : netInflow < 0 ? `净流出${fmtAmt(netInflow)}` : ''

    if (combinedPct > 5) { mfScore = 8; mfDesc = '主力持续大幅流入' }
    else if (combinedPct > 2) { mfScore = 7; mfDesc = '主力流入' }
    else if (combinedPct > 0.3) { mfScore = 6; mfDesc = '主力温和流入' }
    else if (combinedPct > 0) { mfScore = 5; mfDesc = '主力微幅流入' }
    else if (combinedPct >= -0.3) { mfScore = 4; mfDesc = '主力进出持平' }
    else if (combinedPct >= -2) { mfScore = 3; mfDesc = '主力微幅流出' }
    else if (combinedPct >= -5) { mfScore = 1; mfDesc = '主力流出' }
    else { mfScore = 0; mfDesc = '主力大幅流出' }
    if (amtStr) mfDesc += `（${amtStr}）`

    // 主力资金趋势加成（含今日日内数据）
    const mfData = capitalFlow?._mainForceData
    if (mfData && mfData.length >= 10) {
      const recent5Avg = mfData.slice(-5).reduce((s, d) => s + (d.mainNetInflow || 0), 0) / 5
      const prev5Avg = mfData.slice(-10, -5).reduce((s, d) => s + (d.mainNetInflow || 0), 0) / 5
      if (recent5Avg > prev5Avg) {
        mfScore = Math.min(8, mfScore + 1)
        if (recent5Avg >= 0) mfDesc += '，趋势上升'
        else if (netInflow > 0) mfDesc += '，趋势改善'
        else mfDesc += '，流出减缓'
      } else if (recent5Avg < prev5Avg) {
        if (netInflow > 0 && prev5Avg > 0 && netInflow > prev5Avg) {
          // 今日流入超过前5日均值，趋势在回升，不减分
          mfDesc += '，趋势回升'
        } else {
          mfScore = Math.max(0, mfScore - 1)
          if (netInflow > 0) mfDesc += '，流入减缓'
          else if (netInflow < 0 && recent5Avg <= 0) mfDesc += '，趋势恶化'
          else if (netInflow < 0) mfDesc += '，趋势转弱'
          else mfDesc += '，流入减缓'
        }
      }
    }

    // 市值归一化：小盘股主力资金信号易受操控，按市值打折
    const marketCap = fundamental?.latest?.totalMarketCap  // 单位：亿元
    let capScale = 0.7  // 无市值数据时的默认折扣
    if (marketCap != null && marketCap > 0) {
      capScale = Math.min(1, Math.log10(Math.max(1, marketCap) / 50) / 1.5)
      capScale = Math.max(0.3, capScale)
    }
    mfScore = Math.round(mfScore * (0.6 + 0.4 * capScale))
    mfScore = Math.max(0, Math.min(8, mfScore))

    cap.items.push({ name: '主力资金', score: mfScore, max: 8, desc: mfDesc })
  } else {
    cap.items.push({ name: '主力资金', score: 4, max: 8, desc: '暂无数据' })
  }

  // 融资融券评分（多维度：余额趋势60% + 净买入40%）(0-5)
  const marginLatest = capitalFlow?._marginLatest
  if (marginLatest?.balanceGrowth != null) {
    let marginDesc = '融资余额持平'

    // 维度1：余额变化方向 (权重60%, 范围0-5)
    const g = marginLatest.balanceGrowth
    let growthPart = 2.5
    if (g >= 2) { growthPart = 5; marginDesc = '融资余额大幅上升' }
    else if (g >= 0.5) { growthPart = 4; marginDesc = '融资余额上升' }
    else if (g > 0.3) { growthPart = 3; marginDesc = '融资余额微升' }
    else if (g >= -0.3) { growthPart = 2.5; marginDesc = '融资余额持平' }
    else if (g >= -0.5) { growthPart = 2; marginDesc = '融资余额微降' }
    else if (g > -2) { growthPart = 1; marginDesc = '融资余额下降' }
    else { growthPart = 0; marginDesc = '融资余额大幅下降' }

    // 维度2：净买入金额占余额比 (权重40%, 范围0-5)
    let buyPart = 2.5
    if (marginLatest.rzNetBuy != null && marginLatest.rzBalance > 100) {
      const buyRatio = marginLatest.rzNetBuy / marginLatest.rzBalance * 100
      if (buyRatio >= 1) buyPart = 5
      else if (buyRatio >= 0.3) buyPart = 4
      else if (buyRatio >= -0.3) buyPart = 3
      else if (buyRatio >= -1) buyPart = 1.5
      else buyPart = 0
    }

    let marginScore = Math.round(growthPart * 0.6 + buyPart * 0.4)
    marginScore = Math.max(0, Math.min(5, marginScore))

    // 做空信号检测：融券余额日环比（使用相对比例过滤小额误报）
    const marginHistory = capitalFlow?._marginData?.data
    if (marginHistory && marginHistory.length >= 2) {
      const rqLatest = marginHistory[marginHistory.length - 1]?.rqBalance || 0
      const rqPrev = marginHistory[marginHistory.length - 2]?.rqBalance || 0
      // 融券余额需占融资余额一定比例才有分析意义，避免小额基数误判
      const rqRatio = marginLatest.rzBalance > 0 ? rqLatest / marginLatest.rzBalance : 0
      if (rqRatio > 0.005 && rqPrev > 0) {
        const rqGrowth = (rqLatest - rqPrev) / rqPrev * 100
        if (rqGrowth > 20) {
          marginScore = Math.max(0, marginScore - 2)
          marginDesc += '（融券大幅增加）'
        } else if (rqGrowth > 10) {
          marginScore = Math.max(0, marginScore - 1)
          marginDesc += '（融券增加）'
        }
      }
    }

    cap.items.push({ name: '融资融券', score: marginScore, max: 5, desc: marginDesc })
  } else {
    cap.items.push({ name: '融资融券', score: 3, max: 5, desc: '暂无数据' })
  }

  // 北向资金评分（基于持股变动）— 季度数据按风格降权 + 衰减
  const nbLatest = capitalFlow?._northboundLatest
  const nbFrequency = capitalFlow?._northboundFrequency || null
  const nbMax = getEffectiveMax(6, nbFrequency)
  if (nbLatest?.changeRatio != null) {
    let nbScore = 3
    let nbDesc = '北向持股持平'
    const r = nbLatest.changeRatio
    if (r >= 10) { nbScore = 6; nbDesc = '北向大幅增持' }
    else if (r >= 2) { nbScore = 5; nbDesc = '北向增持' }
    else if (r >= 0.5) { nbScore = 4; nbDesc = '北向微增' }
    else if (r >= -0.5) { nbScore = 3; nbDesc = '北向持股持平' }
    else if (r >= -2) { nbScore = 2; nbDesc = '北向微减' }
    else if (r > -10) { nbScore = 1; nbDesc = '北向减持' }
    else { nbScore = 0; nbDesc = '北向大幅减持' }
    nbScore = applyStalenessDecay(nbScore, nbMax, nbFrequency)
    nbScore = Math.max(0, Math.min(nbMax, nbScore))
    cap.items.push({ name: '北向资金', score: nbScore, max: nbMax, desc: nbDesc })
  } else {
    cap.items.push({ name: '北向资金', score: Math.round(nbMax * 0.4), max: nbMax, desc: '暂无数据' })
  }

  // 筹码趋势评分（股东户数变化）— 季度数据按风格降权 + 衰减
  const shLatest = capitalFlow?._shareholderLatest
  const shFrequency = capitalFlow?._shareholderFrequency || 'quarterly'
  const shMax = getEffectiveMax(5, shFrequency)
  if (shLatest?.changeRatio != null) {
    let shScore = 3
    let shDesc = '筹码稳定'
    const cr = shLatest.changeRatio
    if (cr <= -10) { shScore = 5; shDesc = '筹码高度集中' }
    else if (cr <= -5) { shScore = 4; shDesc = '筹码明显集中' }
    else if (cr <= -3) { shScore = 4; shDesc = '筹码趋于集中' }
    else if (cr <= -1) { shScore = 3; shDesc = '筹码略集中' }
    else if (cr <= 1) { shScore = 3; shDesc = '筹码稳定' }
    else if (cr <= 3) { shScore = 2; shDesc = '筹码略分散' }
    else if (cr <= 5) { shScore = 2; shDesc = '筹码趋于分散' }
    else if (cr <= 10) { shScore = 1; shDesc = '筹码分散' }
    else { shScore = 0; shDesc = '筹码高度分散' }

    // 近3期趋势修正：连续集中加分，连续分散减分（要求每期幅度 > 1%）
    const shData = capitalFlow?._shareholderData
    if (shData && shData.length >= 3) {
      const recent3 = shData.slice(0, 3)
      const allConcentrating = recent3.every(d => d.changeRatio < -1)
      const allDispersing = recent3.every(d => d.changeRatio > 1)
      if (allConcentrating) {
        shScore = Math.min(5, shScore + 1)
        shDesc += '，连续集中'
      } else if (allDispersing) {
        shScore = Math.max(0, shScore - 1)
        shDesc += '，连续分散'
      }
    }

    shScore = applyStalenessDecay(shScore, shMax, shFrequency)
    shScore = Math.max(0, Math.min(shMax, shScore))
    cap.items.push({ name: '筹码趋势', score: shScore, max: shMax, desc: shDesc })
  } else {
    cap.items.push({ name: '筹码趋势', score: Math.round(shMax * 0.4), max: shMax, desc: '暂无数据' })
  }

  cap.score = cap.items.reduce((s, i) => s + i.score, 0)
  cap.max = cap.items.reduce((s, i) => s + i.max, 0)

  // ========== 风险面评分 (0-15) ==========
  const risk = dimensions.risk
  if (riskItems && riskItems.length) {
    risk.items = riskItems
  } else {
    // 无风险数据时给中间分，权重归零
    risk.items = [
      { name: 'Sharpe', score: 3, max: 5, desc: '暂无数据' },
      { name: '最大回撤', score: 3, max: 5, desc: '暂无数据' },
      { name: 'Beta', score: 3, max: 5, desc: '暂无数据' },
    ]
  }
  risk.score = risk.items.reduce((s, i) => s + i.score, 0)
  risk.max = risk.items.reduce((s, i) => s + i.max, 0)

  // ========== 动态权重合成 ==========
  const hasFundData = !!fundamental?.latest && Object.values(fundamental.latest).some(v => v != null && typeof v === 'number')
  const hasRiskData = riskItems && riskItems.length > 0
  const baseWeights = STYLE_WEIGHTS[style] || STYLE_WEIGHTS.mid

  let weights
  if (hasFundData && hasRiskData) {
    weights = baseWeights
  } else if (hasFundData) {
    // 无风险数据：风险权重归零，分配给技术和资金面
    const styleFallback = {
      short: { technical: 0.38, fundamental: 0.15, capital: 0.47 },
      mid:   { technical: 0.35, fundamental: 0.26, capital: 0.39 },
      long:  { technical: 0.26, fundamental: 0.40, capital: 0.34 },
    }
    const fb = styleFallback[style] || styleFallback.mid
    weights = { technical: fb.technical, fundamental: fb.fundamental, capital: fb.capital, risk: 0 }
  } else if (hasRiskData) {
    // 无基本面数据：基本面权重分配给技术、资金和风险
    const styleFallback = {
      short: { technical: 0.40, capital: 0.52, risk: 0.08 },
      mid:   { technical: 0.42, capital: 0.46, risk: 0.12 },
      long:  { technical: 0.42, capital: 0.40, risk: 0.18 },
    }
    const fb = styleFallback[style] || styleFallback.mid
    weights = { technical: fb.technical, fundamental: 0, capital: fb.capital, risk: fb.risk }
  } else {
    // 无基本面 + 无风险：全部权重分配给技术和资金
    const styleFallback = {
      short: { technical: 0.40, capital: 0.60 },
      mid:   { technical: 0.45, capital: 0.55 },
      long:  { technical: 0.50, capital: 0.50 },
    }
    const fb = styleFallback[style] || styleFallback.mid
    weights = { technical: fb.technical, fundamental: 0, capital: fb.capital, risk: 0 }
  }

  const safeDiv = (num, den) => (den > 0 ? num / den : 0)
  const total = Math.round(
    safeDiv(tech.score, tech.max) * 100 * weights.technical +
    safeDiv(fund.score, fund.max) * 100 * weights.fundamental +
    safeDiv(cap.score, cap.max) * 100 * weights.capital +
    safeDiv(risk.score, risk.max) * 100 * weights.risk
  )

  // 置信度 — 根据数据完整度分四档
  const fundDataCount = fund.items.filter(i => !i.desc.includes('暂无数据')).length
  const capDataCount = cap.items.filter(i => !i.desc.includes('暂无数据')).length
  const riskDataCount = risk.items.filter(i => !i.desc.includes('暂无数据') && !i.desc.includes('数据不足') && !i.desc.includes('无基准数据')).length
  const techDataCount = tech.items.length
  const totalDataPoints = fundDataCount + capDataCount + riskDataCount + techDataCount
  let confidence, confidenceStars
  if (fundDataCount >= 4 && capDataCount >= 3 && riskDataCount >= 2) {
    confidence = 'high'; confidenceStars = 5
  } else if (fundDataCount >= 4 && capDataCount >= 3) {
    confidence = 'high'; confidenceStars = 4
  } else if (fundDataCount >= 2 && capDataCount >= 2) {
    confidence = 'medium'; confidenceStars = 3
  } else {
    confidence = 'low'; confidenceStars = 2
  }

  // 操作建议 — 综合评分 + 风格感知 + 资金面/技术面信号 + 维度冲突检测
  let suggestion, suggestionColor
  const bullishCount = techSignals.filter(s => s.type === 'bullish').length
  const bearishCount = techSignals.filter(s => s.type === 'bearish').length
  const techPct = tech.score / tech.max
  const capPct = cap.score / cap.max
  const capitalBullish = capPct >= 0.65
  const capitalBearish = capPct <= 0.35

  // 冲突检测辅助：提取估值状态
  const peItem = fund.items.find(i => i.name === 'PE估值')
  const peOvervalued = peItem && peItem.score <= 2   // 偏高/高估/亏损
  const peUndervalued = peItem && peItem.score >= 6   // 低估/合理
  const peMatch = peItem?.desc?.match(/PE\s*([\d.]+)/)
  const peValue = peMatch ? peMatch[1] : ''
  const fundPct = fund.score / fund.max

  if (total >= 70) {
    if (style === 'short') {
      if (peOvervalued && (capitalBullish || bullishCount >= 3)) {
        suggestion = peValue
          ? `趋势偏强但PE已达${peValue}倍（估值偏高），短线博弈为主，严格止损`
          : '趋势偏强但估值偏高，短线博弈为主，严格止损'
      } else if (capitalBullish && bullishCount >= 3) {
        suggestion = '资金+技术共振，短线偏强'
      } else if (capitalBullish) {
        suggestion = '资金面强势，短线可关注'
      } else {
        suggestion = '综合偏强，但资金配合不足，注意节奏'
      }
    } else if (style === 'long') {
      if (fundPct >= 0.65) {
        suggestion = '基本面扎实，适合长线布局'
      } else if (peOvervalued) {
        suggestion = peValue
          ? `综合偏强，但PE ${peValue}倍估值偏高，长线需关注业绩消化`
          : '综合偏强，但估值偏高，长线需关注业绩消化'
      } else {
        suggestion = '综合偏强，但基本面支撑一般'
      }
    } else {
      if (peOvervalued && bullishCount >= 4) {
        suggestion = peValue
          ? `多头强势但PE ${peValue}倍估值偏高，中线宜轻仓`
          : '多头强势但估值偏高，中线宜轻仓'
      } else {
        suggestion = bullishCount >= 4 ? '多头强势，可逢回调关注' : '综合偏强，持续跟踪'
      }
    }
    suggestionColor = '#30d158'
  } else if (total >= 50) {
    const riskPct = risk.score / risk.max
    const techStrong = techPct >= 0.65    // 技术面得分率 >= 65%
    const capStrong = capPct >= 0.55      // 资金面得分率 >= 55%
    const riskWeak = riskPct < 0.35       // 风险面得分率 < 35%

    if (totalDataPoints < 5) {
      suggestion = '数据不足，建议仅供参考'
    } else if (style === 'short' && capitalBearish) {
      suggestion = bullishCount >= 3
        ? '技术偏强但资金不配合，短线观望'
        : '资金面偏弱，短线观望'
    } else if (style === 'long' && riskWeak) {
      suggestion = fundPct >= 0.55
        ? '基本面尚可但风险偏高，长线需谨慎'
        : '风险指标不佳，长线需谨慎'
    } else if (techStrong && capStrong) {
      // 技术强 + 资金强 — 检查估值是否冲突
      if (peOvervalued) {
        suggestion = riskWeak
          ? (peValue ? `趋势向好但PE ${peValue}倍偏高且波动大，高位博弈风险高` : '趋势向好但估值偏高且波动大，高位博弈风险高')
          : (peValue ? `趋势+资金共振，但PE ${peValue}倍估值偏高，注意高位风险` : '趋势+资金共振，但估值偏高，注意高位风险')
      } else {
        suggestion = riskWeak
          ? '趋势向好，注意高位风险'
          : '偏多格局，可逢低关注'
      }
    } else if (techStrong && !capStrong) {
      suggestion = bullishCount >= 4
        ? '技术面强势，但资金未有效配合'
        : '技术偏强，资金面待验证'
    } else if (!techStrong && capStrong) {
      suggestion = '资金面偏强，等待技术面确认'
    } else if (techStrong && riskWeak) {
      suggestion = '趋势向上但波动风险较大，注意仓位'
    } else if (fundPct >= 0.65 && techPct < 0.50 && style === 'long') {
      // 基本面强但技术面弱的长线场景 — 提示等待确认
      suggestion = '基本面扎实但趋势未确认，等待技术面企稳后布局'
    } else {
      suggestion = '多空交织，观望为主'
    }
    suggestionColor = '#ffd60a'
  } else if (total >= 30) {
    if (style === 'long' && peUndervalued) {
      suggestion = peValue
        ? `估值偏低（PE ${peValue}倍），等待技术面企稳后关注`
        : '估值偏低，等待技术面企稳后关注'
    } else if (style === 'short') {
      suggestion = capitalBearish && bearishCount >= 3
        ? '资金+技术双弱，短线回避'
        : capitalBearish
          ? '资金面疲弱，短线不建议参与'
          : bearishCount >= 3
            ? '技术信号偏空，等待资金面改善'
            : '走势偏弱，谨慎参与'
    } else {
      suggestion = bearishCount >= 3 && techPct < 0.5
        ? '空头占优，等待企稳信号'
        : '走势偏弱，谨慎参与'
    }
    suggestionColor = '#ff9500'
  } else {
    if (peUndervalued && totalDataPoints >= 3) {
      suggestion = peValue
        ? `综合偏弱但PE ${peValue}倍已具估值吸引力，跟踪企稳信号`
        : '综合偏弱但估值已具吸引力，跟踪企稳信号'
    } else {
      suggestion = totalDataPoints < 3 ? '数据稀缺，无法有效评估' : '综合偏空，建议回避'
    }
    suggestionColor = '#ff453a'
  }

  // 汇总所有明细
  const details = [
    ...tech.items.map(i => ({ ...i, dimension: '技术面' })),
    ...fund.items.map(i => ({ ...i, dimension: '基本面' })),
    ...cap.items.map(i => ({ ...i, dimension: '资金面' })),
    ...risk.items.map(i => ({ ...i, dimension: '风险面' })),
  ]

  return {
    total: Math.max(0, Math.min(100, isNaN(total) ? 50 : total)),
    dimensions: {
      technical: { score: tech.score, max: tech.max, pct: Math.round(safeDiv(tech.score, tech.max) * 100) },
      fundamental: { score: fund.score, max: fund.max, pct: Math.round(safeDiv(fund.score, fund.max) * 100) },
      capital: { score: cap.score, max: cap.max, pct: Math.round(safeDiv(cap.score, cap.max) * 100) },
      risk: { score: risk.score, max: risk.max, pct: Math.round(safeDiv(risk.score, risk.max) * 100) }
    },
    suggestion,
    suggestionColor,
    confidence,
    confidenceStars,
    details
  }
}

// ==================== 行业匹配公共逻辑 ====================
const INDUSTRY_CN_MAP = {
  '银行': 'bank', '保险': 'insurance', '房地产': 'realestate', '房地产开发': 'realestate',
  '钢铁': 'steel', '煤炭': 'coal', '食品': 'food', '饮料': 'food',
  '白酒': 'food', '酒': 'food',
  '医药': 'medicine', '生物': 'medicine', '化学制药': 'medicine', '生物制药': 'medicine', '中药': 'medicine',
  '计算机': 'tech', '电子': 'tech', '通信': 'tech',
  '互联网': 'tech', '软件': 'tech',
  '半导体': 'semiconductor', '芯片': 'semiconductor',
  '国防': 'military', '军工': 'military',
  '新能源': 'newenergy', '光伏': 'newenergy', '锂电': 'newenergy',
  '家电': 'appliance', '白电': 'appliance',
  '汽车': 'auto', '整车': 'auto',
  '电力': 'utility', '公用': 'utility', '水务': 'utility', '燃气': 'utility',
  '化工': 'chemical', '化学': 'chemical', '塑料': 'chemical', '橡胶': 'chemical', '纤维': 'chemical', '涂料': 'chemical',
  '建筑': 'construction', '建材': 'construction',
  '证券': 'broker', '券商': 'broker',
  '有色': 'mining', '采矿': 'mining', '矿业': 'mining',
  '农业': 'agriculture', '牧': 'agriculture', '渔': 'agriculture',
  // 新增行业关键字
  '环保': 'environmental', '节能': 'environmental', '环境治理': 'environmental',
  '教育': 'education', '培训': 'education',
  '旅游': 'tourism', '酒店': 'tourism', '餐饮': 'tourism', '文旅': 'tourism',
  '传媒': 'media', '娱乐': 'media', '影视': 'media', '游戏': 'media',
  '物流': 'logistics', '运输': 'logistics', '港口': 'logistics', '机场': 'logistics', '航运': 'logistics',
  '纺织': 'textile', '服装': 'textile', '服饰': 'textile',
  // P2 补充：申万行业缺失映射
  '机械': 'construction', '机械设备': 'construction', '通用机械': 'construction', '专用机械': 'construction',
  '电气设备': 'newenergy', '电气': 'newenergy', '电源设备': 'newenergy',
  '石油': 'mining', '石化': 'chemical', '油气': 'mining',
  '商业百货': 'logistics', '零售': 'logistics', '贸易': 'logistics', '超市': 'logistics', '百货': 'logistics',
  '轻工': 'textile', '造纸': 'textile', '包装': 'textile', '家具': 'textile',
  '综合': 'default',
}

// 预排序：关键字从长到短，长关键字优先匹配，命中即停
const _sortedCNEntries = Object.entries(INDUSTRY_CN_MAP)
  .sort((a, b) => b[0].length - a[0].length)

function matchIndustryKey(industry) {
  if (!industry) return null
  const lower = industry.toLowerCase()
  // 英文 key 精确匹配（避免子串误匹配）
  for (const key of Object.keys(PE_THRESHOLDS)) {
    if (key === 'default') continue
    if (lower === key) return key
  }
  // 中文关键字：按长度降序匹配，命中即停
  for (const [cn, key] of _sortedCNEntries) {
    if (industry.includes(cn)) return key
  }
  return null
}

// PE 行业分档辅助（导出供组件使用）
export function getPEThresholds(industry) {
  const key = matchIndustryKey(industry)
  return (key && PE_THRESHOLDS[key]) ? PE_THRESHOLDS[key] : PE_THRESHOLDS.default
}

// PB 行业分档辅助
export function getPBThresholds(industry) {
  const key = matchIndustryKey(industry)
  return (key && PB_THRESHOLDS[key]) ? PB_THRESHOLDS[key] : PB_THRESHOLDS.default
}

// 负债率行业分档辅助
export function getDebtThresholds(industry) {
  const key = matchIndustryKey(industry)
  return (key && DEBT_THRESHOLDS[key]) ? DEBT_THRESHOLDS[key] : DEBT_THRESHOLDS.default
}

// 毛利率行业分档辅助
export function getGrossMarginThresholds(industry) {
  const key = matchIndustryKey(industry)
  return (key && GROSS_MARGIN_THRESHOLDS[key]) ? GROSS_MARGIN_THRESHOLDS[key] : GROSS_MARGIN_THRESHOLDS.default
}

/**
 * 获取趋势结论（用于诊断区卡片）
 */
export function getTrendConclusion(signals = []) {
  const bullish = signals.filter(s => s.type === 'bullish').length
  const bearish = signals.filter(s => s.type === 'bearish').length

  if (bullish >= 4) return { text: '强势多头', color: '#30d158', icon: '↑' }
  if (bullish >= 2 && bullish > bearish) return { text: '偏多', color: '#30d158', icon: '↑' }
  if (bearish >= 4) return { text: '弱势空头', color: '#ff453a', icon: '↓' }
  if (bearish >= 2 && bearish > bullish) return { text: '偏空', color: '#ff453a', icon: '↓' }
  return { text: '震荡', color: '#ffd60a', icon: '→' }
}

/**
 * 获取估值结论（用于诊断区卡片）
 */
export function getValuationConclusion(fundamental) {
  const latest = fundamental?.latest
  if (!latest || latest.pe == null) return { text: '暂无数据', color: '#64748b', icon: '?' }

  const industry = latest.industry || ''
  const t = getPEThresholds(industry)
  const pe = latest.pe
  if (pe < 0) return { text: '亏损', color: '#ff453a', icon: '✗' }
  if (pe <= t.low) return { text: '低估', color: '#30d158', icon: '✓' }
  if (pe <= t.fair) return { text: '合理', color: '#30d158', icon: '✓' }
  const midPE = Math.round((t.fair * 2 + t.high) / 3)
  if (pe <= midPE) return { text: '略高', color: '#ffd60a', icon: '!' }
  if (pe <= t.high) return { text: '偏高', color: '#ff9500', icon: '!' }
  return { text: '高估', color: '#ff453a', icon: '!' }
}

/**
 * 获取资金结论（用于诊断区卡片）
 * 使用与评分引擎一致的 combinedPct 加权公式
 */
export function getCapitalConclusion(capitalFlow) {
  const signal = capitalFlow?.priceVolumeSignal
  const mfLatest = capitalFlow?._mainForceLatest
  const mfSummary = capitalFlow?._mainForceSummary

  if (!signal && !mfLatest) return { text: '暂无数据', color: '#64748b', icon: '?' }

  // 使用与评分引擎一致的 50/50 加权公式
  if (mfLatest?.mainNetPct != null) {
    const todayPct = mfLatest.mainNetPct ?? 0
    const avg5Pct = mfSummary?.mainNetAvgPct5 ?? 0
    let combinedPct = todayPct * 0.5 + avg5Pct * 0.5
    if (isNaN(combinedPct)) combinedPct = 0
    if (combinedPct > 2) return { text: '主力流入', color: '#30d158', icon: '↑' }
    if (combinedPct > 0.3) return { text: '温和流入', color: '#30d158', icon: '↑' }
    if (combinedPct >= -0.3) return { text: '平稳', color: '#ffd60a', icon: '→' }
    if (combinedPct >= -2) return { text: '温和流出', color: '#ffd60a', icon: '→' }
    return { text: '主力流出', color: '#ff453a', icon: '↓' }
  }

  if (!signal) return { text: '暂无数据', color: '#64748b', icon: '?' }

  if (signal === '放量上涨') return { text: '资金流入', color: '#30d158', icon: '↑' }
  if (signal === '温和上涨') return { text: '温和流入', color: '#30d158', icon: '↑' }
  if (signal === '缩量回调（洗盘）' || signal === '缩量整理（蓄势）') return { text: '缩量整理', color: '#ffd60a', icon: '→' }
  if (signal === '放量下跌') return { text: '资金流出', color: '#ff453a', icon: '↓' }
  if (signal.includes('缩量下跌') || signal.includes('弱势')) return { text: '缩量流出', color: '#ff453a', icon: '↓' }
  if (signal.includes('缩量调整')) return { text: '缩量整理', color: '#ffd60a', icon: '→' }
  return { text: '平稳', color: '#ffd60a', icon: '→' }
}
