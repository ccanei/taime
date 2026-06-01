export type Plan = 'free' | 'essential' | 'strategic'

export interface AccessLevel {
  canSeePreview:    boolean // título, score geral, 1 parágrafo do resumo
  canSeeFullReport: boolean // trends completas, framework, then/now/next
}

/**
 * Decide o nível de acesso a um relatório baseado no plano do usuário e no
 * período do relatório.
 *
 * Regras:
 *   - Sem plano / 'free'  → apenas preview
 *   - 'essential'         → completo se o relatório for de até 1 ano atrás
 *   - 'strategic'         → completo sempre (histórico total)
 */
export function getAccessLevel(
  plan: Plan | null,
  reportPeriod: string, // 'YYYY-MM-DD'
): AccessLevel {
  // Sem plano (visitante ou não logado): só preview
  if (!plan || plan === 'free') {
    return { canSeePreview: true, canSeeFullReport: false }
  }

  // Calcula se o relatório está dentro de 1 ano da data atual
  const reportDate = new Date(reportPeriod)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const withinOneYear = reportDate >= oneYearAgo

  if (plan === 'essential') {
    // Essential: completo apenas se dentro de 1 ano
    return { canSeePreview: true, canSeeFullReport: withinOneYear }
  }

  if (plan === 'strategic') {
    // Strategic: completo sempre (histórico total)
    return { canSeePreview: true, canSeeFullReport: true }
  }

  return { canSeePreview: true, canSeeFullReport: false }
}
