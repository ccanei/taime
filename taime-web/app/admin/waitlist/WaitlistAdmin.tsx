'use client'

import { useState, useMemo } from 'react'

export interface WaitlistRecord {
  id: string
  email: string
  name: string | null
  company: string | null
  role: string | null
  interest: string | null
  created_at: string
  contacted: boolean
}

type Filter = 'all' | 'pending' | 'approved'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function WaitlistAdmin({ initialRecords }: { initialRecords: WaitlistRecord[] }) {
  const [records, setRecords]     = useState<WaitlistRecord[]>(initialRecords)
  const [filter, setFilter]       = useState<Filter>('all')
  const [approving, setApproving] = useState<string | null>(null)
  const [flash, setFlash]         = useState<{ id: string; name: string } | null>(null)
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map())

  const counts = useMemo(() => ({
    all:      records.length,
    pending:  records.filter(r => !r.contacted).length,
    approved: records.filter(r =>  r.contacted).length,
  }), [records])

  const filtered = useMemo(() => {
    if (filter === 'pending')  return records.filter(r => !r.contacted)
    if (filter === 'approved') return records.filter(r =>  r.contacted)
    return records
  }, [records, filter])

  async function approve(record: WaitlistRecord) {
    setApproving(record.id)
    setRowErrors(prev => { const m = new Map(prev); m.delete(record.id); return m })

    try {
      const res = await fetch('/api/admin/approve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: record.id, email: record.email, name: record.name ?? '' }),
      })

      const json = await res.json() as { success?: boolean; ok?: boolean; error?: string; message?: string }

      if (!res.ok || (!json.success && !json.ok)) {
        setRowErrors(prev => new Map(prev).set(record.id, json.error ?? 'Erro desconhecido'))
        return
      }

      // Atualiza registro localmente
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, contacted: true } : r))

      // Flash de confirmação
      setFlash({ id: record.id, name: record.name ?? record.email })
      setTimeout(() => setFlash(null), 4000)
    } catch (err) {
      setRowErrors(prev => new Map(prev).set(record.id, String(err)))
    } finally {
      setApproving(null)
    }
  }

  const TABS: { key: Filter; label: string }[] = [
    { key: 'all',      label: `Todos (${counts.all})`          },
    { key: 'pending',  label: `Pendentes (${counts.pending})`  },
    { key: 'approved', label: `Aprovados (${counts.approved})` },
  ]

  return (
    <div>
      {/* Flash de confirmação */}
      {flash && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-3">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"
               strokeWidth={2} className="text-emerald-600 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-medium text-emerald-800">
            Acesso liberado para <strong>{flash.name}</strong>.
            O usuário já pode fazer login com link de acesso.
          </p>
        </div>
      )}

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

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center text-zinc-400">
          Nenhum registro encontrado.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  {['Nome', 'Email', 'Empresa', 'Cargo', 'Interesse', 'Data', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-zinc-400 tracking-widest uppercase whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(record => {
                  const rowErr = rowErrors.get(record.id)
                  const isApproving = approving === record.id

                  return (
                    <tr key={record.id} className={`bg-white hover:bg-zinc-50 transition-colors
                      ${record.contacted ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 font-medium text-zinc-900 whitespace-nowrap">
                        {record.name ?? <span className="text-zinc-400 italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                        {record.email}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {record.company ?? <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {record.role ?? <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 max-w-[160px] truncate">
                        {record.interest ?? <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                        {formatDate(record.created_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {record.contacted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                           text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                            ✓ Aprovado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full
                                           text-[11px] font-semibold bg-amber-50 text-amber-700">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          {!record.contacted && (
                            <button
                              onClick={() => approve(record)}
                              disabled={isApproving || !!approving}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold
                                         bg-taime-600 text-white hover:bg-taime-700
                                         disabled:opacity-50 disabled:cursor-not-allowed
                                         transition-colors"
                            >
                              {isApproving ? 'Aprovando...' : 'Aprovar acesso'}
                            </button>
                          )}
                          {rowErr && (
                            <p className="text-xs text-red-600 max-w-[180px]">{rowErr}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
