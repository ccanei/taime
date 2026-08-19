import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'

export const dynamic = 'force-dynamic'

// Renomear uma conversa do Advisor (Fase 3.x). Owner apenas. Marca title_custom=true
// para o auto-titulo do Haiku respeitar (nao sobrescrever). Titulo vazio e rejeitado
// (o cliente mantem o anterior).
const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TITLE = 120

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params
  if (!UUID_RE.test(sessionId)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) return NextResponse.json({ error: 'No advisor access' }, { status: 403 })

  let body: { title?: string }
  try { body = await req.json() as { title?: string } } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE) : ''
  if (!title) return NextResponse.json({ error: 'empty_title' }, { status: 400 })

  const service = createSupabaseService()
  const { data, error } = await service
    .from('advisor_sessions')
    .update({ title, title_custom: true })
    .eq('session_id', sessionId)
    .eq('user_id', user.id)              // dono apenas
    .select('session_id, title')
    .maybeSingle()
  if (error) {
    if (error.code === '42703' || error.code === '42P01') {
      return NextResponse.json({ error: 'migration_pending' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, session_id: data.session_id, title: data.title })
}
