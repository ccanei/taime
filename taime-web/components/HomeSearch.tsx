'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TaimeFramework } from '@/lib/types'

interface HomeTrend {
  report_id:             string
  title_pt_br:           string | null
  title_en:              string | null
  taime_score:           number
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en:    TaimeFramework | null
}

// A busca da home chama /api/search/text (text-match ilike no servidor), que
// cobre TODOS os reports published, independente de embeddings. Campo VAZIO nao
// renderiza nada (sem parede de cards). Com texto, busca de verdade e mostra os
// matches; sem matches, mostra "nada encontrado".
export default function HomeSearch(props: {
  trends:      HomeTrend[]
  isLoggedIn:  boolean
  locale:      'pt' | 'en'
  trendsCta:   string
  trendsEmpty: string
}) {
  const { isLoggedIn, locale, trendsCta } = props
  const isEn = locale === 'en'

  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<HomeTrend[] | null>(null) // null = ainda nao buscou
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(false)

  const L = isEn
    ? { placeholder: 'Search trends...',      empty: 'No trends found.',          loading: 'Searching...', failed: 'Search unavailable, try again.' }
    : { placeholder: 'Buscar tendências...',  empty: 'Nenhuma tendência encontrada.', loading: 'Buscando...',  failed: 'Busca indisponível, tente de novo.' }

  // Debounce da busca. Vazio limpa; com texto consulta o endpoint de text-match.
  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults(null); setLoading(false); setError(false); return }
    setLoading(true); setError(false)
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/search/text', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ query: q, limit: 24 }),
          signal:  ctrl.signal,
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const json = await res.json() as { results?: HomeTrend[] }
        setResults(json.results ?? [])
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return
        setResults([])
        setError(true)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [query])

  const visible = results ?? []

  return (
    <div>
      <div className="mb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={L.placeholder}
          className="w-full max-w-md px-4 py-2.5 text-sm rounded-lg border border-zinc-200 bg-white
                     text-zinc-900 placeholder:text-zinc-400
                     focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent"
        />
      </div>

      {loading && (
        <div className="mb-5 flex items-center gap-2 text-xs text-zinc-500">
          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {L.loading}
        </div>
      )}
      {error && !loading && (
        <div className="mb-5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-md">
          {L.failed}
        </div>
      )}

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((trend, i) => {
            const title = isEn ? trend.title_en : trend.title_pt_br
            const fw    = isEn ? trend.taime_framework_en : trend.taime_framework_pt_br
            const snap  = fw?.executive_snapshot ?? ''
            const prev  = snap.length > 140 ? snap.slice(0, 140).trimEnd() + '...' : snap
            const href  = isLoggedIn ? `/reports/${trend.report_id}` : '/login'
            const scoreColor = trend.taime_score >= 80 ? 'text-emerald-600'
              : trend.taime_score >= 60 ? 'text-amber-600'
              : 'text-orange-600'
            const scoreBg = trend.taime_score >= 80 ? 'bg-emerald-50 border-emerald-100'
              : trend.taime_score >= 60 ? 'bg-amber-50 border-amber-100'
              : 'bg-orange-50 border-orange-100'
            return (
              <Link
                key={i}
                href={href}
                className="group relative flex flex-col gap-4 p-6 rounded-2xl
                           bg-white border border-zinc-200
                           hover:border-taime-300 hover:shadow-md hover:-translate-y-0.5
                           transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 rounded-xl ${scoreBg} border px-2.5 py-1.5 text-center min-w-[48px]`}>
                    <p className={`font-bold text-lg tabular-nums leading-none ${scoreColor}`}>
                      {trend.taime_score}
                    </p>
                    <p className="text-[8px] text-zinc-400 font-bold tracking-widest mt-0.5">SCORE</p>
                  </div>
                  <h3 className="flex-1 min-w-0 text-sm font-bold text-zinc-900 leading-snug
                                 group-hover:text-taime-700 transition-colors line-clamp-3">
                    {title}
                  </h3>
                </div>
                {prev && (
                  <p className="text-xs text-zinc-500 leading-relaxed flex-1 line-clamp-4">{prev}</p>
                )}
                <span className="text-xs font-semibold text-taime-600 group-hover:text-taime-700 transition-colors">
                  {trendsCta}
                </span>
              </Link>
            )
          })}
        </div>
      ) : (query.trim() && results && !loading) ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-10 text-center text-zinc-400 text-sm">
          {L.empty}
        </div>
      ) : null}
    </div>
  )
}
