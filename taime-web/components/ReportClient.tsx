'use client'

import { useState, useEffect } from 'react'
import type { Report, ReportTrend, Lang, TaimeFramework, OrgImplications, ThenNowNext, ScoreDimensions } from '@/lib/types'
import { formatPeriod, formatPeriodFull, scoreColor, scoreBg, scoreRing } from '@/lib/types'
import LanguageSelector from '@/components/LanguageSelector'

// ─── Score gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  return (
    <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-2xl ring-2 shrink-0 ${scoreRing(score)}`}>
      <span className={`text-3xl font-bold tabular-nums leading-none ${scoreColor(score)}`}>
        {score}
      </span>
      <span className="text-[9px] text-zinc-400 font-bold tracking-widest mt-0.5">SCORE</span>
    </div>
  )
}

// ─── Score dimensions ─────────────────────────────────────────────────────────

const DIMENSION_LABELS: Record<keyof ScoreDimensions, string> = {
  market_maturity:      'Market Maturity',
  competitive_pressure: 'Competitive Pressure',
  strategic_impact:     'Strategic Impact',
  execution_complexity: 'Execution Complexity',
  competitive_lag_risk: 'Competitive Lag Risk',
}

function ScoreDimensionsPanel({ dims }: { dims: ScoreDimensions }) {
  return (
    <div className="space-y-3">
      {(Object.keys(DIMENSION_LABELS) as Array<keyof ScoreDimensions>).map(key => {
        const { score, label } = dims[key]
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 w-44 shrink-0">{DIMENSION_LABELS[key]}</span>
            <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full score-bar ${score >= 85 ? 'bg-emerald-500' : score >= 70 ? 'bg-taime-600' : score >= 50 ? 'bg-amber-400' : 'bg-zinc-300'}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums w-6 text-right text-zinc-700">{score}</span>
            <span className="text-[10px] font-bold tracking-wide text-zinc-400 w-52 hidden lg:block">{label}</span>
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

function ThenNowNextPanel({
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

// ─── TAIME Framework ──────────────────────────────────────────────────────────

const FRAMEWORK_COLORS = {
  type:   { dot: 'bg-taime-600',   card: 'bg-taime-50 border-taime-100' },
  act:    { dot: 'bg-emerald-600', card: 'bg-emerald-50 border-emerald-100' },
  impact: { dot: 'bg-blue-600',    card: 'bg-blue-50 border-blue-100' },
  move:   { dot: 'bg-amber-500',   card: 'bg-amber-50 border-amber-100' },
  exit:   { dot: 'bg-zinc-500',    card: 'bg-zinc-50 border-zinc-200' },
} as const

function FrameworkPanel({ fw }: { fw: TaimeFramework }) {
  const steps = [
    { key: 'type',   label: 'TYPE' },
    { key: 'act',    label: 'ACT' },
    { key: 'impact', label: 'IMPACT' },
    { key: 'move',   label: 'MOVE' },
    { key: 'exit',   label: 'EXIT' },
  ] as const

  return (
    <div className="space-y-0">
      {steps.map(({ key, label }, i) => {
        const raw = fw[key]
        // Parse "Heading — Body" or "Heading – Body" from LLM output
        const m = raw.match(/^([^—–\n]{2,60})\s*[—–]\s*([\s\S]{10,})$/)
        const heading = m ? m[1].trim() : null
        const body    = m ? m[2].trim() : raw
        const { dot, card } = FRAMEWORK_COLORS[key]

        return (
          <div key={key} className="flex gap-4">
            {/* Timeline stem */}
            <div className="flex flex-col items-center shrink-0 w-8">
              <div className={`${dot} w-8 h-8 rounded-lg flex items-center justify-center shrink-0`}>
                <span className="text-[9px] font-bold text-white tracking-widest">
                  {label.slice(0, 1)}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="w-px flex-1 bg-zinc-200 my-1 min-h-[16px]" />
              )}
            </div>

            {/* Content card */}
            <div className={`flex-1 rounded-xl border p-4 mb-3 ${card}`}>
              <p className="text-[9px] font-bold tracking-widest text-zinc-400 mb-1.5">{label}</p>
              {heading && (
                <p className="text-sm font-bold text-zinc-900 mb-1.5">{heading}</p>
              )}
              <p className="text-sm text-zinc-700 leading-relaxed">{body}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Org implications ─────────────────────────────────────────────────────────

const ORG_ICONS: Record<keyof OrgImplications, string> = {
  leadership: '👔',
  technology: '⚙️',
  operations: '🔄',
  finance:    '📊',
  people:     '👥',
}

function OrgImplicationsPanel({ impl }: { impl: OrgImplications }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {(Object.keys(impl) as Array<keyof OrgImplications>).map(key => (
        <div key={key} className="bg-zinc-50 rounded-xl p-4">
          <p className="text-[10px] font-bold tracking-widest text-zinc-400 mb-2 flex items-center gap-1.5">
            <span>{ORG_ICONS[key]}</span>
            <span>{key.toUpperCase()}</span>
          </p>
          <p className="text-sm text-zinc-700 leading-relaxed">{impl[key]}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Decision triggers ────────────────────────────────────────────────────────

function DecisionTriggers({ triggers }: { triggers: string[] }) {
  return (
    <ul className="space-y-2">
      {triggers.map((trigger, i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-zinc-700">
          <span className="shrink-0 w-5 h-5 rounded-full bg-taime-50 text-taime-600
                           flex items-center justify-center text-[10px] font-bold mt-0.5">
            {i + 1}
          </span>
          {trigger}
        </li>
      ))}
    </ul>
  )
}

// ─── Single trend section ─────────────────────────────────────────────────────

function TrendSection({ trend, lang, period }: { trend: ReportTrend; lang: Lang; period: string }) {
  const isPt     = lang === 'pt-BR'
  const title    = isPt ? trend.title_pt_br : trend.title_en
  const fw       = isPt ? trend.taime_framework_pt_br : trend.taime_framework_en
  const tnn      = isPt ? trend.then_now_next_pt_br : trend.then_now_next_en
  const impl     = isPt ? trend.org_implications_pt_br : trend.org_implications_en
  const triggers = isPt ? trend.decision_triggers_pt_br : trend.decision_triggers_en
  const move     = isPt ? trend.recommended_move_pt_br : trend.recommended_move_en
  const rationale = isPt ? trend.taime_score_rationale_pt_br : trend.taime_score_rationale_en

  return (
    <article className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
      {/* Trend header */}
      <div className="px-8 py-6 border-b border-zinc-100 flex items-start gap-5">
        <ScoreGauge score={trend.taime_score} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-zinc-400 tracking-widest mb-1.5">
            TREND {trend.rank}
          </p>
          <h3 className="text-lg font-bold text-zinc-900 leading-snug mb-2">{title}</h3>
          {fw.executive_snapshot && (
            <p className="text-sm text-zinc-600 leading-relaxed">{fw.executive_snapshot}</p>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-8">
        {/* Score dimensions */}
        <div>
          <p className="section-label">Score Dimensions</p>
          <ScoreDimensionsPanel dims={fw.score_dimensions} />
          {rationale && (
            <p className="mt-3 text-xs text-zinc-500 leading-relaxed italic border-l-2 border-zinc-200 pl-3">
              {rationale}
            </p>
          )}
        </div>

        {/* THEN / NOW / NEXT */}
        <div>
          <p className="section-label">Then / Now / Next</p>
          <ThenNowNextPanel tnn={tnn} period={period} lang={lang} />
        </div>

        {/* Framework */}
        <div>
          <p className="section-label">TYPE → ACT → IMPACT → MOVE → EXIT</p>
          <FrameworkPanel fw={fw} />
        </div>

        {/* Org implications */}
        <div>
          <p className="section-label">
            {isPt ? 'Implicações Organizacionais' : 'Organizational Implications'}
          </p>
          <OrgImplicationsPanel impl={impl} />
        </div>

        {/* Decision triggers */}
        <div>
          <p className="section-label">
            {isPt ? 'Gatilhos de Decisão' : 'Decision Triggers'}
          </p>
          <DecisionTriggers triggers={triggers} />
        </div>

        {/* Recommended move */}
        <div className="rounded-xl bg-taime-50 border border-taime-100 p-5">
          <p className="section-label text-taime-600">
            {isPt ? 'Movimento Recomendado' : 'Recommended Move'}
          </p>
          <p className="text-sm text-zinc-800 leading-relaxed font-medium">{move}</p>
        </div>

        {/* Confidence + limitations */}
        {(fw.confidence_basis || fw.limitations) && (
          <div className="flex flex-wrap gap-6 pt-2 border-t border-zinc-100">
            {fw.confidence_basis && (
              <div>
                <p className="text-[10px] font-bold text-zinc-400 tracking-widest mb-1">
                  {isPt ? 'BASE DE EVIDÊNCIA' : 'EVIDENCE BASIS'}
                </p>
                <p className="text-xs text-zinc-500">{fw.confidence_basis}</p>
              </div>
            )}
            {fw.limitations && (
              <div className="flex-1 min-w-48">
                <p className="text-[10px] font-bold text-zinc-400 tracking-widest mb-1">
                  {isPt ? 'LIMITAÇÕES' : 'LIMITATIONS'}
                </p>
                <p className="text-xs text-zinc-500">{fw.limitations}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

// ─── Main report client component ─────────────────────────────────────────────

export default function ReportClient({
  report,
  trends,
}: {
  report: Report
  trends: ReportTrend[]
}) {
  const [lang, setLang] = useState<Lang>('pt-BR')
  const isPt = lang === 'pt-BR'

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)taime-locale=([^;]+)/)
    setLang(match?.[1] === 'en' ? 'en' : 'pt-BR')
  }, [])

  const title   = isPt ? report.title_pt_br : report.title_en
  const summary = isPt ? report.executive_summary_pt_br : report.executive_summary_en

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sticky header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <a href="/dashboard" className="font-bold text-lg tracking-tight text-zinc-900 shrink-0">
              TAIME
            </a>
            <span className="text-zinc-200">·</span>
            <span className="text-sm text-zinc-500 truncate hidden sm:block">{title}</span>
          </div>

          <LanguageSelector />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        {/* Historical banner */}
        {(() => {
          const reportDate = new Date(report.period + 'T12:00:00Z')
          const sixMonthsAgo = new Date()
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
          return reportDate < sixMonthsAgo ? (
            <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <p className="text-sm text-blue-700 leading-snug">
                {isPt
                  ? 'Este é um registro histórico do arquivo TAIME. O conteúdo reflete o contexto estratégico do período indicado.'
                  : 'This is a historical record from the TAIME archive. The content reflects the strategic context of the indicated period.'}
              </p>
            </div>
          ) : null
        })()}

        {/* Report header */}
        <div className="bg-white rounded-2xl border border-zinc-200 px-8 py-8">
          <p className="text-xs font-bold text-zinc-400 tracking-widest mb-3">
            {formatPeriod(report.period, lang).toUpperCase()}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 leading-snug mb-6">
            {title}
          </h1>
          <div className="prose-taime text-sm leading-relaxed text-zinc-700 space-y-4">
            {summary.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>

        {/* Trends */}
        {trends.map(trend => (
          <TrendSection key={trend.id} trend={trend} lang={lang} period={report.period} />
        ))}
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-8 text-xs text-zinc-400 text-center">
        TAIME · {formatPeriod(report.period, lang)}
      </footer>
    </div>
  )
}
