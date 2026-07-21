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
import type { TaimeFramework, ThenNowNext } from '@/lib/types'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import HomeSearch from '@/components/HomeSearch'
import AdvisorDemo from '@/components/AdvisorDemo'
import CountUp from '@/components/home/CountUp'
import ScoreBars from '@/components/home/ScoreBars'
import ThemeTrajectory from '@/components/home/ThemeTrajectory'
import SignatureGraphic from '@/components/home/SignatureGraphic'
import FrameworkSection from '@/components/home/FrameworkSection'
import ThemeTimeline from '@/components/home/ThemeTimeline'
import NewsletterSignup from '@/components/NewsletterSignup'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface RadarBriefing {
  id:             string
  briefing_date:  string
  title_pt:       string
  title_en:       string | null
  body_pt:        string | null
  body_en:        string | null
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

async function getTopTrends(): Promise<TopTrend[]> {
  try {
    const res = await fetch(`${SITE_URL}/api/trends/top`, { cache: 'no-store' })
    return await res.json()
  } catch { return [] }
}

async function getLatestBriefing(): Promise<RadarBriefing | null> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!supabaseUrl || !supabaseKey) return null
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/radar_briefings?order=briefing_date.desc&limit=1` +
        `&select=id,briefing_date,title_pt,title_en,body_pt,body_en`,
      {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        // Sempre busca o briefing mais recente. ISR estava congelando a
        // faixa do Radar mostrando briefing do dia anterior.
        cache:   'no-store',
      },
    )
    if (!res.ok) return null
    const rows = await res.json() as RadarBriefing[]
    return rows[0] ?? null
  } catch { return null }
}

// ─── Dados reais da home reformulada (Server Component, service key) ─────────
// Todas as queries usam a service key só no server (nunca exposta ao browser) e
// cache no-store para a home refletir o banco. Falha silenciosa: cada helper
// devolve vazio/null em erro, e a salvaguarda de deploy valida não-vazio antes
// do push.

function supaCreds(): { url: string; key: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!url || !key) return null
  return { url, key }
}

interface ProofCounts { signals: number; trends: number }

async function getProofCounts(): Promise<ProofCounts> {
  const c = supaCreds()
  if (!c) return { signals: 0, trends: 0 }
  const headCount = async (table: string): Promise<number> => {
    try {
      const res = await fetch(`${c.url}/rest/v1/${table}?select=id`, {
        headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, Prefer: 'count=exact', Range: '0-0' },
        cache: 'no-store',
      })
      const total = Number((res.headers.get('content-range') ?? '').split('/')[1])
      return Number.isFinite(total) ? total : 0
    } catch { return 0 }
  }
  const [signals, trends] = await Promise.all([headCount('signals'), headCount('report_trends')])
  return { signals, trends }
}

interface RecentTrendRow {
  title_pt_br:           string
  title_en:              string
  taime_score:           number
  category:              string | null
  theme_slug:            string | null
  report_id:             string
  then_now_next_pt_br:   ThenNowNext | null
  then_now_next_en:      ThenNowNext | null
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en:    TaimeFramework | null
  reports?:              { period: string } | null
}

// Top trends por taime_score entre os últimos 5 períodos publicados.
// Usada para os cards de tendências e para extrair os tópicos em pauta.
async function getRecentTrendRows(): Promise<RecentTrendRow[]> {
  const c = supaCreds()
  if (!c) return []
  const h = { apikey: c.key, Authorization: `Bearer ${c.key}` }
  try {
    const perRes = await fetch(
      `${c.url}/rest/v1/reports?status=eq.published&order=period.desc&limit=20&select=period`,
      { headers: h, cache: 'no-store' },
    )
    if (!perRes.ok) return []
    const periods = [...new Set((await perRes.json() as Array<{ period: string }>).map(r => r.period))].slice(0, 5)
    if (periods.length === 0) return []
    const inList = periods.map(p => `"${p}"`).join(',')
    const fields = 'title_pt_br,title_en,taime_score,category,theme_slug,report_id,' +
      'then_now_next_pt_br,then_now_next_en,taime_framework_pt_br,taime_framework_en,reports!inner(period)'
    const res = await fetch(
      `${c.url}/rest/v1/report_trends?reports.status=eq.published&reports.period=in.(${inList})` +
        `&order=taime_score.desc&limit=40&select=${fields}`,
      { headers: h, cache: 'no-store' },
    )
    if (!res.ok) return []
    return await res.json() as RecentTrendRow[]
  } catch { return [] }
}

// Amostra pública mais recente: report status='published' E is_public=true, do
// PERÍODO mais novo (period desc). Dinamico e robusto: no dia em que a 2a
// quinzena de junho/2026 (ou outra mais nova) for marcada como amostra publica
// no admin, o exemplo passa a ser ela sozinha, sem editar codigo. Retorna null
// se nao houver nenhuma amostra publica (o CTA de exemplo se esconde, nao quebra).
async function getPublicSampleId(): Promise<string | null> {
  const c = supaCreds()
  if (!c) return null
  try {
    const res = await fetch(
      `${c.url}/rest/v1/reports?status=eq.published&is_public=eq.true&order=period.desc&limit=1&select=id`,
      { headers: { apikey: c.key, Authorization: `Bearer ${c.key}` }, cache: 'no-store' },
    )
    if (!res.ok) return null
    return (await res.json() as Array<{ id: string }>)[0]?.id ?? null
  } catch { return null }
}

// Deriva um rótulo curto de tópico a partir do título da trend (parte antes do
// dois-pontos quando faz sentido, senão as primeiras palavras). Fica no idioma
// do título recebido.
function topicLabel(title: string): string {
  const beforeColon = title.split(':')[0].trim()
  const base = (beforeColon.length >= 10 && beforeColon.length <= 46) ? beforeColon : title.trim()
  const words = base.split(/\s+/)
  return (words.length <= 6 ? words.join(' ') : words.slice(0, 6).join(' ')).replace(/[.,;]+$/, '')
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

  const [topTrends, latestBriefing, proof, recentRows, sampleId] = await Promise.all([
    getTopTrends(), getLatestBriefing(), getProofCounts(), getRecentTrendRows(), getPublicSampleId(),
  ])
  const isEn = locale === 'en'

  // ── Faixa de prova: só sinais > 5000 e trends > 100 entram; janela é fixa. ──
  // Alvo numerico + sufixo para o contador animado (CountUp).
  const proofItems: { to: number; suffix: string; separator: boolean; label: string }[] = []
  if (proof.signals > 5000) {
    proofItems.push({
      to: Math.floor(proof.signals / 1000),
      suffix: isEn ? 'k+' : ' mil+',
      separator: false,
      label: h.proof.signalsLabel,
    })
  }
  if (proof.trends > 100) {
    proofItems.push({ to: proof.trends, suffix: '', separator: true, label: h.proof.trendsLabel })
  }

  // ── Cards de tendências: recencia+score, sem repetir theme_slug, E com
  //    DIVERSIDADE de categoria (max 1 por categoria entre os 4; relaxa para 2
  //    quando o periodo e pouco diverso). Evita a home dominada por um so tema. ──
  const seenTheme = new Set<string>()
  const dedupedRows = recentRows.filter(r => {
    const key = r.theme_slug ?? r.title_en
    if (seenTheme.has(key)) return false
    seenTheme.add(key)
    return true
  })
  // Chave de diversidade = categoria (as 19), MAS trends de IA agentica colapsam
  // numa unica chave 'AGENTIC'. No arquivo atual, o tema agentico e classificado em
  // varias categorias (Automation, IA, Cybersecurity, Fintech), entao a regra so por
  // categoria ainda deixaria 3 cards agenticos; colapsar garante o resultado
  // esperado: 1 agentico (o de maior score) + 3 de temas diferentes.
  const isAgentic = (r: RecentTrendRow): boolean =>
    /agent|ag[eê]ntic/i.test(`${r.theme_slug ?? ''} ${r.title_en} ${r.title_pt_br}`)
  const divKey = (r: RecentTrendRow): string => (isAgentic(r) ? 'AGENTIC' : (r.category ?? '?'))

  const CARD_COUNT = 4
  const trendCardRows: typeof dedupedRows = []
  const keyCount = new Map<string, number>()
  const takeUnderCap = (cap: number) => {
    for (const r of dedupedRows) {
      if (trendCardRows.length >= CARD_COUNT) break
      if (trendCardRows.includes(r)) continue
      const k = divKey(r)
      if ((keyCount.get(k) ?? 0) >= cap) continue
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1)
      trendCardRows.push(r)
    }
  }
  takeUnderCap(1)                       // passo 1: no maximo 1 por chave (categoria / agentic)
  if (trendCardRows.length < CARD_COUNT) takeUnderCap(2) // passo 2: relaxa para 2
  if (trendCardRows.length < CARD_COUNT)                 // passo 3: completa com o que houver
    for (const r of dedupedRows) { if (trendCardRows.length >= CARD_COUNT) break; if (!trendCardRows.includes(r)) trendCardRows.push(r) }

  // ── Tópicos em pauta: 3 temas reais dos últimos reports (rótulo do título). ──
  const topicLabels = trendCardRows.slice(0, 3).map(r => topicLabel(isEn ? r.title_en : r.title_pt_br))

  // ── Showcase: trend CURADA de tema NAO-IA-centrico (infraestrutura de data
  //    centers: energia, localizacao, escala e geopolitica), para diversificar a
  //    vitrine hoje dominada por IA. Conteudo vem do banco (recentRows) pelo
  //    theme_slug; usa o ciclo mais recente com dados completos. Fallback: a trend
  //    de maior score com dados completos (comportamento antigo), para a secao
  //    nunca ficar vazia se o tema curado sair do arquivo recente.
  const SHOWCASE_THEME_SLUG = 'ia-energia-infraestrutura-sustentavel'
  const hasFull = (r: RecentTrendRow): boolean => {
    const fw  = isEn ? r.taime_framework_en : r.taime_framework_pt_br
    const tnn = isEn ? r.then_now_next_en   : r.then_now_next_pt_br
    return !!fw?.score_dimensions && !!tnn?.then && !!tnn?.now && !!tnn?.next && !!r.reports?.period
  }
  const showcase: RecentTrendRow | null =
    recentRows.find(r => r.theme_slug === SHOWCASE_THEME_SLUG && hasFull(r))
    ?? recentRows.find(hasFull)
    ?? null
  const showcaseFw     = showcase ? (isEn ? showcase.taime_framework_en : showcase.taime_framework_pt_br) : null
  const showcaseTnn    = showcase ? (isEn ? showcase.then_now_next_en   : showcase.then_now_next_pt_br)   : null
  const showcaseTitle  = showcase ? (isEn ? showcase.title_en           : showcase.title_pt_br)           : ''
  // Nao logado: o CTA da amostra passa a levar ao login (com origem para futura
  // mensagem contextual), em vez do report publico /r/{sample}. Logado segue direto
  // ao report completo.
  const showcaseHref   = showcase
    ? (isLoggedIn ? `/reports/${showcase.report_id}` : '/login?from=report')
    : '/login?from=report'

  // Dimensoes de score do showcase como [label, score][] para o ScoreBars animado.
  const showcaseDimLabels: Record<string, { pt: string; en: string }> = {
    market_maturity:      { pt: 'Maturidade',   en: 'Maturity' },
    competitive_pressure: { pt: 'Pressão',      en: 'Pressure' },
    strategic_impact:     { pt: 'Impacto',      en: 'Impact' },
    execution_complexity: { pt: 'Complexidade', en: 'Complexity' },
    competitive_lag_risk: { pt: 'Risco',        en: 'Risk' },
  }
  const showcaseDims: [string, number][] = showcaseFw?.score_dimensions
    ? (Object.keys(showcaseFw.score_dimensions) as Array<keyof NonNullable<typeof showcaseFw.score_dimensions>>)
        .map(k => [
          (isEn ? showcaseDimLabels[k as string]?.en : showcaseDimLabels[k as string]?.pt) ?? String(k),
          showcaseFw.score_dimensions![k].score,
        ] as [string, number])
    : []

  // Mockup data: top trend by score (rank 1 da query)
  const firstTrend    = topTrends[0] ?? null
  const fwMockup      = isEn ? firstTrend?.taime_framework_en   : firstTrend?.taime_framework_pt_br
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

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.02] mb-6">
                {h.heroTitle}
              </h1>

              <p className="text-lg sm:text-xl text-white/70 leading-relaxed mb-8 max-w-xl">{h.heroBody}</p>

              {/* Credenciais de autoridade tecidas no hero (nao so na faixa) */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-9">
                {proofItems.map(it => (
                  <span key={it.label} className="inline-flex items-baseline gap-1.5">
                    <CountUp to={it.to} suffix={it.suffix} separator={it.separator}
                             className="text-lg font-bold text-white tabular-nums" />
                    <span className="text-xs text-white/50">{it.label}</span>
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 text-xs text-white/55">
                  <span className="w-1 h-1 rounded-full bg-taime-400" />{h.cred.since}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <Link
                  href={isLoggedIn ? '/dashboard' : '/login'}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                             bg-taime-500 text-white text-sm font-semibold
                             hover:bg-taime-400 transition-colors shadow-lg shadow-taime-500/30"
                >
                  {h.ctaPrimary}
                </Link>
              </div>
              <p className="text-xs text-white/50 font-medium">{h.heroSub}</p>
            </div>

            {/* ── Coluna direita: grafico-assinatura como arte dominante ──── */}
            <div className="relative lg:pl-4">
              <div className="rounded-2xl bg-zinc-900/70 border border-white/10 shadow-2xl ring-1 ring-white/5
                              p-6 sm:p-7 backdrop-blur-sm">
                {/* Grafico-assinatura da metodologia: a trajetoria de uma tecnologia */}
                <p className="text-[10px] font-bold tracking-widest uppercase text-taime-300 mb-1.5">
                  {h.heroGraph.title}
                </p>
                <p className="text-xs text-white/55 leading-relaxed mb-5 max-w-sm">
                  {h.heroGraph.subtitle}
                </p>
                <SignatureGraphic
                  labels={{ then: h.tempo.then, now: h.tempo.now, next: h.tempo.next }}
                  className="w-full h-auto mb-6"
                />

                {/* Faixa compacta da ultima analise (report integrado, menor) */}
                <div className="border-t border-white/10 pt-5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold tracking-widest text-zinc-500 mb-1.5">
                        {isEn ? 'LATEST ANALYSIS' : 'ÚLTIMA ANÁLISE'}
                      </p>
                      <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">{mockupTitle}</h3>
                    </div>
                    <span className="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl
                                     bg-taime-500 text-white shadow-lg shadow-taime-500/30 ring-4 ring-taime-900">
                      <span className="text-lg font-bold leading-none">{mockupScore}</span>
                      <span className="text-[7px] font-bold tracking-widest opacity-80">SCORE</span>
                    </span>
                  </div>
                  <ScoreBars dims={heroDims} variant="hero" />
                  {sampleId && (
                    <Link
                      href="/login?from=report"
                      className="mt-5 inline-flex items-center justify-center gap-2 w-full px-4 py-2.5
                                 rounded-lg bg-taime-500 text-white text-xs font-semibold
                                 hover:bg-taime-400 transition-colors"
                    >
                      {isEn ? 'Read the analysis' : 'Leia a análise'}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEÇÃO 1c: FAIXA DE PROVA (contadores animados + micro-grafico) ── */}
      <section className="border-t border-zinc-100 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-9 flex flex-wrap items-center justify-center
                        gap-x-12 gap-y-6 text-center">
          {proofItems.map(it => (
            <div key={it.label} className="flex items-center gap-3">
              {/* Sparkline abstrata decorativa (tendencia de subida) */}
              <svg aria-hidden="true" width="44" height="26" viewBox="0 0 44 26" fill="none"
                   className="text-taime-400 shrink-0">
                <path d="M1 22 L9 17 L16 19 L24 10 L31 12 L43 2" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
                <circle cx="43" cy="2" r="2.5" fill="currentColor" />
              </svg>
              <div className="flex items-baseline gap-2">
                <CountUp
                  to={it.to}
                  suffix={it.suffix}
                  separator={it.separator}
                  className="text-2xl font-bold text-taime-700 tabular-nums"
                />
                <span className="text-sm text-zinc-500">{it.label}</span>
              </div>
            </div>
          ))}
          {proofItems.length > 0 && (
            <span aria-hidden="true" className="hidden sm:block w-px h-6 bg-zinc-200" />
          )}
          <span className="text-sm text-zinc-500">{h.proof.window}</span>
        </div>
      </section>

      {/* ── SEÇÃO 1c-2: PROFUNDIDADE TEMPORAL (linha do tempo Gantt) ──── */}
      <section className="border-t border-zinc-100 bg-zinc-50/60 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <ThemeTimeline
            title={h.themesCards.title}
            subtitle={h.themesCards.subtitle}
            footer={h.themesCards.footer}
            todayLabel={h.themesCards.today}
            sinceLabel={h.themesCards.since}
            items={h.themesCards.items}
          />
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
      <section className="relative py-24 bg-zinc-50 border-t border-zinc-100 overflow-hidden">
        {/* Textura sutil de pontos, para profundidade */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.55] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(84,121,255,0.10) 1px, transparent 0)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse 90% 70% at 50% 30%, black 45%, transparent 100%)',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6">
          <p className="section-label mb-3">{h.painsLabel}</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-14 max-w-3xl leading-tight">
            {isEn ? 'Information is everywhere.' : 'Informação está em todo lugar.'}{' '}
            <span className="text-zinc-400">
              {isEn ? 'Reliable intelligence is not.' : 'Inteligência confiável, não.'}
            </span>
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

      {/* ── SEÇÃO 3: COMO FUNCIONA (4 passos) ──────────────────────────── */}
      <section id="como-funciona" className="relative bg-zinc-50 border-t border-zinc-100 py-24 overflow-hidden">
        {/* Wash sutil de gradiente, para ritmo entre secoes */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-64 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(84,121,255,0.05), transparent)' }}
        />
        <div className="relative max-w-5xl mx-auto px-6">
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

      {/* ── SEÇÃO 3b: O FRAMEWORK TAIME (metodologia como produto nomeado) ── */}
      <FrameworkSection copy={h.framework} tempo={h.tempo} />

      {/* ── SEÇÃO 4: É ASSIM QUE A RESPOSTA SE PARECE (showcase) ──────── */}
      {showcase && showcaseFw?.score_dimensions && showcaseTnn && showcase.reports && (
        <section className="py-24 border-t border-zinc-100 bg-white">
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

            <Link href={showcaseHref} className="relative block group">
              <div className="relative rounded-2xl bg-taime-900 border border-zinc-700/40
                              shadow-2xl overflow-hidden ring-1 ring-white/5
                              hover:ring-taime-500/40 transition-all">
                {/* Textura sutil */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-[0.06] pointer-events-none"
                  style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                    backgroundSize: '20px 20px',
                  }}
                />

                {/* Header tipo "tab" */}
                <div className="relative flex items-center gap-3 px-6 py-4 border-b border-white/5">
                  <p className="text-[10px] font-bold tracking-widest text-taime-300">
                    {isEn ? 'TAIME · EXECUTIVE REPORT' : 'TAIME · RELATÓRIO EXECUTIVO'}
                  </p>
                  <p className="ml-auto text-[10px] text-white/40 font-mono">
                    {showcase.reports.period}
                  </p>
                </div>

                <div className="relative p-6 sm:p-8">
                  {/* Título + gauge flutuante */}
                  <div className="flex items-start gap-5 mb-7">
                    <div className="w-16 h-16 rounded-2xl bg-taime-500 text-white
                                    flex flex-col items-center justify-center shrink-0
                                    ring-4 ring-taime-900 shadow-lg shadow-taime-500/30">
                      <span className="text-2xl font-bold leading-none">{showcase.taime_score}</span>
                      <span className="text-[8px] font-bold tracking-widest opacity-80">SCORE</span>
                    </div>
                    <h3 className="flex-1 min-w-0 text-lg sm:text-xl font-bold text-white leading-snug
                                   group-hover:text-taime-200 transition-colors pt-1">
                      {showcaseTitle}
                    </h3>
                  </div>

                  {/* 5 dimensões — versão dark */}
                  <div className="mb-7">
                    <p className="text-[9px] font-bold tracking-widest text-zinc-500 mb-3">
                      {isEn ? 'SCORE DIMENSIONS' : 'DIMENSÕES DE SCORE'}
                    </p>
                    <ScoreBars dims={showcaseDims} variant="showcase" />
                  </div>

                  {/* Leitura temporal (ANTES / AGORA / A SEGUIR em PT), versao dark */}
                  <div>
                    <p className="text-[9px] font-bold tracking-widest uppercase text-zinc-500 mb-3">
                      {h.tempo.then} · {h.tempo.now} · {h.tempo.next}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { label: h.tempo.then, val: stripPeriodLabel(showcaseTnn.then), tone: 'bg-zinc-800/40 border-white/10',        dot: 'bg-zinc-400',    lab: 'text-zinc-300' },
                        { label: h.tempo.now,  val: showcaseTnn.now,                    tone: 'bg-emerald-500/[0.06] border-emerald-500/20', dot: 'bg-emerald-400', lab: 'text-emerald-300' },
                        { label: h.tempo.next, val: showcaseTnn.next,                   tone: 'bg-taime-500/[0.08] border-taime-500/30',     dot: 'bg-taime-400',   lab: 'text-taime-300' },
                      ].map(({ label, val, tone, dot, lab }) => (
                        <div key={label} className={`rounded-lg border ${tone} p-4`}>
                          <p className={`flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase mb-2 ${lab}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}
                          </p>
                          <p className="text-xs text-white/85 leading-relaxed line-clamp-4">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="mt-7 text-xs font-semibold text-taime-300 group-hover:text-taime-200 transition-colors">
                    {isEn ? 'Read the full analysis →' : 'Ler a análise completa →'}
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* ── SEÇÃO 4b: A TRAJETÓRIA DE UM TEMA (o fosso temporal, prova estática) ── */}
      <ThemeTrajectory
        label={h.trajectory.label}
        title={h.trajectory.title}
        subtitle={h.trajectory.subtitle}
        moments={h.trajectory.moments}
      />

      {/* ── SEÇÃO 4c: EXECUTIVE ADVISOR (conversa animada) ─────────────── */}
      <AdvisorDemo
        label={h.advisor.label}
        title={h.advisor.title}
        subtitle={h.advisor.subtitle}
        messages={h.advisor.messages}
        ctaTitle={h.advisor.ctaTitle}
        ctaBody={h.advisor.ctaBody}
        cta={h.advisor.cta}
        ctaHref="/ask"
      />

      {/* ── SEÇÃO 5: TENDÊNCIAS RECENTES (cards dinâmicos) + BUSCA ─────── */}
      <section className="bg-zinc-50 border-t border-zinc-100 py-24">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.trendCards.label}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-10">{h.trendCards.title}</h2>

          {trendCardRows.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
              {trendCardRows.map((r, i) => {
                const score = r.taime_score
                const fw    = isEn ? r.taime_framework_en : r.taime_framework_pt_br
                const tnn   = isEn ? r.then_now_next_en   : r.then_now_next_pt_br
                const line  = firstWords(fw?.executive_snapshot ?? tnn?.now ?? '', 24)
                const title = isEn ? r.title_en : r.title_pt_br
                const scoreTone = score >= 80
                  ? 'text-emerald-700 bg-emerald-50 ring-emerald-100'
                  : score >= 60 ? 'text-amber-700 bg-amber-50 ring-amber-100'
                  : 'text-orange-700 bg-orange-50 ring-orange-100'
                return (
                  <div key={i} className="group rounded-2xl border border-zinc-200 bg-white p-6 flex flex-col gap-3
                                          transition-all hover:border-taime-200 hover:shadow-lg hover:shadow-zinc-200/60 hover:-translate-y-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[10px] font-bold tracking-widest text-taime-600 uppercase mt-1.5">
                        {r.category ?? ''}
                      </span>
                      {/* Score como elemento visual destacado (chip com anel) */}
                      <span className={`shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl
                                        ring-1 tabular-nums ${scoreTone}`}>
                        <span className="text-lg font-bold leading-none">{score}</span>
                        <span className="text-[7px] font-bold tracking-widest opacity-70">SCORE</span>
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900 leading-snug line-clamp-2">{title}</h3>
                    <p className="text-sm text-zinc-500 leading-snug line-clamp-3 flex-1">{line}</p>
                    <Link
                      href={isLoggedIn ? `/reports/${r.report_id}` : '/login?from=report'}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-taime-700
                                 group-hover:text-taime-800 group-hover:gap-2 transition-all"
                    >
                      {h.trendCards.cta}
                    </Link>
                  </div>
                )
              })}
            </div>
          )}

          <HomeSearch trends={topTrends} isLoggedIn={isLoggedIn} locale={locale} trendsCta={h.trendsCta} trendsEmpty={h.trendsEmpty} />
        </div>
      </section>

      {/* ── SEÇÃO 6: FAIXA DO RADAR ────────────────────────────────────── */}
      <section className="bg-zinc-50 border-y border-zinc-100">
        <div className="max-w-5xl mx-auto px-6 py-10 flex items-center gap-6 flex-wrap sm:flex-nowrap">
          <div className="shrink-0 hidden sm:flex w-12 h-12 rounded-xl bg-taime-50 text-taime-600
                          items-center justify-center">
            {/* Antena / radar icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
              <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold tracking-widest text-taime-600 uppercase mb-1">
              {isEn ? 'RADAR · TODAY’S BRIEFING' : 'RADAR · BRIEFING DE HOJE'}
            </p>
            {latestBriefing ? (
              <>
                <p className="text-base font-bold text-zinc-900 leading-snug line-clamp-1">
                  {isEn ? (latestBriefing.title_en ?? latestBriefing.title_pt) : latestBriefing.title_pt}
                </p>
                <p className="text-sm text-zinc-500 leading-snug line-clamp-1 mt-1">
                  {(isEn ? (latestBriefing.body_en ?? latestBriefing.body_pt) : latestBriefing.body_pt) ?? ''}
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">
                {isEn
                  ? 'New daily signals on AI, cloud, security and more.'
                  : 'Novos sinais diários sobre IA, cloud, segurança e mais.'}
              </p>
            )}
          </div>
          <Link
            href="/radar"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold
                       bg-taime-600 text-white hover:bg-taime-700 transition-colors shrink-0"
          >
            {isEn ? 'See full Radar →' : 'Ver o Radar completo →'}
          </Link>
        </div>
      </section>

      {/* ── SEÇÃO 6a: CAPTURA DE E-MAIL (resumo semanal, ligado a newsletter) ── */}
      <section className="bg-white border-t border-zinc-100 py-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="section-label mb-4">{h.capture.label}</p>
          <NewsletterSignup variant="dark" />
        </div>
      </section>

      {/* ── SEÇÃO 7: PLANOS ──────────────────────────────────────────── */}
      <section id="planos" className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <p className="section-label mb-3">{h.plansLabel}</p>
          <h2 className="text-3xl font-bold text-zinc-900 mb-3">{h.plansTitle}</h2>
          <p className="text-sm text-zinc-400 mb-12">{h.plansSub}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            {h.plans.map(({ name, price, badge, desc, features, cta, href, highlight }, idx) => {
              // Os planCards do i18n vêm na ordem Free / Essential / Strategic.
              // Mapeamos o índice para a chave usada pelo /login?plan=...
              const planKey  = (['free', 'essential', 'strategic'] as const)[idx] ?? 'free'
              const ctaHref  = href.startsWith('#') ? href : `/login?plan=${planKey}`
              const ctaClass = highlight ? 'btn-primary justify-center py-3' : 'btn-secondary justify-center py-3'
              return (
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
                  {ctaHref.startsWith('#') ? (
                    <a    href={ctaHref} className={ctaClass}>{cta}</a>
                  ) : (
                    <Link href={ctaHref} className={ctaClass}>{cta}</Link>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-center text-xs text-zinc-400">{h.plansNote}</p>
          <p className="mt-4 text-xs text-zinc-500 leading-relaxed max-w-3xl mx-auto text-center">
            {h.advisorExplain}
          </p>
        </div>
      </section>

      {/* ── SEÇÃO 8: TÓPICOS QUE CHAMAM À AÇÃO (moldura fixa + temas reais) ── */}
      {topicLabels.length >= 2 && (
        <section className="border-t border-zinc-100 bg-white py-16">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <p className="section-label mb-4 justify-center">{h.topics.label}</p>
            <p className="text-xl sm:text-2xl font-semibold text-zinc-900 leading-snug max-w-3xl mx-auto mb-8">
              {topicLabels.length >= 3
                ? h.topics.lead3(topicLabels[0], topicLabels[1], topicLabels[2])
                : h.topics.lead2(topicLabels[0], topicLabels[1])}
            </p>
            <Link
              href={isLoggedIn ? '/dashboard' : '/login'}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                         bg-taime-600 text-white text-sm font-semibold hover:bg-taime-700 transition-colors"
            >
              {h.topics.cta}
            </Link>
          </div>
        </section>
      )}

      <Footer />
    </div>
  )
}
