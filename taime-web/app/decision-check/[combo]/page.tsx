import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  parseComboSlug, themeLabel, labelFor, ORG_SIZES, HORIZONS,
  MOVE_LABEL, MOVE_STYLE, scoreBarClass, type Lang,
} from '@/lib/decision-check'
import { getDecisionResult } from '@/lib/decision-check-core'
import DecisionShareButton from '@/components/DecisionShareButton'

function langOf(sp: { lang?: string }): Lang { return sp.lang === 'en' ? 'en' : 'pt' }

export async function generateMetadata({
  params, searchParams,
}: {
  params: Promise<{ combo: string }>
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { combo } = await params
  const c = parseComboSlug(combo)
  if (!c) return { title: 'TAIME Decision Check' }
  const lang = langOf(await searchParams)
  const res = await getDecisionResult(combo, c)
  const theme = themeLabel(c.theme, lang)
  const size = labelFor(ORG_SIZES, c.size, lang)
  const hor = labelFor(HORIZONS, c.horizon, lang)
  const title = lang === 'pt'
    ? `TAIME Decision Check: ${theme} para empresas ${size} em ${hor}`
    : `TAIME Decision Check: ${theme} for ${size} companies in ${hor}`
  const desc = res.ok
    ? (lang === 'pt'
        ? `Score ${res.score}, MOVE ${MOVE_LABEL[res.move].pt}. Baseado em ${res.trendCount} análises. TAIME Tech Strategic Technology Intelligence.`
        : `Score ${res.score}, MOVE ${MOVE_LABEL[res.move].en}. Based on ${res.trendCount} analyses. TAIME Tech Strategic Technology Intelligence.`)
    : (lang === 'pt'
        ? `${theme}: tema em desenvolvimento no arquivo TAIME Tech. Strategic Technology Intelligence.`
        : `${theme}: theme in development in the TAIME Tech archive. Strategic Technology Intelligence.`)
  return {
    title, description: desc,
    alternates: { canonical: `/decision-check/${combo}` },
    openGraph: { title, description: desc, type: 'website', images: ['/og-image.png'] },
    twitter: { card: 'summary_large_image', title, description: desc, images: ['/og-image.png'] },
  }
}

export default async function DecisionCheckResult({
  params, searchParams,
}: {
  params: Promise<{ combo: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { combo } = await params
  const c = parseComboSlug(combo)
  if (!c) notFound()
  const lang = langOf(await searchParams)
  const res = await getDecisionResult(combo, c)

  const theme   = themeLabel(c.theme, lang)
  const qs      = lang === 'en' ? '?lang=en' : ''
  const advisorHref   = `/advisor${qs}`
  const secondaryHref = res.reportId ? `/r/${res.reportId}${qs}` : `/login?from=report`

  const tx = {
    kicker:    'DECISION CHECK',
    ctaAdvisor:  lang === 'pt' ? `Perguntar ao Advisor sobre ${theme} →` : `Ask the Advisor about ${theme} →`,
    ctaRead:     lang === 'pt' ? 'Ou leia a análise completa' : 'Or read the full analysis',
    share:       lang === 'pt' ? 'Compartilhar' : 'Share',
    copied:      lang === 'pt' ? 'Link copiado' : 'Link copied',
    risk:        lang === 'pt' ? 'RISCO PRINCIPAL' : 'MAIN RISK',
    then:        'THEN', now: 'NOW', next: 'NEXT',
    move:        lang === 'pt' ? 'MOVIMENTO RECOMENDADO' : 'RECOMMENDED MOVE',
    score:       'TAIME SCORE',
    tagline:     'Strategic Technology Intelligence. Since 2015. From signal to decision.',
    basis: (n: number, y: number | null) => lang === 'pt'
      ? `Baseado em ${n} análises publicadas no arquivo TAIME Tech${y ? ` desde ${y}` : ''}.`
      : `Based on ${n} analyses published in the TAIME Tech archive${y ? ` since ${y}` : ''}.`,
  }

  return (
    <main className="min-h-screen bg-taime-900 text-white">
      <div className="max-w-3xl mx-auto px-6 py-14 sm:py-20">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-taime-400 mb-8">
          {tx.kicker} · {theme.toUpperCase()}
        </p>

        {!res.ok ? (
          // ── Fallback educado (tema imaturo, < 3 trends) ──────────────────────
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 mb-10">
            <p className="text-lg text-white/80 leading-relaxed">{res.fallbackMsg[lang]}</p>
          </div>
        ) : (
          <>
            {/* MOVE em destaque, cor semantica */}
            <div className={`rounded-2xl ring-1 ${MOVE_STYLE[res.move].ring} ${MOVE_STYLE[res.move].bg} p-8 mb-6`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50 mb-2">{tx.move}</p>
              <p className={`text-5xl sm:text-6xl font-black tracking-tight ${MOVE_STYLE[res.move].text}`}>
                {MOVE_LABEL[res.move][lang]}
              </p>
            </div>

            {/* Score grande + barra proporcional */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 mb-6">
              <div className="flex items-end justify-between mb-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">{tx.score}</p>
                <p className="text-5xl font-black tabular-nums leading-none">{res.score}<span className="text-xl text-white/30">/100</span></p>
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${scoreBarClass(res.score)}`} style={{ width: `${res.score}%` }} />
              </div>
            </div>

            {/* Risco principal */}
            {(res.risk[lang]) && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-6 mb-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300/80 mb-2">{tx.risk}</p>
                <p className="text-sm text-white/80 leading-relaxed">{res.risk[lang]}</p>
              </div>
            )}

            {/* THEN / NOW / NEXT em 3 blocos */}
            <div className="grid sm:grid-cols-3 gap-4 mb-8">
              {([['then', tx.then], ['now', tx.now], ['next', tx.next]] as const).map(([k, label]) => (
                <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-taime-400 mb-2">{label}</p>
                  <p className="text-[13px] text-white/70 leading-relaxed">{res.tnn[k][lang]}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-white/40 mb-10">{tx.basis(res.trendCount, res.oldestYear)}</p>
          </>
        )}

        {/* CTAs */}
        <div className="flex flex-col items-center gap-4">
          <Link href={advisorHref}
            className="w-full sm:w-auto text-center rounded-xl bg-taime-600 hover:bg-taime-500 text-white
                       font-semibold text-sm px-8 py-4 transition-colors">
            {tx.ctaAdvisor}
          </Link>
          <Link href={secondaryHref} className="text-sm text-white/50 hover:text-white underline underline-offset-4 transition-colors">
            {tx.ctaRead}
          </Link>
          <div className="mt-2">
            <DecisionShareButton label={tx.share} copied={tx.copied} />
          </div>
        </div>

        <p className="mt-14 text-center text-[11px] uppercase tracking-[0.15em] text-white/30">
          TAIME Tech · {tx.tagline}
        </p>
      </div>
    </main>
  )
}
