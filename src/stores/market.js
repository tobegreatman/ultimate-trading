import { defineStore } from 'pinia'
import { ref } from 'vue'
import { loadJson, saveJson } from '../utils/storage.js'

const NB_KEY = 'northbound_cache'
const MARGIN_KEY = 'margin_cache'
const LIMIT_KEY = 'limitStats_cache'
const BREADTH_HIST_KEY = 'breadth_history'
const PREV_STATUS_KEY = 'market_prev_status'
const MAX_STALE_DAYS = 5  // 允许恢复的最大天数间隔（覆盖周末+短假）

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 从 localStorage 恢复 prevStatus，支持跨天恢复
 * - 同天：完整恢复（含 crossCount）
 * - 跨天（≤5天）：恢复 status + lastFlipDate，crossCount 重置（确认链断裂）
 * - 超期（>5天）：丢弃（市场环境已显著变化）
 */
function restorePrevStatus(saved, today) {
  if (!saved?.status) return null
  const savedDate = saved.date ? new Date(saved.date + 'T00:00:00') : null
  if (savedDate) {
    const diff = (new Date(today + 'T00:00:00').getTime() - savedDate.getTime()) / 86400000
    if (diff > MAX_STALE_DAYS) return null
  }
  const isSameDay = saved.date === today
  return {
    status: saved.status,
    date: saved.date,
    crossCount: isSameDay ? (saved.crossCount || 0) : 0,
    lastFlipDate: saved.lastFlipDate || null
  }
}

export const useMarketStore = defineStore('market', () => {
  const indices = ref(null)
  const breadth = ref(null)
  const breadthHistory = ref(loadJson(BREADTH_HIST_KEY) || [])
  const northbound = ref(loadJson(NB_KEY))
  const margin = ref(loadJson(MARGIN_KEY))
  const limitStats = ref(loadJson(LIMIT_KEY))
  const prevStatusObj = loadJson(PREV_STATUS_KEY)
  const prevStatus = ref(restorePrevStatus(prevStatusObj, todayStr()))
  const loading = ref(false)
  const dataReady = ref(false)

  async function fetchIndices() {
    try {
      const res = await fetch('/api/market/indices')
      const json = await res.json()
      if (json.ok) indices.value = json.data
    } catch (e) {
      console.error('fetchIndices error:', e)
    }
  }

  async function fetchBreadth() {
    try {
      const res = await fetch('/api/market/breadth')
      const json = await res.json()
      if (json.ok) {
        breadth.value = json.data
        // 更新涨跌家数历史（按日去重，保留最近 5 日）
        const today = todayStr()
        const hist = [...(breadthHistory.value || [])]
        const idx = hist.findIndex(h => h.date === today)
        if (idx >= 0) {
          hist[idx] = { date: today, ...json.data }
        } else {
          hist.push({ date: today, ...json.data })
          if (hist.length > 5) hist.shift()
        }
        breadthHistory.value = hist
        saveJson(BREADTH_HIST_KEY, hist)
      }
    } catch (e) {
      console.error('fetchBreadth error:', e)
    }
  }

  async function fetchNorthbound() {
    try {
      const res = await fetch('/api/market/northbound')
      const json = await res.json()
      if (json.ok && Array.isArray(json.data) && json.data.length) {
        northbound.value = json.data
        saveJson(NB_KEY, json.data)
      }
    } catch (e) {
      console.error('fetchNorthbound error:', e)
    }
  }

  async function fetchMargin() {
    try {
      const res = await fetch('/api/market/margin')
      const json = await res.json()
      if (json.ok && Array.isArray(json.data) && json.data.length) {
        margin.value = json.data
        saveJson(MARGIN_KEY, json.data)
      }
    } catch (e) {
      console.error('fetchMargin error:', e)
    }
  }

  async function fetchLimitStats() {
    try {
      const res = await fetch('/api/market/limit-stats')
      const json = await res.json()
      if (json.ok && json.data) {
        limitStats.value = json.data
        saveJson(LIMIT_KEY, json.data)
      }
    } catch (e) {
      console.error('fetchLimitStats error:', e)
    }
  }

  async function fetchAll() {
    loading.value = true
    try {
      await Promise.all([fetchIndices(), fetchBreadth(), fetchNorthbound(), fetchMargin(), fetchLimitStats()])
      dataReady.value = true
    } finally {
      loading.value = false
    }
  }

  return { indices, breadth, breadthHistory, northbound, margin, limitStats, prevStatus, loading, dataReady, fetchIndices, fetchBreadth, fetchNorthbound, fetchMargin, fetchLimitStats, fetchAll }
})
