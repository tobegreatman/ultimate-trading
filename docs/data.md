# Ultimate Trading System — 数据接口与数据源文档（data.md）

> **版本**：3.0.0 ｜ **更新**：2026-06-22
> **说明**：本文档详细描述系统所有 API 接口的请求/响应结构、数据源、字段映射、缓存策略与回退机制，供 AI 据此精确实现数据层。
> **排除范围**：`server/analysis.js`（板块轮动 / 估值 / 周期 / 宏观）相关接口不实现。

---

## 1. 总体规范

### 1.1 后端服务
- **框架**：Koa 2 + @koa/router + cors + bodyparser + logger
- **端口**：`process.env.PORT || 3001`
- **入口**：`server/index.js`，子模块通过 `register*Routes(router)` 注册

### 1.2 统一响应格式
```typescript
// 成功
{ ok: true, data: T }
// 失败
{ ok: false, error: string }
```

### 1.3 SSE 流式响应（AI 判断专用）
```
HTTP/1.1 200
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"text","content":"..."}\n\n
data: {"type":"text","content":"..."}\n\n
data: [DONE]\n\n
```

### 1.4 HTTP 请求工具
- **`fetchJSON(url, timeoutMs=8000)`**：基于 https 模块，含超时与 UA/Referer 头
- **`fetchJSONviaHttps(url, timeoutMs=8000)`**：强制 IPv4 解析（避免东财部分域名 IPv6 不通）
- **请求头**（东财）：
  ```javascript
  {
    Referer: 'https://quote.eastmoney.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...'
  }
  ```

### 1.5 时区处理
所有日期统一使用 `Asia/Shanghai` 时区：
- `cnDateStr()` → `YYYY-MM-DD`
- `cnDateCompact()` → `YYYYMMDD`（东财 API 参数）
- `cnHour()` → 小时数（数值）

### 1.6 缓存策略

#### 1.6.1 服务端缓存（`server/index.js`）
```javascript
const apiCache = new Map()  // 全局共享
function getCached(key, ttl)   // 命中返回 data，否则 null
function setCache(key, data)   // 写入 { data, ts: Date.now() }
```

| Key 前缀 | TTL | 说明 |
|----------|-----|------|
| `indices` | 5min | 三大指数报价 + K 线 + MA |
| `breadth` | 30s | 涨跌家数 |
| `northbound` | 5min | 北向资金（大盘） |
| `margin` | 5min | 融资余额（大盘） |
| `intraday_{code}` | 5min | 个股分时 |
| `intraday5d_{code}` | 5min | 个股 5 日分时 |
| `ai_xuangu_{kw}` | 5min | AI 选股结果 |

#### 1.6.2 服务端缓存（`server/stockAnalysis.js`）
独立 Map 缓存，每条上限 200，LRU 淘汰：

| 缓存 | TTL | 说明 |
|------|-----|------|
| `fundamentalCache` | 30min | 基本面（含实时 PE/PB） |
| `capitalCache` | 5min | 量价分析（派生） |
| `marginCache` | 30min | 融资融券 |
| `northboundCache` | 10min | 北向持股 |
| `mainForceCache` | 5min | 主力资金日度 |
| `intradayMfCache` | 3min（稀疏数据 30s） | 主力资金分时 |
| `shareholderCache` | 60min | 股东户数 |
| `billboardCache` | 30min | 龙虎榜 |
| `holderIncreaseCache` | 60min | 股东增减持 |
| `pledgeCache` | 30min | 股权质押 |
| `goodwillCache` | 6h | 商誉 |
| `sectorCodeCache` | 30min | 个股 → BK 代码 |
| `sectorTableCache` | 5min | 全市场板块资金表（单条） |
| `benchmarkCache` | 30min | 沪深 300 基准 K 线 |

#### 1.6.3 AI 缓存（`server/aiJudge.js`）
- Map，上限 100，LRU 淘汰
- TTL：1 分钟
- Key：`${code}_${total}_${keySignals.slice(0,60)}`

### 1.7 多源回退（`server/fallback.js`）
主源（东财）失败时按序回退：
- **指数**：东财 push2his → 腾讯 `web.ifzq.gtimg.cn`
- **个股 K 线**：东财 push2his → 腾讯
- **个股分时**：东财 trends2 → 腾讯
- **个股基础**：东财 push2his → 腾讯
- **批量报价**：东财 ulist.np → 腾讯
- **搜索**：东财 searchapi → 腾讯

---

## 2. 市场数据 API（`server/index.js`）

### 2.1 `GET /api/health`
健康检查。
**响应**：`{ ok: true, data: { status: 'ok', uptime: number } }`

### 2.2 `GET /api/market/indices`
三大指数（上证/深证/创业板）报价 + K 线 + MA。

