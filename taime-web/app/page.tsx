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

// Relatório marcado is_public=true no Supabase, exposto pela rota /r/[id].
// Usado como link do showcase para visitantes anônimos: em vez de mandá-los
// para /login, abre direto a amostra (resumo completo + 1 trend liberada).
const PUBLIC_SAMPLE_REPORT_ID = '48c29bb6-6dee-46a1-987b-bb08bd775ab0'

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
  const showcaseHref   = showcase
    ? (isLoggedIn ? `/reports/${showcase.report_id}` : `/r/${PUBLIC_SAMPLE_REPORT_ID}`)
    : '/login'

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

  // 4 mini-cards de dimensão para o mockup do hero (dados reais quando há)
  const heroDimLabels = isEn
    ? { cp: 'Competitive Pressure', si: 'Strategic Impact', lr: 'Lag Risk',           mm: 'Market Maturity' }
    : { cp: 'Pressão Competitiva',  si: 'Impacto Estratégico', lr: 'Risco de Atraso', mm: 'Maturidade' }

  const heroDims: [string, number][] = fwMockup?.score_dimensions
    ? [
        [heroDimLabels.cp, fwMockup.score_dimensions.competitive_pressure.score],
        [heroDimLabels.si, fwMockup.score_dimensions.strategic_impact.score],
        [heroDimLabels.lr, fwMockup.score_dimensions.competitive_lag_risk.score],
        [heroDimLabels.mm, fwMockup.score_dimensions.market_maturity.score],
      ]
    : [
        [heroDimLabels.cp, 87],
        [heroDimLabels.si, 92],
        [heroDimLabels.lr, 84],
        [heroDimLabels.mm, 79],
      ]

  // Movimento recomendado: 1 frase compacta do framework real
  const heroMove = fwMockup?.move
    ? firstWords(fwMockup.move, 14)
    : (isEn
        ? 'Appoint a PM with a 90-day mandate to deploy production agents.'
        : 'Nomeie um PM com mandato de 90 dias para colocar agentes em produção.')

  // ── Terceira trend para a seção "O que é o TAIME" ──────────────────────────
  // Distinta da do hero (topTrends[0]) E da do showcase. Se nenhuma sobrar com
  // dados completos, degrada para o showcase ou para a do hero.
  const whatIsTrend = topTrends.find((tr, idx) => {
    if (idx === 0) return false                                    // hero
    if (showcase && tr.id === showcase.id) return false            // showcase
    const fw  = isEn ? tr.taime_framework_en : tr.taime_framework_pt_br
    const tnn = isEn ? tr.then_now_next_en   : tr.then_now_next_pt_br
    return !!fw?.score_dimensions && !!tnn?.then && !!tnn?.now && !!tnn?.next
  }) ?? showcase ?? firstTrend

  const whatIsFw    = whatIsTrend ? (isEn ? whatIsTrend.taime_framework_en : whatIsTrend.taime_framework_pt_br) : null
  const whatIsTitle = whatIsTrend ? (isEn ? whatIsTrend.title_en           : whatIsTrend.title_pt_br) : ''
  const whatIsScore = whatIsTrend?.taime_score ?? 0

  const whatIsDims: [string, number][] = whatIsFw?.score_dimensions
    ? [
        [heroDimLabels.cp, whatIsFw.score_dimensions.competitive_pressure.score],
        [heroDimLabels.si, whatIsFw.score_dimensions.strategic_impact.score],
        [heroDimLabels.lr, whatIsFw.score_dimensions.competitive_lag_risk.score],
        [heroDimLabels.mm, whatIsFw.score_dimensions.market_maturity.score],
      ]
    : []

  const whatIsMove = whatIsFw?.move
    ? firstWords(whatIsFw.move, 16)
    : ''

  const whatIsHref = whatIsTrend
    ? (isLoggedIn ? `/reports/${whatIsTrend.report_id}` : `/r/${PUBLIC_SAMPLE_REPORT_ID}`)
    : '/login'

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── SEÇÃO 1: HERO ESCURO COM MOCKUP DE PRODUTO ─────────────────── */}
      <section className="relative bg-taime-900 overflow-hidden">
        {/* Textura sutil de pontos */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Glow azul no topo direito */}
        <div
          aria-hidden="true"
          className="absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full
                     bg-taime-600/30 blur-3xl pointer-events-none"
        />

        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-24 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* ── Coluna esquerda: copy + CTAs ─────────────────────────── */}
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold
                               bg-taime-700/40 text-taime-200 ring-1 ring-taime-700 backdrop-blur-sm mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-taime-300" />
                {h.badge}
              </span>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-white leading-[1.08] mb-6">
                {h.hero[0]}<br />
                {h.hero[1]}<br />
                <span className="text-taime-400">{h.hero[2]}</span>
              </h1>

              <p className="text-lg text-white/70 leading-relaxed mb-10 max-w-xl">{h.heroBody}</p>

              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <Link
                  href={isLoggedIn ? '/dashboard' : '/login'}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                             bg-taime-500 text-white text-sm font-semibold
                             hover:bg-taime-400 transition-colors shadow-lg shadow-taime-500/30"
                >
                  {h.ctaPrimary}
                </Link>
                <Link
                  href={`/r/${PUBLIC_SAMPLE_REPORT_ID}`}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                             text-white text-sm font-semibold border border-white/20
                             hover:bg-white/10 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {isEn ? 'See a sample report' : 'Ver um relatório exemplo'}
                </Link>
              </div>
              <p className="text-xs text-white/50 font-medium">{h.heroSub}</p>
            </div>

            {/* ── Coluna direita: mockup do produto ─────────────────────── */}
            <div className="relative lg:pl-4">
              <div className="rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-2xl overflow-hidden
                              ring-1 ring-white/5">
                {/* Chrome de janela */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700/80 bg-zinc-900">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                  </div>
                  <p className="ml-auto text-[10px] text-zinc-500 font-mono">taime.tech/dashboard</p>
                </div>

                <div className="flex">
                  {/* Sidebar */}
                  <aside className="w-32 sm:w-36 shrink-0 border-r border-zinc-800 bg-zinc-950/40
                                    py-4 px-3 hidden sm:block">
                    <p className="text-[9px] font-bold tracking-widest text-zinc-500 mb-3 px-1">TAIME</p>
                    {[
                      { label: isEn ? 'Dashboard' : 'Dashboard', active: false },
                      { label: isEn ? 'Reports'   : 'Relatórios', active: true  },
                      { label: 'Advisor',           active: false },
                      { label: isEn ? 'Account'   : 'Conta',      active: false },
                    ].map(it => (
                      <div
                        key={it.label}
                        className={`text-[11px] py-1.5 px-2 rounded mb-0.5
                          ${it.active
                            ? 'bg-taime-500/15 text-taime-300 font-semibold'
                            : 'text-zinc-400'}`}
                      >
                        {it.label}
                      </div>
                    ))}
                  </aside>

                  {/* Main */}
                  <div className="flex-1 p-4 sm:p-5 min-w-0">
                    <p className="text-[9px] font-bold tracking-widest text-zinc-500 mb-2">
                      {isEn ? 'EXECUTIVE REPORT' : 'RELATÓRIO EXECUTIVO'}
                    </p>
                    <h3 className="text-sm font-bold text-white leading-snug mb-4 line-clamp-2">
                      {mockupTitle}
                    </h3>

                    {/* Score dimensions — 4 mini-cards */}
                    <p className="text-[9px] font-bold tracking-widest text-zinc-500 mb-2">
                      {isEn ? 'SCORE DIMENSIONS' : 'DIMENSÕES DE SCORE'}
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {heroDims.map(([label, val]) => (
                        <div key={label} className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-2.5">
                          <p className="text-[8px] text-zinc-400 tracking-wide uppercase leading-tight mb-1.5
                                        line-clamp-1">{label}</p>
                          <div className="flex items-baseline gap-2">
                            <span className={`text-lg font-bold tabular-nums leading-none
                              ${val >= 80 ? 'text-emerald-400'
                                : val >= 60 ? 'text-amber-400'
                                : 'text-orange-400'}`}>
                              {val}
                            </span>
                            <div className="flex-1 h-1 rounded-full bg-zinc-700 overflow-hidden">
                              <div
                                className={`h-full ${val >= 80 ? 'bg-emerald-400' : val >= 60 ? 'bg-amber-400' : 'bg-orange-400'}`}
                                style={{ width: `${val}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Movimento recomendado */}
                    <div className="rounded-lg bg-taime-500/10 border border-taime-500/30 p-3 mb-4">
                      <p className="text-[9px] font-bold tracking-widest text-taime-300 mb-1.5">
                        {isEn ? 'RECOMMENDED MOVE' : 'MOVIMENTO RECOMENDADO'}
                      </p>
                      <p className="text-[11px] text-white/90 leading-snug line-clamp-2">{heroMove}</p>
                    </div>

                    {/* Then · Now · Next */}
                    <p className="text-[9px] font-bold tracking-widest text-zinc-500 mb-2">
                      THEN · NOW · NEXT
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {mockupTnn.map(({ label, val }) => (
                        <div key={label} className="rounded-md bg-zinc-800/40 border border-zinc-700/50 p-2">
                          <p className="text-[8px] font-bold tracking-widest text-zinc-500 mb-1">{label}</p>
                          <p className="text-[10px] text-white/80 leading-tight line-clamp-3">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Score gauge flutuante */}
              <div className="absolute -top-3 -right-3 sm:-right-5 w-16 h-16 rounded-2xl
                              bg-taime-500 text-white shadow-xl shadow-taime-500/30
                              flex flex-col items-center justify-center
                              ring-4 ring-taime-900">
                <span className="text-2xl font-bold leading-none">{mockupScore}</span>
                <span className="text-[8px] font-bold tracking-widest opacity-80">SCORE</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 1b: VEJA O QUE VOCÊ RECEBE ──────────────────────────── */}
      <section className="border-t border-zinc-100 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{isEn ? 'What you get' : 'O que você recebe'}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-10 max-w-2xl leading-snug">
            {isEn ? 'See what you get with TAIME' : 'Veja o que você recebe com o TAIME'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                  </svg>
                ),
                title: isEn ? 'Strategic Score' : 'Score Estratégico',
                desc:  isEn
                  ? 'Understand maturity, competitive pressure, impact and risk for each technology trend.'
                  : 'Entenda a maturidade, pressão competitiva, impacto e risco de cada tendência tecnológica.',
                soon: false,
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                  </svg>
                ),
                title: isEn ? 'Recommended Move' : 'Movimento Recomendado',
                desc:  isEn
                  ? 'Know the next step for your organization based on the TAIME framework.'
                  : 'Saiba o próximo passo para sua organização com base no framework TAIME.',
                soon: false,
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                ),
                title: isEn ? 'Competitive Risks' : 'Riscos Competitivos',
                desc:  isEn
                  ? 'Spot threats, windows of opportunity and the cost of not acting in time.'
                  : 'Identifique ameaças, janelas de oportunidade e o custo de não agir a tempo.',
                soon: false,
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8"  y1="2" x2="8"  y2="6" />
                    <line x1="3"  y1="10" x2="21" y2="10" />
                    <path d="M9 16l2 2 4-4" />
                  </svg>
                ),
                title: isEn ? 'Action Plan' : 'Plano de Ação',
                desc:  isEn
                  ? 'Coming soon with the Executive Advisor: turn insights into a roadmap with priorities.'
                  : 'Em breve com o Executive Advisor: transforme insights em um roadmap com prioridades.',
                soon: true,
              },
            ].map(({ icon, title, desc, soon }) => (
              <div key={title} className="bg-white rounded-xl border border-zinc-200 p-6
                                          hover:border-taime-200 hover:shadow-sm transition-all">
                <div className="w-10 h-10 rounded-xl bg-taime-50 text-taime-600
                                flex items-center justify-center mb-4">
                  {icon}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-base font-bold text-zinc-900">{title}</h3>
                  {soon && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide
                                     bg-taime-50 text-taime-600 border border-taime-100">
                      {isEn ? 'SOON' : 'EM BREVE'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 2: DO CAOS À DECISÃO (infográfico de fluxo) ─────────── */}
      <section className="py-24 bg-zinc-50 border-t border-zinc-100">
        <div className="max-w-6xl mx-auto px-6">
          <p className="section-label mb-3">{h.painsLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-14 max-w-3xl leading-snug">
            {isEn
              ? 'From signal chaos to clear decision'
              : 'Do caos de sinais à decisão clara'}
          </h2>

          {/* Grid 3 estágios, com linha conectora */}
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-12 sm:gap-6">
            {/* Linha horizontal conectora (desktop) — gradiente vermelho → azul → verde */}
            <div
              aria-hidden="true"
              className="hidden sm:block absolute top-8 left-[16.6%] right-[16.6%] h-0.5 z-0"
              style={{
                background: 'linear-gradient(to right, rgba(251,146,60,0.6) 0%, rgba(84,121,255,0.7) 50%, rgba(16,185,129,0.6) 100%)',
              }}
            />
            {/* Linha vertical conectora (mobile) — entre estágios */}
            <div
              aria-hidden="true"
              className="sm:hidden absolute top-16 left-8 bottom-16 w-0.5 z-0"
              style={{
                background: 'linear-gradient(to bottom, rgba(251,146,60,0.6) 0%, rgba(84,121,255,0.7) 50%, rgba(16,185,129,0.6) 100%)',
              }}
            />

            {[
              {
                label:    isEn ? 'CHAOS'      : 'O CAOS',
                title:    isEn ? 'Thousands of signals every week.' : 'Milhares de sinais por semana.',
                body:     isEn
                  ? 'New technologies, alerts and trends. Without structure, it is noise, not intelligence.'
                  : 'Novas tecnologias, alertas e tendências. Sem estrutura, é ruído, não inteligência.',
                bg:       'bg-orange-50',
                ring:     'ring-orange-100',
                iconCol:  'text-orange-500',
                labelCol: 'text-orange-600',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 32 32" fill="currentColor">
                    <circle cx="4"  cy="6"  r="2" />
                    <circle cx="10" cy="14" r="2" />
                    <circle cx="22" cy="4"  r="2" />
                    <circle cx="28" cy="12" r="2" />
                    <circle cx="6"  cy="22" r="2" />
                    <circle cx="16" cy="20" r="2" />
                    <circle cx="26" cy="24" r="2" />
                    <circle cx="14" cy="8"  r="2" />
                    <circle cx="20" cy="28" r="2" />
                  </svg>
                ),
              },
              {
                label:    isEn ? 'ANALYSIS'    : 'A ANÁLISE',
                title:    isEn
                  ? 'TAIME organizes, scores and translates.'
                  : 'O TAIME organiza, pontua e traduz.',
                body:     isEn
                  ? 'Collects from global sources, scores across 5 dimensions and applies the TYPE → ACT → IMPACT → MOVE → EXIT framework.'
                  : 'Coleta de fontes globais, pontua em 5 dimensões e aplica o framework TYPE → ACT → IMPACT → MOVE → EXIT.',
                bg:       'bg-taime-50',
                ring:     'ring-taime-100',
                iconCol:  'text-taime-500',
                labelCol: 'text-taime-600',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor"
                       strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="16" cy="16" r="3.5" fill="currentColor" />
                    <line x1="4"  y1="6"  x2="13.5" y2="13.5" />
                    <line x1="28" y1="6"  x2="18.5" y2="13.5" />
                    <line x1="4"  y1="26" x2="13.5" y2="18.5" />
                    <line x1="28" y1="26" x2="18.5" y2="18.5" />
                  </svg>
                ),
              },
              {
                label:    isEn ? 'DECISION' : 'A DECISÃO',
                title:    isEn
                  ? 'You receive the recommended move.'
                  : 'Você recebe o movimento recomendado.',
                body:     isEn
                  ? 'Act now, prepare, or let it go. With clarity and historical context.'
                  : 'Agir agora, preparar, ou deixar pra lá. Com clareza e contexto histórico.',
                bg:       'bg-emerald-50',
                ring:     'ring-emerald-100',
                iconCol:  'text-emerald-600',
                labelCol: 'text-emerald-700',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor"
                       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="16" cy="16" r="11" />
                    <path d="M11 16l4 4 6-8" />
                  </svg>
                ),
              },
            ].map(({ label, title, body, bg, ring, iconCol, labelCol, icon }) => (
              <div
                key={label}
                className="relative flex sm:flex-col items-start sm:items-center
                           sm:text-center gap-5 sm:gap-0 z-10"
              >
                <div className={`w-16 h-16 rounded-2xl ${bg} ${iconCol}
                                 flex items-center justify-center shrink-0
                                 sm:mb-6 ring-4 ring-zinc-50 ring-offset-4 ring-offset-zinc-50
                                 shadow-sm`}>
                  {/*
                    ring-4 = corta a linha conectora atrás do círculo, dando
                    o efeito de "estações" sobre o trilho.
                  */}
                  {icon}
                </div>
                <div className="flex-1 min-w-0 sm:max-w-xs">
                  <p className={`text-[10px] font-bold tracking-widest uppercase ${labelCol} mb-2`}>
                    {label}
                  </p>
                  <h3 className="text-lg font-bold text-zinc-900 mb-2 leading-snug">
                    {title}
                  </h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    {body}
                  </p>
                </div>
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
                                     flex items-center justify-center mt-0.5">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="3"
                           strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Card escuro estilo "produto" — terceira trend distinta */}
            {whatIsTrend && whatIsDims.length > 0 && (
              <Link
                href={whatIsHref}
                className="relative block group"
              >
                <div className="rounded-2xl bg-taime-900 border border-zinc-700/40
                                shadow-2xl overflow-hidden ring-1 ring-white/5
                                p-6 sm:p-7
                                hover:ring-taime-500/40 transition-all">
                  {/* Texture sutil */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-[0.06] pointer-events-none"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                      backgroundSize: '20px 20px',
                    }}
                  />

                  <div className="relative">
                    {/* Header com label + título */}
                    <p className="text-[10px] font-bold tracking-widest text-taime-300 mb-3">
                      {isEn ? 'TAIME · EXECUTIVE REPORT' : 'TAIME · RELATÓRIO EXECUTIVO'}
                    </p>
                    <h3 className="text-base sm:text-lg font-bold text-white leading-snug
                                   mb-6 line-clamp-3 pr-20">
                      {whatIsTitle}
                    </h3>

                    {/* Score gauge flutuante */}
                    <div className="absolute -top-1 right-0 w-16 h-16 rounded-2xl
                                    bg-taime-500 text-white
                                    flex flex-col items-center justify-center
                                    ring-4 ring-taime-900 shadow-lg shadow-taime-500/30">
                      <span className="text-2xl font-bold leading-none">{whatIsScore}</span>
                      <span className="text-[8px] font-bold tracking-widest opacity-80">SCORE</span>
                    </div>

                    {/* 4 dimensões reais */}
                    <p className="text-[9px] font-bold tracking-widest text-zinc-500 mb-2">
                      {isEn ? 'SCORE DIMENSIONS' : 'DIMENSÕES DE SCORE'}
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-5">
                      {whatIsDims.map(([label, val]) => (
                        <div key={label} className="rounded-lg bg-white/[0.04] border border-white/10 p-2.5">
                          <p className="text-[8px] text-zinc-400 tracking-wide uppercase leading-tight mb-1.5
                                        line-clamp-1">{label}</p>
                          <div className="flex items-baseline gap-2">
                            <span className={`text-base font-bold tabular-nums leading-none
                              ${val >= 80 ? 'text-emerald-400'
                                : val >= 60 ? 'text-amber-400'
                                : 'text-orange-400'}`}>
                              {val}
                            </span>
                            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className={`h-full ${val >= 80 ? 'bg-emerald-400' : val >= 60 ? 'bg-amber-400' : 'bg-orange-400'}`}
                                style={{ width: `${val}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Movimento recomendado real */}
                    {whatIsMove && (
                      <div className="rounded-lg bg-taime-500/10 border border-taime-500/30 p-3 mb-4">
                        <p className="text-[9px] font-bold tracking-widest text-taime-300 mb-1.5">
                          {isEn ? 'RECOMMENDED MOVE' : 'MOVIMENTO RECOMENDADO'}
                        </p>
                        <p className="text-xs text-white/90 leading-snug">{whatIsMove}</p>
                      </div>
                    )}

                    <p className="text-xs font-semibold text-taime-300 group-hover:text-taime-200 transition-colors">
                      {isEn ? 'Read the full analysis →' : 'Ler a análise completa →'}
                    </p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 4: COMO FUNCIONA (4 passos) ──────────────────────────── */}
      <section id="como-funciona" className="bg-zinc-50 border-t border-zinc-100 py-24">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.howLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-14">{h.howTitle}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-2 relative">
            {h.howSteps.map(({ num, title, desc }, i) => (
              <div key={num} className="relative">
                {/* Conteúdo do passo */}
                <div className="lg:px-3">
                  <div className="relative inline-flex w-12 h-12 rounded-2xl
                                  bg-taime-500 text-white items-center justify-center
                                  shadow-lg shadow-taime-500/20 mb-5
                                  ring-4 ring-white">
                    <span className="text-base font-bold tabular-nums">{num.replace(/^0/, '')}</span>
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 mb-2">{title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
                </div>

                {/* Seta entre passos (só desktop, exceto no último) */}
                {i < h.howSteps.length - 1 && (
                  <div aria-hidden="true"
                       className="hidden lg:flex absolute top-6 -right-2 items-center justify-center
                                  text-taime-300">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-14 text-sm text-zinc-600 leading-relaxed max-w-3xl border-l-2 border-taime-200 pl-4 italic">
            {h.howAdvisorNote}
          </p>
        </div>
      </section>

      {/* ── SEÇÃO 5: É ASSIM QUE A RESPOSTA SE PARECE (showcase) ──────── */}
      {showcase && showcaseFw?.score_dimensions && showcaseTnn && showcase.reports && (
        <section className="py-24 border-t border-zinc-100">
          <div className="max-w-5xl mx-auto px-6">
            <p className="section-label mb-3">
              {isEn ? 'This is what the answer looks like' : 'É assim que a resposta se parece'}
            </p>
            <h2 className="text-3xl font-bold text-zinc-900 mb-3">
              {isEn ? 'A real trend, analyzed by TAIME' : 'Uma tendência real, analisada pelo TAIME'}
            </h2>
            <p className="text-sm text-zinc-500 max-w-2xl mb-10 leading-relaxed">
              {isEn
                ? 'Click and read the full analysis: this one is open for you to try.'
                : 'Clique e leia a análise completa: esta é aberta para você experimentar.'}
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
                {isEn ? 'Read the full analysis →' : 'Ler a análise completa →'}
              </p>
            </Link>
          </div>
        </section>
      )}

      {/* ── SEÇÃO 6: PARA QUEM ────────────────────────────────────────── */}
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

      {/* ── SEÇÃO 7: MEMÓRIA 25 ANOS ──────────────────────────────────── */}
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

      {/* ── SEÇÃO 8: RELATÓRIOS RECENTES ──────────────────────────────── */}
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

      {/* ── SEÇÃO 9: CATEGORIAS ───────────────────────────────────────── */}
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

      {/* ── SEÇÃO 10: TRENDS EM DESTAQUE ───────────────────────────────── */}
      <section className="bg-zinc-50 border-t border-zinc-100 py-24">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.trendsLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-10">{h.trendsTitle}</h2>
          <HomeSearch trends={topTrends} isLoggedIn={isLoggedIn} locale={locale} trendsCta={h.trendsCta} trendsEmpty={h.trendsEmpty} />
        </div>
      </section>

      {/* ── SEÇÃO 11: LINHA DO TEMPO ───────────────────────────────────── */}
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

      {/* ── SEÇÃO 12: FAQ ─────────────────────────────────────────────── */}
      <section className="bg-zinc-50 border-t border-zinc-100 py-24">
        <div className="max-w-3xl mx-auto px-6">
          <p className="section-label mb-3">{h.faqLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-10">{h.faqTitle}</h2>
          <FaqAccordion items={t.faq.items as unknown as { q: string; a: string }[]} />
        </div>
      </section>

      {/* ── RADAR TAIME ───────────────────────────────────────────────── */}
      <RadarFeed />

      {/* ── SEÇÃO 13: PLANOS ──────────────────────────────────────────── */}
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

      {/* ── BANNER FINAL ESCURO (CTA) ────────────────────────────────── */}
      <section className="relative bg-taime-900 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-32 w-[420px] h-[420px] rounded-full
                     bg-taime-600/30 blur-3xl pointer-events-none"
        />
        <div className="relative max-w-4xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-snug mb-4">
            {isEn
              ? 'Start free and see the value in practice.'
              : 'Comece gratuitamente e veja o valor na prática.'}
          </h2>
          <p className="text-lg text-white/70 leading-relaxed max-w-2xl mx-auto mb-10">
            {isEn
              ? 'Access full reports and discover how TAIME can transform your strategic decisions.'
              : 'Acesse relatórios completos e descubra como o TAIME pode transformar suas decisões estratégicas.'}
          </p>
          <Link
            href={isLoggedIn ? '/dashboard' : '/login'}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-lg
                       bg-taime-500 text-white text-sm font-semibold
                       hover:bg-taime-400 transition-colors shadow-lg shadow-taime-500/30"
          >
            {h.ctaPrimary}
          </Link>
          <p className="mt-5 text-xs text-white/50 font-medium">
            {isEn ? 'No credit card required.' : 'Não é necessário cartão de crédito.'}
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
