/**
 * useStockData — 个股分析数据加载与评分计算
 *
 * 管理个股分析的所有数据加载（K线、基本面、资金面）和综合评分计算。
 * 两阶段加载策略：首屏（K线+基本面）→ 后台（资金面6个API）。
 */
import { ref } from 'vue'
import { useStockAnalysisStore } from '../stores/stockAnalysis.js'
import { useMarketAnalysisStore } from '../stores/marketAnalysis.js'
import { calcAllIndicators } from '../utils/indicators.js'
import { calculateScore } from '../utils/scoring.js'
import { saveScoreSnapshot } from '../utils/scoreHistory.js'
import { calcRiskScoreItems } from '../utils/riskMetrics.js'

export function useStockData(selectedCode, investStyle) {
  const analysisStore = useStockAnalysisStore()
  const marketAnalysisStore = useMarketAnalysisStore()

  // ==================== 数据 ====================
  const klines = ref([])
  const indicators = ref({})
  const techSignals = ref([])
  const fundamental = ref(null)
  const capitalFlow = ref(null)
  const marginData = ref(null)
  const northboundData = ref(null)
  const mainForceFlow = ref(null)
  const sectorCapitalData = ref(null)
  const billboardData = ref(null)
  const shareholderData = ref(null)
  const holderIncreaseData = ref(null)
  const pledgeData = ref(null)
  const goodwillData = ref(null)
  const benchmarkKlines = ref(null)
  const klinePeriod = ref('101')

  // ==================== 状态 ====================
  const loading = ref(false)
  const error = ref('')
  const loadErrors = ref({})
  const dataTimestamp = ref(null)
  const lastRefreshTime = ref(null)
  const scoreResult = ref(null)

  // ==================== 内部状态 ====================
  let loadSeq = 0
  let capitalLoadedSeq = 0
  let abortCtrl = null
  let stockChangeTimer = null
  let refreshTimer = null

  // ==================== 评分更新回调 ====================
  const scoreReadyCallbacks = []

  function onScoreReady(cb) {
    scoreReadyCallbacks.push(cb)
  }

  // ==================== 错误记录 ====================
  function setLoadErrors(results) {
    const names = ['kline', 'fundamental', 'capitalFlow', 'margin', 'northbound', 'mainForce', 'shareholder', 'billboard', 'holderIncrease', 'pledge', 'goodwill'] // 注：sectorCapital 错误并入 mainForce 桶（资金面 Tab 整体降级），不单列
    const errs = {}
    results.forEach((r, i) => {
      if (r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)) {
        errs[names[i]] = true
      }
    })
    loadErrors.value = errs
  }

  // ==================== 资金面数据注入 ====================
  function injectCapitalExtras() {
    const injections = {}
    if (marginData.value?.latest) injections._marginLatest = marginData.value.latest
    if (marginData.value?.data?.length) injections._marginData = { data: marginData.value.data }
    if (northboundData.value?.latest) {
      injections._northboundLatest = northboundData.value.latest
      injections._northboundPrev = northboundData.value.prev
      injections._northboundFrequency = northboundData.value._frequency || null
    }
    if (mainForceFlow.value?.latest) {
      injections._mainForceLatest = mainForceFlow.value.latest
      injections._mainForceSummary = mainForceFlow.value.summary
    }
    if (mainForceFlow.value?.data?.length) injections._mainForceData = mainForceFlow.value.data
    // 板块资金（个股所属行业的主力净占比）— 资金面共振的板块层输入
    if (sectorCapitalData.value?.available && sectorCapitalData.value.sector) {
      injections._sectorCapital = sectorCapitalData.value.sector
      injections._sectorIndustry = sectorCapitalData.value.industry || ''
    }
    if (shareholderData.value?.latest) {
      injections._shareholderLatest = shareholderData.value.latest
      injections._shareholderPrev = shareholderData.value.prev
      injections._shareholderData = shareholderData.value.data
      injections._shareholderFrequency = 'quarterly'
    }
    if (billboardData.value?.summary) {
      injections._billboardSummary = billboardData.value.summary
      injections._billboardLatest = billboardData.value.latest
    }
    if (holderIncreaseData.value?.summary) {
      injections._holderIncreaseSummary = holderIncreaseData.value.summary
      injections._holderIncreaseLatest = holderIncreaseData.value.latest
    }
    if (Object.keys(injections).length) {
      capitalFlow.value = { ...(capitalFlow.value || {}), ...injections }
    }
  }

  // ==================== 评分更新 ====================
  function updateScore(skipAI = false) {
    const ts = techSignals.value
    const fund = fundamental.value
    const cap = capitalFlow.value
    if (!ts.length && !fund) { scoreResult.value = null; return }
    const industry = fund?.latest?.industry || ''

    let riskItems = null
    const kl = klines.value
    if (kl.length >= 20) {
      const benchCloses = benchmarkKlines.value?.map(k => k.close) || null
      // 传完整K线对象数组（含 amount/turnover）+ fundamental（含24季度历史）+ pledgeRatio + goodwillRatio，使风险面可计算流动性/财务健康度/股权质押/商誉
      const pledgeRatio = pledgeData.value?.latest?.pledgeRatio ?? null
      const goodwillRatio = goodwillData.value?.latest?.goodwillRatio ?? null
      const riskResult = calcRiskScoreItems(kl, benchCloses, investStyle.value, fund, pledgeRatio, goodwillRatio)
      riskItems = riskResult.items
    }

    // 构造市场上下文：10年期国债收益率用于PE/PB利率调节
    const marketCtx = {
      bondYield10y: marketAnalysisStore.valuation?.bondYield10y ?? null
    }

    scoreResult.value = calculateScore(ts, fund, cap, industry, investStyle.value, riskItems, marketCtx)

    if (capitalLoadedSeq === loadSeq) {
      saveScoreSnapshot(selectedCode.value, scoreResult.value)
    }

    for (const cb of scoreReadyCallbacks) {
      cb(scoreResult.value, skipAI)
    }
  }

  // ==================== 首屏加载 ====================
  async function loadAnalysis(manual = true, skipAI = false) {
    const code = selectedCode.value
    const seq = ++loadSeq
    capitalLoadedSeq = 0

    if (!code) {
      klines.value = []
      indicators.value = {}
      techSignals.value = []
      fundamental.value = null
      analysisStore.invalidate(selectedCode.value)
      loading.value = false
      return
    }

    const cached = analysisStore.getCached(code)
    if (cached?.scoreResult && manual) {
      scoreResult.value = cached.scoreResult
    }

    if (abortCtrl) { abortCtrl.abort() }
    abortCtrl = new AbortController()
    const signal = abortCtrl.signal

    if (!loading.value) {
      loading.value = true
      error.value = ''
      klines.value = []
      indicators.value = {}
      techSignals.value = []
      fundamental.value = null
      capitalFlow.value = null
      marginData.value = null
      northboundData.value = null
      mainForceFlow.value = null
      shareholderData.value = null
      billboardData.value = null
      holderIncreaseData.value = null
      pledgeData.value = null
      goodwillData.value = null
      sectorCapitalData.value = null
    }

    try {
      const [klineRes, fundRes] = await Promise.allSettled([
        fetch(`/api/stock/${code}/kline?klt=${klinePeriod.value}&lmt=250`, { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/fundamental?code=${code}`, { signal }).then(r => r.json()),
      ])

      if (seq !== loadSeq) return

      if (klineRes.status === 'fulfilled' && klineRes.value.ok) {
        klines.value = klineRes.value.data.klines || []
        const result = calcAllIndicators(klines.value)
        indicators.value = result
        techSignals.value = result.signals || []
      }

      if (fundRes.status === 'fulfilled' && fundRes.value.ok) {
        fundamental.value = fundRes.value.data
      }

      setLoadErrors([klineRes, fundRes,
        { status: 'fulfilled', value: { ok: true } },
        { status: 'fulfilled', value: { ok: true } },
        { status: 'fulfilled', value: { ok: true } },
        { status: 'fulfilled', value: { ok: true } },
        { status: 'fulfilled', value: { ok: true } },
        { status: 'fulfilled', value: { ok: true } },
        { status: 'fulfilled', value: { ok: true } },
        { status: 'fulfilled', value: { ok: true } },
        { status: 'fulfilled', value: { ok: true } },
      ])

      loading.value = false
      // 阶段一先用技术面+基本面计算评分，阶段二资金面加载后更新
      updateScore(skipAI)
      dataTimestamp.value = new Date()
      lastRefreshTime.value = Date.now()

      loadCapitalData(code, seq, signal, skipAI)
    } catch (e) {
      if (e.name === 'AbortError') return
      error.value = '数据加载失败: ' + e.message
      loading.value = false
    }
  }

  // ==================== 资金面懒加载 ====================
  async function loadCapitalData(code, seq, signal, skipAI = false) {
    if (capitalLoadedSeq === seq) return
    capitalLoadedSeq = seq

    try {
      const [capRes, marginRes, nbRes, mfRes, scRes, shRes, bbRes, bmRes, hiRes, pgRes, gwRes] = await Promise.allSettled([
        fetch(`/api/stock-analysis/capital-flow?code=${code}`, { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/margin?code=${code}`, { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/northbound?code=${code}`, { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/main-force-flow?code=${code}`, { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/sector-capital?code=${code}`, { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/shareholder?code=${code}`, { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/billboard?code=${code}`, { signal }).then(r => r.json()),
        fetch('/api/stock-analysis/benchmark-kline?lmt=250', { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/holder-increase?code=${code}`, { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/pledge?code=${code}`, { signal }).then(r => r.json()),
        fetch(`/api/stock-analysis/goodwill?code=${code}`, { signal }).then(r => r.json()),
      ])

      if (seq !== loadSeq) return

      setLoadErrors([
        { status: 'fulfilled', value: { ok: true } },
        { status: 'fulfilled', value: { ok: true } },
        capRes, marginRes, nbRes, mfRes, shRes, bbRes, hiRes, pgRes, gwRes
      ])

      if (bmRes.status === 'fulfilled' && bmRes.value.ok) {
        benchmarkKlines.value = bmRes.value.data?.klines || null
      }
      if (capRes.status === 'fulfilled' && capRes.value.ok) {
        capitalFlow.value = capRes.value.data
      }
      if (marginRes.status === 'fulfilled' && marginRes.value.ok) {
        marginData.value = marginRes.value.data
      }
      if (nbRes.status === 'fulfilled' && nbRes.value.ok) {
        northboundData.value = nbRes.value.data
      }
      if (mfRes.status === 'fulfilled' && mfRes.value.ok) {
        mainForceFlow.value = mfRes.value.data
      }
      if (scRes.status === 'fulfilled' && scRes.value.ok) {
        sectorCapitalData.value = scRes.value.data
      }
      if (shRes.status === 'fulfilled' && shRes.value.ok) {
        shareholderData.value = shRes.value.data
      }
      if (bbRes.status === 'fulfilled' && bbRes.value.ok) {
        billboardData.value = bbRes.value.data
      }
      if (hiRes.status === 'fulfilled' && hiRes.value.ok) {
        holderIncreaseData.value = hiRes.value.data
      }
      if (pgRes.status === 'fulfilled' && pgRes.value.ok) {
        pledgeData.value = pgRes.value.data
      }
      if (gwRes.status === 'fulfilled' && gwRes.value.ok) {
        goodwillData.value = gwRes.value.data
      }

      injectCapitalExtras()
      updateScore(skipAI)
      analysisStore.setCache(code, {
        scoreResult: scoreResult.value,
        industry: fundamental.value?.latest?.industry || '',
      })
    } catch (e) {
      if (e.name === 'AbortError') return
      console.warn('资金面数据加载失败:', e.message)
      // 资金面全部失败时用已有数据兜底计算评分
      updateScore(skipAI)
    }
  }

  // ==================== 切换周期 ====================
  async function onPeriodChange(klt) {
    klinePeriod.value = klt
    const code = selectedCode.value
    const seq = ++loadSeq
    if (!code) return

    try {
      // 并行加载个股K线和基准K线（周期需匹配，否则Beta/Sharpe失真）
      const [stockRes, benchRes] = await Promise.all([
        fetch(`/api/stock/${code}/kline?klt=${klt}&lmt=250`).then(r => r.json()),
        fetch(`/api/stock-analysis/benchmark-kline?klt=${klt}&lmt=250`).then(r => r.json()).catch(() => null),
      ])
      if (seq !== loadSeq) return
      if (stockRes.ok) {
        klines.value = stockRes.data.klines || []
        const result = calcAllIndicators(klines.value)
        indicators.value = result
        techSignals.value = result.signals || []
        // 同步更新基准K线
        if (benchRes?.ok) {
          benchmarkKlines.value = benchRes.data?.klines || null
        }
        injectCapitalExtras()
        updateScore()
      }
    } catch (e) {
      error.value = 'K线加载失败: ' + e.message
    }
  }

  // ==================== 切换风格 ====================
  function onStyleChange(style) {
    if (investStyle.value === style) return
    investStyle.value = style
    updateScore()
  }

  // ==================== 切股 ====================
  function onStockChange(onClear) {
    if (abortCtrl) { abortCtrl.abort(); abortCtrl = null }

    loading.value = true
    error.value = ''
    scoreResult.value = null
    dataTimestamp.value = null

    klines.value = []
    indicators.value = {}
    techSignals.value = []
    fundamental.value = null
    capitalFlow.value = null
    marginData.value = null
    northboundData.value = null
    mainForceFlow.value = null
    shareholderData.value = null
    billboardData.value = null
    holderIncreaseData.value = null
    benchmarkKlines.value = null
    sectorCapitalData.value = null

    if (onClear) onClear()

    clearTimeout(stockChangeTimer)
    stockChangeTimer = setTimeout(() => loadAnalysis(), 200)
  }

  // ==================== 自动刷新 ====================
  function startAutoRefresh() {
    refreshTimer = setInterval(() => {
      if (!selectedCode.value || loading.value) return
      // 周末（周六/周日）不刷新，节省 API 调用
      const now = new Date()
      const dow = now.getDay()
      if (dow === 0 || dow === 6) return
      const h = now.getHours()
      const m = now.getMinutes()
      const minutes = h * 60 + m  // 当日分钟数（0-1439）

      // A股交易时段：9:15-11:30（含集合竞价）、13:00-15:30（含收盘数据更新）
      // 盘后数据最终更新窗口：15:30-16:00
      const inMorningSession = minutes >= 555 && minutes <= 690    // 9:15-11:30
      const inAfternoonSession = minutes >= 780 && minutes <= 930  // 13:00-15:30
      const inPostCloseWindow = minutes > 930 && minutes <= 960    // 15:30-16:00

      if (inMorningSession || inAfternoonSession) {
        // 交易时段：每3分钟刷新
        loadAnalysis(false, true)
      } else if (inPostCloseWindow) {
        // 盘后数据更新窗口：每3分钟刷新
        loadAnalysis(false, true)
      } else if (h >= 16 || (h === 15 && m >= 30)) {
        // 盘后（16:00之后）：每30分钟刷新一次，捕获晚间公告/数据修订
        if (!lastRefreshTime.value || Date.now() - lastRefreshTime.value > 30 * 60 * 1000) {
          lastRefreshTime.value = Date.now()
          loadAnalysis(false, true)
        }
      }
      // 其他时段（0:00-9:15、11:30-13:00、16:00-24:00 非盘后窗口）：不刷新
    }, 3 * 60 * 1000)
  }

  function cleanup() {
    clearTimeout(stockChangeTimer)
    clearInterval(refreshTimer)
    if (abortCtrl) { abortCtrl.abort(); abortCtrl = null }
  }

  return {
    klines, indicators, techSignals, fundamental, capitalFlow,
    marginData, northboundData, mainForceFlow, sectorCapitalData, shareholderData, billboardData, holderIncreaseData,
    benchmarkKlines, klinePeriod,
    loading, error, loadErrors, dataTimestamp, lastRefreshTime,
    scoreResult,
    loadAnalysis, onStockChange, onPeriodChange, onStyleChange,
    onScoreReady, startAutoRefresh, cleanup,
  }
}
