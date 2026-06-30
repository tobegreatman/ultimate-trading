<template>
  <div class="score-panel">
    <div v-if="!scoreResult" class="no-data">暂无评分数据</div>
    <template v-else>
      <!-- 仪表盘 + 雷达图 + 维度进度条 一行 -->
      <div class="score-row">
        <div class="gauge-wrap">
          <div ref="gaugeRef" class="gauge-chart" />
          <div class="score-summary">
            <div class="suggestion" :style="{ color: scoreResult.suggestionColor }">
              {{ scoreResult.suggestion }}
              <span v-if="scoreDelta.direction === 'up' && scoreDelta.delta >= 10" class="score-arrow up">↑{{ scoreDelta.delta }}</span>
              <span v-if="scoreDelta.direction === 'down' && Math.abs(scoreDelta.delta) >= 10" class="score-arrow down">↓{{ Math.abs(scoreDelta.delta) }}</span>
            </div>
            <div class="confidence">
              {{ '★'.repeat(scoreResult.confidenceStars ?? 3) }}{{ '☆'.repeat(5 - (scoreResult.confidenceStars ?? 3)) }}
              <span class="confidence-label">{{ confidenceLabel }}</span>
            </div>
          </div>
        </div>
        <div ref="radarRef" class="radar-chart" />
        <div class="dimension-bars">
          <div v-for="(dim, key) in dimensionList" :key="key" class="dim-row">
            <span class="dim-label">{{ dim.label }}</span>
            <div class="dim-bar-track">
              <div class="dim-bar-fill" :style="{ width: dim.pct + '%', background: dim.color }" />
            </div>
            <span class="dim-score">{{ dim.pct }}%</span>
          </div>
        </div>
      </div>

      <!-- 评分趋势迷你图 + 行业排名 -->
      <div v-if="scoreHistory.length > 2 || rankLabel" class="score-extras">
        <div v-if="scoreHistory.length > 2" class="trend-wrap">
          <span class="trend-label">近{{ scoreHistory.length }}日评分</span>
          <div ref="trendRef" class="trend-chart" />
        </div>
        <div v-if="rankLabel" class="industry-rank">
          <span class="rank-label">行业</span>
          <span class="rank-value">{{ rankLabel }}</span>
        </div>
      </div>

      <!-- 明细：动态维度列 -->
      <div class="details-section">
        <h4 class="section-title collapsible" @click="detailsCollapsed = !detailsCollapsed">
          <span class="collapse-arrow" :class="{ collapsed: detailsCollapsed }">▾</span>
          评分明细
        </h4>
        <div v-show="!detailsCollapsed" class="details-cols">
          <div v-for="dim in dimensionList" :key="dim.key" :class="['detail-col', `col-${dim.key}`]">
            <div class="col-header" :style="{ color: dim.color }">{{ dim.label }}<span v-if="dim.resonance" class="col-resonance" :class="resonanceClass(dim.resonance)">{{ dim.resonance }}</span></div>
            <div class="detail-list">
              <div v-for="(item, i) in getDetails(dim.label)" :key="i" class="detail-item">
                <span class="detail-name">{{ item.name }}</span>
                <span class="detail-score">{{ item.score }}/{{ item.max }}</span>
                <span :class="['verdict-badge', getVerdict(item)]">{{ item.desc }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- AI 综合判断 -->
      <div v-if="scoreResult" class="ai-judge-section">
        <div class="ai-header">
          <h4 class="section-title" style="margin-bottom:0">综合判断 <span class="ai-badge">AI</span></h4>
          <div class="ai-controls">
            <div class="ai-model-switcher" v-if="aiJudgeEnabled">
              <button
                v-for="m in modelOptions"
                :key="m.value"
                :class="['model-btn', { active: aiModel === m.value }]"
                @click="emit('change-model', m.value)"
              >{{ m.label }}</button>
            </div>
            <button class="ai-toggle" :class="{ active: aiJudgeEnabled }" @click="emit('toggle-ai')">
              {{ aiJudgeEnabled ? '关闭' : '生成' }}
            </button>
          </div>
        </div>
        <template v-if="aiJudgeEnabled">
        <div v-if="aiJudgeLoading && !aiJudgeText" class="ai-skeleton">
          <div class="ai-skeleton-line" />
          <div class="ai-skeleton-line short" />
          <div class="ai-skeleton-line" />
        </div>
        <div v-if="aiJudgeText" class="ai-content" v-html="renderedAIContent" />
        <span v-if="aiJudgeLoading && aiJudgeText" class="ai-cursor" />
        <div v-if="aiJudgeWarning.length && !aiJudgeLoading" class="ai-warning">
          <span class="ai-warning-icon">⚠️</span>
          <div class="ai-warning-body">
            <div class="ai-warning-title">AI 输出存在数据异常，请谨慎参考</div>
            <ul class="ai-warning-list">
              <li v-for="(v, i) in aiJudgeWarning" :key="i">{{ v }}</li>
            </ul>
          </div>
        </div>
        <div v-if="aiPlan && !aiJudgeLoading" class="ai-trade-plan">
          <div class="ai-trade-plan-header">
            <span class="ai-trade-plan-title">结构化交易计划</span>
            <span class="ai-trade-plan-dir" :class="planDirClass">{{ aiPlan.direction || '--' }}</span>
          </div>
          <div class="ai-trade-plan-grid">
            <div class="ai-trade-plan-item">
              <span class="label">入场价</span>
              <span class="value">{{ aiPlan.entry != null ? aiPlan.entry + '元' : '观望' }}</span>
            </div>
            <div class="ai-trade-plan-item">
              <span class="label">止损价</span>
              <span class="value" :class="{ 'value-warn': aiPlan.stop != null && aiPlan.entry != null && aiPlan.stop >= aiPlan.entry }">{{ aiPlan.stop != null ? aiPlan.stop + '元' : '--' }}</span>
            </div>
            <div class="ai-trade-plan-item">
              <span class="label">目标价</span>
              <span class="value">{{ aiPlan.target != null ? aiPlan.target + '元' : '--' }}</span>
            </div>
            <div class="ai-trade-plan-item">
              <span class="label">盈亏比</span>
              <span class="value" :class="{ 'value-good': aiPlan.rr != null && aiPlan.rr >= 2, 'value-warn': aiPlan.rr != null && aiPlan.rr < 1.5 }">{{ aiPlan.rr != null ? aiPlan.rr + ':1' : '--' }}</span>
            </div>
            <div class="ai-trade-plan-item">
              <span class="label">仓位</span>
              <span class="value">{{ aiPlan.position || '--' }}</span>
            </div>
          </div>
        </div>
        <div v-if="aiJudgeError && !aiJudgeText" class="ai-error">{{ aiJudgeError }}</div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useECharts } from '../../composables/useECharts.js'
