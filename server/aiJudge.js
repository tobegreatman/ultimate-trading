import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import OpenAI from 'openai'

// 手动加载 .env 文件（避免 dotenv 的 CJS require 问题）
try {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const envPath = join(__dirname, '.env')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const eq = trimmed.indexOf('=')
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim()
        const val = trimmed.slice(eq + 1).trim()
        if (!process.env[key]) process.env[key] = val
      }
    }
  }
} catch { /* .env 文件不存在则忽略 */ }

const API_KEY = process.env.GLM_API_KEY
const AI_CACHE_TTL = 60 * 1000  // 1分钟缓存
const AI_CACHE_MAX_SIZE = 100
const aiCache = new Map()

// 允许的模型白名单（key 为前端传入的标识，value 为智谱 API 实际模型名）
// 智谱 API 模型 ID 使用点号分隔版本号（参考官方文档 cURL 示例）
const MODEL_MAP = {
  'glm-4.7-flash': 'glm-4.7-flash',   // 免费，30B MoE，200K 上下文
  'glm-5.2': 'glm-5.2',               // 付费旗舰，需订阅 Coding Plan 或按量计费
}
const DEFAULT_MODEL = 'glm-4.7-flash'

/** LRU 淘汰：超过上限时删除最旧的条目 */
function evictAICache() {
  if (aiCache.size <= AI_CACHE_MAX_SIZE) return
  // Map 按插入顺序迭代，第一个即最旧
  const toDelete = aiCache.size - AI_CACHE_MAX_SIZE
  let count = 0
  for (const key of aiCache.keys()) {
    if (count++ >= toDelete) break
    aiCache.delete(key)
  }
}

function getClient() {
  if (!API_KEY || API_KEY === 'your-zhipu-api-key-here') return null
  return new OpenAI({
    apiKey: API_KEY,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  })
}

