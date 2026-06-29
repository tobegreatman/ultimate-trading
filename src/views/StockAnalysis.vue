<template>
  <div class="stock-analysis">
    <!-- 顶部：股票选择 + 基本信息 -->
    <div class="header">
      <div class="stock-info" v-if="currentStock">
        <span class="stock-name">{{ currentStock.name }}</span>
        <span class="stock-code">{{ currentStock.code }}</span>
        <span v-if="currentQuote" class="stock-price" :class="priceClass">
          ¥{{ formatPrice(currentQuote.close) }}
          <span class="stock-change">{{ formatChange(currentQuote.change, currentQuote.changeAmt) }}</span>
          <span v-if="industryLabel" class="stock-industry">{{ industryLabel }}</span>
        </span>
      </div>
      <div class="stock-selector">
        <select v-model="selectedCode" class="stock-select" @change="handleStockChange">
          <option value="">选择股票</option>
          <option v-for="s in watchlistStore.stocks" :key="s.code" :value="s.code">{{ s.name }} ({{ s.code }})</option>
        </select>
        <div class="search-box">
          <input type="search" class="search-input" v-model="searchKw" @input="onSearchInput" @focus="showSearchDrop = true" @compositionstart="isComposing = true" @compositionend="onCompositionEnd" placeholder="搜索代码或名称" />
          <div v-if="showSearchDrop && searchResults.length" class="search-dropdown">
            <div v-for="r in searchResults" :key="r.code" class="search-item" @click="onSearchSelect(r)">
              <span class="si-name">{{ r.name }}</span>
              <span class="si-code">{{ r.code }}</span>
            </div>
          </div>
          <div v-if="showSearchDrop && searchKw && !searchResults.length && !searchLoading" class="search-dropdown">
            <div class="search-empty">无搜索结果</div>
          </div>
        </div>
        <div v-if="showSearchDrop" class="search-backdrop" @click="showSearchDrop = false" />
        <button v-if="currentStock" class="refresh-btn" :disabled="loading" @click="loadAnalysis" title="刷新数据">&#x21bb;</button>
        <span v-if="dataTimestamp && !loading" class="data-time">数据更新于 {{ formatTime(dataTimestamp) }}</span>
      </div>
    </div>

    <!-- 加载/错误状态 -->
    <div v-if="loading" class="loading-skeleton">
      <div class="skeleton-row">
        <div class="skeleton-card" />
        <div class="skeleton-card" />
        <div class="skeleton-card" />
        <div class="skeleton-card" />
      </div>
      <div class="skeleton-tabs" />
      <div class="skeleton-chart" />
    </div>
    <div v-if="error" class="error">
        <span>{{ error }}</span>
        <button class="retry-btn" @click="loadAnalysis">重新加载</button>
      </div>

    <template v-if="!loading && !error && currentStock">
      <!-- 诊断区：风格切换 + 诊断卡片并排 -->
      <div class="diagnosis-row">
        <div class="diagnosis-cards">
        <div class="diag-card" :style="{ borderColor: scoreResult?.suggestionColor || 'var(--border)' }">
          <div class="diag-label">综合评分</div>
          <div class="diag-value">{{ scoreResult?.total ?? '--' }}</div>
          <div class="diag-sub" :style="{ color: scoreResult?.suggestionColor }">{{ scoreResult?.suggestion ?? '--' }}</div>
        </div>
        <div class="diag-card clickable" @click="activeTab = 'technical'">
          <div class="diag-label">趋势</div>
          <div class="diag-value" :style="{ color: trendConclusion.color }">{{ trendConclusion.icon }} {{ trendConclusion.text }}</div>
        </div>
        <div class="diag-card clickable" @click="activeTab = 'fundamental'">
          <div class="diag-label">估值</div>
          <div class="diag-value" :style="{ color: valuationConclusion.color }">{{ valuationConclusion.icon }} {{ valuationConclusion.text }}</div>
        </div>
        <div class="diag-card clickable" @click="activeTab = 'capital'">
          <div class="diag-label">资金</div>
          <div class="diag-value" :style="{ color: capitalConclusion.color }">{{ capitalConclusion.icon }} {{ capitalConclusion.text }}</div>
        </div>
      </div>
        <div class="tabs">
          <button v-for="tab in tabs" :key="tab.key" :class="['tab-btn', { active: activeTab === tab.key }]" @click="activeTab = tab.key">
            {{ tab.label }}
            <span v-if="tabErrors[tab.key]" class="tab-err-dot" />
          </button>
        </div>
        <div class="style-switcher">
          <button v-for="st in styleOptions" :key="st.key" :class="['style-btn', { active: investStyle === st.key }]" @click="onStyleChange(st.key)" :title="st.hint">{{ st.label }}</button>
        </div>
      </div>

      <!-- 策略执行计划（仅从 Dashboard 策略选股入口进入时显示） -->
      <!-- 不推荐买入 -->
      <div v-if="strategyGuide?.notRecommended" class="strategy-guide invalid">
        <div class="sg-header">
          <span class="sg-title" :style="{ color: strategyGuide.qualityColor }">{{ strategyGuide.strategyName }}（{{ strategyGuide.qualityLabel }}）</span>
        </div>
        <div class="sg-body-compact">
          <p class="sg-reason">{{ strategyGuide.reason }}</p>
          <p class="sg-hint">建议等待趋势企稳或资金面改善后再关注</p>
        </div>
      </div>
      <!-- 正常策略卡（含质量标签和仓位调整） -->
      <div v-else-if="strategyGuide" class="strategy-guide" :class="[strategyGuide.statusClass, strategyGuide.quality]">
        <div class="sg-header">
          <span class="sg-title">{{ strategyGuide.strategyName }}</span>
          <span class="sg-quality" :style="{ color: strategyGuide.qualityColor }">{{ strategyGuide.qualityLabel }}</span>
          <span class="sg-risk" :class="'risk-' + strategyGuide.riskLevel">{{ strategyGuide.riskLevel }}风险</span>
          <span class="sg-atr">ATR {{ strategyGuide.currentATR.toFixed(2) }}</span>
        </div>
        <div class="sg-body">
          <div class="sg-col sg-col-entry">
            <div class="sg-col-label">入场位</div>
            <div class="sg-col-price">¥{{ strategyGuide.entryPrice.toFixed(2) }}</div>
            <div class="sg-col-desc">{{ strategyGuide.entryDesc }}</div>
          </div>
          <div class="sg-col sg-col-stop">
            <div class="sg-col-label">止损位</div>
            <div class="sg-col-price">¥{{ strategyGuide.stopPrice.toFixed(2) }}</div>
            <div class="sg-col-desc">-{{ strategyGuide.atrN }}×ATR</div>
          </div>
          <div class="sg-col sg-col-trail">
            <div class="sg-col-label">跟踪止盈</div>
            <div class="sg-col-price">¥{{ strategyGuide.trailStart.toFixed(2) }}</div>
            <div class="sg-col-desc">+{{ strategyGuide.trailAtrN }}×ATR 跟踪</div>
          </div>
        </div>
        <div class="sg-meta">
          <div class="sg-meta-row">
            <span class="sg-meta-label">仓位上限</span>
            <span class="sg-meta-val">
              {{ (strategyGuide.maxPosition * 100).toFixed(0) }}%
              <span v-if="strategyGuide.positionScale < 1" class="sg-meta-note">（已按信号质量调整，原 {{ (strategyGuide.originalPosition * 100).toFixed(0) }}%）</span>
            </span>
          </div>
          <div class="sg-meta-divider"></div>
          <div class="sg-meta-row">
            <span class="sg-meta-label">持仓周期</span>
            <span class="sg-meta-val">{{ strategyGuide.holdPeriod }}</span>
          </div>
          <div class="sg-meta-divider"></div>
          <div class="sg-meta-row">
            <span class="sg-meta-label">时间止损</span>
            <span class="sg-meta-val">{{ strategyGuide.timeStop }}</span>
          </div>
          <template v-if="strategyGuide.historyStats">
            <div class="sg-meta-divider"></div>
            <div class="sg-meta-row">
              <span class="sg-meta-label">历史胜率</span>
              <span class="sg-meta-val" :style="{ color: strategyGuide.historyStats.winRate >= 50 ? '#30d158' : '#ff9500' }">
                {{ strategyGuide.historyStats.winRate }}%（{{ strategyGuide.historyStats.count }}笔）
              </span>
            </div>
          </template>
        </div>
        <div class="sg-footer">
          <span class="sg-distance">当前 ¥{{ strategyGuide.price.toFixed(2) }}　距入场 {{ strategyGuide.distPct > 0 ? '+' : '' }}{{ strategyGuide.distPct }}%</span>
          <span class="sg-status">{{ strategyGuide.statusText }}</span>
          <button class="sg-add-btn" @click="addToJournal" :disabled="alreadyOpened">+ 建仓</button>
        </div>
        <div v-if="addToast" class="sg-toast">{{ addToast }}</div>
      </div>

      <!-- 分项加载失败提示 -->
      <div v-if="hasLoadErrors" class="partial-error">
        部分数据加载失败：<span v-for="(label, key) in errorLabels" :key="key">{{ label }} </span>
      </div>

      <!-- Tab 内容 -->
      <div class="tab-content">
        <KeepAlive :max="4">
          <TechnicalPanel
            v-if="activeTab === 'technical'"
            :klines="klines"
            :indicators="indicators"
            :signals="techSignals"
            :active-period="klinePeriod"
            @period-change="onPeriodChange"
          />
          <FundamentalPanel
            v-else-if="activeTab === 'fundamental'"
            :fundamental="fundamental"
          />
          <CapitalFlowPanel
            v-else-if="activeTab === 'capital'"
            :capital-flow="capitalFlow"
            :margin-data="marginData"
            :northbound-data="northboundData"
            :main-force-flow="mainForceFlow"
            :sector-capital="sectorCapitalData"
            :shareholder-data="shareholderData"
          />
          <ScorePanel
            v-else
            :key="selectedCode"
            :score-result="scoreResult"
            :ai-judge-text="aiJudgeText"
            :ai-judge-loading="aiJudgeLoading"
            :ai-judge-error="aiJudgeError"
            :ai-judge-enabled="aiJudgeEnabled"
            :ai-model="aiModel"
            :stock-code="selectedCode"
            :industry="industryLabel"
            @toggle-ai="toggleAIJudge"
            @change-model="onModelChange"
          />
        </KeepAlive>
      </div>
    </template>

    <!-- 无股票选择提示 -->
    <div v-if="!currentStock && !loading" class="empty-state">
      <p>请从股票池中选择一只股票进行分析</p>
      <p v-if="!watchlistStore.stocks.length" class="empty-hint">股票池为空，请先在 Watchlist 页面添加自选股</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useWatchlistStore } from '../stores/watchlist.js'