**数据源**：
1. 东财 `push2his.eastmoney.com/api/qt/ulist.np/get`（报价）
2. 东财 `push2his.eastmoney.com/api/qt/stock/kline/get`（K 线）
3. 腾讯 `web.ifzq.gtimg.cn/appstock/app/fqkline/get`（K 线不足 35 根时补取）

**响应**：
```typescript
{
  ok: true,
  data: {
    sh: {
      quote: {
        code: '000001', name: '上证指数',
        close: number, change: number, changeAmt: number,
        high: number, low: number, open: number,
        volume: number, amount: number
      },
      klines: [{ date, open, close, high, low, volume, amount }],  // 120 根
      ma: { ma20: number, ma60: number, ma120: number },
      ma60Trend: [number, number, number, number]  // 近 4 个 MA60 值判断趋势
    },
    sz: { ... },  // 同上
    cyb: { ... }  // 同上
  }
}
```

**东财字段映射**（`f` 前缀）：
- `f2`=close, `f3`=change%, `f4`=changeAmt, `f5`=volume, `f6`=amount
- `f15`=high, `f16`=low, `f17`=open, `f12`=code, `f14`=name

### 2.3 `GET /api/market/breadth`
全市场涨跌家数。TTL 30s。

**数据源**（按序回退）：
1. 东财 `push2.eastmoney.com/api/qt/ulist/get`（f104=涨, f105=跌, f106=平，secids=1.000002,0.399002,0.899050）
2. 东财 `push2.eastmoney.com/api/qt/clist/get`（全市场扫描，统计 f3 涨跌）
3. JRJ `/quot-dc/zdt/v1/market`（stock.up/down/flat）

**响应**：`{ ok: true, data: { up: number, down: number, flat: number } }`

### 2.4 `GET /api/market/indices/intraday`
三大指数分时数据。

**数据源**：东财 `push2his.eastmoney.com/api/qt/stock/trends2/get`（ndays=1）→ 腾讯回退

**响应**：
```typescript
{
  ok: true,
  data: {
    sh: {
      name: '上证指数', code: '000001', preClose: number,
      trends: [{ time: '09:30', close: number, avg: number, volume: number }]
    },
    sz: { ... }, cyb: { ... }
  }
}
```

**字段映射**：trends 字段 `f51`=time, `f52`=close, `f53`=avg, `f55`=volume

### 2.5 `GET /api/market/northbound`
北向资金近 30 日流向（大盘）。TTL 5min。

**数据源**：
1. 东财 `datacenter-web.eastmoney.com/api/data/v1/get`（reportName=RPT_MUTUAL_DEALAMT）
2. 证券时报 `stcn`（东财失败时回退）

**响应**：
```typescript
{
  ok: true,
  data: [{
    date: '2026-06-20',
    nfAmt: number,      // 北向净买入（元）
    sscAmt: number,     // 深股通
    stAmt: number,      // 沪股通
    sciRate: number,    // 北向资金占流通市值比
    sscRate: 0          // 深证成指涨跌（东财字段异常，固定 0）
  }]
}
```

### 2.6 `GET /api/market/margin`
融资余额近 10 日（大盘）。TTL 5min。

**数据源**：东财 `datacenter-web.eastmoney.com`（reportName=RPTA_RZRQ_LSHJ）

**响应**：
```typescript
{
  ok: true,
  data: [{
    date: '2026-06-20',
    rzBalance: number,    // 融资余额
    rzBuy: number,        // 融资买入额
    rzRepay: number,      // 融资偿还额
    rzNetBuy: number,     // 融资净买入
    rqBalance: number,    // 融券余额
    totalBalance: number  // 融资融券余额
  }]
}
```

### 2.7 `GET /api/market/limit-stats`
涨停跌停统计。无缓存（实时）。

**数据源**（并行获取）：
- JRJ `/quot-dc/zdt/v1/market`（涨/跌停数、5%+、市场热度、分布桶）
- JRJ `/quot-dc/zdt/market_history`（近 10 日历史）
- 东财 `datacenter-web`（reportName=RPT_CUSTOM_INTSELECTION_LIMIT，自然板/炸板/封板率/赚钱效应）
- 东财 `push2.eastmoney.com/api/qt/clist/get`（板块涨停分布，fs=m:90+t:2）
- 东财 `push2ex.eastmoney.com/getTopicZTPool`（连板池）
- 东财 `push2ex.eastmoney.com/getTopicZDFenBu`（涨跌分布）

