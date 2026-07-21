'use client'

import { useState } from 'react'

export interface ConvMessage { role: string; content: string }

export interface ContactRequestRecord {
  id:           string
  created_at:   string
  subject:      string
  message:      string
  status:       'new' | 'replied' | string
  email:        string | null
  full_name:    string | null
  plan:         string | null
  conversation: ConvMessage[]
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const SUBJECT_STYLE: Record<string, string> = {
  Comercial: 'bg-taime-50 text-taime-700',
  Suporte:   'bg-blue-50 text-blue-700',
  Feedback:  'bg-emerald-50 text-emerald-700',
  Outro:     'bg-zinc-100 text-zinc-600',
}

export default function ContactRequestsSection({
  initial, tableMissing,
}: {
  initial:      ContactRequestRecord[]
  tableMissing: boolean
}) {
  const [records, setRecords] = useState(initial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function markReplied(id: string) {
    setBusy(id)
    try {
      const res = await fetch('/api/admin/contact-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      if (res.ok) setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'replied' } : r))
    } catch { /* ignora */ } finally { setBusy(null) }
  }

  const newCount = records.filter(r => r.status === 'new').length

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-zinc-900">
          Pedidos de contato <span className="text-sm font-medium text-zinc-400">({records.length}, {newCount} novos)</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Pedidos feitos de dentro do Advisor logado. Expanda para ver a conversa que deu contexto.
        </p>
      </div>

      {tableMissing ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-900">
          <p className="font-semibold mb-1">Tabela ainda não criada</p>
          <p className="text-amber-800">
            Execute <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">add-contact-requests.sql</code>{' '}
            no SQL editor do Supabase para ativar os pedidos de contato.
          </p>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-10 text-center text-sm text-zinc-400">
          Nenhum pedido de contato ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const isOpen = expanded === r.id
            return (
              <article key={r.id}
                className={`rounded-xl border border-zinc-200 bg-white p-5 ${r.status === 'replied' ? 'opacity-70' : ''}`}>
                <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${SUBJECT_STYLE[r.subject] ?? 'bg-zinc-100 text-zinc-600'}`}>
                      {r.subject}
                    </span>
                    {r.status === 'replied' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600">✓ Respondido</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">Novo</span>
                    )}
                    {r.plan && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-50 text-zinc-500 border border-zinc-100 capitalize">{r.plan}</span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">{fmt(r.created_at)}</span>
                </header>

                <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap mb-3">{r.message}</p>

                <footer className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-zinc-100">
                  <span className="text-xs text-zinc-500">
                    {r.full_name ? `${r.full_name} · ` : ''}{r.email ?? <span className="italic text-zinc-400">sem email</span>}
                  </span>
                  <div className="flex items-center gap-3">
                    {r.conversation.length > 0 && (
                      <button onClick={() => setExpanded(isOpen ? null : r.id)}
                        className="text-xs font-medium text-taime-700 hover:text-taime-800">
                        {isOpen ? 'Ocultar conversa' : `Ver conversa (${r.conversation.length})`}
                      </button>
                    )}
                    {r.status === 'new' && (
                      <button onClick={() => markReplied(r.id)} disabled={busy === r.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-taime-600 text-white hover:bg-taime-700 disabled:opacity-50">
                        {busy === r.id ? 'Marcando...' : 'Marcar como respondido'}
                      </button>
                    )}
                  </div>
                </footer>

                {isOpen && r.conversation.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2 max-h-96 overflow-y-auto">
                    {r.conversation.map((m, i) => (
                      <div key={i} className={`text-xs leading-relaxed rounded-lg px-3 py-2 ${m.role === 'user' ? 'bg-zinc-800 text-white ml-8' : 'bg-zinc-50 text-zinc-700 mr-8'}`}>
                        <p className="text-[9px] font-bold tracking-widest uppercase opacity-60 mb-1">{m.role === 'user' ? 'Usuário' : 'Advisor'}</p>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