import { getScoreHistory, getScoreChange } from '../../utils/scoreHistory.js'
import { getIndustryRankLabel } from '../../utils/industryRank.js'

const props = defineProps({
  scoreResult: { type: Object, default: null },
  aiJudgeText: { type: String, default: '' },
  aiPlan: { type: Object, default: null },
  aiJudgeLoading: { type: Boolean, default: false },
  aiJudgeError: { type: String, default: '' },
  aiJudgeWarning: { type: Array, default: () => [] },
  aiJudgeEnabled: { type: Boolean, default: false },
  aiModel: { type: String, default: 'glm-4.7-flash' },
  stockCode: { type: String, default: '' },
  industryLabel: { type: String, default: '' },
  industry: { type: String, default: '' },
})

const emit = defineEmits(['toggle-ai', 'change-model'])

const modelOptions = [
  { value: 'glm-4.7-flash', label: 'GLM-4.7-Flash' },
  { value: 'glm-5.2', label: 'GLM-5.2' },
]

const gaugeRef = ref(null)
const radarRef = ref(null)
const trendRef = ref(null)

// 评分明细收起/展开（默认展开）
const detailsCollapsed = ref(false)

const gaugeChart = useECharts(gaugeRef)
const radarChart = useECharts(radarRef)
const trendChart = useECharts(trendRef)

const confidenceLabel = computed(() => {
  const c = props.scoreResult?.confidence
  if (c === 'high') return '高'
  if (c === 'medium') return '中'
  return '低'
})

