'use client'

import { useState, useMemo } from 'react'

export interface FeedbackRecord {
  id:         string
  user_id:    string | null
  user_email: string | null
  type:       'suggestion' | 'problem' | 'praise' | string
  message:    string
  locale:     string | null
  status:     'new' | 'reviewed' | string
  created_at: string
}

type Filter = 'all' | 'new' | 'reviewed'

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  suggestion: { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Sugestão' },
  problem:    { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Problema' },
  praise:     { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Elogio'   },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function FeedbackAdmin({
  initialRecords,
}: {
  initialRecords: FeedbackRecord[]
}) {
  const [records, setRecords] = useState<FeedbackRecord[]>(initialRecords)
  const [filter, setFilter]   = useState<Filter>('all')
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map())

  const counts = useMemo(() => ({
    all:      records.length,
    new:      records.filter(r => r.status === 'new').length,
    reviewed: records.filter(r => r.status === 'reviewed').length,
  }), [records])

  const filtered = useMemo(() => {
    if (filter === 'new')      return records.filter(r => r.status === 'new')
    if (filter === 'reviewed') return records.filter(r => r.status === 'reviewed')
    return records
  }, [records, filter])

  async function markReviewed(record: FeedbackRecord) {
    setReviewing(record.id)
    setRowErrors(prev => { const m = new Map(prev); m.delete(record.id); return m })

    try {
      const res = await fetch('/api/admin/feedback-review', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: record.id }),
      })
      const json = await res.json() as { success?: boolean; error?: string }

      if (!res.ok || !json.success) {
        setRowErrors(prev => new Map(prev).set(record.id, json.error ?? 'Erro desconhecido'))
        return
      }

      setRecords(prev => prev.map(r =>
        r.id === record.id ? { ...r, status: 'reviewed' } : r,
      ))
    } catch (err) {
      setRowErrors(prev => new Map(prev).set(record.id, String(err)))
    } finally {
      setReviewing(null)
    }
  }

  const TABS: { key: Filter; label: string }[] = [
    { key: 'all',      label: `Todos (${counts.all})`        },
    { key: 'new',      label: `Novos (${counts.new})`        },
    { key: 'reviewed', label: `Revisados (${counts.reviewed})` },
  ]

  return (
    <div>
      {/* Filtros */}
      <div className="flex gap-1 mb-6 p-1 bg-zinc-100 rounded-xl w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
              ${filter === key
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center text-zinc-400">
          Nenhum feedback encontrado.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(record => {
            const typeStyle = TYPE_STYLES[record.type] ?? {
              bg: 'bg-zinc-50', text: 'text-zinc-700', label: record.type,
            }
            const rowErr = rowErrors.get(record.id)
            const isReviewing = reviewing === record.id

            return (
              <article
                key={record.id}
                className={`rounded-xl border border-zinc-200 bg-white p-5
                            ${record.status === 'reviewed' ? 'opacity-70' : ''}`}
              >
                <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${typeStyle.bg} ${typeStyle.text}`}>
                      {typeStyle.label}
                    </span>
                    {record.status === 'reviewed' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600">
                        ✓ Revisado
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
                        Novo
                      </span>
                    )}
                    {record.locale && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-50 text-zinc-500 border border-zinc-100">
                        {record.locale}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {formatDate(record.created_at)}
                  </span>
                </header>

                <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap mb-3">
                  {record.message}
                </p>

                <footer className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-zinc-100">
                  <span className="text-xs text-zinc-500">
                    {record.user_email ?? <span className="italic text-zinc-400">anônimo</span>}
                  </span>

                  {record.status === 'new' && (
                    <button
                      onClick={() => markReviewed(record)}
                      disabled={isReviewing}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold
                                 bg-taime-600 text-white hover:bg-taime-700
                                 disabled:opacity-50 disabled:cursor-not-allowed
                                 transition-colors"
                    >
                      {isReviewing ? 'Marcando...' : 'Marcar como revisado'}
                    </button>
                  )}
                </footer>

                {rowErr && (
                  <p className="mt-2 text-xs text-red-600">{rowErr}</p>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
