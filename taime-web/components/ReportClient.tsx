'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Report, ReportTrend, Lang, TaimeFramework, OrgImplications, ThenNowNext, ScoreDimensions } from '@/lib/types'
import { formatPeriod, formatPeriodFull, scoreColor, scoreBg, scoreRing } from '@/lib/types'
import type { AccessLevel, AccessReason, Plan } from '@/lib/access'
import LanguageSelector from '@/components/LanguageSelector'
import { ScoreGauge, ScoreDimensionsPanel, ThenNowNextPanel } from '@/components/ReportVisuals'

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
    <article
      id={`trend-${trend.rank}`}
      className="bg-white rounded-2xl border border-zinc-200 overflow-hidden scroll-mt-24">
      {/* Trend header */}
      <div className="px-8 py-6 border-b border-zinc-100 flex items-start gap-5">
        <ScoreGauge
          score={trend.taime_score}
          tooltipText={
            isPt
              ? 'Os scores TAIME são relativos ao universo global de movimentos tecnológicos monitorados pela plataforma e representam posicionamento comparativo entre tendências, não adoção ou maturidade da sua organização.'
              : 'TAIME scores are relative to the global universe of technology movements monitored by the platform and represent comparative positioning between trends, not adoption or maturity of your organization.'
          }
        />
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
        {fw.score_dimensions && (
          <div>
            <p className="section-label">
              {isPt ? 'Dimensões do Score' : 'Score Dimensions'}
            </p>
            <ScoreDimensionsPanel dims={fw.score_dimensions} lang={lang} />
            {rationale && (
              <p className="mt-3 text-xs text-zinc-500 leading-relaxed italic border-l-2 border-zinc-200 pl-3">
                {rationale}
              </p>
            )}
          </div>
        )}

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

// ─── Locked trend teaser (modo publicUnlock) ──────────────────────────────────

export interface LockedTrendStub {
  rank:        number
  title_pt_br: string
  title_en:    string
  taime_score: number
}

function LockedTrendTeaser({ stub, lang }: { stub: LockedTrendStub; lang: Lang }) {
  const isPt = lang === 'pt-BR'
  const title = isPt ? stub.title_pt_br : stub.title_en
  const ctaHref = '/planos'
  const ctaLabel = isPt
    ? 'Assine para ler esta tendência →'
    : 'Subscribe to read this trend →'

  return (
    <article className="relative bg-white rounded-2xl border border-zinc-200 overflow-hidden">
      {/* Trend header — visível (título + score, mesmo padrão visual) */}
      <div className="px-8 py-6 border-b border-zinc-100 flex items-start gap-5">
        <ScoreGauge score={stub.taime_score} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-zinc-400 tracking-widest mb-1.5">
            TREND {stub.rank}
          </p>
          <h3 className="text-lg font-bold text-zinc-900 leading-snug">{title}</h3>
        </div>
      </div>

      {/* Corpo: skeleton borrado (sem o conteúdo real) + overlay com CTA */}
      <div className="relative">
        <div aria-hidden="true" className="px-8 py-8 space-y-5 filter blur-[3px] select-none pointer-events-none">
          {/* Skeleton de seção: títulos de blocos + linhas de texto fake */}
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <div className="h-2.5 w-28 rounded bg-zinc-200" />
              <div className="h-3 w-full rounded bg-zinc-100" />
              <div className="h-3 w-11/12 rounded bg-zinc-100" />
              <div className="h-3 w-9/12 rounded bg-zinc-100" />
            </div>
          ))}
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white/95 backdrop-blur-sm border border-zinc-200 rounded-2xl shadow-sm px-6 py-5 max-w-sm text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 className="mx-auto mb-3 text-taime-600">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-sm font-semibold text-zinc-900 mb-1">
              {isPt ? 'Conteúdo exclusivo de assinantes' : 'Subscriber-only content'}
            </p>
            <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
              {isPt
                ? 'Esta amostra libera apenas uma tendência. As demais ficam disponíveis no plano completo.'
                : 'This sample unlocks one trend. The remaining trends are available with a subscription.'}
            </p>
            <Link href={ctaHref} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                                            bg-taime-600 text-white text-xs font-semibold
                                            hover:bg-taime-700 transition-colors">
              {ctaLabel}
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

// ─── Main report client component ─────────────────────────────────────────────

export interface PublicUnlock {
  unlockedRank: number
  lockedStubs:  LockedTrendStub[]
}

