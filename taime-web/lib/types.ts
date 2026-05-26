export interface ScoreDimension {
  score: number
  label: string
}

export interface ScoreDimensions {
  market_maturity:      ScoreDimension
  competitive_pressure: ScoreDimension
  strategic_impact:     ScoreDimension
  execution_complexity: ScoreDimension
  competitive_lag_risk: ScoreDimension
}

// taime_framework JSONB: 5 campos core + campos estendidos do gerador
export interface TaimeFramework {
  type:   string
  act:    string
  impact: string
  move:   string
  exit:   string
  // campos estendidos gerados pelo LLM
  executive_snapshot: string
  score_dimensions:   ScoreDimensions
  confidence_basis:   string
  limitations:        string
}

export interface ThenNowNext {
  then: string
  now:  string
  next: string
}

export interface OrgImplications {
  leadership: string
  technology: string
  operations: string
  finance:    string
  people:     string
}

export interface ReportTrend {
  id:                          string
  report_id:                   string
  rank:                        number
  title_pt_br:                 string
  title_en:                    string
  taime_score:                 number
  taime_score_rationale_pt_br: string
  taime_score_rationale_en:    string
  taime_framework_pt_br:       TaimeFramework
  taime_framework_en:          TaimeFramework
  then_now_next_pt_br:         ThenNowNext
  then_now_next_en:            ThenNowNext
  org_implications_pt_br:      OrgImplications
  org_implications_en:         OrgImplications
  decision_triggers_pt_br:     string[]
  decision_triggers_en:        string[]
  recommended_move_pt_br:      string
  recommended_move_en:         string
}

export interface Report {
  id:                      string
  period:                  string
  status:                  string
  title_pt_br:             string
  title_en:                string
  executive_summary_pt_br: string
  executive_summary_en:    string
  published_at:            string
  created_at:              string
  period_label:            string | null
  period_type:             string | null
  report_trends?:          Pick<ReportTrend, 'taime_score' | 'rank'>[]
}

export type Lang = 'pt-BR' | 'en'

const MONTHS_PT_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MONTHS_EN_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function formatPeriodFull(period: string, lang: Lang): string {
  const date  = new Date(period + 'T12:00:00Z')
  const year  = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day   = date.getUTCDate()
  const mPt   = MONTHS_PT_FULL[month]
  const mEn   = MONTHS_EN_FULL[month]
  if (year <= 2014) {
    return lang === 'pt-BR' ? `${mPt} de ${year}` : `${mEn} ${year}`
  }
  if (day <= 15) {
    return lang === 'pt-BR' ? `1ª Quinzena de ${mPt} de ${year}` : `First Half of ${mEn} ${year}`
  }
  return lang === 'pt-BR' ? `2ª Quinzena de ${mPt} de ${year}` : `Second Half of ${mEn} ${year}`
}

export function formatPeriod(period: string, lang: Lang): string {
  const date = new Date(period + 'T12:00:00Z')
  return date.toLocaleDateString(lang === 'pt-BR' ? 'pt-BR' : 'en-US', {
    month: 'long', year: 'numeric',
  })
}

export function avgScore(trends: Pick<ReportTrend, 'taime_score'>[]): number {
  if (!trends?.length) return 0
  return Math.round(trends.reduce((s, t) => s + t.taime_score, 0) / trends.length)
}

export function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-700'
  if (score >= 70) return 'text-taime-600'
  if (score >= 50) return 'text-amber-700'
  return 'text-zinc-500'
}

export function scoreBg(score: number): string {
  if (score >= 85) return 'bg-emerald-600'
  if (score >= 70) return 'bg-taime-600'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-zinc-400'
}

export function scoreRing(score: number): string {
  if (score >= 85) return 'ring-emerald-200 bg-emerald-50'
  if (score >= 70) return 'ring-blue-200 bg-blue-50'
  if (score >= 50) return 'ring-amber-200 bg-amber-50'
  return 'ring-zinc-200 bg-zinc-50'
}
