export type Plan = 'free' | 'essential' | 'strategic'

export type AccessReason =
  | 'visitor'              // não logado
  | 'full'                 // pode ver o relatório inteiro
  | 'preview_only'         // somente preview (sem motivo específico)
  | 'free_limit_reached'   // free: já desbloqueou 2 nos últimos 30 dias
  | 'too_old_for_plan'     // (desativado) faixa de preview do Essential, até o arquivo histórico ser populado
  | 'strategic_only'       // essential: relatório com mais de 5 anos (60 meses)
  | 'out_of_range'         // free: relatório com mais de 1 ano

export interface AccessLevel {
  canSeePreview:    boolean // título, score geral, 1 parágrafo do resumo
  canSeeFullReport: boolean // trends completas, framework, then/now/next
  reason:           AccessReason
}

/**
 * Decide o nível de acesso a um relatório.
 *
 * Regras:
 *   - Visitante           → apenas preview de qualquer relatório
 *   - Free                → 2 relatórios completos por janela de 30 dias rolling.
 *                           Cada relatório desbloqueado fica acessível por 30 dias
 *                           a partir do unlock. Previews disponíveis até 1 ano.
 *                           Relatórios > 1 ano: out_of_range (nem preview).
 *   - Essential           → completo até 5 anos (60 meses); acima de 5 anos →
 *                           bloqueado, upgrade para Strategic. Faixa de preview
 *                           desativada temporariamente até o arquivo histórico
 *                           ser populado.
 *   - Strategic           → tudo, sem limite de data (arquivo completo desde 2000).
 */
export function getAccessLevel(params: {
  plan:              Plan | null
  reportPeriod:      string  // 'YYYY-MM-DD'
  isLoggedIn:        boolean
  freeUnlockCount?:  number  // desbloqueios ativos nos últimos 30 dias (só free)
  alreadyUnlocked?:  boolean // este relatório já está desbloqueado e dentro dos 30 dias
}): AccessLevel {
  const {
    plan,
    reportPeriod,
    isLoggedIn,
    freeUnlockCount = 0,
    alreadyUnlocked = false,
  } = params

  // Visitante (não logado): preview de qualquer relatório
  if (!isLoggedIn) {
    return { canSeePreview: true, canSeeFullReport: false, reason: 'visitor' }
  }

  // Idade do relatório em anos (a partir da data atual)
  const reportDate = new Date(reportPeriod)
  const yearsDiff  = (Date.now() - reportDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)

  // ── STRATEGIC: acesso completo a tudo
  if (plan === 'strategic') {
    return { canSeePreview: true, canSeeFullReport: true, reason: 'full' }
  }

  // ── ESSENTIAL: completo até 5 anos (60 meses); acima disso, bloqueado com
  // upgrade para Strategic. A faixa intermediária de preview (too_old_for_plan)
  // está desativada por enquanto, até o arquivo histórico ser populado.
  if (plan === 'essential') {
    if (yearsDiff <= 5) {
      return { canSeePreview: true, canSeeFullReport: true, reason: 'full' }
    }
    return { canSeePreview: false, canSeeFullReport: false, reason: 'strategic_only' }
  }

  // ── FREE (ou plano nulo/'free')
  // Fora do range (> 1 ano): nem preview
  if (yearsDiff > 1) {
    return { canSeePreview: false, canSeeFullReport: false, reason: 'out_of_range' }
  }
  // Já desbloqueado e dentro dos 30 dias: completo, não consome novo slot
  if (alreadyUnlocked) {
    return { canSeePreview: true, canSeeFullReport: true, reason: 'full' }
  }
  // Ainda tem slot disponível (< 2 ativos): completo (consumirá um slot)
  if (freeUnlockCount < 2) {
    return { canSeePreview: true, canSeeFullReport: true, reason: 'full' }
  }
  // Limite atingido (2 ativos e este não está entre eles): só preview
  return { canSeePreview: true, canSeeFullReport: false, reason: 'free_limit_reached' }
}
