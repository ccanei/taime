import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess, getSavedPlanLimit } from '@/lib/plan'
import { normalizePhases, type PlanStatus } from '@/lib/advisor-plan'

// Gestao de UM plano salvo (Fase 2.2): mudar status (arquivar/concluir/reativar),
// atualizar as fases (toggle de status das acoes) e excluir. Sempre restrito ao dono
// (service key + filtro user_id; RLS tambem cobre via chave anon, mas a service key
// e o padrao server-side do projeto). Fail-safe e mensagens claras.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_STATUS: PlanStatus[] = ['active', 'archived', 'completed']

async function authUser() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) return { error: NextResponse.json({ error: 'No advisor access' }, { status: 403 }) }
  return { user, plan }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const a = await authUser()
  if ('error' in a) return a.error
  const { user, plan } = a

  let body: { status?: string; phases?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(body.status as PlanStatus)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
    }
    patch.status = body.status
  }
  if (body.phases !== undefined) {
    const phases = normalizePhases(body.phases)
    if (phases.length === 0) return NextResponse.json({ error: 'invalid_phases' }, { status: 400 })
    patch.phases = phases
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })
  }

  const service = createSupabaseService()

  // Reativar (-> active) respeita o gate de planos salvos (mesmo limite do POST).
  if (patch.status === 'active') {
    const limit = getSavedPlanLimit(plan)
    if (limit !== null) {
      const { count } = await service
        .from('advisor_plans')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'active')
        .neq('id', id)
      if ((count ?? 0) >= limit) {
        return NextResponse.json({ error: 'limit_reached', limit }, { status: 403 })
      }
    }
  }
  const { data, error } = await service
    .from('advisor_plans')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)               // dono apenas
    .select('id, title, theme, phases, status, session_id, created_at, updated_at')
    .maybeSingle()
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ error: 'migration_pending' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, plan: data })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  const a = await authUser()
  if ('error' in a) return a.error
  const { user } = a

  const service = createSupabaseService()
  const { data, error } = await service
    .from('advisor_plans')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ error: 'migration_pending' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, id: data.id })
}
