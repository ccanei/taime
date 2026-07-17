'use client'

import { useState, useMemo } from 'react'

export interface FeedbackRecord {
  id:         string
  user_id:    string | null
  user_email: string | null
  type:       'suggestion' | 'problem' | 'praise' | 'advisor' | string
  message:    string
  locale:     string | null
  status:     'new' | 'reviewed' | string
  created_at: string
  // Campos do feedback do Advisor (NULL nas linhas antigas do dashboard).
  rating?:    'up' | 'down' | null
  question?:  string | null
  answer?:    string | null
  source?:    'dashboard' | 'advisor' | 'ask' | null
}

type Filter = 'all' | 'new' | 'reviewed'
type Origin = 'all' | 'dashboard' | 'advisor'

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  suggestion: { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Sugestão' },
  problem:    { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Problema' },
  praise:     { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Elogio'   },
  advisor:    { bg: 'bg-taime-50',   text: 'text-taime-700',   label: 'Advisor'  },
}

const SOURCE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  advisor:   'Advisor (logado)',
  ask:       'Advisor (/ask)',
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
  const [origin, setOrigin]   = useState<Origin>('all')
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map())

  // Origem: 'advisor' cobre o feedback in-chat (type='advisor', source advisor/ask);
  // 'dashboard' cobre o feedback antigo do dashboard (todo o resto).
  const isAdvisor = (r: FeedbackRecord) => r.type === 'advisor'

  const byOrigin = useMemo(() => {
    if (origin === 'advisor')   return records.filter(isAdvisor)
    if (origin === 'dashboard') return records.filter(r => !isAdvisor(r))
    return records
  }, [records, origin])

  const counts = useMemo(() => ({
    all:      byOrigin.length,
    new:      byOrigin.filter(r => r.status === 'new').length,
    reviewed: byOrigin.filter(r => r.status === 'reviewed').length,
  }), [byOrigin])

  const originCounts = useMemo(() => ({
    all:       records.length,
    advisor:   records.filter(isAdvisor).length,
    dashboard: records.filter(r => !isAdvisor(r)).length,
  }), [records])

  const filtered = useMemo(() => {
    if (filter === 'new')      return byOrigin.filter(r => r.status === 'new')
    if (filter === 'reviewed') return byOrigin.filter(r => r.status === 'reviewed')
    return byOrigin
  }, [byOrigin, filter])

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

  const ORIGIN_TABS: { key: Origin; label: string }[] = [
    { key: 'all',       label: `Todas as origens (${originCounts.all})` },
    { key: 'dashboard', label: `Dashboard (${originCounts.dashboard})`  },
    { key: 'advisor',   label: `Advisor (${originCounts.advisor})`      },
  ]

  return (
    <div>
      {/* Filtro por origem */}
      <div className="flex gap-1 mb-3 p-1 bg-zinc-100 rounded-xl w-fit">
        {ORIGIN_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setOrigin(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
              ${origin === key
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtro por status */}
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
                    {isAdvisor(record) && record.rating && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
                        ${record.rating === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {record.rating === 'up' ? '▲ Útil' : '▼ Não útil'}
                      </span>
                    )}
                    {isAdvisor(record) && record.source && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-50 text-zinc-500 border border-zinc-100">
                        {SOURCE_LABEL[record.source] ?? record.source}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {formatDate(record.created_at)}
                  </span>
                </header>

                {isAdvisor(record) ? (
                  <div className="space-y-2 mb-3">
                    {record.question && (
                      <div className="rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2">
                        <p className="text-[10px] font-bold tracking-widest text-zinc-400 mb-1">PERGUNTA</p>
                        <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{record.question}</p>
                      </div>
                    )}
                    {record.answer && (
                      <div className="rounded-lg bg-white border border-zinc-100 px-3 py-2">
                        <p className="text-[10px] font-bold tracking-widest text-zinc-400 mb-1">RESPOSTA AVALIADA</p>
                        <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap line-clamp-6">{record.answer}</p>
                      </div>
                    )}
                    {record.message?.trim() && (
                      <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                        <p className="text-[10px] font-bold tracking-widest text-amber-500 mb-1">COMENTÁRIO</p>
                        <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">{record.message}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap mb-3">
                    {record.message}
                  </p>
                )}

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