function buildPrompt(body) {
  const { code, name, scoreSummary, techSummary, fundSummary, capitalSummary, riskSummary, priceAction, trendContext, previousAdvice } = body
  const dim = scoreSummary?.dimensions || {}

  const techDim = dim.technical || {}
  const fundDim = dim.fundamental || {}
  const capDim = dim.capital || {}

  let prompt = `你是一位资深A股分析师。请根据以下量化评分数据，给出一段自然、有深度的综合分析。

## 股票信息
- 名称: ${name || code}（${code}）
- 综合评分: ${scoreSummary?.total || '?'}分/100，系统建议: ${scoreSummary?.suggestion || '未知'}
- 数据置信度: ${scoreSummary?.confidence || '未知'}

## 技术面（得分 ${techDim.score || '?'}/${techDim.max || '?'}，占比 ${Math.round((techDim.score || 0) / (techDim.max || 1) * 100)}%）
- 看多信号: ${techSummary?.bullishCount || 0}个，看空信号: ${techSummary?.bearishCount || 0}个
- 关键信号: ${techSummary?.keySignals || '无'}
- 明细: ${(techSummary?.details || []).join('；')}`

  if (trendContext) {
    const t = trendContext
    prompt += `

## 当前趋势阶段
- 趋势状态: ${t.stage}（${t.maAlign ? '均线多头排列' : t.maDeadCross ? '均线空头排列' : '均线交织'}）
- 最新价: ${priceAction?.latestClose ?? '?'}元`
    if (t.ma5Price != null) prompt += `\n- MA5: ${t.ma5Price}元（${t.aboveMa5 ? '价在线上' : '价在线下'}）`
    if (t.ma20Price != null) prompt += `\n- MA20: ${t.ma20Price}元（${t.aboveMa20 ? '价在线上' : '价在线下'}，偏离${t.deviation20}%）`
    if (t.ma60Price != null) prompt += `\n- MA60: ${t.ma60Price}元（${t.aboveMa60 ? '价在线上' : '价在线下'}${t.deviation60 != null ? `，偏离${t.deviation60}%` : ''}）`
    if (t.atrValue != null) prompt += `\n- ATR(14): ${t.atrValue}元（日均波动${t.atrPct}%）`
    prompt += `\n- MACD方向: ${t.macdDirection}`

    // 候选价位区：AI 只能从这些值中选择引用，禁止自行计算
    if (t.candidates) {
      const c = t.candidates
      prompt += `

## 候选价位参考（重要：所有价位必须从下表引用，禁止自行计算或编造）
| 用途 | 价位 | 说明 |
|------|------|------|
| 当前价 | ${c.latestClose}元 | 基准 |
| MA5 | ${c.ma5}元 | 短期均线 |
| MA20 | ${c.ma20}元 | 中期均线 |${c.ma60 != null ? `\n| MA60 | ${c.ma60}元 | 长期均线 |` : ''}
| 止损1×ATR | ${c.stop1atr}元 | 距现价-${t.atrPct}%，最紧 |
| 止损1.5×ATR | ${c.stop15atr}元 | 距现价-${(t.atrPct * 1.5).toFixed(1)}% |
| 止损2×ATR | ${c.stop2atr}元 | 距现价-${(t.atrPct * 2).toFixed(1)}%，最宽 |
| 目标2×ATR | ${c.tgt2atr}元 | 距现价+${(t.atrPct * 2).toFixed(1)}% |
| 目标3×ATR | ${c.tgt3atr}元 | 距现价+${(t.atrPct * 3).toFixed(1)}% |`
    }
  }

  if (fundSummary) {
    prompt += `

## 基本面（得分 ${fundDim.score || '?'}/${fundDim.max || '?'}）
- PE: ${fundSummary.pe ?? '?'}，PB: ${fundSummary.pb ?? '?'}，行业: ${fundSummary.industry || '未知'}
- ROE: ${fundSummary.roe ?? '?'}%，毛利率: ${fundSummary.grossMargin ?? '?'}%，净利率: ${fundSummary.netMargin ?? '?'}%
- 营收增长: ${fundSummary.revenueGrowth ?? '?'}%，净利增长: ${fundSummary.profitGrowth ?? '?'}%
- 负债率: ${fundSummary.debtRatio ?? '?'}%
- 每股经营现金流: ${fundSummary.ocfPerShare ?? '?'}`
  } else {
    prompt += `\n\n## 基本面\n- 暂无数据`
  }

  prompt += `

## 资金面（得分 ${capDim.score || '?'}/${capDim.max || '?'}）`

  if (capitalSummary) {
    if (capitalSummary.mainForceDesc) prompt += `\n- 主力资金: ${capitalSummary.mainForceDesc}`
    if (capitalSummary.marginDesc) prompt += `\n- 融资融券: ${capitalSummary.marginDesc}`
    if (capitalSummary.priceVolumeSignal) prompt += `\n- 量价信号: ${capitalSummary.priceVolumeSignal}`
  } else {
    prompt += `\n- 暂无数据`
  }

  if (riskSummary && riskSummary.details?.length) {
    prompt += `

## 风险面（得分 ${riskSummary.score || '?'}/${riskSummary.max || '?'}）`
    riskSummary.details.forEach(d => { prompt += `\n- ${d}` })
  }

  if (priceAction) {
    prompt += `

## 近期走势
- 最新收盘: ${priceAction.latestClose ?? '?'}元
- 5日涨跌: ${priceAction.change5d ?? '?'}%
- 20日涨跌: ${priceAction.change20d ?? '?'}%`
  }

  if (previousAdvice && previousAdvice.length > 20) {
    prompt += `

## 上次分析建议（请对比当前数据判断是否已变化）
${previousAdvice.slice(0, 500)}`
  }

  const latestClose = priceAction?.latestClose
  const candidates = trendContext?.candidates
  const hasCandidates = !!candidates

  prompt += `

---

# 输出指令

## 绝对约束（违反即作废，必须严格遵守）
1. **价位引用规则**：${hasCandidates ? '所有提到价位必须从上方"候选价位参考"表中引用，**禁止自行计算或编造任何新价位**。' : '所有价位必须基于当前价计算，禁止编造。'}
2. **方向规则**：
   - "突破XX元"的XX 必须 > 当前价${latestClose ?? '?'}元
   - "跌破XX元"的XX 必须 < 当前价${latestClose ?? '?'}元
   - 禁止方向倒挂（如"突破一个比当前价低的价位"）
3. **止损位规则**：${candidates ? `只能从 止损1×ATR(${candidates.stop1atr}元) / 止损1.5×ATR(${candidates.stop15atr}元) / 止损2×ATR(${candidates.stop2atr}元) 中选择，**禁止自创止损价**。` : '止损位必须 ≥ ATR日均波动幅度。'}
4. **字数规则**：总输出 350-450字，每个章节有独立字数限制。

## 输出结构（按章节生成，严格遵守字数限制）

### 一、结论（30-50字）
一句话明确结论 + 趋势方向。客观反映数据，不要默认偏空：
- 偏多 → "趋势偏多，可关注"
- 偏空 → "偏弱，暂时回避"
- 多空交织 → "震荡格局，等待方向明确"

### 二、核心要点（120-180字，3-4个）
每个要点**必须单独成行**（用换行符分隔，禁止挤在一行）：
**标题1**：分析内容
**标题2**：分析内容
**标题3**：分析内容
标题具体到核心矛盾（如"**均线空头压制**"）。分析内容必须引用具体数字。

### 三、操作建议（120-180字）
每个子项**必须单独成行**（用换行符分隔）。**根据结论类型选择对应模板，不要套用同一套：**

▎结论="偏弱/回避"→ 输出【观望触发条件】+【风险提示】
**观望触发条件**：未来什么信号出现才值得重新关注（这是"等待"条件，不是现在入场）
**风险提示**：若已套牢持仓，给出减仓/止损信号

▎结论="偏多/可关注"→ 输出【入场条件】+【止损条件】
**入场条件**：明确触发信号
**止损条件**：${candidates ? `从候选价位表中选择一个止损价` : '明确退出信号'}

▎结论="震荡"→ 输出【向上突破信号】+【向下破位信号】
**向上突破信号**：xxx
**向下破位信号**：xxx

### 四、上次建议复查（20-50字，若适用）
如果上次建议了价位且当前已到该价位附近（±2%内），必须重新评估，不能简单重复"继续观望"。`

  return prompt
}

