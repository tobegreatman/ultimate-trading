# Ultimate Trading System — 产品需求文档（PRD）

> **版本**：3.0.0 ｜ **更新**：2026-06-22
> **说明**：本文档基于现有代码反向梳理，描述系统功能、算法、数据结构与界面规范，供 AI 据此完整复现系统。
> **排除范围**：`src/views/MarketAnalysis.vue` 页面及其相关后端（`server/analysis.js`、`src/stores/marketAnalysis.js`、`src/utils/marketCycle.js`、`src/utils/industryRank.js`）均不实现。九维判定中的"宏观因子"维度作为可选输入保留接口，无数据时跳过。

---

## 1. 产品概述

### 1.1 定位
面向中国 A 股个人投资者的**全流程量化交易辅助系统**，覆盖"市场判断 → 选股 → 个股分析 → 仓位管理 → 交易记录 → 复盘 → 策略指南"闭环。

### 1.2 核心价值
- **九维大盘判定**：7 维核心技术（MACD/RSI/广度/融资/量价/北向/涨跌停）+ 波动率 + 可选宏观因子，加权评分 + 状态惯性机制
- **四维个股评分**：技术 / 基本面 / 资金 / 风险，按投资风格动态加权
- **ATR 动态仓位**：基于波动率自适应的止损、跟踪止盈、仓位计算
- **纪律闭环**：七条铁律 + 入场前检查清单 + 情绪管理 + 回撤熔断协议
- **AI 辅助判断**：GLM-5.1 流式输出综合分析（SSE）

### 1.3 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 前端框架 | Vue 3（Composition API） | ^3.5.0 |
| 路由 | Vue Router | ^4.5.0 |
| 状态 | Pinia | ^2.3.0 |
| 图表 | ECharts | ^6.0.0 |
| 构建 | Vite | ^6.3.0 |
| 后端 | Koa 2 + @koa/router + cors + bodyparser + logger | — |
| AI | OpenAI SDK（兼容 GLM 接口） | — |

### 1.4 项目结构

```
ultimate-trade/
├── src/
│   ├── main.js                    # 入口：挂载 Pinia + Router
│   ├── App.vue                    # 根组件：NavBar + RouterView
│   ├── router/index.js            # 路由（7 个页面）
│   ├── components/
│   │   ├── NavBar.vue             # 顶部导航（毛玻璃 + 滑动指示器）
│   │   ├── Sparkline.vue          # 迷你折线图
│   │   ├── IntradayChart.vue      # 分时图
│   │   ├── KlineChart.vue         # K 线图
│   │   └── analysis/
│   │       ├── TechnicalPanel.vue
│   │       ├── FundamentalPanel.vue
│   │       ├── CapitalFlowPanel.vue
│   │       └── ScorePanel.vue
│   ├── composables/
│   │   ├── useStockData.js        # 个股数据加载 + 评分
│   │   ├── useStrategyGuide.js    # 策略执行计划
│   │   └── useECharts.js          # ECharts 封装
│   ├── stores/
│   │   ├── market.js              # 大盘数据
│   │   ├── watchlist.js           # 自选股
│   │   ├── position.js            # 持仓
│   │   ├── journal.js             # 交易日志
│   │   └── stockAnalysis.js       # 个股分析缓存
│   ├── utils/
│   │   ├── constants.js           # 常量（市场状态/策略/铁律/排雷项等）
│   │   ├── marketJudge.js         # 九维大盘判定 v7.5
│   │   ├── scoring.js             # 个股评分引擎 v3
│   │   ├── indicators.js          # 技术指标（MA/MACD/RSI/KDJ/BOLL/ATR/OBV/VMACD）
│   │   ├── divergence.js          # 背离检测 v7.1
│   │   ├── position.js            # ATR 仓位计算
│   │   ├── riskMetrics.js         # Sharpe/最大回撤/Beta
│   │   ├── scoreHistory.js        # 评分历史
│   │   ├── screenerPrompt.js      # 选股条件构建
│   │   ├── aiJudge.js             # AI 判断 SSE 客户端
│   │   ├── format.js              # 格式化
│   │   └── storage.js             # localStorage 工具
│   ├── views/
│   │   ├── Dashboard.vue          # 仪表盘
│   │   ├── StockAnalysis.vue      # 个股分析
│   │   ├── Watchlist.vue          # 自选股
│   │   ├── Screener.vue           # 选股
│   │   ├── Position.vue           # 仓位计算
│   │   ├── Journal.vue            # 交易日志
│   │   └── Guide.vue              # 策略指南
│   └── styles/global.css          # 全局样式（深色主题 + CSS 变量）
├── server/
│   ├── index.js                   # Koa 入口 + 市场数据 + 选股 API
│   ├── stockAnalysis.js           # 个股分析 API（11 个接口）
│   ├── aiJudge.js                 # AI 综合判断（SSE）
│   ├── batchScore.js              # 批量评分
│   ├── fallback.js                # 多源回退（腾讯/新浪/金融界）
│   └── .env                       # GLM_API_KEY、EASTMONEY_EMAUTH
└── package.json
```

