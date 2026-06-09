/**
 * Busca client-side com normalização de acentos, expansão de sinônimos
 * e scoring ponderado por campo. Usado pelo filtro instantâneo do
 * Dashboard e da HomeSearch (a busca semântica via /api/search é separada).
 */

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const SYNONYMS: Record<string, string[]> = {
  'ia':        ['inteligencia artificial', 'artificial intelligence', 'agentic', 'agentica', 'agente', 'agentes', 'machine learning', 'ml', 'llm'],
  'agente':    ['agentic', 'agentica', 'ia', 'ai'],
  'agentes':   ['agentic', 'agentica', 'agents', 'ia agentica'],
  'nuvem':     ['cloud', 'hibrida', 'hybrid'],
  'cloud':     ['nuvem', 'infraestrutura', 'infrastructure'],
  'seguranca': ['cybersecurity', 'ciberseguranca', 'security', 'ameaca', 'threat'],
  'dados':     ['data', 'soberania', 'sovereignty', 'semanticos'],
  'fintech':   ['financeiro', 'finance', 'stablecoin', 'capital'],
  'automacao': ['automation', 'agentes', 'workflows'],
}

export function expandQuery(query: string): string[] {
  const norm = normalize(query)
  const terms = [norm]
  for (const [key, synonyms] of Object.entries(SYNONYMS)) {
    if (norm.includes(key)) terms.push(...synonyms)
    if (synonyms.some(s => norm.includes(s))) terms.push(key, ...synonyms)
  }
  return [...new Set(terms)]
}

export const STOPWORDS = new Set([
  'de','do','da','dos','das','em','no','na','nos','nas',
  'e','o','a','os','as','um','uma','que','para','com','se',
  'the','of','in','and','to','an','for','with','is','are',
])

export interface SearchField {
  text:   string  // já normalizado pelo caller (use normalize())
  weight: number  // peso desse campo no score final
}

/**
 * Recebe uma lista de campos pré-normalizados (com pesos) e uma query;
 * devolve um score numérico. 0 = não match suficiente.
 *
 * O caller monta os campos a partir de qualquer shape (Report, Trend,
 * etc.) — assim a função fica desacoplada do schema.
 */
export function scoreText(fields: SearchField[], query: string): number {
  if (!query.trim()) return 1
  const raw   = expandQuery(query)
  // Aceita termos de 2+ caracteres (siglas como "IA", "ML", "AI") e
  // exclui stopwords + ruído de 1 char. Antes era `> 2`, o que matava
  // queries curtas e relevantes.
  const terms = raw.filter(t => t.length >= 2 && !STOPWORDS.has(t))
  if (terms.length === 0) return 1

  let score = 0
  for (const term of terms) {
    for (const field of fields) {
      if (field.text.includes(term)) score += field.weight
    }
  }

  // Ranquear, não filtrar. Qualquer match em qualquer campo (peso 2 OU 3)
  // já basta para o item aparecer; a ordenação decrescente por score
  // resolve a relevância. Removido o limiar antigo que exigia match em
  // título (peso 3) e descartava hits apenas no executive_snapshot.
  return score
}

/**
 * Atalho para o caso comum no Dashboard: Report com título e summary
 * em PT-BR / EN. Mantém a assinatura usada antes da extração.
 */
export interface ReportLike {
  title_pt_br?:             string | null
  title_en?:                string | null
  executive_summary_pt_br?: string | null
  executive_summary_en?:    string | null
}

export function scoreMatchReport(report: ReportLike, query: string): number {
  return scoreText(
    [
      { text: normalize((report.title_pt_br ?? '') + ' ' + (report.title_en ?? '')), weight: 3 },
      { text: normalize((report.executive_summary_pt_br ?? '') + ' ' + (report.executive_summary_en ?? '')), weight: 2 },
    ],
    query,
  )
}