**响应**：
```typescript
{
  ok: true,
  data: {
    date: '2026-06-20',
    limitUp: number,           // 涨停数
    limitDown: number,         // 跌停数
    up5p: number,              // 涨幅>5%家数
    down5p: number,            // 跌幅>5%家数
    temperature: number,       // 市场热度
    totalStocks: number,
    stopped: number,           // 停牌数
    buckets: [{...}],          // 涨跌幅分布桶
    naturalLimit: number,      // 自然板
    touchLimit: number,        // 炸板数
    sealingRate: number,       // 封板率%
    moneyEffect: number,       // 赚钱效应
    t1PctChange: number,       // 昨日涨停今日表现
    history: [{
      date, limitUp, limitDown, upMoM, downMoM, marketAmount
    }],
    sectorDistribution: [{ name, limitUp }],  // TOP5 板块
    topSectorConcentration: number,           // TOP1 板块占比
    consecutiveBoards: number,                // 连板数
    maxConsecutiveDays: number,
    topConsecutiveStocks: [{ name, days }]
  }
}
```

---

## 3. 个股基础 API（`server/index.js`）

### 3.1 `GET /api/stock/:code/kline`
个股 K 线（默认 120 日）。

**Query**：
- `klt`：周期（101=日K, 102=周K, 103=月K），默认 101
- `lmt`：数量，默认 120

**数据源**：东财 `push2his.eastmoney.com/api/qt/stock/kline/get` → 腾讯回退

**响应**：
```typescript
{
  ok: true,
  data: {
    code: '600519', name: '贵州茅台',
    klines: [{
      date: '2026-06-20',
      open: number, close: number, high: number, low: number,
      volume: number, amount: number, turnover: number  // turnover=f61
    }],
    prevClose: number | null
  }
}
```

**字段映射**（fields2）：`f51`=date, `f52`=open, `f53`=close, `f54`=high, `f55`=low, `f56`=volume, `f57`=amount, `f61`=turnover

### 3.2 `GET /api/stock/:code/kline5y`
个股 5 年 K 线（约 1200 日）。同上结构，无 prevClose。

### 3.3 `GET /api/stock/:code/intraday`
个股分时（当日）。TTL 5min。

**数据源**：东财 `trends2/get`（ndays=1）→ 腾讯回退

**响应**：
```typescript
{
  ok: true,
  data: {
    code: '600519', name: '贵州茅台', preClose: number,
    trends: [{ time: '09:30', close: number, avg: number, volume: number }]
  }
}
```

### 3.4 `GET /api/stock/:code/intraday5d`
个股 5 日分时。TTL 5min。同上结构。

### 3.5 `GET /api/stock/:code/basic`
个股基础信息（PE/PB/市值等）。

**数据源**：东财 `push2his.eastmoney.com/api/qt/stock/get` → 腾讯回退

**响应**：
```typescript
{
  ok: true,
  data: {
    code: '600519', name: '贵州茅台',
    industry: '白酒', region: '上海', concept: '...',
    pe: number, pb: number,
    totalMarketCap: number,       // 总市值（元）
    circulationMarketCap: number, // 流通市值
    circulationShares: number,
    roe: number, grossMargin: number, netMargin: number,
    revenueGrowth: number, profitGrowth: number, debtRatio: number,
    high52w: number, low52w: number
  }
}
```

**字段映射**：`f43`=close, `f44`=high, `f45`=low, `f47`=open, `f48`=volume, `f57`=code, `f58`=name, `f116`=totalMktCap, `f117`=circMktCap, `f127`=industry, `f162`=circShares, `f167`=PB, `f170`=low52w, `f173`=high52w, `f184`=PE, `f186`=grossMargin, `f187`=netMargin, `f188`=revenueGrowth, `f190`=ROE, `f191`=profitGrowth, `f192`=debtRatio

### 3.6 `GET /api/stock/batch/quotes`
批量报价。

**Query**：`codes` = 逗号分隔的股票代码

**数据源**：东财 `push2his.eastmoney.com/api/qt/ulist.np/get` → 腾讯回退

**响应**：
```typescript
{
  ok: true,
  data: {
    '600519': {
      name: '贵州茅台', close: number, change: number, changeAmt: number,
      high: number, low: number, open: number,
      volume: number, amount: number, turnover: number
    }
  }
}
```

### 3.7 `GET /api/stock/search`
股票搜索。

**Query**：`kw` = 关键字（代码/名称/拼音）

**数据源**：东财 `searchapi.eastmoney.com/api/suggest/get` → 腾讯回退

**响应**：
```typescript
{
  ok: true,
  data: [
    { code: '600519', name: '贵州茅台', type: 'A股' }
  ]  // 最多 6 条
}
```

**过滤**：仅保留 A 股主板（Classify=AStock）、科创板（23）、创业板（80）

### 3.8 `GET /api/stock/screen`
策略选股（基于 ROE 池 + 东财 clist）。

**Query**：
- `strategy`：`trend` | `pullback`，默认 `trend`
- `count`：数量，默认 10，最大 20

**数据源**：
1. 东财 `datacenter-web`（reportName=RPT_LICO_FN_CPD，获取 ROE 合格池）
2. 东财 `push2his.eastmoney.com/api/qt/clist/get`（按市值/主力资金排序）