import { REFRESH_INTERVAL } from '../utils/constants.js'
import { fetchAIJudge } from '../utils/aiJudge.js'
import TechnicalPanel from '../components/analysis/TechnicalPanel.vue'
import FundamentalPanel from '../components/analysis/FundamentalPanel.vue'
import CapitalFlowPanel from '../components/analysis/CapitalFlowPanel.vue'
import ScorePanel from '../components/analysis/ScorePanel.vue'
import { useStockData } from '../composables/useStockData.js'
import { useStrategyGuide } from '../composables/useStrategyGuide.js'
import { getCapitalResonance } from '../utils/scoring.js'

const watchlistStore = useWatchlistStore()

const route = useRoute()

// ==================== UI 状态 ====================
const selectedCode = ref('')
const activeTab = ref('score')
const investStyle = ref('short')

// ==================== Composable: 数据层 ====================
const {
  klines, indicators, techSignals, fundamental, capitalFlow,
  marginData, northboundData, mainForceFlow, sectorCapitalData, shareholderData,
  benchmarkKlines, klinePeriod,
  loading, error, loadErrors, dataTimestamp, lastRefreshTime,
  scoreResult,
  loadAnalysis, onStockChange, onPeriodChange, onStyleChange,
  onScoreReady, startAutoRefresh, cleanup: cleanupStockData,
} = useStockData(selectedCode, investStyle)

