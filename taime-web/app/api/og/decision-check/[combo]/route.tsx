import { ImageResponse } from 'next/og'
import { createSupabaseService } from '@/lib/supabase-server'
import type { ScoreDimensions, TaimeFramework } from '@/lib/types'
import { type Lang, parseComboSlug, themeLabel } from '@/lib/decision-check'
import { getDecisionResult } from '@/lib/decision-check-core'
import { reportCard, OG_W, OG_H, OG_CACHE_HEADERS, DIM_ORDER } from '@/lib/og-card'

export const runtime = 'nodejs'

// GET /api/og/decision-check/[combo]?lang=en
// Report Card do resultado do Decision Check. CONSISTENCIA: score e MOVE vem da MESMA
// fonte que a pagina HTML (getDecisionResult -> "LEITURA DO TAIME"), nao de uma logica
// paralela por faixa de score. Assim a imagem nunca diverge do que a pagina mostra.
// O radar (media das 5 dimensoes do tema) e complementar e nao aparece na pagina.

interface Row {
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en: TaimeFramework | null
}

// Media de cada uma das 5 dimensoes (0-100) atraves das trends do tema. Fallback: score.
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

  // Score + MOVE identicos aos da pagina: mesma funcao, mesma chave de cache (v2).
  const res = await getDecisionResult(combo, c)
  if (!res.ok) return new Response('Not found', { status: 404 })

  // Radar: media das dimensoes das mesmas 5 trends de maior score do arquivo COMPLETO
  // (sem janela de 24 meses), alinhado a busca do core. So para o desenho, nao muda
  // score/move (que vem do getDecisionResult).
  const supabase = createSupabaseService()
  const { data } = await supabase
    .from('report_trends')
    .select('taime_framework_pt_br, taime_framework_en, reports!inner(period, status)')
    .eq('theme_slug', c.theme)
    .eq('reports.status', 'published')
    .order('taime_score', { ascending: false })
    .limit(5)
  const rows = (data ?? []) as unknown as Row[]

  const values = avgDims(rows, lang, res.score)
  const title = themeLabel(c.theme, lang)

  return new ImageResponse(
    reportCard({ kicker: 'DECISION CHECK', title, score: res.score, move: res.move, values, lang }),
    { width: OG_W, height: OG_H, headers: OG_CACHE_HEADERS },
  )
}