**响应**：
```typescript
{
  ok: true,
  data: {
    strategy: 'trend',
    stocks: [{
      code, name, price, change,
      amount, turnover, pe, marketCap, pb, mainFlow,
      industry, roe, revenueGrowth, profitGrowth
    }]
  }
}
```

---

## 4. 个股分析 API（`server/stockAnalysis.js`）

所有接口需 `code` 参数（6 位数字），统一前缀 `/api/stock-analysis/`。

### 4.1 `GET /api/stock-analysis/fundamental`
个股基本面（财务数据 + 实时估值）。TTL 30min。

**数据源**：
1. 东财 `emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew`（财务指标）
2. 东财 `datacenter-web`（reportName=RPT_VALUEANALYSIS_DET，PE_TTM/PB_MRQ/市值/行业/BK 代码）

**响应**：
```typescript
{
  ok: true,
  data: {
    latest: {
      date: '2026-03-31', reportName: '2026年一季报',
      roe: number,           // ROE（加权）
      grossMargin: number,   // 毛利率%
      netMargin: number,     // 净利率%
      revenue: number,       // 营收（元）
      netProfit: number,     // 归母净利润（元）
      revenueGrowth: number, // 营收同比%
      profitGrowth: number,  // 净利同比%
      debtRatio: number,     // 资产负债率%
      eps: number,           // 每股收益
      bvps: number,          // 每股净资产
      ocfPerShare: number,   // 每股经营现金流
      ocfToProfitRatio: number,  // 经营现金流/收益
      pe: number,            // 实时 PE_TTM
      pb: number,            // 实时 PB_MRQ
      totalMarketCap: number,
      industry: '白酒',
      sectorCode: 'BK0477'   // 东财板块代码
    },
    history: [{...}],  // 最近 24 季度
    ttmEps: number | null  // TTM EPS 计算值
  }
}
```

### 4.2 `GET /api/stock-analysis/capital-flow`
量价分析（派生自 K 线）。TTL 5min。

**数据源**：东财 K 线（同 3.1），服务端派生计算

**响应**：
```typescript
{
  ok: true,
  data: {
    flows: [{
      date, close, volume, amount, changePercent, isUp
    }],  // 近 20 日
    available: true,
    _source: 'derived',
    volumeTrend: {
      recentAvgVol: number,    // 近 5 日均量
      prevAvgVol: number,      // 前 5 日均量
      volumeChangeRate: number // 量比变化%
    },
    priceVolumeSignal: '放量上涨' | '缩量回调（洗盘）' | '温和下跌' | ...,
    priceVolumeDir: 'bull' | 'bear' | 'neutral'
  }
}
```

**信号判定逻辑**：
- 放量（volumeChangeRate > 30%）+ 涨 → 放量上涨（bull）
- 放量 + 跌 → 放量下跌（bear）
- 缩量（< -20%）+ 跌 + 趋势上 → 缩量回调/洗盘（bull）
- 缩量 + 跌 + 趋势下 → 缩量下跌/弱势（bear）
- 缩量 + 涨 + 趋势上 → 缩量整理/蓄势（bull）
- 其他 → 温和上涨/下跌/平稳

### 4.3 `GET /api/stock-analysis/northbound`
北向持股。TTL 10min。

**数据源**：东财 `datacenter-web`（reportName=RPT_MUTUAL_HOLDSTOCKNDATE_STA_NEW）
- 优先日度（INTERVAL_TYPE="003"），不足 5 条回退季度（"001"）

**响应**：
```typescript
{
  ok: true,
  data: {
    available: true,
    data: [{
      date, holdShares, holdMarketCap,
      freeSharesRatio,   // 占流通比%
      totalSharesRatio,  // 占总股本比%
      changeRatio,       // 持股变化比%
      participantNum,    // 参与券商数
      closePrice
    }],
    latest: {...},
    prev: {...},
    _frequency: 'daily' | 'quarterly'
  }
}
```

### 4.4 `GET /api/stock-analysis/margin`
个股融资融券。TTL 30min。

**数据源**：东财 `datacenter-web`（reportName=RPTA_WEB_RZRQ_GGMX）

**响应**：
```typescript
{
  ok: true,
  data: {
    available: true,
    data: [{
      date, rzBalance, rzBuyAmt, rzRepayAmt, rzNetBuy,
      rqBalance, rqVolume, rqSellVol, rqNetVol,
      totalBalance, close, changePct, balanceGrowth
    }],
    latest: {...}
  }
}
```

**注意**：20:00 前最新记录为上个交易日（当日数据未更新）

### 4.5 `GET /api/stock-analysis/main-force-flow`
主力资金流向（日度 + 分时）。日度 TTL 5min，分时 TTL 3min。

