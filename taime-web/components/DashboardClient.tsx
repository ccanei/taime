'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatPeriod, formatPeriodFull, avgScore, scoreColor, scoreRing } from '@/lib/types'
import type { Report } from '@/lib/types'

type Locale = 'pt' | 'en'

// ─── Search helpers ───────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SYNONYMS: Record<string, string[]> = {
  'ia':        ['inteligencia artificial', 'artificial intelligence', 'agentic', 'agentica', 'agente', 'agentes', 'machine learning', 'ml', 'llm'],
  'agente':    ['agentic', 'agentica', 'ia', 'ai'],
  'agentes':   ['agentic', 'agentica', 'agents', 'ia agentica'],
  'nuvem':     ['cloud', 'hibrida', 'hybrid'],
  'cloud':     ['nuvem', 'infraestrutura', 'infrastructure'],
  'seguranca': ['cybersecurity', 'ciberseguranca', 'security', 'ameaca', 'threat'],
  'dados':     ['data', 'soberania', 'sovereignty', 'semanticos'],
  'fintech':   ['financeiro', 'finance', 'stablecoin', 'capital'],
  'automacao': ['automation', 'agentes', 'workflows'],
}

function expandQuery(query: string): string[] {
  const norm = normalize(query)
  const terms = [norm]
  for (const [key, synonyms] of Object.entries(SYNONYMS)) {
    if (norm.includes(key)) terms.push(...synonyms)
    if (synonyms.some(s => norm.includes(s))) terms.push(key, ...synonyms)
  }
  return [...new Set(terms)]
}

const STOPWORDS = new Set([
  'de','do','da','dos','das','em','no','na','nos','nas',
  'e','o','a','os','as','um','uma','que','para','com','se',
  'the','of','in','and','to','an','for','with','is','are',
])

function scoreMatch(report: Report, query: string): number {
  if (!query.trim()) return 1
  const raw   = expandQuery(query)
  const terms = raw.filter(t => t.length > 2 && !STOPWORDS.has(t))
  if (terms.length === 0) return 1
  const fields = [
    { text: normalize((report.title_pt_br ?? '') + ' ' + (report.title_en ?? '')), weight: 3 },
    {
      text: normalize(
        ((report as unknown as { executive_summary_pt_br?: string }).executive_summary_pt_br ?? '') +
        ' ' +
        ((report as unknown as { executive_summary_en?: string }).executive_summary_en ?? '')
      ),
      weight: 2,
    },
  ]
  let score = 0
  for (const term of terms) {
    for (const field of fields) {
      if (field.text.includes(term)) score += field.weight
    }
  }
  const minScore = Math.max(1, Math.floor(terms.length * 0.4)) * 3
  return score >= minScore ? score : 0
}

const UI = {
  pt: {
    search:      'Buscar por título...',
    allPeriods:  'Todos os períodos',
    filterCount: (n: number, total: number) => `${n} de ${total} relatório${total !== 1 ? 's' : ''}`,
    filterSearch: (q: string) => `busca: "${q}"`,
    filterPeriod: (p: string) => `período: ${p}`,
    empty:       'Nenhum relatório encontrado.',
    clearFilter: 'Limpar filtros',
    trends:      (n: number) => `${n} trend${n !== 1 ? 's' : ''}`,
    published:   'Publicado',
    dateLang:    'pt-BR' as const,
    periodLang:  'pt-BR' as const,
  },
  en: {
    search:      'Search by title...',
    allPeriods:  'All periods',
    filterCount: (n: number, total: number) => `${n} of ${total} report${total !== 1 ? 's' : ''}`,
    filterSearch: (q: string) => `search: "${q}"`,
    filterPeriod: (p: string) => `period: ${p}`,
    empty:       'No reports found.',
    clearFilter: 'Clear filters',
    trends:      (n: number) => `${n} trend${n !== 1 ? 's' : ''}`,
    published:   'Published',
    dateLang:    'en-US' as const,
    periodLang:  'en' as const,
  },
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
  const t = UI[locale]

  const periods = useMemo(
    () => [...new Set(reports.map(r => r.period))].sort().reverse(),
    [reports],
  )

  const filtered = useMemo(() => {
    return reports
      .map(r => ({ report: r, score: scoreMatch(r, search) }))
      .filter(({ report: r, score }) => score > 0 && (!period || r.period === period))
      .sort((a, b) => b.score - a.score)
      .map(({ report: r }) => r)
  }, [reports, search, period])

  return (
    <>
      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder={t.search}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-zinc-200 bg-white
                     text-zinc-900 placeholder:text-zinc-400
                     focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent"
        />
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="px-4 py-2.5 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-700
                     focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent"
        >
          <option value="">{t.allPeriods}</option>
          {periods.map(p => (
            <option key={p} value={p}>{formatPeriod(p, t.periodLang === 'en' ? 'en' : 'pt-BR')}</option>
          ))}
        </select>
      </div>

      {/* ── Contador ────────────────────────────────────────────────────── */}
      {(search || period) && (
        <p className="text-xs text-zinc-400 mb-4">
          {t.filterCount(filtered.length, reports.length)}
          {search && <> · {t.filterSearch(search)}</>}
          {period && <> · {t.filterPeriod(formatPeriod(period, t.periodLang === 'en' ? 'en' : 'pt-BR'))}</>}
        </p>
      )}

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-16 text-center">
          <p className="text-zinc-400 mb-2">{t.empty}</p>
          <button
            onClick={() => { setSearch(''); setPeriod('') }}
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
                      {report.report_number && report.report_number > 1 && (
                        <span className="ml-2 text-taime-600">
                          {locale === 'en' ? `· Part ${report.report_number}` : `· Parte ${report.report_number}`}
                        </span>
                      )}
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
