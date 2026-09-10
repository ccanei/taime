// Config PURA do /decision-check (client + server): os 12 temas (com grupos e rotulos
// PT/EN), portes, objetivos, horizontes, e o build/parse do slug de combinacao.
// SEM imports server-side. O slug da URL usa sempre as chaves canonicas (PT); o idioma
// de exibicao vem de ?lang=en. Uma URL indexavel por combinacao.

export type Lang = 'pt' | 'en'
export interface Bi { pt: string; en: string }

// ── 12 temas, agrupados (a ordem dos grupos e itens espelha o dropdown) ──────
export interface ThemeGroup { group: Bi; items: Array<{ slug: string; label: Bi }> }
export const THEME_GROUPS: ThemeGroup[] = [
  {
    group: { pt: 'Estratégia de IA', en: 'AI Strategy' },
    items: [
      { slug: 'governanca-ia',                        label: { pt: 'Governança de IA', en: 'AI Governance' } },
      { slug: 'transformacao-modelo-operacional-ia',  label: { pt: 'Transformação do Modelo Operacional com IA', en: 'Operating Model Transformation with AI' } },
      { slug: 'ia-agentes-autonomos',                 label: { pt: 'IA Agêntica em Operação', en: 'Agentic AI in Operation' } },
    ],
  },
  {
    group: { pt: 'Infraestrutura e Dados', en: 'Infrastructure and Data' },
    items: [
      { slug: 'infraestrutura-ia-nuvem-estrategica',  label: { pt: 'Infraestrutura de IA e Nuvem', en: 'AI Infrastructure and Cloud' } },
      { slug: 'governanca-qualidade-dados-ia',        label: { pt: 'Governança e Qualidade de Dados para IA', en: 'Data Governance for AI' } },
      { slug: 'observabilidade-ia-producao',          label: { pt: 'Observabilidade de IA em Produção', en: 'AI Observability in Production' } },
    ],
  },
  {
    group: { pt: 'Cibersegurança', en: 'Cybersecurity' },
    items: [
      { slug: 'ia-ciberseguranca-corrida-armamentista', label: { pt: 'Cibersegurança e IA', en: 'Cybersecurity and AI' } },
      { slug: 'arquitetura-zero-trust-seguranca',       label: { pt: 'Arquitetura Zero Trust', en: 'Zero Trust Architecture' } },
    ],
  },
  {
    group: { pt: 'Aplicações Setoriais', en: 'Sector Applications' },
    items: [
      { slug: 'ia-assistentes-codificacao',           label: { pt: 'IA em Engenharia de Software', en: 'AI in Software Engineering' } },
      { slug: 'ia-servicos-financeiros',              label: { pt: 'IA em Serviços Financeiros', en: 'AI in Financial Services' } },
      { slug: 'ia-descoberta-medicamentos-saude',     label: { pt: 'IA em Saúde e Descoberta de Medicamentos', en: 'AI in Healthcare and Drug Discovery' } },
    ],
  },
  {
    group: { pt: 'Pessoas', en: 'People' },
    items: [
      { slug: 'requalificacao-humana-ia',             label: { pt: 'Requalificação Humana e IA', en: 'Human Reskilling and AI' } },
    ],
  },
]

export const THEMES: Record<string, Bi> = Object.fromEntries(
  THEME_GROUPS.flatMap(g => g.items.map(i => [i.slug, i.label])),
)
export const THEME_SLUGS = Object.keys(THEMES)

// ── Porte, objetivo, horizonte (chave canonica -> rotulo PT/EN) ──────────────
// Faixas recalibradas (2026-09-10) para a realidade do ICP brasileiro: mais
// granularidade no pequeno-medio, sem a faixa "mais de 10.000" (rara no Brasil).
export const ORG_SIZES: Array<{ key: string; label: Bi }> = [
  { key: 'ate-50',    label: { pt: 'Até 50 funcionários', en: 'Up to 50 employees' } },
  { key: '50-200',    label: { pt: '50 a 200',            en: '50 to 200' } },
  { key: '200-1000',  label: { pt: '200 a 1.000',         en: '200 to 1,000' } },
  { key: '1000-5000', label: { pt: '1.000 a 5.000',       en: '1,000 to 5,000' } },
  { key: '5000-mais', label: { pt: 'Mais de 5.000',       en: 'More than 5,000' } },
]
// Framing por faixa (PT) para orientar a geracao THEN/NOW/NEXT do Haiku conforme o porte.
export const SIZE_FRAMING: Record<string, string> = {
  'ate-50':    'empresa em estágio inicial de estruturação tecnológica',
  '50-200':    'empresa média com time de tecnologia estabelecendo processos',
  '200-1000':  'empresa média-grande com liderança de tecnologia consolidada',
  '1000-5000': 'grande empresa com estrutura formal de tecnologia e inovação',
  '5000-mais': 'grande corporação com múltiplas unidades de tecnologia',
}
export const OBJECTIVES: Array<{ key: string; label: Bi }> = [
  { key: 'adotar',    label: { pt: 'Adotar',    en: 'Adopt' } },
  { key: 'preparar',  label: { pt: 'Preparar',  en: 'Prepare' } },
  { key: 'monitorar', label: { pt: 'Monitorar', en: 'Monitor' } },
  { key: 'evitar',    label: { pt: 'Evitar',    en: 'Avoid' } },
]
export const HORIZONS: Array<{ key: string; label: Bi }> = [
  { key: '6m',  label: { pt: '6 meses',  en: '6 months' } },
  { key: '12m', label: { pt: '12 meses', en: '12 months' } },
  { key: '24m', label: { pt: '24 meses', en: '24 months' } },
]

