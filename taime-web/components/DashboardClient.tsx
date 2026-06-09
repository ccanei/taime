'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatPeriod, formatPeriodFull, avgScore, scoreColor, scoreRing } from '@/lib/types'
import type { Report } from '@/lib/types'
import { scoreMatchReport } from '@/lib/searchMatch'

type Locale = 'pt' | 'en'

const UI = {
  pt: {
    search:      'Buscar por título... (Enter para busca inteligente)',
    allPeriods:  'Todos os períodos',
    allCategories: 'Todas',
    filterCount: (n: number, total: number) => `${n} de ${total} relatório${total !== 1 ? 's' : ''}`,
    filterSearch: (q: string) => `busca: "${q}"`,
    filterPeriod: (p: string) => `período: ${p}`,
    filterCategory: (c: string) => `categoria: ${c}`,
    empty:       'Nenhum relatório encontrado.',
    clearFilter: 'Limpar filtros',
    trends:      (n: number) => `${n} trend${n !== 1 ? 's' : ''}`,
    published:   'Publicado',
    dateLang:    'pt-BR' as const,
    periodLang:  'pt-BR' as const,
    smart:       'Busca inteligente',
    smartHint:   'Resultados ordenados por relevância semântica.',
    smartClear:  'Voltar à busca normal',
    smartLoading: 'Buscando...',
    smartFailed: 'Busca inteligente indisponível — usando filtro normal.',
  },
  en: {
    search:      'Search by title... (Enter for smart search)',
    allPeriods:  'All periods',
    allCategories: 'All',
    filterCount: (n: number, total: number) => `${n} of ${total} report${total !== 1 ? 's' : ''}`,
    filterSearch: (q: string) => `search: "${q}"`,
    filterPeriod: (p: string) => `period: ${p}`,
    filterCategory: (c: string) => `category: ${c}`,
    empty:       'No reports found.',
    clearFilter: 'Clear filters',
    trends:      (n: number) => `${n} trend${n !== 1 ? 's' : ''}`,
    published:   'Published',
    dateLang:    'en-US' as const,
    periodLang:  'en' as const,
    smart:       'Smart search',
    smartHint:   'Ranked by semantic relevance.',
    smartClear:  'Back to normal search',
    smartLoading: 'Searching...',
    smartFailed: 'Smart search unavailable — using normal filter.',
  },
}

interface SemanticMatch {
  id:         string
  similarity: number
}

