import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import { loadActiveAssessment, saveAnswers } from '@/lib/assessment-store'
import { computeScores, questionById, type Level } from '@/lib/assessment-model'

export const dynamic = 'force-dynamic'

// GET: medicao ativa do usuario (respostas + origem + scores por dominio).
// PUT: salva respostas do FORMULARIO (origin='form'). Ambos owner-only.
export async function GET() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) return NextResponse.json({ error: 'No advisor access' }, { status: 403 })

  const { available, row } = await loadActiveAssessment(user.id)
  const answers = row?.answers ?? {}
  return NextResponse.json({
    available,                                  // false = migracao pendente
    answers,                                   // { qid: { level, origin, at } }
    domains: computeScores(answers),           // DomainScore[] (score null quando incompleto)
    status:  row?.status ?? 'in_progress',
  })
}

export async function PUT(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) return NextResponse.json({ error: 'No advisor access' }, { status: 403 })

  let body: { answers?: Array<{ questionId?: string; level?: number }> }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const updates = (body.answers ?? [])
    .filter(a => typeof a.questionId === 'string' && questionById(a.questionId) && (a.level === 1 || a.level === 2 || a.level === 3 || a.level === 4))
    .map(a => ({ questionId: a.questionId as string, level: a.level as Level, origin: 'form' as const }))
  if (updates.length === 0) return NextResponse.json({ error: 'no_valid_answers' }, { status: 400 })

  const row = await saveAnswers(user.id, updates)
  if (!row) return NextResponse.json({ error: 'save_failed', migration_pending: true }, { status: 503 })
  return NextResponse.json({ ok: true, answers: row.answers, domains: computeScores(row.answers), status: row.status })
}
