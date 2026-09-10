import { ImageResponse } from 'next/og'
import { createSupabaseService } from '@/lib/supabase-server'
import type { ReportTrend, ScoreDimensions } from '@/lib/types'
import { type Lang, type Move, moveFromScore } from '@/lib/decision-check'
import { reportCard, OG_W, OG_H, OG_CACHE_HEADERS, DIM_ORDER } from '@/lib/og-card'

export const runtime = 'nodejs'

// GET /api/og/report/[id]?lang=en&rank=1
// Report Card dinamico de UMA trend do relatorio (a desbloqueada/rank 1 por padrao).
// So relatorios publicados; usado como og:image em /r/[id] e como download publico.

// Le os 5 valores reais das dimensoes (0-100) na ordem canonica. Fallback: usa o
// TAIME Score em todas quando o trend nao tem score_dimensions (trends antigas).
function dimValues(dims: ScoreDimensions | undefined, score: number): number[] {
  return DIM_ORDER.map(k => {
    const v = dims?.[k]?.score
    return typeof v === 'number' && v >= 0 ? v : score
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(req.url)
  const lang: Lang = url.searchParams.get('lang') === 'pt' ? 'pt' : 'en'
  const rankParam = Number(url.searchParams.get('rank'))

  const supabase = createSupabaseService()
  const [{ data: report }, { data: trendsRaw }] = await Promise.all([
    supabase.from('reports').select('id, public_unlocked_rank, status').eq('id', id).eq('status', 'published').maybeSingle(),
    supabase.from('report_trends').select('rank, title_pt_br, title_en, taime_score, taime_framework_pt_br, taime_framework_en').eq('report_id', id).order('rank', { ascending: true }),
  ])

  const trends = (trendsRaw ?? []) as Array<Pick<ReportTrend, 'rank' | 'title_pt_br' | 'title_en' | 'taime_score' | 'taime_framework_pt_br' | 'taime_framework_en'>>
  if (!report || trends.length === 0) {
    return new Response('Not found', { status: 404 })
  }

  // Trend em destaque: ?rank explicito, senao a desbloqueada publica (public_unlocked_rank),
  // senao a rank 1.
  const wantRank = Number.isFinite(rankParam) && rankParam > 0
    ? rankParam
    : ((report as { public_unlocked_rank?: number | null }).public_unlocked_rank ?? 1)
  const trend = trends.find(t => t.rank === wantRank) ?? trends[0]

  const title = lang === 'pt' ? trend.title_pt_br : trend.title_en
  const score = trend.taime_score
  const move: Move = moveFromScore(score)
  const fw = lang === 'pt' ? trend.taime_framework_pt_br : trend.taime_framework_en
  const values = dimValues(fw?.score_dimensions, score)

  return new ImageResponse(
    reportCard({ kicker: lang === 'pt' ? 'TAIME REPORT' : 'TAIME REPORT', title, score, move, values, lang }),
    { width: OG_W, height: OG_H, headers: OG_CACHE_HEADERS },
  )
}
