<template>
  <div class="watchlist">
    <!-- Top: Index intraday mini charts -->
    <section class="index-bar">
      <div v-for="(item, key) in indexIntraday" :key="key" class="index-bar__card">
        <div class="idx-header">
          <span class="idx-name">{{ item.name }}</span>
          <span class="idx-price">{{ item.close?.toFixed(2) || '--' }}</span>
          <span class="idx-change" :class="item.isUp ? 'up' : 'down'">
            {{ item.change >= 0 ? '+' : '' }}{{ item.change?.toFixed(2) || '--' }}%
          </span>
        </div>
        <div class="idx-chart">
          <Sparkline
            v-if="item.trends.length"
            :data="item.trends"
            :positive="item.isUp"
            :show-area="true"
            :ref-price="item.preClose"
            :auto-width="true"
            :height="68"
            :total-slots="240"
          />
        </div>
      </div>
    </section>

    <!-- Main split layout -->
    <div class="split-layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <!-- Normal mode: search + batch entry -->
        <div v-if="!batchMode" class="sidebar-header">
          <div class="search-box">
            <input
              v-model="searchKw"
              type="search"
              placeholder="搜索代码、名称或拼音"
              @input="onSearchInput"
              @focus="showSearch = true"
            />
            <div v-if="showSearch && searchResults.length" class="search-dropdown">
              <div
                v-for="r in searchResults"
                :key="r.code"
                class="search-item"
                @click="addFromSearch(r)"
              >
                <span class="search-item__name">{{ r.name }}</span>
                <span class="search-item__code">{{ r.code }}</span>
              </div>
            </div>
          </div>
          <button
            v-if="watchlistStore.stocks.length >= 2"
            class="btn btn-ghost btn-sm batch-entry-btn"
            @click="enterBatchMode"
          >批量管理</button>
        </div>

        <!-- Batch mode toolbar -->
        <div v-else class="batch-toolbar">
          <button class="btn btn-ghost btn-sm" @click="toggleSelectAll">
            {{ allSelected ? '取消全选' : '全选' }}
          </button>
          <span class="batch-count">已选 {{ batchSelected.length }} 项</span>
          <button
            class="btn btn-danger btn-sm"
            :disabled="!batchSelected.length"
            @click="deleteBatch"
          >删除</button>
          <button class="btn btn-ghost btn-sm" @click="exitBatchMode">取消</button>
        </div>

        <!-- Watchlist -->
        <div class="stock-list" :class="{ 'batch-mode': batchMode }">
          <div v-if="!watchlistStore.stocks.length" class="empty-hint">
            搜索并添加自选股
          </div>
          <template v-for="(stock, idx) in watchlistStore.stocks" :key="stock.code">
            <div
              class="stock-item"
              :class="{
                active: !batchMode && selectedCode === stock.code,
                dragging: !batchMode && dragIdx === idx,
                'drag-over': !batchMode && dragOverIdx === idx,
                pinned: stock.pinned,
                'batch-selected': batchMode && batchSelected.includes(stock.code)
              }"
              :draggable="!batchMode"
              @dragstart="!batchMode && onDragStart($event, idx)"
              @dragover.prevent="!batchMode && onDragOver($event, idx)"
              @dragend="!batchMode && onDragEnd()"
              @click="batchMode ? toggleBatchItem(stock.code) : selectStock(stock.code)"
            >
              <!-- Checkbox (batch mode) -->
              <div v-if="batchMode" class="batch-check" :class="{ checked: batchSelected.includes(stock.code) }">
                <svg v-if="batchSelected.includes(stock.code)" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                </svg>
              </div>

              <!-- Drag handle (normal mode) -->
              <div v-else class="drag-handle">⠿</div>

              <!-- Pin button -->
              <button class="pin-btn" :class="{ active: stock.pinned }" @click.stop="onTogglePin(stock.code)" :title="stock.pinned ? '取消置顶' : '置顶'">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M16 3a1 1 0 0 1 .7.3l4 4a1 1 0 0 1-.3 1.6L17 10.4l.6 5.6a1 1 0 0 1-1 1H13v5a1 1 0 0 1-2 0v-5H7.4a1 1 0 0 1-1-1L7 10.4 3.6 8.9a1 1 0 0 1-.3-1.6l4-4A1 1 0 0 1 8 3h8z"/>
                </svg>
              </button>

              <div class="stock-item__info">
                <div class="stock-item__name">{{ stock.name }}</div>
                <div class="stock-item__code">{{ stock.code }}</div>
              </div>
              <div class="stock-item__price-col">
                <div class="stock-item__price" :class="getQuoteClass(stock.code)">
                  {{ getQuotePrice(stock.code) }}
                </div>
                <div class="stock-item__change" :class="getQuoteClass(stock.code)">
                  {{ getQuoteChange(stock.code) }}
                </div>
              </div>
              <div class="stock-item__mini">
                <Sparkline
                  v-if="getMiniData(stock.code).length"
                  :data="getMiniData(stock.code)"
                  :positive="isQuoteUp(stock.code)"
                  :width="52"
                  :height="24"
                  :ref-price="getMiniRefPrice(stock.code)"
                  :total-slots="240"
                />
              </div>
            </div>
            <!-- Divider between pinned and unpinned -->
            <div v-if="stock.pinned && isLastPinned(idx)" class="pin-divider" :key="'divider-' + stock.code"></div>
          </template>
        </div>
      </aside>

      <!-- Detail panel -->
      <main class="detail-panel">
        <div v-if="!selectedCode" class="empty-detail">
          <div class="empty-icon">📈</div>
          <p>选择一只自选股查看详情</p>
        </div>
        <template v-else>
          <!-- Period tabs -->
          <div class="period-tabs">
            <button
              v-for="p in periods"
              :key="p.key"
              class="period-tab"
              :class="{ active: activePeriod === p.key }"
              @click="switchPeriod(p.key)"
            >{{ p.label }}</button>
          </div>

          <!-- Chart -->
          <div class="chart-area">
            <KlineChart
              v-if="isKlineMode && chartData.length"
              :data="chartData"
              :height="280"
              :auto-width="true"
            />
            <IntradayChart
              v-else-if="chartData.length"
              :data="chartData"
              :positive="chartPositive"
              :height="280"
              :auto-width="true"
              :ref-price="chartRefPrice"
              :total-slots="chartTotalSlots"
            />
            <div v-else-if="detailLoading" class="chart-loading">加载中...</div>
            <div v-else class="chart-loading">暂无数据</div>
          </div>

          <!-- Stats grid -->
          <div class="stats-grid">
            <div v-for="stat in statsItems" :key="stat.label" class="stat-item" :class="{ 'stat-item--wide': stat.wide }">
              <div class="stat-label">{{ stat.label }}</div>
              <div class="stat-value" :class="stat.tone">{{ stat.value }}</div>
            </div>
          </div>

          <!-- Actions -->
          <div class="detail-actions">
            <router-link :to="`/position?code=${selectedCode}`" class="btn btn-primary">
              计算仓位
            </router-link>
            <button class="btn btn-danger" @click="removeSelected">移除</button>
          </div>
        </template>
      </main>
    </div>

    <!-- Click outside to close search -->
    <div v-if="showSearch" class="backdrop" @click="showSearch = false"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useWatchlistStore } from '../stores/watchlist.js'