const styleOptions = [
  { key: 'short', label: '短线', hint: '技术 33% / 资金 38% / 基本面 14% / 风险 15%' },
  { key: 'mid', label: '中线', hint: '技术 28% / 资金 30% / 基本面 26% / 风险 16%' },
  { key: 'long', label: '长线', hint: '基本面 38% / 风险 20% / 资金 22% / 技术 20%' },
]

const tabs = [
  { key: 'score', label: '综合评分' },
  { key: 'technical', label: '技术面' },
  { key: 'fundamental', label: '基本面' },
  { key: 'capital', label: '资金面' },
]

// 资金面共振标签（显示在 tab 标题后）
const capitalResonance = computed(() => getCapitalResonance(capitalFlow.value))
const capitalResonanceChipClass = computed(() => {
  const l = capitalResonance.value.label
  if (!l) return ''
  if (l.includes('多头')) return 'chip-bull'
  if (l.includes('空头')) return 'chip-bear'
  return 'chip-warn'
})

const searchKw = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
const showSearchDrop = ref(false)
let searchTimer = null
let isComposing = false

const currentStock = computed(() => {
  if (!selectedCode.value) return null
  return watchlistStore.stocks.find(s => s.code === selectedCode.value) || { code: selectedCode.value, name: selectedCode.value }
})

