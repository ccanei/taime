'use client'

import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { formatPeriod, scoreColor, scoreRing } from '@/lib/types'
import type { EditionSummary, ReportLookupEntry, ArchiveStats } from '@/lib/dashboard'

type Locale = 'pt' | 'en'

export interface TrajectoryTheme {
  name:  string
  start: number
  index: number // indice em CURATED_THEME_SLUGS (usado pelo endpoint /api/trajectory)
}

interface TrajItem { reportId: string; rank: number; period: string; title: string; score: number }

const MONTHS_SHORT = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

// "jul 2026" / "Jul 2026" a partir de um period 'YYYY-MM-DD'.
function shortPeriod(period: string, locale: Locale): string {
  const m = Number.parseInt(period.slice(5, 7), 10) - 1
  const y = period.slice(0, 4)
  return `${MONTHS_SHORT[locale][m] ?? ''} ${y}`.trim()
}

const UI = {
  pt: {
    trajLabel:   'Acompanhe a trajetória',
    trajSub:     'O mesmo tema, ano após ano.',
    today:       'hoje',
    trajTitle:   'Trajetória',
    trajCount:   (n: number, y: string) => `${n} análise${n !== 1 ? 's' : ''} desde ${y}`,
    trajBack:    'Voltar ao arquivo',
    trajLoading: 'Montando a trajetória...',
    trajError:   'Não foi possível carregar a trajetória.',
    trajRetry:   'Tentar de novo',
    trajEmpty:   'Nenhuma análise deste tema encontrada.',
    search:      'Buscar no arquivo... (Enter para busca inteligente)',
    allPeriods:  'Todos os períodos',
    filterByCat: 'Filtrar por categoria',
    archive:     'Arquivo por edição',
    editionsCount: (n: number) => `${n} ediç${n !== 1 ? 'ões' : 'ão'}`,
    reportsTrends: (r: number, t: number) => `${r} análise${r !== 1 ? 's' : ''} · ${t} tendência${t !== 1 ? 's' : ''}`,
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
    statsTitle:  'O arquivo em números',
    edLabel:     'edições',
    trLabel:     'tendências',
    spanLabel:   'cobertura',
    sparkCaption:'Score médio por período (últimos 24)',
  },
  en: {
    trajLabel:   'Follow the trajectory',
    trajSub:     'The same theme, year after year.',
    today:       'today',
    trajTitle:   'Trajectory',
    trajCount:   (n: number, y: string) => `${n} analys${n !== 1 ? 'es' : 'is'} since ${y}`,
    trajBack:    'Back to archive',
    trajLoading: 'Building the trajectory...',
    trajError:   'Could not load the trajectory.',
    trajRetry:   'Try again',
    trajEmpty:   'No analysis found for this theme.',
    search:      'Search the archive... (Enter for smart search)',
    allPeriods:  'All periods',
    filterByCat: 'Filter by category',
    archive:     'Archive by edition',
    editionsCount: (n: number) => `${n} edition${n !== 1 ? 's' : ''}`,
    reportsTrends: (r: number, t: number) => `${r} analys${r !== 1 ? 'es' : 'is'} · ${t} trend${t !== 1 ? 's' : ''}`,
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
    statsTitle:  'The archive in numbers',
    edLabel:     'editions',
    trLabel:     'trends',
    spanLabel:   'coverage',
    sparkCaption:'Avg score per period (last 24)',
  },
}

const PAGE_SIZE = 16
const EXPANDED_ROWS = 3 // edicoes recentes mostradas expandidas; as demais em linha compacta

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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

