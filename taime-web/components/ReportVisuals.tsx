'use client'

import type { Lang, ScoreDimensions, ThenNowNext } from '@/lib/types'
import { formatPeriodFull, scoreColor, scoreRing } from '@/lib/types'
import InfoTooltip from '@/components/InfoTooltip'

// ─── Score gauge ──────────────────────────────────────────────────────────────

export function ScoreGauge({ score, tooltipText }: { score: number; tooltipText?: string }) {
  return (
    <div className={`relative flex flex-col items-center justify-center w-20 h-20 rounded-2xl ring-2 shrink-0 ${scoreRing(score)}`}>
      <span className={`text-3xl font-bold tabular-nums leading-none ${scoreColor(score)}`}>
        {score}
      </span>
      <span className="text-[9px] text-zinc-400 font-bold tracking-widest mt-0.5">SCORE</span>
      {tooltipText && (
        <div className="absolute top-1 right-1">
          <InfoTooltip text={tooltipText} position="bottom" width={280} ariaLabel="Sobre o TAIME Score" />
        </div>
      )}
    </div>
  )
}

// ─── Score dimensions ─────────────────────────────────────────────────────────

const DIMENSION_NAMES: Record<'pt-BR' | 'en', Record<keyof ScoreDimensions, string>> = {
  'pt-BR': {
    market_maturity:      'Maturidade de Mercado',
    competitive_pressure: 'Pressão Competitiva',
    strategic_impact:     'Impacto Estratégico',
    execution_complexity: 'Complexidade de Execução',
    competitive_lag_risk: 'Risco de Atraso Competitivo',
  },
  en: {
    market_maturity:      'Market Maturity',
    competitive_pressure: 'Competitive Pressure',
    strategic_impact:     'Strategic Impact',
    execution_complexity: 'Execution Complexity',
    competitive_lag_risk: 'Competitive Lag Risk',
  },
}

const DIMENSION_KEYS: Array<keyof ScoreDimensions> = [
  'market_maturity',
  'competitive_pressure',
  'strategic_impact',
  'execution_complexity',
  'competitive_lag_risk',
]

function dimensionBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-orange-500'
}

function dimensionTextColor(score: number): string {
  if (score >= 80) return 'text-emerald-700'
  if (score >= 60) return 'text-amber-700'
  return 'text-orange-700'
}

export function ScoreDimensionsPanel({ dims, lang }: { dims: ScoreDimensions; lang: Lang }) {
  const names = DIMENSION_NAMES[lang]
  return (
    <div className="-mx-1 px-1 pb-1 flex gap-3 overflow-x-auto sm:grid sm:grid-cols-5 sm:gap-3 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
      {DIMENSION_KEYS.map(key => {
        const { score, label } = dims[key]
        return (
          <div
            key={key}
            className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-2.5 shrink-0 w-44 sm:w-auto"
          >
            <p className="text-xs font-semibold text-zinc-800 leading-snug min-h-[2.5em]">
              {names[key]}
            </p>
            <p className="text-[10px] font-medium tracking-wider text-zinc-400 uppercase leading-snug min-h-[1.5em]">
              {label}
            </p>
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full score-bar ${dimensionBarColor(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <p className={`text-xl font-bold tabular-nums leading-none ${dimensionTextColor(score)}`}>
              {score}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ─── THEN / NOW / NEXT ────────────────────────────────────────────────────────

function extractThenLabel(text: string): { label: string | null; content: string } {
  if (!text) return { label: null, content: '' }
  const lines = text.split('\n')
  const firstLine = lines[0].trim()
  if (firstLine.startsWith('PERIOD_LABEL:')) {
    const label   = firstLine.replace('PERIOD_LABEL:', '').trim()
    const content = lines.slice(1).join('\n').trim()
    return { label, content }
  }
  return { label: null, content: text }
}

export function ThenNowNextPanel({
  tnn,
  period,
  lang,
}: {
  tnn: ThenNowNext
  period: string
  lang: Lang
}) {
  const isPt         = lang === 'pt-BR'
  const { label: thenLabel, content: thenContent } = extractThenLabel(tnn.then)
  const nowLabel     = formatPeriodFull(period, lang)
  const nextLabel    = isPt
    ? `Projeção a partir de ${formatPeriodFull(period, lang)}`
    : `Projection from ${formatPeriodFull(period, 'en')}`

  const cols = [
    { key: 'then' as const, label: 'THEN', subtitle: thenLabel,  content: thenContent, bg: 'bg-zinc-50' },
    { key: 'now'  as const, label: 'NOW',  subtitle: nowLabel,   content: tnn.now,     bg: 'bg-white' },
    { key: 'next' as const, label: 'NEXT', subtitle: nextLabel,  content: tnn.next,    bg: 'bg-taime-50' },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 border border-zinc-200 rounded-xl overflow-hidden">
      {cols.map(({ key, label, subtitle, content, bg }) => (
        <div key={key} className={`${bg} p-5`}>
          <p className="text-[10px] font-bold tracking-widest text-zinc-400">{label}</p>
          {subtitle && (
            <p className="text-[11px] italic text-zinc-400 mt-0.5 mb-3 leading-snug">{subtitle}</p>
          )}
          {!subtitle && <div className="mb-3" />}
          <div className="w-8 h-px bg-zinc-200 mb-3" />
          <p className="text-sm text-zinc-700 leading-[1.65]">{content}</p>
        </div>
      ))}
    </div>
  )
}
