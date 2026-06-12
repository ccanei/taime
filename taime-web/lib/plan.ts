import { createSupabaseService } from '@/lib/supabase-server'
import type { Plan } from '@/lib/access'

export type { Plan }

/**
 * Helper centralizado de planos.
 *
 * Todo gate de plano do app deve passar por aqui (acesso ao Advisor agora;
 * limites de mensagens e janela de histórico no futuro). Lê a subscription
 * ativa via service key (server-side only).
 *
 * Conceito de default: ausência de subscription ativa = tratar como 'free'.
 * Retornamos null para que o chamador decida; null e 'free' têm os mesmos
 * privilégios hoje.
 */
export async function getUserPlan(userId: string): Promise<Plan | null> {
  try {
    const service = createSupabaseService()
    const { data } = await service
      .from('subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const p = data?.plan as string | undefined
    if (p === 'free' || p === 'essential' || p === 'strategic') return p
    return null
  } catch (e) {
    // tabela ausente ou sem registro → null (tratado como 'free')
    console.error('[getUserPlan] error:', e)
    return null
  }
}

/**
 * Decide se o plano tem acesso ao Executive Advisor.
 *
 * HOJE: apenas 'strategic' tem acesso. Essential terá acesso com limite de
 * mensagens em fase futura; ajustar aqui quando os limites existirem.
 */
export function hasAdvisorAccess(plan: Plan | null): boolean {
  return plan === 'strategic'
}
