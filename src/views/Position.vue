<template>
  <div class="position page">
    <h1 class="page-title">仓位计算</h1>

    <div class="position-grid">
      <!-- Left: Calculator -->
      <div class="calc-panel card">
        <h2 class="section-title">ATR 动态仓位计算器</h2>

        <div class="form-grid">
          <div class="form-inline">
            <div class="form-row form-row--code">
              <label class="form-label">股票代码</label>
              <div class="form-input-with-btn">
                <input v-model="form.code" type="text" placeholder="如 000001" />
                <span v-if="form.name" class="stock-name-tag">{{ form.name }}</span>
                <button class="btn btn-primary btn-sm" @click="fetchATR" :disabled="atrLoading">
                  {{ atrLoading ? '获取中...' : '获取 ATR' }}
                </button>
              </div>
            </div>
            <div v-if="form.atr" class="atr-info">
              ATR(14) = <strong>{{ form.atr.toFixed(3) }}</strong>
            </div>
          </div>

          <div class="form-inline">
            <div class="form-row">
              <label class="form-label">策略</label>
              <select v-model="form.strategy" class="strategy-select">
                <option value="trend">趋势突破 (N=1.5)</option>
                <option value="pullback">回调买入 (N=2.0)</option>
                <option value="bottom">底部右侧确认 (N=3.0)</option>
              </select>
            </div>
            <div class="form-row">
              <label class="form-label">总资金 (万元)</label>
              <input :value="capitalWan" @input="onCapitalChange" type="number" step="1" />
            </div>
          </div>

          <div class="form-inline">
            <div class="form-row">
              <label class="form-label">买入价</label>
              <input v-model.number="form.buyPrice" type="number" placeholder="0.00" step="0.01" />
            </div>
            <div class="form-row">
              <label class="form-label">目标价</label>
              <input v-model.number="form.targetPrice" type="number" placeholder="0.00" step="0.01" />
            </div>
          </div>
        </div>

        <!-- 策略入场位置提示 -->
        <div v-if="entryPriceInfo" class="entry-hint" :class="entryPriceInfo.cls">
          {{ entryPriceInfo.text }}
        </div>

        <!-- 强突破模式提示 -->
        <div v-if="results?.useStrongBreakout" class="entry-hint strong-breakout">
          强突破模式（强度 {{ strongBreakout.strength.toFixed(1) }}）：止损改用突破日低点 ¥{{ strongBreakout.dayLow.toFixed(2) }}-0.5×ATR，目标价改用盘整幅度投影（AB=CD）
        </div>

        <!-- Results -->
        <div v-if="results" class="results">
          <div class="result-grid">
            <div class="result-item">
              <span class="result-label">止损价</span>
              <span class="result-value stop">{{ results.stopPrice.toFixed(2) }}</span>
            </div>
            <div class="result-item">
              <span class="result-label">止损幅度</span>
              <span class="result-value">{{ results.stopPct.toFixed(1) }}%</span>
            </div>
            <div class="result-item">
              <span class="result-label">建议仓位</span>
              <span class="result-value accent">{{ results.posAmount.toFixed(0) }}元</span>
            </div>
            <div class="result-item">
              <span class="result-label">仓位占比</span>
              <span class="result-value">{{ results.posPct.toFixed(1) }}%</span>
            </div>
            <div class="result-item">
              <span class="result-label">股数</span>
              <span class="result-value">{{ results.shares }} 股</span>
            </div>
            <div class="result-item">
              <span class="result-label">盈亏比</span>
              <span class="result-value" :class="results.rr >= 2 ? 'good' : 'bad'">
                {{ results.rr.toFixed(2) }}:1
              </span>
            </div>
            <div class="result-item">
              <span class="result-label">跟踪止盈初始价</span>
              <span class="result-value target">{{ results.trailStop.toFixed(2) }}</span>
            </div>

            <!-- Visual bar -->
            <div class="result-item result-item--bar">
              <div class="visual-bar">
                <div class="bar-track">
                  <div class="bar-seg bar-stop" :style="{ width: stopBarPct + '%' }"></div>
                  <div class="bar-seg bar-target" :style="{ width: targetBarPct + '%' }"></div>
                  <div class="bar-dot bar-dot--stop" title="止损价">
                    <span class="dot-label dot-label--stop">{{ results.stopPrice.toFixed(2) }}</span>
                  </div>
                  <div class="bar-dot bar-dot--buy" :style="{ left: stopBarPct + '%' }" title="买入价">
                    <span class="dot-label dot-label--buy">{{ form.buyPrice.toFixed(2) }}</span>
                  </div>
                  <div class="bar-dot bar-dot--target" title="目标价">
                    <span class="dot-label dot-label--target">{{ form.targetPrice.toFixed(2) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="strategy-invalid-warning" v-if="results.invalid">
            ⚠ 策略失效，不应入场：{{ results.invalid }}
          </div>
          <template v-else>
            <div class="rr-warning" v-if="results.rr < 2">
              <template v-if="results.rr <= 0">
                当前价已超过策略目标位 ¥{{ form.targetPrice.toFixed(2) }}，该策略已不适用，建议切换策略或放弃交易
              </template>
              <template v-else>
                盈亏比 {{ results.rr.toFixed(2) }}:1 低于 2:1，建议谨慎入场或等待更好的入场点
              </template>
            </div>
            <div class="quality-hint" v-if="qualityLabel && results.posScale < 1">
              信号质量「{{ qualityLabel }}」已将仓位缩放至 {{ (results.posScale * 100).toFixed(0) }}%（原始 {{ results.originalPct.toFixed(1) }}%）
            </div>
          </template>

          <button
            class="btn btn-primary"
            @click="addToHoldings"
            :disabled="!!results.invalid"
            style="margin-top: 12px; width: 100%;"
          >
            {{ results.invalid ? '策略失效，无法添加' : '添加到持仓' }}
          </button>
        </div>
      </div>

      <!-- Right: Holdings + Concentration -->
      <div class="right-panel">
        <!-- Strategy reference -->
        <div class="card" style="margin-bottom: 16px;">
          <h2 class="section-title">策略参数参考</h2>
          <table>
            <thead>
              <tr>
                <th>策略</th>
                <th>ATR乘数N</th>
                <th>跟踪止盈M</th>
                <th>仓位上限</th>
                <th>持有期</th>
                <th>时间止损</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, key) in strategyParams" :key="key">
                <td>{{ p.name }}</td>
                <td>{{ p.atrN }}</td>
                <td>{{ p.trailAtrN }}×ATR</td>
                <td>{{ (p.maxPosition * 100).toFixed(0) }}%</td>
                <td>{{ p.holdPeriod }}</td>
                <td style="font-size: 12px;">{{ p.timeStop }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Industry concentration -->
        <div class="card" style="margin-bottom: 16px;">
          <h2 class="section-title">行业集中度</h2>
          <div v-if="!positionStore.industryConcentration.length" class="empty-hint">暂无持仓数据</div>
          <div v-else class="concentration-bars">
            <div v-for="ind in positionStore.industryConcentration" :key="ind.name" class="conc-bar">
              <div class="conc-bar__header">
                <span class="conc-bar__name">{{ ind.name }}</span>
                <span class="conc-bar__pct" :class="{ warn: +ind.pct > 30 }">{{ ind.pct }}%</span>
              </div>
              <div class="conc-bar__track">
                <div
                  class="conc-bar__fill"
                  :class="{ warn: +ind.pct > 30 }"
                  :style="{ width: Math.min(+ind.pct, 100) + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Holdings table -->
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h2 class="section-title" style="margin-bottom: 0;">持仓管理</h2>
            <span class="text-muted">总资金: {{ capitalWan }} 万</span>
          </div>
          <div v-if="!positionStore.holdings.length" class="empty-hint">暂无持仓</div>
          <table v-else>
            <thead>
              <tr>
                <th>代码</th>
                <th>行业</th>
                <th>买价</th>
                <th>止损</th>
                <th>跟踪止盈</th>
                <th>仓位</th>
                <th>策略</th>
                <th>日期</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in positionStore.holdings" :key="h.id">
                <td style="font-family: var(--font-mono);">{{ h.code }}</td>
                <td>{{ h.industry }}</td>
                <td>{{ h.buyPrice.toFixed(2) }}</td>
                <td class="stop-text">{{ h.stopPrice.toFixed(2) }}</td>
                <td class="target-text">{{ h.trailingStop.toFixed(2) }}</td>
                <td>{{ h.position.toFixed(0) }}</td>
                <td>{{ h.strategyName }}</td>
                <td>{{ h.date }}</td>
                <td>
                  <button class="btn btn-sm btn-danger" @click="positionStore.removeHolding(h.id)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { usePositionStore } from '../stores/position.js'
import { useRoute } from 'vue-router'
import { STRATEGY_PARAMS, SIGNAL_QUALITY } from '../utils/constants.js'
import { calcATR, calcStopLoss, calcPosition, calcRiskReward, calcTrailingStop, getAdjustedAtrN, detectStrongBreakout, calcStrongBreakoutStop, calcStrongBreakoutTarget } from '../utils/position.js'

const positionStore = usePositionStore()
const route = useRoute()
const strategyParams = STRATEGY_PARAMS

const atrLoading = ref(false)

const form = reactive({
  code: '',
  name: '',
  strategy: 'pullback',
  buyPrice: null,
  targetPrice: null,
  atr: null
})

const capitalWan = computed(() => (positionStore.totalCapital / 10000).toFixed(0))

// 信号质量缩放系数（来自跳转参数 quality，如 strong/moderate/weak）
const qualityScale = computed(() => {
  const q = route.query.quality
  if (!q) return 1.0
  return SIGNAL_QUALITY[q]?.positionScale ?? 1.0
})
const qualityLabel = computed(() => {
  const q = route.query.quality
  if (!q) return null
  return SIGNAL_QUALITY[q]?.label ?? null
})

const results = computed(() => {
  if (!form.buyPrice || !form.atr || !form.targetPrice) return null
  // 趋势突破 + 强突破场景：用突破日低点做结构止损（更紧、更真实）
  let stopPrice
  let useStrongBreakout = false
  if (form.strategy === 'trend' && strongBreakout.value?.isStrong) {
    stopPrice = calcStrongBreakoutStop(form.buyPrice, form.atr, strongBreakout.value.dayLow)
    useStrongBreakout = true
  } else {
    stopPrice = calcStopLoss(form.buyPrice, form.atr, form.strategy)
  }
  const pos = calcPosition(positionStore.totalCapital, form.buyPrice, stopPrice, form.strategy)
  // 按信号质量缩放仓位
  const scale = qualityScale.value
  const scaledAmount = pos.amount * scale
  const scaledPct = pos.pct * scale
  let shares = Math.floor(scaledAmount / form.buyPrice / 100) * 100
  const rr = calcRiskReward(form.buyPrice, stopPrice, form.targetPrice)
  const trailStop = calcTrailingStop(form.buyPrice, form.atr, form.strategy)
  const stopPct = ((form.buyPrice - stopPrice) / form.buyPrice) * 100
  // 策略失效时仓位归零，阻止入场
  const invalid = strategyInvalid.value
  const finalAmount = invalid ? 0 : scaledAmount
  const finalPct = invalid ? 0 : scaledPct
  const finalShares = invalid ? 0 : shares
  return {
    stopPrice, posPct: finalPct, posAmount: finalAmount, shares: finalShares,
    rr, trailStop, stopPct,
    posScale: scale, originalPct: pos.pct, originalAmount: pos.amount,
    invalid, useStrongBreakout,
  }
})

// 强突破检测：趋势突破策略专用，识别突破日强度 > 2 的强势突破
const strongBreakout = computed(() => {
  if (form.strategy !== 'trend' || !lastKlines.value) return null
  return detectStrongBreakout(lastKlines.value)
})

// 策略入场锚点位置提示：当前价 vs 策略入场位的关系
const entryPriceInfo = computed(() => {
  if (!lastKlines.value || !form.buyPrice) return null
  const entryPrice = calcEntryPrice(form.strategy, lastKlines.value)
  if (!entryPrice) return null
  const params = STRATEGY_PARAMS[form.strategy]
  const diffPct = ((form.buyPrice - entryPrice) / entryPrice * 100)
  const absPct = Math.abs(diffPct).toFixed(1)
  let text, cls
  if (params.key === 'trend') {
    // 趋势突破：锚点 = 突破位，现价应 ≥ 锚点
    // 失效判断：跌破突破位超过 1.5×ATR = 突破动能衰竭，突破已失败
    // （ATR 自适应：低波动股阈值小，高波动股阈值大，与止损 N=1.5 一致）
    const failThreshold = entryPrice - 1.5 * form.atr
    // 假突破识别：今日盘中曾突破（最高 > 突破位）但收盘回落（现价 < 突破位）
    const today = lastKlines.value[lastKlines.value.length - 1]
    const intradayBreakout = today && today.high > entryPrice && form.buyPrice < entryPrice
    if (diffPct >= 0) {
      text = `当前价已突破${params.name}入场位 ${absPct}%（突破位 ¥${entryPrice.toFixed(2)}）`
      cls = 'ready'
    } else if (form.buyPrice < failThreshold) {
      const failPct = ((entryPrice - form.buyPrice) / entryPrice * 100).toFixed(1)
      text = `当前价低于突破位 ${failPct}%，已跌破失效线 ¥${failThreshold.toFixed(2)}（突破位-1.5×ATR），突破已失败，不应入场`
      cls = 'broken'
    } else if (intradayBreakout) {
      // 今日盘中曾突破但收盘回落，假突破风险
      const fallbackPct = ((today.high - form.buyPrice) / today.high * 100).toFixed(1)
      text = `今日盘中突破 ¥${today.high.toFixed(2)}后回落 ${fallbackPct}%至 ¥${form.buyPrice.toFixed(2)}，收盘未站稳突破位 ¥${entryPrice.toFixed(2)}，假突破风险，建议观望`
      cls = 'broken'
    } else {
      text = `当前价低于${params.name}突破位 ${absPct}%，未突破等待（突破位 ¥${entryPrice.toFixed(2)}）`
      cls = 'waiting'
    }
  } else if (params.key === 'pullback') {
    // 回调买入：锚点 = MA20，现价应在 MA20 附近
    // 入场区判定也 ATR 自适应：|现价-MA20| ≤ 1.0×ATR 为入场区
    // 失效判断：跌破 MA20 超过 1.0×ATR = 均线支撑已破
    // （比趋势突破的 1.5×ATR 更严格，因回调买点本就更精确）
    const recent = lastKlines.value.slice(-20)
    const high20 = Math.max(...recent.map(k => k.high))
    const entryBand = 1.0 * form.atr  // 入场区宽度
    const failThreshold = entryPrice - 1.0 * form.atr  // 支撑失效线
    if (form.buyPrice > high20) {
      // 现价已突破20日新高，回调买入策略不适用（应改用趋势突破）
      const overPct = ((form.buyPrice - high20) / high20 * 100).toFixed(1)
      text = `当前价已突破20日新高 ${overPct}%（前高 ¥${high20.toFixed(2)}），回调买入策略不适用，建议改用趋势突破`
      cls = 'broken'
    } else if (Math.abs(form.buyPrice - entryPrice) <= entryBand) {
      const bandPct = (entryBand / entryPrice * 100).toFixed(1)
      text = `当前价在${params.name}入场区（MA20 ¥${entryPrice.toFixed(2)}，±${bandPct}% 即 ±${entryBand.toFixed(2)}元）`
      cls = 'ready'
    } else if (form.buyPrice > entryPrice) {
      text = `当前价高于MA20 ${absPct}%，等待回调（MA20 ¥${entryPrice.toFixed(2)}）`
      cls = 'waiting'
    } else if (form.buyPrice < failThreshold) {
      const failPct = ((entryPrice - form.buyPrice) / entryPrice * 100).toFixed(1)
      text = `当前价低于MA20 ${failPct}%，已跌破失效线 ¥${failThreshold.toFixed(2)}（MA20-1.0×ATR），均线支撑已破，不应入场`
      cls = 'broken'
    } else {
      text = `当前价低于MA20 ${absPct}%，回调接近入场区（MA20 ¥${entryPrice.toFixed(2)}）`
      cls = 'waiting'
    }
  } else {
    // 底部确认：锚点 = 底部确认价，现价应 ≥ 锚点
    const recent = lastKlines.value.slice(-20)
    const low20 = Math.min(...recent.map(k => k.low))
    const targetPrice = low20 * 1.20
    if (form.buyPrice > targetPrice) {
      // 现价已超过反弹目标位（low×1.20），策略失效
      const overPct = ((form.buyPrice - targetPrice) / targetPrice * 100).toFixed(1)
      text = `当前价已超过反弹目标 ${overPct}%（目标位 ¥${targetPrice.toFixed(2)}），底部确认策略不适用`
      cls = 'broken'
    } else if (diffPct >= 0) {
      text = `当前价已确认${params.name} ${absPct}%（确认位 ¥${entryPrice.toFixed(2)}）`
      cls = 'ready'
    } else {
      text = `当前价低于底部确认位 ${absPct}%，探底中（确认位 ¥${entryPrice.toFixed(2)}）`
      cls = 'waiting'
    }
  }
  return { text, cls }
})

// 策略是否失效（失效时不应入场，仓位归零）
// 失效条件 = entryPriceInfo.cls === 'broken' 的所有场景
const strategyInvalid = computed(() => {
  if (!lastKlines.value || !form.buyPrice) return null
  const info = entryPriceInfo.value
  if (info?.cls === 'broken') {
    return info.text
  }
  return null
})

const stopBarPct = computed(() => {
  if (!form.buyPrice || !results.value) return 0
  const range = form.targetPrice - results.value.stopPrice
  return range > 0 ? ((form.buyPrice - results.value.stopPrice) / range * 100) : 0
})

const targetBarPct = computed(() => {
  if (!form.buyPrice || !form.targetPrice || !results.value) return 0
  const range = form.targetPrice - results.value.stopPrice
  return range > 0 ? ((form.targetPrice - form.buyPrice) / range * 100) : 0
})

// 缓存最近一次获取的 K 线，用于切换策略时重算目标价和位置提示
const lastKlines = ref(null)

// 按策略入场锚点计算（仅用于位置提示，不用于填充买入价）
// 注：用昨日及之前的20日数据作为锚点，今日数据用来判断"是否突破/接近锚点"
function calcEntryPrice(strategy, klines) {
  const params = STRATEGY_PARAMS[strategy]
  const recent = klines.slice(-21, -1) // 不含今天
  if (params.key === 'trend') {
    return Math.max(...recent.map(k => k.high))
  }
  if (params.key === 'pullback') {
    return recent.reduce((s, k) => s + k.close, 0) / recent.length
  }
  const low = Math.min(...recent.map(k => k.low))
  return +(low * 1.02).toFixed(2)
}

// 目标价：基于策略语义的预期可达位（不是用盈亏比反推，盈亏比才是判断指标）
function calcTargetPrice(strategy, klines, atr, buyPrice) {
  const params = STRATEGY_PARAMS[strategy]
  const recent = klines.slice(-21, -1) // 不含今天，与 calcEntryPrice 一致
  const high20 = Math.max(...recent.map(k => k.high))
  const low20 = Math.min(...recent.map(k => k.low))
  if (params.key === 'trend') {
    // 趋势突破：强突破用盘整幅度投影（AB=CD，市场结构），普通突破用 2×ATR 延伸
    const breakout = detectStrongBreakout(klines)
    if (breakout?.isStrong) {
      const target = calcStrongBreakoutTarget(breakout.high20BeforeToday, breakout.low20BeforeToday)
      if (target) return target
    }
    // 普通突破：突破后预期延伸 2×ATR
    return +(high20 + 2 * atr).toFixed(2)
  }
  if (params.key === 'pullback') {
    // 回调买入：回到近20日高点（前高压力位）
    return +high20.toFixed(2)
  }
  // 底部确认：预期反弹 20%（底部反转平均幅度）
  return +(low20 * 1.20).toFixed(2)
}

// 切换策略时重算目标价（目标价依赖策略语义和K线）
watch(() => form.strategy, () => {
  if (form.atr && form.buyPrice && lastKlines.value) {
    form.targetPrice = calcTargetPrice(form.strategy, lastKlines.value, form.atr, form.buyPrice)
  }
})

async function fetchATR() {
  if (!form.code) return
  atrLoading.value = true
  try {
    const res = await fetch(`/api/stock/${form.code}/kline`)
    const json = await res.json()
    if (json.ok && json.data.klines?.length >= 15) {
      lastKlines.value = json.data.klines
      form.atr = calcATR(lastKlines.value)
      // 买入价 = 最新收盘价（实际可成交价，仅当用户未手动输入时）
      if (!form.buyPrice) {
        form.buyPrice = lastKlines.value[lastKlines.value.length - 1].close
      }
      // 目标价 = 基于策略语义的预期可达位
      if (!form.targetPrice && form.atr && form.buyPrice) {
        form.targetPrice = calcTargetPrice(form.strategy, lastKlines.value, form.atr, form.buyPrice)
      }
    }
  } catch (e) {
    console.error('fetchATR error:', e)
  }
  atrLoading.value = false
}

function onCapitalChange(e) {
  positionStore.setCapital(Number(e.target.value) * 10000)
}

function addToHoldings() {
  if (!results.value || !form.code) return
  const p = STRATEGY_PARAMS[form.strategy]
  positionStore.addHolding({
    code: form.code,
    buyPrice: form.buyPrice,
    stopPrice: results.value.stopPrice,
    targetPrice: form.targetPrice,
    trailingStop: results.value.trailStop,
    position: results.value.posAmount,
    atr: form.atr,
    atrN: getAdjustedAtrN(form.atr, form.buyPrice, p.atrN),
    trailAtrN: getAdjustedAtrN(form.atr, form.buyPrice, p.trailAtrN),
    strategy: form.strategy,
    strategyName: p.name,
    industry: '',
    date: new Date().toISOString().slice(0, 10)
  })
}

onMounted(() => {
  if (route.query.strategy && STRATEGY_PARAMS[route.query.strategy]) {
    form.strategy = route.query.strategy
  }
  if (route.query.code) {
    form.code = route.query.code
    form.name = route.query.name || ''
    fetchATR()
  }
})
</script>

<style scoped>
.page-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 20px;
}

.position-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

.position {
  height: calc(100vh - 56px);
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-inline {
  display: flex;
  gap: 12px;
}

.form-inline .form-row {
  flex: 1;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.form-input-with-btn {
  display: flex;
  gap: 8px;
}

.form-input-with-btn input {
  flex: 1;
}

/* 原生 <option> 默认白底黑字，与深色毛玻璃风格不搭，强制深色 */
.strategy-select option {
  background: #1e293b;
  color: var(--text-primary);
}

.form-row--code {
  flex: 1;
}

.stock-name-tag {
  padding: 6px 12px;
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(59, 130, 246, 0.15));
  color: #22d3ee;
  border: 1px solid rgba(34, 211, 238, 0.4);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.atr-info {
  padding: 10px 14px;
  background: var(--accent-dim);
  color: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 13px;
  align-self: flex-end;
  white-space: nowrap;
}

/* 策略入场位置提示 */
.entry-hint {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.5;
}
.entry-hint.ready {
  background: rgba(48, 209, 88, 0.12);
  color: #30d158;
}
.entry-hint.waiting {
  background: rgba(255, 214, 10, 0.12);
  color: #ffd60a;
}
.entry-hint.broken {
  background: rgba(255, 69, 58, 0.12);
  color: #ff453a;
}
.entry-hint.strong-breakout {
  background: rgba(191, 90, 242, 0.14);
  color: #bf5af2;
  border: 1px solid rgba(191, 90, 242, 0.3);
}

.results {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.result-item {
  background: var(--bg-surface-alt);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  backdrop-filter: blur(16px) saturate(1.5);
  -webkit-backdrop-filter: blur(16px) saturate(1.5);
  display: flex;
  align-items: baseline;
  gap: 6px;
  transition: border-color 0.2s ease;
}
.result-item:hover {
  border-color: var(--accent);
}

/* Visual bar 独占2格 */
.result-item--bar {
  grid-column: span 2;
  padding: 32px 14px 14px;
  display: flex;
  align-items: center;
}
.result-item--bar:hover {
  border-color: var(--glass-border);
}

.result-label {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.3px;
}

.result-value {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}

.result-value.stop { color: var(--red); }
.result-value.target { color: var(--green); }
.result-value.accent { color: var(--accent); }
.result-value.good { color: var(--green); }
.result-value.bad { color: var(--red); }

.visual-bar {
  width: 80%;
  margin: 0 auto;
}

.bar-track {
  display: flex;
  align-items: stretch;
  height: 4px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid var(--glass-border);
  border-radius: 2px;
  overflow: visible;
  position: relative;
  box-shadow:
    inset 0 0 3px rgba(0, 0, 0, 0.6),
    0 0 10px rgba(34, 211, 238, 0.1);
}

.bar-seg {
  position: relative;
  min-width: 0;
}

.bar-stop {
  background: linear-gradient(90deg,
    rgba(255, 61, 110, 0.85) 0%,
    rgba(255, 61, 110, 0.3) 100%);
  border-radius: 2px 0 0 2px;
  box-shadow: 0 0 8px rgba(255, 61, 110, 0.5);
}

.bar-target {
  background: linear-gradient(90deg,
    rgba(34, 211, 238, 0.3) 0%,
    rgba(34, 211, 238, 0.85) 100%);
  border-radius: 0 2px 2px 0;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
}

/* 关键点：发光圆点 + 标签 */
.bar-dot {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  z-index: 3;
  pointer-events: none;
}
.bar-dot::before {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  opacity: 0.5;
  filter: blur(4px);
}

.bar-dot--stop {
  left: 0;
  background: var(--red);
  box-shadow: 0 0 0 2px rgba(13, 16, 36, 0.9), 0 0 8px var(--red);
}
.bar-dot--stop::before { background: var(--red); }

.bar-dot--buy {
  background: var(--accent);
  box-shadow: 0 0 0 2px rgba(13, 16, 36, 0.9), 0 0 10px var(--accent);
  width: 12px;
  height: 12px;
}
.bar-dot--buy::before { background: var(--accent); opacity: 0.7; }

.bar-dot--target {
  left: 100%;
  background: var(--green);
  box-shadow: 0 0 0 2px rgba(13, 16, 36, 0.9), 0 0 8px var(--green);
}
.bar-dot--target::before { background: var(--green); }

/* 标签气泡：上方显示价格 */
.dot-label {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid;
  letter-spacing: 0.3px;
  font-variant-numeric: tabular-nums;
}

.dot-label--stop {
  background: rgba(255, 61, 110, 0.12);
  border-color: rgba(255, 61, 110, 0.5);
  color: var(--red);
}
.dot-label--buy {
  background: rgba(34, 211, 238, 0.15);
  border-color: rgba(34, 211, 238, 0.6);
  color: var(--accent);
  bottom: 20px;
}
.dot-label--target {
  background: rgba(61, 242, 159, 0.12);
  border-color: rgba(61, 242, 159, 0.5);
  color: var(--green);
}

.rr-warning {
  background: var(--red-dim);
  color: var(--red);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.strategy-invalid-warning {
  background: rgba(255, 61, 110, 0.18);
  color: #ff3d6e;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  border: 1px solid rgba(255, 61, 110, 0.5);
  margin-bottom: 8px;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.quality-hint {
  margin-top: 8px;
  background: rgba(255, 214, 10, 0.12);
  color: #ffd60a;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.text-muted {
  font-size: 12px;
  color: var(--text-muted);
}

.empty-hint {
  text-align: center;
  padding: 20px;
  color: var(--text-muted);
  font-size: 13px;
}

.concentration-bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.conc-bar__header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.conc-bar__name {
  font-size: 13px;
}

.conc-bar__pct {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.conc-bar__pct.warn {
  color: var(--red);
}

.conc-bar__track {
  height: 6px;
  background: var(--bg-primary);
  border-radius: 3px;
  overflow: hidden;
}

.conc-bar__fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.3s;
}

.conc-bar__fill.warn {
  background: var(--red);
}

.stop-text { color: var(--green); }
.target-text { color: var(--red); }

@media (max-width: 768px) {
  .position-grid {
    grid-template-columns: 1fr;
  }

  .result-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