**数据源**：
- 日度：东财 `emdatah5.eastmoney.com/dc/ZJLX/getDBHistoryData`（主）→ `push2his.eastmoney.com/api/qt/stock/fflow/daykline/get`（备）
- 分时：东财 `push2.eastmoney.com/api/qt/stock/fflow/kline/get`（主）→ `emdatah5`（备）

**响应**：
```typescript
{
  ok: true,
  data: {
    available: true,
    data: [{
      date, mainNetInflow, smallNetInflow, mediumNetInflow,
      largeNetInflow, superLargeNetInflow,
      mainNetPct, smallNetPct, mediumNetPct, largeNetPct, superLargeNetPct,
      close, changePct
    }],
    latest: {...},
    summary: { mainNetSum5, mainNetAvgPct5 },
    intraday: {  // 当日分时（如有）
      items: [{ time, mainNetInflow, smallNetInflow, ... }],
      aggregated: { mainNetInflow, ... }  // 今日合计
    }
  }
}
```

**字段映射**：`f52`=mainNet, `f53`=small, `f54`=medium, `f55`=large, `f56`=superLarge, `f57`=mainPct, `f58`=smallPct, `f62`=close, `f63`=changePct

### 4.6 `GET /api/stock-analysis/sector-capital`
个股所属板块资金（用于资金面共振）。无 per-code 缓存，板块表缓存 5min。

**数据源**：
1. `resolveSectorCode(code)`：东财 RPT_VALUEANALYSIS_DET 获取 ORIG_BOARD_CODE → `BK{code}`
2. `getSectorCapitalTable()`：东财 `push2.eastmoney.com/api/qt/clist/get`（128 行业，fs=m:90+s:4，多节点轮试）→ `emdatah5` 兜底

**响应**：
```typescript
{
  ok: true,
  data: {
    available: true,
    sector: {
      code: 'BK0477', name: '白酒',
      changePct: number,
      mainNetInflow: number, mainNetPct: number,
      superLarge, superLargePct, large, largePct,
      medium, mediumPct, small, smallPct,
      main5d, main10d
    },
    industry: '白酒',
    sectorCode: 'BK0477'
  }
}
```

### 4.7 `GET /api/stock-analysis/shareholder`
股东户数（季度）。TTL 60min。

**数据源**：东财 `datacenter-web`（reportName=RPT_HOLDERNUM_DET）

**响应**：
```typescript
{
  ok: true,
  data: {
    available: true,
    data: [{
      date, holderCount, changeRatio,  // 户数变化%
      avgHoldNum, totalAShares
    }],
    latest: {...}, prev: {...}
  }
}
```

### 4.8 `GET /api/stock-analysis/billboard`
龙虎榜。TTL 30min。

**数据源**：东财 `datacenter-web`（reportName=RPT_DAILYBILLBOARD_DETAILS）

**响应**：
```typescript
{
  ok: true,
  data: {
    available: true,
    latest: {
      date, daysAgo,
      netAmtYi: number,    // 净额（亿）
      buyAmtYi, sellAmtYi,
      changeRate, explain, explanation,
      instBuy, instSell, isInst, isHotMoney, isMainForce
    },
    recent: [{...}],  // 近 10 自然日
    summary: {
      recentCount, daysAgo,
      instBuyTotal, instSellTotal,
      netAmtSumYi, isInstRecent, isHotMoneyRecent
    }
  }
}
```

**EXPLAIN 解析**：正则提取"X家机构买入/卖出"、"实力游资"、"主力做T"、"浙江资金买入"等

### 4.9 `GET /api/stock-analysis/holder-increase`
股东增减持。TTL 60min。

**数据源**：东财 `datacenter-web`（reportName=RPT_HOLDERTRADE_DETAIL）

**响应**：
```typescript
{
  ok: true,
  data: {
    available: true,
    latest: {...},
    recent: [{
      date, daysAgo, holderName, holderType,
      direction: '增持' | '减持',
      changeRatePct, signedNum,  // 万股
      holdRatio, holdRatioAfter
    }],
    summary: {
      recentCount, daysAgo,
      netChangeRate,      // 净变化率（占流通比%）
      netChangeNumWan,    // 净变化数（万股）
      increaseCount, reduceCount,
      hasControllingReduce,        // 控股股东/实控人减持
      controllingReduceDaysAgo,    // 距今天数（≤180）
      holderCount
    }
  }
}
```

### 4.10 `GET /api/stock-analysis/pledge`
股权质押。TTL 30min。

**数据源**：东财 `datacenter-web`（reportName=RPT_CSDC_LIST_NEWEST）