### 1.5 路由表

| 路径 | 名称 | 页面 |
|------|------|------|
| `/` | Dashboard | 仪表盘 |
| `/stock-analysis` | StockAnalysis | 个股分析 |
| `/watchlist` | Watchlist | 自选股 |
| `/screener` | Screener | 选股筛选 |
| `/position` | Position | 仓位计算 |
| `/journal` | Journal | 交易日志 |
| `/guide` | Guide | 策略指南 |

> **排除**：`/analysis`（MarketAnalysis）路由不实现。

---

## 2. 全局规范

### 2.1 设计风格
- **深色主题**：背景 `#0f1729` / 卡片 `rgba(30,41,59,0.6)` / 毛玻璃 `backdrop-filter: blur(24px)`
- **强调色**：`#0071e3`（蓝），涨绿 `#30d158`，跌红 `#ff453a`，警示 `#ffd60a`
- **字体**：系统默认无衬线，标题字重 700、字距 -0.03em
- **圆角**：卡片 16px、按钮 8px、标签 6px
- **动效**：cubic-bezier(0.4, 0, 0.2, 1)，hover 上浮 1px + 阴影增强
- **响应式**：768px 以下导航栏隐藏文字标签，仅显示图标

### 2.2 统一响应格式
```typescript
{ ok: boolean, data?: T, error?: string }
```

### 2.3 全局 CSS 变量
```css
--bg-primary: #0f1729;
--bg-card: rgba(30, 41, 59, 0.6);
--accent: #0071e3;
--accent-dim: rgba(0, 113, 227, 0.15);
--text-primary: #e2e8f0;
--text-secondary: #94a3b8;
--up: #30d158;
--down: #ff453a;
--warn: #ffd60a;
--border: rgba(255, 255, 255, 0.08);
```

---

## 3. 功能模块详述

### 3.1 Dashboard（仪表盘）

**路由**：`/` ｜ **文件**：`src/views/Dashboard.vue`

**功能**：
1. **三大指数卡片**：上证 / 深证 / 创业板，展示名称、现价、涨跌幅、分时 Sparkline
2. **市场状态球（Orb）**：圆形发光体，颜色随状态变化（牛绿/震荡黄/熊红），下方显示建议仓位、推荐策略、信号确认状态
3. **得分条**：横向三段（牛/中/熊），按权重比例展示，标注数量与权重和
4. **九维判据网格**：9 张信号卡片，每张含维度名、数值、方向箭头、权重、描述；带 80ms 错峰入场动画
5. **长周期窗口**：MA60 趋势 + 涨跌家数趋势的长期信号
6. **策略选股入口**：根据当前市场状态推荐策略，点击跳转 StockAnalysis 并携带 `strategy` + `marketStatus` query

**数据源**：`useMarketStore`（indices/breadth/northbound/margin/limitStats）+ `marketJudge.judgeMarket()`

**刷新策略**：
- 指数分时：10s
- 指数报价 + MA：60s
- 涨跌家数：30s
- 北向 / 融资 / 涨跌停：60s
- 页面不可见时暂停（`visibilitychange`），切回立即刷新一次

**状态持久化**：`market_prev_status`（含 status/date/crossCount/lastFlipDate），跨天 ≤5 天恢复 status + lastFlipDate，crossCount 重置；>5 天丢弃

### 3.2 StockAnalysis（个股分析）

**路由**：`/stock-analysis` ｜ **文件**：`src/views/StockAnalysis.vue`

**功能**：
1. **顶部头部**：股票选择器（下拉 + 搜索框，500ms 防抖）、现价、涨跌幅、行业标签、刷新按钮、数据时间戳
2. **诊断卡片行**：4 张并排卡片
   - 综合评分（带建议色边框）
   - 趋势结论（点击切到技术 Tab）
   - 估值结论（点击切到基本面 Tab）
   - 资金结论（点击切到资金 Tab）
3. **风格切换器**：短线 / 中线 / 长线 三按钮，切换后实时重算评分
4. **策略执行计划**（仅从 Dashboard 跳转时显示）：
   - 不推荐时显示红色卡片 + 原因
   - 推荐时显示策略名、信号质量、风险等级、ATR、入场位、止损位、跟踪止盈位、目标位、仓位、盈亏比
   - 一键添加到持仓 / 一键添加到交易日志
