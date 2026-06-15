/**
 * Rede de segurança DETERMINÍSTICA para o Executive Advisor (v4.2).
 *
 * IMPORTANTE: esta heurística de regex NÃO é o mecanismo principal de grounding.
 * O mecanismo principal é o system prompt (ver RULES_BLOCK em
 * app/api/advisor/chat/route.ts), que instrui o modelo a falar de ferramentas e
 * fornecedores por CATEGORIA + critérios de escolha, nomeando um produto
 * específico apenas quando um relatório TAIME carregado neste turno o cita.
 *
 * Esta função detecta três classes de violação:
 *   1. ATRIBUIÇÃO de dado/conclusão a fonte nomeada ("segundo o Gartner").
 *   2. PREÇO/PRAZO sem backing (preço em dólar/real ou "free tier" sem o mesmo
 *      número aparecer no contexto dos relatórios carregados).
 *   3. NOME DE FERRAMENTA fora do contexto TAIME (tool name que NÃO consta nos
 *      relatórios carregados neste turno).
 *
 * Falsos negativos são esperados (listas finitas); por isso é rede, não trava.
 * Uma única retentativa corretiva é disparada quando qualquer violação aparece.
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

// ─── Tools / vendors conhecidos (v4.2) ────────────────────────────────────────
// Lista deliberadamente conservadora. Cobre produtos populares em estratégia
// tecnológica que o modelo tende a sacar do conhecimento geral, em vez de citar
// algo que esteja nos relatórios carregados. Expansível.
export const KNOWN_TOOLS: string[] = [
  // Vector DBs / RAG
  'Pinecone', 'Weaviate', 'Milvus', 'Chroma', 'Qdrant',
  // Workflow / orquestração
  'n8n', 'Airflow', 'Prefect', 'Zapier', 'Make',
  // Data quality / observabilidade de dados
  'Great Expectations', 'Monte Carlo', 'Datadog', 'Datafold',
  // Data warehouse / lakehouse
  'Snowflake', 'Databricks', 'BigQuery', 'Redshift',
  // ELT / ingestão / transformação
  'Fivetran', 'Airbyte', 'Stitch', 'dbt',
  // BI
  'Tableau', 'Looker', 'Power BI', 'Metabase', 'Superset',
  // LLM platforms / model providers
  'OpenAI', 'Anthropic', 'Cohere', 'Mistral', 'Hugging Face',
  // CRM / pagamentos / ops
  'Salesforce', 'HubSpot', 'Stripe', 'Twilio', 'SendGrid',
  // Stores / streams
  'MongoDB', 'PostgreSQL', 'Redis', 'Kafka', 'Elasticsearch',
  // Produto / analytics
  'Notion', 'Slack', 'Mixpanel', 'Amplitude', 'Segment',
]

/**
 * Detecta menções a preços / prazos sem backing nos relatórios carregados.
 * Heurística: encontra expressões de preço/tier no texto e flagueia as que
 * NÃO aparecem literalmente no contexto dos relatórios.
 */
export function detectPricingViolations(text: string, reportsContext: string): string[] {
  const ctx = reportsContext.toLowerCase()
  const found = new Set<string>()

  // Preços monetários: $20, US$20, R$ 20, $20/month, $20/mês, 20 dólares
  const priceRegex = /(?:us\$|r\$|\$)\s?\d+(?:[.,]\d+)?(?:\s?[/-]\s?(?:month|months|m[êe]s|year|ano))?|\b\d+(?:[.,]\d+)?\s+(?:d[oó]lares|reais|usd|brl)\b/gi
  for (const m of text.match(priceRegex) ?? []) {
    const norm = m.trim().toLowerCase()
    if (!ctx.includes(norm)) found.add(m.trim())
  }

  // Free tier / tier gratuito
  const tierRegex = /\b(?:free tier|tier free|tier gratuit[oa]|tier gr[áa]tis|gratuit[oa] tier)\b/gi
  for (const m of text.match(tierRegex) ?? []) {
    if (!ctx.includes(m.toLowerCase())) found.add(m.trim())
  }

  // Prazos de implementação concretos: "em 3 meses", "in 4 weeks", "6-month rollout"
  const timelineRegex = /\b(?:em|in|dentro de|within)\s+\d+\s+(?:semanas?|weeks?|meses|months?|dias?|days?)\b|\b\d+[- ]?(?:month|week|day)s?\s+(?:rollout|implementation|deployment|implanta[çc][ãa]o)\b/gi
  for (const m of text.match(timelineRegex) ?? []) {
    if (!ctx.includes(m.toLowerCase())) found.add(m.trim())
  }

  return [...found]
}

/**
 * Detecta nomes de ferramentas/produtos conhecidos no texto que NÃO aparecem
 * no contexto dos relatórios carregados. Match por word-boundary, case-insensitive.
 */
export function detectUnsupportedTools(text: string, reportsContext: string): string[] {
  const ctx = reportsContext.toLowerCase()
  const found = new Set<string>()
  for (const name of KNOWN_TOOLS) {
    const n = escapeRegex(name)
    const re = new RegExp(`\\b${n}\\b`, 'i')
    if (re.test(text) && !ctx.toLowerCase().includes(name.toLowerCase())) {
      found.add(name)
    }
  }
  return [...found]
}

export type GroundingViolation =
  | { type: 'attribution';          detail: string }
  | { type: 'pricing_or_timeline';  detail: string }
  | { type: 'tool_outside_context'; detail: string }

export interface GroundingCheck {
  flagged:    boolean
  violations: GroundingViolation[]
}

/**
 * Roda todas as checagens determinísticas de grounding contra um texto de
 * resposta, usando o contexto dos relatórios carregados como referência.
 */
export function runGroundingChecks(text: string, reportsContext: string): GroundingCheck {
  const violations: GroundingViolation[] = []

  const attr = detectAttribution(text)
  if (attr.flagged) {
    violations.push({ type: 'attribution', detail: attr.matches.join(', ') })
  }

  const pricing = detectPricingViolations(text, reportsContext)
  if (pricing.length > 0) {
    violations.push({ type: 'pricing_or_timeline', detail: pricing.join('; ') })
  }

  const tools = detectUnsupportedTools(text, reportsContext)
  if (tools.length > 0) {
    violations.push({ type: 'tool_outside_context', detail: tools.join(', ') })
  }

  return { flagged: violations.length > 0, violations }
}