// 评分历史与变化
const scoreHistory = computed(() => getScoreHistory(props.stockCode))
const scoreDelta = computed(() => {
  if (!props.scoreResult || !props.stockCode) return { delta: 0, direction: 'same', prevTotal: null }
  return getScoreChange(props.stockCode, props.scoreResult.total)
})

const rankLabel = computed(() => {
  if (!props.scoreResult || !props.industry) return ''
  return getIndustryRankLabel(props.scoreResult.total, props.industry)
})

const DIM_META = {
  technical: { label: '技术面', color: '#0071e3' },
  capital: { label: '资金面', color: '#ffd60a' },
  fundamental: { label: '基本面', color: '#30d158' },
  risk: { label: '风险面', color: '#ff6b6b' },
}

const dimensionList = computed(() => {
  const dims = props.scoreResult?.dimensions
  if (!dims) return []
  return Object.keys(DIM_META)
    .filter(key => dims[key])
    .map(key => ({ key, label: DIM_META[key].label, pct: dims[key].pct, color: DIM_META[key].color, resonance: dims[key].resonance || null }))
})

const allDetails = computed(() => props.scoreResult?.details || [])
function getDetails(dimensionLabel) {
  return allDetails.value.filter(d => d.dimension === dimensionLabel)
}

function resonanceClass(label) {
  if (label.includes('多头')) return 'res-bull'
  if (label.includes('空头')) return 'res-bear'
  return 'res-warn' // 逆势偏强/偏弱
}

const planDirClass = computed(() => {
  const d = props.aiPlan?.direction || ''
  if (d.includes('多')) return 'dir-bull'
  if (d.includes('空')) return 'dir-bear'
  return 'dir-neutral'
})

const renderedAIContent = computed(() => {
  const text = props.aiJudgeText
  if (!text) return ''
  // 白名单渲染：先转义全部 HTML，再只还原允许的标记
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/###\s*(.+?)(\n|$)/g, '<div class="ai-heading">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
})

function getVerdict(item) {
  const ratio = item.max > 0 ? item.score / item.max : 0
  if (ratio >= 0.7) return 'verdict-good'
  if (ratio >= 0.4) return 'verdict-neutral'
  return 'verdict-bad'
}

function renderGauge() {
  const total = props.scoreResult?.total
  if (total == null) return

  gaugeChart.setOption({
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      splitNumber: 5,
      radius: '90%',
      center: ['50%', '55%'],
      axisLine: {
        lineStyle: {
          width: 14,
          color: [
            [0.3, '#ff453a'],
            [0.5, '#ffd60a'],
            [0.7, '#0071e3'],
            [1, '#30d158'],
          ]
        }
      },
      axisTick: { length: 4, lineStyle: { color: 'auto' } },
      splitLine: { length: 10, lineStyle: { color: 'auto', width: 1 } },
      axisLabel: { color: '#64748b', fontSize: 10, distance: 12 },
      pointer: { width: 4, length: '60%', itemStyle: { color: 'auto' } },
      title: { show: false },
      detail: {
        valueAnimation: true,
        formatter: '{value}',
        fontSize: 28,
        fontWeight: 700,
        color: '#e2e8f0',
        offsetCenter: [0, '30%'],
      },
      data: [{ value: total }]
    }]
  }, true)
}

function renderRadar() {
  const dims = props.scoreResult?.dimensions
  if (!dims) return

  radarChart.setOption({
    backgroundColor: 'transparent',
    radar: {
      indicator: dimensionList.value.map(d => ({ name: d.label, max: 100 })),
      radius: '70%',
      axisName: { color: '#94a3b8', fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      splitArea: { areaStyle: { color: ['transparent'] } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
    },
    series: [{
      type: 'radar',
      data: [{
        value: dimensionList.value.map(d => d.pct),
        areaStyle: { color: 'rgba(0,113,227,0.2)' },
        lineStyle: { color: '#0071e3', width: 2 },
        itemStyle: { color: '#0071e3' },
      }]
    }]
  }, true)
}

function renderTrend() {
  const data = scoreHistory.value
  if (data.length < 3) return

  trendChart.setOption({
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 2, right: 2, top: 4, bottom: 2 },
    xAxis: { type: 'category', show: false, data: data.map(d => d.date) },
    yAxis: { type: 'value', show: false, min: 0, max: 100 },
    series: [{
      type: 'line', data: data.map(d => d.total),
      smooth: true, symbol: 'none',
      lineStyle: { width: 1.5, color: '#0071e3' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(0,113,227,0.2)' },
        { offset: 1, color: 'rgba(0,113,227,0)' },
      ]) },
    }],
  })
}