5. **Tab 面板**（`<KeepAlive :max="4">`）：
   - **技术面**：K 线图（MA/MACD/KDJ/BOLL/量能副图）+ 信号列表 + 背离标记
   - **基本面**：估值表（PE/PB/行业分档）、盈利能力（ROE/毛利率/净利率）、成长性（营收/净利增速）、财务健康（负债率/现金流）、行业对比
   - **资金面**：主力资金日度 + 分时、融资融券、北向持股、量价信号、龙虎榜、股东户数、股东增减持
   - **综合评分**：四维得分环形图 + 子项明细 + 历史趋势 + AI 综合判断（SSE 流式）
6. **AI 判断面板**：流式输出，支持中断（切换股票或关闭面板时 AbortController）

**数据加载策略**（`useStockData.js`）：
- **两阶段**：首屏（K 线 + 基本面）→ 后台并行（资金面 6 个 API）
- **请求序号控制**：`loadSeq` 自增，仅最新序号的结果会写入响应式状态
- **AbortController**：切换股票时中断未完成请求
- **缓存**：`stockAnalysis` store，LRU 20 条，TTL 5 分钟，含 `setScoreCache` 轻量缓存

**评分快照**：每次评分后调用 `saveScoreSnapshot(code, scoreResult)`，保留最近 30 天

### 3.3 Watchlist（自选股）

**路由**：`/watchlist` ｜ **文件**：`src/views/Watchlist.vue`

**功能**：
1. **顶部指数条**：三大指数迷你分时图
2. **左侧栏**：
   - 搜索框（代码/名称/拼音，500ms 防抖，下拉候选 6 条）
   - 批量管理按钮（≥2 只时显示）
   - 自选股列表：拖拽排序、置顶（pinned）、删除、批量选择删除
3. **右侧详情**：选中股票的 K 线图 + 关键指标 + 加入持仓/日志快捷按钮

**自动刷新**：10s 批量报价，页面不可见时暂停

**持久化**：`watchlist` key，结构 `[{code, name, addedAt, pinned}]`

### 3.4 Screener（选股筛选）

**路由**：`/screener` ｜ **文件**：`src/views/Screener.vue`

**功能**：四层漏斗式选股
1. **排雷清单**（12 项，至少勾选 5 项）：非 ST、非停牌、非北交所、非退市、审计标准无保留、商誉/净资产 < 30%、质押 < 60%、上市 > 250 天、关联交易 < 40%、无存贷双高、董监高减持 < 5%、无重大诉讼
2. **基本面筛选**（7 项）：ROE、营收增速、净利增速、负债率、现金流正值、PE 范围、最小市值
3. **景气度验证**（3 选 1，可选）：机构增持、业绩超预期、龙虎榜强势
4. **技术信号**（3 选 1）：趋势突破、回调买入、底部右侧确认
5. **预设模式**：根据市场状态（bull/bull-lean/neutral）+ 严/宽模式自动填充参数
6. **输出**：
   - 东方财富结构化选股 URL（可直接跳转东财选股器）
   - 调用 `/api/stock/xuangu/structured` 返回结果列表
   - AI 选股入口（`/api/stock/xuangu/ai`，需 `EASTMONEY_EMAUTH`）

### 3.5 Position（仓位计算）

**路由**：`/position` ｜ **文件**：`src/views/Position.vue`

**功能**：
1. **ATR 动态仓位计算器**：
   - 输入：股票代码（一键获取 ATR）、策略（trend/pullback/bottom）、总资金、买入价、目标价
   - 输出：止损价、止损幅度、建议仓位金额、仓位占比、股数、盈亏比
2. **持仓列表**：
   - 添加持仓（股票、仓位金额、买入价、股数、ATR、ATR 倍数、策略、市场状态、行业）
   - 移动止损更新（只上移不下调）
   - 删除持仓
3. **行业集中度预警**：按行业分组统计仓位占比，表格展示

**持久化**：`holdings` + `totalCapital`（默认 100 万）

### 3.6 Journal（交易日志）

**路由**：`/journal` ｜ **文件**：`src/views/Journal.vue`

**功能**：
1. **交易记录 Tab**：
   - 新增交易表单：代码、名称、买入价、数量、策略、市场环境、行业、ATR（一键获取）、止损价、目标价、入场前检查清单（8 项）
   - 实时盈亏比预览
   - 持仓中 / 已平仓 分组展示
   - 平仓操作：卖出价、卖出原因（6 种）、情绪评分（1-5）、执行评分（1-5）、违规项、问题标签、复盘笔记
   - 自动计算：盈亏金额、盈亏百分比、实际盈亏比
2. **绩效统计 Tab**：
   - 总览：胜率、盈亏比（profitFactor）、总盈亏、平均盈/亏、交易数
   - 月度统计：按月分组的盈亏柱状图
   - 策略对比：各策略的胜率与盈亏
   - 连续止损次数（触发回撤协议预警）

**持久化**：`journal_trades` key

### 3.7 Guide（策略指南）

