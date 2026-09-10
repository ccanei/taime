import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import { stripEmDash } from '@/lib/strip-markdown'
import { isFactCategory, MAX_FACT_LENGTH, type CompanyFact } from '@/lib/company-facts'

// CRUD dos fatos livres da empresa (advisor_company_facts). So usuario logado com
// acesso ao Advisor, gerenciando os PROPRIOS fatos (RLS + filtro por user_id).
// Fora do caminho critico do chat: usado pelo painel "Sua empresa" e pela pagina de
// perfil. Tabela ausente (migration nao aplicada) degrada com elegancia (nunca 500).

const SELECT = 'id, category, fact, source, confidence, is_active, created_at'
const TABLE_MISSING = /relation .*advisor_company_facts.* does not exist|42P01/i

async function authed() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) return { error: NextResponse.json({ error: 'not available' }, { status: 403 }) }
  return { supabase, userId: user.id }
}

// GET: lista os fatos do usuario (ativos e inativos), agrupaveis por categoria no cliente.
export async function GET() {
  const a = await authed()
  if ('error' in a) return a.error
  const { data, error } = await a.supabase
    .from('advisor_company_facts')
    .select(SELECT)
    .eq('user_id', a.userId)
    .order('category', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    if (TABLE_MISSING.test(`${error.message} ${error.code}`)) return NextResponse.json({ facts: [] })
    console.error('[advisor-facts] GET failed:', error.message)
    return NextResponse.json({ facts: [] })
  }
  return NextResponse.json({ facts: (data ?? []) as CompanyFact[] })
}

// POST: adiciona um fato MANUAL (source 'manual', confidence 'high').
export async function POST(req: NextRequest) {
  const a = await authed()
  if ('error' in a) return a.error
  let body: { category?: unknown; fact?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  if (!isFactCategory(body.category)) return NextResponse.json({ error: 'invalid category' }, { status: 400 })
  const fact = typeof body.fact === 'string' ? stripEmDash(body.fact.trim()).slice(0, MAX_FACT_LENGTH) : ''
  if (fact.length < 2) return NextResponse.json({ error: 'empty fact' }, { status: 400 })

  const { data, error } = await a.supabase
    .from('advisor_company_facts')
    .insert({ user_id: a.userId, category: body.category, fact, source: 'manual', confidence: 'high', is_active: true })
    .select(SELECT)
    .single()
  if (error) {
    if (TABLE_MISSING.test(`${error.message} ${error.code}`)) {
      return NextResponse.json({ error: 'facts table not yet provisioned' }, { status: 503 })
    }
    console.error('[advisor-facts] POST failed:', error.message)
    return NextResponse.json({ error: 'insert failed' }, { status: 500 })
  }
  return NextResponse.json({ fact: data as CompanyFact })
}

// PATCH: ativa/desativa um fato do proprio usuario (is_active toggle).
export async function PATCH(req: NextRequest) {
  const a = await authed()
  if ('error' in a) return a.error
  let body: { id?: unknown; is_active?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  if (typeof body.id !== 'string' || typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'id and is_active required' }, { status: 400 })
  }
  const { error } = await a.supabase
    .from('advisor_company_facts')
    .update({ is_active: body.is_active })
    .eq('id', body.id)
    .eq('user_id', a.userId)
  if (error) {
    console.error('[advisor-facts] PATCH failed:', error.message)
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
