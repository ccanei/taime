import { NextResponse } from 'next/server'
import { createSupabaseService } from '@/lib/supabase-server'
import type { TaimeFramework } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Busca por TEXT-MATCH (ilike) sobre TODOS os report_trends de reports
// status='published'. Independe de embeddings, entao cobre todos os periodos,
// inclusive os mais recentes (junho/2026) e os de 2023. A busca semantica
// (/api/search) exige embeddings, que hoje nao cobrem os reports novos; este
// endpoint e o caminho principal e confiavel da busca da home.

const DEFAULT_LIMIT   = 24
const MAX_LIMIT        = 40
const MAX_QUERY_CHARS  = 200

interface TrendRow {
  report_id:             string
  title_pt_br:           string | null
  title_en:              string | null
  taime_score:           number
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en:    TaimeFramework | null
}

export async function POST(req: Request) {
  let body: { query?: string; limit?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const query = (body.query ?? '').trim()
  if (!query) return NextResponse.json({ results: [] })
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json({ error: `query too long (max ${MAX_QUERY_CHARS} chars)` }, { status: 400 })
  }
  const limit = Math.min(Math.max(Math.trunc(body.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)

  // Neutraliza curingas do PostgREST (*), separadores de OR (,) e curingas do
  // LIKE (%, _) e parenteses, para o termo entrar como texto literal.
  const term = query.replace(/[%_*(),]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!term) return NextResponse.json({ results: [] })
  const like = `*${term}*`

  try {
    const supabase = createSupabaseService()
    const { data, error } = await supabase
      .from('report_trends')
      .select(
        'report_id,title_pt_br,title_en,taime_score,' +
        'taime_framework_pt_br,taime_framework_en,reports!inner(status)',
      )
      .eq('reports.status', 'published')
      .or(
        `title_pt_br.ilike.${like},title_en.ilike.${like},` +
        `category.ilike.${like},theme_slug.ilike.${like}`,
      )
      .order('taime_score', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('search/text: query error', error)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }

    // Remove o embed reports do payload; devolve so o shape que a home usa.
    const rows = (data ?? []) as unknown as Array<TrendRow & { reports?: unknown }>
    const results: TrendRow[] = rows.map(r => ({
      report_id:             r.report_id,
      title_pt_br:           r.title_pt_br,
      title_en:              r.title_en,
      taime_score:           r.taime_score,
      taime_framework_pt_br: r.taime_framework_pt_br,
      taime_framework_en:    r.taime_framework_en,
    }))
    return NextResponse.json({ results })
  } catch (e) {
    console.error('search/text: exception', e)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