**响应**：
```typescript
{
  ok: true,
  data: {
    available: true,
    latest: {
      pledgeRatio: number,       // 质押比例（0-100）
      pledgeDealNum: number,     // 质押笔数
      pledgeMarketCap: number,   // 质押市值（万元）
      tradeDate: '2026-06-20',
      noRecord: boolean          // true=无质押（安全）
    }
  }
}
```

### 4.11 `GET /api/stock-analysis/goodwill`
商誉数据。TTL 6h。

**数据源**：东财 `datacenter-web`（reportName=RPT_GOODWILL_STOCKDETAILS）

**响应**：
```typescript
{
  ok: true,
  data: {
    available: true,
    latest: {
      goodwillRatio: number,  // 商誉/归母净资产（小数，0.0139=1.39%）
      goodwill: number,       // 商誉（元）
      netAsset: number,       // 归母净资产（元）
      reportDate: '2026-03-31',
      noRecord: boolean       // true=无商誉（安全）
    }
  }
}
```

### 4.12 `GET /api/stock-analysis/benchmark-kline`
基准指数 K 线（沪深 300，用于 Beta 计算）。TTL 30min。

**Query**：`lmt`（默认 250）、`klt`（默认 101）

**数据源**：东财 `push2his`（沪深 300 secid=1.000300）→ 腾讯回退

**响应**：
```typescript
{
  ok: true,
  data: {
    klines: [{ date, open, close, high, low, volume, amount }],
    source: 'hs300' | 'hs300_tencent'
  }
}
```

---

## 5. AI 接口

### 5.1 `POST /api/stock-analysis/ai-judge`
AI 综合判断（SSE 流式）。

**请求体**：
```typescript
{
  code: string,            // 6 位代码
  name: string,
  scoreSummary: {
    total: number,         // 0-100
    suggestion: string,
    confidence: 'high' | 'medium' | 'low',
    dimensions: {
      technical: { score, max, items: [{name, score, max, desc}] },
      fundamental: { score, max, items },
      capital: { score, max, items },
      risk: { score, max, items }
    }
  },
  techSummary: {
    bullishCount: number,
    bearishCount: number,
    keySignals: string,
    details: string[]
  },
  fundSummary: {
    pe, pb, industry, roe, grossMargin, netMargin,
    revenueGrowth, profitGrowth, debtRatio, ocfPerShare
  },
  capitalSummary: {
    mainForceDesc, marginDesc, priceVolumeSignal
  },
  riskSummary: {
    score, max, details: string[]
  },
  priceAction: {
    latestClose, change5d, change20d
  },
  trendContext: {
    stage, maAlign, maDeadCross, deviation20, deviation60,
    macdDirection, aboveMa5, aboveMa20
  },
  previousAdvice: string  // 上次建议（避免重复"观望"）
}
```

**响应**：SSE 流
```
data: {"type":"text","content":"..."}\n\n
...
data: [DONE]\n\n
```

**实现要点**：
- 模型：`glm-5.1`，baseURL：`https://open.bigmodel.cn/api/paas/v4`
- SDK：OpenAI 兼容（`new OpenAI({ apiKey, baseURL })`）
- 流式：`stream: true, max_tokens: 8192`
- **过滤 reasoning_content**：仅取 `delta.content`，丢弃 `delta.reasoning_content`（GLM-5.1 推理过程）
- 客户端中断：`ctx.req.on('close', () => stream.controller?.abort())`
- 缓存命中时一次性输出完整文本 + `[DONE]`

**Prompt 结构**（见 PRD 8.2 节）

### 5.2 `POST /api/stock/xuangu/ai`
东方财富 AI 选股。

**请求体**：
```typescript
{
  keyWordNew: string,    // 自然语言选股需求
  pageSize: number,      // 默认 50
  pageNo: number         // 默认 1
}
```

**数据源**：东财 `np-tjxg-g.eastmoney.com/api/smart-tag/stock/v3/pw/search-code`
- 需 `EASTMONEY_EMAUTH` cookie（.env 配置）
- 请求体含 fingerprint、timestamp、requestId 等反爬字段

**响应**：
```typescript
{
  ok: true,
  data: {
    stocks: [{
      code, name, price, change, turnover, pe, pb,
      marketCap, mainFlow: null, volume, volumeRatio,
      goodwillRatio, pledgeRatio, debtRatio,
      revenueGrowth, profitGrowth, industry
    }],
    total: number,
    conditions: [{ conditionId, describe, isValid }],
    source: 'ai',
    cached: boolean
  }
}
```

### 5.3 `GET /api/stock/xuangu/ai/status`
AI 选股登录状态。
**响应**：`{ ok: true, data: { hasCookie: boolean } }`

### 5.4 `GET /api/stock/xuangu/structured`
结构化选股（东财 dataapi）。

**Query**：
- `filter`：东财 filter 字符串（由 `screenerPrompt.js` 构建）
- `ps`：页大小，默认 40
- `p`：页码，默认 1
- `mines`：勾选的排雷项 ID 列表（逗号分隔，用于后过滤）

