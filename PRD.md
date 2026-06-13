# Ultimate Trading System — 产品需求文档 (PRD)

> **版本**: 1.0.0  
> **最后更新**: 2026-06-13  
> **说明**: 本文档基于现有系统代码反向生成，完整描述系统功能、数据源及数据解析逻辑。  
> **排除说明**: "市场分析 Market Analysis" 功能模块已从本文档中排除。

---

## 目录

1. [产品概述](#1-产品概述)
2. [技术架构](#2-技术架构)
3. [功能模块详述](#3-功能模块详述)
   - 3.1 [Dashboard 仪表盘](#31-dashboard-仪表盘)
   - 3.2 [Stock Analysis 个股分析](#32-stock-analysis-个股分析)
   - 3.3 [Watchlist 自选股](#33-watchlist-自选股)
   - 3.4 [Screener 选股筛选](#34-screener-选股筛选)
   - 3.5 [Position 仓位计算](#35-position-仓位计算)
   - 3.6 [Journal 交易日志](#36-journal-交易日志)
   - 3.7 [Guide 策略速查](#37-guide-策略速查)
4. [数据源及数据解析完整清单](#4-数据源及数据解析完整清单)
5. [核心算法与规则引擎](#5-核心算法与规则引擎)
6. [数据持久化与状态管理](#6-数据持久化与状态管理)
7. [定时刷新与性能策略](#7-定时刷新与性能策略)

---

## 1. 产品概述

### 1.1 产品定位

Ultimate Trading System 是一套**A股量化交易辅助系统**，面向中国A股市场个人投资者，提供从市场判断→选股→分析→仓位管理→交易记录→复盘的**全流程交易决策支持**。

### 1.2 核心价值

- **系统性交易**：以九维大盘判定为核心，提供量化的市场环境评估
- **纪律性执行**：内置铁律、交易前检查清单、情绪管理机制
- **闭环复盘**：交易记录→绩效统计→策略对比→问题分析完整闭环
- **ATR 动态仓位**：基于波动率的自适应止损止盈体系

### 1.3 用户画像

中国A股市场个人投资者，追求系统化、纪律化的交易决策，希望减少情绪干扰、建立科学的风险管理体系。

---

## 2. 技术架构

### 2.1 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue 3 | ^3.5.0 | 前端框架（Composition API） |
| Vue Router | ^4.5.0 | 路由管理 |
| Pinia | ^2.3.0 | 状态管理 |
| ECharts | ^6.0.0 | 图表渲染 |
| Vite | ^6.3.0 | 构建工具 |

### 2.2 项目结构

```
src/
├── main.js                    # 入口：挂载 Pinia + Router
├── App.vue                    # 根组件：NavBar + RouterView
├── router/index.js            # 路由定义（8个页面）
├── components/
│   ├── NavBar.vue             # 全局导航栏
│   ├── Sparkline.vue          # 迷你折线图组件
│   ├── IntradayChart.vue      # 分时图组件
│   ├── KlineChart.vue         # K线图组件
│   └── analysis/
│       ├── TechnicalPanel.vue  # 技术面面板
│       ├── FundamentalPanel.vue # 基本面面板
│       ├── CapitalFlowPanel.vue # 资金面面板
│       └── ScorePanel.vue      # 综合评分面板
├── composables/
│   ├── useStockData.js        # 个股数据加载与评分计算
│   ├── useStrategyGuide.js    # 策略执行计划计算
│   └── useECharts.js          # ECharts 封装
├── stores/
│   ├── market.js              # 大盘数据（指数/广度/北向/融资/涨跌停）
│   ├── watchlist.js           # 自选股列表
│   ├── position.js            # 持仓管理
│   ├── journal.js             # 交易日志
│   ├── stockAnalysis.js       # 个股分析缓存
│   └── marketAnalysis.js      # 市场分析（行业/宏观）
├── utils/
│   ├── constants.js           # 常量定义
│   ├── marketJudge.js         # 九维大盘判定算法
│   ├── scoring.js             # 个股综合评分引擎
│   ├── indicators.js          # 技术指标计算
│   ├── position.js            # ATR仓位计算
│   ├── screenerPrompt.js      # 选股条件构建
│   ├── aiJudge.js             # AI判断 SSE客户端
│   ├── divergence.js          # 背离检测算法
│   ├── riskMetrics.js         # 风险指标计算
│   ├── scoreHistory.js        # 评分历史记录
│   ├── marketCycle.js         # 市场周期
│   ├── industryRank.js        # 行业排名
│   ├── format.js              # 格式化工具
│   └── storage.js             # localStorage 统一读写
├── views/
│   ├── Dashboard.vue          # 仪表盘
│   ├── StockAnalysis.vue      # 个股分析
│   ├── Watchlist.vue          # 自选股
│   ├── Screener.vue           # 选股筛选
│   ├── Position.vue           # 仓位计算
│   ├── Journal.vue            # 交易日志
│   └── Guide.vue              # 策略速查
└── styles/
    └── global.css             # 全局样式
```

### 2.3 路由配置

| 路由路径 | 页面名称 | 导航标签 | 功能描述 |
|----------|----------|----------|----------|
| `/` | Dashboard | 📊 Dashboard | 市场仪表盘，大盘判定+策略选股 |
| `/stock-analysis` | StockAnalysis | 📈 Stock Analysis | 个股深度分析（技术/基本面/资金/AI） |
| `/watchlist` | Watchlist | ⭐ Watchlist | 自选股管理与行情监控 |
| `/screener` | Screener | 🔍 Screener | 四层漏斗式选股 |
| `/position` | Position | 📐 Position | ATR动态仓位计算器 |
| `/journal` | Journal | 📓 Journal | 交易记录与复盘分析 |
| `/guide` | Guide | 📖 Guide | 策略规则速查手册 |

### 2.4 后端服务架构

后端为独立 Koa 服务（`server/` 目录），监听 `localhost:3001`，前端通过 Vite 代理 `/api` 对接。所有上游行情/财务/宏观数据均由后端统一拉取、缓存、容错，前端只消费规范化后的 JSON。

#### 2.4.1 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥20（实测 25） | 运行时，内置 `fetch` / `headers.getSetCookie()` |
| Koa | ^2.16 | Web 框架 |
| @koa/router | ^13.1 | 路由 |
| @koa/cors · koa-bodyparser · koa-logger | ^5.0 / ^4.4 / ^3.2 | 跨域 / 请求体解析 / 访问日志中间件 |
| dotenv | ^17.4 | 环境变量（`GLM_API_KEY` 等） |
| openai SDK | ^6.39 | 以 OpenAI 兼容协议调用智谱 GLM |

#### 2.4.2 模块结构

```
server/
├── index.js            # 应用入口：中间件挂载、统一响应(ok/fail)、服务端 LRU 缓存、市场/个股/选股路由、健康检查、子模块注册与启动
├── analysis.js         # 市场分析：板块排名+RS轮动(4源容错)、估值+股债利差、宏观因子(PPI平减+成分拆解)
├── stockAnalysis.js    # 个股分析：基本面、量价资金流、主力资金、北向、融资融券、股东户数、基准K线
├── aiJudge.js          # AI 综合判断：智谱 GLM(glm-5.1，OpenAI 兼容)、SSE 流式输出、1 分钟缓存
├── fallback.js         # 备用数据源适配层(腾讯/新浪)：东方财富失败时自动切换，返回格式与主源完全一致
├── rs_history.json     # 板块 RS 历史磁盘快照（每日，保留 30 天）
└── .env                # 配置：GLM_API_KEY
```

各业务模块通过 `registerXxxRoutes(router)` 统一注册到主路由，由 `index.js` 集中挂载（`app.use(router.routes())`）。

#### 2.4.3 架构设计要点

- **统一响应格式**：所有接口返回 `{ ok, data?, error? }`，前端以 `ok` 判定成功
- **多源容错**：东方财富为主，失败自动回退腾讯 / 新浪 / 金融界 / 证券时报（按数据类型配置主备链路）；`fetch` 失败再降级到 `https` 模块强制 IPv4 解析
- **服务端缓存**：内存 LRU Map，按接口差异化 TTL（涨跌家数 30s、资金流 3~5min、融资/基本面 30min、宏观 6h）；板块 RS 历史落盘 `rs_history.json`
- **超时与中断**：上游请求统一 8s 超时 + `AbortController` 中断，避免慢请求拖垮服务
- **AI 流式输出**：`/api/stock-analysis/ai-judge` 以 SSE 推送 GLM 增量文本；缺 `GLM_API_KEY` 时返回明确错误而非崩溃
- **无数据库依赖**：纯数据代理 + 内存缓存 + 文件快照，水平扩展时缓存为进程级

> 完整接口字段、上游数据源映射与缓存 TTL 详见 [docs/dataInterface.md](docs/dataInterface.md)。

---

## 3. 功能模块详述

### 3.1 Dashboard 仪表盘

#### 3.1.1 功能描述

Dashboard 是系统首页，提供市场环境全景视图和基于市场状态的策略选股建议。

#### 3.1.2 页面组成

**① 三大指数实时卡片**
- 显示上证指数、深证成指、创业板指
- 每张卡片包含：指数名称、实时价格、涨跌幅（%）、分时走势迷你图（Sparkline）
- 价格优先取分时图最新点（10秒刷新），回退到快照报价（1分钟刷新）

**② 市场状态球体（Status Orb）**
- 可视化展示当前市场判定结果（牛市/偏多/震荡/偏空/熊市）
- 球体颜色：红色=多头、绿色=空头、黄色=中性
- 下方显示：建议仓位、推荐策略、信号确认状态

**③ 九维信号判据面板**
- 以 3×3 网格展示 9 个判定维度的信号
- 每个信号卡片包含：维度名称、信号值、方向标签（牛/熊/中）、描述文字、子指数信号（上证/深证/创业板分别的判定）
- 支持背离检测标识（底背离/顶背离）
- 高权重信号（≥1.5）标注"强"标签

**④ 牛熊评分条**
- 三段式横条：牛权重 | 中性 | 熊权重
- 直观展示多空力量对比

**⑤ 做多窗口速判**
- 3 项条件同时满足时显示"窗口已开启"：
  1. 指数收盘价 > MA60
  2. MA60 连续 3 天拐头向上
  3. 涨跌比 ≥ 1.8

**⑥ 行业资金流向 & RS 轮动**（可折叠）
- 涨幅 TOP5 行业：行业名、涨幅、主力净流入、领涨股
- 主力净流入 TOP5 行业
- RS（相对强度）强势/弱势 TOP5 板块：5日超额收益、RS比率、趋势方向（加速/减速）、今日涨跌

**⑦ 宏观因子面板**（可折叠）
- PMI（制造业/非制造业）
- M2/M1 剪刀差
- CPI（同比/环比/累计 + 城市/农村分项）
- PPI（同比 + 涨幅趋势，作为价格平减输入）
- GDP（同比 + 一/二/三产分项）
- 社融（增量 + 名义增速 + PPI 平减后实际增速）
- 每个因子标注利好/利空/中性信号
- 评分采用"总量 + 成分组成"双维度：社融按实际增速（名义剔除PPI）判断，避免价格虚增高估信用扩张；GDP 结合三产结构判断扩张可持续性

**⑧ 策略选股建议**
- 根据市场状态自动推荐策略：
  - 牛市 → 趋势突破
  - 偏多 → 回调买入
  - 震荡 → 回调买入（可切换底部确认）
  - 偏空/熊市 → 不推荐买入
- 支持严/宽模式切换
- 生成 AI 智能选股条件文本（可复制）
- 调用选股 API 返回候选股列表（显示名称、代码、价格、涨跌幅、PE、PB、换手率、主力资金流向）
- 点击候选股跳转至个股分析页，并携带策略执行计划

**⑨ 交易前检查清单**
- 8 项检查项，勾选式交互
- 显示完成进度（已勾/总数）

#### 3.1.3 数据源

| 数据 | API 端点 | 刷新频率 |
|------|----------|----------|
| 指数分时 | `/api/market/indices/intraday` | 10 秒 |
| 指数报价+MA | `/api/market/indices` | 1 分钟 |
| 涨跌家数 | `/api/market/breadth` | 30 秒 |
| 北向资金 | `/api/market/northbound` | 1 分钟 |
| 融资余额 | `/api/market/margin` | 1 分钟 |
| 涨跌停统计 | `/api/market/limit-stats` | 1 分钟 |
| 行业资金流向 | (via `marketAnalysis` store) | 手动/进入时 |
| 宏观因子 | (via `marketAnalysis` store) | 手动/进入时 |
| 选股查询 | `/api/stock/xuangu/ai` 或 `/api/stock/xuangu/structured` | 手动触发 |

---

### 3.2 Stock Analysis 个股分析

#### 3.2.1 功能描述

对单只股票进行多维度深度分析，包括技术面、基本面、资金面的量化评分，以及 AI 综合判断。

#### 3.2.2 页面组成

**① 顶部股票选择栏**
- 下拉选择（从自选股列表）
- 搜索框（支持代码/名称/拼音，防抖 500ms，后端搜索 `/api/stock/search`）
- 实时价格显示（红涨绿跌）
- 刷新按钮 + 数据时间戳

**② 诊断卡片行**
- 综合评分：总分 + 操作建议（颜色随分数变化）
- 趋势诊断：强势多头/偏多/震荡/偏空/弱势空头
- 估值诊断：低估/合理/略高/偏高/高估/亏损
- 资金诊断：主力流入/温和流入/平稳/温和流出/主力流出
- 点击诊断卡片可跳转到对应 Tab

**③ 投资风格切换**
- 短线（资金面42% / 技术面35% / 基本面15% / 风险8%）
- 中线（资金面32% / 技术面30% / 基本面26% / 风险12%）
- 长线（基本面40% / 风险18% / 技术面22% / 资金面20%）

**④ 策略执行计划卡**（从 Dashboard 策略选股跳转时显示）
- 策略名 + 信号质量等级（一致/谨慎/矛盾/不推荐）
- 风险等级 + ATR 值
- 入场位 / 止损位 / 跟踪止盈位（三列布局）
- 仓位上限（按信号质量调整） / 持仓周期 / 时间止损
- 历史胜率（来自交易日志统计）
- 当前价距入场百分比 + 状态标签（已突破/等待/支撑已破等）
- 一键建仓按钮（自动写入交易日志）

**⑤ 四 Tab 分析面板**
1. **综合评分 Tab**：四维度得分雷达、操作建议、AI 综合判断（SSE 流式输出）
2. **技术面 Tab**：K线图 + 技术指标（MA/MACD/KDJ/RSI/BOLL/ATR）+ 信号列表
3. **基本面 Tab**：PE/PB/ROE/营收增长/利润增长/负债率/毛利率/现金流质量 + 行业对比
4. **资金面 Tab**：资金流向、融资融券、北向资金持股、主力资金、股东户数变化

**⑥ AI 综合判断**
- 可手动开关
- 开启后在评分计算完成后自动触发（延迟 2 秒）
- SSE 流式输出，实时展示分析过程
- 提取上下文：评分摘要、技术信号、基本面数据、资金面数据、趋势阶段（MA排列+MACD方向）、历史价格变动

#### 3.2.3 数据加载策略

采用**两阶段加载**：
1. **首屏阶段**（并行）：K线数据 + 基本面数据
2. **后台阶段**（并行）：资金流向 + 融资融券 + 北向资金 + 主力资金 + 股东户数 + 基准K线

首屏加载完成后显示骨架屏，后台数据加载完毕后计算评分并更新 UI。

#### 3.2.4 数据源

| 数据 | API 端点 | 说明 |
|------|----------|------|
| K线数据 | `/api/stock/{code}/kline?klt={period}&lmt=250` | 支持日线/周线/月线/分钟线 |
| 基本面 | `/api/stock-analysis/fundamental?code={code}` | PE/PB/ROE/增长率等 |
| 资金流向 | `/api/stock-analysis/capital-flow?code={code}` | 量价信号+成交量趋势 |
| 融资融券 | `/api/stock-analysis/margin?code={code}` | 余额/买入/偿还数据 |
| 北向持股 | `/api/stock-analysis/northbound?code={code}` | 持股变动+频率标记 |
| 主力资金 | `/api/stock-analysis/main-force-flow?code={code}` | 大单/中单/小单净流入 |
| 股东户数 | `/api/stock-analysis/shareholder?code={code}` | 户数变化+筹码集中度 |
| 基准K线 | `/api/stock-analysis/benchmark-kline?lmt=250` | 沪深300基准（Beta/Sharpe用） |
| AI 判断 | `/api/stock-analysis/ai-judge`（SSE POST） | 流式输出综合分析 |
| 搜索 | `/api/stock/search?kw={keyword}` | 股票代码/名称搜索 |

#### 3.2.5 数据解析逻辑

**K线数据解析**：
- 返回格式：`{ ok: true, data: { klines: [{date, open, high, low, close, volume, amount, ...}] } }`
- 通过 `calcAllIndicators(klines)` 计算技术指标：MA(5/10/20/60)、MACD(12,26,9)、KDJ(9,3,3)、RSI(14)、BOLL(20,2)、ATR(14)
- 技术信号提取：均线排列/金叉死叉、MACD金叉/死叉/背离、KDJ金叉/死叉/背离、RSI超买超卖/共振、BOLL突破/收口、量能强度、价格位置

**基本面数据解析**：
- 返回格式：`{ ok: true, data: { latest: { pe, pb, roe, revenueGrowth, profitGrowth, debtRatio, grossMargin, netMargin, ocfPerShare, ocfToProfitRatio, industry, ... }, history: [...] } }`
- 直接使用 `latest` 对象中的字段，按行业分档阈值进行评分

**资金面数据解析**：
- `capitalFlow`：量价信号字符串（如"放量上涨"）+ 成交量趋势
- `marginData`：`{ latest: { rzBalance, balanceGrowth, rzNetBuy }, data: [...] }`，余额趋势+净买入
- `northboundData`：`{ latest: { changeRatio }, prev, _frequency }`，持股变动比例+数据频率（daily/quarterly）
- `mainForceFlow`：`{ latest: { mainNetInflow, mainNetPct }, summary: { mainNetAvgPct5 }, data: [...] }`
- `shareholderData`：`{ latest: { changeRatio }, prev, data: [...], _frequency }`，户数变化+筹码趋势

**数据注入机制**：
- `injectCapitalExtras()` 将 margin/northbound/mainForce/shareholder 数据注入到 `capitalFlow` 对象中
- 注入字段以 `_` 前缀标识：`_marginLatest`, `_marginData`, `_northboundLatest`, `_northboundPrev`, `_northboundFrequency`, `_mainForceLatest`, `_mainForceSummary`, `_mainForceData`, `_shareholderLatest`, `_shareholderPrev`, `_shareholderData`, `_shareholderFrequency`

---

### 3.3 Watchlist 自选股

#### 3.3.1 功能描述

管理自选股列表，实时监控行情，提供分时图/K线图查看和基本统计数据。

#### 3.3.2 页面组成

**① 三大指数分时卡片**（页面顶部）
- 上证指数、深证成指、创业板指分时走势图
- 显示实时价格、涨跌幅

**② 左侧自选股列表**
- 搜索框：支持代码/名称/拼音搜索（防抖 300ms）
- 批量管理模式：全选/多选/批量删除
- 置顶功能：鼠标悬停显示置顶按钮，置顶项分组显示
- 拖拽排序：通过拖拽手柄调整顺序
- 每只股票显示：名称、代码、实时价格、涨跌幅、迷你分时图

**③ 右侧详情面板**
- 周期切换 Tab：1日/6月/1年/5年/全部
- 分时图（1日模式）或 K线图（6月及以上模式）
- 统计数据网格：日内最高/最低、区间最高/最低、PE、PB、总市值、涨跌幅、行业、地域、概念
- 操作按钮：计算仓位（跳转 Position 页）、移除

#### 3.3.3 数据源

| 数据 | API 端点 | 刷新频率 |
|------|----------|----------|
| 批量报价 | `/api/stock/batch/quotes?codes={codes}` | 10 秒 |
| 指数分时 | `/api/market/indices/intraday` | 10 秒 |
| 个股分时 | `/api/stock/{code}/intraday` | 10 秒（1日模式） |
| 个股K线 | `/api/stock/{code}/kline` | 按需加载 |
| 5年K线 | `/api/stock/{code}/kline5y` | 按需加载 |
| 基本信息 | `/api/stock/{code}/basic` | 按需加载 |
| 搜索 | `/api/stock/search?kw={keyword}` | 用户输入触发 |

#### 3.3.4 数据解析

- **批量报价**：`{ ok: true, data: { "{code}": { close, change, changeAmt, preClose, ... } } }`，以 code 为 key 的对象
- **分时数据**：`{ ok: true, data: { trends: [{close, time, ...}], preClose } }`
- **K线数据**：`{ ok: true, data: { klines: [{date, open, high, low, close, volume, ...}] } }`
- **基本信息**：`{ ok: true, data: { pe, pb, totalMarketCap, industry, region, concept, ... } }`

---

### 3.4 Screener 选股筛选

#### 3.4.1 功能描述

四层漏斗式选股工具，可自定义排雷、基本面、景气度、技术信号筛选条件，生成东方财富可用的选股条件。

#### 3.4.2 四层漏斗

**第一层：排雷清单（12 项，至少勾选 5 项）**

| # | 排雷项 | 类型 | 说明 |
|---|--------|------|------|
| 1 | 非 ST | 自动 | 排除 ST、*ST 股票 |
| 2 | 非停牌 | 自动 | 排除停牌股票 |
| 3 | 非北交所 | 自动 | 排除北交所股票 |
| 4 | 非退市 | 自动 | 排除退市风险股 |
| 5 | 审计意见：标准无保留 | 自动 | 最新审计意见为标准无保留 |
| 6 | 商誉/净资产 < 30% | 自动 | 商誉占净资产比例小于30% |
| 7 | 大股东质押 < 60% | 自动 | 大股东质押比例小于60% |
| 8 | 上市天数 > 250天 | 自动 | 排除次新股 |
| 9 | 关联交易/营收 < 40% | F10手动 | 需 F10 查阅 |
| 10 | 无存贷双高 | F10手动 | 需 F10 查阅 |
| 11 | 董监高减持 < 5% | F10手动 | 需 F10 查阅 |
| 12 | 无重大诉讼/处罚 | F10手动 | 需 F10 查阅 |

**第二层：基本面筛选（7 项）**

| 指标 | 默认值 | 说明 |
|------|--------|------|
| ROE | 12% | 净资产收益率下限 |
| 营收增速 | 10% | 营业收入同比增长率下限 |
| 利润增速 | 10% | 净利润同比增长率下限 |
| 资产负债率 ≤ | 60% | 负债率上限 |
| 经营现金流 | 正值 | 布尔选择：正值/不限 |
| PE 下限 | 5 | 市盈率下限 |
| PE 上限 | 40 | 市盈率上限 |

**第三层：景气度验证（3选1，可选）**

| 选项 | 描述 |
|------|------|
| 机构增持 | 机构持股↑ + 北向持股↑ + 主力净流入 |
| 业绩超预期 | 净利润增速>30% + 营收增速>20% + 研报≥3 |
| 龙虎榜强势 | 近3日上榜 + 买方机构多 + 换手率3-20% |

**第四层：技术信号（3选1，可选）**

| 选项 | 描述 |
|------|------|
| 趋势突破 | 放量突破20日高点 + MACD金叉 + MA20↑ + MA60↑ |
| 回调买入 | 股价>MA60 + 缩量回调至MA20 ±2% + 量缩 |
| 底部右侧确认 | 跌>40% + 缩量后放量 + RSI<30拐头 + MACD金叉 |

#### 3.4.3 输出

- **AI 智能选股条件**：自然语言文本（可复制到东方财富）
- **结构化筛选条件**：解析后的条件标签（显示每条条件的描述和有效性）
- **候选股列表**：匹配的股票卡片（名称、代码、价格、涨跌幅、PE、换手率、主力流向、负债率、质押率、商誉比）
- **F10 复核提醒**：列出仍需手动 F10 复核的项目
- 点击候选股可添加到自选并跳转查看详情

#### 3.4.4 数据源

| 数据 | API 端点 | 说明 |
|------|----------|------|
| AI 选股 | `POST /api/stock/xuangu/ai` | `{ keyWordNew, pageSize }` → 自然语言选股 |
| 结构化选股 | `/api/stock/xuangu/structured?filter={filter}&ps=40&mines={ids}` | 结构化条件选股 |
| AI Cookie 状态 | `/api/stock/xuangu/ai/status` | 检查东财登录态是否可用 |
| 搜索 | `/api/stock/search?kw={keyword}` | 股票搜索 |

#### 3.4.5 选股条件构建逻辑

**自然语言模式** (`buildKeyWordNew`)：
- 将四层漏斗参数转化为逗号分隔的自然语言描述
- 例："非ST，非停牌，非北交所，非退市，上市时间超过1年，ROE大于等于12%，营收增速大于等于10%..."

**结构化模式** (`buildStructuredFilter`)：
- 转化为东方财富 RPTA_PCNEW_STOCKSELECT 接口的 filter 字符串
- 使用字段如：`TRADE_MARKET_CODE`, `ROE_WEIGHT`, `TOI_YOY_RATIO`, `PE9`, `TOTAL_MARKET_CAP`, `MACD_GOLDEN_FORK`, `LONG_AVG_ARRAY`, `VOLUME_RATIO`, `KDJ_GOLDEN_FORK` 等

**查询策略**：优先使用 AI 选股 API，若返回结果解析条件过少（total > 200 或 conditions < 3），回退到结构化 API。

---

### 3.5 Position 仓位计算

#### 3.5.1 功能描述

基于 ATR（Average True Range）的动态仓位计算器，支持三种策略的止损止盈参数自动配置。

#### 3.5.2 策略参数

| 策略 | ATR乘数N | 跟踪止盈M | 仓位上限 | 持有期 | 时间止损 |
|------|----------|-----------|----------|--------|----------|
| 趋势突破 | 1.5 | 2.0×ATR | 25% | 1-4周 | 5日未突破前高→出场 |
| 回调买入 | 2.0 | 3.0×ATR | 25% | 2-8周 | 8日未企稳→出场 |
| 底部右侧确认 | 3.0 | 4.0×ATR | 3% | 1-6月 | 15日未确认→出场 |

#### 3.5.3 计算公式

- **ATR 计算**：Wilder 平滑法，ATR(14)
- **止损价** = 买入价 − N × ATR(14)（高波动 N+0.5，低波动 N-0.5）
- **仓位计算**：`单只仓位 = min(总资金 × 2% / 止损幅度, 总资金 × 仓位上限%)`
- **盈亏比** = (目标价 − 买入价) / (买入价 − 止损价)
- **跟踪止盈初始价** = 止损价（买入后即设为止损价，后续只上移）
- **跟踪止盈更新**：`max(昨日止盈价, 最高收盘价 − M × ATR(14))`

#### 3.5.4 页面组成

- **左侧计算器**：输入股票代码→获取ATR→选择策略→输入买入价/目标价→计算结果
- **右侧面板**：
  - 策略参数参考表
  - 行业集中度柱状图（按持仓行业分布，超30%预警）
  - 持仓管理表（代码/行业/买价/止损/跟踪止盈/仓位/策略/日期）

#### 3.5.5 数据源

| 数据 | API 端点 | 说明 |
|------|----------|------|
| K线（ATR计算用） | `/api/stock/{code}/kline` | 需≥15条K线数据 |

---

### 3.6 Journal 交易日志

#### 3.6.1 功能描述

完整的交易记录管理系统，包含开仓记录、平仓复盘、绩效统计和铁律违反追踪。

#### 3.6.2 页面组成（三个 Tab）

**Tab 1：交易记录**

- **新增交易表单**（可折叠）：
  - 股票代码/名称/买入价/数量
  - 策略选择（趋势突破/回调买入/底部右侧确认）
  - 市场环境（牛市/偏多/震荡/偏空/熊市）
  - 行业/ATR（可一键获取）
  - 止损价/目标价
  - 盈亏比预览（< 2:1 时警告）
  - 交易前检查清单（8项勾选）

- **持仓中交易列表**：
  - 股票/策略/买价/止损/目标/数量/日期
  - 平仓按钮 + 删除按钮

- **已平仓交易列表**：
  - 股票/策略/买卖价/盈亏金额/盈亏比/卖出原因/日期
  - 展开复盘详情：情绪评分/执行评分/违反铁律/问题标签/复盘备注

- **平仓弹窗**：
  - 卖出价/卖出原因（6种：触发止损/到达目标/跟踪止盈/时间止损/逻辑止损/手动）
  - 情绪评分（1-5分按钮）
  - 执行评分（1-5分按钮）
  - 规则违反勾选（7条铁律）
  - 问题标签勾选（执行失误/时机错误/选股错误/环境不匹配/情绪驱动）
  - 复盘备注（自由文本）

**Tab 2：绩效统计**

- 核心指标卡片：胜率、利润因子、总盈亏、平均盈利、平均亏损、交易次数
- 月度权益曲线（Sparkline 图 + 按月统计表）
- 策略对比表（策略名/交易数/胜率/总盈亏）

**Tab 3：复盘分析**

- 连续止损警告（≥5次时红色警告横幅）
- 铁律违反统计（7条铁律各被违反次数）
- 问题分析柱状图（5种问题标签的出现频次）
- 复盘记录列表（有复盘备注的已平仓交易）

#### 3.6.3 七条铁律

| # | 铁律 | 描述 | 违反后果 |
|---|------|------|----------|
| 1 | 止损不可撤销 | 到了止损位必须卖，不抱任何幻想 | 小亏变大亏 |
| 2 | 不追涨杀跌 | 没有信号不进场，不因 FOMO 买入 | 高位接盘/低位割肉 |
| 3 | 不逆势满仓 | 熊市不加杠杆，震荡市不满仓 | 爆仓/深度套牢 |
| 4 | 不在亏损仓位加仓 | 亏了不加码，止损而非补仓 | 亏损放大 |
| 5 | 不过度交易 | 有信号才交易，每月交易不超过 10 次 | 手续费吞噬利润 |
| 6 | 不碰不懂的票 | 没研究过的不买，不跟风听消息 | 盲目赌博 |
| 7 | 不临时起意 | 盘中不产生新想法，所有计划盘前制定 | 情绪化操作 |

#### 3.6.4 数据存储

全部交易数据存储在浏览器 `localStorage`（key: `journal_trades`），无后端存储。

---

### 3.7 Guide 策略速查

#### 3.7.1 功能描述

系统内置的交易规则速查手册，包含完整的买入决策树、市场判定规则、买卖策略、仓位管理规则和纪律要求。

#### 3.7.2 章节结构

| 章节 | 内容 |
|------|------|
| 🛒 想买入 | 6 步买入决策树（排雷→基本面→大盘→信号→盈亏比→执行） |
| 📊 市场趋势状态 | 九维判据维度表 + 综合判定规则 + 5种状态卡片 |
| 📈 买入策略 | 3种策略详细条件 + 参数表 |
| 💰 要卖出 | 卖出优先级 + ATR动态止损公式 + 跟踪止盈规则 |
| 📐 不知仓位 | 总仓位控制表 + 个股仓位公式 + 加减清仓规则 |
| 🛡️ 铁律 | 7条铁律卡片 |
| 🧠 情绪波动 | 4种情绪（贪婪/恐惧/后悔/侥幸）的触发场景和应对策略 |
| 📋 每日流程 | 盘前/盘中/盘后时间表 |
| 🚨 系统失效指标 | 5项失效指标及应对方案 |
| ⭐ 核心公式 | 长期盈利 = 正期望策略 × 严格风险控制 × 纪律性执行 × 时间复利 |

#### 3.7.3 交互方式

- 左侧固定导航栏，点击滚动到对应章节
- 右侧内容区支持滚动，自动高亮当前章节
- 移动端：导航栏变为水平滚动条

---

## 4. 数据源及数据解析完整清单

### 4.1 后端 API 完整列表

#### 4.1.1 市场数据 API

| API 端点 | 方法 | 请求参数 | 返回数据结构 | 使用页面 |
|----------|------|----------|-------------|----------|
| `/api/market/indices` | GET | 无 | `{ ok, data: { sh: { quote: {close, change, preClose}, ma: {ma60}, klines: [...] }, sz: {...}, cyb: {...} } }` | Dashboard |
| `/api/market/indices/intraday` | GET | 无 | `{ ok, data: { sh: { trends: [{close, time}], preClose, ... }, sz: {...}, cyb: {...} } }` | Dashboard, Watchlist |
| `/api/market/breadth` | GET | 无 | `{ ok, data: { up: number, down: number, ... } }` | Dashboard |
| `/api/market/northbound` | GET | 无 | `{ ok, data: [{ date, nfAmt, sciRate, sscRate, ... }] }` | Dashboard |
| `/api/market/margin` | GET | 无 | `{ ok, data: [{ date, rzBalance, rzNetBuy, rqBalance, ... }] }` | Dashboard |
| `/api/market/limit-stats` | GET | 无 | `{ ok, data: { limitUp, limitDown, naturalLimit, touchLimit, sealingRate, moneyEffect, t1PctChange, history, consecutiveBoards, maxConsecutiveDays, topSectorConcentration, sectorDistribution } }` | Dashboard |

#### 4.1.2 个股数据 API

| API 端点 | 方法 | 请求参数 | 返回数据结构 | 使用页面 |
|----------|------|----------|-------------|----------|
| `/api/stock/{code}/kline` | GET | `klt` (周期), `lmt` (条数) | `{ ok, data: { klines: [{date, open, high, low, close, volume, amount}] } }` | StockAnalysis, Watchlist, Position, Journal |
| `/api/stock/{code}/kline5y` | GET | 无 | 同 kline | Watchlist (5年/全部) |
| `/api/stock/{code}/intraday` | GET | 无 | `{ ok, data: { trends: [{close, time, ...}], preClose } }` | Watchlist |
| `/api/stock/{code}/basic` | GET | 无 | `{ ok, data: { pe, pb, totalMarketCap, industry, region, concept, ... } }` | Watchlist |
| `/api/stock/batch/quotes` | GET | `codes` (逗号分隔) | `{ ok, data: { "{code}": { close, change, changeAmt, preClose } } }` | Watchlist, StockAnalysis |
| `/api/stock/search` | GET | `kw` (关键词) | `{ ok, data: [{ code, name }] }` | Watchlist, StockAnalysis, Screener |

#### 4.1.3 个股分析 API

| API 端点 | 方法 | 请求参数 | 返回数据结构 | 使用页面 |
|----------|------|----------|-------------|----------|
| `/api/stock-analysis/fundamental` | GET | `code` | `{ ok, data: { latest: {pe, pb, roe, revenueGrowth, profitGrowth, debtRatio, grossMargin, netMargin, ocfPerShare, ocfToProfitRatio, industry, totalMarketCap}, history: [...] } }` | StockAnalysis |
| `/api/stock-analysis/capital-flow` | GET | `code` | `{ ok, data: { priceVolumeSignal, volumeTrend, available } }` | StockAnalysis |
| `/api/stock-analysis/margin` | GET | `code` | `{ ok, data: { latest: {rzBalance, balanceGrowth, rzNetBuy}, data: [...] } }` | StockAnalysis |
| `/api/stock-analysis/northbound` | GET | `code` | `{ ok, data: { latest: {changeRatio}, prev, _frequency } }` | StockAnalysis |
| `/api/stock-analysis/main-force-flow` | GET | `code` | `{ ok, data: { latest: {mainNetInflow, mainNetPct}, summary: {mainNetAvgPct5}, data: [...] } }` | StockAnalysis |
| `/api/stock-analysis/shareholder` | GET | `code` | `{ ok, data: { latest: {changeRatio}, prev, data: [...], _frequency } }` | StockAnalysis |
| `/api/stock-analysis/benchmark-kline` | GET | `klt`, `lmt` | `{ ok, data: { klines: [...] } }` | StockAnalysis |
| `/api/stock-analysis/ai-judge` | POST (SSE) | `{ code, name, scoreSummary, techSummary, fundSummary, capitalSummary, riskSummary, priceAction, trendContext, previousAdvice }` | SSE 流：`data: {type: "text", content: "..."}` | StockAnalysis |

#### 4.1.4 选股 API

| API 端点 | 方法 | 请求参数 | 返回数据结构 | 使用页面 |
|----------|------|----------|-------------|----------|
| `/api/stock/xuangu/ai` | POST | `{ keyWordNew, pageSize }` | `{ ok, data: { stocks: [{code, name, price, change, pe, pb, turnover, mainFlow, industry, marketCap}], total, conditions: [{conditionId, describe, isValid}] } }` | Dashboard, Screener |
| `/api/stock/xuangu/structured` | GET | `filter`, `ps`, `mines` | `{ ok, data: { stocks: [...] } }` | Dashboard, Screener |
| `/api/stock/xuangu/ai/status` | GET | 无 | `{ data: { hasCookie: boolean } }` | Dashboard, Screener |

### 4.2 数据解析流程图

```
┌─────────────────────────────────────────────────────────────┐
│                     Dashboard 数据流                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  /api/market/indices/intraday ──→ indexIntraday (ref)       │
│         │                          ├─ 上证分时趋势数据       │
│         │                          ├─ 深证分时趋势数据       │
│         │                          └─ 创业板分时趋势数据     │
│                                                             │
│  /api/market/indices ──→ marketStore.indices                │
│         │                    ├─ sh.quote (收盘/涨跌)         │
│         │                    ├─ sh.ma (ma60等)               │
│         │                    └─ sh.klines (K线序列)          │
│                                                             │
│  /api/market/breadth ──→ marketStore.breadth                │
│         │                   ├─ up (上涨家数)                 │
│         │                   └─ down (下跌家数)               │
│                                                             │
│  /api/market/northbound ──→ marketStore.northbound          │
│         │                     ├─ [i].nfAmt (成交额)         │
│         │                     └─ [i].sciRate (大盘涨跌幅)    │
│                                                             │
│  /api/market/margin ──→ marketStore.margin                  │
│         │                ├─ [i].rzBalance (融资余额)         │
│         │                └─ [i].rzNetBuy (净买入)            │
│                                                             │
│  /api/market/limit-stats ──→ marketStore.limitStats         │
│         │                    ├─ limitUp/limitDown            │
│         │                    ├─ sealingRate/moneyEffect      │
│         │                    ├─ consecutiveBoards            │
│         │                    └─ sectorDistribution           │
│                                                             │
│  上述 7 个数据源 ──→ judgeMarket() ──→ judgment              │
│         │                                       ├─ status    │
│         │                                       ├─ signals[] │
│         │                                       └─ score     │
│                                                             │
│  judgment.status ──→ getStrategyPreset() ──→ buildKeyWordNew()│
│                                              └─ 选股条件文本  │
│                                                             │
│  选股条件 ──→ /api/stock/xuangu/ai ──→ 候选股列表            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│                  Stock Analysis 数据流                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  阶段一（首屏并行加载）:                                      │
│  ┌──────────────────┐    ┌──────────────────────────┐       │
│  │ /api/stock/{code} │    │ /api/stock-analysis/     │       │
│  │     /kline        │    │   fundamental?code=      │       │
│  └────────┬─────────┘    └────────────┬─────────────┘       │
│           │                           │                      │
│           ▼                           ▼                      │
│     klines (ref[])          fundamental (ref)                │
│           │                           │                      │
│           ▼                           │                      │
│  calcAllIndicators(klines)            │                      │
│     ├─ MA (5/10/20/60)               │                      │
│     ├─ MACD (12,26,9)                │                      │
│     ├─ KDJ (9,3,3)                   │                      │
│     ├─ RSI (6,12,14,24)              │                      │
│     ├─ BOLL (20,2)                   │                      │
│     ├─ ATR (14)                      │                      │
│     ├─ 量能信号                       │                      │
│     ├─ 价格位置                       │                      │
│     └─ signals[] 技术信号列表          │                      │
│                                      │                      │
│  阶段二（后台并行加载）:                │                      │
│  ┌──────────────┐ ┌──────────┐ ┌───────────┐              │
│  │capital-flow   │ │ margin   │ │northbound │              │
│  └──────┬───────┘ └────┬─────┘ └─────┬─────┘              │
│         │              │             │                      │
│  ┌──────────────┐ ┌──────────┐ ┌───────────┐              │
│  │main-force-flow│ │shareholder│ │benchmark  │              │
│  └──────┬───────┘ └────┬─────┘ └─────┬─────┘              │
│         │              │             │                      │
│         ▼              ▼             ▼                      │
│  injectCapitalExtras() ─→ capitalFlow (增强)                │
│                                                             │
│  所有数据就绪 ──→ calculateScore() ──→ scoreResult           │
│     ├─ 技术面 (0-40)                                        │
│     ├─ 基本面 (0-42)                                        │
│     ├─ 资金面 (0-29)                                        │
│     └─ 风险面 (0-15)                                        │
│                                                             │
│  scoreResult + 上下文 ──→ fetchAIJudge() ──→ AI判断文本      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 前端计算数据 vs 后端数据

| 数据类型 | 来源 | 计算位置 | 说明 |
|----------|------|----------|------|
| MA/MACD/KDJ/RSI/BOLL/ATR | 前端 | `indicators.js` | 基于 K 线原始数据计算 |
| 技术信号（金叉/死叉/背离等） | 前端 | `indicators.js` + `divergence.js` | 基于指标序列检测 |
| 九维大盘判定 | 前端 | `marketJudge.js` | 基于后端提供的原始市场数据 |
| 个股综合评分 | 前端 | `scoring.js` | 基于技术信号+基本面+资金面+风险面 |
| 风险指标（Sharpe/Beta/最大回撤） | 前端 | `riskMetrics.js` | 基于个股K线+基准K线 |
| 策略执行计划 | 前端 | `useStrategyGuide.js` | 基于评分+信号质量+ATR |
| 选股条件文本 | 前端 | `screenerPrompt.js` | 参数化生成 |
| ATR 仓位计算 | 前端 | `position.js` | Wilder 平滑法 |
| 行业RS轮动 | 前端 | `marketAnalysis` store | 基于行业指数 vs 上证指数超额收益 |
| 宏观因子评分 | 前端 | `marketAnalysis` store | PMI/M2/CPI/**PPI**/GDP/社融 综合评分（含成分拆解：CPI城乡 / GDP三产 / 社融PPI平减实际增速） |
| K线/报价/基本面/资金流 | 后端 | API | 东方财富数据源 |

---

## 5. 核心算法与规则引擎

### 5.1 九维大盘判定算法（v7.4）

#### 5.1.1 维度权重配置

| 维度 | 权重 | 数据来源 | 强信号权重 |
|------|------|----------|-----------|
| MACD | 1.0 | 上证/深证/创业板 MACD(12,26,9) | 2.0（背离） |
| 涨跌家数 | 1.5 | 沪深京A股实时涨跌统计 | 2.0（极强） |
| RSI | 1.0 | 上证/深证/创业板 RSI(14) | 2.0（背离） |
| 融资余额 | 1.2 | 近10日融资余额线性回归斜率 | 2.0（强趋势） |
| 量价配合 | 1.3 | 上证指数 OBV 趋势 + 背离 | 2.0（背离） |
| 北向资金 | 1.5 | 近5日/20日成交额均量比 | 2.0（极端） |
| 涨跌停 | 1.3 | 并行评分（涨跌比/跌停数/封板率等） | 2.0（极强） |
| 宏观因子 | 0.5 | PMI/M1-M2剪刀差/CPI/**PPI**/GDP/社融（社融按PPI平减后的实际增速评分） | — |
| 波动率 | 1.0 | ATR(14)/收盘价 × 60日百分位 | 2.0（高波动+上升） |

#### 5.1.2 多指数综合判定

对上证/深证/创业板三个指数分别运行 MACD、RSI、量价配合、波动率判定，然后加权投票合成最终信号：
- 全部同向 → 高置信度（权重 × 1.2）
- 加权看多/看空 → 净权重差反映共识强度
- 主信号源与投票方向相反 → 降级描述

#### 5.1.3 背离检测（v7.1 增强版）

使用多尺度极值检测 + 置信度评分：
- 检测 MACD/RSI/OBV 与价格的顶部/底部背离
- 返回背离类型 + 置信度（0-1），置信度乘以强信号权重 2.0

#### 5.1.4 状态惯性机制（Hysteresis）

| 状态转换 | 条件 | 说明 |
|----------|------|------|
| 同方向调整（bull↔bull-lean, bear↔bear-lean） | 自由切换 | 无额外限制 |
| 跨方向翻转（多↔空） | `|net| ≥ 1.7` + 连续2交易日确认 + 3交易日冷却期 | 防止频繁翻转 |
| 紧急翻转 | `leadingW ≥ 7.0 && |net| ≥ 7.0` | 跳过确认和冷却，应对极端事件 |
| 进入中性 | `|net| ≥ 1.7` | 从极端方向进入中性较宽松 |
| 冷却期内预警 | crossCount ≥ 2 | 标记 pendingFlip，UI 可展示趋势恶化提示 |

**跨天恢复策略**：
- 同天恢复：完整恢复（含 crossCount）
- 跨天 ≤5天：恢复 status + lastFlipDate，crossCount 重置
- 跨天 >5天：丢弃（市场环境已显著变化）

### 5.2 个股综合评分引擎（v3）

#### 5.2.1 评分维度与满分

| 维度 | 满分 | 子项 |
|------|------|------|
| 技术面 | 40 | 均线排列(10) + MACD(8) + KDJ(5) + RSI(5) + BOLL(4) + 均线斜率(4) + 量能(4) + 价格位置(3) |
| 基本面 | 42 | PE估值(8) + ROE(8) + 营收增长(5) + 净利增长(5) + 负债率(4) + PB估值(4) + 现金流质量(4) + 毛利率(4) |
| 资金面 | 29 | 量价趋势(5) + 主力资金(8) + 融资融券(5) + 北向资金(6) + 筹码趋势(5) |
| 风险面 | 15 | Sharpe(5) + 最大回撤(5) + Beta(5) |

#### 5.2.2 行业感知阈值

评分引擎内置了 **24 个行业**的差异化阈值：

| 行业 | PE 分档 | PB 分档 | 负债率分档 | 毛利率分档 |
|------|---------|---------|-----------|-----------|
| 银行 | 8/12/18 | 0.8/1.2/2.0 | 88/93/96 | 3.0/2.2/1.5/1.0 |
| 半导体 | 25/50/80 | 3.0/6.0/10.0 | 25/40/55 | 60/45/30/15 |
| 医药 | 20/35/55 | 2.0/4.0/7.0 | 30/45/60 | 50/35/20/10 |
| 食品 | 15/30/50 | 2.0/5.0/10.0 | 30/45/60 | 50/35/20/10 |
| 科技 | 20/40/60 | 2.0/4.0/8.0 | 25/40/55 | 60/45/30/15 |
| ... | ... | ... | ... | ... |

行业匹配：中文关键字（从长到短）→ 英文 key → 阈值表查找 → 默认值回退。

#### 5.2.3 季度数据衰减

对于低频数据（季度），评分引擎根据投资风格自动降权：
- 短线：满分降至 40%，衰减系数 0.3
- 中线：满分降至 60%，衰减系数 0.5
- 长线：满分降至 85%，衰减系数 0.8

#### 5.2.4 多指标共振系数

| 多头/空头信号源数量 | 调整 |
|---------------------|------|
| ≥5 个同向 | ×1.15（强共振）/ ×0.85（强空头） |
| ≥4 个同向 | ×1.07 / ×0.93 |

#### 5.2.5 置信度分级

| 等级 | 条件 | 星级 |
|------|------|------|
| high | 基本面≥4项 + 资金面≥3项 + 风险面≥2项 | 5★ |
| high | 基本面≥4项 + 资金面≥3项 | 4★ |
| medium | 基本面≥2项 + 资金面≥2项 | 3★ |
| low | 其他 | 2★ |

---

## 6. 数据持久化与状态管理

### 6.1 localStorage 键值表

| Key | 内容 | Store |
|-----|------|-------|
| `watchlist` | 自选股列表 `[{code, name, addedAt, pinned}]` | watchlist |
| `holdings` | 持仓列表 `[{id, code, buyPrice, stopPrice, ...}]` | position |
| `totalCapital` | 总资金（数字） | position |
| `journal_trades` | 交易记录 `[{id, status, code, ...}]` | journal |
| `northbound_cache` | 北向资金缓存（数组） | market |
| `margin_cache` | 融资余额缓存（数组） | market |
| `limitStats_cache` | 涨跌停统计缓存 | market |
| `breadth_history` | 涨跌家数历史（最近5日） | market |
| `market_prev_status` | 市场状态惯性 `{status, date, crossCount, lastFlipDate}` | market |

### 6.2 Pinia Store 职责

| Store | 核心职责 |
|-------|----------|
| `market` | 管理大盘数据（指数/广度/北向/融资/涨跌停），提供 `fetchAll()` 批量加载 |
| `marketAnalysis` | 管理行业资金流向、RS 轮动、宏观因子数据 |
| `watchlist` | 管理自选股列表、报价、K线缓存，提供自动刷新 |
| `stockAnalysis` | 管理个股分析缓存（评分结果+行业标签） |
| `position` | 管理持仓列表、总资金、行业集中度计算 |
| `journal` | 管理交易记录，计算绩效统计（胜率/利润因子/月度/策略对比/连续止损） |

---

## 7. 定时刷新与性能策略

### 7.1 刷新间隔

| 数据类型 | 间隔 | 条件 |
|----------|------|------|
| 指数分时 | 10 秒 | 页面可见时 |
| 批量报价 | 10 秒 | 页面可见时 |
| 大盘判定数据 | 1 分钟 | 页面可见时 |
| 涨跌家数 | 30 秒 | 页面可见时 |
| 个股分析数据 | 3 分钟 | 盘中自动；盘后30分钟一次；周末跳过 |

### 7.2 可见性管理

所有定时器监听 `document.visibilitychange` 事件：
- 页面隐藏时：停止所有定时器
- 页面恢复时：立即拉取一次 + 重启定时器

### 7.3 缓存策略

- **Watchlist 分时/K线**：组件内 `ref` 缓存，切换股票时按需加载，已加载的直接使用缓存
- **Watchlist 5年K线**：延迟加载，仅在切换到"5年"或"全部"时请求
- **个股分析评分**：`stockAnalysis` store 缓存评分结果，切回同一股票时先显示缓存
- **大盘市场数据**：localStorage 持久化缓存，网络失败时使用缓存数据
- **状态惯性**：跨天恢复策略，5天内保持惯性连续性

### 7.4 请求优化

- **并行加载**：所有独立 API 使用 `Promise.allSettled` 并行请求
- **两阶段加载**：个股分析先加载首屏（K线+基本面），后台再加载资金面6个API
- **防抖搜索**：搜索输入 300-500ms 防抖
- **AbortController**：切股时中止未完成的请求
- **骨架屏**：数据加载中显示骨架屏动画

---

> **文档结束** — 本 PRD 完整描述了 Ultimate Trading System 除"Market Analysis"外的全部功能、数据源及解析逻辑。