**路由**：`/guide` ｜ **文件**：`src/views/Guide.vue`

**功能**：左侧导航 + 右侧内容的文档型页面
1. **买入决策树**：8 步决策流程
2. **市场趋势状态**：九维判据说明表 + 5 种状态卡片（条件 + 仓位 + 策略）
3. **卖出决策树**：止损 / 止盈 / 跟踪止盈 / 时间止损 / 逻辑止损
4. **七条铁律**：每条含描述 + 违规后果
5. **回撤熔断协议**：4 级回撤（5%/10%/15%/20%）对应操作
6. **情绪管理**：贪婪/恐惧/后悔/侥幸 4 种情绪的触发与应对
7. **策略参数表**：3 种策略的 ATR 倍数、持仓周期、时间止损

---

## 4. 核心算法

### 4.1 九维大盘判定（`marketJudge.js` v7.5）

#### 4.1.1 维度与权重

| # | 维度 | 权重 W | 数据来源 | 强信号权重 |
|---|------|--------|----------|------------|
| 1 | MACD | 1.0 | 指数 K 线 | 2.0（背离） |
| 2 | 涨跌家数 | 1.5 | 全市场涨跌统计 | 2.0（极端） |
| 3 | RSI | 1.0 | 指数 K 线 | 2.0（背离） |
| 4 | 融资余额 | 1.2 | 东财数据中心 | 2.0（持续流入/出） |
| 5 | 量价配合 | 1.3 | 指数 K 线 + OBV | 2.0（背离） |
| 6 | 北向资金 | 1.5 | 东财/stcn | 2.0（极端放量/缩量） |
| 7 | 涨跌停 | 1.3 | JRJ + 东财 | 2.0（net ≥ 4） |
| 8 | 宏观因子 | 0.5 | **可选，无数据时跳过** | — |
| 9 | 波动率 | 1.0 | 指数 K 线 + ATR | 2.0（高波 + 上升） |

#### 4.1.2 主判定流程

```javascript
judgeMarket(indices, breadth, northbound, margin, breadthHistory, limitStats, prevStatus, macroScore, todayStr)
  ├─ 9 个维度依次判定 → 累加 bullW / bearW / bullCnt / bearCnt
  ├─ determineStatus(bullW, bearW, prevStatus, todayStr)  // 状态惯性
  ├─ confirmed = BULL_SET.has(status) || BEAR_SET.has(status)
  └─ longWindow = checkLongWindow(quote, ma, klines, breadth)
  → 返回 { status, label, maxPosition, strategy, strategyName, signals, score, confirmed, longWindow, hysteresisState }
```

#### 4.1.3 各维度判定要点

**MACD**：背离检测（最高优先级，`detectDivergenceV2`）→ 金叉/死叉（零轴上方权重 1.0，下方 0.7）→ 持续状态（多头强势/减弱、空头强势/减弱、零轴震荡）

**RSI**：背离检测 → 多头（≥60 强势 / 55-60 偏强 / 超卖回升）→ 空头（<35 弱势 / 35-40 偏弱 / 超买回落）→ 中性

**涨跌家数**：ratio = up/down，近 3 日均值 vs 前 10 日均值判断趋势改善/恶化；ratio ≥ 2.2 → W_STRONG，1.5-2.2 线性插值；空头镜像

**融资余额**：10 日序列线性回归斜率 + 区间中点归一化（slopePct）；slopePct ≥ 0.7 → W_STRONG，0.3-0.7 线性插值

**量价配合**：OBV 20 日趋势 vs 价格趋势 + 近 5 日量比（volRatio）+ 趋势偏转检测；背离优先；价↑量↑ → bull，价↓量↑ → bull(0.6×)，价↑量↓ → bear，价↓量↓ → bear

**北向资金**：近 5 日均量 vs 第 6-20 日均量（ratio）+ 大盘涨跌幅联合分析；放量 + 大盘暴跌 → bear（疑似净卖出）；缩量 + 大盘大涨 → bear（北向缺席）

**涨跌停**：并行计算 bullPts / bearPts（11 项评分项），net = bullPts - bearPts；板块集中度过高（≥30%）仅压缩正向 net；net ≥ 4 → W_STRONG，≥ 2 → W.limitStats

**波动率**：ATR(14)/close × 100 的 60 日历史百分位 + ATR 趋势；percentile > 80% 且上升 → bear(W_STRONG)；< 30% 且稳定 → bull；< 15% 且下降 → neutral（变盘预警）

**多指数综合**（`synthMultiIndex`）：对上证/深证/创业板分别判定后加权投票；以上证为主信号源，缺失时取第一个并降权 0.8；全部同向 → ×1.2；权重相等 → 跟随主方向 ×0.5

#### 4.1.4 状态惯性机制（Hysteresis）

