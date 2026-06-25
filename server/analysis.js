import https from 'https'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'

// ==================== 常量 ====================
const EM_HEADERS = {
  Referer: 'https://quote.eastmoney.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

const INDEX_SECIDS = {
  sh: '1.000001',
  sz: '0.399001',
  cyb: '0.399006',
  hs300: '1.000300'
}

const INDEX_TC = {
  sh: 'sh000001',
  sz: 'sz399001',
  cyb: 'sz399006',
  hs300: 'sh000300'
}

const INDEX_NAMES = {
  sh: '上证指数',
  sz: '深证成指',
  cyb: '创业板指',
  hs300: '沪深300'
}

const SECTOR_CACHE_TTL = 5 * 60 * 1000
const VALUATION_CACHE_TTL = 60 * 60 * 1000
const BOND_YIELD_10Y = 1.68  // 默认值，会被动态覆盖

// EM datacenter 市场 ID → 过滤条件
const MARKET_FILTER = {
  sh: '069001001001',  // 上海证券交易所
  sz: '069001002001',  // 深圳证券交易所
}

// PE 缓存
const peCache = { pe: null, pb: null, ts: 0 }
const PE_CACHE_TTL = 4 * 60 * 60 * 1000  // 4小时缓存

const MACRO_CACHE_TTL = 6 * 60 * 60 * 1000  // 宏观数据6小时缓存（月度数据变化慢）
const macroCache = { data: null, ts: 0 }

const RS_HISTORY_DAYS = 30
const sectorCache = { data: null, ts: 0, source: '' }
const valuationCache = { data: null, ts: 0, source: '' }
const sectorHistory = new Map()

// RS 持久化到磁盘
const RS_FILE = fileURLToPath(new URL('./rs_history.json', import.meta.url))
function loadRSHistory() {
  try {
    const obj = JSON.parse(readFileSync(RS_FILE, 'utf-8'))
    for (const [date, snap] of Object.entries(obj)) sectorHistory.set(date, snap)
  } catch { /* 首次运行无文件 */ }
}
function saveRSHistory() {
  try {
    const obj = {}
    for (const [date, snap] of sectorHistory) obj[date] = snap
    writeFileSync(RS_FILE, JSON.stringify(obj))
  } catch { /* ignore */ }
}
loadRSHistory()

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isExpired(cacheEntry, ttl) {
  return !cacheEntry.data || (Date.now() - cacheEntry.ts > ttl)
}

// ==================== HTTP 请求工具 ====================
function fetchJSONviaHttps(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: EM_HEADERS }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')) })
  })
}

async function fetchJSON(url, timeoutMs = 8000) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, { headers: EM_HEADERS, signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    return fetchJSONviaHttps(url, timeoutMs)
  }
}

// 新浪 GBK 文本请求
async function fetchGBK(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: ctrl.signal
  })
  clearTimeout(timer)
  const buf = await res.arrayBuffer()
  return new TextDecoder('gbk').decode(buf)
}

// 腾讯 JSON 请求（响应可能带 var 前缀）
async function fetchTencentJSON(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: ctrl.signal
  })
  clearTimeout(timer)
  const text = await res.text()
  return JSON.parse(text.replace(/^[a-zA-Z_]*=/, ''))
}

// 解析 qt.gtimg.cn 响应
function parseQt(text) {
  const map = {}
  for (const line of text.split(';')) {
    const m = line.match(/v_(\w+)="(.*)"/)
    if (m) map[m[1]] = m[2].split('~')
  }
  return map
}

// secid 转腾讯代码: 1.000001 → sh000001
function secidToTc(secid) {
  const [m, code] = secid.split('.')
  return (m === '1' ? 'sh' : 'sz') + code
}

function ok(data) { return { ok: true, data } }
function fail(msg) { return { ok: false, error: msg } }

// ==================== 基准指数日涨幅 ====================

async function fetchBenchmarkChange() {
  // 获取上证指数最近2根日K线，计算今日涨跌幅
  try {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=2`
    const data = await fetchJSON(url)
    const klines = data.data?.klines
    if (!klines || klines.length < 2) return null
    // EM kline: date,open,close,high,low,volume,amount,amplitude,changePercent,changeAmt,turnover
    const p = klines[klines.length - 1].split(',')
    const changePct = parseFloat(p[8])
    if (!isNaN(changePct)) return changePct
    // fallback: 从收盘价计算
    const prev = klines[klines.length - 2].split(',')
    const close = +p[2], prevClose = +prev[2]
    if (prevClose > 0) return +((close - prevClose) / prevClose * 100).toFixed(2)
  } catch (_) {}
  return null
}

// ==================== 板块排名 ====================

// 主源: 东方财富 (参数来源: stock.eastmoney.com/hangye.html)
async function fetchSectorEM() {
  // 多节点轮试
  const nodes = ['push2', '1.push2', '33.push2', '43.push2', '80.push2']
  for (const node of nodes) {
    try {
      const url = `http://${node}.eastmoney.com/api/qt/clist/get?np=1&fltt=2&invt=2&fs=m:90+s:4+f:!50&fields=f12,f14,f2,f3,f6,f8,f104,f105,f128,f136,f140,f141&fid=f3&pn=1&pz=100&po=1&dect=1&ut=fa5fd1943c7b386f172d6893dbfba10b&wbp2u=%7C0%7C0%7C0%7Cweb`
      const data = await fetchJSON(url)
      if (!data.data?.diff) continue

      return data.data.diff.map(item => ({
        code: item.f12,
        name: item.f14,
        changePercent: item.f3 || 0,
        price: item.f2 || 0,
        amount: item.f6 || 0,
        upCount: item.f104 || 0,
        downCount: item.f105 || 0,
        leadStock: item.f140 || '',
        leadStockCode: item.f128 || '',
        leadStockChange: item.f136 || 0
      })).filter(s => s.name && s.code)
    } catch (_) {}
  }
  throw new Error('EM sector all nodes failed')
}

// 备源1: 新浪 (49个行业, 含成交额/领涨股/股票数)
async function fetchSectorSina() {
  const text = await fetchGBK('https://money.finance.sina.com.cn/q/view/newSinaHy.php')
  const match = text.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/)
  if (!match) throw new Error('Sina sector parse error')
  const obj = JSON.parse(match[1])

  const sectors = Object.values(obj).map(item => {
    const p = item.split(',')
    return {
      code: p[0] || '',
      name: p[1] || '',
      changePercent: parseFloat(p[5]) || 0,
      price: parseFloat(p[3]) || 0,
      amount: parseFloat(p[7]) || 0,
      upCount: 0,
      downCount: 0,
      stockCount: parseInt(p[2]) || 0,
      leadStock: p[12] || '',
      leadStockCode: p[8] || '',
      leadStockChange: parseFloat(p[9]) || 0
    }
  }).filter(s => s.name && s.code)

  // 并行补充涨跌家数（从新浪板块成分股API）
  try {
    await enrichSectorUpDown(sectors)
  } catch (_) {}

  return sectors
}