const currentQuote = computed(() => {
  if (!selectedCode.value) return null
  return watchlistStore.quotes[selectedCode.value] || null
})

const priceClass = computed(() => {
  const chg = currentQuote.value?.change
  if (chg > 0) return 'price-up'
  if (chg < 0) return 'price-down'
  return ''
})

// ==================== Composable: 策略层 ====================
const routeStrategy = computed(() => route.query.strategy || null)
const routeMarketStatus = computed(() => route.query.marketStatus || null)

const {
  strategyGuide, alreadyOpened, addToast, addToJournal,
  trendConclusion, valuationConclusion, capitalConclusion,
} = useStrategyGuide({
  selectedCode, currentStock, klines, indicators, techSignals,
  fundamental, capitalFlow, scoreResult, routeStrategy, routeMarketStatus,
})

// ==================== AI 判断 ====================
const aiJudgeText = ref('')
const aiJudgeLoading = ref(false)
const aiJudgeError = ref('')
const aiJudgeEnabled = ref(false)
const aiModel = ref('glm-4.7-flash')
let aiAbortController = null
let aiDelayTimer = null

// ==================== AI 判断回调 ====================

onScoreReady((sr, skipAI) => {
  if (!skipAI && aiJudgeEnabled.value && sr) {
    clearTimeout(aiDelayTimer)
    aiDelayTimer = setTimeout(() => nextTick(() => triggerAIJudge()), 2000)
  }
})

function toggleAIJudge() {
  aiJudgeEnabled.value = !aiJudgeEnabled.value
  if (aiJudgeEnabled.value && scoreResult.value) {
    // 开启时立即触发一次
    clearTimeout(aiDelayTimer)
    aiDelayTimer = setTimeout(() => nextTick(() => triggerAIJudge()), 500)
  } else {
    // 关闭时清空
    aiJudgeText.value = ''
    aiJudgeError.value = ''
    if (aiAbortController) { aiAbortController.abort(); aiAbortController = null }
    aiJudgeLoading.value = false
  }
}

function onModelChange(model) {
  if (model === aiModel.value) return
  aiModel.value = model
  // 切换模型后立即重新生成（仅在 AI 已开启时）
  if (aiJudgeEnabled.value && scoreResult.value) {
    clearTimeout(aiDelayTimer)
    aiDelayTimer = setTimeout(() => nextTick(() => triggerAIJudge()), 200)
  }
}

