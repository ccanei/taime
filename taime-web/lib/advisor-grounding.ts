/**
 * Rede de segurança DETERMINÍSTICA para o Executive Advisor.
 *
 * IMPORTANTE: esta heurística de regex NÃO é o mecanismo principal de grounding.
 * O mecanismo principal é o system prompt (ver buildSystemPrompt em
 * app/api/advisor/chat/route.ts), que instrui o modelo a nunca atribuir dados a
 * fontes por nome. Esta função apenas pega o caso residual em que o modelo
 * desobedece, para disparar UMA retentativa corretiva. Falsos negativos são
 * esperados (a lista de nomes é finita); por isso é rede, não trava.
 *
 * Recomendar um produto/ferramenta por nome ("use o Datadog") é PERMITIDO
 * (prescrição). O que detectamos é ATRIBUIÇÃO ("segundo o Datadog", "o Datadog
 * documentou X"), ou seja, afirmar que uma fonte nomeada produziu um dado ou conclusão.
 */

// Lista de fontes conhecidas. Manter aqui para expansão fácil.
export const KNOWN_SOURCE_NAMES: string[] = [
  'Gartner',
  'McKinsey',
  'Forrester',
  'IDC',
  'CB Insights',
  'Datadog',
  'Deloitte',
  'Accenture',
  'BCG',
  'Bain',
  'Statista',
  'Forbes',
  'Bloomberg',
  'Reuters',
  'TechCrunch',
  'PwC',
  'KPMG',
  'EY',
  'Nielsen',
  'IDG',
  'Pitchbook',
  'Crunchbase',
  'Stack Overflow',
  'GitHub',
  'Gartner Group',
  'The Information',
  'Wired',
  'MIT Technology Review',
  'Harvard Business Review',
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface AttributionCheck {
  flagged: boolean
  matches: string[] // nomes detectados em contexto de atribuição
}

/**
 * Detecta atribuição de dado/conclusão a uma fonte nomeada.
 * Heurística: nome conhecido precedido por marcador de atribuição
 * ("segundo X", "according to X", "estudo da X") OU seguido de verbo de
 * reporte ("X documentou", "X estima", "X reports").
 */
export function detectAttribution(text: string): AttributionCheck {
  const matches = new Set<string>()

  const beforeMarker =
    '(?:segundo|conforme|de acordo com|according to|per|study by|research by|' +
    'estudo d[aoe]s?|pesquisa d[aoe]s?|relat[óo]rio d[aoe]s?|dados d[aoe]s?|n[uú]meros d[aoe]s?)'
  const afterVerb =
    '(?:documentou|documenta|documentaram|reporta|reportou|reportaram|aponta|apontou|' +
    'apontaram|estima|estimou|estimaram|mostrou|mostra|revelou|revela|publicou|' +
    'reports?|documented?|estimates?|found|showed|shows|published|claims?)'

  for (const name of KNOWN_SOURCE_NAMES) {
    const n = escapeRegex(name)
    const before = new RegExp(`${beforeMarker}\\s+(?:a |o |as |os |the )?${n}\\b`, 'i')
    const after  = new RegExp(`\\b${n}\\s+${afterVerb}\\b`, 'i')
    if (before.test(text) || after.test(text)) {
      matches.add(name)
    }
  }

  return { flagged: matches.size > 0, matches: [...matches] }
}
