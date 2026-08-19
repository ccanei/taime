import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess, getSavedPlanLimit } from '@/lib/plan'
import { normalizeOffer } from '@/lib/advisor-plan-extract'

// Rota de PERSISTENCIA do roadmap do Advisor como plano salvo do cliente (Fase 2.1).
// So grava mediante confirmacao explicita do cliente (o front chama isto no clique
// "Salvar como meu plano"). Nada e persistido antes disso.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ActivePlanRow { id: string; title: string | null; theme: string | null }

// GET: lista os planos do usuario (ativos por padrao). Base para a UI de 2.2 e para
// o front mostrar contagem/limite. Tabela ausente -> vazio (migracao pendente).
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) {
    return NextResponse.json({ error: 'No advisor access' }, { status: 403 })
  }

  const includeArchived = req.nextUrl.searchParams.get('all') === '1'
  const service = createSupabaseService()
  let query = service
    .from('advisor_plans')
    .select('id, title, theme, phases, status, session_id, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
  if (!includeArchived) query = query.eq('status', 'active')

  const { data, error } = await query.limit(100)
  if (error) {
    if (error.code === '42P01' || error.message?.includes('relation')) {
      return NextResponse.json({ plans: [], migration_pending: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const active = (data ?? []).filter(p => p.status === 'active').length
  return NextResponse.json({
    plans: data ?? [],
    plan: plan ?? 'free',
    limit: getSavedPlanLimit(plan),
    active_count: active,
  })
}

// POST: salva o roadmap extraido como plano. mode:
//   undefined -> se ja houver plano ativo do MESMO tema, responde 409 (o front
//                pergunta substituir vs criar novo).
//   'replace' -> arquiva o(s) plano(s) ativo(s) do mesmo tema e cria o novo.
//   'new'     -> ignora o conflito de tema e cria (sujeito ao limite).
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) {
    return NextResponse.json({ error: 'No advisor access' }, { status: 403 })
  }

  let body: {
    sessionId?: string; title?: string; theme?: string
    phases?: unknown; sourceMessageId?: string; mode?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const sessionId = typeof body.sessionId === 'string' && UUID_RE.test(body.sessionId) ? body.sessionId : null
  if (!sessionId) return NextResponse.json({ error: 'invalid_session' }, { status: 400 })

  // Revalida a estrutura no servidor (o cliente nao e fonte de verdade do formato).
  const offer = normalizeOffer({ roadmap: true, title: body.title, theme: body.theme, phases: body.phases })
  if (!offer) return NextResponse.json({ error: 'invalid_offer' }, { status: 400 })

  const mode = body.mode === 'replace' || body.mode === 'new' ? body.mode : undefined
  const sourceMessageId = typeof body.sourceMessageId === 'string' && UUID_RE.test(body.sourceMessageId)
    ? body.sourceMessageId : null

  const service = createSupabaseService()
  const limit   = getSavedPlanLimit(plan)

  // Planos ativos atuais (para conflito de tema e limite).
  const { data: activesRaw, error: listErr } = await service
    .from('advisor_plans')
    .select('id, title, theme')
    .eq('user_id', user.id)
    .eq('status', 'active')
  if (listErr) {
    if (listErr.code === '42P01' || listErr.message?.includes('relation')) {
      return NextResponse.json({ error: 'migration_pending', migration_pending: true }, { status: 503 })
    }
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const actives   = (activesRaw ?? []) as ActivePlanRow[]
  const themeKey  = offer.theme.trim().toLowerCase()
  const sameTheme = themeKey ? actives.filter(p => (p.theme ?? '').trim().toLowerCase() === themeKey) : []

  // Conflito de tema nao resolvido -> pergunta ao cliente (substituir vs criar novo).
  if (sameTheme.length > 0 && !mode) {
    return NextResponse.json(
      { conflict: 'same_theme', existing: { id: sameTheme[0].id, title: sameTheme[0].title } },
      { status: 409 },
    )
  }

  let effectiveActive = actives.length
  if (mode === 'replace' && sameTheme.length > 0) {
    const ids = sameTheme.map(p => p.id)
    const { error: archErr } = await service
      .from('advisor_plans')
      .update({ status: 'archived' })
      .in('id', ids)
      .eq('user_id', user.id)
    if (archErr) return NextResponse.json({ error: archErr.message }, { status: 500 })
    effectiveActive -= sameTheme.length   // liberou espaco no limite
  }

  // Gate de plano (mesma mecanica que o Stripe vai controlar). Limite null = ilimitado.
  if (limit !== null && effectiveActive >= limit) {
    return NextResponse.json(
      { error: 'limit_reached', limit, active_count: effectiveActive, plan: plan ?? 'free' },
      { status: 403 },
    )
  }

  const { data: inserted, error: insErr } = await service
    .from('advisor_plans')
    .insert({
      user_id:           user.id,
      session_id:        sessionId,
      title:             offer.title,
      theme:             offer.theme || null,
      phases:            offer.phases,
      status:            'active',
      source_message_id: sourceMessageId,
    })
    .select('id, title, theme, status')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({
    ok:           true,
    id:           inserted.id,
    plan:         plan ?? 'free',
    active_count: effectiveActive + 1,
    replaced:     mode === 'replace' && sameTheme.length > 0,
  })
}
