import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, detectLocale } from '@/lib/i18n'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import FaqAccordion from '@/components/FaqAccordion'
import JsonLd from '@/components/JsonLd'
import { faqNode } from '@/lib/structured-data'

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.taime.tech/faq' },
  title: 'FAQ',
}

export default async function FaqPage() {
  const locale = detectLocale((await cookies()).get('taime-locale')?.value)
  const t = getTranslations(locale)
  const h = t.home
  const faqItems = t.faq.items as unknown as { q: string; a: string }[]

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <JsonLd data={faqNode(faqItems, locale === 'pt' ? 'pt-BR' : 'en')} />
      <Navbar />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 py-20">
          <p className="section-label mb-3">{h.faqLabel}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-10 leading-snug">
            {h.faqTitle}
          </h1>
          <FaqAccordion items={faqItems} />
        </section>
      </main>

      <Footer />
    </div>
  )
}