// Sparkline SVG do score medio por periodo. Endpoint enfatizado, sem grid pesado.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 240, h = 44, pad = 4
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad)
  const y = (v: number) => pad + (1 - (v - min) / range) * (h - 2 * pad)
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${x(0).toFixed(1)},${(h - pad).toFixed(1)} ${pts} ${x(values.length - 1).toFixed(1)},${(h - pad).toFixed(1)}`
  const lastI = values.length - 1
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11" aria-hidden>
      <polygon points={area} className="fill-taime-50" />
      <polyline points={pts} fill="none" className="stroke-taime-500" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastI)} cy={y(values[lastI])} r="2.5" className="fill-taime-600" />
    </svg>
  )
}

// Parte de uma edicao (linha clicavel para o report).
function EditionParts({ parts }: { parts: EditionSummary['parts'] }) {
  return (
    <div className="divide-y divide-zinc-100 border-t border-zinc-100">
      {parts.map(p => (
        <Link key={p.id} href={`/reports/${p.id}`}
          className="group flex items-center justify-between gap-3 py-2.5 hover:bg-zinc-50 -mx-2 px-2 rounded-lg transition-colors">
          <span className="text-sm text-zinc-700 group-hover:text-taime-600 transition-colors line-clamp-1">{p.title}</span>
          <span className={`shrink-0 text-xs font-bold tabular-nums ${scoreColor(p.score)}`}>{p.score}</span>
        </Link>
      ))}
    </div>
  )
}

export default function DashboardLibrary({
  editions,
  reportLookup,
  categories,
  themes,
  newSincePeriods,
  stats,
  heroNode,
  advisorNode,
  continueNode,
  locale = 'pt',
}: {
  editions:        EditionSummary[]
  reportLookup:    Record<string, ReportLookupEntry>
  categories:      string[]
  themes:          TrajectoryTheme[]
  newSincePeriods: string[]   // periods considerados "novos desde a ultima visita"
  stats:           ArchiveStats
  heroNode?:       ReactNode
  advisorNode?:    ReactNode
  continueNode?:   ReactNode
  locale?:         Locale
}) {
  const t = UI[locale]
  const [search, setSearch]     = useState('')
  const [period, setPeriod]     = useState('')
  const [category, setCategory] = useState('')
  const [visible, setVisible]   = useState(PAGE_SIZE)
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const [semantic, setSemantic] = useState<SemanticMatch[] | null>(null)
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartError, setSmartError]     = useState(false)

  // Trajetoria (nivel trend, sob demanda): tema aberto + itens carregados.
  const [trajTheme, setTrajTheme]     = useState<number | null>(null)
  const [trajItems, setTrajItems]     = useState<TrajItem[] | null>(null)
  const [trajLoading, setTrajLoading] = useState(false)
  const [trajError, setTrajError]     = useState(false)
  const trajRef = useRef<HTMLDivElement>(null)

  const newSet = useMemo(() => new Set(newSincePeriods), [newSincePeriods])

  // meses (ano-mes) para o filtro de periodo, dedup e desc.
  const periods = useMemo(
    () => [...new Set(editions.map(e => e.period.slice(0, 7)))].sort().reverse(),
    [editions],
  )

  function resetPage() { setVisible(PAGE_SIZE) }
  function toggleRow(p: string) {
    setOpenRows(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })
  }

  async function runSmart() {
    const q = search.trim()
    if (!q) { setSemantic(null); setSmartError(false); return }
    closeTrajectory()
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
  function closeTrajectory() { setTrajTheme(null); setTrajItems(null); setTrajError(false); setTrajLoading(false) }
  function clearAll() { setSearch(''); setPeriod(''); setCategory(''); closeTrajectory(); clearSmart(); resetPage() }

  // Busca so as trends do tema clicado (payload sob demanda, um tema por vez).
  async function fetchTrajectory(index: number) {
    setTrajItems(null); setTrajError(false); setTrajLoading(true)
    try {
      const res = await fetch(`/api/trajectory?theme=${index}`)
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json() as { items?: TrajItem[] }
      setTrajItems(json.items ?? [])
    } catch {
      setTrajItems(null); setTrajError(true)
    } finally {
      setTrajLoading(false)
    }
  }

  // Abre a VISAO DE TRAJETORIA (nivel trend) na coluna principal. Toggle no mesmo
  // tema fecha; clicar outro troca. Scroll suave ao painel no useEffect abaixo.
  function openTrajectory(index: number) {
    if (trajTheme === index) { closeTrajectory(); return }
    clearSmart()
    setTrajTheme(index)
    void fetchTrajectory(index)
  }

  useEffect(() => {
    if (trajTheme !== null && trajRef.current) {
      trajRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [trajTheme])

  // Arquivo filtrado (modo browse: estruturais + palavra-chave).
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return editions.filter(e => {
      if (period && e.period.slice(0, 7) !== period) return false
      if (category && !e.categories.includes(category)) return false
      if (kw) {
        const hay = (e.periodLabel + ' ' + e.parts.map(p => p.title).join(' ')).toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [editions, period, category, search])

  const smartResults = useMemo(() => {
    if (!semantic) return []
    return semantic
      .map(m => { const r = reportLookup[m.id]; return r ? { id: m.id, ...r } : null })
      .filter((x): x is { id: string } & ReportLookupEntry => x !== null)
  }, [semantic, reportLookup])

  // Itens da trajetoria agrupados por ANO (cronologico asc), para ler como timeline.
  const trajGroups = useMemo(() => {
    if (!trajItems) return [] as [string, TrajItem[]][]
    const map = new Map<string, TrajItem[]>()
    for (const it of trajItems) {
      const y = it.period.slice(0, 4)
      const arr = map.get(y)
      if (arr) arr.push(it); else map.set(y, [it])
    }
    return [...map.entries()]
  }, [trajItems])

  const trajMeta = trajTheme !== null ? themes.find(th => th.index === trajTheme) ?? null : null
  const anyFilter = !!(search || period || category)

  // ── Seletor de trajetoria: lista vertical (rail) e chips horizontais (mobile) ──
  const trajRail = (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-bold text-zinc-900">{t.trajLabel}</h2>
      <p className="mt-0.5 mb-3 text-[11px] text-zinc-400">{t.trajSub}</p>
      <div className="flex flex-col gap-0.5">
        {themes.map(th => {
          const active = trajTheme === th.index
          return (
            <button
              key={th.index}
              onClick={() => openTrajectory(th.index)}
              aria-pressed={active}
              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors
                ${active ? 'bg-taime-50 ring-1 ring-taime-200' : 'hover:bg-zinc-50'}`}
            >
              <span className={`text-[13px] font-medium leading-snug line-clamp-1 ${active ? 'text-taime-800' : 'text-zinc-700'}`}>
                {th.name}
              </span>
              <span className="shrink-0 flex items-center gap-1 text-[10px] tabular-nums text-zinc-400">
                <span>{th.start}</span>
                <span className="w-3 h-px bg-gradient-to-r from-taime-300 to-taime-500" />
                <span className="font-semibold text-taime-600 uppercase">{t.today}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const trajChips = (
    <section>
      <h2 className="text-sm font-bold text-zinc-900 mb-2">{t.trajLabel}</h2>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {themes.map(th => {
          const active = trajTheme === th.index
          return (
            <button
              key={th.index}
              onClick={() => openTrajectory(th.index)}
              aria-pressed={active}
              className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors
                ${active ? 'border-taime-600 bg-taime-50 ring-1 ring-taime-600' : 'border-zinc-200 bg-white'}`}
            >
              <span className="block text-[12px] font-semibold text-zinc-800 whitespace-nowrap">{th.name}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[10px] tabular-nums text-zinc-400">
                <span>{th.start}</span>
                <span className="w-3 h-px bg-gradient-to-r from-taime-300 to-taime-500" />
                <span className="font-semibold text-taime-600 uppercase">{t.today}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )

  const statsBlock = (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-bold text-zinc-900 mb-3">{t.statsTitle}</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-2xl font-bold tabular-nums text-zinc-900 leading-none">{stats.totalEditions}</div>
          <div className="mt-1 text-[11px] text-zinc-400">{t.edLabel}</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums text-zinc-900 leading-none">{stats.totalTrends}</div>
          <div className="mt-1 text-[11px] text-zinc-400">{t.trLabel}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="text-sm font-semibold text-zinc-700 tabular-nums">
          {stats.spanStartYear} <span className="text-zinc-300">→</span> {t.today}
        </div>
        <div className="text-[11px] text-zinc-400">{t.spanLabel}</div>
      </div>
      {stats.spark.length >= 2 && (
        <div className="mt-4 text-taime-500">
          <Sparkline values={stats.spark} />
          <div className="mt-1 text-[11px] text-zinc-400">{t.sparkCaption}</div>
        </div>
      )}
    </div>
  )

  // ── Conteudo dinamico da coluna principal: trajetoria | busca | arquivo ──
  const mainContent = trajTheme !== null ? (
    <section ref={trajRef} className="scroll-mt-24">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.15em] text-taime-700 uppercase">{t.trajTitle}</p>
          <h2 className="mt-0.5 text-xl font-bold text-zinc-900 leading-snug">{trajMeta?.name}</h2>
          <p className="mt-1 flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span>{trajMeta?.start}</span>
              <span className="w-6 h-px bg-gradient-to-r from-taime-300 to-taime-500" />
              <span className="font-semibold text-taime-600 uppercase tracking-wide">{t.today}</span>
            </span>
            {trajItems && trajItems.length > 0 && <span className="text-zinc-300">·</span>}
            {trajItems && trajItems.length > 0 && (
              <span className="font-medium text-zinc-500 tabular-nums">
                {t.trajCount(trajItems.length, trajItems[0].period.slice(0, 4))}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={closeTrajectory}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-taime-700
                     border border-zinc-200 hover:border-taime-200 rounded-lg px-3 py-2 transition-colors">
          <span aria-hidden>←</span> {t.trajBack}
        </button>
      </div>

      {trajLoading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500 py-10 justify-center">
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {t.trajLoading}
        </div>
      ) : trajError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-800 mb-3">{t.trajError}</p>
          <button
            onClick={() => { if (trajTheme !== null) void fetchTrajectory(trajTheme) }}
            className="text-xs font-medium text-taime-600 hover:underline">
            {t.trajRetry}
          </button>
        </div>
      ) : !trajItems || trajItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center text-sm text-zinc-400">
          {t.trajEmpty}
        </div>
      ) : (
        <div className="space-y-6">
          {trajGroups.map(([year, items]) => (
            <div key={year} className="relative">
              <div className="flex items-center gap-3 mb-2.5">
                <span className="text-sm font-bold text-zinc-900 tabular-nums">{year}</span>
                <span className="flex-1 h-px bg-zinc-100" />
                <span className="text-[11px] text-zinc-400 tabular-nums">{items.length}</span>
              </div>
              <div className="space-y-2 sm:pl-4 sm:border-l-2 sm:border-taime-100">
                {items.map(it => (
                  <Link
                    key={`${it.reportId}-${it.rank}`}
                    href={`/reports/${it.reportId}#trend-${it.rank}`}
                    className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3
                               hover:border-taime-200 hover:shadow-sm transition-all">
                    <span className="shrink-0 w-16 text-[11px] font-medium text-zinc-400 tabular-nums uppercase tracking-wide">
                      {shortPeriod(it.period, locale)}
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-zinc-800 group-hover:text-taime-600 transition-colors line-clamp-2">
                      {it.title}
                    </span>
                    <span className={`shrink-0 text-sm font-bold tabular-nums ${scoreColor(it.score)}`}>{it.score}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  ) : semantic ? (
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
            {filtered.slice(0, visible).map((e, i) => {
              const isNew = newSet.has(e.period)
              // As EXPANDED_ROWS mais recentes: card expandido. As demais: linha compacta expansivel.
              if (i < EXPANDED_ROWS) {
                return (
                  <div key={e.period} className="rounded-2xl border border-zinc-200 bg-white p-5 hover:border-taime-200 transition-colors">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-zinc-900">{e.periodLabel}</h3>
                          {isNew && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-taime-600 text-white tracking-wide">{t.novo}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-400">{t.reportsTrends(e.parts.length, e.totalTrends)}</p>
                      </div>
                      <ScoreBadge score={e.avgScore} size="sm" label={t.scoreAvg} />
                    </div>
                    <EditionParts parts={e.parts} />
                  </div>
                )
              }
              const open = openRows.has(e.period)
              return (
                <div key={e.period} className="rounded-xl border border-zinc-200 bg-white hover:border-taime-200 transition-colors">
                  <button onClick={() => toggleRow(e.period)} aria-expanded={open}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      <Chevron open={open} />
                      <span className="text-sm font-semibold text-zinc-800 truncate">{e.periodLabel}</span>
                      {isNew && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-taime-600 text-white tracking-wide shrink-0">{t.novo}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-zinc-400 hidden sm:block">{t.reportsTrends(e.parts.length, e.totalTrends)}</span>
                      <span className={`text-xs font-bold tabular-nums ${scoreColor(e.avgScore)}`}>{e.avgScore}</span>
                    </div>
                  </button>
                  {open && <div className="px-4 pb-3">{<EditionParts parts={e.parts} />}</div>}
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
  )

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-8 lg:items-start">

      {/* ── COLUNA PRINCIPAL ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-8 min-w-0">
        {/* Advisor: no topo apenas no mobile (no desktop vive no rail). */}
        {advisorNode && <div className="lg:hidden">{advisorNode}</div>}

        {heroNode}
        {continueNode}

        {/* Trajetorias: chips horizontais apenas no mobile. */}
        <div className="lg:hidden">{trajChips}</div>

        {/* Busca e filtros (compactado). */}
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

          <div className="mt-3 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
            <span>{t.legend}</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{t.legendHigh}</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-taime-500" />{t.legendMid}</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-300" />{t.legendLow}</span>
          </div>
        </section>

        {mainContent}
      </div>

      {/* ── RAIL DIREITO (desktop, sticky) ───────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col gap-5 lg:sticky lg:top-24 lg:border-l lg:border-zinc-200 lg:pl-8">
        {advisorNode}
        {trajRail}
        {statsBlock}
      </aside>

    </div>
  )
}
