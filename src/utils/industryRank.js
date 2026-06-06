/**
 * 同行业对比工具
 * 利用 marketAnalysis store 的板块数据和个股行业名，生成行业排名标签
 *
 * v2: 改用多维度综合行业评分（涨跌幅+涨跌比+领涨股强度），
 *     而非单纯依赖单日涨跌幅线性映射
 */
import { useMarketAnalysisStore } from '../stores/marketAnalysis.js'

/**
 * 计算行业综合景气度评分（0-100）
 * 综合考虑：当日涨跌幅（30%权重）、涨跌家数比（40%权重）、领涨股强度（30%权重）
 */
function calcIndustryScore(matched) {
  // 因素1：涨跌幅 → 映射到 0-100（±5% 区间）
  const changePct = matched.changePercent || 0
  const changeScore = Math.max(0, Math.min(100, 50 + changePct * 8))

  // 因素2：涨跌家数比 → 映射到 0-100
  const up = matched.upCount || 0
  const down = matched.downCount || 0
  const total = up + down
  const ratioScore = total > 0
    ? (up / total) * 100
    : 50  // 无涨跌数据时取中值

  // 因素3：领涨股强度 → 映射到 0-100
  const leadChange = matched.leadStockChange || 0
  const leadScore = Math.max(0, Math.min(100, 50 + leadChange * 5))

  // 加权综合
  return Math.round(changeScore * 0.30 + ratioScore * 0.40 + leadScore * 0.30)
}

/**
 * 生成行业对比标签
 * @param {number} totalScore - 个股综合评分
 * @param {string} industry - 行业名称
 * @returns {string} 如 "行业中上游（68分 vs 行业景气 52分）" 或 ""
 */
export function getIndustryRankLabel(totalScore, industry) {
  if (!totalScore || !industry) return ''

  let marketStore
  try {
    marketStore = useMarketAnalysisStore()
  } catch {
    // Pinia 尚未初始化，静默返回
    return ''
  }

  const sectors = marketStore.sectors
  if (!sectors?.length) return ''

  // 从板块数据中找到匹配行业
  const matched = sectors.find(s => {
    const name = (s.name || '').toLowerCase()
    const ind = industry.toLowerCase()
    return name.includes(ind) || ind.includes(name)
  })

  if (!matched) return ''

  // 多维度综合行业评分
  const industryScore = Math.max(10, Math.min(90, calcIndustryScore(matched)))

  const diff = totalScore - industryScore
  let level = ''
  if (diff >= 20) level = '行业领先'
  else if (diff >= 5) level = '行业中上游'
  else if (diff >= -5) level = '行业中游'
  else if (diff >= -20) level = '行业中下游'
  else level = '行业落后'

  return `${level}（${totalScore}分 vs 行业景气${industryScore}分）`
}
