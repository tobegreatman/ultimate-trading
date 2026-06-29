import { STRATEGY_PARAMS } from './constants.js'

const ATR_PERIOD = 14
const RISK_BUDGET = 0.02

/**
 * 计算 ATR — Wilder 平滑法（与 indicators.js 保持一致）
 */
export function calcATR(klines) {
  if (!klines || klines.length < ATR_PERIOD + 1) return 0

  // True Range
  const trList = []
  for (let i = 0; i < klines.length; i++) {
    if (i === 0) {
      trList.push(klines[i].high - klines[i].low)
    } else {
      const prevClose = klines[i - 1].close
      trList.push(Math.max(
        klines[i].high - klines[i].low,
        Math.abs(klines[i].high - prevClose),
        Math.abs(klines[i].low - prevClose)
      ))
    }
  }

  // Wilder 平滑：前 ATR_PERIOD 个 TR 的简单平均，之后递推
  let avg = trList.slice(0, ATR_PERIOD).reduce((s, v) => s + v, 0) / ATR_PERIOD
  for (let i = ATR_PERIOD; i < trList.length; i++) {
    avg = (avg * (ATR_PERIOD - 1) + trList[i]) / ATR_PERIOD
  }
  return avg
}

export function getAdjustedAtrN(atr, price, baseN) {
  if (!atr || !price) return baseN
  const volatility = atr / price
  if (volatility > 0.05) return baseN + 0.5
  if (volatility < 0.015) return Math.max(baseN - 0.5, 0.5)
  return baseN
}

/**
 * 计算止损价（含波动率自适应）
 */
export function calcStopLoss(buyPrice, atr, strategy) {
  const params = STRATEGY_PARAMS[strategy]
  if (!params) return buyPrice * 0.92
  const n = getAdjustedAtrN(atr, buyPrice, params.atrN)
  const stop = Math.max(buyPrice - n * atr, 0.01)
  return strategy === 'bottom' ? Math.min(stop, buyPrice * 0.92) : stop
}

/**
 * 识别趋势突破的"强突破"（突破强度 > 2）
 * 突破强度 = 突破日涨幅 / 当日ATR波动率
 * @returns {object|null} { isStrong, breakoutDay, dayLow, dayOpen, dayClose, strength }
 */
export function detectStrongBreakout(klines) {
  if (!klines || klines.length < 22) return null
  const today = klines[klines.length - 1]
  const prev = klines[klines.length - 2]
  const recent20 = klines.slice(-21, -1) // 不含今天
  const high20BeforeToday = Math.max(...recent20.map(k => k.high))
  const low20BeforeToday = Math.min(...recent20.map(k => k.low))

  // 今天是否突破20日高点
  if (today.close <= high20BeforeToday) return null

  // 突破日涨幅（当日收益率）
  const dayReturn = (today.close - today.open) / today.open
  // 用今日ATR近似（突破日波动放大）
  const todayRange = Math.max(
    today.high - today.low,
    Math.abs(today.high - prev.close),
    Math.abs(today.low - prev.close)
  )
  const volatility = todayRange / today.close
  if (volatility <= 0) return null

  const strength = dayReturn / volatility
  const isStrong = strength > 2

  return {
    isStrong,
    breakoutDay: today,
    dayLow: today.low,
    dayOpen: today.open,
    dayClose: today.close,
    strength,
    high20BeforeToday,
    low20BeforeToday,
  }
}

/**
 * 强突破场景的止损价：突破日低点 - 0.5×ATR（结构止损，更紧）
 */
export function calcStrongBreakoutStop(buyPrice, atr, breakoutDayLow) {
  const stop = breakoutDayLow - 0.5 * atr
  return Math.max(stop, 0.01)
}

/**
 * 强突破场景的目标价：盘整幅度投影（AB=CD）
 * 盘整幅度 = 突破前20日高点 - 突破前20日低点
 * 目标价 = 突破位 + 盘整幅度（市场结构而非盈亏比反推）
 */
export function calcStrongBreakoutTarget(high20BeforeToday, low20BeforeToday) {
  const consolidationRange = high20BeforeToday - low20BeforeToday
  if (consolidationRange <= 0) return null
  return +(high20BeforeToday + consolidationRange).toFixed(2)
}

/**
 * 计算仓位
 */
export function calcPosition(totalCapital, buyPrice, stopPrice, strategy) {
  if (!buyPrice || !stopPrice || buyPrice <= stopPrice) {
    return { amount: 0, pct: 0, shares: 0 }
  }
  const stopPct = (buyPrice - stopPrice) / buyPrice
  const riskBudget = totalCapital * RISK_BUDGET
  const posByRisk = riskBudget / stopPct
  const params = strategy ? STRATEGY_PARAMS[strategy] : null
  const posLimit = params ? params.maxPosition : 0.25
  const posByLimit = totalCapital * posLimit
  const amount = Math.min(posByRisk, posByLimit)
  const pct = (amount / totalCapital) * 100
  const shares = Math.floor(amount / buyPrice / 100) * 100
  return { amount: Math.round(amount * 100) / 100, pct: Math.round(pct * 100) / 100, shares }
}

/**
 * 计算盈亏比
 */
export function calcRiskReward(buyPrice, stopPrice, targetPrice) {
  if (!buyPrice || !stopPrice || !targetPrice) return 0
  const risk = buyPrice - stopPrice
  if (risk <= 0) return 0
  const reward = targetPrice - buyPrice
  return Math.round((reward / risk) * 100) / 100
}

/**
 * 计算初始跟踪止盈价（取止损价作为初始值）
 */
export function calcTrailingStop(buyPrice, atr, strategy) {
  return calcStopLoss(buyPrice, atr, strategy)
}

/**
 * 更新跟踪止盈价（只上移不下调，ATR 动态）
 */
export function updateTrailingStop(currentTrailing, highestClose, atr, strategy) {
  const params = STRATEGY_PARAMS[strategy]
  if (!params) return currentTrailing
  if (!atr) {
    const trailPct = params.trailAtrN * 0.03
    const newTrailing = highestClose * (1 - trailPct)
    return Math.max(currentTrailing, newTrailing)
  }
  const m = getAdjustedAtrN(atr, highestClose, params.trailAtrN)
  const newTrailing = highestClose - m * atr
  return Math.max(currentTrailing, newTrailing)
}

/**
 * 格式化金额
 */
export function formatMoney(val) {
  if (val >= 1e8) return (val / 1e8).toFixed(2) + '亿'
  if (val >= 1e4) return (val / 1e4).toFixed(2) + '万'
  return val.toFixed(2)
}

/**
 * 格式化数字
 */
export function formatNum(val, decimals = 2) {
  if (val == null || isNaN(val)) return '--'
  return Number(val).toFixed(decimals)
}