export default function DashboardClient({
  reports,
  locale = 'pt',
}: {
  reports: Report[]
  locale?: Locale
}) {
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('')
  const [category, setCategory] = useState('')
  const [semanticMatches, setSemanticMatches] = useState<SemanticMatch[] | null>(null)
  const [smartLoading,    setSmartLoading]    = useState(false)
  const [smartError,      setSmartError]      = useState(false)
  const t = UI[locale]

  async function runSmartSearch() {
    const q = search.trim()
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
      // Fallback gracioso: limpa o estado semântico e marca o erro.
      // O filtro client-side por palavra-chave continua valendo.
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

  const periods = useMemo(
    // Dedup por ANO-MÊS ('2026-05'): meses com 2 quinzenas aparecem 1× só.
    () => [...new Set(reports.map(r => r.period.slice(0, 7)))].sort().reverse(),
    [reports],
  )

  // categorias disponíveis (das trends de todos os reports), ordenadas por frequência
  const categories = useMemo(() => {
    const freq = new Map<string, number>()
    for (const r of reports) {
      const seen = new Set<string>()
      for (const tr of r.report_trends ?? []) {
        const c = (tr as { category?: string | null }).category
        if (!c || seen.has(c)) continue
        seen.add(c)
        freq.set(c, (freq.get(c) ?? 0) + 1)
      }
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [reports])

  const filtered = useMemo(() => {
    // Filtros estruturais (período + categoria) sempre se aplicam.
    function passesStructural(r: Report): boolean {
      // `period` agora guarda ano-mês ('2026-05'); um relatório de qualquer
      // quinzena do mês passa pelo filtro.
      if (period && r.period.slice(0, 7) !== period) return false
      if (category) {
        const has = (r.report_trends ?? []).some(
          tr => (tr as { category?: string | null }).category === category,
        )
        if (!has) return false
      }
      return true
    }

    // Modo SEMÂNTICO ativo: reordena pela similaridade vinda da API,
    // depois aplica os filtros estruturais. Reports fora da resposta
    // semântica não entram (a API já retornou os top-K por relevância).
    if (semanticMatches) {
      const order = new Map(semanticMatches.map((m, i) => [m.id, i]))
      return reports
        .filter(r => order.has(r.id) && passesStructural(r))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    }

    // Modo NORMAL: filtro instantâneo por palavra-chave (scoreMatch + sinônimos).
    return reports
      .map(r => ({ report: r, score: scoreMatchReport(r, search) }))
      .filter(({ report: r, score }) => score > 0 && passesStructural(r))
      .sort((a, b) => b.score - a.score)
      .map(({ report: r }) => r)
  }, [reports, search, period, category, semanticMatches])

  return (
    <>
      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <input
          type="text"
          placeholder={t.search}
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            // Mudar o texto invalida o estado semântico — volta ao filtro normal.
            if (semanticMatches) clearSmart()
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void runSmartSearch()
            }
          }}
          disabled={smartLoading}
          className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-zinc-200 bg-white
                     text-zinc-900 placeholder:text-zinc-400
                     focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent
                     disabled:opacity-60"
        />
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="px-4 py-2.5 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-700
                     focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent"
        >
          <option value="">{t.allPeriods}</option>
          {periods.map(p => (
            <option key={p} value={p}>{formatPeriod(p + '-01', t.periodLang === 'en' ? 'en' : 'pt-BR')}</option>
          ))}
        </select>
      </div>

      {/* ── Indicadores da busca inteligente ────────────────────────────── */}
      {smartLoading && (
        <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {t.smartLoading}
        </div>
      )}
      {semanticMatches && !smartLoading && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold
                           bg-taime-50 text-taime-700 border border-taime-100">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2.39 7.36H22l-6.19 4.5L18.18 22 12 17.5 5.82 22l2.37-8.14L2 9.36h7.61z" />
            </svg>
            {t.smart}
          </span>
          <span className="text-xs text-zinc-500">{t.smartHint}</span>
          <button
            type="button"
            onClick={clearSmart}
            className="text-xs text-taime-600 hover:underline ml-1"
          >
            {t.smartClear}
          </button>
        </div>
      )}
      {smartError && (
        <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t.smartFailed}
        </div>
      )}

      {/* ── Chips de categoria ──────────────────────────────────────────── */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setCategory('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition
              ${category === ''
                ? 'bg-taime-600 text-white border-taime-600'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-taime-200'}`}
          >
            {t.allCategories}
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(category === c ? '' : c)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition
                ${category === c
                  ? 'bg-taime-600 text-white border-taime-600'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-taime-200'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* ── Contador ────────────────────────────────────────────────────── */}
      {(search || period || category) && (
        <p className="text-xs text-zinc-400 mb-4">
          {t.filterCount(filtered.length, reports.length)}
          {search && <> · {t.filterSearch(search)}</>}
          {period && <> · {t.filterPeriod(formatPeriod(period + '-01', t.periodLang === 'en' ? 'en' : 'pt-BR'))}</>}
          {category && <> · {t.filterCategory(category)}</>}
        </p>
      )}

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-16 text-center">
          <p className="text-zinc-400 mb-2">{t.empty}</p>
          <button
            onClick={() => { setSearch(''); setPeriod(''); setCategory(''); clearSmart() }}
            className="text-xs text-taime-600 hover:underline"
          >
            {t.clearFilter}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map(report => {
            const score   = report.report_trends ? avgScore(report.report_trends) : 0
            const nTrends = report.report_trends?.length ?? 0
            const title   = (locale === 'en' && report.title_en) ? report.title_en : report.title_pt_br

            return (
              <Link
                key={report.id}
                href={`/reports/${report.id}`}
                className="card group flex flex-col gap-4 hover:shadow-sm"
              >
                {/* Period + score */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-1">
                      {locale === 'en'
                        ? formatPeriodFull(report.period, 'en')
                        : (report.period_label || formatPeriodFull(report.period, 'pt-BR'))}
                    </p>
                    <h2 className="text-base font-semibold text-zinc-900 leading-snug
                                   group-hover:text-taime-600 transition-colors line-clamp-2">
                      {title}
                    </h2>
                  </div>
                  <div className={`shrink-0 w-14 h-14 rounded-xl ring-2 ${scoreRing(score)}
                                   flex flex-col items-center justify-center`}>
                    <span className={`text-xl font-bold tabular-nums ${scoreColor(score)}`}>
                      {score}
                    </span>
                    <span className="text-[9px] text-zinc-400 font-medium">score</span>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span>{t.trends(nTrends)}</span>
                  <span className="ml-auto badge bg-emerald-50 text-emerald-700">
                    {t.published}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