import { REFRESH_INTERVAL } from '../utils/constants.js'
import Sparkline from '../components/Sparkline.vue'
import IntradayChart from '../components/IntradayChart.vue'
import KlineChart from '../components/KlineChart.vue'

const watchlistStore = useWatchlistStore()

const searchKw = ref('')
const showSearch = ref(false)
const searchResults = ref([])
const selectedCode = ref(null)
const activePeriod = ref('1d')
let searchTimer = null

// Batch mode state
const batchMode = ref(false)
const batchSelected = ref([]) // array of stock codes

const allSelected = computed(() =>
  batchSelected.value.length === watchlistStore.stocks.length && watchlistStore.stocks.length > 0
)

// Intraday data for top index bar
const indexIntraday = ref({ sh: { name: '上证指数', trends: [], isUp: false, close: null, change: null, preClose: null }, sz: { name: '深证成指', trends: [], isUp: false, close: null, change: null, preClose: null }, cyb: { name: '创业板指', trends: [], isUp: false, close: null, change: null, preClose: null } })

// Cache for detail data
const intradayCache = ref({})
const detailLoading = ref(false)
const klineCache = ref({})
const kline1yCache = ref({})
const kline5yCache = ref({})
const basicCache = ref({})

const periods = [
  { key: '1d', label: '1日' },
  { key: '6m', label: '6月' },
  { key: '1y', label: '1年' },
  { key: '5y', label: '5年' },
  { key: 'all', label: '全部' }
]