let mounted = false

watch(() => props.scoreResult, (val) => {
  if (mounted && val) nextTick(() => { renderGauge(); renderRadar(); renderTrend() })
}, { deep: true })

onMounted(() => {
  nextTick(() => {
    renderGauge()
    renderRadar()
    renderTrend()
    mounted = true
  })
})

// 注：onBeforeUnmount / onActivated / onDeactivated 由 useECharts composable 自动处理
</script>

<style scoped>
.score-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 6px 12px;
}

.no-data {
  text-align: center;
  padding: 40px 0;
  color: var(--text-muted);
}

.score-row {
  display: flex;
  align-items: center;
  height: 200px;
}

.gauge-wrap {
  flex: 1;
  min-width: 42%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gauge-chart {
  width: 160px;
  height: 140px;
}

.score-summary {
  display: flex;
  align-items: center;
  gap: 8px;
}

.suggestion {
  font-size: 16px;
  font-weight: 700;
}

.confidence {
  font-size: 12px;
  color: #ffd60a;
}

.confidence-label {
  color: var(--text-muted);
  font-size: 11px;
}

.radar-chart {
  flex: 1;
  width: 100%;
  height: 200px;
}

.dimension-bars {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dim-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dim-label {
  font-size: 13px;
  color: var(--text-secondary);
  width: 50px;
  flex-shrink: 0;
}

.dim-bar-track {
  flex: 1;
  height: 8px;
  background: var(--bg-surface-alt);
  border-radius: 4px;
  overflow: hidden;
}

.dim-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}

.dim-score {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  width: 40px;
  text-align: right;
}

.details-section {
  display: flex;
  flex-direction: column;
  gap: 0px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-title.collapsible {
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
  transition: color 0.15s;
}
.section-title.collapsible:hover {
  color: var(--accent, #0071e3);
}

.collapse-arrow {
  display: inline-block;
  font-size: 12px;
  transition: transform 0.2s ease;
}
.collapse-arrow.collapsed {
  transform: rotate(-90deg);
}

.details-cols {
  display: flex;
  gap: 12px;
}

.detail-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  border: 1px solid var(--border);
}

/* 评分明细列宽：基本面 22% / 资金面 28%（资金面因子多、描述长）。
   fundamental+capital 之和=2.0（与技术面+风险面相等），技术面/风险面被钉在 25% 不变 */
.detail-col.col-fundamental { flex: 0.88; }
.detail-col.col-capital { flex: 1.12; }

.col-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 2px;
}

/* 资金面共振标记 */
.col-resonance {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  font-size: 10px;
  font-weight: 600;
  vertical-align: middle;
}
.res-bull { background: var(--green-dim); color: var(--green); }
.res-bear { background: var(--red-dim); color: var(--red); }
.res-warn { background: rgba(255, 149, 0, 0.14); color: #ff9500; }

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 2px 0;
}

.detail-name {
  color: var(--text-secondary);
  width: 60px;
  flex-shrink: 0;
}

.detail-score {
  color: var(--text-primary);
  font-weight: 600;
  width: 36px;
  flex-shrink: 0;
}

.verdict-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 9px;
  font-weight: 600;
}

.verdict-good {
  background: var(--green-dim);
  color: var(--green);
}

.verdict-neutral {
  background: rgba(255, 214, 10, 0.12);
  color: var(--yellow);
}

.verdict-bad {
  background: var(--red-dim);
  color: var(--red);
}