**状态定义**：
```javascript
MARKET_STATUS = {
  bull:        { label: '牛市', maxPosition: '80-100%', strategy: 'trend',    strategyName: '趋势突破' },
  'bull-lean': { label: '偏多', maxPosition: '50-70%',  strategy: 'pullback', strategyName: '回调买入' },
  neutral:     { label: '震荡', maxPosition: '≤50%',    strategy: 'pullback', strategyName: '回调买入' },
  'bear-lean': { label: '偏空', maxPosition: '10-20%',  strategy: null,        strategyName: '仅观望' },
  bear:        { label: '熊市', maxPosition: '0-10%',   strategy: null,        strategyName: '空仓' }
}
BULL_SET = new Set(['bull', 'bull-lean'])
BEAR_SET = new Set(['bear', 'bear-lean'])
```

**阈值**：
```javascript
BULL_THRESHOLD = 5.0        // 牛市阈值
LEAN_THRESHOLD = 3.3        // 偏多/偏空阈值
CROSS_DIR_THRESHOLD = 1.7   // 跨方向翻转阈值
NEUTRAL_THRESHOLD = 1.7     // 进出中性阈值
COOLDOWN_TRADE_DAYS = 3     // 跨方向翻转冷却期（交易日，排除周末）
CONFIRM_DAYS = 2            // 连续确认天数
EMERGENCY_THRESHOLD = 7.0   // 紧急翻转阈值
```

**翻转规则**：
1. 同方向调整（bull↔bull-lean, bear↔bear-lean）：自由切换
2. 紧急翻转：leadingW ≥ 7.0 且 |net| ≥ 7.0 → 跳过确认和冷却，立即翻转（标记 `emergencyFlip`）
3. 跨方向翻转（多↔空）或中性→极端：
   - 冷却期内：crossCount++，标记 `pendingFlip`（crossCount ≥ 2 时），保持原状态
   - |net| < 1.7：保持原状态
   - crossCount < 2：保持原状态，crossCount++
   - 达标：翻转，更新 lastFlipDate
4. 极端→中性：|net| ≥ 1.7 即可进入中性

**跨天恢复**（`market.js`）：同天完整恢复；跨天 ≤5 天恢复 status + lastFlipDate，crossCount 重置；>5 天丢弃

### 4.2 个股综合评分引擎（`scoring.js` v3）

#### 4.2.1 四维动态权重

```javascript
STYLE_WEIGHTS = {
  short: { technical: 0.33, fundamental: 0.14, capital: 0.38, risk: 0.15 },
  mid:   { technical: 0.28, fundamental: 0.26, capital: 0.30, risk: 0.16 },
  long:  { technical: 0.20, fundamental: 0.38, capital: 0.22, risk: 0.20 }
}
```

#### 4.2.2 评分项与分值

| 维度 | 子项 | 分值 |
|------|------|------|
| **技术面（0-42）** | 均线排列 + 斜率 | 0-10 |
| | MACD 信号 | 0-8 |
| | KDJ 信号 | 0-5 |
| | RSI 信号 | 0-5 |
| | BOLL 信号 | 0-4 |
| | 量价配合 | 0-5 |
| | 背离信号 | 0-5（加分项） |
| **基本面（0-30）** | PE 分档（行业感知） | 0-8 |
| | PB 分档（行业感知） | 0-5 |
| | ROE | 0-6 |
| | 成长性（营收+净利增速） | 0-6 |
| | 负债率（行业感知） | 0-3 |
| | 现金流 | 0-2 |
| **资金面（0-42）** | 主力资金（日度 + 分时） | 0-15 |
| | 融资融券 | 0-8 |
| | 北向持股 | 0-8 |
| | 量价信号 | 0-5 |
| | 龙虎榜 | 0-3 |
| | 股东户数变化 | 0-3 |
| **风险面（0-27）** | Sharpe 比率 | 0-5 |
| | 最大回撤 | 0-5 |
| | Beta 系数 | 0-4 |
| | 波动率 | 0-4 |
| | 质押比例 | 0-3 |
| | 商誉/净资产 | 0-3 |
| | 股东减持 | 0-3 |

#### 4.2.3 行业分档阈值

PE / PB / 负债率 / 毛利率均按行业分档（`PE_THRESHOLDS` / `PB_THRESHOLDS` / `DEBT_THRESHOLDS` / `GROSS_MARGIN_THRESHOLDS`），覆盖 25+ 行业（银行/保险/地产/钢铁/煤炭/食品/医药/科技/半导体/军工/新能源/家电/汽车/公用/化工/建筑/券商/采矿/农业/环保/教育/文旅/传媒/物流/纺织等）

#### 4.2.4 评分输出

