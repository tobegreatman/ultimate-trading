# Ultimate Trading System 智能股票交易辅助系统

面向 A 股个人投资者的盘中实时交易辅助工具。把规则化交易体系做成可交互 Web 应用，作为「纪律执行器」串起 **判断大盘 → 策略选股 → 仓位计算 → 交易记录 → 复盘** 的完整闭环。

## 功能模块

| 模块 | 能力 |
|------|------|
| **大盘状态** | 多维加权牛熊判定（MACD/涨跌家数/RSI/融资/量价/北向/涨跌停/宏观因子）+ 状态惯性确认 + 行业资金流向 & 板块 RS 轮动 + 宏观因子卡片 + 策略选股建议 + 交易前检查清单 |
| **股票池** | 搜索添加自选股，实时行情自动刷新，6 周期 K 线，分时走势，基本面 |
| **个股分析** | 四维度综合评分（技术/基本面/资金/风险）+ 技术指标信号 + 估值分位 + 财务趋势 + 资金面（主力/北向/融资融券/筹码/龙虎榜/增减持）+ AI 综合判断 |
| **选股筛选** | 四层漏斗（排雷→基本面→景气度→技术信号），AI 自然语言选股为主、结构化 API 回退，支持 RS 行业过滤 |
| **仓位计算** | ATR 动态止损/仓位/盈亏比，持仓管理，行业集中度监控 |
| **交易日志** | 交易全生命周期记录，平仓复盘评分，绩效统计，违规分析 |
| **策略速查** | 交易规则参考手册，随时查阅 |

## 技术栈

- **前端**：Vue 3.5 + Vite 6 + Vue Router 4 + Pinia 2（Composition API）+ ECharts 6（图表）
- **后端**：Koa 2 + @koa/router + @koa/cors + koa-bodyparser + dotenv（纯 API 代理层，无数据库）
- **AI**：OpenAI SDK（个股综合判断，SSE 流式）
- **数据源**：东方财富公开 API（主用）+ macroview.club（社融）+ 腾讯/新浪/证券时报（备用），统一经后端代理规避 CORS
- **持久化**：localStorage（用户数据）+ 服务端文件（板块 RS 历史快照 `rs_history.json`）

## 项目结构

```
ultimate-trade/
├── vite.config.js              # /api 代理到 localhost:3001
├── server/
│   ├── index.js                # Koa 入口：市场/选股/个股行情 API
│   ├── analysis.js             # 宏观评分 / 板块 RS / 估值分析
│   ├── stockAnalysis.js        # 个股分析：基本面/资金流/主力/融资融券/北向/股东户数/龙虎榜/增减持/基准K线
│   ├── aiJudge.js              # 个股 AI 综合判断（SSE）
│   └── fallback.js             # 腾讯/新浪备用源
└── src/
    ├── router/index.js
    ├── stores/                 # market / marketAnalysis / watchlist / position / journal / stockAnalysis
    ├── utils/
    │   ├── marketJudge.js      # 多维大盘判定（加权 + 状态惯性）
    │   ├── marketCycle.js      # 五维周期定位
    │   ├── indicators.js       # MA/MACD/KDJ/RSI/BOLL + 信号检测
    │   ├── scoring.js          # 四维度个股评分引擎（含行业感知阈值）
    │   ├── riskMetrics.js      # Sharpe / 最大回撤 / Beta
    │   ├── position.js         # ATR 仓位/止损/盈亏比
    │   └── screenerPrompt.js   # 四层漏斗选股生成器
    ├── components/             # K线/分时/Sparkline + analysis/*（Technical/Fundamental/CapitalFlow/Score 面板）
    └── views/                  # Dashboard / Watchlist / StockAnalysis / Screener / Position / Journal / Guide
```

> 完整设计、维度权重、阈值表、数据流见 [PRD.md](PRD.md)，设计规范见 [DESIGN.md](DESIGN.md)。

## 快速开始

```bash
npm install                              # 前端依赖
cd server && npm install && cd ..        # 后端依赖
cd server && node index.js               # 后端 :3001（需在该目录，dotenv 读 ./server/.env）
npm run dev                              # 前端 :5173（自动代理 /api → :3001）
```

打开 `http://localhost:5173`。生产构建 `npm run build`（输出 `dist/`）。

**可选**：AI 智能选股需登录态，在 `server/.env` 配置 `EASTMONEY_EMAUTH`（东方财富 cookie），否则只能解析 2–3 个条件。

## 外网访问（ngrok 隧道）

通过 ngrok 将本地服务暴露到公网，支持从外网设备访问。采用**生产模式**：前端构建为静态文件由 Koa 托管，仅暴露单一端口，避免 HMR websocket 导致隧道不稳定。

### 使用方法

```powershell
.\start-ngrok.ps1
```

脚本自动完成：构建前端 → 启动 Koa 服务（含静态文件托管）→ 建立 ngrok 隧道。

### 访问地址

启动后终端会输出公网 URL（格式 `https://xxx.ngrok-free.dev`）。首次访问浏览器会显示 ngrok 警告页面，点击 **"Visit Site"** 即可。

### 相关文件