**数据源**：东财 `data.eastmoney.com/dataapi/xuangu/list`（type=RPTA_PCNEW_STOCKSELECT）

**响应**：
```typescript
{
  ok: true,
  data: {
    stocks: [{
      code, name, price, change, turnover, pe, pb,
      marketCap, mainFlow, volume, volumeRatio
    }],
    total: number,
    filtered: number,    // 后过滤掉的数量
    structured: true
  }
}
```

**后过滤**：
- 非 ST：名称含 `ST` 排除
- 非停牌：`NEWEST_PRICE` 为空且 `TURNOVERRATE` 为 0
- 非退市：名称含 `退` 排除
- 商誉/净资产 < 30%（mines 含 6 时）：调用 `fetchGoodwillMap()`（TTL 4h）

**filter 字段示例**（由 `buildStructuredFilter` 生成）：
```
TRADE_MARKET_CODE in ("上交所主板","深交所主板","深交所创业板","上交所科创板")
@LISTING_DATE="OVER1Y"
PLEDGE_RATIO<60
ROE_WEIGHT>=12
TOI_YOY_RATIO>=10
NETPROFIT_YOY_RATIO>=10
DEBT_ASSET_RATIO<=60
PE9>5
PE9<=40
TOTAL_MARKET_CAP>=5000000000
DDX>0
```

---

## 6. 前端数据消费

### 6.1 Vite 代理
`vite.config.js`：`/api` → `http://localhost:3001`

### 6.2 前端缓存（`stores/stockAnalysis.js`）
- LRU 20 条
- TTL 5 分钟
- `getCached(code)` → 命中返回 data，过期返回 null 并清除
- `setCache(code, data)` → 写入，超限淘汰最旧

### 6.3 评分历史（`utils/scoreHistory.js`）
- localStorage key：`score_history`
- 结构：`{ [code]: [{ date, total, techScore, fundScore, capScore, riskScore }] }`
- 保留最近 30 天

### 6.4 大盘状态持久化（`stores/market.js`）
- localStorage key：`market_prev_status`
- 结构：`{ status, date, crossCount, lastFlipDate }`
- 跨天恢复规则：
  - 同天：完整恢复
  - 跨天 ≤5 天：恢复 status + lastFlipDate，crossCount 重置
  - >5 天：丢弃

### 6.5 涨跌家数历史（`stores/market.js`）
- localStorage key：`breadth_history`
- 结构：`[{ date, up, down, flat }]`，保留近 5 日

---

## 7. 数据源清单

| 数据源 | 域名 | 用途 | 备注 |
|--------|------|------|------|
| 东方财富（行情） | `push2his.eastmoney.com` | K 线、分时、报价 | 主源 |
| 东方财富（实时） | `push2.eastmoney.com` | 实时报价、板块资金 | 主源 |
| 东方财富（数据中心） | `datacenter-web.eastmoney.com` | 融资融券、北向、龙虎榜、质押、商誉、股东 | 主源 |
| 东方财富（F10） | `emweb.securities.eastmoney.com` | 财务指标 | 主源 |
| 东方财富（资金流） | `emdatah5.eastmoney.com` | 主力资金日度/分时 | 主源/备源 |
| 东方财富（选股） | `data.eastmoney.com/dataapi/xuangu/list` | 结构化选股 | 主源 |
| 东方财富（AI 选股） | `np-tjxg-g.eastmoney.com` | AI 选股 | 需 emauth cookie |
| 东方财富（搜索） | `searchapi.eastmoney.com` | 股票搜索 | 主源 |
| 东方财富（涨停池） | `push2ex.eastmoney.com` | 连板统计、涨跌分布 | 主源 |
| 腾讯财经 | `web.ifzq.gtimg.cn` | K 线、分时、报价回退 | 备源 |
| 金融界（JRJ） | `q.jrjimg.cn` | 涨跌停、市场热度 | 主源（涨跌停） |
| 证券时报 | `stcn.com` | 北向资金回退 | 备源 |
| 智谱 AI | `open.bigmodel.cn/api/paas/v4` | GLM-5.1 综合判断 | 需 API Key |

---

## 8. 字段映射速查

### 8.1 东财 K 线 fields2
| 字段 | 含义 |
|------|------|
| f51 | 日期 |
| f52 | 开盘 |
| f53 | 收盘 |
| f54 | 最高 |
| f55 | 最低 |
| f56 | 成交量 |
| f57 | 成交额 |
| f58 | 振幅 |
| f59 | 涨跌幅 |
| f60 | 涨跌额 |
| f61 | 换手率 |