@media (max-width: 768px) {
  .score-row {
    flex-wrap: wrap;
    justify-content: center;
  }

  .gauge-chart {
    width: 130px;
    height: 120px;
  }

  .radar-chart {
    width: 150px;
    height: 150px;
  }

  .details-cols {
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .score-row {
    flex-direction: column;
    align-items: stretch;
  }

  .gauge-wrap {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }

  .gauge-chart {
    width: 110px;
    height: 100px;
  }

  .radar-chart {
    width: 100%;
    height: 160px;
  }

  .dimension-bars {
    width: 100%;
  }

  .dim-label {
    width: 40px;
  }

  .dim-score {
    width: 36px;
    font-size: 12px;
  }
}

/* 评分变化箭头 */
.score-arrow {
  font-size: 13px;
  font-weight: 700;
  margin-left: 4px;
}
.score-arrow.up { color: var(--green); }
.score-arrow.down { color: var(--red); }

/* 评分趋势 + 行业排名 */
.score-extras {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 0;
  flex-wrap: wrap;
}

.trend-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: default;
}

.trend-label {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.trend-chart {
  width: 120px;
  height: 32px;
}

.industry-rank {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  background: var(--bg-surface-alt);
  border-radius: var(--radius-pill);
  font-size: 12px;
}

.rank-label {
  color: var(--text-muted);
}

.rank-value {
  color: var(--text-primary);
  font-weight: 600;
}

.ai-judge-section {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-badge {
  display: inline-block;
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  vertical-align: middle;
}
.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.ai-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ai-model-switcher {
  display: inline-flex;
  background: var(--bg-surface-alt);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}
.model-btn {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted, #64748b);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  font-weight: 500;
}
.model-btn:hover {
  color: var(--text-primary, #e2e8f0);
}
.model-btn.active {
  background: rgba(0, 113, 227, 0.25);
  color: #5b9cf5;
}
.ai-toggle {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.15);
  background: transparent;
  color: var(--text-muted, #64748b);
  cursor: pointer;
  transition: all 0.2s;
}
.ai-toggle:hover {
  border-color: #0071e3;
  color: #0071e3;
}
.ai-toggle.active {
  background: rgba(255,69,58,0.15);
  border-color: #ff453a;
  color: #ff453a;
}

.ai-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-skeleton-line {
  height: 14px;
  background: linear-gradient(90deg, var(--bg-surface-alt) 25%, rgba(255,255,255,0.06) 50%, var(--bg-surface-alt) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
  width: 100%;
}

.ai-skeleton-line.short {
  width: 60%;
}

.ai-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}

.ai-content :deep(strong) {
  color: #e2e8f0;
  font-weight: 700;
}

.ai-content :deep(.ai-heading) {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent, #0071e3);
  margin-bottom: 4px;
}
.ai-content :deep(.ai-heading:first-child) {
  margin-top: 0;
}

.ai-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: var(--accent, #0071e3);
  animation: blink 0.8s ease-in-out infinite;
  vertical-align: text-bottom;
  margin-left: 2px;
  border-radius: 1px;
}

.ai-error {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 12px;
  background: rgba(255,255,255,0.03);
  border-radius: var(--radius-sm);
}

.ai-warning {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-sm);
}
.ai-warning-icon {
  font-size: 14px;
  line-height: 1.4;
  flex-shrink: 0;
}
.ai-warning-body {
  flex: 1;
  min-width: 0;
}
.ai-warning-title {
  font-size: 12px;
  font-weight: 600;
  color: #f59e0b;
  margin-bottom: 4px;
}
.ai-warning-list {
  margin: 0;
  padding-left: 16px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.ai-warning-list li {
  word-break: break-all;
}

.ai-trade-plan {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(0, 113, 227, 0.06);
  border: 1px solid rgba(0, 113, 227, 0.2);
  border-radius: var(--radius-sm);
}
.ai-trade-plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.ai-trade-plan-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.3px;
}
.ai-trade-plan-dir {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 10px;
}
.ai-trade-plan-dir.dir-bull { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.ai-trade-plan-dir.dir-bear { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.ai-trade-plan-dir.dir-neutral { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
.ai-trade-plan-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
}
.ai-trade-plan-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.ai-trade-plan-item .label {
  font-size: 10px;
  color: var(--text-muted);
}
.ai-trade-plan-item .value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}
.ai-trade-plan-item .value-good { color: #ef4444; }
.ai-trade-plan-item .value-warn { color: #f59e0b; }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>
