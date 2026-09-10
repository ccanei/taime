import { ImageResponse } from 'next/og'
import { createSupabaseService } from '@/lib/supabase-server'
import type { ScoreDimensions, TaimeFramework } from '@/lib/types'
import { type Lang, type Move, parseComboSlug, themeLabel, moveFromScore } from '@/lib/decision-check'
import { reportCard, OG_W, OG_H, OG_CACHE_HEADERS, DIM_ORDER } from '@/lib/og-card'

export const runtime = 'nodejs'

// GET /api/og/decision-check/[combo]?lang=en
// Report Card do resultado do Decision Check. Mesmo padrao visual do card de report,
// mas os dados vem do tema (agregado das trends publicadas dos ultimos 24 meses):
// score = media ponderada por recencia (igual a pagina), MOVE deterministico do score,
// radar = media das 5 dimensoes. Sem LLM: rapido e cacheavel.

interface Row {
  taime_score: number
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en: TaimeFramework | null
  reports: { period: string } | null
}

function twoYearsAgoKey(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Media ponderada por recencia (pesos lineares 1..n): igual a decision-check-core.
function weightedScore(rows: Row[]): number {
  const asc = [...rows].sort((a, b) => (a.reports?.period ?? '').localeCompare(b.reports?.period ?? ''))
  let num = 0, den = 0
  asc.forEach((t, i) => { const w = i + 1; num += t.taime_score * w; den += w })
  return den ? Math.round(num / den) : 0
}

// Media de cada uma das 5 dimensoes (0-100) atraves das trends. Fallback: score.
function avgDims(rows: Row[], lang: Lang, score: number): number[] {
  return DIM_ORDER.map(k => {
    const vals = rows
      .map(r => (lang === 'pt' ? r.taime_framework_pt_br : r.taime_framework_en)?.score_dimensions as ScoreDimensions | undefined)
      .map(d => d?.[k]?.score)
      .filter((v): v is number => typeof v === 'number' && v >= 0)
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : score
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ combo: string }> },
) {
  const { combo } = await params
  const c = parseComboSlug(combo)
  if (!c) return new Response('Not found', { status: 404 })

  const lang: Lang = new URL(req.url).searchParams.get('lang') === 'pt' ? 'pt' : 'en'

  const supabase = createSupabaseService()
  const { data } = await supabase
    .from('report_trends')
    .select('taime_score, taime_framework_pt_br, taime_framework_en, reports!inner(period, status)')
    .eq('theme_slug', c.theme)
    .eq('reports.status', 'published')
    .gte('reports.period', twoYearsAgoKey())
    .order('taime_score', { ascending: false })
    .limit(5)

  const rows = (data ?? []) as unknown as Row[]
  if (rows.length === 0) return new Response('Not found', { status: 404 })

  const score = weightedScore(rows)
  const move: Move = moveFromScore(score)
  const values = avgDims(rows, lang, score)
  const title = themeLabel(c.theme, lang)

  return new ImageResponse(
    reportCard({ kicker: lang === 'pt' ? 'DECISION CHECK' : 'DECISION CHECK', title, score, move, values, lang }),
    { width: OG_W, height: OG_H, headers: OG_CACHE_HEADERS },
  )
}
