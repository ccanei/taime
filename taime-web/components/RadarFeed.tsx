'use client'

import { useState, useEffect } from 'react'
import { useLocale } from '@/lib/useLocale'

interface RadarItem {
  id:              string
  title_pt:        string
  title_en:        string
  summary_pt:      string
  summary_en:      string
  category:        string
  source_category: string
  url:             string
  collected_at:    string
}

const CATEGORY_COLORS: Record<string, string> = {
  'IA':             'bg-violet-100 text-violet-700',
  'Cloud':          'bg-blue-100 text-blue-700',
  'Cybersecurity':  'bg-red-100 text-red-700',
  'Fintech':        'bg-emerald-100 text-emerald-700',
  'Infrastructure': 'bg-orange-100 text-orange-700',
  'Regulation':     'bg-yellow-100 text-yellow-700',
  'Market':         'bg-zinc-100 text-zinc-600',
}

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr)
  if (locale === 'en') {
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length <= max ? text : text.slice(0, max).trimEnd() + '...'
}

export default function RadarFeed() {
  const { locale } = useLocale()
  const isPt = locale === 'pt'

  const [items,   setItems]   = useState<RadarItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/radar')
      .then(r => r.json())
      .then((data: RadarItem[]) => {
        const shuffled = [...data].sort(() => Math.random() - 0.5)
        setItems(shuffled.slice(0, 4))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const label    = 'RADAR TAIME'
  const title    = isPt ? 'Radar de Hoje' : "Today's Radar"
  const subtitle = isPt ? 'Sinais do que está acontecendo no mundo da tecnologia'
                        : 'Signals from what is happening in technology'
  const empty    = isPt ? 'Nenhum sinal coletado ainda.' : 'No signals collected yet.'

  return (
    <section className="bg-zinc-50 border-y border-zinc-100 py-16">
      <div className="max-w-5xl mx-auto px-6">

        <div className="mb-8">
          <p className="section-label mb-1">{label}</p>
          <h2 className="text-2xl font-bold text-zinc-900">{title}</h2>
          <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-zinc-200 p-4 animate-pulse h-40" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-10 text-center text-sm text-zinc-400">
            {empty}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {items.map(item => {
              const summary = truncate(isPt ? item.summary_pt : item.summary_en, 120)
              return (
                <div key={item.id}
                  className="bg-white rounded-xl border border-zinc-200 p-4 flex flex-col gap-3
                             hover:border-taime-200 transition-colors">

                  {/* Category badge */}
                  <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-full
                    ${CATEGORY_COLORS[item.category] ?? 'bg-zinc-100 text-zinc-600'}`}>
                    {item.category}
                  </span>

                  {/* Title */}
                  <h3 className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2">
                    {isPt ? item.title_pt : item.title_en}
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-zinc-500 leading-relaxed flex-1">
                    {summary}
                  </p>

                  {/* Footer */}
                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] text-zinc-400 block truncate">{item.source_category}</span>
                      <span className="text-[10px] text-zinc-300">{formatDate(item.collected_at, locale)}</span>
                    </div>
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-semibold text-taime-600 hover:text-taime-700
                                 transition-colors shrink-0">
                      {isPt ? 'Ver fonte →' : 'Source →'}
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
