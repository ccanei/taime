'use client'

import { useMemo, useState } from 'react'
import { useLocale } from '@/lib/useLocale'

// ─── Tipos compartilhados com o server ─────────────────────────────────────────

export interface SubscriberRow {
  id:                 string
  email:              string
  locale:             string | null
  source:             string | null
  status:             SubStatus
  created_at:         string
  status_changed_at:  string | null
  status_changed_by:  string | null
  blocked_reason:     string | null
}

export interface SendRow {
  id:                string
  briefing_id:       string | null
  briefing_date:     string
  subject_pt:        string | null
  subject_en:        string | null
  body_pt:           string | null
  body_en:           string | null
  recipient_count:   number
  sent_count:        number
  failed_count:      number
  status:            SendStatus
  resend_reference:  string | null
  created_at:        string
}

interface RecipientRow {
  id:            string
  subscriber_id: string
  email:         string
  locale:        string | null
  delivered:     boolean
  error:         string | null
  created_at:    string
}

type SubStatus  = 'active' | 'blocked' | 'unsubscribed' | 'removed'
type SendStatus = 'sent' | 'partial' | 'skipped' | 'failed'
type Tab        = 'subscribers' | 'sends'
type SubFilter  = 'all' | 'active' | 'blocked' | 'unsubscribed' | 'removed'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

const STATUS_STYLE: Record<SubStatus, string> = {
  active:       'bg-emerald-50 text-emerald-700 border border-emerald-200',
  blocked:      'bg-red-50 text-red-700 border border-red-200',
  unsubscribed: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
  removed:      'bg-zinc-100 text-zinc-500 border border-zinc-200 line-through',
}

