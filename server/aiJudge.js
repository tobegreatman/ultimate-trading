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
const AI_TIMEOUT_MS = 45 * 1000  // API 超时 45 秒
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

/**
 * 输出后校验：检查 AI 输出的价位是否全部来自候选表、方向是否正确
 * 返回 { violations: string[] } 为空则通过
 */
function validateAIOutput(text, candidates, latestClose) {
  const violations = []
  if (!candidates || !latestClose) return violations

  // 候选价位集合（字符串形式，含2位小数）
  const validPrices = new Set([
    candidates.latestClose, candidates.ma5, candidates.ma20,
    candidates.ma60, candidates.stop1atr, candidates.stop15atr,
    candidates.stop2atr, candidates.tgt2atr, candidates.tgt3atr,
    candidates.swingHigh20, candidates.swingLow20,
  ].filter(Boolean).map(p => Number(p).toFixed(2)))

  // 提取输出中所有"XX元"格式的价位（包括"XX.X元"、"XX.XX元"）
  const priceMatches = [...text.matchAll(/(\d+(?:\.\d{1,2})?)\s*元/g)]
  const mentionedPrices = priceMatches.map(m => Number(m[1]).toFixed(2))

  // 检查1：所有提到的价位必须在候选表内
  for (const p of mentionedPrices) {
    if (!validPrices.has(p)) {
      violations.push(`价位 ${p}元 不在候选表中（可能为编造）`)
    }
  }

  // 检查2："突破XX元"的XX必须 > 当前价
  const breakoutMatches = [...text.matchAll(/突破[^\d]*?(\d+(?:\.\d{1,2})?)\s*元/g)]
  for (const m of breakoutMatches) {
    const p = Number(m[1])
    if (p <= latestClose) {
      violations.push(`"突破${p}元" ≤ 当前价${latestClose}元（方向倒挂）`)
    }
  }

  // 检查3："跌破XX元"的XX必须 < 当前价
  const breakdownMatches = [...text.matchAll(/跌破[^\d]*?(\d+(?:\.\d{1,2})?)\s*元/g)]
  for (const m of breakdownMatches) {
    const p = Number(m[1])
    if (p >= latestClose) {
      violations.push(`"跌破${p}元" ≥ 当前价${latestClose}元（方向倒挂）`)
    }
  }

  // 检查4：止损价位必须来自候选止损价位（含前低、MA20、ATR止损）
  const stopMatches = [...text.matchAll(/止损[^。]*?(\d+(?:\.\d{1,2})?)\s*元/g)]
  const validStops = new Set([
    candidates.stop1atr, candidates.stop15atr, candidates.stop2atr,
    candidates.swingLow20, candidates.ma20,
  ].filter(Boolean).map(p => Number(p).toFixed(2)))
  for (const m of stopMatches) {
    const p = Number(m[1]).toFixed(2)
    if (!validStops.has(p)) {
      violations.push(`止损价 ${p}元 不在候选止损价位中（可能为自创）`)
    }
  }

  // 检查5：数值比较关系校验
  // 匹配 "X元...低于/高于...Y元" 模式，验证数值方向与比较词一致
  // 中间字符限制不含"元"字且≤30字，避免跨多个价位误匹配
  const ltWords = ['低于', '跌破', '下方', '之下', '不及', '少于', '小于']
  const gtWords = ['高于', '突破', '上方', '之上', '超过', '大于', '多于']
  const allCmpWords = [...ltWords, ...gtWords].join('|')
  const cmpRegex = new RegExp(
    `(\\d+\\.\\d{1,2})\\s*元([^元]{0,30}?)(${allCmpWords})([^元]{0,30}?)(\\d+\\.\\d{1,2})\\s*元`,
    'g'
  )
  for (const m of [...text.matchAll(cmpRegex)]) {
    const a = Number(m[1])
    const cmp = m[3]
    const b = Number(m[5])
    if (ltWords.includes(cmp) && a > b) {
      violations.push(`"${a}元${cmp}${b}元" 数值比较错误（${a} > ${b}，应为"高于"）`)
    } else if (gtWords.includes(cmp) && a < b) {
      violations.push(`"${a}元${cmp}${b}元" 数值比较错误（${a} < ${b}，应为"低于"）`)
    }
  }

  return violations
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
| 用途 | 价位 | 距现价 |
|------|------|--------|
| 当前价 | ${c.latestClose}元 | 基准 |
| MA5 | ${c.ma5}元 | ${((c.ma5 - c.latestClose) / c.latestClose * 100).toFixed(1)}% |
| MA20 | ${c.ma20}元 | ${((c.ma20 - c.latestClose) / c.latestClose * 100).toFixed(1)}% |${c.ma60 != null ? `\n| MA60 | ${c.ma60}元 | ${((c.ma60 - c.latestClose) / c.latestClose * 100).toFixed(1)}% |` : ''}${c.swingHigh20 != null ? `\n| 前高(20日最高) | ${c.swingHigh20}元 | +${((c.swingHigh20 - c.latestClose) / c.latestClose * 100).toFixed(1)}% |` : ''}${c.swingLow20 != null ? `\n| 前低(20日最低) | ${c.swingLow20}元 | ${((c.swingLow20 - c.latestClose) / c.latestClose * 100).toFixed(1)}% |` : ''}
| 止损1×ATR | ${c.stop1atr}元 | -${t.atrPct}% |
| 止损1.5×ATR | ${c.stop15atr}元 | -${(t.atrPct * 1.5).toFixed(1)}% |
| 止损2×ATR | ${c.stop2atr}元 | -${(t.atrPct * 2).toFixed(1)}% |
| 目标2×ATR | ${c.tgt2atr}元 | +${(t.atrPct * 2).toFixed(1)}% |
| 目标3×ATR | ${c.tgt3atr}元 | +${(t.atrPct * 3).toFixed(1)}% |

## 真实盈亏比配对表（基于个股实际技术结构，非固定常量）
| 止损 | 目标 | 盈亏比 | 说明 |
|------|------|--------|------|${c.rrStruct != null ? `\n| 前低(${c.swingLow20}元) | 前高(${c.swingHigh20}元) | ${c.rrStruct}:1 | 结构盈亏比（最真实） |` : ''}${c.rrMa20High != null ? `\n| MA20(${c.ma20}元) | 前高(${c.swingHigh20}元) | ${c.rrMa20High}:1 | 均线支撑+结构阻力 |` : ''}${c.rrAtrHigh != null ? `\n| 止损1×ATR(${c.stop1atr}元) | 前高(${c.swingHigh20}元) | ${c.rrAtrHigh}:1 | ATR止损+结构目标 |` : ''}

**关键规则**：
1. 盈亏比是(止损,目标)配对组合，必须成对引用，如"止损${c.swingLow20 || c.stop1atr}元+目标${c.swingHigh20 || c.tgt2atr}元→盈亏比X:1"
2. 优先引用真实结构盈亏比(rrStruct)，反映个股实际风险收益结构
3. 盈亏比<1.5不建议入场；≥2为优秀；1.5-2为可接受
4. 若前高≤当前价(已突破前高)，则结构目标失效，改用目标2×ATR(${c.tgt2atr}元)或目标3×ATR(${c.tgt3atr}元)`
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
   - **多空方向必须直接引用上方"当前趋势阶段"中的"价在线上/线下"判断**，禁止自行比较价位大小得出多空结论（数值比较极易出错，如把20.34误判为低于20.28）
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
每个要点**必须单独成行**（用换行符分隔，禁止挤在一行）。格式为"**<具体标题>**：<分析内容>"，标题要具体到核心矛盾，分析内容必须引用具体数字。
**关键规则**：多空方向**必须直接引用**上方"当前趋势阶段"中"价在线上/线下"的预计算结论，**禁止自行比较价位大小**（如禁止自己判断"20.34是否低于20.28"）。"价在线上"只能用"高于/之上/上方"，"价在线下"只能用"低于/之下/下方"。示例：
**均线下方运行**：当前价XX元，价在线下（引用趋势阶段），MA20为XX元构成压制
**均线上方运行**：当前价XX元，价在线上（引用趋势阶段），MA20为XX元构成支撑
**主力资金出逃**：净流出X亿，融资余额下降X万

### 三、操作建议（120-180字）
每个子项**必须单独成行**（用换行符分隔）。**根据结论类型选择对应模板，不要套用同一套：**

▎结论="偏弱/回避"→ 输出【观望触发条件】+【风险提示】
**观望触发条件**：未来什么信号出现才值得重新关注（这是"等待"条件，不是现在入场）。必须指定**观察周期**（如"日线连续3日"）和**确认次数**（如"2次确认"）
**风险提示**：若已套牢持仓，给出减仓/止损信号${candidates ? `（止损价从候选表选择）` : ''}

▎结论="偏多/可关注"→ 输出【入场条件】+【止损条件】+【目标与盈亏比】+【仓位建议】
**入场条件**：明确触发信号（如"日线收盘站稳XX元"）
**止损条件**：${candidates ? `从候选价位表中选择一个止损价` : '明确退出信号'}
**目标与盈亏比**：${candidates ? `从盈亏比配对表选择一对，必须显式说明配对关系。优先用真实结构盈亏比(rrStruct)。示例"止损前低${candidates.swingLow20 || candidates.stop1atr}元+目标前高${candidates.swingHigh20 || candidates.tgt2atr}元→盈亏比X:1"。盈亏比<1.5不建议入场` : '明确目标价'}
**仓位建议**：根据盈亏比给仓位（盈亏比≥2→5-7成；1.5-2→3-5成；<1.5→不入场）

▎结论="震荡"→ 输出【向上突破信号】+【向下破位信号】+【仓位建议】
**向上突破信号**：明确触发条件（如"日线收盘站稳XX元3日"）
**向下破位信号**：明确触发条件（如"日线收盘跌破XX元"）
**仓位建议**：震荡期建议≤3成，突破确认后加仓

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

  // 缓存检查（Key 含价格/趋势数值签名，避免价格变化但评分不变时返回旧结果）
  const model = MODEL_MAP[body.model] ? body.model : DEFAULT_MODEL
  const sigHash = (body.techSummary?.keySignals || '')
    .split('；').filter(Boolean).sort().join('|').slice(0, 80)
  // 价格签名：最新价 + MA20 + ATR 取整拼接，价格变化即失效
  const priceSig = [
    body.priceAction?.latestClose,
    body.trendContext?.ma20Price,
    body.trendContext?.atrValue,
    body.priceAction?.change5d,
  ].map(v => v != null ? Number(v).toFixed(2) : '_').join('-')
  const cacheKey = `${body.code}_${body.scoreSummary?.total || 0}_${sigHash}_${priceSig}_${model}`
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
    // P0-2: 45秒超时保护，避免 API 卡住时前端死等
    const streamPromise = client.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 16384,
      // 尝试关闭 thinking 模式，避免推理过程耗尽 token 导致无最终输出
      thinking: { type: 'disabled' },
    })
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI 响应超时（45秒）')), AI_TIMEOUT_MS)
    })
    const stream = await Promise.race([streamPromise, timeoutPromise])

    ctx.req.on('close', () => {
      stream.controller?.abort()
    })

    let chunkCount = 0
    let hasReasoning = false
    let reasoningText = ''
    const startTime = Date.now()
    for await (const chunk of stream) {
      if (closed) break
      // 循环内也检查超时（流式响应可能慢速卡住）
      if (Date.now() - startTime > AI_TIMEOUT_MS) {
        throw new Error('AI 流式响应超时（45秒）')
      }
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

    // 输出后校验——仅记日志，不追加前端输出（避免冗余警告污染 AI 文本）
    const violations = validateAIOutput(fullText, body.trendContext?.candidates, body.priceAction?.latestClose)
    if (violations.length > 0) {
      console.log(`[ai-judge] VALIDATION VIOLATIONS: ${violations.join(' | ')}`)
    }

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
