'use client'

import { useState } from 'react'
import Link from 'next/link'
import { computeProgress, type PlanRecord } from '@/lib/advisor-plan'
import { ProgressBar, PhaseDetail, progressText, togglePhaseAction, patchPlan } from '@/components/PlanUI'
import ExportPlanButtons from '@/components/ExportPlanButtons'

const PLANS_HREF = '/dashboard/advisor/plans'

// Card do plano ativo na aba Inicio do Advisor (Fase 2.2, TAREFA 1). Mostra o plano
// ativo mais recente: titulo, tema, progresso e a FASE ATUAL em destaque com suas
// acoes (marcaveis por clique aqui mesmo, via PATCH das fases). Havendo mais de um
// plano ativo, link "ver todos os planos". Sem plano ativo, este componente nao e
// renderizado pelo pai (nada de placeholder vazio).
export default function ActivePlanCard({ plans, isPt }: { plans: PlanRecord[]; isPt: boolean }) {
  // O mais recente (a API ja ordena por updated_at desc).
  const [phases, setPhases] = useState(plans[0]?.phases ?? [])
  const [saving, setSaving] = useState(false)
  const plan = plans[0]
  if (!plan) return null

  const progress = computeProgress(phases)
  const current  = phases[progress.currentPhaseIndex]

  async function toggle(actionIndex: number) {
    if (saving) return
    const next = togglePhaseAction(phases, progress.currentPhaseIndex, actionIndex)
    setPhases(next)                 // otimista
    setSaving(true)
    const updated = await patchPlan(plan.id, { phases: next })
    setSaving(false)
    if (!updated) setPhases(phases)  // reverte no erro (fail-safe, nao quebra a tela)
  }

  return (
    <div className="mx-auto max-w-2xl mb-5 rounded-xl border border-zinc-200 border-t-2 border-t-taime-500 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-taime-600 mb-0.5">
            {isPt ? 'Seu plano' : 'Your plan'}
          </p>
          <h3 className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2">{plan.title ?? (isPt ? 'Plano estratégico' : 'Strategic plan')}</h3>
          {plan.theme && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{plan.theme}</p>}
        </div>
        <Link href={PLANS_HREF} className="shrink-0 text-[11px] font-semibold text-taime-700 hover:text-taime-800 whitespace-nowrap">
          {plans.length > 1
            ? (isPt ? `Ver todos (${plans.length}) →` : `See all (${plans.length}) →`)
            : (isPt ? 'Abrir →' : 'Open →')}
        </Link>
      </div>

      <p className="text-[11px] text-zinc-500 tabular-nums mb-1.5">{progressText(phases, isPt)}</p>
      <ProgressBar done={progress.doneActions} total={progress.totalActions} />

      {current && (
        <div className="mt-3 rounded-lg bg-zinc-50 border border-zinc-100 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 mb-1.5">
            {isPt ? 'Fase atual' : 'Current phase'}
          </p>
          <PhaseDetail phase={current} isPt={isPt} onToggleAction={toggle} disabled={saving} />
        </div>
      )}

      {/* Exportacao compacta, sem competir com "Abrir/Ver todos" do topo */}
      <div className="mt-3 flex items-center justify-end">
        <ExportPlanButtons plan={plan} isPt={isPt} compact />
      </div>
    </div>
  )
}
