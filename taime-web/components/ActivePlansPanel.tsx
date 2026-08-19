'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { computeProgress, type PlanRecord, type PlanPhase } from '@/lib/advisor-plan'
import { PhaseDetail, togglePhaseAction, patchPlan } from '@/components/PlanUI'
import ExportPlanButtons from '@/components/ExportPlanButtons'

// Bloco COMPACTO de planos ativos, reutilizado na aba Inicio (Fase 3.x TAREFA 1) e no
// painel de contexto (TAREFA 4). Lista os planos em linhas (nome + progresso resumido);
// clicar numa linha EXPANDE aquele plano no lugar (fase atual, acoes marcaveis, o que
// nao fazer, criterio de saida, exportacao). Estado inicial colapsado, EXCETO o plano
// vinculado a conversa atual (currentSessionId), que abre em destaque. Sem planos, o
// pai nao renderiza este componente.
function planSummary(plan: PlanRecord, isPt: boolean): string {
  const p = computeProgress(plan.phases)
  const phasePart = isPt ? `Fase ${p.currentPhaseIndex + 1} de ${p.phaseCount}` : `Phase ${p.currentPhaseIndex + 1} of ${p.phaseCount}`
  return `${phasePart} · ${p.doneActions}/${p.totalActions}`
}

function ExpandedBody({ plan, isPt, busy, onToggle }: {
  plan: PlanRecord; isPt: boolean; busy: boolean; onToggle: (actionIndex: number) => void
}) {
  const progress = computeProgress(plan.phases)
  const current: PlanPhase | undefined = plan.phases[progress.currentPhaseIndex]
  return (
    <div className="mt-2 rounded-lg bg-zinc-50 border border-zinc-100 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 mb-1.5">
        {isPt ? 'Fase atual' : 'Current phase'}
      </p>
      {current && <PhaseDetail phase={current} isPt={isPt} onToggleAction={onToggle} disabled={busy} />}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Link href={`/dashboard/advisor/plans?id=${plan.id}`} className="text-[11px] font-semibold text-taime-700 hover:text-taime-800 whitespace-nowrap">
          {isPt ? 'Abrir plano →' : 'Open plan →'}
        </Link>
        <ExportPlanButtons plan={plan} isPt={isPt} compact />
      </div>
    </div>
  )
}

export default function ActivePlansPanel({ plans, isPt, title, currentSessionId }: {
  plans: PlanRecord[]; isPt: boolean; title: string; currentSessionId?: string | null
}) {
  // Copia local para o toggle refletir tanto no resumo quanto no expandido.
  const [localPlans, setLocalPlans] = useState<PlanRecord[]>(plans)
  useEffect(() => { setLocalPlans(plans) }, [plans])

  const linkedId = currentSessionId ? (plans.find(p => p.session_id === currentSessionId)?.id ?? null) : null
  const [expandedId, setExpandedId] = useState<string | null>(linkedId)
  useEffect(() => { setExpandedId(linkedId) }, [linkedId])
  const [busyId, setBusyId] = useState<string | null>(null)

  if (localPlans.length === 0) return null

  async function toggle(planId: string, phaseIndex: number, actionIndex: number) {
    if (busyId) return
    const plan = localPlans.find(p => p.id === planId)
    if (!plan) return
    const nextPhases = togglePhaseAction(plan.phases, phaseIndex, actionIndex)
    setLocalPlans(prev => prev.map(p => p.id === planId ? { ...p, phases: nextPhases } : p))  // otimista
    setBusyId(planId)
    const updated = await patchPlan(planId, { phases: nextPhases })
    setBusyId(null)
    setLocalPlans(prev => prev.map(p => p.id === planId ? ((updated as PlanRecord) ?? plan) : p))  // reverte no erro
  }

  // Plano vinculado a conversa atual em primeiro (destaque); demais na ordem recebida.
  const ordered = linkedId
    ? [...localPlans].sort((a, b) => (a.id === linkedId ? -1 : b.id === linkedId ? 1 : 0))
    : localPlans

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-600">{title}</h3>
        <span className="text-[10px] text-zinc-400 tabular-nums">
          {localPlans.length} {isPt ? (localPlans.length === 1 ? 'ativo' : 'ativos') : 'active'}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-zinc-100">
        {ordered.map(plan => {
          const isOpen   = expandedId === plan.id
          const isLinked = plan.id === linkedId
          return (
            <div key={plan.id} className="py-2 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : plan.id)}
                aria-expanded={isOpen}
                className="w-full text-left group flex items-start gap-2 -mx-1 px-1 py-0.5 rounded-md hover:bg-zinc-50 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`mt-1 shrink-0 text-zinc-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {isLinked && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-taime-500" title={isPt ? 'Plano desta conversa' : 'This conversation plan'} />}
                    <span className={`text-[13px] font-semibold leading-snug line-clamp-1 ${isLinked ? 'text-taime-800' : 'text-zinc-800'} group-hover:text-taime-700`}>
                      {plan.title ?? (isPt ? 'Plano estratégico' : 'Strategic plan')}
                    </span>
                  </span>
                  <span className="block text-[11px] text-zinc-400 tabular-nums">{planSummary(plan, isPt)}</span>
                </span>
              </button>
              {isOpen && (
                <ExpandedBody plan={plan} isPt={isPt} busy={busyId === plan.id}
                  onToggle={(ai) => toggle(plan.id, computeProgress(plan.phases).currentPhaseIndex, ai)} />
              )}
            </div>
          )
        })}
      </div>

      <Link href="/dashboard/advisor/plans" className="mt-2.5 inline-block text-[11px] font-semibold text-taime-600 hover:text-taime-800">
        {isPt ? 'Ver todos os planos →' : 'See all plans →'}
      </Link>
    </section>
  )
}
