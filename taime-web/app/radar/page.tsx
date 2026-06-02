import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { detectLocale } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'Radar TAIME: Sinais de Tecnologia em Tempo Real',
  description: 'Sinais de tecnologia coletados de fontes globais e atualizados continuamente. IA, cloud, cibersegurança, dados, regulação e mais. Technology signals from global sources, continuously updated.',
  alternates: {
    canonical: 'https://www.taime.tech/radar',
  },
  openGraph: {
    title: 'Radar TAIME: Sinais de Tecnologia',
    description: 'Sinais de tecnologia de fontes globais, atualizados continuamente.',
    url:   'https://www.taime.tech/radar',
    type:  'website',
  },
}

interface RadarSignal {
  id:              string
  title_pt:        string | null
  title_en:        string | null
  summary_pt:      string | null
  summary_en:      string | null
  category:        string | null
  relevance:       string | null
  source_category: string | null
  url:             string | null
  published_at:    string | null
  collected_at:    string | null
}

const CATEGORY_COLORS: Record<string, string> = {
  IA:             'bg-violet-100 text-violet-700',
  Cloud:          'bg-blue-100 text-blue-700',
  Cybersecurity:  'bg-red-100 text-red-700',
  Fintech:        'bg-emerald-100 text-emerald-700',
  Infrastructure: 'bg-orange-100 text-orange-700',
  Regulation:     'bg-yellow-100 text-yellow-700',
  Market:         'bg-zinc-100 text-zinc-600',
}

function formatDateAbsolute(dateStr: string | null, isPt: boolean): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return isPt
    ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : d.toLocaleDateString('en-US',  { month: 'long', day: '2-digit', year: 'numeric' })
}

function dayKey(dateStr: string | null): string {
  if (!dateStr) return '0000-00-00'
  return new Date(dateStr).toISOString().slice(0, 10)
}

async function getSignals(): Promise<RadarSignal[]> {
  const supabaseUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL || ''
  ).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')

  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!supabaseUrl || !supabaseKey) return []

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/radar_signals?order=collected_at.desc&limit=30`,
      {
        headers: {
          apikey:        supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        // ISR: revalida a cada 30 min, cron alimenta a tabela 2x/dia
        // mais frescor que isso é desperdício de cache.
        next: { revalidate: 60 * 30 },
      },
    )
    if (!res.ok) {
      console.error('radar page: REST error', res.status, await res.text())
      return []
    }
    return await res.json() as RadarSignal[]
  } catch (err) {
    console.error('radar page: fatal', err)
    return []
  }
}

export default async function RadarPage() {
  const locale = detectLocale((await cookies()).get('taime-locale')?.value)
  const isPt = locale === 'pt'

  const signals = await getSignals()

  // Agrupa por dia (YYYY-MM-DD) preservando ordem desc.
  const groups: { day: string; items: RadarSignal[] }[] = []
  for (const s of signals) {
    const k = dayKey(s.collected_at ?? s.published_at)
    const last = groups[groups.length - 1]
    if (last && last.day === k) last.items.push(s)
    else groups.push({ day: k, items: [s] })
  }

  const h1       = isPt ? 'Radar TAIME' : 'TAIME Radar'
  const sub      = isPt
    ? 'Sinais de tecnologia coletados de fontes globais: pesquisa, consultoria, capital de risco, mídia e órgãos reguladores. Atualizado continuamente.'
    : 'Technology signals from global sources: research, consulting, venture capital, media, and regulatory bodies. Updated continuously.'
  const label    = isPt ? 'INTELIGÊNCIA EM TEMPO REAL' : 'REAL-TIME INTELLIGENCE'
  const empty    = isPt ? 'Nenhum sinal coletado ainda.' : 'No signals collected yet.'
  const srcLabel = isPt ? 'FONTE' : 'SOURCE'
  const readMore = isPt ? 'Ler na fonte →' : 'Read at source →'

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-12">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold
                         bg-taime-50 text-taime-600 ring-1 ring-taime-100 mb-6">
          {label}
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900 leading-tight mb-4">
          {h1}
        </h1>
        <p className="text-zinc-500 text-base sm:text-lg max-w-2xl leading-relaxed">
          {sub}
        </p>
      </section>

      {/* Feed */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        {signals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-16 text-center text-sm text-zinc-400">
            {empty}
          </div>
        ) : (
          <div className="space-y-12">
            {groups.map(({ day, items }) => (
              <div key={day}>
                <h2 className="text-xs font-bold text-zinc-400 tracking-widest uppercase mb-4 pb-3 border-b border-zinc-100">
                  {formatDateAbsolute(items[0].collected_at ?? items[0].published_at, isPt)}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {items.map(item => {
                    const title   = (isPt ? item.title_pt   : item.title_en)   ?? item.title_en   ?? item.title_pt   ?? ''
                    const summary = (isPt ? item.summary_pt : item.summary_en) ?? item.summary_en ?? item.summary_pt ?? ''
                    const category = item.category ?? '-'
                    const catCls   = CATEGORY_COLORS[category] ?? 'bg-zinc-100 text-zinc-600'
                    return (
                      <article
                        key={item.id}
                        className="bg-white rounded-xl border border-zinc-200 p-5 flex flex-col gap-3
                                   hover:border-taime-200 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${catCls}`}>
                            {category}
                          </span>
                          {item.relevance && (
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                              {item.relevance}
                            </span>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-zinc-900 leading-snug">
                          {title}
                        </h3>

                        {summary && (
                          <p className="text-sm text-zinc-600 leading-relaxed">
                            {summary}
                          </p>
                        )}

                        <div className="pt-3 mt-auto border-t border-zinc-100 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold text-zinc-400 tracking-wider uppercase">
                              {srcLabel}
                            </p>
                            <p className="text-xs text-zinc-600 truncate">{item.source_category ?? '-'}</p>
                          </div>
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-taime-600 hover:text-taime-700 transition-colors shrink-0"
                            >
                              {readMore}
                            </a>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </div>
  )
}
