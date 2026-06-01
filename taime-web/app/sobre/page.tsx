import { cookies } from 'next/headers'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { getTranslations, detectLocale } from '@/lib/i18n'

export async function generateMetadata() {
  const locale = detectLocale((await cookies()).get('taime-locale')?.value)
  const t = getTranslations(locale)
  return {
    title: t.sobre.badge,
    description: t.sobre.missionQuote,
    alternates: {
      canonical: 'https://www.taime.tech/sobre',
    },
  }
}

export default async function SobrePage() {
  const locale = detectLocale((await cookies()).get('taime-locale')?.value)
  const t = getTranslations(locale)
  const s = t.sobre

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pt-24 pb-16">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold
                         bg-taime-50 text-taime-600 ring-1 ring-taime-100 mb-8">
          {s.badge}
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900 leading-[1.1] mb-6">
          {s.h1}
        </h1>
      </section>

      {/* ── ORIGEM ───────────────────────────────────────────────────── */}
      <section className="bg-zinc-50 border-y border-zinc-100 py-16">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-[10px] font-bold tracking-widest text-zinc-400 mb-6 uppercase">
            {s.originLabel}
          </p>
          <div className="space-y-5 text-zinc-600 text-base leading-relaxed">
            {s.origin.map((para, i) => (
              <p key={i} className={i === s.origin.length - 1 ? 'font-semibold text-zinc-900' : ''}>
                {para}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── MISSÃO ───────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-[10px] font-bold tracking-widest text-zinc-400 mb-6 uppercase">
            {s.missionLabel}
          </p>
          <blockquote className="border-l-4 border-taime-600 pl-6">
            <p className="text-2xl font-bold text-zinc-900 leading-snug mb-4">
              {s.missionQuote}
            </p>
            <p className="text-zinc-500 text-base leading-relaxed">
              {s.missionBody}
            </p>
          </blockquote>
        </div>
      </section>

      {/* ── COMO TRABALHAMOS ─────────────────────────────────────────── */}
      <section className="bg-zinc-50 border-t border-zinc-100 py-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-[10px] font-bold tracking-widest text-zinc-400 mb-4 uppercase">
            {s.methodLabel}
          </p>
          <h2 className="text-2xl font-bold text-zinc-900 mb-10">
            {s.methodTitle}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {s.methodCards.map(({ title, desc }) => (
              <div key={title} className="bg-white rounded-xl border border-zinc-200 p-6">
                <div className="w-8 h-8 rounded-lg bg-taime-50 flex items-center justify-center mb-4">
                  <div className="w-2 h-2 rounded-full bg-taime-600" />
                </div>
                <h3 className="text-sm font-bold text-zinc-900 mb-2">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LINKEDIN + CTA ───────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center
                        justify-between gap-8">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-zinc-400 mb-3 uppercase">
              {s.linkedinLabel}
            </p>
            <a
              href="https://www.linkedin.com/company/taime-tech"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-taime-600
                         hover:text-taime-700 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239
                         5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966
                         0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783
                         1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586
                         7-2.777 7 2.476v6.759z"/>
              </svg>
              {s.linkedinCta}
            </a>
          </div>

          <Link href="/login" className="btn-primary text-base px-7 py-3">
            {s.ctaBtn}
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}