| 文件 | 说明 |
|------|------|
| [start-ngrok.ps1](start-ngrok.ps1) | 一键启动脚本（构建 + 服务 + 隧道） |
| [start-tunnel.cjs](start-tunnel.cjs) | ngrok 隧道脚本（`@ngrok/ngrok` Node.js SDK） |
| [server/index.js](server/index.js) | Koa 后端，生产模式下同时托管 `dist/` 静态文件与 API |

### 架构说明

```
外网用户 → ngrok 隧道 → localhost:3001 (Koa)
                            ├── /api/*        → 后端 API
                            └── /*            → dist/ 静态文件 (SPA)
```

- 前端经 `npm run build` 打包到 `dist/`
- [server/index.js](server/index.js) 在路由之后注册静态文件中间件，非 `/api` 请求回退到 `index.html`（SPA 路由）
- 只需暴露 3001 端口，无需 Vite dev server

### 注意事项

- ngrok 免费版每次启动分配随机子域名，如需固定地址需在 [ngrok dashboard](https://dashboard.ngrok.com/domains) 创建保留域名并在 [start-tunnel.cjs](start-tunnel.cjs) 中配置 `domain` 参数
- 免费版有访问量限制（1GB/月流量，20000 请求/月），适合演示与轻量使用
- 按 `Ctrl+C` 关闭隧道，Koa 服务保持运行

## 核心能力

### 多维大盘判定

8 个维度加权评分 + 状态惯性（同向自由切换，跨向需连续 2 交易日确认 + 3 日历日冷却），自动给出牛市/偏多/震荡/偏空/熊市，并映射到推荐策略与建议仓位。宏观因子（PMI/M1-M2/CPI/GDP/社融）作为修正项，社融用 PPI 平减还原实际增速。

### 个股综合评分（四维度 + 投资风格）

| 维度 | 满分 | 子项 |
|------|------|------|
| 技术面 | 40 | 均线排列 + MACD + KDJ + RSI + BOLL + 均线斜率 + 量能 + 价格位置 |
| 基本面 | 42 | PE + ROE + 营收/净利增长 + 负债率 + PB + 现金流质量 + 毛利率 |
| 资金面 | ≈35–42* | 量价趋势 + 主力资金 + 融资融券 + 北向 + 筹码 + 资金背离 + 龙虎榜 + 增减持 |
| 风险面 | 15 | Sharpe + 最大回撤 + Beta |

\* 资金面满分动态：北向/筹码属季度数据，按风格降权。事件型因子（龙虎榜 10 日窗口、增减持 90 天幅度 + 控股股东 180 天警示）见 PRD §5.2.6。

权重按投资风格切换：**短线** 技术 0.35 / 资金 0.42 / 基本 0.15 / 风险 0.08；**中线** 0.30 / 0.32 / 0.26 / 0.12；**长线** 0.22 / 0.20 / 0.40 / 0.18。PE/PB/负债率/毛利率阈值按 24 个行业分类独立配置。

### 策略选股

依大盘状态匹配策略（牛市趋势突破 / 偏多回调买入 / 震荡回调或底部确认 / 偏空空仓），复用四层漏斗生成自然语言查询，AI 自然语言选股为主、结构化 API 回退，三级容错。

### ATR 仓位与止损

- 止损价 = 买入价 − N × ATR(14)；仓位 = min(总资金 × 2% / 止损幅度, 总资金 × 25%)
- 跟踪止盈只上移不下调
- 趋势突破（N=1.5，回撤 8%）/ 回调买入（N=2.0，15%）/ 底部右侧（N=3.0，20%）

## API 概览

统一返回 `{ ok, data?, error? }`。按域分组：

| 域 | 主要端点 |
|----|----------|
| 市场 | `/api/market/indices`、`/intraday`、`/breadth`、`/northbound`、`/margin`、`/limit-stats` |
| 分析 | `/api/analysis/macro`、`/sectors`、`/valuation` |
| 个股行情 | `/api/stock/:code/kline`、`/kline5y`、`/intraday`、`/intraday5d`、`/basic`、`/api/stock/batch/quotes`、`/search` |
| 个股分析 | `/api/stock-analysis/{fundamental, capital-flow, main-force-flow, margin, northbound, shareholder, billboard, holder-increase, benchmark-kline}` |
| 选股 | `POST /api/stock/xuangu/ai`（主）、`GET /xuangu/structured`（回退）、`/xuangu/ai/status` |
| AI | `POST /api/stock-analysis/ai-judge`（SSE 流） |

服务端 LRU 缓存：行情/资金流 5 分钟，基本面/融资融券 30 分钟，北向/股东户数/龙虎榜/增减持 60 分钟，宏观 6 小时。

## 数据源与约定

- 个股分析数据均来自东方财富 datacenter：基本面 `RPT_VALUEANALYSIS_DET` + `ZYZBAjaxNew`、融资融券 `RPTA_WEB_RZRQ_GGMX`、北向 `RPT_MUTUAL_HOLDSTOCKNDATE_STA_NEW`、股东户数 `RPT_HOLDERNUM_DET`、龙虎榜 `RPT_DAILYBILLBOARD_DETAILS`、增减持 `RPT_SHARE_HOLDER_INCREASE`
- 9:00 前查前一交易日（收盘数据），9:00 后查当日（盘中实时）
- 北向资金主用 datacenter，失败回退证券时报
- 配色遵循 A 股惯例：**红涨 `#ff453a` / 绿跌 `#30d158`**

## License

MIT