const chartData = computed(() => {
  if (!selectedCode.value) return []
  const p = activePeriod.value
  if (p === '1d') return intradayCache.value[selectedCode.value]?.trends || []
  if (p === '6m') return (klineCache.value[selectedCode.value]?.klines || []).slice(-120)
  if (p === '1y') return kline1yCache.value[selectedCode.value]?.klines || []
  if (p === '5y' || p === 'all') return kline5yCache.value[selectedCode.value]?.klines || []
  return []
})

const isKlineMode = computed(() => ['6m', '1y', '5y', 'all'].includes(activePeriod.value))

const chartPositive = computed(() => isQuoteUp(selectedCode.value))
const chartTotalSlots = computed(() => activePeriod.value === '1d' ? 240 : 0)
const chartRefPrice = computed(() => {
  if (activePeriod.value === '1d') return intradayCache.value[selectedCode.value]?.preClose || null
  return null
})

const statsItems = computed(() => {
  const basic = basicCache.value[selectedCode.value] || {}
  const kline = klineCache.value[selectedCode.value]?.klines || []
  const last = kline[kline.length - 1] || {}
  const period = kline.slice(-22)
  const periodHigh = period.length ? Math.max(...period.map(k => k.high)) : null
  const periodLow = period.length ? Math.min(...period.map(k => k.low)) : null
  return [
    { label: '日内最高', value: last.high?.toFixed(2) || '--' },
    { label: '日内最低', value: last.low?.toFixed(2) || '--' },
    { label: '区间最高', value: periodHigh?.toFixed(2) || '--' },
    { label: '区间最低', value: periodLow?.toFixed(2) || '--' },
    { label: '市盈率 PE', value: basic.pe?.toFixed(1) || '--' },
    { label: '市净率 PB', value: basic.pb?.toFixed(2) || '--' },
    { label: '总市值', value: formatCap(basic.totalMarketCap) },
    { label: '涨跌幅', value: getQuoteChange(selectedCode.value), tone: getQuoteClass(selectedCode.value) },
    { label: '所属行业', value: basic.industry || '--', tone: 'sector' },
    { label: '地域板块', value: basic.region || '--', tone: 'sector' },
    { label: '概念板块', value: basic.concept || '--', wide: true, tone: 'sector' }
  ]
})

function formatCap(val) {
  if (val == null) return '--'
  if (val >= 1e12) return (val / 1e12).toFixed(2) + '万亿'
  if (val >= 1e8) return (val / 1e8).toFixed(0) + '亿'
  return (val / 1e4).toFixed(0) + '万'
}

function getQuotePrice(code) {
  const q = watchlistStore.quotes[code]
  return q?.close?.toFixed(2) || '--'
}

function getQuoteChange(code) {
  const q = watchlistStore.quotes[code]
  if (!q || q.change == null) return '--'
  return (q.change >= 0 ? '+' : '') + q.change.toFixed(2) + '%'
}

function getQuoteClass(code) {
  const q = watchlistStore.quotes[code]
  if (!q || q.change == null) return ''
  return q.change >= 0 ? 'up' : 'down'
}

function isQuoteUp(code) {
  const q = watchlistStore.quotes[code]
  return q?.change != null ? q.change >= 0 : true
}

function getMiniData(code) {
  const intra = intradayCache.value[code]
  if (intra?.trends?.length) return intra.trends
  return []
}

