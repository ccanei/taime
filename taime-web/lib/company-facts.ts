// Config compartilhada da memoria livre da empresa (advisor_company_facts). Pura e
// client-safe: usada pela rota de captura (validacao da saida do Haiku), pela API
// de CRUD e pela UI (rotulos e ordem por categoria). Ponto unico de verdade.

export const FACT_CATEGORIES = [
  'technology', 'system', 'project', 'priority', 'constraint', 'decision', 'budget', 'other',
] as const
export type FactCategory = typeof FACT_CATEGORIES[number]

export function isFactCategory(v: unknown): v is FactCategory {
  return typeof v === 'string' && (FACT_CATEGORIES as readonly string[]).includes(v)
}

export type FactSource = 'conversation' | 'manual'
export type FactConfidence = 'high' | 'medium'

export interface CompanyFact {
  id:         string
  category:   FactCategory
  fact:       string
  source:     FactSource
  confidence: FactConfidence
  is_active:  boolean
  created_at?: string
}

// Rotulos por categoria (paridade PT/EN). A ordem de exibicao segue FACT_CATEGORIES.
export const FACT_CATEGORY_LABELS: Record<FactCategory, { pt: string; en: string }> = {
  technology: { pt: 'Tecnologia',  en: 'Technology' },
  system:     { pt: 'Sistema',     en: 'System' },
  project:    { pt: 'Projeto',     en: 'Project' },
  priority:   { pt: 'Prioridade',  en: 'Priority' },
  constraint: { pt: 'Restrição',   en: 'Constraint' },
  decision:   { pt: 'Decisão',     en: 'Decision' },
  budget:     { pt: 'Orçamento',   en: 'Budget' },
  other:      { pt: 'Outro',       en: 'Other' },
}

export const MAX_FACT_LENGTH = 280

// Normaliza um fato para comparacao de similaridade (dedupe): minusculas, sem
// acentos, sem pontuacao, espacos colapsados.
export function normalizeFact(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Similaridade grosseira por sobreposicao de tokens (Jaccard). Suficiente para
// evitar reinserir um fato praticamente igual a um ja registrado.
export function factSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeFact(a).split(' ').filter(Boolean))
  const tb = new Set(normalizeFact(b).split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}