```typescript
{
  total: number,           // 加权总分 /100
  dimensions: {
    technical:   { score, max, items: [{name, score, max, desc}] },
    fundamental: { score, max, items: [...] },
    capital:     { score, max, items: [...] },
    risk:        { score, max, items: [...] }
  },
  suggestion: string,      // 文案建议
  suggestionColor: string, // 建议色
  confidence: string       // 数据置信度（高/中/低）
}
```

### 4.3 ATR 仓位计算（`position.js`）

```javascript
// 策略参数
STRATEGY_PARAMS = {
  trend:    { atrN: 1.5, trailAtrN: 2.0, maxPosition: 0.25, holdPeriod: '1-4 周' },
  pullback: { atrN: 2.0, trailAtrN: 3.0, maxPosition: 0.25, holdPeriod: '2-8 周' },
  bottom:   { atrN: 3.0, trailAtrN: 4.0, maxPosition: 0.03, holdPeriod: '1-6 月' }
}

// 波动率自适应
getAdjustedAtrN(atr, price, baseN):
  volatility = atr / price
  if volatility > 0.05  → baseN + 0.5
  if volatility < 0.015 → max(baseN - 0.5, 0.5)
  else → baseN

// 止损价
calcStopLoss(buyPrice, atr, strategy):
  n = getAdjustedAtrN(atr, buyPrice, params.atrN)
  stop = max(buyPrice - n * atr, 0.01)
  bottom 策略额外约束：min(stop, buyPrice * 0.92)

// 仓位（风险预算 + 策略上限双约束）
calcPosition(totalCapital, buyPrice, stopPrice, strategy):
  stopPct = (buyPrice - stopPrice) / buyPrice
  posByRisk = (totalCapital * 0.02) / stopPct   // 2% 风险预算
  posByLimit = totalCapital * params.maxPosition
  amount = min(posByRisk, posByLimit)
  shares = floor(amount / buyPrice / 100) * 100  // 取整到 100 股

// 跟踪止盈（只上移不下调）
updateTrailingStop(current, highestClose, atr, strategy):
  n = getAdjustedAtrN(atr, highestClose, params.trailAtrN)
  newTrailing = highestClose - n * atr
  return max(current, newTrailing)
```

### 4.4 背离检测（`divergence.js` v7.1）

1. **多尺度极值检测**：窗口 [2, 3, 5] 扫描极值，合并重叠区域，score = 检测窗口数 / 总窗口数
2. **幅度过滤**：两极值间价格变化需 ≥ 日均波动 × 0.5
3. **时间衰减**：半衰期 ~14 bar（λ = 0.05）
4. **置信度评分**：综合极值分数 + 幅度过滤 + 时间衰减
5. **输出**：`{ type: 'bullish'|'bearish', confidence: 0-1 } | null`

### 4.5 风险指标（`riskMetrics.js`）

- **Sharpe**：年化，近 60 日为主(70%) + 全期为辅(30%)，无风险利率 1.5%
- **最大回撤**：峰值到谷底的最大跌幅 + 跌幅持续天数
- **Beta**：个股收益 vs 基准指数收益的回归斜率

---

## 5. 数据持久化与状态管理

### 5.1 localStorage 键值表

| Key | 用途 | 数据格式 | 写入位置 |
|-----|------|----------|----------|
| `watchlist` | 自选股列表 | `[{code, name, addedAt, pinned}]` | `stores/watchlist.js` |
| `journal_trades` | 交易记录 | `[{id, code, name, buyPrice, quantity, ...}]` | `stores/journal.js` |
| `holdings` | 持仓记录 | `[{id, code, name, position, trailingStop, ...}]` | `stores/position.js` |
| `totalCapital` | 总资金（字符串） | `number` | `stores/position.js` |
| `market_prev_status` | 市场状态惯性 | `{status, date, crossCount, lastFlipDate}` | `views/Dashboard.vue` |
| `breadth_history` | 涨跌家数历史（近 5 日） | `[{date, up, down, flat}]` | `stores/market.js` |
| `northbound_cache` | 北向资金缓存 | `Array<{date, nfAmt, ...}>` | `stores/market.js` |
| `margin_cache` | 融资余额缓存 | `Array<{date, rzBalance, ...}>` | `stores/market.js` |
| `limitStats_cache` | 涨跌停统计缓存 | `{limitUp, limitDown, ...}` | `stores/market.js` |
| `score_history` | 个股评分历史（按 code 分组，保留 30 天） | `{"600519": [{date, total, techScore, ...}], ...}` | `utils/scoreHistory.js` |
| `stockAnalysis_cache` | 个股分析数据缓存 | `{"{code}": {data, timestamp}}` | `stores/stockAnalysis.js` |

**统一工具**（`utils/storage.js`）：`loadJson(key, fallback)` / `saveJson(key, data)` / `loadNumber(key, fallback)` / `saveNumber(key, val)`，均含 try/catch 容错

### 5.2 Pinia Store

#### 5.2.1 `market` store（`stores/market.js`）

