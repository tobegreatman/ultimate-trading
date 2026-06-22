/**
 * useStrategyGuide — 策略执行计划计算
 *
 * 从 Dashboard 策略选股跳转时，根据当前个股数据计算入场位、止损位、
 * 跟踪止盈等策略参数，并评估信号质量。
 */
import { ref, computed } from 'vue'
import { STRATEGY_PARAMS, SIGNAL_QUALITY } from '../utils/constants.js'
import { calcStopLoss, getAdjustedAtrN } from '../utils/position.js'
import { getTrendConclusion, getValuationConclusion, getCapitalConclusion } from '../utils/scoring.js'
import { useJournalStore } from '../stores/journal.js'
import { usePositionStore } from '../stores/position.js'
import { useMarketAnalysisStore } from '../stores/marketAnalysis.js'

export function useStrategyGuide({
  selectedCode,
  currentStock,
  klines,
  indicators,
  techSignals,
  fundamental,
  capitalFlow,
  scoreResult,
  routeStrategy,
  routeMarketStatus,
}) {
  const journalStore = useJournalStore()
  const positionStore = usePositionStore()
  const marketAnalysisStore = useMarketAnalysisStore()

  // ==================== 诊断结论 ====================
  const trendConclusion = computed(() => getTrendConclusion(techSignals.value))
  const valuationConclusion = computed(() => getValuationConclusion(fundamental.value, {
    bondYield10y: marketAnalysisStore.valuation?.bondYield10y ?? null
  }))
  const capitalConclusion = computed(() => getCapitalConclusion(capitalFlow.value))

  // ==================== 信号质量评估 ====================

  /**
   * 评估个股信号与策略方向的一致性（按策略类型区分）
   */
  function assessSignalQuality(strategyKey, sr, tc, vc, cc) {
    if (!sr) return null

    const score = sr.total
    const trend = tc.icon
    const valuation = vc.icon
    const capital = cc.icon
    const isValBad = valuation === '!' || valuation === '✗'
    const isCapBad = capital === '↓'

    if (strategyKey === 'trend') {
      const negCount = [trend === '↓', isCapBad, isValBad].filter(Boolean).length
      if (score >= 60 && negCount === 0) return 'strong'
      if (score >= 50 && negCount <= 1) return 'moderate'
      if (negCount >= 2 && score < 40) return 'invalid'
      if (negCount >= 3) return 'invalid'
      return 'weak'
    }

    if (strategyKey === 'pullback') {
      const negCount = [isCapBad, isValBad].filter(Boolean).length
      if (score >= 50 && negCount === 0) return 'strong'
      if (score >= 40 && negCount <= 1) return 'moderate'
      if (negCount >= 2 && score < 35) return 'invalid'
      return 'weak'
    }

    if (strategyKey === 'bottom') {
      if (isValBad) return score < 30 ? 'invalid' : 'weak'
      if (score >= 35) return 'moderate'
      return 'weak'
    }

    return 'weak'
  }

  function buildNotRecommendedReason(sr, tc, vc, cc, strategyKey) {
    const parts = []
    if (sr) parts.push(`评分${sr.total}`)
    if (strategyKey === 'trend' && tc.icon === '↓') parts.push(`趋势${tc.text}`)
    if (vc.icon === '!' || vc.icon === '✗') parts.push(`估值${vc.text}`)
    if (strategyKey !== 'bottom' && cc.icon === '↓') parts.push(`资金${cc.text}`)
    return parts.join('、') + '不支撑当前买入策略'
  }

  // ==================== 策略执行计划 ====================
  const strategyGuide = computed(() => {
    if (!routeStrategy.value) return null
    const params = STRATEGY_PARAMS[routeStrategy.value]
    if (!params) return null

    const kl = klines.value
    const ind = indicators.value
    if (!kl?.length || !ind?.atr?.length) return null

    const currentATR = ind.atr[ind.atr.length - 1]
    if (!currentATR) return null

    const price = kl[kl.length - 1].close
    const ma20 = ind.ma?.[20]?.[ind.ma[20].length - 1]

    const quality = assessSignalQuality(params.key, scoreResult.value, trendConclusion.value, valuationConclusion.value, capitalConclusion.value)
    const qualityDef = quality ? SIGNAL_QUALITY[quality] : null

    if (quality === 'invalid') {
      return {
        notRecommended: true,
        quality: 'invalid',
        qualityLabel: qualityDef.label,
        qualityColor: qualityDef.color,
        strategyName: params.name,
        reason: buildNotRecommendedReason(scoreResult.value, trendConclusion.value, valuationConclusion.value, capitalConclusion.value, params.key),
        price,
      }
    }

    // ---- 入场锚点计算 ----
    let entryPrice, entryDesc
    if (params.key === 'trend') {
      const recent = kl.slice(-20)
      entryPrice = Math.max(...recent.map(k => k.high))
      entryDesc = '突破近20日高点'
    } else if (params.key === 'pullback') {
      entryPrice = ma20 || price
      entryDesc = '回调至MA20支撑'
    } else {
      const recent = kl.slice(-20)
      const low = Math.min(...recent.map(k => k.low))
      entryPrice = low * 1.02
      entryDesc = '底部确认价'
    }

    const stopPrice = calcStopLoss(entryPrice, currentATR, params.key)
    const adjustedTrailN = getAdjustedAtrN(currentATR, price, params.trailAtrN)
    const trailStart = entryPrice + adjustedTrailN * currentATR
    const distPct = ((price - entryPrice) / entryPrice * 100).toFixed(1)

    // ---- 状态判断 ----
    const entryHigh = entryPrice + currentATR * 0.5
    const entryLow  = entryPrice - currentATR * 0.5

    let supportBroken = false
    if (params.key !== 'trend' && kl.length >= 3) {
      const last3 = kl.slice(-3)
      const closesBelowEntry = last3.filter(k => k.close < entryLow).length
      supportBroken = closesBelowEntry >= 2
    }

    let statusText, statusClass
    if (params.key === 'trend') {
      if (price >= entryPrice) {
        statusText = '已突破'; statusClass = 'ready'
      } else if (price >= entryPrice - currentATR) {
        statusText = '接近突破位'; statusClass = 'waiting'
      } else {
        statusText = '等待突破'; statusClass = 'waiting'
      }
    } else if (params.key === 'pullback') {
      if (price > entryHigh * 1.03) {
        statusText = '等待回调'; statusClass = 'waiting'
      } else if (price >= entryLow) {
        statusText = '已到入场区'; statusClass = 'ready'
      } else if (supportBroken) {
        statusText = '支撑已破'; statusClass = 'broken'
      } else {
        statusText = '回调中'; statusClass = 'waiting'
      }
    } else {
      if (price >= entryPrice) {
        statusText = '底部确认'; statusClass = 'ready'
      } else if (price >= entryLow) {
        statusText = '底部区域'; statusClass = 'waiting'
      } else if (supportBroken) {
        statusText = '破位下行'; statusClass = 'broken'
      } else {
        statusText = '探底中'; statusClass = 'waiting'
      }
    }

    // ---- 仓位自适应调整 ----
    const positionScale = qualityDef?.positionScale ?? 1.0
    const adjustedPosition = +(params.maxPosition * positionScale).toFixed(2)

    // ---- 历史胜率 ----
    const sStats = journalStore.strategyStats.find(s => s.name === params.name)
    const historyStats = sStats && sStats.count > 0 ? { winRate: sStats.winRate, count: sStats.count, pnl: sStats.pnl } : null

    return {
      strategyName: params.name,
      quality: quality || 'strong',
      qualityLabel: qualityDef?.label || '数据加载中',
      qualityColor: qualityDef?.color || '#8e8e93',
      entryPrice, entryDesc,
      entryHigh, entryLow,
      stopPrice,
      trailStart,
      currentATR,
      atrN: getAdjustedAtrN(currentATR, entryPrice, params.atrN),
      trailAtrN: adjustedTrailN,
      maxPosition: adjustedPosition,
      originalPosition: params.maxPosition,
      positionScale,
      holdPeriod: params.holdPeriod,
      timeStop: params.timeStop,
      riskLevel: params.riskLevel,
      price, distPct, statusText, statusClass,
      historyStats,
    }
  })

  // ==================== 快速建仓 ====================
  const addToast = ref('')
  const alreadyOpened = computed(() => {
    const code = selectedCode.value
    const strategy = routeStrategy.value
    if (!code || !strategy) return false
    return journalStore.openTrades.some(t => t.code === code && t.strategy === strategy)
  })

  function addToJournal() {
    const sg = strategyGuide.value
    if (!sg || sg.notRecommended) return
    const capital = positionStore.totalCapital || 1000000
    const stopPct = sg.stopPrice > 0 ? (sg.entryPrice - sg.stopPrice) / sg.entryPrice : 0.08
    const riskBudget = capital * 0.02
    const shares = stopPct > 0 ? Math.floor(riskBudget / stopPct / sg.entryPrice / 100) * 100 : 0
    // 若风险预算计算得 0 股，说明止损过近或资金不足，不添加无效记录
    if (shares <= 0) {
      addToast.value = '风险预算不足，无法建仓'
      setTimeout(() => { addToast.value = '' }, 3000)
      return
    }
    journalStore.addTrade({
      code: selectedCode.value,
      name: currentStock.value?.name || selectedCode.value,
      buyPrice: sg.price,
      quantity: shares,
      stopPrice: sg.stopPrice,
      targetPrice: sg.trailStart,
      atr: sg.currentATR,
      atrN: sg.atrN,
      strategy: routeStrategy.value,
      strategyName: sg.strategyName,
      marketRegime: routeMarketStatus.value || 'neutral',
      industry: fundamental.value?.latest?.industry || '',
      date: new Date().toISOString().slice(0, 10),
      checklist: [],
    })
    addToast.value = '已添加到交易记录'
    setTimeout(() => { addToast.value = '' }, 2000)
  }

  return {
    strategyGuide,
    alreadyOpened,
    addToast,
    addToJournal,
    trendConclusion,
    valuationConclusion,
    capitalConclusion,
  }
}