export default function ReportClient({
  report,
  trends,
  savedScrollPct = 0,
  accessLevel,
  plan,
  publicUnlock,
}: {
  report: Report
  trends: ReportTrend[]
  savedScrollPct?: number
  accessLevel?: AccessLevel
  plan?: Plan | null
  publicUnlock?: PublicUnlock | null
}) {
  const [lang, setLang] = useState<Lang>('pt-BR')
  const isPt = lang === 'pt-BR'

  // Preview = não pode ver o relatório completo (visitante, free, ou essential
  // fora da janela de 1 ano). Quando undefined (callers antigos), libera tudo.
  // No modo publicUnlock (rota /r), ignoramos isPreview — esse modo tem sua
  // própria UX (resumo completo + 1 trend + demais borradas com CTA).
  const isPreview = !publicUnlock && (accessLevel ? !accessLevel.canSeeFullReport : false)
  const isPublic  = !!publicUnlock

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)taime-locale=([^;]+)/)
    setLang(match?.[1] === 'en' ? 'en' : 'pt-BR')
  }, [])

  // ─── Restaurar posição de leitura (retomar de onde parou) ───────────────────
  useEffect(() => {
    if (isPreview || isPublic) return
    if (!savedScrollPct || savedScrollPct < 1) return
    // espera o conteúdo renderizar antes de calcular a altura total
    const t = setTimeout(() => {
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      const target = (savedScrollPct / 100) * max
      window.scrollTo({ top: target, behavior: 'smooth' })
    }, 300)
    return () => clearTimeout(t)
  }, [savedScrollPct, isPreview, isPublic])

  // ─── Reading progress tracking ──────────────────────────────────────────────
  useEffect(() => {
    if (isPreview || isPublic) return
    const reportId = report.id

    const send = (scrollPct: number, completed: boolean) =>
      fetch('/api/reading-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, scrollPct, completed }),
        keepalive: true, // garante envio mesmo ao fechar a aba
      }).catch(() => {})

    // marca a abertura imediatamente
    send(0, false)

    let last = 0
    const onScroll = () => {
      const now = Date.now()
      if (now - last < 3000) return // throttle 3s
      last = now

      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      const pct = max > 0 ? (el.scrollTop / max) * 100 : 0
      send(pct, pct >= 90)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [report.id, isPreview, isPublic])

  const title   = isPt ? report.title_pt_br : report.title_en
  const summary = isPt ? report.executive_summary_pt_br : report.executive_summary_en

  // ─── Preview público / acesso bloqueado ────────────────────────────────────
  if (isPreview) {
    const reason: AccessReason = accessLevel?.reason ?? 'visitor'
    const noAccess = !accessLevel?.canSeePreview // strategic_only / out_of_range
    const firstPara = summary.split('\n\n')[0] ?? ''
    const avgScore  = trends.length > 0
      ? Math.round(trends.reduce((acc, t) => acc + t.taime_score, 0) / trends.length)
      : 0

    const PT = {
      visitor: {
        label: 'PREVIEW',
        title: 'Solicite acesso para ler o relatório completo',
        sub:   'Cadastre-se para receber acesso completo aos relatórios.',
        btn:   'Solicitar acesso →',
        href:  '/login',
      },
      free_limit_reached: {
        label: 'LIMITE ATINGIDO',
        title: 'Você atingiu seu limite de 2 relatórios este mês.',
        sub:   'Faça upgrade para Essencial ou Estratégico para acesso ilimitado.',
        btn:   'Ver planos →',
        href:  '/planos',
      },
      too_old_for_plan: {
        label: 'PREVIEW',
        title: 'Este relatório está fora do período do seu plano.',
        sub:   'Essencial cobre relatórios de até 1 ano. Faça upgrade para Estratégico para o histórico completo.',
        btn:   'Ver planos →',
        href:  '/planos',
      },
      strategic_only: {
        label: 'EXCLUSIVO ESTRATÉGICO',
        title: 'Este relatório está disponível apenas no plano Estratégico.',
        sub:   'O histórico completo é exclusivo dos assinantes Estratégicos.',
        btn:   'Ver planos →',
        href:  '/planos',
      },
      out_of_range: {
        label: 'INDISPONÍVEL',
        title: 'Este relatório não está disponível no seu plano.',
        sub:   'Faça upgrade para acessar relatórios anteriores.',
        btn:   'Ver planos →',
        href:  '/planos',
      },
      preview_only: {
        label: 'PREVIEW',
        title: 'Apenas o preview deste relatório está disponível.',
        sub:   'Faça upgrade para ler o conteúdo completo.',
        btn:   'Ver planos →',
        href:  '/planos',
      },
      full: { label: '', title: '', sub: '', btn: '', href: '/' }, // unreachable
    } as const

    const EN = {
      visitor: {
        label: 'PREVIEW',
        title: 'Request access to read the full report',
        sub:   'Sign up to get full access to the reports.',
        btn:   'Request access →',
        href:  '/login',
      },
      free_limit_reached: {
        label: 'LIMIT REACHED',
        title: 'You have reached your monthly limit of 2 reports.',
        sub:   'Upgrade to Essential or Strategic for unlimited access.',
        btn:   'View plans →',
        href:  '/planos',
      },
      too_old_for_plan: {
        label: 'PREVIEW',
        title: 'This report is outside your plan window.',
        sub:   'Essential covers reports up to 1 year old. Upgrade to Strategic for the full archive.',
        btn:   'View plans →',
        href:  '/planos',
      },
      strategic_only: {
        label: 'STRATEGIC ONLY',
        title: 'This report is available only on the Strategic plan.',
        sub:   'The full archive is exclusive to Strategic subscribers.',
        btn:   'View plans →',
        href:  '/planos',
      },
      out_of_range: {
        label: 'UNAVAILABLE',
        title: 'This report is not available on your plan.',
        sub:   'Upgrade your plan to access earlier reports.',
        btn:   'View plans →',
        href:  '/planos',
      },
      preview_only: {
        label: 'PREVIEW',
        title: 'Only the preview of this report is available.',
        sub:   'Upgrade to read the full content.',
        btn:   'View plans →',
        href:  '/planos',
      },
      full: { label: '', title: '', sub: '', btn: '', href: '/' }, // unreachable
    } as const

    const cta = (isPt ? PT : EN)[reason]

    return (
      <div className="min-h-screen bg-zinc-50">
        {/* Sticky header */}
        <header className="bg-white border-b border-zinc-200 px-6 py-3 sticky top-0 z-20">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/" className="font-bold text-lg tracking-tight text-zinc-900 shrink-0">
                TAIME
              </Link>
              <span className="text-zinc-200">·</span>
              <span className="text-sm text-zinc-500 truncate hidden sm:block">{title}</span>
            </div>
            <LanguageSelector />
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
          {/* Header do relatório: período + título sempre visíveis */}
          <div className="bg-white rounded-2xl border border-zinc-200 px-8 py-8">
            <p className="text-xs font-bold text-zinc-400 tracking-widest mb-3">
              {formatPeriod(report.period, lang).toUpperCase()}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 leading-snug mb-6">
              {title}
            </h1>

            {/* Score geral + 1º parágrafo só quando há preview permitido */}
            {!noAccess && (
              <>
                <div className="flex items-center gap-4 mb-6">
                  <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-2xl ring-2 shrink-0 ${scoreRing(avgScore)}`}>
                    <span className={`text-3xl font-bold tabular-nums leading-none ${scoreColor(avgScore)}`}>{avgScore}</span>
                    <span className="text-[9px] text-zinc-400 font-bold tracking-widest mt-0.5">SCORE</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-400 tracking-widest mb-1">{isPt ? 'TAIME SCORE GERAL' : 'OVERALL TAIME SCORE'}</p>
                    <p className="text-sm text-zinc-500">
                      {isPt
                        ? `Média de ${trends.length} trend${trends.length !== 1 ? 's' : ''} neste período`
                        : `Average of ${trends.length} trend${trends.length !== 1 ? 's' : ''} in this period`}
                    </p>
                  </div>
                </div>

                {firstPara && (
                  <p className="prose-taime text-sm leading-relaxed text-zinc-700">{firstPara}</p>
                )}
              </>
            )}
          </div>

          {/* Lista de trends com título + score (apenas quando há preview) */}
          {!noAccess && (
            <div className="bg-white rounded-2xl border border-zinc-200 px-8 py-6">
              <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-4">
                {isPt ? `${trends.length} TRENDS NESTE PERÍODO` : `${trends.length} TRENDS IN THIS PERIOD`}
              </p>
              <ul className="divide-y divide-zinc-100">
                {trends.map(trend => {
                  const tTitle = isPt ? trend.title_pt_br : trend.title_en
                  return (
                    <li key={trend.id} className="flex items-center gap-4 py-3">
                      <div className={`w-12 h-12 rounded-xl ring-2 shrink-0 flex flex-col items-center justify-center ${scoreRing(trend.taime_score)}`}>
                        <span className={`text-base font-bold tabular-nums leading-none ${scoreColor(trend.taime_score)}`}>{trend.taime_score}</span>
                      </div>
                      <p className="text-sm font-semibold text-zinc-800 leading-snug">{tTitle}</p>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* CTA contextualizado por reason */}
          <div className="rounded-2xl bg-taime-900 text-white p-8">
            <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-3">{cta.label}</p>
            <h2 className="text-xl sm:text-2xl font-bold mb-3 leading-snug">{cta.title}</h2>
            <p className="text-sm text-white/60 leading-relaxed mb-6">{cta.sub}</p>
            <Link
              href={cta.href}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-taime-900 text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              {cta.btn}
            </Link>
          </div>
        </main>

        <footer className="max-w-5xl mx-auto px-6 py-8 text-xs text-zinc-400 text-center">
          TAIME · {formatPeriod(report.period, lang)}
        </footer>
      </div>
    )
  }
  // ─── Acesso completo (essential dentro da janela, strategic, ou sem accessLevel) ─

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sticky header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <a href={isPublic ? '/' : '/dashboard'} className="font-bold text-lg tracking-tight text-zinc-900 shrink-0">
              TAIME
            </a>
            <span className="text-zinc-200">·</span>
            <span className="text-sm text-zinc-500 truncate hidden sm:block">{title}</span>
          </div>

          {isPublic ? (
            <Link href="/planos" className="text-xs font-semibold text-taime-600 hover:text-taime-700 transition-colors px-3 py-1.5 rounded-lg border border-taime-200 hover:bg-taime-50">
              {isPt ? 'Assinar' : 'Subscribe'} →
            </Link>
          ) : (
            <LanguageSelector />
          )}
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
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 leading-snug mb-2">
            {title}
          </h1>
          {report.report_number && report.report_number > 1 && (
            <p className="text-sm text-zinc-400 mb-6">
              {isPt
                ? `Relatório ${report.report_number} do período ${report.period_label || formatPeriod(report.period, 'pt-BR')}`
                : `Report ${report.report_number} for ${report.period_label || formatPeriod(report.period, 'en')}`}
            </p>
          )}
          <div className="prose-taime text-sm leading-relaxed text-zinc-700 space-y-4 mt-6">
            {summary.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>

        {/* Trends */}
        {isPublic && publicUnlock ? (() => {
          // Modo público: interleava as trends desbloqueadas (vêm em `trends`)
          // com os stubs das bloqueadas, em ordem de rank.
          type Slot =
            | { kind: 'trend'; rank: number; trend: ReportTrend }
            | { kind: 'stub';  rank: number; stub: LockedTrendStub }
          const slots: Slot[] = [
            ...trends.map(t => ({ kind: 'trend' as const, rank: t.rank, trend: t })),
            ...publicUnlock.lockedStubs.map(s => ({ kind: 'stub' as const, rank: s.rank, stub: s })),
          ].sort((a, b) => a.rank - b.rank)

          return slots.map(slot =>
            slot.kind === 'trend'
              ? <TrendSection key={`t-${slot.trend.id}`} trend={slot.trend} lang={lang} period={report.period} />
              : <LockedTrendTeaser key={`s-${slot.rank}`} stub={slot.stub} lang={lang} />,
          )
        })() : trends.map(trend => (
          <TrendSection key={trend.id} trend={trend} lang={lang} period={report.period} />
        ))}

        {/* Modo público: CTA final para conversão */}
        {isPublic && (
          <div className="rounded-2xl bg-gradient-to-br from-taime-900 to-taime-700 text-white px-8 py-10 text-center">
            <p className="text-[10px] font-bold tracking-widest text-white/60 mb-3">
              {isPt ? 'AMOSTRA PÚBLICA' : 'PUBLIC SAMPLE'}
            </p>
            <h2 className="text-xl sm:text-2xl font-bold mb-3 leading-snug">
              {isPt
                ? 'Você leu uma tendência. Há mais ' + publicUnlock!.lockedStubs.length + ' neste relatório.'
                : 'You read one trend. There are ' + publicUnlock!.lockedStubs.length + ' more in this report.'}
            </h2>
            <p className="text-sm text-white/70 max-w-xl mx-auto mb-6 leading-relaxed">
              {isPt
                ? 'Assine o TAIME para acesso completo a este e todos os relatórios, com framework de decisão, scoring e memória temporal.'
                : 'Subscribe to TAIME for full access to this and all reports, with decision framework, scoring and temporal memory.'}
            </p>
            <Link href="/planos" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg
                                            bg-white text-taime-900 text-sm font-semibold
                                            hover:bg-white/90 transition-colors">
              {isPt ? 'Ver planos' : 'View plans'} →
            </Link>
          </div>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-8 text-xs text-zinc-400 text-center">
        TAIME · {formatPeriod(report.period, lang)}
      </footer>
    </div>
  )
}