// 从新浪个股行情批量计算板块涨跌家数
async function enrichSectorUpDown(sectors) {
  const BATCH = 10
  for (let i = 0; i < sectors.length; i += BATCH) {
    const batch = sectors.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (s) => {
        const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=300&sort=changepercent&asc=0&node=${s.code}`
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 5000)
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: ctrl.signal
        })
        clearTimeout(timer)
        const stocks = await res.json()
        if (!Array.isArray(stocks)) return
        s.upCount = stocks.filter(x => parseFloat(x.changepercent) > 0).length
        s.downCount = stocks.filter(x => parseFloat(x.changepercent) < 0).length
      })
    )
  }
}

// 备源2: 腾讯
async function fetchSectorTencent() {
  const url = 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/rankBK/getBK?type=industry&sort=3&direction=0&start=0&num=100'
  const data = await fetchTencentJSON(url)
  const list = data.data?.data?.list || data.data?.list || []
  if (!list.length) throw new Error('Tencent sector empty')

  return list.map(item => ({
    code: item.bkCode || item.code || '',
    name: item.bkName || item.name || '',
    changePercent: parseFloat(item.bkChgPct || item.changePercent || item.chgPct || 0),
    price: parseFloat(item.bkPrice || item.price || 0),
    amount: parseFloat(item.bkAmount || item.amount || 0),
    upCount: parseInt(item.bkUp || item.upCount || 0),
    downCount: parseInt(item.bkDown || item.downCount || 0),
    leadStock: item.leadStock || '',
    leadStockCode: item.leadStockCode || '',
    leadStockChange: parseFloat(item.leadStockChgPct || 0)
  })).filter(s => s.name && s.code)
}

// 备源3: 东方财富资金流向（含主力净流入，三级行业分类）
async function fetchSectorCapitalFlow() {
  const url = 'https://emdatah5.eastmoney.com/dc/ZJLX/getZDYLBData?fields=f1%2Cf2%2Cf3%2Cf4%2Cf12%2Cf13%2Cf14%2Cf128%2Cf62&pn=1&pz=100&fid=f62&po=1&fs=m%3A90%2Bt%3A2&ut='
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://emdatah5.eastmoney.com/'
    },
    signal: ctrl.signal
  })
  clearTimeout(timer)
  const data = await res.json()
  const items = data?.data?.diff
  if (!items || !items.length) throw new Error('EM capital flow sector empty')

  return items.map(item => ({
    code: item.f12,
    name: item.f14,
    changePercent: item.f3 || 0,
    price: item.f2 || 0,
    amount: item.f4 || 0,
    mainFlow: item.f62 || 0,
    leadStock: item.f128 || '',
    leadStockCode: item.f140 || '',
    upCount: 0,
    downCount: 0
  })).filter(s => s.name && s.code)
}

// 多源容错入口（capitalflow 有 mainFlow 字段，优先使用）
async function fetchSectorRanking() {
  const sources = [
    { name: 'capitalflow', fn: fetchSectorCapitalFlow },
    { name: 'eastmoney', fn: fetchSectorEM },
    { name: 'sina', fn: fetchSectorSina },
    { name: 'tencent', fn: fetchSectorTencent }
  ]
  for (const src of sources) {
    try {
      const result = await src.fn()
      if (result.length > 0) return { sectors: result, source: src.name }
    } catch (e) {
      console.warn(`sector source [${src.name}] failed:`, e.message)
    }
  }
  return { sectors: [], source: '' }
}

function saveSectorSnapshot(sectors, benchmarkChange) {
  const today = todayStr()
  if (sectorHistory.has(today)) return
  const snapshot = {
    sectors: sectors.map(s => ({
      code: s.code,
      name: s.name,
      changePercent: s.changePercent,
      mainFlow: s.mainFlow || 0
    }))
  }
  if (benchmarkChange != null) snapshot.benchmark = benchmarkChange
  sectorHistory.set(today, snapshot)
  if (sectorHistory.size > RS_HISTORY_DAYS) {
    const oldest = sectorHistory.keys().next().value
    sectorHistory.delete(oldest)
  }
  saveRSHistory()
}

// 解析快照（兼容旧格式：数组 → { sectors: 数组, benchmark: null }）
function parseSnapshot(raw) {
  if (!raw) return { sectors: [], benchmark: null }
  if (Array.isArray(raw)) return { sectors: raw, benchmark: null }
  return { sectors: raw.sectors || [], benchmark: raw.benchmark ?? null }
}

/**
 * 真正的 Relative Strength 计算（板块 vs 上证指数基准）
 *
 * RS = 板块累计收益 / 基准累计收益
 * - RS > 1：板块跑赢大盘
 * - RS < 1：板块跑输大盘
 * - RS = 1：与大盘同步
 *
 * 输出字段：
 * - rs5d/rs10d/rs20d: 板块自身的多周期累计收益(%)
 * - excess5d/excess10d/excess20d: 板块相对基准的超额收益(百分点)
 * - rsScore: 超额收益的加权复合 (excess5d*0.5 + excess10d*0.3 + excess20d*0.2)
 * - rsRatio: RS比率 = 板块累计收益/基准累计收益(5d)，>1 跑赢
 * - rsTrend: 趋势方向(accelerating/decelerating/stable)
 */
function calcEnhancedRS(sectors) {
  const dates = [...sectorHistory.keys()].sort()
  if (dates.length < 2) return null

  // 构建每个板块的每日涨跌幅序列: Map<code, number[]>
  const sectorDailyMap = new Map()
  // 同步计算每日板块均值（作为基准兜底）
  const avgSeries = []
  for (const date of dates) {
    const parsed = parseSnapshot(sectorHistory.get(date))
    const arr = parsed.sectors
    const avg = arr.length > 0 ? arr.reduce((s, x) => s + (x.changePercent || 0), 0) / arr.length : 0
    avgSeries.push(avg)
    for (const s of arr) {
      if (!sectorDailyMap.has(s.code)) sectorDailyMap.set(s.code, [])
      sectorDailyMap.get(s.code).push(s.changePercent || 0)
    }
  }

  // 提取基准（上证指数）日涨幅序列，缺失时用板块均值兜底
  const benchmarkSeries = []
  let hasExplicitBench = false
  for (let i = 0; i < dates.length; i++) {
    const parsed = parseSnapshot(sectorHistory.get(dates[i]))
    if (parsed.benchmark != null) {
      benchmarkSeries.push(parsed.benchmark)
      hasExplicitBench = true
    } else {
      benchmarkSeries.push(avgSeries[i])
    }
  }

  function benchmarkCumReturn(sliceFromEnd) {
    const slice = benchmarkSeries.slice(-sliceFromEnd)
    return slice.length > 0 ? slice.reduce((a, b) => a + b, 0) : 0
  }

  return sectors.map(s => {
    const series = sectorDailyMap.get(s.code)
    if (!series || series.length < 2) {
      return { ...s, rs5d: null, rs10d: null, rs20d: null, excess5d: null, excess10d: null, excess20d: null, rsScore: null, rsRatio: null, rsTrend: null }
    }

    const len = series.length
    const n5 = Math.min(len, 5)
    const n10 = Math.min(len, 10)
    const n20 = Math.min(len, 20)
    const rs5d = series.slice(-n5).reduce((a, b) => a + b, 0)
    const rs10d = series.slice(-n10).reduce((a, b) => a + b, 0)
    const rs20d = series.slice(-n20).reduce((a, b) => a + b, 0)

    // 基准取与板块相同的窗口长度，确保可比
    const bench5d = benchmarkCumReturn(n5)
    const bench10d = benchmarkCumReturn(n10)
    const bench20d = benchmarkCumReturn(n20)

    // 超额收益 = 板块收益 - 基准收益
    const excess5d = rs5d - bench5d
    const excess10d = rs10d - bench10d
    const excess20d = rs20d - bench20d

    // RS比率：超额收益 / |基准收益|，正=跑赢，负=跑输，绝对值=幅度倍数
    const rsRatio = Math.abs(bench5d) > 0.1 ? +(excess5d / Math.abs(bench5d)).toFixed(2) : null

    // 加权复合超额收益 → RS评分
    const rsScore = excess5d * 0.5 + excess10d * 0.3 + excess20d * 0.2

    // 趋势判断：短期超额 vs 中期超额（归一化到相同周期）
    const actual10 = Math.min(len, 10)
    const excess10dNorm = excess10d / actual10 * 5
    const diff = excess5d - excess10dNorm
    let rsTrend = 'stable'
    if (diff > 0.5) rsTrend = 'accelerating'
    else if (diff < -0.5) rsTrend = 'decelerating'

    return {
      ...s,
      rs5d: +rs5d.toFixed(2), rs10d: +rs10d.toFixed(2), rs20d: +rs20d.toFixed(2),
      excess5d: +excess5d.toFixed(2), excess10d: +excess10d.toFixed(2), excess20d: +excess20d.toFixed(2),
      rsScore: +rsScore.toFixed(2), rsRatio, rsTrend
    }
  })
}

/**
 * 板块轮动信号：取 rsScore 前10板块，统计趋势方向
 * 'strengthening' | 'weakening' | 'mixed' | null
 */
function calcRotationSignal(enrichedSectors) {
  const withRS = enrichedSectors.filter(s => s.rsScore !== null)
  if (withRS.length < 3) return null
  const top10 = withRS.sort((a, b) => b.rsScore - a.rsScore).slice(0, 10)
  let accel = 0, decel = 0
  for (const s of top10) {
    if (s.rsTrend === 'accelerating') accel++
    else if (s.rsTrend === 'decelerating') decel++
  }
  if (accel >= 6) return 'strengthening'
  if (decel >= 6) return 'weakening'
  return 'mixed'
}

async function handleSectors(ctx) {
  try {
    let sectors = null
    let source = ''

    if (!isExpired(sectorCache, SECTOR_CACHE_TTL)) {
      sectors = sectorCache.data
      source = sectorCache.source
    } else {
      const result = await fetchSectorRanking()
      sectors = result.sectors
      source = result.source
      if (sectors.length > 0) {
        const benchmarkChange = await fetchBenchmarkChange()
        saveSectorSnapshot(sectors, benchmarkChange)
        sectorCache.data = sectors
        sectorCache.ts = Date.now()
        sectorCache.source = source
      }
    }

    if (!sectors || sectors.length === 0) {
      ctx.body = fail('板块数据获取失败（所有数据源均不可用）')
      return
    }

    let enrichedSectors = calcEnhancedRS(sectors) || sectors.map(s => ({ ...s, rs5d: null, rs10d: null, rs20d: null, excess5d: null, excess10d: null, excess20d: null, rsScore: null, rsRatio: null, rsTrend: null }))

    enrichedSectors.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))

    const ranked = enrichedSectors.map((s, i) => ({ ...s, rank: i + 1 }))
    const byRS = enrichedSectors.filter(s => s.rsScore !== null).sort((a, b) => (b.rsScore || 0) - (a.rsScore || 0))
    const top5Strong = byRS.slice(0, 5)
    const top5Weak = byRS.slice(-5).reverse()
    const rotationSignal = calcRotationSignal(enrichedSectors)
    const top5Flow = enrichedSectors
      .filter(s => s.mainFlow)
      .sort((a, b) => (b.mainFlow || 0) - (a.mainFlow || 0))
      .slice(0, 5)

    ctx.body = ok({
      timestamp: new Date().toISOString(),
      source,
      sectors: ranked,
      top5Strong,
      top5Weak,
      top5Flow,
      rotationSignal,
      rsAvailable: sectorHistory.size >= 2,
      rsDays: sectorHistory.size
    })
  } catch (e) {
    console.error('sectors error:', e)
    ctx.body = fail(e.message)
  }
}

// ==================== 指数PE/PB ====================
// 从 EM datacenter RPT_VALUEANALYSIS_DET 获取成分股数据，加权计算指数PE
async function fetchIndexPE() {
  if (peCache.pe && Date.now() - peCache.ts < PE_CACHE_TTL) {
    return { pe: peCache.pe, pb: peCache.pb }
  }

  const results = {}
  for (const [key, market] of Object.entries(MARKET_FILTER)) {
    try {
      const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=PE_TTM,PB_MRQ,TOTAL_MARKET_CAP,TRADE_DATE&pageSize=500&pageNumber=1&sortColumns=TRADE_DATE&sortTypes=-1&source=WEB&client=WEB&filter=(TRADE_MARKET%3D%22${market}%22)`
      const data = await fetchJSON(url)
      const items = data.result?.data || []
      if (!items.length) { results[key] = { pe: null, pb: null }; continue }

      // 取最新日期
      const latestDate = items[0]?.TRADE_DATE
      const latestItems = items.filter(d => d.TRADE_DATE === latestDate)

      let totalCap = 0, totalEarnings = 0, totalBook = 0
      for (const d of latestItems) {
        const cap = d.TOTAL_MARKET_CAP || 0
        const pe = d.PE_TTM
        const pb = d.PB_MRQ
        totalCap += cap
        if (pe && pe > 0 && pe < 10000) totalEarnings += cap / pe
        if (pb && pb > 0 && pb < 10000) totalBook += cap / pb
      }
      const pe = totalEarnings > 0 ? +(totalCap / totalEarnings).toFixed(2) : null
      const pb = totalBook > 0 ? +(totalCap / totalBook).toFixed(2) : null
      results[key] = { pe, pb }
    } catch (_) {
      results[key] = { pe: null, pb: null }
    }
  }

  // 上证指数PE用SH，深证成指用SZ
  const shPE = results.sh?.pe
  const szPE = results.sz?.pe

  // 创业板PE：直接从EM行情接口获取创业板指(399006)的PE/PB，替代旧版 szPE*1.25 估算
  let cybPE = null
  let cybPB = null
  try {
    const cybQuoteUrl = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=0.399006&fields=f2,f3,f9,f23`
    const cybQuoteData = await fetchJSON(cybQuoteUrl)
    const cybItem = cybQuoteData.data?.diff?.[0]
    if (cybItem?.f9 && cybItem.f9 > 0 && cybItem.f9 < 10000) cybPE = +cybItem.f9.toFixed(2)
    if (cybItem?.f23 && cybItem.f23 > 0 && cybItem.f23 < 10000) cybPB = +cybItem.f23.toFixed(2)
  } catch (_) { /* 获取失败时回退到估算 */ }
  // 回退：如果实时接口获取失败，使用 szPE * 1.25 作为兜底估算
  if (cybPE == null && szPE) cybPE = +(szPE * 1.25).toFixed(2)
  if (cybPB == null && results.sz?.pb) cybPB = +(results.sz.pb * 1.2).toFixed(2)

  // 沪深300：SH权重约65%（沪深300中沪市市值占比约65%）
  const hs300PE = shPE && szPE ? +((shPE * 0.65 + szPE * 0.35)).toFixed(2) : shPE || szPE

  const allPE = { sh: shPE, sz: szPE, cyb: cybPE, hs300: hs300PE }
  const allPB = { sh: results.sh?.pb, sz: results.sz?.pb, cyb: cybPB, hs300: null }

  peCache.pe = allPE
  peCache.pb = allPB
  peCache.ts = Date.now()

  return { pe: allPE, pb: allPB }
}

// ==================== 10年期国债收益率 ====================
async function fetchBondYield10Y() {
  try {
    // EM datacenter RPTA_WEB_TREASURYYIELD: EMM00166466 = 10年期国债到期收益率
    const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_WEB_TREASURYYIELD&columns=SOLAR_DATE,EMM00166466&pageSize=3&sortColumns=SOLAR_DATE&sortTypes=-1&source=WEB&client=WEB'
    const data = await fetchJSON(url)
    const items = data.result?.data || []
    for (const item of items) {
      if (item.EMM00166466 && item.EMM00166466 > 0) {
        return +item.EMM00166466.toFixed(2)
      }
    }
  } catch (_) {}
  return BOND_YIELD_10Y
}

// ==================== 估值数据 ====================

// 主源: 东方财富 K线
async function fetchIndexKlineEM(secid, limit = 300) {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=${limit}`
  const data = await fetchJSON(url)
  if (!data.data?.klines || data.data.klines.length < 250) throw new Error('EM kline insufficient')

  const klines = data.data.klines.map(line => {
    const p = line.split(',')
    return { date: p[0], open: +p[1], close: +p[2], high: +p[3], low: +p[4], volume: +p[5], amount: +p[6] }
  })

  return {
    klines,
    latest: klines[klines.length - 1],
    latestAmount: klines[klines.length - 1].amount || 0,
    pe: data.data.pe || null,
    pb: data.data.pb || null,
    source: 'eastmoney'
  }
}

// 备源: 腾讯 K线
async function fetchIndexKlineTencent(secid, limit = 300) {
  const tc = secidToTc(secid)
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tc},day,,,${limit},`
  const data = await fetchTencentJSON(url)

  const raw = data.data?.[tc]?.day || data.data?.[tc]?.qfqday || []
  if (raw.length < 250) throw new Error('Tencent kline insufficient')

  const klines = raw.map(k => ({
    date: k[0], open: +k[1], close: +k[2], high: +k[3], low: +k[4],
    volume: +k[5], amount: +(k[6] || 0)
  }))

  // 腾讯指数 K 线不含成交额，从 qt.gtimg.cn 获取当日成交额 (f[37])
  let latestAmount = 0
  try {
    const qtText = await fetchGBK(`https://qt.gtimg.cn/q=${tc}`)
    const qtMap = parseQt(qtText)
    if (qtMap[tc] && qtMap[tc][37]) latestAmount = parseFloat(qtMap[tc][37]) * 10000
  } catch (_) {}

  const pe = null

  return {
    klines,
    latest: klines[klines.length - 1],
    latestAmount,
    pe,
    pb: null,
    source: 'tencent'
  }
}

