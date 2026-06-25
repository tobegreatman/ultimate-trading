<template>
  <div class="guide">
    <!-- Left nav -->
    <nav class="guide-nav">
      <div class="guide-nav__title">策略速查</div>
      <a
        v-for="ch in chapters"
        :key="ch.id"
        class="guide-nav__link"
        :class="{ active: activeChapter === ch.id }"
        @click.prevent="scrollTo(ch.id)"
      >
        <span class="nav-icon" v-html="ch.icon"></span>
        <span class="nav-text">{{ ch.title }}</span>
      </a>
    </nav>

    <!-- Right content -->
    <main class="guide-content">
      <!-- 1. 买入决策树 -->
      <section id="ch-buy" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--buy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M2 3h3l2.6 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 7H6"/></svg>
          </span>
          想买入
        </h2>
        <div class="decision-tree">
          <div v-for="(node, i) in buyDecisionTree" :key="i" class="dt-node" :class="[node.type, { 'dt-last': i === buyDecisionTree.length - 1 }]">
            <div class="dt-step-num">{{ i + 1 }}</div>
            <div class="dt-content">
              <div class="dt-q">
                {{ node.q }}
                <span v-if="node.yes" class="dt-tag dt-tag--yes">是 → {{ node.yes }}</span>
                <span v-if="node.no" class="dt-tag dt-tag--no">否 → {{ node.no }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. 市场趋势状态 -->
      <section id="ch-market" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--market">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
          </span>
          市场趋势状态
        </h2>

        <h3 class="sub-title">九维判据</h3>
        <p class="section-desc">系统自动采集 9 个维度数据（7维核心技术 + 宏观因子辅助 + 波动率），采用加权评分机制判断牛/震/熊信号：</p>
        <table class="market-dim-table">
          <thead>
            <tr><th>维度(权重)</th><th>数据来源</th><th>牛市信号</th><th>熊市信号</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in marketDimensions" :key="d.name">
              <td><strong>{{ d.name }}</strong></td>
              <td class="text-muted-sm">{{ d.source }}</td>
              <td class="bull-text">{{ d.bull }}</td>
              <td class="bear-text">{{ d.bear }}</td>
            </tr>
          </tbody>
        </table>

        <h3 class="sub-title">综合判定规则</h3>
        <p class="section-desc">加权评分 + 状态惯性（hysteresis）机制。同方向（牛↔偏多、熊↔偏空）自由切换；跨方向翻转需 |net| ≥ 1.7 + 连续 2 个交易日确认 + 3 个交易日冷却期；紧急翻转（加权分 ≥ 7.0）跳过确认和冷却：</p>
        <div class="status-cards">
          <div v-for="s in marketStatusTable" :key="s.tag" class="status-card" :class="s.tag">
            <div class="status-card__name" :style="{ color: s.color }">{{ s.status }}</div>
            <div class="status-card__cond">{{ s.condition }}</div>
            <div class="status-card__row">
              <span class="status-card__label">建议仓位</span>
              <span class="status-card__value">{{ s.position }}</span>
            </div>
            <div class="status-card__row">
              <span class="status-card__label">推荐策略</span>
              <span class="status-card__value">{{ s.strategy }}</span>
            </div>
          </div>
        </div>

        <h3 class="sub-title">长窗口速判</h3>
        <p class="section-desc">3 项条件同时满足，提示多头窗口开启：</p>
        <div class="check-list">
          <div v-for="(c, i) in longWindowChecks" :key="i" class="check-item">
            <div class="check-num">{{ i + 1 }}</div>
            <div>
              <div class="check-label">{{ c.label }}</div>
              <div class="check-desc">{{ c.desc }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. 买入策略 -->
      <section id="ch-strategies" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--strategies">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>
          </span>
          买入策略
        </h2>

        <div v-for="s in strategies" :key="s.name" class="strategy-block">
          <h3 class="strategy-name">{{ s.name }}</h3>
          <div class="strategy-tag">{{ s.tag }}</div>
          <ul class="strategy-conditions">
            <li v-for="(c, i) in s.conditions" :key="i">{{ c }}</li>
          </ul>
          <div class="strategy-detail">
            <span>买入仓位: {{ s.position }}</span>
            <span>止损: {{ s.stop }}</span>
            <span>适用: {{ s.market }}</span>
            <span>时间止损: {{ s.timeStop }}</span>
          </div>
        </div>

        <div class="strategy-table">
          <table>
            <thead>
              <tr><th>策略</th><th>适用市场</th><th>持有期</th><th>风险等级</th><th>仓位上限</th><th>收益预期</th></tr>
            </thead>
            <tbody>
              <tr><td>趋势突破</td><td>牛市/强趋势</td><td>1-4周</td><td>中</td><td>25%</td><td>高</td></tr>
              <tr><td>回调买入</td><td>震荡上行</td><td>2-8周</td><td>低-中</td><td>25%</td><td>中-高</td></tr>
              <tr><td>底部右侧确认</td><td>熊转牛初期</td><td>1-6月</td><td>高</td><td>3%</td><td>极高</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 4. 要卖出 -->
      <section id="ch-sell" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--sell">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </span>
          要卖出
        </h2>

        <h3 class="sub-title">卖出优先级</h3>
        <div class="priority-list">
          <div v-for="(p, i) in sellPriority" :key="i" class="priority-item">
            <div class="priority-num">{{ i + 1 }}</div>
            <div>{{ p }}</div>
          </div>
        </div>

        <h3 class="sub-title">ATR 动态止损</h3>
        <div class="formula-block">
          <code>止损价 = 买入价 − N × ATR(14)</code>
          <div class="formula-params">
            <span>趋势突破: N = 1.5</span>
            <span>回调买入: N = 2.0</span>
            <span>底部确认: N = 3.0</span>
          </div>
        </div>

        <h3 class="sub-title">跟踪止盈（只上移不下调，ATR 动态）</h3>
        <div class="formula-block">
          <code>跟踪止盈价 = max(昨日止盈价, 最高收盘价 − M × ATR(14))</code>
          <div class="formula-params">
            <span>趋势突破: M = 2.0</span>
            <span>回调买入: M = 3.0</span>
            <span>底部确认: M = 4.0</span>
          </div>
        </div>

        <h3 class="sub-title">其他止损类型</h3>
        <div class="rule-list">
          <div v-for="r in otherStops" :key="r.label" class="rule-item">
            <strong>{{ r.label }}</strong>: {{ r.desc }}
          </div>
        </div>
      </section>

      <!-- 5. 不知仓位 -->
      <section id="ch-position" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--position">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          </span>
          不知仓位
        </h2>

        <h3 class="sub-title">总仓位控制</h3>
        <table>
          <thead><tr><th>大盘状态</th><th>总仓位上限</th><th>判定条件</th></tr></thead>
          <tbody>
            <tr><td>牛市确认</td><td>80-100%</td><td>均线多头排列 + 广度共振</td></tr>
            <tr><td>震荡偏多</td><td>50-70%</td><td>站上MA60但未确认趋势</td></tr>
            <tr><td>震荡偏空</td><td>20-40%</td><td>跌破MA60但未确认熊市</td></tr>
            <tr><td>熊市</td><td>0-10%</td><td>均线空头排列 + 全面走弱</td></tr>
          </tbody>
        </table>

        <h3 class="sub-title">个股仓位公式</h3>
        <div class="formula-block">
          <code>单只仓位 = min(总资金 × 2% / 止损幅度, 总资金 × 25%)</code>
          <p style="margin-top: 8px; font-size: 13px; color: var(--text-secondary);">
            单笔最大亏损不超过总资金 2%，单只上限 25%，同行业不超过 40%，持仓 5-10 只。
          </p>
        </div>

        <h3 class="sub-title">加减清仓规则</h3>
        <div class="rule-list">
          <div class="rule-item"><strong>加仓</strong>: 浮盈 > 1.5×ATR + 趋势确认 → 金字塔加仓</div>
          <div class="rule-item"><strong>减仓</strong>: 浮盈从最高回撤超50% → 减至半仓</div>
          <div class="rule-item"><strong>清仓</strong>: 触发止损或逻辑破坏 → 全部卖出</div>
          <div class="rule-item"><strong>禁止补仓</strong>: 亏损时绝不在亏损方向加仓</div>
        </div>
      </section>

      <!-- 6. 铁律 -->
      <section id="ch-iron" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--iron">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </span>
          铁律
        </h2>
        <div class="iron-list">
          <div v-for="rule in ironRules" :key="rule.id" class="iron-item">
            <div class="iron-num">{{ rule.id }}</div>
            <div>
              <div class="iron-rule">{{ rule.rule }}</div>
              <div class="iron-desc">{{ rule.desc }}</div>
              <div class="iron-consequence">违反后果: {{ rule.consequence }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 7. 情绪波动 -->
      <section id="ch-emotion" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--emotion">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </span>
          情绪波动
        </h2>
        <div class="emotion-list">
          <div v-for="e in emotions" :key="e.key" class="emotion-card">
            <div class="emotion-name">{{ e.name }}</div>
            <div class="emotion-row"><strong>触发</strong>: {{ e.trigger }}</div>
            <div class="emotion-row"><strong>应对</strong>: {{ e.response }}</div>
          </div>
        </div>
      </section>

      <!-- 8. 每日流程 -->
      <section id="ch-daily" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--daily">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </span>
          每日流程
        </h2>

        <div v-for="period in dailyFlow" :key="period.title" class="flow-block">
          <h3 class="sub-title">{{ period.title }}</h3>
          <div class="flow-items">
            <div v-for="(item, i) in period.items" :key="i" class="flow-item">
              <div class="flow-dot"></div>
              <div>{{ item }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 9. 系统失效 -->
      <section id="ch-failure" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--failure">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          系统失效指标
        </h2>
        <div class="failure-list">
          <div v-for="(f, i) in failureIndicators" :key="i" class="failure-item">
            <div class="failure-num">{{ i + 1 }}</div>
            <div>{{ f }}</div>
          </div>
        </div>
      </section>

      <!-- 10. 核心公式 -->
      <section id="ch-formula" class="guide-section">
        <h2 class="ch-title">
          <span class="ch-icon ch-icon--formula">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </span>
          核心公式
        </h2>
        <div class="formula-hero">
          <div class="formula-main">
            长期盈利 = 正期望策略 × 严格风险控制 × 纪律性执行 × 时间复利
          </div>
          <div class="formula-note">缺少任何一项，长期结果归零。</div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { IRON_RULES, EMOTIONS } from '../utils/constants.js'

const activeChapter = ref('ch-buy')

const chapters = [
  { id: 'ch-buy', title: '想买入', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.5"/><circle cx="19" cy="21" r="1.5"/><path d="M2 3h3l2.6 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 7H6"/></svg>' },
  { id: 'ch-market', title: '市场趋势', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>' },
  { id: 'ch-strategies', title: '买入策略', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>' },
  { id: 'ch-sell', title: '要卖出', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
  { id: 'ch-position', title: '不知仓位', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>' },
  { id: 'ch-iron', title: '铁律', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
  { id: 'ch-emotion', title: '情绪波动', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>' },
  { id: 'ch-daily', title: '每日流程', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  { id: 'ch-failure', title: '系统失效', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' },
  { id: 'ch-formula', title: '核心公式', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' }
]

const buyDecisionTree = [
  { q: '触发排雷清单？', yes: '直接跳过', no: '继续', type: 'check' },
  { q: '基本面符合标准？', yes: '继续', no: '加入观察池', type: 'check' },
  { q: '大盘状态允许买入？', yes: '继续', no: '加入观察池，等待', type: 'check' },
  { q: '出现买入信号？', yes: '继续', no: '设提醒，等待', type: 'check' },
  { q: '盈亏比 ≥ 2:1？', yes: '继续', no: '跳过', type: 'check' },
  { q: '执行买入 + 立即设定止损位 + 记录交易计划', type: 'action' }
]

const marketDimensions = [
  { name: 'MACD (1.0)', source: '上证指数 MACD(12,26,9)', bull: '金叉+零轴上方+柱状图放大（背离×2.0）', bear: '死叉+零轴下方+柱状图放大（背离×2.0）' },
  { name: '涨跌家数 (1.5)', source: '沪深京A股实时涨跌统计', bull: '涨跌比≥2（强2.0），≥1.5（牛）', bear: '涨跌比≤0.5（强2.0），<0.67（熊）' },
  { name: 'RSI (1.0)', source: '上证指数 RSI(14)', bull: 'RSI>55且上行 或 超卖回升（背离×2.0）', bear: 'RSI<35且下行 或 超买回落（背离×2.0）' },
  { name: '融资余额 (1.2)', source: '近10日融资余额线性回归', bull: '回归斜率>+0.3%/日', bear: '回归斜率<-0.3%/日' },
  { name: '量价配合 (1.3)', source: '上证指数OBV趋势+背离', bull: '价涨量增/OBV底背离（强2.0）', bear: '放量下跌/OBV顶背离（强2.0）' },
  { name: '北向资金 (1.5)', source: '近20日北向成交额均量比', bull: '5日均量/20日均量≥1.2', bear: '5日均量/20日均量≤0.8' },
  { name: '涨跌停 (1.3)', source: '并行评分（涨跌比/跌停数/封板率等）', bull: '评分net≥2（强≥4→2.0）', bear: '评分net≤-2（强≤-4→2.0）' },
  { name: '宏观因子 (≤1.0)', source: 'PMI/M1-M2剪刀差/CPI/GDP/社融', bull: 'PMI>50.5 + 剪刀差收窄 + GDP>5.5% + 社融>10%', bear: 'PMI<49.5 + 剪刀差扩大 + CPI<0% + 社融<8%' },
  { name: '波动率 (1.0)', source: 'ATR(14)/收盘价 × 近60日百分位排名', bull: '低波动（百分位<30%）且稳定/下降，市场环境温和', bear: '高波动（百分位>80%）且上升，市场恐慌/不确定性高（强2.0）' }
]

const marketStatusTable = [
  { status: '牛市', tag: 'bull', condition: 'bullW ≥ 5.0 且 net > 0', position: '80-100%', strategy: '趋势突破', color: 'var(--red)' },
  { status: '偏多', tag: 'bull-lean', condition: 'bullW ≥ 3.3 且 net > 0', position: '50-70%', strategy: '回调买入', color: 'var(--red)' },
  { status: '震荡', tag: 'neutral', condition: '其他', position: '≤50%', strategy: '回调买入', color: 'var(--text-secondary)' },
  { status: '偏空', tag: 'bear-lean', condition: 'bearW ≥ 3.3 且 net < 0', position: '10-20%', strategy: '仅观望', color: 'var(--green)' },
  { status: '熊市', tag: 'bear', condition: 'bearW ≥ 5.0 且 net < 0', position: '0-10%', strategy: '空仓', color: 'var(--green)' }
]

const longWindowChecks = [
  { label: '指数收盘价 > MA60', desc: '指数站上60日均线' },
  { label: 'MA60 连续 3 天拐头向上', desc: '中期趋势转强确认' },
  { label: '涨跌比 ≥ 1.8', desc: '市场广度偏强' }
]

const strategies = [
  {
    name: '趋势突破买入法',
    tag: 'N=1.5 | 跟踪止盈2×ATR | 1-4周 | 上限25%',
    conditions: [
      '收盘价突破20日最高价 + 放量确认（量>20日均量×1.5）',
      'MACD金叉 + MACD柱>0',
      '大盘处于牛市确认或偏多状态',
      '基本面符合 + 未触发排雷',
      '盈亏比 ≥ 2:1'
    ],
    position: '首批40% → 回踩确认+30% → 加速+20%（预留10%机动）',
    stop: '买入价 − 1.5×ATR(14)（高波动N+0.5，低波动N−0.5）',
    market: '牛市确认/偏多',
    timeStop: '5日未突破前高→出场'
  },
  {
    name: '回调买入法',
    tag: 'N=2.0 | 跟踪止盈3×ATR | 2-8周 | 上限25%',
    conditions: [
      '收盘价 > MA60 且 MA60拐头向上',
      '回调至MA20或MA60附近（±2%）',
      '缩量: MA(VOL,5) < MA(VOL,20) × 0.7',
      '出现企稳K线（锤子线/吞没/十字星）',
      '盈亏比 ≥ 2:1'
    ],
    position: '首批50% → 反弹突破+30%（预留20%机动）',
    stop: '买入价 − 2.0×ATR(14)（高波动N+0.5，低波动N−0.5）',
    market: '震荡上行',
    timeStop: '8日未企稳→出场'
  },
  {
    name: '底部右侧确认买入法',
    tag: 'N=3.0 | 跟踪止盈4×ATR | 1-6月 | 上限3%',
    conditions: [
      '【必选】从高点跌幅 > 40%',
      '【必选】出现底部形态（早晨之星/W底等）',
      '【必选】大盘同期见底企稳',
      '【必选】连续2年未亏损（排除退市风险）',
      '【加分】地量后放量（量>2×均量）',
      '【加分】RSI从<30拐头向上',
      '【加分】基本面催化剂',
      '【加分】MACD零轴下金叉',
      '⚠ 入场条件：4项必选全满足 + 4项加分中至少满足2项（共≥6项）'
    ],
    position: '30% → 30% → 40%（分三批）',
    stop: '买入价 − 3×ATR(14)，跌幅>8%无条件出场',
    market: '熊转牛初期',
    timeStop: '15日未确认→出场'
  }
]

const sellPriority = [
  '触发止损 → 立即卖出，不犹豫',
  '买入逻辑破坏 → 尽快卖出',
  '止盈信号出现 → 执行止盈计划',
  '发现更好机会 → 换股（新机会盈亏比 ≥ 3:1）'
]

const otherStops = [
  { label: '技术止损', desc: '跌破关键支撑位（均线/前低/趋势线）' },
  { label: '时间止损', desc: '买入后N日未按预期运行' },
  { label: '逻辑止损', desc: '买入逻辑被证伪（业绩暴雷、政策转向）' },
  { label: '总仓位止损', desc: '总回撤>10%减至半仓，>20%空仓休息' }
]

const ironRules = IRON_RULES
const emotions = EMOTIONS

const dailyFlow = [
  {
    title: '盘前 8:30 - 9:25',
    items: [
      '8:30-8:50 查看隔夜美股、财经新闻、A50期货',
      '8:50-9:10 逐只检查持仓止损/止盈触发',
      '9:10-9:15 确认今日关注标的及触发价格，预设计条件单'
    ]
  },
  {
    title: '盘中 9:30 - 15:00',
    items: [
      '9:30-10:00 开盘观察期，不急于操作',
      '10:00-11:30 条件单触发按计划执行',
      '11:30-13:00 午间复盘，查看资金流向',
      '13:00-14:30 继续监控条件单',
      '14:30-15:00 尾盘决策，确认成交记录'
    ]
  },
  {
    title: '盘后 15:00+',
    items: [
      '15:00-15:30 填写交易记录，自评执行评分',
      '15:30-16:00 更新持仓表，标记明日信号',
      '16:00-16:30 查看盘后公告、龙虎榜，写明日交易计划'
    ]
  }
]

const failureIndicators = [
  '连续 5 次交易止损 → 检查选股/买入条件',
  '单月亏损 > 8% → 检查仓位管理',
  '最大回撤 > 15% → 降低仓位，回归模拟盘',
  '月度胜率连续3月 < 30% → 系统可能不适应市场',
  '绩效连续3月跑输沪深300 → 重新评估策略'
]

function scrollTo(id) {
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    activeChapter.value = id
  }
}

function onScroll() {
  const content = document.querySelector('.guide-content')
  if (!content) return
  const sections = content.querySelectorAll('.guide-section')
  const scrollTop = content.scrollTop
  for (const section of sections) {
    if (section.offsetTop - 80 <= scrollTop) {
      activeChapter.value = section.id
    }
  }
}

onMounted(() => {
  const content = document.querySelector('.guide-content')
  if (content) content.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  const content = document.querySelector('.guide-content')
  if (content) content.removeEventListener('scroll', onScroll)
})
</script>

<style scoped>
.guide {
  display: flex;
  height: calc(100vh - 56px);
  overflow: hidden;
}

.guide-nav {
  width: 180px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  padding: 24px 14px;
  overflow-y: auto;
}

.guide-nav__title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--text-muted);
  margin-bottom: 14px;
  padding: 0 8px;
}

.guide-nav__link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 2px;
  position: relative;
  border: 1px solid transparent;
}

.nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: color 0.2s;
}

.nav-icon svg {
  width: 16px;
  height: 16px;
  display: block;
}

.nav-text {
  flex: 1;
  min-width: 0;
}

.guide-nav__link:hover {
  background: var(--bg-surface-alt);
  color: var(--text-primary);
}

.guide-nav__link:hover .nav-icon {
  color: var(--text-secondary);
}

.guide-nav__link.active {
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #fff;
  border-color: var(--glass-border);
}

.guide-nav__link.active::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--accent);
  border-radius: 0 3px 3px 0;
}

.guide-nav__link.active .nav-icon {
  color: var(--accent);
}

.guide-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px;
}

.guide-section {
  margin-bottom: 36px;
}

.ch-title {
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

.ch-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent-dim);
  color: var(--accent);
  flex-shrink: 0;
}

.ch-icon svg {
  width: 18px;
  height: 18px;
  display: block;
}

.ch-icon--buy { background: rgba(91, 156, 245, 0.12); color: var(--accent); }
.ch-icon--market { background: rgba(255, 159, 10, 0.12); color: #ff9f0a; }
.ch-icon--strategies { background: rgba(48, 209, 88, 0.12); color: var(--green); }
.ch-icon--sell { background: rgba(255, 214, 10, 0.12); color: var(--yellow); }
.ch-icon--position { background: rgba(175, 82, 222, 0.12); color: #af52de; }
.ch-icon--iron { background: rgba(255, 69, 58, 0.12); color: var(--red); }
.ch-icon--emotion { background: rgba(255, 55, 95, 0.12); color: #ff375f; }
.ch-icon--daily { background: rgba(100, 210, 255, 0.12); color: #64d2ff; }
.ch-icon--failure { background: rgba(255, 69, 58, 0.15); color: var(--red); }
.ch-icon--formula { background: rgba(255, 214, 10, 0.12); color: var(--yellow); }

.sub-title {
  font-size: 15px;
  font-weight: 600;
  margin: 20px 0 10px;
  color: var(--text-primary);
}

/* Decision tree */
.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.text-muted-sm {
  font-size: 12px;
  color: var(--text-muted);
}

.bull-text { color: var(--red); font-size: 13px; }
.bear-text { color: var(--green); font-size: 13px; }

.market-dim-table {
  margin-bottom: 20px;
}

/* Table enhancements */
.guide-content table {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.guide-content th {
  background: var(--bg-surface-alt);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
}

.guide-content tbody tr:nth-child(even) {
  background: rgba(255, 255, 255, 0.015);
}

.guide-content tbody tr:hover {
  background: var(--bg-surface-alt);
}

.guide-content tbody tr:last-child td {
  border-bottom: none;
}

.status-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}

.status-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px 14px;
  text-align: center;
  transition: all 0.25s ease;
  position: relative;
  overflow: hidden;
}

.status-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
}

.status-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-hover, rgba(255,255,255,0.12));
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}

.status-card.bull { border-top: 3px solid var(--red); }
.status-card.bull::before { background: linear-gradient(90deg, var(--red), rgba(255, 69, 58, 0.3)); }
.status-card.bull-lean { border-top: 3px solid var(--red); opacity: 0.85; }
.status-card.bull-lean::before { background: linear-gradient(90deg, rgba(255, 69, 58, 0.6), rgba(255, 69, 58, 0.2)); }
.status-card.neutral { border-top: 3px solid var(--text-muted); }
.status-card.neutral::before { background: linear-gradient(90deg, var(--text-muted), rgba(255,255,255,0.1)); }
.status-card.bear-lean { border-top: 3px solid var(--green); opacity: 0.85; }
.status-card.bear-lean::before { background: linear-gradient(90deg, rgba(48, 209, 88, 0.6), rgba(48, 209, 88, 0.2)); }
.status-card.bear { border-top: 3px solid var(--green); }
.status-card.bear::before { background: linear-gradient(90deg, var(--green), rgba(48, 209, 88, 0.3)); }

.status-card__name {
  font-size: 18px;
  font-weight: 800;
  margin-bottom: 4px;
}

.status-card__cond {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.status-card__row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 2px 0;
}

.status-card__label { color: var(--text-muted); }
.status-card__value { font-weight: 600; color: var(--text-primary); }

.check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
}

.check-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.check-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.check-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Decision tree — vertical flowchart */
.decision-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dt-node {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  position: relative;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.dt-node.check {
  background: var(--bg-surface);
  border-color: var(--border);
}

.dt-node.check:hover {
  border-color: rgba(0, 113, 227, 0.3);
  background: var(--bg-surface-alt);
}

.dt-node.action {
  background: var(--green-dim);
  border-color: rgba(48, 209, 88, 0.2);
}

/* Step number badge */
.dt-step-num {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid rgba(0, 113, 227, 0.25);
  position: relative;
  z-index: 1;
  transition: transform 0.2s;
}

.dt-node:hover .dt-step-num {
  transform: scale(1.08);
}

.dt-node.action .dt-step-num {
  background: rgba(48, 209, 88, 0.15);
  color: var(--green);
  border-color: rgba(48, 209, 88, 0.3);
}

/* Connector line between steps */
.dt-node:not(.dt-last) .dt-step-num::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: calc(100% + 4px - 26px);
  background: linear-gradient(180deg, rgba(0, 113, 227, 0.3), rgba(0, 113, 227, 0.08));
  z-index: 0;
  border-radius: 1px;
}

.dt-node:not(.dt-last).action .dt-step-num::after {
  background: linear-gradient(180deg, rgba(48, 209, 88, 0.3), rgba(48, 209, 88, 0.06));
}

.dt-content {
  flex: 1;
  min-width: 0;
}

.dt-q {
  font-weight: 600;
  font-size: 14px;
  line-height: 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/* Yes/No inline tags */
.dt-tag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 10px;
  line-height: 18px;
  white-space: nowrap;
}

.dt-tag--yes {
  background: rgba(48, 209, 88, 0.1);
  color: var(--green);
  border: 1px solid rgba(48, 209, 88, 0.2);
}

.dt-tag--no {
  background: rgba(255, 69, 58, 0.08);
  color: var(--red);
  border: 1px solid rgba(255, 69, 58, 0.15);
}

/* Strategies */
.strategy-block {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 22px;
  margin-bottom: 12px;
  transition: all 0.25s ease;
}

.strategy-block:hover {
  border-color: rgba(48, 209, 88, 0.25);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.strategy-name {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
}

.strategy-tag {
  font-size: 11px;
  color: var(--accent);
  font-family: var(--font-mono);
  margin-bottom: 12px;
}

.strategy-conditions {
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;
}

.strategy-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
}

.strategy-table {
  margin-top: 16px;
}

/* Priority */
.priority-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.priority-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.priority-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

/* Formula */
.formula-block {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  margin-bottom: 12px;
}

.formula-block code {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--accent);
}

.formula-params {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

/* Rules */
.rule-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rule-item {
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
}

/* Iron rules — 3-column grid */
.iron-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.iron-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  border-left: 3px solid var(--red);
  transition: all 0.25s ease;
}

.iron-item:hover {
  transform: translateY(-2px);
  border-left-color: var(--red);
  box-shadow: 0 6px 18px rgba(255, 69, 58, 0.12);
  background: var(--bg-surface-alt);
}

.iron-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 69, 58, 0.1);
  border: 1px solid rgba(255, 69, 58, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  color: var(--red);
  flex-shrink: 0;
}

.iron-rule {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 3px;
}

.iron-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.iron-consequence {
  font-size: 11px;
  color: var(--red);
  margin-top: 4px;
  opacity: 0.85;
}

/* Emotions */
.emotion-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.emotion-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  transition: all 0.25s ease;
}

.emotion-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 55, 95, 0.3);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
}

