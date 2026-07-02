import { createSupabaseService } from '@/lib/supabase-server'
import { getMessageLimit, getWindowType, type Plan } from '@/lib/plan'

export interface ConsumeResult {
  allowed: boolean
  used:    number
  limit:   number | null
  plan:    Plan
  reason?: 'limit_reached' | 'infra_unavailable'
}

// Consome uma mensagem do Advisor de forma ATOMICA via a RPC
// advisor_consume_message (Postgres serializa a concorrencia com FOR UPDATE, entao
// dois pedidos simultaneos nunca gastam a mesma vaga). Strategic (limite null)
// passa direto e NAO conta. Fail-open se a infra ainda nao existe (tabela/funcao
// ausente): permite sem contar, para nao quebrar o Advisor antes de a migration
// add-advisor-usage.sql ser aplicada.
export async function checkAndConsumeMessage(
  userId: string,
  plan: Plan | null,
): Promise<ConsumeResult> {
  const effPlan: Plan = plan ?? 'free'
  const limit      = getMessageLimit(effPlan)
  const windowType = getWindowType(effPlan)

  // Strategic (ou qualquer plano sem limite): sempre permitido, sem contar.
  if (limit === null || windowType === null) {
    return { allowed: true, used: 0, limit: null, plan: effPlan }
  }

  const service = createSupabaseService()
  try {
    const { data, error } = await service.rpc('advisor_consume_message', {
      p_user_id: userId,
      p_plan:    effPlan,
      p_limit:   limit,
      p_rolling: windowType === 'rolling_30d',
    })
    if (error) {
      console.warn('[advisorUsage] rpc error, fail-open:', error.message)
      return { allowed: true, used: 0, limit, plan: effPlan, reason: 'infra_unavailable' }
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; used: number; msg_limit: number }
      | undefined
    if (!row) {
      return { allowed: true, used: 0, limit, plan: effPlan, reason: 'infra_unavailable' }
    }
    return {
      allowed: !!row.allowed,
      used:    typeof row.used === 'number' ? row.used : 0,
      limit,
      plan:    effPlan,
      reason:  row.allowed ? undefined : 'limit_reached',
    }
  } catch (e) {
    console.warn('[advisorUsage] exception, fail-open:', e)
    return { allowed: true, used: 0, limit, plan: effPlan, reason: 'infra_unavailable' }
  }
}

export interface UsageStatus {
  used:       number
  limit:      number | null
  plan:       Plan
  windowType: 'lifetime' | 'rolling_30d' | null
}

// Leitura do contador SEM consumir (para exibir "X de Y" na UI). Aplica a logica
// de reset do Essential na leitura: se a janela expirou, mostra 0 (o reset real
// acontece na proxima mensagem, dentro da RPC). Nunca lanca.
export async function getUsageStatus(userId: string, plan: Plan | null): Promise<UsageStatus> {
  const effPlan: Plan = plan ?? 'free'
  const limit      = getMessageLimit(effPlan)
  const windowType = getWindowType(effPlan)
  if (limit === null || windowType === null) {
    return { used: 0, limit: null, plan: effPlan, windowType: null }
  }
  const service = createSupabaseService()
  try {
    const { data } = await service
      .from('advisor_usage')
      .select('messages_used, window_start')
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return { used: 0, limit, plan: effPlan, windowType }
    const row = data as { messages_used: number; window_start: string | null }
    let used = row.messages_used ?? 0
    if (windowType === 'rolling_30d' && row.window_start) {
      const ageMs = Date.now() - new Date(row.window_start).getTime()
      if (ageMs > 30 * 24 * 60 * 60 * 1000) used = 0
    }
    return { used, limit, plan: effPlan, windowType }
  } catch {
    return { used: 0, limit, plan: effPlan, windowType }
  }
}
