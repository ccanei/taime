import { createSupabaseService } from '@/lib/supabase-server'
import {
  computeScores, completedDomains, overallStatus,
  type Answers, type AnswerOrigin, type Level, type DomainId,
} from '@/lib/assessment-model'

// Persistencia do Assessment (Parte A). Le/grava a medicao ATIVA do usuario e
// recomputa scores/completed/status a partir do modelo (fonte unica da regra de nota).
// Tudo via service key (server-only). Fail-safe: erro/tabela ausente devolve null.

export interface AssessmentRow {
  id:                string
  answers:           Answers
  scores:            Record<string, number>
  completed_domains: string[]
  status:            'in_progress' | 'complete'
  version:           number
  updated_at:        string
}

const SELECT = 'id, answers, scores, completed_domains, status, version, updated_at'

// available=false SOMENTE quando a tabela nao existe (migracao pendente): permite ao
// chat route manter a captura DORMENTE ate a migracao ser aplicada (as perguntas serem
// revisadas). Com a tabela presente, available=true mesmo sem linha ainda.
export interface LoadResult { available: boolean; row: AssessmentRow | null }

export async function loadActiveAssessment(userId: string): Promise<LoadResult> {
  try {
    const service = createSupabaseService()
    const { data, error } = await service
      .from('advisor_assessments')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
    if (error) {
      if (error.code === '42P01') return { available: false, row: null }   // tabela ausente
      console.error('[assessment] load error:', error.message)
      return { available: true, row: null }
    }
    return { available: true, row: (data as AssessmentRow) ?? null }
  } catch (e) {
    console.error('[assessment] load exception:', e instanceof Error ? e.message : e)
    return { available: false, row: null }
  }
}

function scoresMap(answers: Answers): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of computeScores(answers)) if (s.score !== null) out[s.domain] = s.score
  return out
}

// Aplica um lote de respostas (question_id -> nivel), cada uma com origem e timestamp,
// na medicao ativa (cria uma se nao existir). Recomputa derivados. Retorna a linha.
export async function saveAnswers(
  userId: string,
  updates: Array<{ questionId: string; level: Level; origin: AnswerOrigin }>,
): Promise<AssessmentRow | null> {
  if (updates.length === 0) return (await loadActiveAssessment(userId)).row
  try {
    const service = createSupabaseService()
    const { available, row: existing } = await loadActiveAssessment(userId)
    if (!available) return null                        // migracao pendente
    const now = new Date().toISOString()
    const answers: Answers = { ...(existing?.answers ?? {}) }
    for (const u of updates) answers[u.questionId] = { level: u.level, origin: u.origin, at: now }

    const payload = {
      answers,
      scores:            scoresMap(answers),
      completed_domains: completedDomains(answers) as DomainId[],
      status:            overallStatus(answers),
    }

    if (existing) {
      const { data, error } = await service
        .from('advisor_assessments')
        .update(payload)
        .eq('id', existing.id)
        .select(SELECT)
        .maybeSingle()
      if (error) { console.error('[assessment] update error:', error.message); return null }
      return (data as AssessmentRow) ?? null
    }
    const { data, error } = await service
      .from('advisor_assessments')
      .insert({ user_id: userId, ...payload, is_active: true, version: 1 })
      .select(SELECT)
      .maybeSingle()
    if (error) { if (error.code !== '42P01') console.error('[assessment] insert error:', error.message); return null }
    return (data as AssessmentRow) ?? null
  } catch (e) {
    console.error('[assessment] save exception:', e instanceof Error ? e.message : e)
    return null
  }
}
