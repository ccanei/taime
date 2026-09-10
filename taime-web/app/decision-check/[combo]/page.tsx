import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import {
  parseComboSlug, themeLabel, labelFor, ORG_SIZES, HORIZONS, OBJECTIVES, OBJ_TO_MOVE,
  MOVE_LABEL, MOVE_STYLE, scoreBarClass, type Lang,
} from '@/lib/decision-check'
import { detectLocale } from '@/lib/i18n'
import { getDecisionResult } from '@/lib/decision-check-core'
import { SITE_URL } from '@/lib/structured-data'
import DecisionShareButton from '@/components/DecisionShareButton'
import OgDownloadButton from '@/components/OgDownloadButton'
import OgCardPreview from '@/components/OgCardPreview'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

// Versao da imagem do Report Card no CDN. Bump muda a URL do og:image (e da previa/
// download), invalidando o PNG cacheado. v2: MOVE passou a vir do getDecisionResult
// (igual a pagina). v3: busca de trends ampliada para o arquivo completo (score, rodape
// e radar mudam), entao os PNGs antigos precisam ser regenerados.
const OG_V = 3

// Mesmo mecanismo do site: ?lang=en|pt e override manual; senao o cookie taime-locale
// (gravado pelo proxy a partir do Accept-Language na 1a visita) via detectLocale.
async function resolveLang(spLang: string | undefined): Promise<Lang> {
  if (spLang === 'en') return 'en'
  if (spLang === 'pt') return 'pt'
  return detectLocale((await cookies()).get('taime-locale')?.value)
}

export async function generateMetadata({
  params, searchParams,
}: {
  params: Promise<{ combo: string }>
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { combo } = await params
  const c = parseComboSlug(combo)
  // Combo invalido (inclui URLs de faixas ANTIGAS 100/1000/10k/10000): noindex para
  // nao prejudicar SEO. A pagina retorna 404 (notFound) de qualquer forma.
  if (!c) return { title: 'TAIME Decision Check', robots: { index: false, follow: false } }
  const lang = await resolveLang((await searchParams).lang)
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
  // og:image dinamico (Report Card real do tema). Absoluto para os crawlers.
  const ogImg = `${SITE_URL}/api/og/decision-check/${combo}?lang=${lang}&v=${OG_V}`
  return {
    title, description: desc,
    alternates: { canonical: `/decision-check/${combo}` },
    openGraph: { title, description: desc, type: 'website', images: [{ url: ogImg, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description: desc, images: [ogImg] },
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
  const lang = await resolveLang((await searchParams).lang)
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
    download:    lang === 'pt' ? 'Baixar imagem' : 'Download image',
    previewLabel: lang === 'pt' ? 'Prévia do card para compartilhar' : 'Preview of the shareable card',
    previewOpen:  lang === 'pt' ? 'Abrir em tamanho real' : 'Open full size',
    previewAlt:   lang === 'pt' ? `Report Card do TAIME: ${theme}` : `TAIME Report Card: ${theme}`,
    risk:        lang === 'pt' ? 'RISCO PRINCIPAL' : 'MAIN RISK',
    then:        'THEN', now: 'NOW', next: 'NEXT',
    move:        lang === 'pt' ? 'MOVIMENTO RECOMENDADO' : 'RECOMMENDED MOVE',
    yourObjective: lang === 'pt' ? 'SEU OBJETIVO' : 'YOUR OBJECTIVE',
    taimeRead:     lang === 'pt' ? 'LEITURA DO TAIME' : 'TAIME READ',
    aligned:       lang === 'pt' ? 'ALINHADO' : 'ALIGNED',
    tension:       lang === 'pt' ? 'TENSÃO' : 'TENSION',
    score:       'TAIME SCORE',
    tagline:     'Strategic Technology Intelligence. Since 2015. From signal to decision.',
    basis: (n: number, y: number | null) => lang === 'pt'
      ? `Baseado em ${n} análises publicadas no arquivo TAIME Tech${y ? ` desde ${y}` : ''}.`
      : `Based on ${n} analyses published in the TAIME Tech archive${y ? ` since ${y}` : ''}.`,
  }

  return (
    <>
      <Navbar />
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
            {/* SEU OBJETIVO x LEITURA DO TAIME, lado a lado (nao fundidos) */}
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div className={`rounded-2xl ring-1 ${MOVE_STYLE[OBJ_TO_MOVE[c.objective]].ring} ${MOVE_STYLE[OBJ_TO_MOVE[c.objective]].bg} p-6`}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50 mb-2">{tx.yourObjective}</p>
                <p className={`text-3xl sm:text-4xl font-black tracking-tight ${MOVE_STYLE[OBJ_TO_MOVE[c.objective]].text}`}>
                  {labelFor(OBJECTIVES, c.objective, lang).toUpperCase()}
                </p>
              </div>
              <div className={`rounded-2xl ring-1 ${MOVE_STYLE[res.move].ring} ${MOVE_STYLE[res.move].bg} p-6`}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50 mb-2">{tx.taimeRead}</p>
                <p className={`text-3xl sm:text-4xl font-black tracking-tight ${MOVE_STYLE[res.move].text}`}>
                  {MOVE_LABEL[res.move][lang]}
                </p>
              </div>
            </div>

            {/* Alinhamento: verde+check (ALINHADO) ou ambar+atencao (TENSAO) */}
            {res.alignment[lang] && (
              <div className={`rounded-2xl ring-1 p-5 mb-6 flex items-start gap-3 ${
                res.alignmentStatus === 'tension' ? 'ring-amber-500/30 bg-amber-500/10' : 'ring-emerald-500/30 bg-emerald-500/10'}`}>
                <span className={`mt-0.5 shrink-0 ${res.alignmentStatus === 'tension' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {res.alignmentStatus === 'tension' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-[0.18em] mb-1 ${res.alignmentStatus === 'tension' ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {res.alignmentStatus === 'tension' ? tx.tension : tx.aligned}
                  </p>
                  <p className="text-sm text-white/80 leading-relaxed">{res.alignment[lang]}</p>
                </div>
              </div>
            )}

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

            {/* Previa do Report Card compartilhavel (complementar ao conteudo acima) */}
            <OgCardPreview
              src={`/api/og/decision-check/${combo}?lang=${lang}&v=${OG_V}`}
              label={tx.previewLabel}
              openLabel={tx.previewOpen}
              alt={tx.previewAlt}
            />
            <div className="flex items-center gap-3 mb-4">
              <DecisionShareButton label={tx.share} copied={tx.copied} />
              <OgDownloadButton href={`/api/og/decision-check/${combo}?lang=${lang}&v=${OG_V}`} label={tx.download} variant="dark" />
            </div>
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
          {!res.ok && (
            <div className="mt-2 flex items-center gap-3">
              <DecisionShareButton label={tx.share} copied={tx.copied} />
            </div>
          )}
        </div>

        <p className="mt-14 text-center text-[11px] uppercase tracking-[0.15em] text-white/30">
          TAIME Tech · {tx.tagline}
        </p>
      </div>
      </main>
      <Footer />
    </>
  )
}