const SEND_STATUS_STYLE: Record<SendStatus, string> = {
  sent:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border border-amber-200',
  skipped: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
  failed:  'bg-red-50 text-red-700 border border-red-200',
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function NewsletterAdmin({
  initialSubscribers,
  initialSends,
}: {
  initialSubscribers: SubscriberRow[]
  initialSends:       SendRow[]
}) {
  const { t } = useLocale()
  const isPt = t.nav.howItWorks === 'Como funciona'

  const [tab, setTab]             = useState<Tab>('subscribers')
  const [subs, setSubs]           = useState<SubscriberRow[]>(initialSubscribers)
  const [sends]                   = useState<SendRow[]>(initialSends)

  return (
    <div>
      {/* Aviso: sem fila de aprovação */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-500">
        {isPt
          ? 'Inscrição já entra como ativa. Use este painel só para verificar, bloquear casos suspeitos ou remover por solicitação.'
          : 'Subscription enters as active. Use this panel only to verify, block suspicious cases, or remove on request.'}
      </div>

      {/* Tabs principais */}
      <div className="flex gap-1 mb-6 p-1 bg-zinc-100 rounded-xl w-fit">
        <button
          onClick={() => setTab('subscribers')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'subscribers'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          {isPt ? `Inscritos (${subs.length})` : `Subscribers (${subs.length})`}
        </button>
        <button
          onClick={() => setTab('sends')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'sends'
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          {isPt ? `Envios (${sends.length})` : `Sends (${sends.length})`}
        </button>
      </div>

      {tab === 'subscribers' ? (
        <SubscribersSection subs={subs} setSubs={setSubs} isPt={isPt} />
      ) : (
        <SendsSection sends={sends} isPt={isPt} />
      )}
    </div>
  )
}

// ─── Seção: Inscritos ──────────────────────────────────────────────────────────

function SubscribersSection({
  subs,
  setSubs,
  isPt,
}: {
  subs:    SubscriberRow[]
  setSubs: React.Dispatch<React.SetStateAction<SubscriberRow[]>>
  isPt:    boolean
}) {
  const [filter, setFilter]   = useState<SubFilter>('all')
  const [search, setSearch]   = useState('')
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [errMap, setErrMap]   = useState<Map<string, string>>(new Map())

  const counts = useMemo(() => ({
    all:          subs.length,
    active:       subs.filter(s => s.status === 'active').length,
    blocked:      subs.filter(s => s.status === 'blocked').length,
    unsubscribed: subs.filter(s => s.status === 'unsubscribed').length,
    removed:      subs.filter(s => s.status === 'removed').length,
  }), [subs])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return subs
      .filter(s => filter === 'all' ? true : s.status === filter)
      .filter(s => term ? s.email.toLowerCase().includes(term) : true)
  }, [subs, filter, search])

  async function callAction(id: string, action: 'block' | 'reactivate' | 'remove', reason?: string) {
    setBusyId(id)
    setErrMap(prev => { const m = new Map(prev); m.delete(id); return m })
    try {
      const res = await fetch('/api/admin/newsletter/subscriber-action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, action, reason }),
      })
      const json = await res.json() as { success?: boolean; status?: SubStatus; error?: string }
      if (!res.ok || !json.success) {
        setErrMap(prev => new Map(prev).set(id, json.error ?? 'Erro'))
        return
      }
      const now      = new Date().toISOString()
      const newStatus = json.status as SubStatus
      setSubs(prev => prev.map(s => s.id === id
        ? {
            ...s,
            status:            newStatus,
            status_changed_at: now,
            blocked_reason:    action === 'block'      ? (reason || s.blocked_reason)
                              : action === 'reactivate' ? null
                              :                            s.blocked_reason,
          }
        : s,
      ))
      setFlashId(id)
      setTimeout(() => setFlashId(null), 2500)
    } catch (e) {
      setErrMap(prev => new Map(prev).set(id, e instanceof Error ? e.message : String(e)))
    } finally {
      setBusyId(null)
    }
  }

  const FILTERS: { key: SubFilter; labelPt: string; labelEn: string; count: number }[] = [
    { key: 'all',          labelPt: 'Todos',         labelEn: 'All',          count: counts.all          },
    { key: 'active',       labelPt: 'Ativos',        labelEn: 'Active',       count: counts.active       },
    { key: 'blocked',      labelPt: 'Bloqueados',    labelEn: 'Blocked',      count: counts.blocked      },
    { key: 'unsubscribed', labelPt: 'Saíram',        labelEn: 'Opted out',    count: counts.unsubscribed },
    { key: 'removed',      labelPt: 'Removidos',     labelEn: 'Removed',      count: counts.removed      },
  ]

  return (
    <div>
      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-1 p-1 bg-zinc-100 rounded-xl">
          {FILTERS.map(({ key, labelPt, labelEn, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                filter === key
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {isPt ? labelPt : labelEn} ({count})
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={isPt ? 'Buscar por email' : 'Search by email'}
          className="ml-auto px-3 py-1.5 rounded-lg border border-zinc-200 text-sm text-zinc-900
                     placeholder:text-zinc-400 bg-white focus:outline-none focus:ring-2
                     focus:ring-taime-600 focus:border-transparent w-64"
        />
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center text-zinc-400">
          {isPt ? 'Nenhum inscrito encontrado.' : 'No subscriber found.'}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  {[
                    isPt ? 'Email'        : 'Email',
                    isPt ? 'Idioma'       : 'Locale',
                    isPt ? 'Origem'       : 'Source',
                    isPt ? 'Status'       : 'Status',
                    isPt ? 'Inscrito em'  : 'Subscribed',
                    isPt ? 'Última ação'  : 'Last action',
                    isPt ? 'Ações'        : 'Actions',
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-zinc-400 tracking-widest uppercase whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(s => {
                  const rowErr   = errMap.get(s.id)
                  const isBusy   = busyId === s.id
                  const flashed  = flashId === s.id
                  return (
                    <tr key={s.id} className={`bg-white hover:bg-zinc-50 transition-colors ${
                      s.status === 'removed' ? 'opacity-60' : ''
                    }`}>
                      <td className="px-4 py-3 font-medium text-zinc-900 whitespace-nowrap">
                        {s.email}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {s.locale ?? 'pt-BR'}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {s.source ?? '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[s.status]}`}>
                          {s.status}
                        </span>
                        {s.status === 'blocked' && s.blocked_reason && (
                          <div className="text-[11px] text-red-600 mt-0.5 max-w-[180px] truncate">
                            {s.blocked_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">
                        {formatDateTime(s.created_at)}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">
                        {s.status_changed_at
                          ? (
                            <div>
                              {formatDateTime(s.status_changed_at)}
                              {s.status_changed_by && (
                                <div className="text-[10px] text-zinc-400">{s.status_changed_by}</div>
                              )}
                            </div>
                          )
                          : <span className="text-zinc-300">-</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SubscriberActions
                          status={s.status}
                          busy={isBusy || !!busyId}
                          isPt={isPt}
                          onBlock={async (reason) => callAction(s.id, 'block', reason ?? undefined)}
                          onReactivate={async () => callAction(s.id, 'reactivate')}
                          onRemove={async () => {
                            const msg = isPt
                              ? `Remover ${s.email}? Isto é soft delete: marca como removido e ele não entra em envios futuros.`
                              : `Remove ${s.email}? This is a soft delete: marks as removed and excludes from future sends.`
                            if (!window.confirm(msg)) return
                            await callAction(s.id, 'remove')
                          }}
                        />
                        {flashed && (
                          <p className="text-[11px] text-emerald-600 font-medium mt-1">
                            {isPt ? '✓ Atualizado' : '✓ Updated'}
                          </p>
                        )}
                        {rowErr && (
                          <p className="text-xs text-red-600 max-w-[200px] mt-1">{rowErr}</p>
                        )}
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

function SubscriberActions({
  status, busy, isPt, onBlock, onReactivate, onRemove,
}: {
  status:       SubStatus
  busy:         boolean
  isPt:         boolean
  onBlock:      (reason: string | null) => Promise<void>
  onReactivate: () => Promise<void>
  onRemove:     () => Promise<void>
}) {
  const btnBase = 'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const blockBtn      = `${btnBase} bg-red-50 text-red-700 hover:bg-red-100`
  const reactivateBtn = `${btnBase} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`
  const removeBtn     = `${btnBase} text-zinc-500 hover:bg-zinc-100`

  return (
    <div className="flex items-center gap-1.5">
      {status === 'active' && (
        <button
          disabled={busy}
          onClick={() => {
            const prompted = window.prompt(
              isPt ? 'Motivo do bloqueio (opcional)' : 'Reason to block (optional)',
              '',
            )
            // window.prompt retorna null em cancelar; string vazia é aceitar sem motivo.
            if (prompted === null) return
            onBlock(prompted.trim() || null)
          }}
          className={blockBtn}
        >
          {isPt ? 'Bloquear' : 'Block'}
        </button>
      )}
      {(status === 'blocked' || status === 'unsubscribed' || status === 'removed') && (
        <button
          disabled={busy}
          onClick={() => onReactivate()}
          className={reactivateBtn}
        >
          {isPt ? 'Reativar' : 'Reactivate'}
        </button>
      )}
      {status !== 'removed' && (
        <button
          disabled={busy}
          onClick={() => onRemove()}
          className={removeBtn}
        >
          {isPt ? 'Remover' : 'Remove'}
        </button>
      )}
    </div>
  )
}

// ─── Seção: Envios ────────────────────────────────────────────────────────────

function SendsSection({ sends, isPt }: { sends: SendRow[]; isPt: boolean }) {
  if (sends.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center text-zinc-400">
        {isPt ? 'Nenhum envio registrado ainda.' : 'No send recorded yet.'}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {sends.map(s => (
        <SendCard key={s.id} send={s} isPt={isPt} />
      ))}
    </div>
  )
}

function SendCard({ send, isPt }: { send: SendRow; isPt: boolean }) {
  const [open, setOpen]         = useState(false)
  const [recs, setRecs]         = useState<RecipientRow[] | null>(null)
  const [loadingRecs, setLoad]  = useState(false)
  const [recErr, setRecErr]     = useState<string | null>(null)

  async function loadRecipients() {
    if (recs !== null || loadingRecs) return
    setLoad(true)
    setRecErr(null)
    try {
      const res  = await fetch(`/api/admin/newsletter/send-recipients?send_id=${encodeURIComponent(send.id)}`)
      const json = await res.json() as { recipients?: RecipientRow[]; error?: string }
      if (!res.ok) {
        setRecErr(json.error ?? 'Erro')
        return
      }
      setRecs(json.recipients ?? [])
    } catch (e) {
      setRecErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoad(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) loadRecipients()
        }}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-zinc-50 transition-colors text-left"
      >
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${SEND_STATUS_STYLE[send.status]}`}>
          {send.status}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 truncate">
            {isPt ? 'Briefing' : 'Briefing'} {formatDate(send.briefing_date)}
          </p>
          <p className="text-xs text-zinc-500 truncate">
            {send.subject_pt || send.subject_en || ''}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-xs text-zinc-500 whitespace-nowrap">
          <span>{isPt ? 'Destinatários' : 'Recipients'}: <strong className="text-zinc-700">{send.recipient_count}</strong></span>
          <span>{isPt ? 'Enviados' : 'Sent'}: <strong className="text-emerald-700">{send.sent_count}</strong></span>
          <span>{isPt ? 'Falhas' : 'Failures'}: <strong className={send.failed_count > 0 ? 'text-red-700' : 'text-zinc-700'}>{send.failed_count}</strong></span>
        </div>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"
          strokeWidth={2.5} className={`shrink-0 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body expandido */}
      {open && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-5 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* PT */}
            <div className="rounded-lg bg-white border border-zinc-200 p-4">
              <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-2">PT-BR</p>
              <p className="font-semibold text-zinc-900 mb-2 leading-snug">
                {send.subject_pt ?? <span className="text-zinc-300">-</span>}
              </p>
              <p className="text-xs text-zinc-600 whitespace-pre-line leading-relaxed">
                {send.body_pt ?? ''}
              </p>
            </div>
            {/* EN */}
            <div className="rounded-lg bg-white border border-zinc-200 p-4">
              <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-2">EN</p>
              <p className="font-semibold text-zinc-900 mb-2 leading-snug">
                {send.subject_en ?? ''}
              </p>
              <p className="text-xs text-zinc-600 whitespace-pre-line leading-relaxed">
                {send.body_en ?? ''}
              </p>
            </div>
          </div>

          {/* Meta */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            <span>
              {isPt ? 'Enviado em' : 'Sent at'}: <strong className="text-zinc-700">{formatDateTime(send.created_at)}</strong>
            </span>
            {send.resend_reference && (
              <span>
                {isPt ? 'Referência Resend' : 'Resend reference'}:{' '}
                <code className="px-1.5 py-0.5 rounded bg-zinc-100 font-mono text-[11px] text-zinc-700">{send.resend_reference}</code>
              </span>
            )}
          </div>

          {/* Destinatários */}
          <div className="mt-5">
            <p className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-2">
              {isPt ? 'Destinatários' : 'Recipients'}
            </p>
            {loadingRecs ? (
              <p className="text-xs text-zinc-400">{isPt ? 'Carregando...' : 'Loading...'}</p>
            ) : recErr ? (
              <p className="text-xs text-red-600">{recErr}</p>
            ) : recs === null ? null : recs.length === 0 ? (
              <p className="text-xs text-zinc-400">{isPt ? 'Sem destinatários registrados.' : 'No recipients recorded.'}</p>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-500">Email</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-500">{isPt ? 'Idioma' : 'Locale'}</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-500">Status</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-500">{isPt ? 'Erro' : 'Error'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {recs.map(r => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 text-zinc-700">{r.email}</td>
                        <td className="px-3 py-2 text-zinc-500">{r.locale ?? 'pt-BR'}</td>
                        <td className="px-3 py-2">
                          {r.delivered
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">{isPt ? 'entregue' : 'delivered'}</span>
                            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700">{isPt ? 'falhou' : 'failed'}</span>}
                        </td>
                        <td className="px-3 py-2 text-zinc-500 max-w-[260px] truncate">
                          {r.error ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