const SIZE_KEYS = new Set(ORG_SIZES.map(s => s.key))
const OBJ_KEYS  = new Set(OBJECTIVES.map(o => o.key))
const HOR_KEYS  = new Set(HORIZONS.map(h => h.key))

export interface Combo { theme: string; size: string; objective: string; horizon: string }

// slug canonico: {theme_slug}-{size}-{objective}-{horizon}. Ex.: ia-agentes-autonomos-50-200-adotar-12m
export function buildComboSlug(c: Combo): string {
  return `${c.theme}-${c.size}-${c.objective}-${c.horizon}`
}

// Parse robusto: TANTO o theme_slug QUANTO o size podem ter hifens (ex.: 50-200). Ancora
// no theme (conjunto conhecido de 12): acha o theme que prefixa o slug; do resto, tira
// horizonte e objetivo (tokens unicos) da direita; o meio e o size. null se invalido
// (inclui as faixas ANTIGAS 100/1000/10k/10000, que agora nao existem -> 404 na rota).
export function parseComboSlug(slug: string): Combo | null {
  for (const theme of THEME_SLUGS) {
    if (slug !== theme && !slug.startsWith(theme + '-')) continue
    const parts = slug.slice(theme.length + 1).split('-')
    if (parts.length < 3) continue
    const horizon = parts.pop()!
    const objective = parts.pop()!
    const size = parts.join('-')
    if (HOR_KEYS.has(horizon) && OBJ_KEYS.has(objective) && SIZE_KEYS.has(size)) {
      return { theme, size, objective, horizon }
    }
  }
  return null
}

export function labelFor(list: Array<{ key: string; label: Bi }>, key: string, lang: Lang): string {
  return (list.find(x => x.key === key)?.label[lang]) ?? key
}
export function themeLabel(slug: string, lang: Lang): string { return THEMES[slug]?.[lang] ?? slug }

// ── MOVE: cores/rotulos semanticos (Prepare/Act/Monitor/Avoid) ───────────────
export type Move = 'act' | 'prepare' | 'monitor' | 'avoid'
export const MOVE_LABEL: Record<Move, Bi> = {
  act:     { pt: 'AGIR',       en: 'ACT' },
  prepare: { pt: 'PREPARAR',   en: 'PREPARE' },
  monitor: { pt: 'MONITORAR',  en: 'MONITOR' },
  avoid:   { pt: 'EVITAR',     en: 'AVOID' },
}
// classes tailwind por move (texto + fundo tenue), para o bloco de destaque.
export const MOVE_STYLE: Record<Move, { text: string; ring: string; bg: string }> = {
  act:     { text: 'text-emerald-400', ring: 'ring-emerald-500/30', bg: 'bg-emerald-500/10' },
  prepare: { text: 'text-taime-400',   ring: 'ring-taime-500/30',   bg: 'bg-taime-500/10' },
  monitor: { text: 'text-amber-400',   ring: 'ring-amber-500/30',   bg: 'bg-amber-500/10' },
  avoid:   { text: 'text-red-400',     ring: 'ring-red-500/30',     bg: 'bg-red-500/10' },
}
export function isMove(v: unknown): v is Move { return v === 'act' || v === 'prepare' || v === 'monitor' || v === 'avoid' }

// Cor da barra de score por faixa: <60 vermelho, 60-75 ambar, 75-90 azul, >90 verde.
export function scoreBarClass(score: number): string {
  if (score < 60) return 'bg-red-500'
  if (score < 75) return 'bg-amber-500'
  if (score <= 90) return 'bg-taime-500'
  return 'bg-emerald-500'
}

// Snapshot do resultado (gravado em decision_checks.result_snapshot e no cache).
export interface DecisionResult {
  ok:          boolean          // false = fallback (tema imaturo, < 3 trends)
  score:       number           // media ponderada 0-100
  move:        Move
  risk:        Bi               // risco principal (1-2 linhas), bilingue
  tnn:         { then: Bi; now: Bi; next: Bi }  // then/now/next sintetico, bilingue
  trendCount:  number           // N analises usadas
  oldestYear:  number | null    // ano mais antigo das trends
  reportId:    string | null    // report da amostra publica mais relacionada (para "leia a analise completa")
  fallbackMsg: Bi               // mensagem educada quando ok=false
}

export const FALLBACK_MSG: Bi = {
  pt: 'Este tema ainda está sendo desenvolvido no arquivo TAIME. Para uma análise específica, converse com o Executive Advisor.',
  en: 'This theme is still being developed in the TAIME archive. For a specific analysis, talk to the Executive Advisor.',
}