```javascript
state: {
  indices: { sh: {quote, ma, klines, ma60Trend}, sz: {...}, cyb: {...} },
  breadth: { up, down, flat },
  breadthHistory: [...],   // 近 5 日
  northbound: [...],
  margin: [...],
  limitStats: {...},
  prevStatus: { status, date, crossCount, lastFlipDate } | null,
  loading: false,
  dataReady: false
}
actions: fetchIndices, fetchBreadth, fetchNorthbound, fetchMargin, fetchLimitStats, fetchAll
```

#### 5.2.2 `watchlist` store（`stores/watchlist.js`）

```javascript
state: {
  stocks: [{code, name, addedAt, pinned}],
  quotes: { [code]: {...} },
  klineCache: { [code]: {...} }
}
actions: addStock, removeStock, reorderStock, togglePin, removeBatch,
         fetchQuotes, fetchKline, startAutoRefresh, stopAutoRefresh
```

#### 5.2.3 `position` store（`stores/position.js`）

```javascript
state: {
  holdings: [{
    id, code, name, position, trailingStop,
    entryPrice, shares, atr, atrN,
    strategy, marketRegime, industry, openDate
  }],
  totalCapital: number  // 默认 1000000
}
getters: industryConcentration  // 行业占比表
actions: setCapital, addHolding, removeHolding, updateTrailingStop
```

#### 5.2.4 `journal` store（`stores/journal.js`）

```javascript
state: {
  trades: [{
    id, code, name,
    buyPrice, quantity, stopPrice, targetPrice,
    atr, atrN, strategy, strategyName, marketRegime, industry,
    date, checklist,  // 入场前检查清单
    status,           // 'open' | 'closed'
    sellPrice, sellDate, sellReason,
    pnl, pnlPct, actualRR,
    emotion, executionScore, violations, issues, reviewNotes
  }]
}
getters: openTrades, closedTrades, stats, consecutiveStops, monthlyStats, strategyStats
actions: addTrade, closeTrade, deleteTrade
```

**stats 输出**：`{ winRate, profitFactor, totalPnl, avgWin, avgLoss, count }`

#### 5.2.5 `stockAnalysis` store（`stores/stockAnalysis.js`）

```javascript
state: {
  cache: { [code]: { data: {klines, indicators, fundamental, ...}, timestamp } }
}
// LRU 20 条，TTL 5 分钟
actions: getCached, setCache, setScoreCache, invalidate, clearAll
```

---

## 6. 定时刷新与性能策略

### 6.1 前端刷新间隔

| 页面 | 数据 | 间隔 |
|------|------|------|
| Dashboard | 指数分时 | 10s |
| Dashboard | 指数报价 + MA | 60s |
| Dashboard | 涨跌家数 | 30s |
| Dashboard | 北向 / 融资 / 涨跌停 | 60s |
| Watchlist | 批量报价 | 10s |
| Watchlist | 指数分时 | 10s |
| StockAnalysis | 实时报价 | 10s |

**可见性优化**：`document.visibilitychange` 监听，隐藏时暂停 `setInterval`，切回立即刷新一次

### 6.2 性能优化

- **KeepAlive**：StockAnalysis 的 4 个 Tab 缓存（`<KeepAlive :max="4">`）
- **防抖**：搜索框 500ms
- **请求去重**：相同股票 + 周期的 K 线请求 5 秒内去重
- **AbortController**：切换股票时中断未完成请求
- **骨架屏**：首屏加载时显示骨架屏避免白屏
- **增量更新**：ECharts `setOption(option, { lazyUpdate: true })`
- **请求序号控制**：`loadSeq` 自增，仅最新序号结果写入状态

---

## 7. 常量定义（`constants.js`）

### 7.1 入场前检查清单（8 项）
1. 大盘状态是否适合交易
2. 该股是否通过排雷清单
3. 是否有明确买入信号
4. 止损位是否已设定
5. 盈亏比是否 ≥ 2:1
6. 仓位是否在风险预算内
7. 是否已设条件单/提醒
8. 是否在冷静状态下决策

### 7.2 七条铁律
止损不可撤销 / 不追涨杀跌 / 不逆势满仓 / 不在亏损仓位加仓 / 不过度交易 / 不碰不懂的票 / 不临时起意

### 7.3 回撤熔断协议

| 级别 | 最大回撤 | 操作 | 仓位系数 |
|------|----------|------|----------|
| 0 | 5% | 正常波动 | 1.0 |
| 1 | 10% | 减仓至 50%，暂停新开仓，复盘近 5 笔 | 0.5 |
| 2 | 15% | 减仓至 20%，只保留最强持仓，全面复盘 | 0.2 |
| 3 | 20% | 立即空仓，回归模拟盘 2 周 | 0 |

