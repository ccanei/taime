'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'
import { computeProgress, type PlanRecord, type PlanStatus } from '@/lib/advisor-plan'
import { ProgressBar, PhaseDetail, progressText, togglePhaseAction, patchPlan } from '@/components/PlanUI'

// Pagina de planos (Fase 2.2, TAREFA 2): lista os planos do usuario (ativos, depois
// concluidos, depois arquivados), cada um com progresso e detalhe expansivel de todas
// as fases; gestao (arquivar / concluir / reativar / excluir com confirmacao); link de
// volta a conversa que originou o plano. Fail-safe: erro de carga nao quebra a tela.

function StatusBadge({ status, isPt }: { status: PlanStatus; isPt: boolean }) {
  const map: Record<PlanStatus, { pt: string; en: string; cls: string }> = {
    active:    { pt: 'Ativo',      en: 'Active',    cls: 'bg-taime-50 text-taime-700 ring-taime-100' },
    completed: { pt: 'Concluído',  en: 'Completed', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
    archived:  { pt: 'Arquivado',  en: 'Archived',  cls: 'bg-zinc-100 text-zinc-500 ring-zinc-200' },
  }
  const s = map[status]
  return <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${s.cls}`}>{isPt ? s.pt : s.en}</span>
}

export default function PlansManager() {
  const { locale } = useLocale()
  const isPt = locale === 'pt'
  const [plans,   setPlans]   = useState<PlanRecord[] | null>(null)
  const [failed,  setFailed]  = useState(false)
  const [openId,  setOpenId]  = useState<string | null>(null)
  const [busyId,  setBusyId]  = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [limitMsg, setLimitMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'inactive'>('active')  // Ativos / Arquivados (arquivados + concluidos)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/advisor/plans?all=1')
      if (!res.ok) { setFailed(true); return }
      const json = await res.json() as { plans?: PlanRecord[] }
      setPlans(json.plans ?? [])
    } catch { setFailed(true) }
  }, [])
  useEffect(() => { load() }, [load])

  // Abre o plano indicado por ?id= (deep-link vindo do card/painel), quando existir,
  // ja na aba correta (ativo vs arquivado/concluido).
  useEffect(() => {
    if (!plans) return
    const id = new URLSearchParams(window.location.search).get('id')
    const target = id ? plans.find(p => p.id === id) : undefined
    if (target) { setOpenId(target.id); setTab(target.status === 'active' ? 'active' : 'inactive') }
  }, [plans])

  function updateLocal(updated: PlanRecord) {
    setPlans(prev => (prev ?? []).map(p => p.id === updated.id ? updated : p))
  }

  async function toggleAction(plan: PlanRecord, phaseIndex: number, actionIndex: number) {
    if (busyId) return
    const nextPhases = togglePhaseAction(plan.phases, phaseIndex, actionIndex)
    updateLocal({ ...plan, phases: nextPhases })       // otimista
    setBusyId(plan.id)
    const updated = await patchPlan(plan.id, { phases: nextPhases })
    setBusyId(null)
    if (updated) updateLocal(updated as PlanRecord)
    else updateLocal(plan)                              // reverte no erro
  }

  async function changeStatus(plan: PlanRecord, status: PlanStatus) {
    if (busyId) return
    setLimitMsg(null)
    setBusyId(plan.id)
    try {
      const res = await fetch(`/api/advisor/plans/${plan.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      const json = await res.json() as { ok?: boolean; plan?: PlanRecord; error?: string; limit?: number }
      if (res.status === 403 && json.error === 'limit_reached') {
        setLimitMsg(isPt
          ? `Você já tem ${json.limit} ${json.limit === 1 ? 'plano ativo' : 'planos ativos'} (o limite do seu acesso). Arquive um plano ativo antes de reativar este.`
          : `You already have ${json.limit} active ${json.limit === 1 ? 'plan' : 'plans'} (your access limit). Archive an active plan before reactivating this one.`)
        return
      }
      if (json.ok && json.plan) updateLocal(json.plan)
    } finally { setBusyId(null) }
  }

  async function remove(plan: PlanRecord) {
    if (busyId) return
    setBusyId(plan.id)
    try {
      const res = await fetch(`/api/advisor/plans/${plan.id}`, { method: 'DELETE' })
      if (res.ok) { setPlans(prev => (prev ?? []).filter(p => p.id !== plan.id)); setConfirmDelete(null) }
    } finally { setBusyId(null) }
  }

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(isPt ? 'pt-BR' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '' }
  }

  if (failed) {
    return <p className="text-sm text-zinc-400">{isPt ? 'Não foi possível carregar seus planos agora.' : 'Could not load your plans right now.'}</p>
  }
  if (plans === null) {
    return (
      <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-24 rounded-xl bg-white border border-zinc-200 animate-pulse" />)}</div>
    )
  }
  if (plans.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-12 text-center">
        <p className="text-sm text-zinc-500 mb-1">{isPt ? 'Você ainda não salvou nenhum plano.' : 'You have not saved any plan yet.'}</p>
        <p className="text-xs text-zinc-400 mb-4">{isPt
          ? 'Quando o Advisor entregar um roadmap, você pode salvá-lo como seu plano.'
          : 'When the Advisor delivers a roadmap, you can save it as your plan.'}</p>
        <Link href="/dashboard/advisor" className="btn-primary text-sm px-4 py-2 inline-flex">
          {isPt ? 'Ir para o Advisor →' : 'Go to the Advisor →'}
        </Link>
      </div>
    )
  }

  const active   = plans.filter(p => p.status === 'active')
  const inactive = plans.filter(p => p.status !== 'active')   // arquivados + concluidos
  const items    = tab === 'active' ? active : inactive

  function renderCard(plan: PlanRecord) {
            const progress = computeProgress(plan.phases)
              const open = openId === plan.id
              const busy = busyId === plan.id
              const editable = plan.status === 'active'
              return (
                <div key={plan.id} className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                  {/* Cabecalho do card (clicavel para expandir) */}
                  <button
                    onClick={() => setOpenId(open ? null : plan.id)}
                    className="w-full text-left px-4 py-3.5 hover:bg-zinc-50/60 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge status={plan.status} isPt={isPt} />
                          <span className="text-[11px] text-zinc-400 tabular-nums">{fmtDate(plan.created_at)}</span>
                        </div>
                        <h3 className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2">{plan.title ?? (isPt ? 'Plano estratégico' : 'Strategic plan')}</h3>
                        {plan.theme && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{plan.theme}</p>}
                      </div>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={`shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                    <div className="mt-2.5">
                      <p className="text-[11px] text-zinc-500 tabular-nums mb-1">{progressText(plan.phases, isPt)}</p>
                      <ProgressBar done={progress.doneActions} total={progress.totalActions} />
                    </div>
                  </button>

                  {/* Detalhe expandido: todas as fases + gestao */}
                  {open && (
                    <div className="px-4 pb-4 pt-1 border-t border-zinc-100">
                      <div className="flex flex-col gap-4 mt-3">
                        {plan.phases.map((phase, pi) => (
                          <div key={pi} className="rounded-lg bg-zinc-50 border border-zinc-100 p-3">
                            <PhaseDetail
                              phase={phase} isPt={isPt} readOnly={!editable} disabled={busy}
                              dim={pi < progress.currentPhaseIndex && editable}
                              onToggleAction={editable ? (ai) => toggleAction(plan, pi, ai) : undefined}
                            />
                          </div>
                        ))}
                      </div>

                      {limitMsg && busyId === null && (
                        <p className="mt-3 text-[11px] text-amber-700 leading-snug">{limitMsg}</p>
                      )}

                      {/* Acoes de gestao */}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {plan.status === 'active' && (
                          <>
                            <button onClick={() => changeStatus(plan, 'completed')} disabled={busy}
                              className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-md px-3 py-1.5 disabled:opacity-50">
                              {isPt ? 'Marcar como concluído' : 'Mark as completed'}
                            </button>
                            <button onClick={() => changeStatus(plan, 'archived')} disabled={busy}
                              className="text-xs font-semibold text-zinc-600 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-md px-3 py-1.5 disabled:opacity-50">
                              {isPt ? 'Arquivar' : 'Archive'}
                            </button>
                          </>
                        )}
                        {(plan.status === 'archived' || plan.status === 'completed') && (
                          <button onClick={() => changeStatus(plan, 'active')} disabled={busy}
                            className="text-xs font-semibold text-taime-700 bg-taime-50 hover:bg-taime-100 border border-taime-100 rounded-md px-3 py-1.5 disabled:opacity-50">
                            {isPt ? 'Reativar' : 'Reactivate'}
                          </button>
                        )}
                        {plan.session_id && (
                          <Link href={`/dashboard/advisor?session=${plan.session_id}`}
                            className="text-xs font-medium text-zinc-500 hover:text-taime-700 px-1">
                            {isPt ? 'Ver a conversa →' : 'Open the conversation →'}
                          </Link>
                        )}
                        <span className="flex-1" />
                        {confirmDelete === plan.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-[11px] text-zinc-500">{isPt ? 'Excluir?' : 'Delete?'}</span>
                            <button onClick={() => remove(plan)} disabled={busy}
                              className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md px-2.5 py-1.5 disabled:opacity-50">
                              {isPt ? 'Sim, excluir' : 'Yes, delete'}
                            </button>
                            <button onClick={() => setConfirmDelete(null)}
                              className="text-xs text-zinc-400 hover:text-zinc-600 px-1">{isPt ? 'Cancelar' : 'Cancel'}</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDelete(plan.id)}
                            className="text-xs font-medium text-zinc-400 hover:text-red-600 transition-colors px-1">
                            {isPt ? 'Excluir' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
  }

  return (
    <div>
      {/* Abas Ativos / Arquivados, espelhando o padrao das conversas do Advisor.
          "Arquivados" reune arquivados e concluidos; o badge de cada card distingue. */}
      <div className="flex border-b border-zinc-200 mb-5 text-sm">
        {(['active', 'inactive'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 font-medium transition-colors -mb-px border-b-2 ${
              tab === k ? 'text-zinc-900 border-taime-600' : 'text-zinc-400 border-transparent hover:text-zinc-700'
            }`}>
            {k === 'active' ? (isPt ? 'Ativos' : 'Active') : (isPt ? 'Arquivados' : 'Archived')}
            <span className="ml-1.5 text-zinc-300 tabular-nums">{k === 'active' ? active.length : inactive.length}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-400">
          {tab === 'active'
            ? (isPt ? 'Nenhum plano ativo.' : 'No active plan.')
            : (isPt ? 'Nenhum plano arquivado.' : 'No archived plan.')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(renderCard)}
        </div>
      )}
    </div>
  )
}
