import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createSupabaseServer } from '@/lib/supabase-server'

export const metadata: Metadata = {
  alternates: {
    canonical: 'https://www.taime.tech',
  },
}
import { getTranslations, detectLocale } from '@/lib/i18n'
import { formatPeriod, scoreColor } from '@/lib/types'
import type { TaimeFramework, ThenNowNext } from '@/lib/types'
import Navbar from '@/components/Navbar'
import FaqAccordion from '@/components/FaqAccordion'
import RadarFeed from '@/components/RadarFeed'
import Footer from '@/components/Footer'
import HomeSearch from '@/components/HomeSearch'
import { ScoreGauge, ScoreDimensionsPanel, ThenNowNextPanel } from '@/components/ReportVisuals'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LandingReport {
  id: string
  period: string
  period_label: string | null
  period_type:  string | null
  title_pt_br: string
  title_en: string
  executive_summary_pt_br: string
  executive_summary_en: string
  published_at: string
}

interface TopTrend {
  id: string
  report_id: string
  rank: number
  title_pt_br: string
  title_en: string
  taime_score: number
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en:    TaimeFramework | null
  then_now_next_pt_br:   ThenNowNext | null
  then_now_next_en:      ThenNowNext | null
  // Embedido via PostgREST `reports(period)` para alimentar o ThenNowNextPanel.
  reports:               { period: string } | null
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

async function getLatestReports(): Promise<LandingReport[]> {
  try {
    const res = await fetch(`${SITE_URL}/api/reports/latest`, { cache: 'no-store' })
    return await res.json()
  } catch { return [] }
}

async function getTopTrends(): Promise<TopTrend[]> {
  try {
    const res = await fetch(`${SITE_URL}/api/trends/top`, { cache: 'no-store' })
    return await res.json()
  } catch { return [] }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstWords(text: string | null | undefined, n: number): string {
  if (!text) return ''
  const words = text.trim().split(/\s+/)
  if (words.length <= n) return words.join(' ')
  return words.slice(0, n).join(' ') + '...'
}

function stripPeriodLabel(text: string | null | undefined): string {
  if (!text) return ''
  const lines = text.split('\n')
  if (lines[0].trim().startsWith('PERIOD_LABEL:')) {
    return lines.slice(1).join('\n').trim()
  }
  return text
}

function scoreBadgeLabel(score: number, isEn: boolean): string {
  if (score >= 80) return isEn ? 'Executive Priority'  : 'Prioridade Executiva'
  if (score >= 60) return isEn ? 'High Relevance'      : 'Alta Relevância'
  if (score >= 40) return isEn ? 'Active Monitoring'   : 'Monitoramento Ativo'
  return isEn ? 'Early Signal' : 'Sinal Inicial'
}

function scoreRingCls(score: number): string {
  if (score >= 85) return 'ring-emerald-200 bg-emerald-50'
  if (score >= 70) return 'ring-taime-200 bg-taime-50'
  if (score >= 50) return 'ring-amber-200 bg-amber-50'
  return 'ring-zinc-200 bg-zinc-50'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const locale = detectLocale((await cookies()).get('taime-locale')?.value)
  const t = getTranslations(locale)
  const h = t.home

  let isLoggedIn = false
  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    isLoggedIn = !!user
  } catch {
    isLoggedIn = false
  }

  const [reports, topTrends] = await Promise.all([getLatestReports(), getTopTrends()])
  const report      = reports[0] ?? null
  const isEn        = locale === 'en'
  const lang        = isEn ? 'en' : 'pt-BR'

  // ── Showcase: trend de maior score com dados completos no idioma ativo. ─
  // Fallback: vai descendo a lista até achar uma com framework.score_dimensions
  // + then_now_next + period embedidos. Se nada bater, a seção não renderiza.
  // Pula topTrends[0] — essa é a trend usada pelo mockup "O que é o TAIME".
  // O showcase pega a próxima com dados completos no idioma ativo, para
  // que o visitante veja DUAS trends diferentes na home.
  const showcase = topTrends.find((tr, idx) => {
    if (idx === 0) return false
    const fw  = isEn ? tr.taime_framework_en : tr.taime_framework_pt_br
    const tnn = isEn ? tr.then_now_next_en   : tr.then_now_next_pt_br
    return !!fw?.score_dimensions && !!tnn?.then && !!tnn?.now && !!tnn?.next && !!tr.reports?.period
  }) ?? null
  const showcaseFw     = showcase ? (isEn ? showcase.taime_framework_en : showcase.taime_framework_pt_br) : null
  const showcaseTnn    = showcase ? (isEn ? showcase.then_now_next_en   : showcase.then_now_next_pt_br)   : null
  const showcaseTitle  = showcase ? (isEn ? showcase.title_en           : showcase.title_pt_br)           : ''
  const showcaseHref   = showcase ? (isLoggedIn ? `/reports/${showcase.report_id}` : '/login')            : '/login'

  // Mockup data: top trend by score (rank 1 da query)
  const firstTrend    = topTrends[0] ?? null
  const fwMockup      = isEn ? firstTrend?.taime_framework_en   : firstTrend?.taime_framework_pt_br
  const tnnMockup     = isEn ? firstTrend?.then_now_next_en     : firstTrend?.then_now_next_pt_br
  const mockupScore   = firstTrend?.taime_score ?? 87
  const mockupTitle   = firstTrend
    ? (isEn ? firstTrend.title_en : firstTrend.title_pt_br)
    : (isEn ? 'AI Agentic: Convergence and Market Disruption' : 'IA Agêntica: Convergência e Ruptura de Mercado')
  const mockupDims: [string, number][] = fwMockup?.score_dimensions
    ? [
        ['Strategic Impact',     fwMockup.score_dimensions.strategic_impact.score],
        ['Competitive Pressure', fwMockup.score_dimensions.competitive_pressure.score],
        ['Market Maturity',      fwMockup.score_dimensions.market_maturity.score],
      ]
    : [
        ['Strategic Impact',     92],
        ['Competitive Pressure', 87],
        ['Market Maturity',      79],
      ]
  const mockupFwItems = fwMockup
    ? [
        { step: 'TYPE',   val: firstWords(fwMockup.type,   3) },
        { step: 'ACT',    val: firstWords(fwMockup.act,    2) },
        { step: 'IMPACT', val: firstWords(fwMockup.impact, 2) },
        { step: 'MOVE',   val: firstWords(fwMockup.move,   2) },
        { step: 'EXIT',   val: firstWords(fwMockup.exit,   3) },
      ]
    : [
        { step: 'TYPE',   val: isEn ? 'Rupture'    : 'Ruptura' },
        { step: 'ACT',    val: isEn ? 'Commit'     : 'Comprometer' },
        { step: 'IMPACT', val: isEn ? 'High'       : 'Alto' },
        { step: 'MOVE',   val: isEn ? 'Deploy'     : 'Implantar' },
        { step: 'EXIT',   val: isEn ? 'NPS < 40'   : 'NPS < 40' },
      ]
  const mockupTnn = tnnMockup
    ? [
        { label: 'THEN', val: firstWords(stripPeriodLabel(tnnMockup.then), 6) },
        { label: 'NOW',  val: firstWords(tnnMockup.now,  6) },
        { label: 'NEXT', val: firstWords(tnnMockup.next, 6) },
      ]
    : [
        { label: 'THEN', val: isEn ? 'Incumbents dominated'  : 'Incumbentes dominavam' },
        { label: 'NOW',  val: isEn ? 'Agents in production'  : 'Agentes em produção' },
        { label: 'NEXT', val: isEn ? 'Market standard'       : 'Padrão de mercado' },
      ]

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── SEÇÃO 1: HERO ─────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold
                           bg-taime-50 text-taime-600 ring-1 ring-taime-100 mb-8">
            {h.badge}
          </span>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-zinc-900 leading-[1.08] mb-6">
            {h.hero[0]}<br />
            <span className="text-taime-600">{h.hero[1]}</span><br />
            {h.hero[2]}
          </h1>

          <p className="text-xl text-zinc-500 leading-relaxed mb-4 max-w-2xl">{h.heroBody}</p>
          <p className="text-sm text-zinc-400 mb-10 font-medium">{h.heroSub}</p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <a href="#preview" className="btn-primary text-base px-7 py-3">{h.ctaPrimary}</a>
            <Link href={isLoggedIn ? '/dashboard' : '/login'} className="btn-secondary text-base px-7 py-3">{h.ctaSecondary}</Link>
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 2: A DOR ────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-10">{h.painsLabel}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {h.pains.map(({ title, desc }) => (
              <div key={title} className="bg-white rounded-xl border border-zinc-200 p-6">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-4">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                </div>
                <h3 className="text-base font-bold text-zinc-900 mb-2">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 3: O QUE É ──────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="section-label mb-3">{h.whatLabel}</p>
              <h2 className="text-3xl font-bold text-zinc-900 mb-6 leading-snug">
                {h.whatTitle.split('\n').map((line, i) => (
                  <span key={i}>{line}{i < h.whatTitle.split('\n').length - 1 && <br />}</span>
                ))}
              </h2>
              <p className="text-zinc-500 text-base leading-relaxed mb-6">{h.whatBody}</p>
              <ul className="space-y-3">
                {h.whatPoints.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-zinc-700">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-taime-50 text-taime-600
                                     flex items-center justify-center text-[10px] font-bold mt-0.5">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual mockup — dados reais quando disponíveis */}
            <div className="bg-zinc-50 rounded-2xl border border-zinc-200 overflow-hidden">
              <div className="bg-taime-900 px-6 py-4">
                <p className="text-[10px] font-bold tracking-widest text-white/40 mb-1">
                  {isEn ? 'TAIME · EXECUTIVE REPORT' : 'TAIME · RELATÓRIO EXECUTIVO'}
                </p>
                <p className="text-white font-semibold text-sm leading-snug line-clamp-2">
                  {mockupTitle}
                </p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ring-2 ${scoreRingCls(mockupScore)}`}>
                    <span className={`font-bold text-xl tabular-nums leading-none ${scoreColor(mockupScore)}`}>{mockupScore}</span>
                    <span className="text-[8px] text-zinc-400 font-bold tracking-wide">SCORE</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 tracking-widest">TAIME SCORE</p>
                    <p className="text-xs text-zinc-600">{scoreBadgeLabel(mockupScore, isEn)}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {mockupDims.map(([label, score]) => (
                    <div key={label}>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-zinc-500">{label}</span>
                        <span className="font-semibold text-zinc-700">{score}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                        <div className="h-full bg-taime-600 rounded-full score-bar" style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-zinc-100">
                  <p className="text-[9px] font-bold tracking-widest text-zinc-400 mb-2">TYPE → ACT → IMPACT → MOVE → EXIT</p>
                  <div className="flex gap-1">
                    {mockupFwItems.map(({ step, val }) => (
                      <div key={step} className="flex-1 bg-white border border-zinc-100 rounded-lg px-1 py-1.5 text-center">
                        <p className="text-[7px] font-bold text-zinc-400 leading-none">{step}</p>
                        <p className="text-[8px] font-semibold text-zinc-700 mt-0.5 truncate">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-100">
                  <div className="flex gap-2">
                    {mockupTnn.map(({ label, val }) => (
                      <div key={label} className="flex-1 bg-zinc-50 border border-zinc-100 rounded-lg p-2 text-center">
                        <p className="text-[8px] font-bold text-zinc-400">{label}</p>
                        <p className="text-[9px] text-zinc-500 mt-0.5 leading-snug">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end px-6 py-3 border-t border-zinc-200">
                <Link
                  href={report ? (isLoggedIn ? `/reports/${report.id}` : '/login') : '/login'}
                  className="text-xs font-semibold text-taime-600 hover:text-taime-700 transition-colors"
                >
                  {isEn ? 'View full report →' : 'Ver relatório completo →'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 4: PARA QUEM ────────────────────────────────────────── */}
      <section className="bg-zinc-50 border-t border-zinc-100 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.forWhoLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-10">{h.forWhoTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {h.personas.map(({ role, desc }) => (
              <div key={role} className="bg-white rounded-xl border border-zinc-200 p-6">
                <h3 className="text-base font-bold text-zinc-900 mb-2">{role}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 5: MEMÓRIA 25 ANOS ──────────────────────────────────── */}
      <section className="bg-taime-900 py-28">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-bold tracking-widest text-white/30 mb-4 uppercase">{h.memBadge}</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-5 leading-snug">{h.memTitle}</h2>
          <p className="text-white/60 text-lg leading-relaxed mb-12 max-w-2xl">{h.memBody}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {h.memCards.map(({ badge, title, subtitle, desc }) => (
              <div key={title} className="bg-white/5 border border-white/10 rounded-2xl p-8 sm:p-10 flex flex-col gap-4">
                <p className="text-[11px] font-bold tracking-widest text-taime-600 uppercase">{badge}</p>
                <h3 className="text-3xl sm:text-4xl font-bold text-white leading-tight tabular-nums">{title}</h3>
                <p className="text-base text-white/60 leading-snug">{subtitle}</p>
                <div className="h-px bg-white/10 my-1" />
                <p className="text-sm text-white/55 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <Link href={isLoggedIn ? '/dashboard' : '/login'} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg
                                         bg-white/10 text-white text-sm font-medium
                                         hover:bg-white/20 transition-colors border border-white/20">
            {h.memCta}
          </Link>
        </div>
      </section>

      {/* ── SEÇÃO 6: RELATÓRIOS RECENTES ──────────────────────────────── */}
      <section id="preview" className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-6">
            {reports.length <= 1
              ? (isEn ? 'Latest published report' : 'Último relatório publicado')
              : (isEn ? 'Latest published reports' : 'Últimos relatórios publicados')}
          </p>
          {reports.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {reports.map(r => {
                const rTitle   = isEn ? (r.title_en ?? r.title_pt_br) : r.title_pt_br
                const rSummary = isEn ? (r.executive_summary_en ?? r.executive_summary_pt_br) : r.executive_summary_pt_br
                const rPreview = rSummary.length > 160 ? rSummary.slice(0, 160).trimEnd() + '...' : rSummary
                const rHref    = isLoggedIn ? `/reports/${r.id}` : '/login'
                return (
                  <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden flex flex-col">
                    <div className="bg-taime-900 px-6 py-5">
                      <p className="text-xs font-bold text-white/30 tracking-widest mb-2 uppercase">
                        {formatPeriod(r.period, isEn ? 'en' : 'pt-BR')}
                      </p>
                      <h3 className="text-sm font-bold text-white leading-snug line-clamp-3">
                        {rTitle}
                      </h3>
                    </div>
                    <div className="px-6 py-5 flex flex-col gap-4 flex-1">
                      {rPreview && (
                        <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3 flex-1">{rPreview}</p>
                      )}
                      <Link
                        href={rHref}
                        className="text-xs font-semibold text-taime-600 hover:text-taime-700 transition-colors"
                      >
                        {isEn ? 'Access full analysis →' : 'Acessar análise completa →'}
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center text-zinc-400">
              {h.previewEmpty}
            </div>
          )}
        </div>
      </section>

      {/* ── SEÇÃO 7: COMO FUNCIONA ─────────────────────────────────────── */}
      <section id="como-funciona" className="bg-zinc-50 border-t border-zinc-100 py-24">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.howLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-12">{h.howTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {h.howSteps.map(({ num, title, desc }) => (
              <div key={num}>
                <div className="text-5xl font-bold text-zinc-100 tabular-nums mb-4 leading-none select-none">{num}</div>
                <h3 className="text-lg font-bold text-zinc-900 mb-2">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 8: CATEGORIAS ───────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.catLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-10">{h.catTitle}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {h.categories.map(({ icon, name }) => (
              <div key={name} className="bg-white rounded-xl border border-zinc-200 p-5 flex flex-col
                                         items-start gap-3 hover:border-taime-200 hover:bg-taime-50/30 transition-colors">
                <span className="text-2xl leading-none">{icon}</span>
                <p className="text-sm font-semibold text-zinc-800 leading-snug">{name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 8b: TAIME EM AÇÃO (exemplo real) ─────────────────────── */}
      {showcase && showcaseFw?.score_dimensions && showcaseTnn && showcase.reports && (
        <section className="py-24 border-t border-zinc-100">
          <div className="max-w-5xl mx-auto px-6">
            <p className="section-label mb-3">
              {isEn ? 'Live example' : 'Exemplo real'}
            </p>
            <h2 className="text-3xl font-bold text-zinc-900 mb-3">
              {isEn ? 'See TAIME in action' : 'Veja o TAIME em ação'}
            </h2>
            <p className="text-sm text-zinc-500 max-w-2xl mb-10 leading-relaxed">
              {isEn
                ? 'Each trend gets a TAIME Score broken into 5 dimensions and a THEN / NOW / NEXT temporal reading. Below is the highest-scored trend from our published reports — exactly as a paying customer sees it.'
                : 'Cada tendência recebe um TAIME Score em 5 dimensões e uma leitura temporal THEN / NOW / NEXT. Abaixo está a tendência de maior score dos relatórios publicados — exatamente como o assinante vê.'}
            </p>

            <Link
              href={showcaseHref}
              className="block rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8
                         hover:border-taime-200 hover:shadow-sm transition-all group"
            >
              {/* Título + gauge */}
              <div className="flex items-start gap-5 mb-6">
                <ScoreGauge score={showcase.taime_score} />
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-[10px] font-bold tracking-widest text-taime-600 uppercase mb-2">
                    {isEn ? 'Featured trend' : 'Tendência em destaque'}
                  </p>
                  <h3 className="text-lg sm:text-xl font-bold text-zinc-900 leading-snug
                                 group-hover:text-taime-700 transition-colors">
                    {showcaseTitle}
                  </h3>
                </div>
              </div>

              {/* 5 dimensões */}
              <div className="mb-6">
                <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-3">
                  {isEn ? '5 dimensions' : '5 dimensões'}
                </p>
                <ScoreDimensionsPanel dims={showcaseFw.score_dimensions} lang={lang} />
              </div>

              {/* THEN / NOW / NEXT */}
              <div>
                <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-3">
                  Then · Now · Next
                </p>
                <ThenNowNextPanel
                  tnn={showcaseTnn}
                  period={showcase.reports.period}
                  lang={lang}
                />
              </div>

              <p className="mt-6 text-xs font-semibold text-taime-600 group-hover:text-taime-700 transition-colors">
                {isLoggedIn
                  ? (isEn ? 'Read the full report →' : 'Ler o relatório completo →')
                  : (isEn ? 'Sign in to read the full report →' : 'Entrar para ler o relatório completo →')}
              </p>
            </Link>
          </div>
        </section>
      )}

      {/* ── SEÇÃO 9: TRENDS EM DESTAQUE ───────────────────────────────── */}
      <section className="bg-zinc-50 border-t border-zinc-100 py-24">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.trendsLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-10">{h.trendsTitle}</h2>
          <HomeSearch trends={topTrends} isLoggedIn={isLoggedIn} locale={locale} trendsCta={h.trendsCta} trendsEmpty={h.trendsEmpty} />
        </div>
      </section>

      {/* ── SEÇÃO 10: LINHA DO TEMPO ───────────────────────────────────── */}
      <section className="py-24 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.tlLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-12">{h.tlTitle}</h2>
          <div className="relative">
            <div className="absolute top-[22px] left-0 right-0 h-0.5 bg-zinc-200 hidden sm:block" />
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-6 sm:gap-4">
              {h.milestones.map(({ year, label }, i) => (
                <div key={year} className="flex sm:flex-col items-start sm:items-start gap-4 sm:gap-2">
                  <div className="relative flex items-center justify-center shrink-0">
                    <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center z-10 bg-white
                                    ${i === 5 ? 'border-taime-600 bg-taime-50' : 'border-zinc-300'}`}>
                      <span className={`text-[10px] font-bold tabular-nums ${i === 5 ? 'text-taime-600' : 'text-zinc-500'}`}>
                        {year}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed sm:mt-2">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 11: FAQ ─────────────────────────────────────────────── */}
      <section className="bg-zinc-50 border-t border-zinc-100 py-24">
        <div className="max-w-3xl mx-auto px-6">
          <p className="section-label mb-3">{h.faqLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-10">{h.faqTitle}</h2>
          <FaqAccordion items={t.faq.items as unknown as { q: string; a: string }[]} />
        </div>
      </section>

      {/* ── RADAR TAIME ───────────────────────────────────────────────── */}
      <RadarFeed />

      {/* ── SEÇÃO 12: PLANOS ──────────────────────────────────────────── */}
      <section id="planos" className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.plansLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-3">{h.plansTitle}</h2>
          <p className="text-sm text-zinc-400 mb-12">{h.plansSub}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            {h.plans.map(({ name, price, badge, desc, features, cta, href, highlight }) => (
              <div key={name} className={`relative rounded-2xl border p-6 flex flex-col gap-5
                ${highlight ? 'border-taime-600 bg-taime-50 ring-1 ring-taime-600' : 'border-zinc-200 bg-white'}`}>
                {badge && (
                  <span className="absolute -top-3 left-6 px-3 py-0.5 rounded-full text-[11px]
                                   font-bold bg-taime-600 text-white">{badge}</span>
                )}
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 mb-1">{name}</h3>
                  {price
                    ? <p className="text-2xl font-bold text-zinc-900 tabular-nums">{price}</p>
                    : <p className="text-2xl font-bold text-zinc-400">Grátis</p>
                  }
                  <p className="text-sm text-zinc-500 mt-1">{desc}</p>
                </div>
                <ul className="space-y-2 flex-1">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                      <span className="shrink-0 text-taime-600 font-bold mt-0.5">✓</span>{f}
                    </li>
                  ))}
                </ul>
                {href.startsWith('#') ? (
                  <a href={href} className={highlight ? 'btn-primary justify-center py-3' : 'btn-secondary justify-center py-3'}>{cta}</a>
                ) : (
                  <Link href={href} className={highlight ? 'btn-primary justify-center py-3' : 'btn-secondary justify-center py-3'}>{cta}</Link>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-zinc-400">{h.plansNote}</p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