function triggerAIJudge() {
  if (aiAbortController) { aiAbortController.abort(); aiAbortController = null }

  const sr = scoreResult.value
  const ts = techSignals.value
  const fund = fundamental.value
  const kl = klines.value
  if (!sr || !kl.length) return

  const stock = currentStock.value
  const bullishCount = ts.filter(s => s.type === 'bullish').length
  const bearishCount = ts.filter(s => s.type === 'bearish').length
  const keySignals = ts.slice(0, 5).map(s => s.text).join('；')

  const latest = fund?.latest
  const fundSummary = latest ? {
    pe: latest.pe, pb: latest.pb, roe: latest.roe,
    grossMargin: latest.grossMargin, netMargin: latest.netMargin,
    revenueGrowth: latest.revenueGrowth, profitGrowth: latest.profitGrowth,
    debtRatio: latest.debtRatio, industry: latest.industry,
    ocfPerShare: latest.ocfPerShare,
  } : null

  const capitalDetails = sr.details.filter(d => d.dimension === '资金面')
  const mainForceDetail = capitalDetails.find(d => d.name === '主力资金')
  const marginDetail = capitalDetails.find(d => d.name === '融资融券')
  const volDetail = capitalDetails.find(d => d.name === '量价趋势')

  const latestClose = kl[kl.length - 1]?.close
  const close5 = kl.length >= 5 ? kl[kl.length - 5].close : null
  const close20 = kl.length >= 20 ? kl[kl.length - 20].close : null
  const change5d = close5 ? ((latestClose - close5) / close5 * 100).toFixed(2) : null
  const change20d = close20 ? ((latestClose - close20) / close20 * 100).toFixed(2) : null

  // 趋势阶段判断：从 MA 排列 + 价格偏离 + MACD 方向提取
  const ind = indicators.value
  const maArr = ind?.ma || {}
  const len = kl.length
  const trendContext = (() => {
    const ma5 = maArr[5]?.[len - 1]
    const ma10 = maArr[10]?.[len - 1]
    const ma20 = maArr[20]?.[len - 1]
    const ma60 = maArr[60]?.[len - 1]
    if (!ma5 || !ma20) return null
    const price = latestClose
    const aboveMa5 = price > ma5
    const aboveMa20 = price > ma20
    const aboveMa60 = ma60 ? price > ma60 : null
    const maAlign = ma5 > ma10 && ma10 > ma20
    const maDeadCross = ma5 < ma10 && ma10 < ma20
    const macdHist = ind?.macd?.histogram || []
    const lastHist = macdHist[len - 1] || 0
    const prevHist = macdHist[len - 2] || 0
    const macdDirection = lastHist > prevHist ? '柱线扩大' : lastHist > 0 ? '柱线缩小' : lastHist < prevHist ? '绿柱扩大' : '绿柱缩小'

    let stage = '盘整'
    if (maAlign && aboveMa5) stage = '上升趋势'
    else if (maDeadCross && !aboveMa5) stage = '下降趋势'
    else if (aboveMa20 && !aboveMa5) stage = '上升回调'
    else if (!aboveMa20 && aboveMa5) stage = '超跌反弹'

    const deviation20 = ((price - ma20) / ma20 * 100).toFixed(1)
    const deviation60 = ma60 ? ((price - ma60) / ma60 * 100).toFixed(1) : null
    // ATR 用于波动率约束（止损位宽度参考）
    const atrArr = ind?.atr || []
    const atrValue = atrArr[len - 1] ?? null
    const atrPct = atrValue && price ? +(atrValue / price * 100).toFixed(2) : null

    // 预计算候选价位：AI 无需自己算数学，只能从这些值中选择/引用
    // 目的：彻底消除"突破低于现价的价位""止损过紧"等数学错误
    const candidates = (() => {
      if (!price || !atrValue) return null
      const stop1atr = +(price - atrValue).toFixed(2)       // 1×ATR 止损
      const stop15atr = +(price - 1.5 * atrValue).toFixed(2) // 1.5×ATR 止损
      const stop2atr = +(price - 2 * atrValue).toFixed(2)    // 2×ATR 止损
      const tgt2atr = +(price + 2 * atrValue).toFixed(2)     // 2×ATR 目标
      const tgt3atr = +(price + 3 * atrValue).toFixed(2)     // 3×ATR 目标
      return {
        stop1atr, stop15atr, stop2atr,
        tgt2atr, tgt3atr,
        ma5: +ma5.toFixed(2), ma20: +ma20.toFixed(2),
        ma60: ma60 ? +ma60.toFixed(2) : null,
        latestClose: +price.toFixed(2),
      }
    })()

    return {
      stage, deviation20, deviation60, maAlign, maDeadCross, macdDirection, aboveMa5, aboveMa20, aboveMa60,
      ma5Price: +ma5.toFixed(2), ma20Price: +ma20.toFixed(2), ma60Price: ma60 ? +ma60.toFixed(2) : null,
      atrValue: atrValue ? +atrValue.toFixed(2) : null, atrPct,
      candidates,
    }
  })()

  const payload = {
    code: stock?.code || selectedCode.value,
    name: stock?.name || '',
    model: aiModel.value,
    scoreSummary: {
      total: sr.total,
      suggestion: sr.suggestion,
      confidence: sr.confidence,
      dimensions: sr.dimensions,
    },
    techSummary: {
      bullishCount, bearishCount, keySignals,
      score: sr.dimensions.technical.score,
      max: sr.dimensions.technical.max,
      details: (sr.details || []).filter(d => d.dimension === '技术面').map(d => `${d.name}${d.desc}`),
    },
    fundSummary,
    capitalSummary: {
      score: sr.dimensions.capital.score,
      max: sr.dimensions.capital.max,
      mainForceDesc: mainForceDetail?.desc,
      marginDesc: marginDetail?.desc,
      priceVolumeSignal: volDetail?.desc,
    },
    riskSummary: {
      score: sr.dimensions.risk?.score,
      max: sr.dimensions.risk?.max,
      details: (sr.details || []).filter(d => d.dimension === '风险面').map(d => `${d.name}${d.desc}`),
    },
    priceAction: { latestClose, change5d, change20d },
    trendContext,
    previousAdvice: aiJudgeText.value ? aiJudgeText.value.slice(-200) : null,
  }

  aiJudgeText.value = ''
  aiJudgeError.value = ''
  aiJudgeLoading.value = true

  aiAbortController = fetchAIJudge(payload, {
    onText: (chunk) => { aiJudgeText.value += chunk },
    onDone: () => { aiJudgeLoading.value = false },
    onError: (msg) => {
      aiJudgeError.value = msg || 'AI 分析暂时不可用'
      aiJudgeLoading.value = false
    },
  })
}

