'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

export interface ValidationFlag {
  id: string
  severity: 'blocking' | 'warning' | 'info'
  category: 'deterministic' | 'grounding' | 'temporal' | 'source'
  suggestion_pt?: string | null
  suggestion_en?: string | null
  suggestion_reason?: string | null
  trend_rank: number | null
  field: string
  claim: string
  detail: string
  lang: 'pt-BR' | 'en' | null
}

export interface ReportRecord {
  id: string
  period: string
  period_label: string | null
  report_number: number | null
  status: string
  title_pt_br: string | null
  validation_verdict: 'pass' | 'needs_review' | 'fail' | 'stale' | null
  validation_flags: ValidationFlag[] | null
  signal_count: number | null
  created_at: string
  published_at: string | null
}

type Filter = 'pending' | 'published' | 'rejected' | 'archived' | 'all'

function formatPeriod(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  generating:     { label: 'Gerando',    cls: 'bg-zinc-100 text-zinc-600' },
  pending_review: { label: 'Pendente',   cls: 'bg-amber-50 text-amber-700' },
  published:      { label: 'Publicado',  cls: 'bg-emerald-50 text-emerald-700' },
  rejected:       { label: 'Recusado',   cls: 'bg-red-50 text-red-700' },
  archived:       { label: 'Arquivado',  cls: 'bg-zinc-100 text-zinc-500' },
  draft:          { label: 'Rascunho',   cls: 'bg-zinc-100 text-zinc-600' },
}

const VERDICT_BADGE: Record<string, { label: string; cls: string }> = {
  pass:         { label: 'Validação OK',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  needs_review: { label: 'Revisar',       cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  fail:         { label: 'Bloqueante',    cls: 'bg-red-50 text-red-700 border-red-200' },
  stale:        { label: 'Editado',       cls: 'bg-sky-50 text-sky-700 border-sky-200' },
}

export default function ReportsAdmin({ initialRecords }: { initialRecords: ReportRecord[] }) {
  const [records] = useState<ReportRecord[]>(initialRecords)
  const [filter, setFilter] = useState<Filter>('pending')

  const counts = useMemo(() => ({
    pending:   records.filter(r => r.status === 'pending_review' || r.status === 'generating').length,
    published: records.filter(r => r.status === 'published').length,
    rejected:  records.filter(r => r.status === 'rejected').length,
    archived:  records.filter(r => r.status === 'archived').length,
    all:       records.length,
  }), [records])

  const filtered = useMemo(() => {
    if (filter === 'pending')   return records.filter(r => r.status === 'pending_review' || r.status === 'generating')
    if (filter === 'published') return records.filter(r => r.status === 'published')
    if (filter === 'rejected')  return records.filter(r => r.status === 'rejected')
    if (filter === 'archived')  return records.filter(r => r.status === 'archived')
    return records
  }, [records, filter])

  const TABS: { key: Filter; label: string }[] = [
    { key: 'pending',   label: `Pendentes (${counts.pending})` },
    { key: 'published', label: `Publicados (${counts.published})` },
    { key: 'rejected',  label: `Recusados (${counts.rejected})` },
    { key: 'archived',  label: `Arquivados (${counts.archived})` },
    { key: 'all',       label: `Todos (${counts.all})` },
  ]

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap gap-1 mb-6 p-1 bg-zinc-100 rounded-xl w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
              ${filter === key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center text-zinc-400">
          Nenhum relatório nesta categoria.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  {['Período', 'Título', 'Validação', 'Flags', 'Sinais', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-zinc-400 tracking-widest uppercase whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(r => {
                  const flags = r.validation_flags ?? []
                  const blocking = flags.filter(f => f.severity === 'blocking').length
                  const warning  = flags.filter(f => f.severity === 'warning').length
                  const verdict  = r.validation_verdict ? VERDICT_BADGE[r.validation_verdict] : null
                  const status   = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'bg-zinc-100 text-zinc-600' }
                  const isArchived = r.status === 'archived'

                  return (
                    <tr key={r.id} className={`bg-white hover:bg-zinc-50 transition-colors ${isArchived ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-zinc-700 whitespace-nowrap font-medium">
                        {formatPeriod(r.period)}
                        {r.report_number && r.report_number > 1 && (
                          <span className="ml-1 text-taime-600 text-xs">· Parte {r.report_number}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 max-w-[280px] truncate">
                        {r.title_pt_br ?? <span className="text-zinc-300 italic">sem título</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {verdict ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${verdict.cls}`}>
                            {verdict.label}
                          </span>
                        ) : (
                          <span className="text-zinc-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {blocking > 0 && <span className="text-red-600 font-semibold">{blocking} bloq.</span>}
                        {blocking > 0 && warning > 0 && <span className="text-zinc-300"> · </span>}
                        {warning > 0 && <span className="text-amber-600">{warning} aviso{warning > 1 ? 's' : ''}</span>}
                        {blocking === 0 && warning === 0 && <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap tabular-nums">
                        {r.signal_count ?? <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <Link
                          href={`/admin/reports/${r.id}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
                        >
                          Revisar →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-400">
        Dica: muitos avisos com poucos sinais costuma indicar coleta insuficiente do período (regenerar não resolve).
        Um aviso isolado num relatório com muitos sinais costuma ser ruído pontual da geração.
      </p>
    </div>
  )
}
