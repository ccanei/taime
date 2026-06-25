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
 * HOJE: 'essential' e 'strategic' tem acesso. Free/null fica bloqueado.
 *
 * QUOTA (futuro, frente do Stripe): o Essential tera limite de 60 mensagens/mes.
 * Esse teto NAO e verificado aqui (isto e so o gate de acesso binario). Quando o
 * Stripe trouxer o ciclo de cobranca, a contagem de mensagens do mes corrente
 * entra em uma checagem propria (ex.: hasAdvisorQuota(plan, usedThisCycle)) no
 * route.ts, ANTES de chamar o modelo. Strategic permanece ilimitado.
 */
export function hasAdvisorAccess(plan: Plan | null): boolean {
  return plan === 'essential' || plan === 'strategic'
}

// Piso permissivo: libera todo o arquivo. Ponto unico de verdade para o floor
// "sem limite" usado pela busca vetorial do Advisor.
export const ADVISOR_PERMISSIVE_FLOOR = '2000-01-01'

/**
 * Janela de contexto do Advisor em MESES, por plano (Opcao C: a janela de
 * contexto do Advisor = a janela de relatorios do plano).
 *
 *   strategic -> null  (sem limite, ve todo o arquivo)
 *   essential -> 36    (ultimos 3 anos)
 *   free/null -> 36    (free nao chega aqui; default restrito por seguranca)
 *
 * Este e o UNICO lugar onde o numero 36 vive. Nao espalhar pelo codigo.
 */
export function getAdvisorWindowMonths(plan: Plan | null): number | null {
  if (plan === 'strategic') return null
  return 36
}

/**
 * Deriva o period_floor (primeiro dia do mes de hoje menos a janela) a partir
 * do plano. Strategic (janela null) devolve o piso permissivo. Essential devolve
 * 'YYYY-MM-01' de (hoje - 36 meses). Em UTC para nao depender do fuso do server.
 */
export function getAdvisorPeriodFloor(plan: Plan | null, now: Date = new Date()): string {
  const months = getAdvisorWindowMonths(plan)
  if (months === null) return ADVISOR_PERMISSIVE_FLOOR
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1))
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}