// ==================== 行业标签 ====================
const industryLabel = computed(() => {
  const ind = fundamental.value?.latest?.industry
  return ind || ''
})

function formatPrice(v) {
  if (v == null) return '--'
  return Number(v).toFixed(2)
}

function formatTime(d) {
  if (!d) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const errorNameMap = { kline: 'K线', fundamental: '基本面', capitalFlow: '资金面', margin: '融资融券', northbound: '北向资金', mainForce: '主力资金', shareholder: '股东户数', billboard: '龙虎榜' }
const tabErrorMap = { technical: 'kline', fundamental: 'fundamental', capital: ['capitalFlow', 'margin', 'northbound', 'mainForce', 'shareholder', 'billboard'], score: [] }

const hasLoadErrors = computed(() => Object.keys(loadErrors.value).length > 0)
const errorLabels = computed(() => {
  const labels = {}
  for (const key of Object.keys(loadErrors.value)) {
    labels[key] = errorNameMap[key] || key
  }
  return labels
})
const tabErrors = computed(() => {
  const t = {}
  for (const [tab, keys] of Object.entries(tabErrorMap)) {
    t[tab] = Array.isArray(keys) ? keys.some(k => loadErrors.value[k]) : !!loadErrors.value[keys]
  }
  return t
})

function formatChange(pct, amt) {
  if (pct == null) return '--'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

// ==================== 搜索 ====================

function onSearchInput() {
  if (isComposing) return
  clearTimeout(searchTimer)
  const kw = searchKw.value.trim()
  if (!kw) { searchResults.value = []; return }
  searchLoading.value = true
  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/stock/search?kw=${encodeURIComponent(kw)}`)
      const json = await res.json()
      searchResults.value = json.ok ? (json.data || []).slice(0, 8) : []
    } catch { searchResults.value = [] }
    searchLoading.value = false
  }, 500)
}

function onCompositionEnd() {
  isComposing = false
  onSearchInput()
}

function onSearchSelect(item) {
  showSearchDrop.value = false
  searchKw.value = ''
  searchResults.value = []
  // 自动加入自选（如未添加）
  if (!watchlistStore.stocks.find(s => s.code === item.code)) {
    watchlistStore.addStock(item.code, item.name, route.query.strategy || null)
    watchlistStore.fetchQuotes()
  }
  selectedCode.value = item.code
  handleStockChange()
}

// ==================== 切股包装（清理 AI 状态 + 委托 composable） ====================
function handleStockChange() {
  onStockChange(() => {
    aiJudgeText.value = ''
    aiJudgeError.value = ''
    aiJudgeEnabled.value = false
    aiJudgeLoading.value = false
    clearTimeout(aiDelayTimer)
    if (aiAbortController) { aiAbortController.abort(); aiAbortController = null }
  })
}

// 监听路由 query 变化，支持从自选列表等跳转
watch(() => route.query.code, (newCode) => {
  if (newCode && newCode !== selectedCode.value) {
    selectedCode.value = newCode
    handleStockChange()
  }
})

onMounted(() => {
  const qCode = route.query.code
  if (qCode) {
    selectedCode.value = qCode
  } else if (watchlistStore.stocks.length) {
    selectedCode.value = watchlistStore.stocks[0].code
  }

  if (selectedCode.value) {
    loadAnalysis()
    if (!watchlistStore.codes.length) {
      watchlistStore.fetchQuotes()
    }
  }

  watchlistStore.startAutoRefresh(REFRESH_INTERVAL)
  startAutoRefresh()
})

onBeforeUnmount(() => {
  watchlistStore.stopAutoRefresh()
  clearTimeout(searchTimer)
  clearTimeout(aiDelayTimer)
  cleanupStockData()
  if (aiAbortController) { aiAbortController.abort(); aiAbortController = null }
})
</script>

<style scoped>
.stock-analysis {
  max-width: 1460px;
  margin: 0 auto;
  padding: 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部 */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.stock-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.stock-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.stock-code {
  font-size: 13px;
  color: var(--text-muted);
}

.stock-price {
  font-size: 18px;
  font-weight: 600;
}

.stock-price.price-up { color: var(--red); }
.stock-price.price-down { color: var(--green); }

.stock-change {
  font-size: 13px;
  font-weight: 500;
}

.stock-industry {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-surface);
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  margin-left: 6px;
  vertical-align: middle;
}

.stock-select {
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--glass-border);
  background: var(--bg-surface);
  backdrop-filter: blur(16px) saturate(1.5);
  -webkit-backdrop-filter: blur(16px) saturate(1.5);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  min-width: 180px;
}

/* 原生 <option> 默认白底黑字，与深色风格不搭，强制深色 */
.stock-select option {
  background: #1e293b;
  color: var(--text-primary);
}

.stock-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}

.stock-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.style-switcher {
  display: flex;
  gap: 2px;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  padding: 2px 8px;
  border: 1px solid var(--border);
}

.style-btn {
  padding: 5px 10px;
  width: 45px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.style-btn:hover {
  color: var(--text-secondary);
}

.style-btn.active {
  background: var(--accent-dim);
  color: var(--accent);
}

/* 搜索框 */
.search-box {
  position: relative;
}

.search-input {
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  width: 150px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  min-width: 200px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

.search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.search-item:hover {
  background: var(--bg-surface-alt);
}

.si-name {
  font-size: 13px;
  color: var(--text-primary);
}

.si-code {
  font-size: 12px;
  color: var(--text-muted);
}

.search-empty {
  padding: 12px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.refresh-btn {
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1;
}

.refresh-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.data-time {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.partial-error {
  padding: 6px 12px;
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.tab-err-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #ff9500;
  border-radius: 50%;
  margin-left: 4px;
  vertical-align: middle;
}

.retry-btn {
  margin-left: 12px;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--red);
  background: transparent;
  color: var(--red);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn:hover {
  background: var(--red);
  color: #fff;
}

/* 诊断区：风格切换 + 诊断卡片并排 */
.diagnosis-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 诊断卡片 */
.diagnosis-cards {
  display: flex;
  gap: 10px;
}

.diag-card {
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  padding: 3px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  transition: border-color 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}

.diag-card.clickable {
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, transform 0.15s;
}

.diag-card.clickable:hover {
  border-color: var(--accent);
  background: rgba(0, 113, 227, 0.06);
  transform: translateY(-1px);
}

.diag-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.diag-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}

.diag-sub {
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}

/* 策略执行计划 */
.strategy-guide {
  margin-top: 10px;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: 12px 16px;
  border-left: 3px solid var(--border);
}
.strategy-guide.waiting { border-left-color: #ffd60a; }
.strategy-guide.ready   { border-left-color: #30d158; }
.strategy-guide.passed  { border-left-color: #8e8e93; }
.strategy-guide.broken  { border-left-color: #ff453a; }

/* 信号质量等级 */
.strategy-guide.strong  { border-left-color: #30d158; }
.strategy-guide.moderate { border-left-color: #ffd60a; }
.strategy-guide.weak    { border-left-color: #ff9500; }
.strategy-guide.invalid { border-left-color: #ff453a; background: rgba(255,69,58,0.05); }

/* 头部：策略名 | 风险标签 | ATR值 */
.sg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.sg-title {
  font-size: 14px;
  font-weight: 700;
}
.sg-risk {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(255,255,255,0.06);
  font-weight: 500;
}
.sg-risk.risk-低-中 { color: #30d158; }
.sg-risk.risk-中     { color: #ffd60a; }
.sg-risk.risk-高     { color: #ff453a; }
.sg-atr {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* 三列：入场 / 止损 / 跟踪止盈 */
.sg-body {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  background: rgba(0,0,0,0.15);
  border-radius: 6px;
  overflow: hidden;
}
.sg-col {
  padding: 10px 12px;
  text-align: center;
}
.sg-col-entry { border-right: 1px solid var(--border); }
.sg-col-stop  { border-right: 1px solid var(--border); }
.sg-col-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.sg-col-price {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-bottom: 2px;
}
.sg-col-stop .sg-col-price { color: #ff453a; }
.sg-col-desc {
  font-size: 11px;
  color: var(--text-muted);
}

/* 元信息行：仓位 | 周期 | 时间止损 */
.sg-meta {
  display: flex;
  align-items: center;
  margin-top: 10px;
  font-size: 12px;
}
.sg-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sg-meta-label { color: var(--text-muted); }
.sg-meta-val   { color: var(--text-secondary); font-weight: 500; }
.sg-meta-divider {
  width: 1px;
  height: 12px;
  background: var(--border);
  margin: 0 12px;
}

/* 底部：距离 + 状态 */
.sg-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}
.sg-distance { font-variant-numeric: tabular-nums; }
.sg-status {
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
}
.strategy-guide.ready .sg-status    { background: rgba(48,209,88,0.15); color: #30d158; }
.strategy-guide.waiting .sg-status  { background: rgba(255,214,10,0.15); color: #ffd60a; }
.strategy-guide.passed .sg-status   { background: rgba(142,142,147,0.15); color: #8e8e93; }
.strategy-guide.broken .sg-status   { background: rgba(255,69,58,0.15); color: #ff453a; }

/* 质量标签 */
.sg-quality { font-size: 12px; font-weight: 600; }

/* 仓位调整说明 */
.sg-meta-note { font-size: 11px; color: var(--text-muted); }

/* 不推荐卡片 */
.sg-body-compact { padding: 12px; text-align: left; }
.sg-reason { color: var(--text-secondary); font-size: 13px; margin: 0 0 6px; }
.sg-hint { color: var(--text-muted); font-size: 12px; margin: 0; }

/* 建仓按钮 */
.sg-add-btn {
  margin-left: auto;
  padding: 3px 12px;
  border-radius: 4px;
  border: 1px solid #30d158;
  background: transparent;
  color: #30d158;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.sg-add-btn:hover { background: rgba(48,209,88,0.15); }
.sg-add-btn:active { background: rgba(48,209,88,0.25); }
.sg-add-btn:disabled { opacity: 0.3; cursor: default; border-color: #8e8e93; color: #8e8e93; }

/* Toast */
.sg-toast {
  margin-top: 8px;
  padding: 6px 12px;
  background: rgba(48,209,88,0.15);
  color: #30d158;
  font-size: 12px;
  border-radius: 4px;
  text-align: center;
  animation: sg-toast-in 0.2s ease;
}
@keyframes sg-toast-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Tabs */
.tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  margin-left: auto;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  padding: 2px;
  overflow-x: auto;
  min-width: 0;
}

.tab-btn {
  flex: 1;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #fff;
  box-shadow: var(--glass-glow);
}

.diag-resonance-chip {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  font-size: 10px;
  font-weight: 600;
  margin-left: 4px;
  vertical-align: middle;
  line-height: 1.4;
}
.diag-resonance-chip.chip-bull { background: var(--green-dim); color: var(--green); }
.diag-resonance-chip.chip-bear { background: var(--red-dim); color: var(--red); }
.diag-resonance-chip.chip-warn { background: rgba(255, 149, 0, 0.14); color: #ff9500; }

/* 骨架屏 */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skeleton-row {
  display: flex;
  gap: 10px;
}

.skeleton-card {
  flex: 1;
  height: 36px;
  background: linear-gradient(90deg, var(--bg-surface) 25%, rgba(255,255,255,0.06) 50%, var(--bg-surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.skeleton-tabs {
  height: 42px;
  background: linear-gradient(90deg, var(--bg-surface) 25%, rgba(255,255,255,0.06) 50%, var(--bg-surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

.skeleton-chart {
  height: 520px;
  background: linear-gradient(90deg, var(--bg-surface) 25%, rgba(255,255,255,0.06) 50%, var(--bg-surface) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
}

.error {
  padding: 12px;
  background: var(--red-dim);
  color: var(--red);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.empty-state {
  text-align: center;
  padding: 60px 0;
  color: var(--text-muted);
}

.empty-hint {
  font-size: 13px;
  margin-top: 8px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .stock-analysis {
    padding: 60px 12px 12px;
  }

  .diagnosis-cards {
    overflow-x: auto;
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .skeleton-chart {
    height: 400px;
  }
}
</style>