// 多源容错入口
async function fetchIndexKline(secid, limit = 300) {
  try {
    return await fetchIndexKlineEM(secid, limit)
  } catch (e) {
    console.warn(`index kline EM failed for ${secid}:`, e.message)
  }
  try {
    return await fetchIndexKlineTencent(secid, limit)
  } catch (e) {
    console.warn(`index kline Tencent failed for ${secid}:`, e.message)
  }
  return null
}

async function handleValuation(ctx) {
  try {
    if (!isExpired(valuationCache, VALUATION_CACHE_TTL)) {
      ctx.body = ok(valuationCache.data)
      return
    }

    // 预取 PE 和国债收益率（与 K 线并行）
    const [peData, bondYield] = await Promise.all([
      fetchIndexPE().catch(() => ({ pe: {}, pb: {} })),
      fetchBondYield10Y()
    ])

    const result = []
    let usedSource = ''
    let totalAmount = 0

    for (const [key, secid] of Object.entries(INDEX_SECIDS)) {
      try {
        const kd = await fetchIndexKline(secid, 300)
        if (!kd || kd.klines.length < 250) continue

        const closes = kd.klines.map(k => k.close)
        const ma250 = closes.slice(-250).reduce((a, b) => a + b, 0) / 250
        const ma250_5ago = closes.slice(-255, -5).length >= 250
          ? closes.slice(-255, -5).reduce((a, b) => a + b, 0) / 250
          : ma250
        const ma250Direction = ma250 > ma250_5ago ? 'up' : ma250 < ma250_5ago ? 'down' : 'flat'
        const currentPrice = kd.latest.close

        // 52周高低
        const last250 = kd.klines.slice(-250)
        const high52w = Math.max(...last250.map(k => k.high))
        const low52w = Math.min(...last250.map(k => k.low))

        // PE: 优先用 datacenter 加权计算，其次用 K 线自带，最后用 EM 行情补充
        let pe = peData.pe?.[key] || kd.pe || null
        if (!pe && kd.source === 'eastmoney') {
          const quoteUrl = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=${secid}&fields=f2,f3,f9,f23`
          try {
            const qd = await fetchJSON(quoteUrl)
            const item = qd.data?.diff?.[0]
            if (item?.f9) pe = item.f9
          } catch (_) {}
        }

        const pb = peData.pb?.[key] || kd.pb || null
        const pePercentile = pe ? estimatePEPercentile(key, pe) : null
        const valuationLevel = pe ? getValuationLevel(pe) : 'unknown'

        // 股债利差: 1/PE × 100 - 国债收益率
        let equityBondSpread = null
        if (pe && pe > 0) {
          const ep = (1 / pe) * 100
          equityBondSpread = Math.round((ep - bondYield) * 100) / 100
        }

        // 两市成交额: 用 SH + SZ 的 K 线 amount
        if (key === 'sh' || key === 'sz') {
          totalAmount += kd.latestAmount || 0
        }

        result.push({
          code: key,
          name: INDEX_NAMES[key],
          price: currentPrice,
          pe,
          pePercentile,
          pb,
          ma250: Math.round(ma250 * 100) / 100,
          aboveMa250: currentPrice > ma250,
          ma250Direction,
          valuationLevel,
          equityBondSpread,
          high52w: Math.round(high52w * 100) / 100,
          low52w: Math.round(low52w * 100) / 100,
          latestAmount: kd.latestAmount || 0
        })

        if (!usedSource && kd.source) usedSource = kd.source
      } catch (e) {
        console.error(`valuation fetch error for ${key}:`, e.message)
      }
    }

    const responseData = {
      timestamp: new Date().toISOString(),
      source: usedSource,
      indices: result,
      totalAmount,
      bondYield10y: bondYield,
      overallValuation: getOverallValuation(result)
    }

    valuationCache.data = responseData
    valuationCache.ts = Date.now()
    valuationCache.source = usedSource

    ctx.body = ok(responseData)
  } catch (e) {
    console.error('valuation error:', e)
    ctx.body = fail(e.message)
  }
}

function estimatePEPercentile(indexKey, pe) {
  const ranges = {
    sh: { low: 10, mid: 15, high: 20, veryHigh: 28 },
    sz: { low: 14, mid: 22, high: 30, veryHigh: 40 },
    cyb: { low: 25, mid: 40, high: 55, veryHigh: 70 },
    hs300: { low: 9, mid: 12, high: 16, veryHigh: 22 }
  }
  const r = ranges[indexKey]
  if (!r) return 50
  if (pe <= r.low) return 10
  if (pe <= r.mid) return 15 + (pe - r.low) / (r.mid - r.low) * 25
  if (pe <= r.high) return 40 + (pe - r.mid) / (r.high - r.mid) * 25
  if (pe <= r.veryHigh) return 65 + (pe - r.high) / (r.veryHigh - r.high) * 25
  return 95
}

function getValuationLevel(pe) {
  if (pe < 15) return 'low'
  if (pe < 20) return 'fair'
  if (pe < 25) return 'elevated'
  return 'high'
}

function getOverallValuation(indices) {
  const shIdx = indices.find(i => i.code === 'sh')
  if (!shIdx) return { level: 'unknown', label: '数据不足' }

  const spread = shIdx.equityBondSpread
  if (spread === null || spread === undefined) {
    return { level: 'unknown', label: 'PE数据缺失', spread: null }
  }

  let level, label
  if (spread > 4) { level = 'very_attractive'; label = '极度低估' }
  else if (spread > 2.5) { level = 'attractive'; label = '偏低估' }
  else if (spread > 1) { level = 'fair'; label = '合理' }
  else if (spread > 0) { level = 'elevated'; label = '偏高' }
  else { level = 'high'; label = '高估' }

  return { level, label, spread }
}

// ==================== 宏观数据 ====================

async function fetchCPI() {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_CPI&columns=REPORT_DATE,TIME,NATIONAL_SAME,NATIONAL_SEQUENTIAL,NATIONAL_ACCUMULATE,CITY_SAME,RURAL_SAME&pageSize=6&sortColumns=REPORT_DATE&sortTypes=-1&source=WEB&client=WEB'
  const data = await fetchJSON(url)
  const items = data.result?.data || []
  if (!items.length) return null
  return {
    label: 'CPI',
    unit: '%',
    current: items[0].NATIONAL_SAME,
    prev: items[1]?.NATIONAL_SAME || null,
    sequential: items[0].NATIONAL_SEQUENTIAL,
    accumulate: items[0].NATIONAL_ACCUMULATE,
    // 成分组成：城市/农村分项（用于结构分析，非核心打分项）
    citySame: items[0].CITY_SAME,
    ruralSame: items[0].RURAL_SAME,
    date: items[0].TIME,
    history: items.slice(0, 6).map(i => ({ date: i.TIME, same: i.NATIONAL_SAME }))
  }
}

async function fetchPMI() {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_PMI&columns=REPORT_DATE,TIME,MAKE_INDEX,MAKE_SAME,NMAKE_INDEX,NMAKE_SAME&pageSize=6&sortColumns=REPORT_DATE&sortTypes=-1&source=WEB&client=WEB'
  const data = await fetchJSON(url)
  const items = data.result?.data || []
  if (!items.length) return null
  return {
    label: 'PMI',
    unit: '',
    makeIndex: items[0].MAKE_INDEX,
    makeSame: items[0].MAKE_SAME,
    nmakeIndex: items[0].NMAKE_INDEX,
    nmakeSame: items[0].NMAKE_SAME,
    prevMake: items[1]?.MAKE_INDEX || null,
    date: items[0].TIME,
    history: items.slice(0, 6).map(i => ({ date: i.TIME, make: i.MAKE_INDEX, nmake: i.NMAKE_INDEX }))
  }
}

async function fetchM2() {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_CURRENCY_SUPPLY&columns=REPORT_DATE,TIME,BASIC_CURRENCY,BASIC_CURRENCY_SAME,BASIC_CURRENCY_SEQUENTIAL,CURRENCY,CURRENCY_SAME,CURRENCY_SEQUENTIAL,FREE_CASH,FREE_CASH_SAME,FREE_CASH_SEQUENTIAL&pageSize=12&sortColumns=REPORT_DATE&sortTypes=-1&source=WEB&client=WEB'
  const data = await fetchJSON(url)
  const items = data.result?.data || []
  if (!items.length) return null
  const cur = items[0]
  const prev = items[1]
  return {
    label: 'M2/M1',
    unit: '%',
    m2Same: cur.BASIC_CURRENCY_SAME,
    m1Same: cur.CURRENCY_SAME,
    m0Same: cur.FREE_CASH_SAME,
    m0Sequential: cur.FREE_CASH_SEQUENTIAL,
    // 余额（万亿元）
    m2Balance: +(cur.BASIC_CURRENCY / 10000).toFixed(2),
    m1Balance: +(cur.CURRENCY / 10000).toFixed(2),
    m0Balance: +(cur.FREE_CASH / 10000).toFixed(2),
    m1m2Scissors: +(cur.CURRENCY_SAME - cur.BASIC_CURRENCY_SAME).toFixed(1),
    prevM2Same: prev?.BASIC_CURRENCY_SAME || null,
    prevM1Same: prev?.CURRENCY_SAME || null,
    prevScissors: prev ? +(prev.CURRENCY_SAME - prev.BASIC_CURRENCY_SAME).toFixed(1) : null,
    m2Sequential: cur.BASIC_CURRENCY_SEQUENTIAL,
    date: cur.TIME,
    history: items.slice(0, 12).map(i => ({
      date: i.TIME,
      m2: i.BASIC_CURRENCY_SAME,
      m1: i.CURRENCY_SAME,
      m0: i.FREE_CASH_SAME,
      scissors: +(i.CURRENCY_SAME - i.BASIC_CURRENCY_SAME).toFixed(1),
    })),
  }
}

async function fetchGDP() {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_GDP&columns=REPORT_DATE,TIME,DOMESTICL_PRODUCT_BASE,FIRST_PRODUCT_BASE,SECOND_PRODUCT_BASE,THIRD_PRODUCT_BASE,SUM_SAME,FIRST_SAME,SECOND_SAME,THIRD_SAME&pageSize=8&sortColumns=REPORT_DATE&sortTypes=-1&source=WEB&client=WEB'
  const data = await fetchJSON(url)
  const items = data.result?.data || []
  if (!items.length) return null
  const cur = items[0]
  const total = cur.DOMESTICL_PRODUCT_BASE
  return {
    label: 'GDP',
    unit: '%',
    gdpSame: cur.SUM_SAME,
    prevGdpSame: items[1]?.SUM_SAME || null,
    // 三次产业同比
    firstSame: cur.FIRST_SAME,
    secondSame: cur.SECOND_SAME,
    thirdSame: cur.THIRD_SAME,
    // 三次产业绝对值（亿元）与结构占比（%）
    gdpBase: total,
    firstBase: cur.FIRST_PRODUCT_BASE,
    secondBase: cur.SECOND_PRODUCT_BASE,
    thirdBase: cur.THIRD_PRODUCT_BASE,
    firstRatio: +(cur.FIRST_PRODUCT_BASE / total * 100).toFixed(1),
    secondRatio: +(cur.SECOND_PRODUCT_BASE / total * 100).toFixed(1),
    thirdRatio: +(cur.THIRD_PRODUCT_BASE / total * 100).toFixed(1),
    date: cur.TIME,
    history: items.slice(0, 8).map(i => ({
      date: i.TIME,
      gdp: i.SUM_SAME,
      first: i.FIRST_SAME,
      second: i.SECOND_SAME,
      third: i.THIRD_SAME,
    })),
  }
}

// PPI（工业生产者出厂价格）— 价格平减的核心输入
// 用途：把名义社融/信贷增速还原成实际物量增速，识别"价格虚增 vs 真实需求"
async function fetchPPI() {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ECONOMY_PPI&columns=REPORT_DATE,TIME,BASE,BASE_SAME,BASE_ACCUMULATE&pageSize=6&sortColumns=REPORT_DATE&sortTypes=-1&source=WEB&client=WEB'
  const data = await fetchJSON(url)
  const items = data.result?.data || []
  if (!items.length) return null
  return {
    label: 'PPI',
    unit: '%',
    current: items[0].BASE_SAME,        // 同比（%）
    prev: items[1]?.BASE_SAME || null,
    accumulate: items[0].BASE_ACCUMULATE,
    date: items[0].TIME,
    history: items.slice(0, 6).map(i => ({ date: i.TIME, same: i.BASE_SAME }))
  }
}

// ==================== 国家统计局分项数据爬取 ====================
// 国家统计局月度新闻稿含 CPI 8大类 / PPI 行业 / PMI 分项的完整表格
// 列表页 https://www.stats.gov.cn/sj/zxfbhjd/index.html 用于发现最新文章 URL

const STATS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchStatsText(url, timeoutMs = 12000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const res = await fetch(url, {
    headers: { 'User-Agent': STATS_UA, 'Accept': 'text/html,*/*' },
    signal: ctrl.signal
  })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

// 从国家统计局列表页找最新匹配文章 URL（支持翻页搜索）
async function findStatsArticleUrl(keyword, maxPages = 3) {
  const regex = new RegExp(`href="([^"]+)"[^>]*>\\s*([^<]*${keyword}[^<]*)`, 'i')
  for (let p = 0; p < maxPages; p++) {
    const listUrl = p === 0
      ? 'https://www.stats.gov.cn/sj/zxfb/'
      : `https://www.stats.gov.cn/sj/zxfb/index_${p}.html`
    try {
      const html = await fetchStatsText(listUrl)
      const m = html.match(regex)
      if (m) {
        let url = m[1]
        if (url.startsWith('./')) url = url.replace('./', 'https://www.stats.gov.cn/sj/zxfb/')
        else if (url.startsWith('/')) url = 'https://www.stats.gov.cn' + url
        return url
      }
    } catch (e) { /* 翻页失败继续下一页 */ }
  }
  return null
}

// 解析 HTML 表格所有行 → 二维数组（去除标签）
function parseHTMLRows(html) {
  const rows = []
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  let trMatch
  while ((trMatch = trRegex.exec(html))) {
    const tds = []
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g
    let tdMatch
    while ((tdMatch = tdRegex.exec(trMatch[1]))) {
      tds.push(tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
    }
    if (tds.length) rows.push(tds)
  }
  return rows
}

// CPI 8大类分项（食品烟酒/衣着/居住/生活用品/交通通信/教育文娱/医疗保健/其他用品）
const cpiDetailCache = { data: null, ts: 0 }
const CPI_DETAIL_CACHE_TTL = 12 * 60 * 60 * 1000

async function fetchCPIDetail() {
  if (cpiDetailCache.data && Date.now() - cpiDetailCache.ts < CPI_DETAIL_CACHE_TTL) {
    return cpiDetailCache.data
  }
  try {
    const articleUrl = await findStatsArticleUrl('居民消费价格')
    if (!articleUrl) return null
    const html = await fetchStatsText(articleUrl)
    const rows = parseHTMLRows(html)

    const categories = []
    for (const row of rows) {
      const m = row[0].match(/^[一二三四五六七八]、(.+)/)
      if (m && row.length >= 3) {
        categories.push({
          name: m[1].trim(),
          sequential: parseFloat(row[1]),   // 环比
          yoy: parseFloat(row[2]),           // 同比
          accumulate: row[3] ? parseFloat(row[3]) : null
        })
      }
    }
    if (categories.length < 8) return null

    const result = { categories: categories.slice(0, 8), source: 'stats.gov.cn' }
    cpiDetailCache.data = result
    cpiDetailCache.ts = Date.now()
    return result
  } catch (e) {
    console.warn('CPI detail fetch failed:', e.message)
    return null
  }
}

// PPI 行业分项（有色/煤炭/化工/黑色/石油等主要工业行业同比）
const ppiDetailCache = { data: null, ts: 0 }
const PPI_DETAIL_CACHE_TTL = 12 * 60 * 60 * 1000

async function fetchPPIDetail() {
  if (ppiDetailCache.data && Date.now() - ppiDetailCache.ts < PPI_DETAIL_CACHE_TTL) {
    return ppiDetailCache.data
  }
  try {
    const articleUrl = await findStatsArticleUrl('工业生产者出厂价格')
    if (!articleUrl) return null
    const html = await fetchStatsText(articleUrl)
    const rows = parseHTMLRows(html)

    // PPI 新闻稿表格列顺序: [名称, 环比, 同比, 累计]
    // 排除分类标题行（"一、""二、"开头），去重（页面可能含重复表格）
    const industries = []
    const seen = new Set()
    for (const row of rows) {
      if (row.length >= 3 && row[0].length > 2 && row[0].includes('业')
          && !/^[一二三四五六七八九十]、/.test(row[0])) {
        const yoy = parseFloat(row[2])  // 第3列：同比
        if (!isNaN(yoy) && !seen.has(row[0])) {
          seen.add(row[0])
          industries.push({ name: row[0].replace(/^\s+/, ''), yoy })
        }
      }
    }
    if (!industries.length) return null

    const result = { industries: industries.slice(0, 15), source: 'stats.gov.cn' }
    ppiDetailCache.data = result
    ppiDetailCache.ts = Date.now()
    return result
  } catch (e) {
    console.warn('PPI detail fetch failed:', e.message)
    return null
  }
}

// PMI 分项（制造业5项扩散指数：新订单/生产/从业人员/原材料库存/供应商配送时间）
const pmiDetailCache = { data: null, ts: 0 }
const PMI_DETAIL_CACHE_TTL = 12 * 60 * 60 * 1000

async function fetchPMIDetail() {
  if (pmiDetailCache.data && Date.now() - pmiDetailCache.ts < PMI_DETAIL_CACHE_TTL) {
    return pmiDetailCache.data
  }
  try {
    const articleUrl = await findStatsArticleUrl('采购经理指数')
    if (!articleUrl) return null
    const html = await fetchStatsText(articleUrl)
    // 去标签后的纯文本，用于正则匹配正文
    const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

    // 从正文提取制造业5项扩散指数 + 非制造业商务活动指数
    // 例: "生产指数为51.2%，比上月下降0.3个百分点"
    const patterns = [
      { name: '生产', re: /生产指数为(\d+\.?\d*)%/ },
      { name: '新订单', re: /新订单指数为(\d+\.?\d*)%/ },
      { name: '原材料库存', re: /原材料库存指数为(\d+\.?\d*)%/ },
      { name: '从业人员', re: /从业人员指数为(\d+\.?\d*)%/ },
      { name: '供应商配送时间', re: /供应商配送时间指数为(\d+\.?\d*)%/ },
      { name: '非制造业商务活动', re: /非制造业商务活动指数为(\d+\.?\d*)%/ },
    ]
    const items = []
    for (const p of patterns) {
      const m = text.match(p.re)
      if (m) {
        items.push({ name: p.name, index: parseFloat(m[1]) })
      }
    }
    if (!items.length) return null

    const result = { items, source: 'stats.gov.cn' }
    pmiDetailCache.data = result
    pmiDetailCache.ts = Date.now()
    return result
  } catch (e) {
    console.warn('PMI detail fetch failed:', e.message)
    return null
  }
}

// 社融分项（8项：人民币贷款/外币贷款/委托贷款/信托贷款/未贴现银承/企业债券/政府债券/股票融资）
// 数据源：央行新闻通稿列表页 → 最新"金融统计数据报告" → 正文解析年初累计分项
const sfDetailCache = { data: null, ts: 0 }
const SF_DETAIL_CACHE_TTL = 12 * 60 * 60 * 1000

async function findPbcArticleUrl() {
  const listUrl = 'http://www.pbc.gov.cn/goutongjiaoliu/113456/113469/index.html'
  const html = await fetchStatsText(listUrl)
  const m = html.match(/href="([^"]+)"[^>]*>[^<]*金融统计数据报告[^<]*</)
  if (!m) return null
  let url = m[1]
  if (url.startsWith('/')) url = 'http://www.pbc.gov.cn' + url
  return url
}

async function fetchSfDetail() {
  if (sfDetailCache.data && Date.now() - sfDetailCache.ts < SF_DETAIL_CACHE_TTL) {
    return sfDetailCache.data
  }
  try {
    const articleUrl = await findPbcArticleUrl()
    if (!articleUrl) return null
    const html = await fetchStatsText(articleUrl)
    const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

    // 定位社融增量段落
    const sfStart = text.indexOf('社会融资规模增量累计为')
    if (sfStart < 0) return null
    const section = text.substring(sfStart, sfStart + 800)

    const items = []
    // 统一格式：6个捕获组 = (增减词, 数字, 单位, 同比词, 同比数字, 同比单位)
    // 增减词为"减少"时增量为负，其余为正；同比词为"少增/多减/少"时同比为负
    const specs = [
      { name: '人民币贷款', re: /对实体经济发放的人民币贷款(增加)([\d.]+)(万亿元|亿元)，同比(多增|少增|多|少)([\d.]+)(万亿元|亿元)/ },
      { name: '外币贷款', re: /对实体经济发放的外币贷款折合人民币(增加)([\d.]+)(万亿元|亿元)，同比(多增|少增|多|少)([\d.]+)(万亿元|亿元)/ },
      { name: '委托贷款', re: /委托贷款(增加|减少)([\d.]+)(万亿元|亿元)，同比(多增|多减|少增|多|少)([\d.]+)(万亿元|亿元)/ },
      { name: '信托贷款', re: /信托贷款(增加|减少)([\d.]+)(万亿元|亿元)，同比(多增|多减|少增|多|少)([\d.]+)(万亿元|亿元)/ },
      { name: '未贴现银承', re: /未贴现的银行承兑汇票(增加|减少)([\d.]+)(万亿元|亿元)，同比(多增|多减|少增|多|少)([\d.]+)(万亿元|亿元)/ },
      { name: '企业债券', re: /企业债券净融资(增加)?([\d.]+)(万亿元|亿元)，同比(多增|多减|少增|多|少)([\d.]+)(万亿元|亿元)/ },
      { name: '政府债券', re: /政府债券净融资(增加)?([\d.]+)(万亿元|亿元)，同比(多增|多减|少增|多|少)([\d.]+)(万亿元|亿元)/ },
      { name: '股票融资', re: /非金融企业境内股票融资(增加)?([\d.]+)(万亿元|亿元)，同比(多增|多减|少增|多|少)([\d.]+)(万亿元|亿元)/ },
    ]
    for (const s of specs) {
      const m = section.match(s.re)
      if (m) {
        const toYi = (val, unit) => unit === '万亿元' ? Math.round(parseFloat(val) * 10000) : Math.round(parseFloat(val))
        const increment = (m[1] === '减少' ? -1 : 1) * toYi(m[2], m[3])
        const yoySign = (m[4] === '少增' || m[4] === '多减' || m[4] === '少') ? -1 : 1
        const yoyChange = yoySign * toYi(m[5], m[6])
        items.push({ name: s.name, increment, yoyChange })
      }
    }

    if (items.length < 6) return null

    // 提取累计期描述（如"前五个月"）
    const periodMatch = section.match(/(\d{4}年(?:前[\d一二三四五六七八九十]+个月|前[\d一二三四五六七八九十]+季度))社会融资规模增量累计为/)
    const period = periodMatch ? periodMatch[1] : ''

    const result = { items, period, source: 'pbc.gov.cn' }
    sfDetailCache.data = result
    sfDetailCache.ts = Date.now()
    return result
  } catch (e) {
    console.warn('SF detail fetch failed:', e.message)
    return null
  }
}

// 存款分项（住户/企业/财政/非银）— 复用央行"金融统计数据报告"
const depositDetailCache = { data: null, ts: 0 }
const DEPOSIT_DETAIL_CACHE_TTL = 12 * 60 * 60 * 1000

async function fetchDepositDetail() {
  if (depositDetailCache.data && Date.now() - depositDetailCache.ts < DEPOSIT_DETAIL_CACHE_TTL) {
    return depositDetailCache.data
  }
  try {
    const articleUrl = await findPbcArticleUrl()
    if (!articleUrl) return null
    const html = await fetchStatsText(articleUrl)
    const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

    // 定位存款分项段落："其中，住户存款增加X万亿元，非金融企业存款增加..."
    const depStart = text.indexOf('人民币存款增加')
    if (depStart < 0) return null
    const section = text.substring(depStart, depStart + 400)

    const items = []
    const specs = [
      { name: '住户存款', re: /住户存款增加([\d.]+)万亿元/ },
      { name: '非金融企业存款', re: /非金融企业存款增加([\d.]+)万亿元/ },
      { name: '财政性存款', re: /财政性存款增加([\d.]+)万亿元/ },
      { name: '非银行业金融机构存款', re: /非银行业金融机构存款增加([\d.]+)万亿元/ },
    ]
    for (const s of specs) {
      const m = section.match(s.re)
      if (m) items.push({ name: s.name, increment: +m[1] })
    }
    if (items.length < 3) return null

    // 存款余额与同比
    const balMatch = text.match(/人民币存款余额([\d.]+)万亿元，同比增长([\d.]+)%/)
    const totalDeposit = balMatch ? +balMatch[1] : null
    const totalDepositYoy = balMatch ? +balMatch[2] : null

    // 累计期
    const periodMatch = text.match(/前([\d一二三四五六七八九十]+)个月人民币存款增加/)
    const period = periodMatch ? `前${periodMatch[1]}个月` : ''

    const result = { items, totalDeposit, totalDepositYoy, period, source: 'pbc.gov.cn' }
    depositDetailCache.data = result
    depositDetailCache.ts = Date.now()
    return result
  } catch (e) {
    console.warn('Deposit detail fetch failed:', e.message)
    return null
  }
}

// GDP 分行业增加值 — 国家统计局"GDP初步核算结果"文章表1
const gdpDetailCache = { data: null, ts: 0 }
const GDP_DETAIL_CACHE_TTL = 24 * 60 * 60 * 1000

async function fetchGdpDetail() {
  if (gdpDetailCache.data && Date.now() - gdpDetailCache.ts < GDP_DETAIL_CACHE_TTL) {
    return gdpDetailCache.data
  }
  try {
    const articleUrl = await findStatsArticleUrl('国内生产总值初步核算结果', 4)
    if (!articleUrl) return null
    const html = await fetchStatsText(articleUrl)
    const text = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

    // 定位表1区域
    const t1Start = text.indexOf('表1')
    if (t1Start < 0) return null
    const t1End = text.indexOf('注：', t1Start)
    if (t1End < 0) return null
    const table = text.substring(t1Start, t1End)

    // 解析分行业行：名称 绝对额(亿元) 同比(%)
    // 格式如 "工业 103388 6.1" / "建筑业 13632 -3.8" / "#制造业 86960 6.3"
    const industries = []
    const rowRe = /([\u4e00-\u9fa5#、]+)\s+([\d.]+)\s+(-?[\d.]+)/g
    let m
    const seen = new Set()
    while ((m = rowRe.exec(table)) !== null) {
      const name = m[1].replace(/^#/, '')
      if (seen.has(name)) continue
      seen.add(name)
      // 排除表头文字
      if (['绝对额', '比上年同期增长', 'GDP', '第一产业', '第二产业', '第三产业', '农林牧渔业'].includes(name)) continue
      industries.push({ name, base: +m[2], yoy: +m[3] })
    }
    if (industries.length < 5) return null

    // 提取季度标题
    const titleMatch = text.match(/(\d{4}年[一二三四]季度)GDP初步核算/)
    const quarter = titleMatch ? titleMatch[1] : ''

    // GDP 环比增速（表3）
    const t3Idx = text.indexOf('表3')
    let qoq = null
    if (t3Idx >= 0) {
      const t3Section = text.substring(t3Idx, t3Idx + 300)
      const qoqMatch = t3Section.match(/2026\s+([\d.]+)/)
      if (qoqMatch) qoq = +qoqMatch[1]
    }

    const result = { industries, quarter, qoq, source: 'stats.gov.cn' }
    gdpDetailCache.data = result
    gdpDetailCache.ts = Date.now()
    return result
  } catch (e) {
    console.warn('GDP detail fetch failed:', e.message)
    return null
  }
}

// 社融数据 — 通过东方财富新闻搜索API解析（无直接数据接口）
async function fetchSocialFinancing() {
  try {
    // Step 1: 访问图表页获取 CSRF cookie
    const ctrl1 = new AbortController()
    const t1 = setTimeout(() => ctrl1.abort(), 10000)
    const pageRes = await fetch('https://www.macroview.club/chart?name=cn_sf', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
      },
      signal: ctrl1.signal,
      redirect: 'follow'
    })
    clearTimeout(t1)
    if (!pageRes.ok) return null

    // 从 Set-Cookie 提取 csrftoken
    const setCookies = pageRes.headers.getSetCookie()
    let csrfCookie = ''
    for (const c of setCookies) {
      const m = c.match(/csrftoken=([^;]+)/)
      if (m) { csrfCookie = m[1]; break }
    }
    const pageBody = await pageRes.text()
    const tokenMatch = pageBody.match(/csrfmiddlewaretoken\s*=\s*'([^']+)'/)
    const formToken = tokenMatch ? tokenMatch[1] : csrfCookie

    // Step 2: 调用 get-chart API
    const ctrl2 = new AbortController()
    const t2 = setTimeout(() => ctrl2.abort(), 10000)
    const apiRes = await fetch('https://www.macroview.club/get-chart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': csrfCookie,
        'Referer': 'https://www.macroview.club/chart?name=cn_sf',
        'Cookie': `csrftoken=${csrfCookie}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
      },
      body: `key=cn_sf&csrfmiddlewaretoken=${encodeURIComponent(formToken)}&start=&end=&num=&is_limited=`,
      signal: ctrl2.signal,
      redirect: 'follow'
    })
    clearTimeout(t2)
    if (!apiRes.ok) return null
    const data = await apiRes.json()
    const sfData = data?.cn_sf?.data?.sf
    if (!sfData || !sfData.length) return null

    // sfData: [["2026-04-28", 6200], ...] — 社融增量（亿）
    // 最新月份
    const latest = sfData[0] // 已按时间倒序
    const prev = sfData[1]
    const [, latestVal] = latest
    const [prevDateStr, prevVal] = prev

    const latestDate = new Date(latest[0])
    const year = latestDate.getFullYear()
    const month = latestDate.getMonth() + 1

    // 计算同比：找到去年同月的数据
    const lastYearStr = `${year - 1}-${String(month).padStart(2, '0')}`
    const yoyEntry = sfData.find(d => d[0].startsWith(lastYearStr))
    const yoyChange = yoyEntry ? latestVal - yoyEntry[1] : null

    // 计算存量同比增速（用最近12个月增量累计近似同比增速）
    // 取最近12个月增量总和 vs 前12个月增量总和
    const recent12 = sfData.slice(0, 12).reduce((s, d) => s + d[1], 0)
    const prev12 = sfData.slice(12, 24).reduce((s, d) => s + d[1], 0)
    const stockYoyGrowth = prev12 !== 0 ? Math.round((recent12 / prev12 - 1) * 1000) / 10 : null

    return {
      label: '社融',
      unit: '亿',
      year, month,
      increment: Math.round(latestVal),
      yoyChange: yoyChange != null ? Math.round(yoyChange) : null,
      stockYoyGrowth,
      date: `${year}年${month}月`,
      source: 'macroview.club'
    }
  } catch (e) {
    console.warn('fetchSocialFinancing error:', e.message)
    return null
  }
}

/**
 * 宏观因子评分（-2 ~ +2 分，作为九维判据的修正项）
 * 规则（总量 + 成分组成双重维度）：
 *  PMI > 50.5 → +1, PMI < 49.5 → -1
 *  M1-M2剪刀差收窄（比上月更正）→ +1, 扩大（比上月更负）→ -1
 *  CPI > 2% → 通胀压力 → -0.5, CPI < 0% → 通缩风险 → -1
 *  GDP同比 > 5.5% → +0.5, GDP同比 < 4.5% → -0.5
 *  社融：用实际增速（名义 - PPI）判断 → 名义强但实际弱视为价格虚增，下调
 *  GDP结构：二产(工业)偏弱但总量达标 → -0.3；工业领涨 → +0.3
 *  CPI城乡：显著背离时提示（弱信号，不打分）
 */
// 宏观因子评分体系（v2）
// 权重：PMI 1.5 / M2 1 / 社融 1 / CPI 0.5 / PPI 0.5 / GDP 0.5
// 区间：±0.3 / ±0.5 / ±1 多档，总分 clamp [-3, 3]
// 新增维度：PPI评分、货币-信用组合、PMI环比方向、CPI-PPI剪刀差、存款结构、社融结构
function scoreMacroFactors(cpi, pmi, m2, gdp, sf, ppi) {
  let score = 0
  const details = []

  // ===== PMI（权重1.5，月度领先指标，最高权重）=====
  // 双因子：绝对水平 + 环比方向
  if (pmi) {
    const idx = pmi.makeIndex
    const prev = pmi.prevMake
    const delta = prev != null ? +(idx - prev).toFixed(2) : null
    let pmiScore = 0
    // 绝对水平
    if (idx > 51) pmiScore += 1
    else if (idx > 50.5) pmiScore += 0.5
    else if (idx < 49) pmiScore -= 1
    else if (idx < 49.5) pmiScore -= 0.5
    // 环比方向（趋势确认）
    if (delta != null) {
      if (delta > 0.5) pmiScore += 0.5
      else if (delta < -0.5) pmiScore -= 0.5
    }
    pmiScore = Math.max(-1.5, Math.min(1.5, pmiScore))
    score += pmiScore
    const trend = delta != null ? (delta > 0 ? `环比+${delta}` : `环比${delta}`) : ''
    const signal = pmiScore > 0.3 ? 'positive' : pmiScore < -0.3 ? 'negative' : 'neutral'
    details.push({ factor: 'PMI', value: idx, signal, desc: `制造业PMI ${idx}${trend ? '，' + trend : ''}，${idx >= 50 ? '扩张区间' : '收缩区间'}${delta != null && delta > 0 ? '且改善' : delta != null && delta < 0 ? '但走弱' : ''}` })
  }

  // ===== M2/M1（权重1）=====
  // 双因子：剪刀差绝对水平 + 环比变化方向
  if (m2) {
    const scissors = m2.m1m2Scissors
    const prevScissors = m2.prevScissors
    let m2Score = 0
    if (scissors != null) {
      // 绝对水平：剪刀差越接近0越好，深度负值=企业活期存款收缩、经营活力弱
      if (scissors > -1) m2Score += 0.5
      else if (scissors < -5) m2Score -= 0.5
      // 环比方向：收窄=改善
      if (prevScissors != null) {
        if (scissors > prevScissors) m2Score += 0.5
        else if (scissors < prevScissors) m2Score -= 0.5
      }
    }
    // M0 高增 = 消费/交易活跃（领先指标）
    if (m2.m0Same != null) {
      if (m2.m0Same > 12) m2Score += 0.3
      else if (m2.m0Same < 0) m2Score -= 0.3
    }
    m2Score = Math.max(-1, Math.min(1, m2Score))
    score += m2Score
    const signal = m2Score > 0.3 ? 'positive' : m2Score < -0.3 ? 'negative' : 'neutral'
    const trend = (scissors != null && prevScissors != null) ? (scissors > prevScissors ? '收窄' : '扩大') : ''
    details.push({ factor: 'M1-M2剪刀差', value: scissors, signal, desc: `剪刀差${scissors}%${trend ? '，' + trend : ''}；M0 ${m2.m0Same ?? '-'}%` })
  }

  // ===== 社融（权重1）=====
  // 双因子：实际增速 + 结构（政府债独撑 vs 信贷扩张）
  if (sf && sf.stockYoyGrowth != null) {
    const nominalG = sf.stockYoyGrowth
    const ppiInflation = ppi?.current
    const realG = ppiInflation != null ? +(nominalG - ppiInflation).toFixed(1) : nominalG
    const hasDeflator = ppiInflation != null
    let sfScore = 0
    if (realG > 8) sfScore += 0.5
    else if (realG > 5) sfScore += 0.3
    else if (realG < -5) sfScore -= 0.5
    else if (realG < 0) sfScore -= 0.3

    // 结构：社融分项中人民币贷款 vs 政府债券
    const sfDetail = sf.detail
    if (sfDetail?.items?.length) {
      const loanItem = sfDetail.items.find(i => i.name === '人民币贷款')
      const govItem = sfDetail.items.find(i => i.name === '政府债券')
      if (loanItem) {
        // 信贷弱+政府债强 = 财政独撑、实体需求弱，含金量低
        if (loanItem.yoyChange < 0 && govItem && govItem.yoyChange > 0) {
          sfScore -= 0.3
          details.push({ factor: '社融结构', value: loanItem.yoyChange, signal: 'negative', desc: `信贷同比少增${Math.abs(loanItem.yoyChange)}亿、政府债多增${govItem.yoyChange}亿，财政独撑、实体需求偏弱` })
        } else if (loanItem.yoyChange > 0) {
          sfScore += 0.3
          details.push({ factor: '社融结构', value: loanItem.yoyChange, signal: 'positive', desc: `人民币贷款同比多增${loanItem.yoyChange}亿，实体信贷扩张扎实` })
        } else if (loanItem.yoyChange < -5000) {
          // 信贷大幅少增（即使政府债也弱）= 实体融资需求疲软
          sfScore -= 0.3
          details.push({ factor: '社融结构', value: loanItem.yoyChange, signal: 'negative', desc: `人民币贷款同比少增${Math.abs(loanItem.yoyChange)}亿，实体信贷需求疲软` })
        }
      }
    }

    sfScore = Math.max(-1, Math.min(1, sfScore))
    score += sfScore
    const signal = sfScore > 0.3 ? 'positive' : sfScore < -0.3 ? 'negative' : 'neutral'
    details.push({ factor: '社融', value: realG, signal, desc: hasDeflator ? `社融实际增速${realG}%(名义${nominalG}%剔除PPI)` : `社融年增量同比${nominalG}%` })
  }

  // ===== CPI（权重0.5）=====
  if (cpi) {
    let cpiScore = 0
    if (cpi.current > 3) cpiScore -= 0.5
    else if (cpi.current > 2) cpiScore -= 0.3
    else if (cpi.current < 0) cpiScore -= 0.5
    else if (cpi.current >= 0 && cpi.current <= 2) cpiScore += 0.3
    score += cpiScore
    const signal = cpiScore > 0.1 ? 'positive' : cpiScore < -0.1 ? 'negative' : 'neutral'
    const desc = cpi.current > 2 ? `CPI ${cpi.current}%，通胀压力偏强` : cpi.current < 0 ? `CPI ${cpi.current}%，通缩风险` : `CPI ${cpi.current}%，温和水平`
    details.push({ factor: 'CPI', value: cpi.current, signal, desc })
  }

  // ===== PPI（权重0.5，新增）=====
  // PPI 转正/环比改善 = 工业周期回暖，强信号
  if (ppi) {
    let ppiScore = 0
    if (ppi.current > 3) ppiScore += 0.5
    else if (ppi.current > 0) ppiScore += 0.3
    else if (ppi.current < -3) ppiScore -= 0.5
    else if (ppi.current < 0) ppiScore -= 0.3
    // 环比改善
    if (ppi.prev != null) {
      if (ppi.current > ppi.prev) ppiScore += 0.3
      else if (ppi.current < ppi.prev) ppiScore -= 0.3
    }
    ppiScore = Math.max(-0.5, Math.min(0.5, ppiScore))
    score += ppiScore
    const signal = ppiScore > 0.1 ? 'positive' : ppiScore < -0.1 ? 'negative' : 'neutral'
    const trend = ppi.prev != null ? (ppi.current > ppi.prev ? '涨幅扩大' : ppi.current < ppi.prev ? '跌幅加深' : '持平') : ''
    details.push({ factor: 'PPI', value: ppi.current, signal, desc: `PPI ${ppi.current}%${trend ? '，' + trend : ''}，${ppi.current >= 0 ? '工业品价格回升' : '工业品价格仍承压'}` })
  }

  // ===== CPI-PPI 剪刀差（组合维度，反映上下游利润分配）=====
  if (cpi && ppi && cpi.current != null && ppi.current != null) {
    const cp = +(cpi.current - ppi.current).toFixed(1)
    // CPI-PPI 过大 = 下游涨价但上游通缩，制造业利润受挤压
    if (cp > 5) {
      score -= 0.3
      details.push({ factor: 'CPI-PPI剪刀差', value: cp, signal: 'negative', desc: `CPI-PPI差${cp}个百分点，上下游价格背离，制造业利润受挤压` })
    } else if (cp >= 0 && cp <= 3) {
      details.push({ factor: 'CPI-PPI剪刀差', value: cp, signal: 'neutral', desc: `CPI-PPI差${cp}个百分点，价格传导顺畅` })
    } else if (cp < 0) {
      details.push({ factor: 'CPI-PPI剪刀差', value: cp, signal: 'positive', desc: `PPI高于CPI ${Math.abs(cp)}个百分点，上游成本推动，需警惕输入型通胀` })
    }
  }

  // ===== GDP（权重0.5，滞后确认指标）=====
  if (gdp) {
    let gdpScore = 0
    if (gdp.gdpSame > 5.5) gdpScore += 0.5
    else if (gdp.gdpSame < 4.5) gdpScore -= 0.5
    else gdpScore += 0.3
    score += gdpScore
    const signal = gdpScore > 0.1 ? 'positive' : gdpScore < -0.1 ? 'negative' : 'neutral'
    details.push({ factor: 'GDP', value: gdp.gdpSame, signal, desc: `GDP增速${gdp.gdpSame}%，${gdp.gdpSame > 5.5 ? '偏强' : gdp.gdpSame < 4.5 ? '偏弱' : '平稳'}` })
  }

  // ===== GDP 结构（成分组成维度）=====
  if (gdp && gdp.secondSame != null && gdp.thirdSame != null) {
    const ind = gdp.secondSame
    const svc = gdp.thirdSame
    if (gdp.gdpSame >= 5 && ind < 4) {
      score -= 0.3; details.push({ factor: 'GDP结构', value: ind, signal: 'negative', desc: `总量${gdp.gdpSame}%但二产(工业)仅${ind}%，制造业/投资偏弱` })
    } else if (ind >= 5.5 && svc < 4) {
      score += 0.3; details.push({ factor: 'GDP结构', value: ind, signal: 'positive', desc: `工业${ind}%领涨(周期领先)，结构偏积极` })
    } else if (ind >= 5 && svc >= 5) {
      details.push({ factor: 'GDP结构', value: ind, signal: 'positive', desc: `二产${ind}%/三产${svc}%，扩张面广、结构均衡` })
    } else {
      details.push({ factor: 'GDP结构', value: ind, signal: 'neutral', desc: `二产${ind}%/三产${svc}%` })
    }
  }

  // ===== 货币-信用组合（新增，组合维度）=====
  // M2 增速 vs 社融实际增速四象限：判断政策传导效率
  if (m2 && sf && m2.m2Same != null && sf.stockYoyGrowth != null) {
    const m2G = m2.m2Same
    const sfG = sf.stockYoyGrowth
    const m2High = m2G >= 8
    const sfHigh = sfG >= 8
    if (m2High && sfHigh) {
      score += 0.5; details.push({ factor: '货币-信用', value: `${m2G}/${sfG}`, signal: 'positive', desc: `宽货币(M2 ${m2G}%)+宽信用(社融${sfG}%)，政策传导顺畅，流动性充裕` })
    } else if (m2High && !sfHigh) {
      score -= 0.3; details.push({ factor: '货币-信用', value: `${m2G}/${sfG}`, signal: 'negative', desc: `宽货币(M2 ${m2G}%)+紧信用(社融${sfG}%)，资金淤积金融体系，实体需求弱` })
    } else if (!m2High && sfHigh) {
      details.push({ factor: '货币-信用', value: `${m2G}/${sfG}`, signal: 'neutral', desc: `稳货币(M2 ${m2G}%)+宽信用(社融${sfG}%)，信用自主扩张` })
    } else {
      details.push({ factor: '货币-信用', value: `${m2G}/${sfG}`, signal: 'neutral', desc: `M2 ${m2G}%/社融${sfG}%，双稳` })
    }
  }

  // ===== 存款结构（新增，成分组成维度）=====
  // 住户存款占比过高 = 预防性储蓄、消费意愿弱
  if (m2?.detail?.items?.length) {
    const items = m2.detail.items
    const household = items.find(i => i.name === '住户存款')
    const enterprise = items.find(i => i.name === '非金融企业存款')
    if (household && enterprise) {
      const total = items.reduce((s, i) => s + i.increment, 0)
      const hhRatio = total > 0 ? +(household.increment / total * 100).toFixed(0) : 0
      const entRatio = total > 0 ? +(enterprise.increment / total * 100).toFixed(0) : 0
      // 住户存款占比显著高于企业 = 资金回流居民、企业活化弱
      if (hhRatio > 35 && hhRatio > entRatio * 2) {
        score -= 0.3; details.push({ factor: '存款结构', value: hhRatio, signal: 'negative', desc: `住户存款占比${hhRatio}%、企业存款仅${entRatio}%，预防性储蓄高、企业活化弱` })
      } else if (entRatio > hhRatio) {
        score += 0.3; details.push({ factor: '存款结构', value: entRatio, signal: 'positive', desc: `企业存款占比${entRatio}%超住户${hhRatio}%，经营活力回升` })
      }
    }
  }

  // ===== CPI 城乡分化（弱信号，仅显著背离时提示）=====
  if (cpi && cpi.citySame != null && cpi.ruralSame != null) {
    const diff = +(cpi.citySame - cpi.ruralSame).toFixed(1)
    if (Math.abs(diff) >= 1) {
      const higher = diff > 0 ? '城市' : '农村'
      details.push({ factor: 'CPI城乡', value: diff, signal: 'neutral', desc: `${higher}CPI偏高(城${cpi.citySame}%/乡${cpi.ruralSame}%)，需求结构分化` })
    }
  }

  // Clamp to [-3, 3]
  score = Math.max(-3, Math.min(3, +score.toFixed(1)))

  return { score, details }
}

async function handleMacro(ctx) {
  try {
    if (macroCache.data && Date.now() - macroCache.ts < MACRO_CACHE_TTL) {
      ctx.body = ok(macroCache.data)
      return
    }

    const [cpi, pmi, m2, gdp, sf, ppi, cpiDetail, ppiDetail, pmiDetail, sfDetail, depositDetail, gdpDetail] = await Promise.all([
      fetchCPI().catch(e => { console.warn('CPI fetch failed:', e.message); return null }),
      fetchPMI().catch(e => { console.warn('PMI fetch failed:', e.message); return null }),
      fetchM2().catch(e => { console.warn('M2 fetch failed:', e.message); return null }),
      fetchGDP().catch(e => { console.warn('GDP fetch failed:', e.message); return null }),
      fetchSocialFinancing().catch(e => { console.warn('SocialFinancing fetch failed:', e.message); return null }),
      fetchPPI().catch(e => { console.warn('PPI fetch failed:', e.message); return null }),
      fetchCPIDetail().catch(e => { console.warn('CPI detail fetch failed:', e.message); return null }),
      fetchPPIDetail().catch(e => { console.warn('PPI detail fetch failed:', e.message); return null }),
      fetchPMIDetail().catch(e => { console.warn('PMI detail fetch failed:', e.message); return null }),
      fetchSfDetail().catch(e => { console.warn('SF detail fetch failed:', e.message); return null }),
      fetchDepositDetail().catch(e => { console.warn('Deposit detail fetch failed:', e.message); return null }),
      fetchGdpDetail().catch(e => { console.warn('GDP detail fetch failed:', e.message); return null }),
    ])

    // 评分时传入带 detail 的完整对象，使结构评分可用
    const m2WithDetail = depositDetail ? { ...m2, detail: depositDetail } : m2
    const sfWithDetail = sfDetail ? { ...sf, detail: sfDetail } : sf
    const scored = scoreMacroFactors(cpi, pmi, m2WithDetail, gdp, sfWithDetail, ppi)

    const responseData = {
      timestamp: new Date().toISOString(),
      cpi: cpiDetail ? { ...cpi, detail: cpiDetail } : cpi,
      pmi: pmiDetail ? { ...pmi, detail: pmiDetail } : pmi,
      m2: depositDetail ? { ...m2, detail: depositDetail } : m2,
      gdp: gdpDetail ? { ...gdp, detail: gdpDetail } : gdp,
      // 成分组成：附 PPI 平减后的实际增速（与 scoreMacroFactors 同公式），供前端展示
      sf: sfDetail ? { ...(ppi?.current != null && sf?.stockYoyGrowth != null
        ? { ...sf, realStockYoyGrowth: +(sf.stockYoyGrowth - ppi.current).toFixed(1) }
        : sf), detail: sfDetail } : (ppi?.current != null && sf?.stockYoyGrowth != null
        ? { ...sf, realStockYoyGrowth: +(sf.stockYoyGrowth - ppi.current).toFixed(1) }
        : sf),
      ppi: ppiDetail ? { ...ppi, detail: ppiDetail } : ppi,
      macroScore: scored.score,
      macroDetails: scored.details
    }

    macroCache.data = responseData
    macroCache.ts = Date.now()

    ctx.body = ok(responseData)
  } catch (e) {
    console.error('macro error:', e)
    ctx.body = fail(e.message)
  }
}

// ==================== 路由注册 ====================
export function registerAnalysisRoutes(router) {
  router.get('/api/analysis/sectors', handleSectors)
  router.get('/api/analysis/valuation', handleValuation)
  router.get('/api/analysis/macro', handleMacro)
}
