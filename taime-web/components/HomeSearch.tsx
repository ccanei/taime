'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { scoreColor } from '@/lib/types'
import type { TaimeFramework } from '@/lib/types'

interface HomeTrend {
  report_id: string
  title_pt_br: string
  title_en: string
  taime_score: number
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en: TaimeFramework | null
}

interface SemanticMatch {
  id:         string
  similarity: number
}

function scoreRingCls(score: number): string {
  if (score >= 85) return 'ring-emerald-200 bg-emerald-50'
  if (score >= 70) return 'ring-taime-200 bg-taime-50'
  if (score >= 50) return 'ring-amber-200 bg-amber-50'
  return 'ring-zinc-200 bg-zinc-50'
}

export default function HomeSearch({
  trends,
  isLoggedIn,
  locale,
  trendsCta,
  trendsEmpty,
}: {
  trends: HomeTrend[]
  isLoggedIn: boolean
  locale: 'pt' | 'en'
  trendsCta: string
  trendsEmpty: string
}) {
  const [query,           setQuery]           = useState('')
  const [semanticMatches, setSemanticMatches] = useState<SemanticMatch[] | null>(null)
  const [smartLoading,    setSmartLoading]    = useState(false)
  const [smartError,      setSmartError]      = useState(false)
  const isEn = locale === 'en'

  const L = isEn
    ? {
        placeholder: 'Search trends... (Enter for smart search)',
        empty:       'No trends found.',
        smart:       'Smart search',
        smartHint:   'Ranked by semantic relevance.',
        smartClear:  'Back to normal search',
        smartLoading: 'Searching...',
        smartFailed: 'Smart search unavailable — using normal filter.',
      }
    : {
        placeholder: 'Buscar tendências... (Enter para busca inteligente)',
        empty:       'Nenhuma tendência encontrada.',
        smart:       'Busca inteligente',
        smartHint:   'Resultados ordenados por relevância semântica.',
        smartClear:  'Voltar à busca normal',
        smartLoading: 'Buscando...',
        smartFailed: 'Busca inteligente indisponível — usando filtro normal.',
      }

  async function runSmartSearch() {
    const q = query.trim()
    if (!q) { setSemanticMatches(null); setSmartError(false); return }
    setSmartLoading(true); setSmartError(false)
    try {
      const res = await fetch('/api/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: q, limit: 25 }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const json = await res.json() as { results?: SemanticMatch[] }
      setSemanticMatches(json.results ?? [])
    } catch {
      setSemanticMatches(null)
      setSmartError(true)
    } finally {
      setSmartLoading(false)
    }
  }

  function clearSmart() {
    setSemanticMatches(null)
    setSmartError(false)
  }

  // Modo SEMÂNTICO: reordena pelas report_ids da API; cada report pode ter
  // múltiplas trends — todas mantêm a posição do report.
  // Modo NORMAL: filtro instantâneo por includes() no título e snapshot.
  const visible = useMemo(() => {
    if (semanticMatches) {
      const order = new Map(semanticMatches.map((m, i) => [m.id, i]))
      return trends
        .filter(t => order.has(t.report_id))
        .sort((a, b) => (order.get(a.report_id) ?? 0) - (order.get(b.report_id) ?? 0))
    }
    if (!query.trim()) return trends
    const q = query.toLowerCase()
    return trends.filter(t =>
      t.title_pt_br.toLowerCase().includes(q) ||
      t.title_en.toLowerCase().includes(q) ||
      t.taime_framework_pt_br?.executive_snapshot?.toLowerCase().includes(q) ||
      t.taime_framework_en?.executive_snapshot?.toLowerCase().includes(q),
    )
  }, [trends, query, semanticMatches])

  return (
    <div>
      <div className="mb-3">
        <input
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            if (semanticMatches) clearSmart()
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void runSmartSearch()
            }
          }}
          disabled={smartLoading}
          placeholder={L.placeholder}
          className="w-full max-w-md px-4 py-2.5 text-sm rounded-lg border border-zinc-200 bg-white
                     text-zinc-900 placeholder:text-zinc-400
                     focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent
                     disabled:opacity-60"
        />
      </div>

      {smartLoading && (
        <div className="mb-5 flex items-center gap-2 text-xs text-zinc-500">
          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {L.smartLoading}
        </div>
      )}
      {semanticMatches && !smartLoading && (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold
                           bg-taime-50 text-taime-700 border border-taime-100">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2.39 7.36H22l-6.19 4.5L18.18 22 12 17.5 5.82 22l2.37-8.14L2 9.36h7.61z" />
            </svg>
            {L.smart}
          </span>
          <span className="text-xs text-zinc-500">{L.smartHint}</span>
          <button
            type="button"
            onClick={clearSmart}
            className="text-xs text-taime-600 hover:underline ml-1"
          >
            {L.smartClear}
          </button>
        </div>
      )}
      {smartError && (
        <div className="mb-5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-md">
          {L.smartFailed}
        </div>
      )}

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {visible.map((trend, i) => {
            const title = isEn ? trend.title_en : trend.title_pt_br
            const fw    = isEn ? trend.taime_framework_en : trend.taime_framework_pt_br
            const snap  = fw?.executive_snapshot ?? ''
            const prev  = snap.length > 120 ? snap.slice(0, 120).trimEnd() + '...' : snap
            const href  = isLoggedIn ? `/reports/${trend.report_id}` : '/login'
            return (
              <div key={i} className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col gap-4
                                       hover:border-taime-200 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center
                                  shrink-0 ring-2 ${scoreRingCls(trend.taime_score)}`}>
                    <span className={`font-bold text-xl tabular-nums leading-none ${scoreColor(trend.taime_score)}`}>
                      {trend.taime_score}
                    </span>
                    <span className="text-[8px] text-zinc-400 font-bold tracking-wide">SCORE</span>
                  </div>
                  <p className="text-sm font-bold text-zinc-900 leading-snug">{title}</p>
                </div>
                {prev && <p className="text-xs text-zinc-500 leading-relaxed flex-1">{prev}</p>}
                <Link href={href} className="text-xs font-semibold text-taime-600 hover:text-taime-700 transition-colors">
                  {trendsCta}
                </Link>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-200 p-10 text-center text-zinc-400 text-sm">
          {(query.trim() || semanticMatches) ? L.empty : trendsEmpty}
        </div>
      )}
    </div>
  )
}
