import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { revalidateReportSurfaces } from '@/lib/revalidate-reports'

// POST /api/admin/trend-hero
// Body: { trendId: string, isHero: boolean }
// Marca/desmarca uma trend como HERO (report_trends.is_hero): ela ocupa o card
// "Última análise" do hero da home. Exclusividade: uma por vez (marcar limpa as
// outras). Só trend de report PUBLISHED. Mesma proteção dupla das demais rotas.
// Requer a migration add-hero-trend-flag.sql aplicada.
export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!await isAdmin(user.email ?? '')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: { trendId?: string; isHero?: boolean }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { trendId, isHero } = body
  if (!trendId || typeof isHero !== 'boolean') {
    return NextResponse.json({ error: 'trendId e isHero (boolean) são obrigatórios' }, { status: 400 })
  }

  const service = createSupabaseService()

  // Report da trend (para validar published e para revalidar o path do report).
  const { data: trend } = await service
    .from('report_trends').select('report_id').eq('id', trendId).maybeSingle()
  if (!trend) return NextResponse.json({ error: 'Trend não encontrada' }, { status: 404 })
  const reportId = (trend as { report_id: string }).report_id

  if (isHero) {
    const { data: rep } = await service.from('reports').select('status').eq('id', reportId).maybeSingle()
    if (rep?.status !== 'published') {
      return NextResponse.json({ error: 'Só uma trend de relatório publicado pode ser o hero' }, { status: 400 })
    }
    // Exclusividade: limpa qualquer hero anterior antes de marcar este.
    const { error: clearErr } = await service
      .from('report_trends').update({ is_hero: false }).eq('is_hero', true).neq('id', trendId)
    if (clearErr) {
      const missing = /is_hero/.test(clearErr.message) && /column|does not exist|42703/i.test(clearErr.message)
      return NextResponse.json({
        error: missing ? 'Coluna is_hero ausente: rode a migration add-hero-trend-flag.sql' : clearErr.message,
      }, { status: 500 })
    }
  }

  const { error } = await service.from('report_trends').update({ is_hero: isHero }).eq('id', trendId)
  if (error) {
    const missing = /is_hero/.test(error.message) && /column|does not exist|42703/i.test(error.message)
    return NextResponse.json({
      error: missing ? 'Coluna is_hero ausente: rode a migration add-hero-trend-flag.sql' : error.message,
    }, { status: 500 })
  }

  revalidateReportSurfaces(reportId)
  return NextResponse.json({ success: true, isHero })
}
