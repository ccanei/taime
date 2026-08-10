'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatPeriod, scoreColor, scoreRing } from '@/lib/types'
import type { EditionSummary, ReportLookupEntry } from '@/lib/dashboard'

type Locale = 'pt' | 'en'

export interface TrajectoryTheme {
  name:  string
  start: number
  index: number // aponta para EditionSummary.themeMatches
}

const UI = {
  pt: {
    trajLabel:   'Acompanhe a trajetória',
    trajSub:     'O mesmo tema, período após período. Clique para ver a análise através dos anos.',
    today:       'hoje',
    search:      'Buscar no arquivo... (Enter para busca inteligente)',
    allPeriods:  'Todos os períodos',
    filterByCat: 'Filtrar por categoria',
    archive:     'Arquivo por edição',
    editionsCount: (n: number) => `${n} ediç${n !== 1 ? 'ões' : 'ão'}`,
    reportsTrends: (r: number, t: number) => `${r} relatório${r !== 1 ? 's' : ''} · ${t} trend${t !== 1 ? 's' : ''}`,
    loadMore:    'Ver mais edições',
    empty:       'Nenhuma edição encontrada.',
    clear:       'Limpar filtros',
    results:     'Resultados',
    smart:       'Busca inteligente',
    smartHint:   'Ordenado por relevância semântica.',
    smartClear:  'Voltar ao arquivo',
    smartLoading:'Buscando...',
    smartFailed: 'Busca inteligente indisponível, usando filtro normal.',
    legend:      'TAIME Score: força estratégica da tendência, 0-100.',
    legendHigh:  '80+ alto',
    legendMid:   '60-79 relevante',
    legendLow:   '<60',
    novo:        'Novo',
    periodLang:  'pt-BR' as const,
    scoreAvg:    'média',
  },
  en: {
    trajLabel:   'Follow the trajectory',
    trajSub:     'The same theme, period after period. Click to read the analysis through the years.',
    today:       'today',
    search:      'Search the archive... (Enter for smart search)',
    allPeriods:  'All periods',
    filterByCat: 'Filter by category',
    archive:     'Archive by edition',
    editionsCount: (n: number) => `${n} edition${n !== 1 ? 's' : ''}`,
    reportsTrends: (r: number, t: number) => `${r} report${r !== 1 ? 's' : ''} · ${t} trend${t !== 1 ? 's' : ''}`,
    loadMore:    'See more editions',
    empty:       'No edition found.',
    clear:       'Clear filters',
    results:     'Results',
    smart:       'Smart search',
    smartHint:   'Ranked by semantic relevance.',
    smartClear:  'Back to archive',
    smartLoading:'Searching...',
    smartFailed: 'Smart search unavailable, using normal filter.',
    legend:      'TAIME Score: strategic force of the trend, 0-100.',
    legendHigh:  '80+ high',
    legendMid:   '60-79 relevant',
    legendLow:   '<60',
    novo:        'New',
    periodLang:  'en' as const,
    scoreAvg:    'avg',
  },
}

const PAGE_SIZE = 16

interface SemanticMatch { id: string; similarity: number }

