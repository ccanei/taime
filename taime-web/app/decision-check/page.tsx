import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import DecisionCheckForm from '@/components/DecisionCheckForm'

export const metadata: Metadata = {
  title: 'TAIME Decision Check: sua decisão de tecnologia em 4 perguntas',
  description: 'Score, MOVE e THEN/NOW/NEXT sobre a tecnologia que você está avaliando, baseado no arquivo TAIME Tech. Gratuito, sem cadastro. Strategic Technology Intelligence since 2015.',
  alternates: { canonical: '/decision-check' },
}

export default async function DecisionCheckLanding({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const sp = await searchParams
  const cookieLang = (await cookies()).get('taime-locale')?.value
  const isPt = (sp.lang ?? cookieLang) !== 'en'

  const t = {
    kicker:   isPt ? 'DECISION CHECK' : 'DECISION CHECK',
    title:    isPt ? 'Sua decisão de tecnologia, checada contra 25 anos de arquivo.'
                   : 'Your technology decision, checked against 25 years of archive.',
    sub:      isPt ? 'Quatro perguntas. Um veredito com score, movimento recomendado e a trajetória THEN / NOW / NEXT do tema. Grátis, sem cadastro.'
                   : 'Four questions. A verdict with a score, the recommended move, and the THEN / NOW / NEXT arc of the theme. Free, no signup.',
    tagline:  'Strategic Technology Intelligence. Since 2015. From signal to decision.',
  }

  return (
    <main className="min-h-screen bg-taime-900 text-white">
      <div className="max-w-3xl mx-auto px-6 py-16 sm:py-24">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-taime-400 mb-4">{t.kicker}</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-4">{t.title}</h1>
        <p className="text-base text-white/60 leading-relaxed max-w-2xl mb-10">{t.sub}</p>

        <DecisionCheckForm />

        <p className="mt-10 text-center text-[11px] uppercase tracking-[0.15em] text-white/30">
          TAIME Tech · {t.tagline}
        </p>
      </div>
    </main>
  )
}