function getMiniRefPrice(code) {
  return intradayCache.value[code]?.preClose || null
}

function onSearchInput() {
  clearTimeout(searchTimer)
  if (!searchKw.value.trim()) { searchResults.value = []; return }
  searchTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/stock/search?kw=${encodeURIComponent(searchKw.value)}`)
      const json = await res.json()
      searchResults.value = json.ok ? json.data : []
    } catch { searchResults.value = [] }
  }, 300)
}

function addFromSearch(item) {
  watchlistStore.addStock(item.code, item.name)
  showSearch.value = false
  searchKw.value = ''
  searchResults.value = []
  watchlistStore.fetchQuotes()
}

async function selectStock(code) {
  selectedCode.value = code
  const hasKline = !!klineCache.value[code]
  const hasIntraday = !!intradayCache.value[code]
  const hasBasic = !!basicCache.value[code]?.industry
  detailLoading.value = true
  // Fetch missing data, keep cache on failure
  if (!hasKline) {
    try {
      const res = await fetch(`/api/stock/${code}/kline`)
      const json = await res.json()
      if (json.ok && json.data?.klines?.length) klineCache.value[code] = json.data
    } catch {}
  }
  if (!hasIntraday) {
    try {
      const res = await fetch(`/api/stock/${code}/intraday`)
      const json = await res.json()
      if (json.ok && json.data?.trends?.length) intradayCache.value[code] = json.data
    } catch {}
  }
  if (!hasBasic) {
    try {
      const res = await fetch(`/api/stock/${code}/basic`)
      const json = await res.json()
      if (json.ok && json.data) basicCache.value[code] = json.data
    } catch {}
  }
  detailLoading.value = false
  restartIntradayDetailTimer()
}

function switchPeriod(key) {
  activePeriod.value = key
  // Load 1y data on demand
  if (key === '1y' && selectedCode.value && !kline1yCache.value[selectedCode.value]) {
    fetch(`/api/stock/${selectedCode.value}/kline1y`)
      .then(r => r.json())
      .then(json => { if (json.ok) kline1yCache.value[selectedCode.value] = json.data })
  }
  // Load 5y data on demand
  if ((key === '5y' || key === 'all') && selectedCode.value && !kline5yCache.value[selectedCode.value]) {
    fetch(`/api/stock/${selectedCode.value}/kline5y`)
      .then(r => r.json())
      .then(json => { if (json.ok) kline5yCache.value[selectedCode.value] = json.data })
  }
  restartIntradayDetailTimer()
}

function removeSelected() {
  if (!selectedCode.value) return
  watchlistStore.removeStock(selectedCode.value)
  selectedCode.value = null
}

// --- Pin to top ---
function onTogglePin(code) {
  watchlistStore.togglePin(code)
}

function isLastPinned(idx) {
  const list = watchlistStore.stocks
  return list[idx]?.pinned && (idx === list.length - 1 || !list[idx + 1]?.pinned)
}

// --- Batch delete ---
function enterBatchMode() {
  batchMode.value = true
  batchSelected.value = []
}

function exitBatchMode() {
  batchMode.value = false
  batchSelected.value = []
}

function toggleBatchItem(code) {
  const idx = batchSelected.value.indexOf(code)
  if (idx === -1) {
    batchSelected.value.push(code)
  } else {
    batchSelected.value.splice(idx, 1)
  }
}

function toggleSelectAll() {
  if (allSelected.value) {
    batchSelected.value = []
  } else {
    batchSelected.value = watchlistStore.stocks.map(s => s.code)
  }
}

function deleteBatch() {
  if (!batchSelected.value.length) return
  watchlistStore.removeBatch(batchSelected.value)
  if (batchSelected.value.includes(selectedCode.value)) {
    selectedCode.value = null
  }
  exitBatchMode()
}

// --- Drag & drop reorder ---
const dragIdx = ref(null)
const dragOverIdx = ref(null)

function onDragStart(e, idx) {
  dragIdx.value = idx
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', '')
}

function onDragOver(e, idx) {
  if (dragIdx.value === null || dragIdx.value === idx) return
  // Enforce pinned/unpinned zone boundary
  const stocks = watchlistStore.stocks
  if (stocks[dragIdx.value].pinned !== stocks[idx].pinned) return
  dragOverIdx.value = idx
}

function onDragEnd() {
  if (dragIdx.value !== null && dragOverIdx.value !== null && dragIdx.value !== dragOverIdx.value) {
    watchlistStore.reorderStock(dragIdx.value, dragOverIdx.value)
  }
  dragIdx.value = null
  dragOverIdx.value = null
}

async function fetchIndexIntraday() {
  try {
    const res = await fetch('/api/market/indices/intraday')
    const json = await res.json()
    if (json.ok) {
      for (const key of ['sh', 'sz', 'cyb']) {
        const d = json.data[key]
        if (d?.trends?.length) {
          const lastTrend = d.trends[d.trends.length - 1]
          const close = lastTrend?.close || d.preClose
          const change = d.preClose ? ((close - d.preClose) / d.preClose * 100) : 0
          indexIntraday.value[key] = {
            ...indexIntraday.value[key],
            trends: d.trends,
            close,
            change,
            preClose: d.preClose,
            isUp: change >= 0
          }
        }
      }
    }
  } catch (e) { console.error('fetchIndexIntraday error:', e) }
}

// --- Timers with visibility awareness ---
let indexTimer = null
let detailIntradayTimer = null

function startIndexTimer() {
  if (indexTimer) return
  fetchIndexIntraday()
  indexTimer = setInterval(fetchIndexIntraday, REFRESH_INTERVAL)
}

function stopIndexTimer() {
  if (indexTimer) { clearInterval(indexTimer); indexTimer = null }
}

async function refreshDetailIntraday() {
  const code = selectedCode.value
  if (!code || activePeriod.value !== '1d') return
  try {
    const res = await fetch(`/api/stock/${code}/intraday`)
    const json = await res.json()
    if (json.ok && json.data?.trends?.length) intradayCache.value[code] = json.data
  } catch (e) { console.error('refreshDetailIntraday error:', e) }
}

function startDetailIntradayTimer() {
  stopDetailIntradayTimer()
  if (!selectedCode.value || activePeriod.value !== '1d') return
  refreshDetailIntraday()
  detailIntradayTimer = setInterval(refreshDetailIntraday, REFRESH_INTERVAL)
}

function stopDetailIntradayTimer() {
  if (detailIntradayTimer) { clearInterval(detailIntradayTimer); detailIntradayTimer = null }
}

function restartIntradayDetailTimer() {
  if (selectedCode.value && activePeriod.value === '1d' && !document.hidden) {
    startDetailIntradayTimer()
  } else {
    stopDetailIntradayTimer()
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    stopIndexTimer()
    stopDetailIntradayTimer()
  } else {
    startIndexTimer()
    restartIntradayDetailTimer()
  }
}

onMounted(() => {
  startIndexTimer()
  watchlistStore.startAutoRefresh(REFRESH_INTERVAL)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

// Auto-exit batch mode when list becomes empty
watch(() => watchlistStore.stocks.length, (len) => {
  if (len === 0 && batchMode.value) exitBatchMode()
})

onBeforeUnmount(() => {
  stopIndexTimer()
  stopDetailIntradayTimer()
  watchlistStore.stopAutoRefresh()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearTimeout(searchTimer)
})
</script>

<style scoped>
.watchlist {
  max-width: 1460px;
  margin: 0 auto;
  height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== INDEX BAR ===== */
.index-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px 16px 0;
}

.index-bar__card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  contain: layout style;
}

.idx-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}

.idx-name {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.idx-price {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.idx-change {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
  white-space: nowrap;
}

.idx-change.up { color: var(--red); }
.idx-change.down { color: var(--green); }

.idx-price {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 6px;
  font-variant-numeric: tabular-nums;
}

.idx-chart {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  min-height: 78px;
}

/* ===== SPLIT LAYOUT ===== */
.split-layout {
  flex: 1;
  display: flex;
  gap: 0;
  padding: 12px 16px 16px;
  min-height: 0;
}

/* ===== SIDEBAR ===== */
.sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
  border-right: 1px solid var(--border);
  padding-right: 12px;
}

.search-box {
  position: relative;
}

.search-box input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
}

.search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-top: 4px;
  z-index: 50;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.search-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.search-item:hover {
  background: var(--bg-surface-alt);
}

.search-item__name {
  font-size: 13px;
  color: var(--text-primary);
}

.search-item__code {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.stock-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.empty-hint {
  text-align: center;
  padding: 40px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.stock-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.stock-item:hover {
  background: var(--bg-surface-alt);
}

.stock-item.active {
  background: var(--accent-dim);
}

.stock-item.dragging {
  opacity: 0.4;
}

.stock-item.drag-over {
  border-top: 2px solid var(--accent);
  padding-top: 8px;
}

.drag-handle {
  color: var(--text-muted);
  font-size: 14px;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s;
  user-select: none;
  flex-shrink: 0;
  line-height: 1;
}

.stock-item:hover .drag-handle {
  opacity: 0.6;
}

.drag-handle:active {
  cursor: grabbing;
}

.stock-item__info {
  flex: 1;
  min-width: 0;
}

.stock-item__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stock-item__code {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.stock-item__price-col {
  text-align: right;
  min-width: 60px;
}

.stock-item__price {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stock-item__change {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.up { color: var(--red); }
.down { color: var(--green); }

.stock-item__mini {
  flex-shrink: 0;
}

/* ===== SIDEBAR HEADER ===== */
.sidebar-header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sidebar-header .search-box {
  flex: 1;
  position: relative;
}

.batch-entry-btn {
  flex-shrink: 0;
}

/* ===== BATCH TOOLBAR ===== */
.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.batch-count {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
  margin-right: 4px;
  font-variant-numeric: tabular-nums;
}

/* ===== BATCH CHECKBOX ===== */
.batch-check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
  cursor: pointer;
}

.batch-check.checked {
  border-color: var(--accent);
  background: var(--accent);
}

/* ===== PIN BUTTON ===== */
.pin-btn {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  color: var(--text-muted);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.stock-item:hover .pin-btn {
  opacity: 0.5;
}

.pin-btn.active {
  opacity: 1;
  color: var(--accent);
}

.pin-btn:hover {
  opacity: 1 !important;
  color: var(--accent);
}

/* ===== PINNED STOCK ===== */
.stock-item.pinned {
  border-left: 2px solid var(--accent);
  padding-left: 8px;
}

.pin-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 10px;
}

/* ===== BATCH MODE ===== */
.stock-item.batch-selected {
  background: var(--accent-dim);
}

.stock-list.batch-mode .stock-item__mini,
.stock-list.batch-mode .stock-item__price-col {
  opacity: 0.5;
}

/* ===== DETAIL PANEL ===== */
.detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-left: 16px;
  overflow-y: auto;
}

.empty-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 40px;
  opacity: 0.4;
}

.period-tabs {
  display: flex;
  gap: 4px;
}

.period-tab {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  transition: all 0.2s;
}

.period-tab:hover {
  background: var(--bg-surface-alt);
  color: var(--text-primary);
}

.period-tab.active {
  background: var(--accent-dim);
  color: var(--accent);
}

.chart-area {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  min-height: 300px;
}

.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
}

.stat-item {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.stat-value {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.stat-value.up {
  color: var(--red);
}

.stat-value.down {
  color: var(--green);
}

.stat-value.sector {
  color: var(--accent);
}

.stat-item--wide {
  grid-column: span 6;
}

.stat-item--wide .stat-value {
  font-size: 13px;
  white-space: normal;
  word-break: break-all;
}

.detail-actions {
  display: flex;
  gap: 10px;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

@media (max-width: 768px) {
  .watchlist {
    height: auto;
    min-height: calc(100vh - 52px);
  }

  .index-bar {
    grid-template-columns: 1fr;
  }

  .split-layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding-right: 0;
    padding-bottom: 12px;
    max-height: 300px;
  }

  .detail-panel {
    padding-left: 0;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
