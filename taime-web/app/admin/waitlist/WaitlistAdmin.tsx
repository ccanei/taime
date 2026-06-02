'use client'

import { useState, useMemo } from 'react'
import { useLocale } from '@/lib/useLocale'

const PLAN_LABELS: Record<'pt-BR' | 'en', Record<string, string>> = {
  'pt-BR': { free: 'Gratuito', essential: 'Essencial', strategic: 'Estratégico' },
  'en':    { free: 'Free',     essential: 'Essential', strategic: 'Strategic'    },
}

export interface WaitlistRecord {
  id: string
  email: string
  name: string | null
  company: string | null
  role: string | null
  interest: string | null
  requested_plan: 'free' | 'essential' | 'strategic' | null
  created_at: string
  contacted: boolean
}

type PlanChoice = 'free' | 'essential' | 'strategic'

type Filter = 'all' | 'pending' | 'approved'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function WaitlistAdmin({
  initialRecords,
  approvedPlanByEmail = {},
}: {
  initialRecords: WaitlistRecord[]
  approvedPlanByEmail?: Record<string, string>
}) {
  const { t } = useLocale()
  const isPt = t.nav.howItWorks === 'Como funciona'
  const planLabels = isPt ? PLAN_LABELS['pt-BR'] : PLAN_LABELS['en']
  const [records, setRecords]     = useState<WaitlistRecord[]>(initialRecords)
  const [filter, setFilter]       = useState<Filter>('all')
  const [approving, setApproving] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null)
  const [flash, setFlash]         = useState<{ id: string; name: string } | null>(null)
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map())
  // Plano final escolhido pelo admin por registro (default = requested_plan ou 'free')
  const [planChoice, setPlanChoice] = useState<Map<string, PlanChoice>>(new Map())
  // Plano sendo escolhido para troca pós-aprovação (key = email)
  const [changePlanChoice, setChangePlanChoice] = useState<Map<string, PlanChoice>>(new Map())
  // Overrides do plano aprovado para refletir mudanças sem reload (key = email)
  const [planOverrides, setPlanOverrides] = useState<Map<string, PlanChoice>>(new Map())
  // Flash de sucesso na mudança de plano (key = email)
  const [planFlashEmail, setPlanFlashEmail] = useState<string | null>(null)

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

    const plan: PlanChoice = planChoice.get(record.id) ?? (record.requested_plan ?? 'free')

    try {
      const res = await fetch('/api/admin/approve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: record.id, email: record.email, name: record.name ?? '', plan }),
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

  async function changePlan(record: WaitlistRecord) {
    const currentPlan: PlanChoice =
      planOverrides.get(record.email) ?? ((approvedPlanByEmail[record.email] ?? 'free') as PlanChoice)
    const newPlan: PlanChoice =
      changePlanChoice.get(record.email) ?? currentPlan
    if (newPlan === currentPlan) return

    const who = record.name ?? record.email
    const confirmMsg = isPt
      ? `Mudar plano de ${who} de "${planLabels[currentPlan]}" para "${planLabels[newPlan]}"?`
      : `Change ${who}'s plan from "${planLabels[currentPlan]}" to "${planLabels[newPlan]}"?`
    if (!window.confirm(confirmMsg)) return

    setUpdatingPlan(record.id)
    setRowErrors(prev => { const m = new Map(prev); m.delete(record.id); return m })

    try {
      const res = await fetch('/api/admin/change-plan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: record.email, plan: newPlan }),
      })
      const json = await res.json() as { success?: boolean; error?: string; plan?: string }

      if (!res.ok || !json.success) {
        setRowErrors(prev => new Map(prev).set(record.id, json.error ?? 'Erro desconhecido'))
        return
      }

      setPlanOverrides(prev => new Map(prev).set(record.email, newPlan))
      setPlanFlashEmail(record.email)
      setTimeout(() => setPlanFlashEmail(null), 3000)
    } catch (err) {
      setRowErrors(prev => new Map(prev).set(record.id, String(err)))
    } finally {
      setUpdatingPlan(null)
    }
  }

  async function reject(record: WaitlistRecord) {
    if (!window.confirm(`Rejeitar a solicitação de ${record.name ?? record.email}?`)) return
    setRejecting(record.id)
    setRowErrors(prev => { const m = new Map(prev); m.delete(record.id); return m })

    try {
      const res = await fetch('/api/admin/waitlist-reject', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: record.id }),
      })

      const json = await res.json() as { success?: boolean; error?: string }

      if (!res.ok || !json.success) {
        setRowErrors(prev => new Map(prev).set(record.id, json.error ?? 'Erro desconhecido'))
        return
      }

      // Soft-delete: remove da listagem (a página filtra `status != 'rejected'` no SSR;
      // localmente também removemos para refletir imediatamente sem reload).
      setRecords(prev => prev.filter(r => r.id !== record.id))
    } catch (err) {
      setRowErrors(prev => new Map(prev).set(record.id, String(err)))
    } finally {
      setRejecting(null)
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
                  {['Nome', 'Email', 'Empresa', 'Cargo', 'Interesse', 'Plano solicitado', 'Data', 'Status', 'Plano final / Aprovar'].map(h => (
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
                  const isRejecting = rejecting === record.id
                  const isUpdating  = updatingPlan === record.id
                  const busy = isApproving || isRejecting || isUpdating
                            || !!approving || !!rejecting || !!updatingPlan

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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-700">
                          {record.requested_plan ?? 'free'}
                        </span>
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
                          {!record.contacted ? (
                            <>
                              <select
                                value={planChoice.get(record.id) ?? (record.requested_plan ?? 'free')}
                                onChange={e => {
                                  const val = e.target.value as PlanChoice
                                  setPlanChoice(prev => new Map(prev).set(record.id, val))
                                }}
                                disabled={busy}
                                className="text-xs px-2 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-taime-600"
                              >
                                <option value="free">free</option>
                                <option value="essential">essential</option>
                                <option value="strategic">strategic</option>
                              </select>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => approve(record)}
                                  disabled={busy}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold
                                             bg-taime-600 text-white hover:bg-taime-700
                                             disabled:opacity-50 disabled:cursor-not-allowed
                                             transition-colors"
                                >
                                  {isApproving ? 'Aprovando...' : 'Aprovar acesso'}
                                </button>
                                <button
                                  onClick={() => reject(record)}
                                  disabled={busy}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium
                                             text-red-600 hover:text-red-700 hover:bg-red-50
                                             disabled:opacity-50 disabled:cursor-not-allowed
                                             transition-colors"
                                >
                                  {isRejecting ? 'Rejeitando...' : 'Rejeitar'}
                                </button>
                              </div>
                            </>
                          ) : (
                            (() => {
                              const effectivePlan: PlanChoice =
                                planOverrides.get(record.email)
                                ?? ((approvedPlanByEmail[record.email] ?? 'free') as PlanChoice)
                              const selectedPlan: PlanChoice =
                                changePlanChoice.get(record.email) ?? effectivePlan
                              const flashed = planFlashEmail === record.email
                              return (
                                <div className="flex flex-col gap-1.5 items-start">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                                    ✓ {isPt ? 'Aprovado' : 'Approved'}: {planLabels[effectivePlan]}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={selectedPlan}
                                      onChange={e => {
                                        const val = e.target.value as PlanChoice
                                        setChangePlanChoice(prev => new Map(prev).set(record.email, val))
                                      }}
                                      disabled={busy}
                                      className="text-xs px-2 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-taime-600"
                                    >
                                      <option value="free">free</option>
                                      <option value="essential">essential</option>
                                      <option value="strategic">strategic</option>
                                    </select>
                                    <button
                                      onClick={() => changePlan(record)}
                                      disabled={busy || selectedPlan === effectivePlan}
                                      className="px-2.5 py-1 rounded-lg text-xs font-semibold
                                                 bg-zinc-100 text-zinc-700 hover:bg-zinc-200
                                                 disabled:opacity-50 disabled:cursor-not-allowed
                                                 transition-colors"
                                    >
                                      {isUpdating
                                        ? (isPt ? 'Atualizando...' : 'Updating...')
                                        : (isPt ? 'Atualizar' : 'Update')}
                                    </button>
                                  </div>
                                  {flashed && (
                                    <span className="text-[11px] text-emerald-600 font-medium">
                                      {isPt ? '✓ Plano atualizado' : '✓ Plan updated'}
                                    </span>
                                  )}
                                </div>
                              )
                            })()
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
