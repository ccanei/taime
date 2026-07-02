'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { TaimeFramework } from '@/lib/types'
import { normalize, scoreText } from '@/lib/searchMatch'

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
        smartFailed: 'Smart search unavailable, using normal filter.',
      }
    : {
        placeholder: 'Buscar tendências... (Enter para busca inteligente)',
        empty:       'Nenhuma tendência encontrada.',
        smart:       'Busca inteligente',
        smartHint:   'Resultados ordenados por relevância semântica.',
        smartClear:  'Voltar à busca normal',
        smartLoading: 'Buscando...',
        smartFailed: 'Busca inteligente indisponível, usando filtro normal.',
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
  // múltiplas trends, todas mantêm a posição do report.
  // Modo NORMAL: filtro instantâneo por includes() no título e snapshot.
  const visible = useMemo(() => {
    if (semanticMatches) {
      const order = new Map(semanticMatches.map((m, i) => [m.id, i]))
      return trends
        .filter(t => order.has(t.report_id))
        .sort((a, b) => (order.get(a.report_id) ?? 0) - (order.get(b.report_id) ?? 0))
    }
    // Busca começa VAZIA: nada é renderizado até o usuário digitar. Evita a
    // parede de cards pré-carregados apontando para /login.
    if (!query.trim()) return []
    // Mesmo motor do Dashboard: normalização de acentos, sinônimos
    // (IA → agentic, nuvem → cloud, etc.) e scoring ponderado.
    return trends
      .map(t => {
        const fields = [
          { text: normalize((t.title_pt_br ?? '') + ' ' + (t.title_en ?? '')), weight: 3 },
          { text: normalize(
              (t.taime_framework_pt_br?.executive_snapshot ?? '') + ' ' +
              (t.taime_framework_en?.executive_snapshot ?? ''),
            ), weight: 2,
          },
        ]
        return { t, score: scoreText(fields, query) }
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ t }) => t)
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((trend, i) => {
            const title = isEn ? trend.title_en : trend.title_pt_br
            const fw    = isEn ? trend.taime_framework_en : trend.taime_framework_pt_br
            const snap  = fw?.executive_snapshot ?? ''
            const prev  = snap.length > 140 ? snap.slice(0, 140).trimEnd() + '...' : snap
            const href  = isLoggedIn ? `/reports/${trend.report_id}` : '/login'
            const scoreText = trend.taime_score >= 80 ? 'text-emerald-600'
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
                    <p className={`font-bold text-lg tabular-nums leading-none ${scoreText}`}>
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
      ) : (query.trim() || semanticMatches) ? (
        // Só mostra "nada encontrado" quando o usuário de fato buscou.
        <div className="rounded-xl border border-dashed border-zinc-200 p-10 text-center text-zinc-400 text-sm">
          {L.empty}
        </div>
      ) : null}
    </div>
  )
}