.emotion-name {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 8px;
}

.emotion-row {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

/* Daily flow */
.flow-block {
  margin-bottom: 16px;
}

.flow-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.flow-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

.flow-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  margin-top: 7px;
}

/* Failure — grid cards */
.failure-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.failure-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  background: var(--red-dim);
  border: 1px solid rgba(255, 69, 58, 0.15);
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.5;
  transition: all 0.25s ease;
}

.failure-item:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 69, 58, 0.35);
  box-shadow: 0 6px 18px rgba(255, 69, 58, 0.15);
}

.failure-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 69, 58, 0.12);
  border: 1px solid rgba(255, 69, 58, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: var(--red);
  flex-shrink: 0;
}

/* Formula hero */
.formula-hero {
  text-align: center;
  padding: 48px 24px;
  background: linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-surface-alt) 100%);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  position: relative;
  overflow: hidden;
}

.formula-hero::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at center, rgba(255, 214, 10, 0.08) 0%, transparent 50%);
  pointer-events: none;
}

.formula-main {
  font-size: 20px;
  font-weight: 700;
  color: var(--yellow);
  line-height: 1.6;
  position: relative;
  text-shadow: 0 0 20px rgba(255, 214, 10, 0.2);
}

.formula-note {
  font-size: 13px;
  color: var(--red);
  margin-top: 14px;
  position: relative;
  opacity: 0.9;
}

@media (max-width: 768px) {
  .guide {
    flex-direction: column;
    height: auto;
  }

  .guide-nav {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    display: flex;
    overflow-x: auto;
    padding: 8px;
    gap: 2px;
  }

  .guide-nav__title {
    display: none;
  }

  .guide-nav__link {
    white-space: nowrap;
  }

  .guide-content {
    padding: 16px;
  }

  .emotion-list {
    grid-template-columns: 1fr;
  }

  .iron-list {
    grid-template-columns: 1fr;
  }

  .failure-list {
    grid-template-columns: 1fr;
  }

  .status-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
