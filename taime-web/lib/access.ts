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
 * A janela TEMPORAL foi eliminada: todos os planos acessam o arquivo COMPLETO
 * (desde 2015). O que muda:
 *   - Visitante  → apenas preview de qualquer relatório.
 *   - Free       → arquivo completo, limitado por COTA: 2 reports por janela de
 *                  30 dias (decidido atomicamente pela funcao SQL free_unlock_report;
 *                  o resultado chega aqui em `freeUnlockAllowed`). Sem cota → preview.
 *   - Essential  → arquivo completo, sem limite de reports nem de data.
 *   - Strategic  → tudo, sem limites.
 *
 * `too_old_for_plan`, `strategic_only` e `out_of_range` seguem no tipo por
 * compatibilidade (a UI ainda os mapeia), mas nao sao mais retornados.
 */
export function getAccessLevel(params: {
  plan:               Plan | null
  isLoggedIn:         boolean
  freeUnlockAllowed?: boolean // free: a cota permitiu ver este report completo (via free_unlock_report)
}): AccessLevel {
  const { plan, isLoggedIn, freeUnlockAllowed = false } = params

  // Visitante (não logado): preview de qualquer relatório.
  if (!isLoggedIn) {
    return { canSeePreview: true, canSeeFullReport: false, reason: 'visitor' }
  }

  // ── STRATEGIC e ESSENTIAL: acesso completo a todo o arquivo, sem limite de data.
  if (plan === 'strategic' || plan === 'essential') {
    return { canSeePreview: true, canSeeFullReport: true, reason: 'full' }
  }

  // ── FREE (ou plano nulo/'free'): arquivo completo, limitado pela cota de reports.
  if (freeUnlockAllowed) {
    return { canSeePreview: true, canSeeFullReport: true, reason: 'full' }
  }
  // Cota esgotada: só preview + CTA.
  return { canSeePreview: true, canSeeFullReport: false, reason: 'free_limit_reached' }
}
