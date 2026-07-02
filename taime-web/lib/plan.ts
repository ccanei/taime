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
 * Free, Essential e Strategic TEM acesso. O que muda entre eles e o LIMITE de
 * mensagens (ver getMessageLimit / getWindowType), aplicado no route.ts via
 * checkAndConsumeMessage. Null e tratado como free.
 */
export function hasAdvisorAccess(plan: Plan | null): boolean {
  return plan === 'free' || plan === 'essential' || plan === 'strategic' || plan === null
}

export type AdvisorWindowType = 'lifetime' | 'rolling_30d' | null

/**
 * Limite de mensagens do Advisor por plano.
 *   free      -> 10   (vitalicio, nunca reseta)
 *   essential -> 100  (por janela de 30 dias)
 *   strategic -> null (ilimitado)
 * Null (sem subscription) e tratado como free.
 */
export function getMessageLimit(plan: Plan | null): number | null {
  if (plan === 'strategic') return null
  if (plan === 'essential') return 100
  return 10
}

/**
 * Tipo de janela do limite por plano.
 *   free      -> 'lifetime'    (contagem vitalicia)
 *   essential -> 'rolling_30d' (reseta 30 dias apos a 1a mensagem da janela)
 *   strategic -> null          (sem limite)
 */
export function getWindowType(plan: Plan | null): AdvisorWindowType {
  if (plan === 'strategic') return null
  if (plan === 'essential') return 'rolling_30d'
  return 'lifetime'
}

// Piso permissivo: libera todo o arquivo. Ponto unico de verdade para o floor
// "sem limite" usado pela busca vetorial do Advisor.
export const ADVISOR_PERMISSIVE_FLOOR = '2000-01-01'

// Teto permissivo (v4.6): "sem limite superior" para a busca por intervalo de
// periodo. Casa com o DEFAULT da funcao match_trend_chunks.
export const ADVISOR_PERMISSIVE_CEILING = '9999-12-01'

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