async function handleAIJudge(ctx) {
  const body = ctx.request.body
  if (!body?.code || !body?.scoreSummary) {
    ctx.body = { ok: false, error: '参数不完整' }
    return
  }

  const client = getClient()
  if (!client) {
    ctx.body = { ok: false, error: 'AI 判断功能未配置。请在 server/.env 中设置 GLM_API_KEY。' }
    return
  }

  // 缓存检查（Key 基于数值签名，避免 keySignals 字符串顺序不稳定问题）
  const model = MODEL_MAP[body.model] ? body.model : DEFAULT_MODEL
  const sigHash = (body.techSummary?.keySignals || '')
    .split('；').filter(Boolean).sort().join('|').slice(0, 80)
  const cacheKey = `${body.code}_${body.scoreSummary?.total || 0}_${sigHash}_${model}`
  const cached = aiCache.get(cacheKey)

  // 安全写入：连接关闭后 res.write 会抛 ERR_STREAM_WRITE_AFTER_END / EPIPE，必须防护
  let closed = false
  ctx.req.on('close', () => { closed = true })
  const safeWrite = (data) => {
    if (closed || ctx.res.writableEnded) return
    try { ctx.res.write(data) } catch { closed = true }
  }
  const safeEnd = () => {
    if (closed || ctx.res.writableEnded) return
    try { ctx.res.end() } catch { /* 连接已断 */ }
  }

  if (cached && Date.now() - cached.ts < AI_CACHE_TTL) {
    ctx.status = 200
    ctx.set('Content-Type', 'text/event-stream')
    ctx.set('Cache-Control', 'no-cache')
    ctx.set('Connection', 'keep-alive')
    ctx.respond = false
    safeWrite(`data: ${JSON.stringify({ type: 'text', content: cached.text })}\n\n`)
    safeWrite('data: [DONE]\n\n')
    safeEnd()
    return
  }

  const prompt = buildPrompt(body)

  // SSE 响应
  ctx.status = 200
  ctx.set('Content-Type', 'text/event-stream')
  ctx.set('Cache-Control', 'no-cache')
  ctx.set('Connection', 'keep-alive')
  ctx.respond = false

  let fullText = ''

  try {
    const stream = await client.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 16384,
      // 尝试关闭 thinking 模式，避免推理过程耗尽 token 导致无最终输出
      thinking: { type: 'disabled' },
    })

    ctx.req.on('close', () => {
      stream.controller?.abort()
    })

    let chunkCount = 0
    let hasReasoning = false
    let reasoningText = ''
    for await (const chunk of stream) {
      if (closed) break
      chunkCount++
      const choice = chunk.choices?.[0]
      const delta = choice?.delta
      // GLM 推理模型：reasoning_content 是思考过程，content 是最终回复
      const reasoning = delta?.reasoning_content
      if (reasoning) {
        hasReasoning = true
        reasoningText += reasoning
      }
      const content = delta?.content
      if (content) {
        fullText += content
        safeWrite(`data: ${JSON.stringify({ type: 'text', content })}\n\n`)
      }
    }
    // Fallback：如果 content 为空但 reasoning 有内容，说明 thinking 耗尽了 token
    // 此时用 reasoning 内容作为输出（虽然包含思考过程，但比无输出好）
    if (!fullText && reasoningText) {
      fullText = reasoningText
      safeWrite(`data: ${JSON.stringify({ type: 'text', content: reasoningText })}\n\n`)
    }
    console.log(`[ai-judge] code=${body.code} model=${model} chunks=${chunkCount} reasoning=${hasReasoning} reasoningLen=${reasoningText.length} contentLen=${fullText.length}`)

    // 缓存完整结果 + LRU 淘汰
    if (fullText) {
      aiCache.set(cacheKey, { text: fullText, ts: Date.now() })
      evictAICache()
    }

    safeWrite('data: [DONE]\n\n')
    safeEnd()
  } catch (err) {
    console.error('AI judge error:', err.message)
    safeWrite(`data: ${JSON.stringify({ type: 'error', content: 'AI 分析暂时不可用: ' + err.message })}\n\n`)
    safeEnd()
  }
}

export function registerAIJudgeRoutes(router) {
  router.post('/api/stock-analysis/ai-judge', handleAIJudge)
}
