// Trajetoria de um tema no NIVEL DE TREND (nao de edicao). Sob demanda: busca so
// as trends do tema clicado (theme_slug em CURATED_THEME_SLUGS[index]) que pertencem
// a reports published, em ordem cronologica (mais antiga -> mais recente, porque
// trajetoria se le do passado ao presente). Payload leve, so do tema pedido.
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { CURATED_THEME_SLUGS } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

interface TrendRow {
  report_id:   string
  rank:        number
  taime_score: number
  title_pt_br: string
  title_en:    string
}

export async function GET(req: Request) {
  // So para usuarios logados (o dashboard e area logada).
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const idx = Number.parseInt(searchParams.get('theme') ?? '', 10)
  if (!Number.isInteger(idx) || idx < 0 || idx >= CURATED_THEME_SLUGS.length) {
    return NextResponse.json({ error: 'invalid theme' }, { status: 400 })
  }
  const slugs = CURATED_THEME_SLUGS[idx]

  const localeCookie = (await cookies()).get('taime-locale')?.value
  const isEn = localeCookie === 'en'

  const service = createSupabaseService()

  // 1) trends do tema.
  const { data: trendData, error: trendErr } = await service
    .from('report_trends')
    .select('report_id, rank, taime_score, title_pt_br, title_en')
    .in('theme_slug', slugs)
  if (trendErr) {
    console.error('trajectory: trend query failed', trendErr)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }
  const trends = (trendData ?? []) as TrendRow[]
  if (trends.length === 0) {
    return NextResponse.json({ theme: idx, count: 0, items: [] })
  }

  // 2) periodos dos reports published (drop de nao-published). Busca todos os
  // periodos de uma vez (payload minusculo: id+period) para evitar um filtro .in
  // com centenas de ids na URL nos temas grandes.
  const { data: repData, error: repErr } = await service
    .from('reports')
    .select('id, period')
    .eq('status', 'published')
    .limit(2000)
  if (repErr) {
    console.error('trajectory: report query failed', repErr)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }
  const periodById = new Map((repData ?? []).map(r => [r.id as string, r.period as string]))

  const items = trends
    .filter(t => periodById.has(t.report_id))
    .map(t => ({
      reportId: t.report_id,
      rank:     t.rank,
      period:   periodById.get(t.report_id) as string,
      title:    (isEn && t.title_en) ? t.title_en : t.title_pt_br,
      score:    t.taime_score,
    }))
    // cronologica asc; empate no mesmo periodo -> maior score primeiro.
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : b.score - a.score))

  return NextResponse.json({ theme: idx, count: items.length, items })
}