### 8.2 东财报价 fields
| 字段 | 含义 |
|------|------|
| f2 | 现价 |
| f3 | 涨跌幅 |
| f4 | 涨跌额 |
| f5 | 成交量 |
| f6 | 成交额 |
| f8 | 换手率 |
| f9 | PE（动态） |
| f10 | 量比 |
| f12 | 代码 |
| f14 | 名称 |
| f15 | 最高 |
| f16 | 最低 |
| f17 | 开盘 |
| f20 | 总市值 |
| f21 | 流通市值 |
| f23 | PB |
| f62 | 主力净流入 |
| f104 | 涨家数（板块） |
| f105 | 跌家数（板块） |
| f106 | 平家数（板块） |
| f115 | PE（TTM） |
| f116 | 总市值 |
| f117 | 流通市值 |
| f127 | 行业 |
| f128 | 地区 |
| f129 | 概念 |
| f162 | 流通股本 |
| f167 | PB |
| f170 | 52周低 |
| f173 | 52周高 |
| f184 | PE（TTM） |
| f186 | 毛利率 |
| f187 | 净利率 |
| f188 | 营收增长 |
| f190 | ROE |
| f191 | 净利增长 |
| f192 | 资产负债率 |

### 8.3 secid 编码
- 上证股票/指数：`1.{code}`（如 `1.600519`、`1.000001`）
- 深证股票/指数：`0.{code}`（如 `0.000001`、`0.399001`）
- 简易判断：`code.startsWith('6') ? '1.' : '0.'`

### 8.4 东财数据中心 reportName 速查
| reportName | 用途 |
|------------|------|
| RPT_LICO_FN_CPD | ROE 池 |
| RPTA_RZRQ_LSHJ | 融资余额（大盘） |
| RPTA_WEB_RZRQ_GGMX | 个股融资融券 |
| RPT_MUTUAL_DEALAMT | 北向资金（大盘） |
| RPT_MUTUAL_HOLDSTOCKNDATE_STA_NEW | 个股北向持股 |
| RPT_VALUEANALYSIS_DET | 估值（PE/PB/市值/行业） |
| RPT_HOLDERNUM_DET | 股东户数 |
| RPT_DAILYBILLBOARD_DETAILS | 龙虎榜 |
| RPT_HOLDERTRADE_DETAIL | 股东增减持 |
| RPT_CSDC_LIST_NEWEST | 股权质押 |
| RPT_GOODWILL_STOCKDETAILS | 商誉 |
| RPT_CUSTOM_INTSELECTION_LIMIT | 涨停统计 |

---

## 9. 错误处理与降级

### 9.1 服务端
- 所有接口 try/catch，失败返回 `{ ok: false, error: message }`
- 主源失败自动回退备源
- 数据不足时 `available: false`（区别于接口失败）

### 9.2 前端
- `loadErrors` 记录每个子接口的失败状态（kline/fundamental/capitalFlow/margin/northbound/mainForce/shareholder/billboard/holderIncrease/pledge/goodwill）
- 资金面 Tab 整体降级：sectorCapital 错误并入 mainForce 桶
- 评分引擎对缺失维度使用默认中性分，置信度降为 'low'

### 9.3 关键降级场景
| 场景 | 降级行为 |
|------|----------|
| K 线获取失败 | 评分不可用，显示错误提示 |
| 基本面缺失 | 基本面维度 0 分，置信度 'low' |
| 资金面全部失败 | 资金维度 0 分，UI 显示"数据暂不可用" |
| 北向日度不足 5 条 | 回退季度数据，标记 `_frequency: 'quarterly'` |
| 主力分时不可用 | 仅展示日度数据 |
| 板块资金表获取失败 | 共振优雅降级为中性 |
| AI 服务未配置 | 返回错误提示，UI 显示配置引导 |
| AI 流式中断 | AbortController，已接收文本保留 |

---

## 10. 复现要点

1. **严格按字段映射实现**：东财 `f` 前缀字段不可错位（如 f61=换手率，非 f58=振幅）
2. **多源回退顺序**：东财 → 腾讯/新浪/金融界，每层 try/catch
3. **缓存分层**：全局 Map（市场数据）+ 独立 Map（个股数据）+ LRU 淘汰
4. **时区统一**：所有日期基于 `Asia/Shanghai`，避免跨天判断错误
5. **IPv4 强制**：东财部分域名 IPv6 不通，需 `dns.resolve4` 强制 IPv4
6. **请求头**：东财需 Referer + UA，AI 选股需 emauth cookie
7. **SSE 过滤**：GLM-5.1 的 `reasoning_content` 必须丢弃，仅输出 `content`
8. **后过滤**：东财结构化选股不支持 ST/停牌/退市/商誉过滤，需服务端后处理
9. **数据可用性**：`available: false`（接口失败）vs `noRecord: true`（无数据=安全）需区分
10. **20:00 时间窗**：融资融券 20:00 后才更新当日数据，此前最新记录为上个交易日