### 7.4 卖出原因
stop（止损）/ target（到达目标）/ trailing_stop（跟踪止盈）/ time_stop（时间止损）/ logic_stop（逻辑止损）/ manual（手动）

### 7.5 问题标签
execution（执行失误）/ timing（时机错误）/ selection（选股错误）/ environment（环境不匹配）/ emotion（情绪驱动）

### 7.6 情绪管理
贪婪 / 恐惧 / 后悔 / 侥幸，每种含触发场景与应对策略

### 7.7 排雷项（12 项）
见 3.4 Screener

### 7.8 基本面默认值
```javascript
FUNDAMENTAL_DEFAULTS = {
  roe: 12, revenueGrowth: 10, profitGrowth: 10,
  debtRatio: 60, cashflowPositive: true,
  peMin: 5, peMax: 40, minMarketCap: 50
}
```

### 7.9 技术指标公式

| 指标 | 公式 | 周期 |
|------|------|------|
| MA | `Σ(close) / n` | 5/10/20/60/120 |
| EMA | `close × 2/(n+1) + prevEMA × (1 - 2/(n+1))` | 12/26 |
| MACD | `DIF = EMA12 - EMA26; DEA = EMA(DIF,9); HIST = 2×(DIF-DEA)` | 12,26,9 |
| RSI | `100 - 100/(1 + avgGain/avgLoss)`，Wilder 平滑 | 14 |
| KDJ | `RSV = (close-lowN)/(highN-lowN)×100; K = 2/3×prevK + 1/3×RSV; D = 2/3×prevD + 1/3×K; J = 3K - 2D` | 9 |
| BOLL | `MID = MA(20); UPPER = MID + 2×STD(20); LOWER = MID - 2×STD(20)` | 20 |
| ATR | `TR = max(high-low, |high-prevClose|, |low-prevClose|); ATR = Wilder(TR,14)` | 14 |
| OBV | `OBV[i] = OBV[i-1] + sign(close[i]-close[i-1]) × volume[i]` | — |
| VMACD | 对成交量加权价格计算 MACD | 12,26,9 |

---

## 8. AI 综合判断

### 8.1 流程
1. 前端收集评分摘要、技术摘要、基本面摘要、资金面摘要、风险摘要、近期走势、趋势阶段、上次建议
2. POST `/api/stock-analysis/ai-judge`，服务端构建 Prompt 调用 GLM-5.1
3. SSE 流式返回：`data: {"type":"text","content":"..."}\n\n` + `data: [DONE]\n\n`
4. 前端 `fetch` + `ReadableStream` 消费，增量更新到 `aiJudgeText` ref
5. 支持 `AbortController` 中断

### 8.2 Prompt 结构
- 股票信息（名称、代码、评分、建议、置信度）
- 技术面（得分、看多/看空信号数、关键信号、明细、趋势阶段）
- 基本面（PE/PB/行业/ROE/毛利率/净利率/增速/负债率/现金流）
- 资金面（主力/融资/量价）
- 风险面（得分 + 明细）
- 近期走势（5 日/20 日涨跌）
- 上次建议（对比，避免重复"观望"）

### 8.3 输出要求
- 一句话结论（客观反映数据，不默认偏空）
- 3-4 个核心要点（**标题**：分析内容，含具体数字）
- 可执行操作建议（入场/加仓条件 + 止损/减仓条件）

### 8.4 缓存
1 分钟，Key = `${code}_${total}_${keySignals}`，LRU 100 条

---

## 9. 复现指引

### 9.1 必需依赖
- Node.js ≥ 18（支持原生 fetch）
- npm install（根目录 + server 目录）

### 9.2 环境变量（`server/.env`）
```
GLM_API_KEY=your-zhipu-api-key       # AI 判断必需
EASTMONEY_EMAUTH=your-emauth-cookie  # AI 选股需要（可选）
PORT=3001                             # 后端端口，默认 3001
```

### 9.3 启动
```bash
npm start  # 同时启动后端（3001）和前端（Vite 默认 5173）
```

### 9.4 Vite 代理
`/api` → `http://localhost:3001`

### 9.5 复现要点
1. **九维判定**：严格按 4.1 的权重、阈值、状态惯性规则实现
2. **评分引擎**：四维动态权重 + 行业分档阈值，避免默认分抬高分值
3. **ATR 仓位**：风险预算 2% + 策略上限双约束，波动率自适应调整 atrN
4. **背离检测**：多尺度极值 + 幅度过滤 + 时间衰减 + 置信度
5. **数据缓存**：前端 LRU + localStorage，后端多层 Map 缓存 + TTL
6. **多源回退**：主源东财 → 腾讯/新浪/金融界
7. **状态惯性**：跨天恢复 + 紧急翻转 + 冷却期 + 连续确认
8. **AI 流式**：SSE + AbortController，只取 content 过滤 reasoning_content