function ScoreBadge({ score, size = 'md', label }: { score: number; size?: 'sm' | 'md'; label?: string }) {
  const box = size === 'sm' ? 'w-10 h-10' : 'w-14 h-14'
  const num = size === 'sm' ? 'text-sm' : 'text-xl'
  return (
    <div className={`shrink-0 ${box} rounded-xl ring-2 ${scoreRing(score)} flex flex-col items-center justify-center`}>
      <span className={`${num} font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
      {label && <span className="text-[8px] text-zinc-400 font-medium">{label}</span>}
    </div>
  )
}

export default function DashboardLibrary({
  editions,
  reportLookup,
  categories,
  themes,
  newSincePeriods,
  locale = 'pt',
}: {
  editions:        EditionSummary[]
  reportLookup:    Record<string, ReportLookupEntry>
  categories:      string[]
  themes:          TrajectoryTheme[]
  newSincePeriods: string[]   // periods considerados "novos desde a ultima visita"
  locale?:         Locale
}) {
  const t = UI[locale]
  const [search, setSearch]     = useState('')
  const [period, setPeriod]     = useState('')
  const [category, setCategory] = useState('')
  const [theme, setTheme]       = useState<number | null>(null)
  const [visible, setVisible]   = useState(PAGE_SIZE)
  const [semantic, setSemantic] = useState<SemanticMatch[] | null>(null)
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartError, setSmartError]     = useState(false)

  const newSet = useMemo(() => new Set(newSincePeriods), [newSincePeriods])

  // meses (ano-mes) para o filtro de periodo, dedup e desc.
  const periods = useMemo(
    () => [...new Set(editions.map(e => e.period.slice(0, 7)))].sort().reverse(),
    [editions],
  )

  function resetPage() { setVisible(PAGE_SIZE) }

  async function runSmart() {
    const q = search.trim()
    if (!q) { setSemantic(null); setSmartError(false); return }
    setSmartLoading(true); setSmartError(false)
    try {
      const res = await fetch('/api/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 25 }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json() as { results?: SemanticMatch[] }
      setSemantic(json.results ?? [])
    } catch {
      setSemantic(null); setSmartError(true)
    } finally {
      setSmartLoading(false)
    }
  }

  function clearSmart() { setSemantic(null); setSmartError(false) }
  function clearAll() { setSearch(''); setPeriod(''); setCategory(''); setTheme(null); clearSmart(); resetPage() }

  // Arquivo filtrado (modo browse: estruturais + palavra-chave).
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return editions.filter(e => {
      if (period && e.period.slice(0, 7) !== period) return false
      if (category && !e.categories.includes(category)) return false
      if (theme !== null && !e.themeMatches.includes(theme)) return false
      if (kw) {
        const hay = (e.periodLabel + ' ' + e.parts.map(p => p.title).join(' ')).toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [editions, period, category, theme, search])

  // Resultados flat da busca semantica (ranqueados pela API).
  const smartResults = useMemo(() => {
    if (!semantic) return []
    return semantic
      .map(m => { const r = reportLookup[m.id]; return r ? { id: m.id, ...r } : null })
      .filter((x): x is { id: string } & ReportLookupEntry => x !== null)
  }, [semantic, reportLookup])

  const anyFilter = !!(search || period || category || theme !== null)

  return (
    <div className="space-y-8">
      {/* ── Trajetórias de tema (rail do fosso) ─────────────────────── */}
      <section>
        <h2 className="text-lg font-bold text-zinc-900">{t.trajLabel}</h2>
        <p className="mt-0.5 mb-4 text-sm text-zinc-500 max-w-2xl">{t.trajSub}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {themes.map(th => {
            const active = theme === th.index
            return (
              <button
                key={th.index}
                onClick={() => { setTheme(active ? null : th.index); clearSmart(); resetPage() }}
                className={`text-left rounded-xl border px-3.5 py-3 transition-all
                  ${active
                    ? 'border-taime-600 bg-taime-50 ring-1 ring-taime-600'
                    : 'border-zinc-200 bg-white hover:border-taime-200 hover:shadow-sm'}`}
              >
                <span className={`block text-[13px] font-semibold leading-snug ${active ? 'text-taime-800' : 'text-zinc-800'}`}>
                  {th.name}
                </span>
                <span className="mt-1.5 flex items-center gap-1.5 text-[11px] tabular-nums text-zinc-400">
                  <span>{th.start}</span>
                  <span className="flex-1 h-px bg-gradient-to-r from-taime-300 to-taime-500" />
                  <span className="font-semibold text-taime-600 uppercase tracking-wide">{t.today}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Filtros e busca ─────────────────────────────────────────── */}
      <section>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder={t.search}
            value={search}
            onChange={e => { setSearch(e.target.value); if (semantic) clearSmart(); resetPage() }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void runSmart() } }}
            disabled={smartLoading}
            className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-zinc-200 bg-white
                       text-zinc-900 placeholder:text-zinc-400
                       focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent
                       disabled:opacity-60"
          />
          <select
            value={period}
            onChange={e => { setPeriod(e.target.value); resetPage() }}
            className="px-4 py-2.5 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-700
                       focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent"
          >
            <option value="">{t.allPeriods}</option>
            {periods.map(p => (
              <option key={p} value={p}>{formatPeriod(p + '-01', t.periodLang === 'en' ? 'en' : 'pt-BR')}</option>
            ))}
          </select>
        </div>

        {/* Chips de categoria: compactos. Rolagem horizontal no mobile, quebra no desktop. */}
        {categories.length > 0 && (
          <div className="mt-3">
            <span className="sm:hidden block text-[11px] font-medium text-zinc-400 mb-1.5">{t.filterByCat}</span>
            <div className="flex gap-1.5 overflow-x-auto sm:flex-wrap pb-1 -mx-1 px-1">
              <button
                onClick={() => { setCategory(''); resetPage() }}
                className={`shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-full border transition whitespace-nowrap
                  ${category === '' ? 'bg-taime-600 text-white border-taime-600' : 'bg-white text-zinc-600 border-zinc-200 hover:border-taime-200'}`}
              >
                {locale === 'en' ? 'All' : 'Todas'}
              </button>
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => { setCategory(category === c ? '' : c); resetPage() }}
                  className={`shrink-0 px-2.5 py-1 text-[11px] font-medium rounded-full border transition whitespace-nowrap
                    ${category === c ? 'bg-taime-600 text-white border-taime-600' : 'bg-white text-zinc-600 border-zinc-200 hover:border-taime-200'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Estado da busca inteligente */}
        {smartLoading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            {t.smartLoading}
          </div>
        )}
        {semantic && !smartLoading && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold
                             bg-taime-50 text-taime-700 border border-taime-100">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l2.39 7.36H22l-6.19 4.5L18.18 22 12 17.5 5.82 22l2.37-8.14L2 9.36h7.61z" />
              </svg>
              {t.smart}
            </span>
            <span className="text-xs text-zinc-500">{t.smartHint}</span>
            <button type="button" onClick={clearSmart} className="text-xs text-taime-600 hover:underline ml-1">
              {t.smartClear}
            </button>
          </div>
        )}
        {smartError && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t.smartFailed}
          </div>
        )}

        {/* Microlegenda do score (ponto unico) */}
        <div className="mt-3 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
          <span>{t.legend}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{t.legendHigh}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-taime-500" />{t.legendMid}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-300" />{t.legendLow}</span>
        </div>
      </section>

      {/* ── Conteúdo: resultados de busca OU arquivo por edição ─────── */}
      {semantic ? (
        <section>
          <h2 className="text-lg font-bold text-zinc-900 mb-4">{t.results}</h2>
          {smartResults.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center text-sm text-zinc-400">
              {t.empty}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {smartResults.map(r => (
                <Link key={r.id} href={`/reports/${r.id}`}
                  className="group flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 hover:border-taime-200 hover:shadow-sm transition-all">
                  <div className="min-w-0">
                    <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wide mb-1">{r.periodLabel}</p>
                    <h3 className="text-sm font-semibold text-zinc-900 leading-snug group-hover:text-taime-600 transition-colors line-clamp-2">{r.title}</h3>
                  </div>
                  <ScoreBadge score={r.score} size="sm" />
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-bold text-zinc-900">{t.archive}</h2>
            <span className="text-xs text-zinc-400">{t.editionsCount(filtered.length)}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center">
              <p className="text-sm text-zinc-400 mb-2">{t.empty}</p>
              {anyFilter && <button onClick={clearAll} className="text-xs text-taime-600 hover:underline">{t.clear}</button>}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {filtered.slice(0, visible).map(e => {
                  const isNew = newSet.has(e.period)
                  return (
                    <div key={e.period}
                      className="rounded-2xl border border-zinc-200 bg-white p-5 hover:border-taime-200 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-zinc-900">{e.periodLabel}</h3>
                            {isNew && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-taime-600 text-white tracking-wide">
                                {t.novo}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-400">{t.reportsTrends(e.parts.length, e.totalTrends)}</p>
                        </div>
                        <ScoreBadge score={e.avgScore} size="sm" label={t.scoreAvg} />
                      </div>
                      <div className="divide-y divide-zinc-100 border-t border-zinc-100">
                        {e.parts.map(p => (
                          <Link key={p.id} href={`/reports/${p.id}`}
                            className="group flex items-center justify-between gap-3 py-2.5 hover:bg-zinc-50 -mx-2 px-2 rounded-lg transition-colors">
                            <span className="text-sm text-zinc-700 group-hover:text-taime-600 transition-colors line-clamp-1">{p.title}</span>
                            <span className={`shrink-0 text-xs font-bold tabular-nums ${scoreColor(p.score)}`}>{p.score}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {visible < filtered.length && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setVisible(v => v + PAGE_SIZE)}
                    className="text-sm font-medium text-taime-600 hover:text-taime-800 border border-zinc-200 hover:border-taime-200 rounded-lg px-5 py-2.5 transition-colors">
                    {t.loadMore}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
