// Agregacao SERVER-SIDE do dashboard: transforma os 378 reports em ~126 EDICOES
// (agrupadas por periodo) num payload COMPACTO. O client recebe as edicoes ja
// resumidas (parts + score + contagens + categorias + quais temas curados a edicao
// toca), nunca os trends crus, para nao mandar um payload gigante ao browser.

import { avgScore as avgOfTrends, formatPeriodFull, type Report, type Lang } from '@/lib/types'

type TrendMeta = { taime_score: number; category: string | null; theme_slug: string | null }

// Temas curados (mesma ordem dos 8 da home em i18n themesCards.items). Cada tema
// mapeia para 1+ theme_slug reais dos dados. A edicao "toca" um tema se contem
// qualquer trend com um desses slugs. Index-aligned com themesCards.items.
export const CURATED_THEME_SLUGS: string[][] = [
  ['governanca-ia', 'governanca-qualidade-dados-ia'],                                  // Governanca de IA
  ['ia-agentes-autonomos', 'sistemas-autonomos-logistica-ia'],                         // Agentes autonomos de IA
  ['ia-ciberseguranca-corrida-armamentista', 'arquitetura-zero-trust-seguranca'],      // IA e ciberseguranca
  ['computacao-quantica-comercial', 'criptografia-pos-quantica-migracao'],             // Computacao quantica
  ['soberania-semicondutores-geopolitica'],                                            // Semicondutores e geopolitica
  ['ia-servicos-financeiros', 'ia-generativa-servicos-financeiros'],                   // IA em servicos financeiros
  ['fragmentacao-global-privacidade-dados'],                                           // Privacidade e dados
  ['ia-energia-infraestrutura-sustentavel', 'recuperacao-verde-carbono-imperativo-operacional'], // Energia
]

export interface EditionPart {
  id:      string
  number:  number
  title:   string   // ja localizado
  score:   number
  nTrends: number
}

export interface EditionSummary {
  period:       string
  periodLabel:  string   // ja localizado (formatPeriodFull)
  parts:        EditionPart[]
  avgScore:     number
  totalTrends:  number
  categories:   string[]
  themeMatches: number[] // indices (0..7) dos temas curados que a edicao toca
  publishedAt:  string   // max published_at das partes (ISO), para "novo desde"
  summary:      string | null // executive_summary da Parte 1, se existir
}

export interface ReportLookupEntry {
  title:       string
  score:       number
  periodLabel: string
}

export interface DashboardData {
  editions:     EditionSummary[]                 // mais recente primeiro
  reportLookup: Record<string, ReportLookupEntry> // p/ resultados de busca (flat)
  categories:   string[]                          // distintas, por frequencia
}

// "O arquivo em numeros" (rail): derivado da agregacao ja existente, sem fetch novo.
export interface ArchiveStats {
  totalEditions: number
  totalTrends:   number
  spanStartYear: string
  spark:         number[]  // score medio por periodo, cronologico, ultimos ~24
}

function trendMetaOf(r: Report): TrendMeta[] {
  return (r.report_trends ?? []) as unknown as TrendMeta[]
}

export function buildEditions(reports: Report[], locale: 'pt' | 'en'): DashboardData {
  const lang: Lang = locale === 'en' ? 'en' : 'pt-BR'
  const isEn = locale === 'en'

  const reportLookup: Record<string, ReportLookupEntry> = {}
  const catFreq = new Map<string, number>()

  // 1. agrupa reports por periodo (a edicao).
  const byPeriod = new Map<string, Report[]>()
  for (const r of reports) {
    const arr = byPeriod.get(r.period)
    if (arr) arr.push(r)
    else byPeriod.set(r.period, [r])
  }

  const editions: EditionSummary[] = []
  for (const [period, parts] of byPeriod) {
    parts.sort((a, b) => (a.report_number ?? 999) - (b.report_number ?? 999))

    const editionCats  = new Set<string>()
    const editionSlugs = new Set<string>()
    let totalTrends = 0
    let scoreSum = 0
    let publishedAt = ''

    const editionParts: EditionPart[] = parts.map((r, idx) => {
      const trends = trendMetaOf(r)
      const nTrends = trends.length
      const score   = avgOfTrends(trends)
      totalTrends  += nTrends
      scoreSum     += trends.reduce((s, t) => s + t.taime_score, 0)
      for (const t of trends) {
        if (t.category) { editionCats.add(t.category); catFreq.set(t.category, (catFreq.get(t.category) ?? 0) + 1) }
        if (t.theme_slug) editionSlugs.add(t.theme_slug)
      }
      if (r.published_at && r.published_at > publishedAt) publishedAt = r.published_at

      const title = (isEn && r.title_en) ? r.title_en : r.title_pt_br
      const periodLabel = formatPeriodFull(r.period, lang)
      reportLookup[r.id] = { title, score, periodLabel }

      return { id: r.id, number: r.report_number ?? (idx + 1), title, score, nTrends }
    })

    const themeMatches: number[] = []
    CURATED_THEME_SLUGS.forEach((slugs, i) => {
      if (slugs.some(s => editionSlugs.has(s))) themeMatches.push(i)
    })

    // Sintese: executive_summary da Parte 1 (nao gera conteudo novo; usa o que ja existe).
    const first = parts[0]
    const rawSummary = first ? (isEn ? (first.executive_summary_en || first.executive_summary_pt_br) : (first.executive_summary_pt_br || first.executive_summary_en)) : ''
    const summary = rawSummary && rawSummary.trim().length > 0 ? rawSummary.trim() : null

    editions.push({
      period,
      periodLabel:  formatPeriodFull(period, lang),
      parts:        editionParts,
      avgScore:     totalTrends > 0 ? Math.round(scoreSum / totalTrends) : 0,
      totalTrends,
      categories:   [...editionCats],
      themeMatches,
      publishedAt,
      summary,
    })
  }

  // 2. ordena edicoes por periodo desc (mais recente primeiro).
  editions.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0))

  const categories = [...catFreq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)

  return { editions, reportLookup, categories }
}
