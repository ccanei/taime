'use client'

import { computeProgress, type PlanPhase, type PlanAction } from '@/lib/advisor-plan'

// Pecas presentacionais compartilhadas do plano salvo (Fase 2.2): usadas no card da
// aba Inicio, no painel de contexto, na pagina de planos e no card do dashboard.

export function progressText(phases: PlanPhase[], isPt: boolean): string {
  const p = computeProgress(phases)
  if (p.phaseCount === 0) return ''
  const phasePart = isPt
    ? `Fase ${p.currentPhaseIndex + 1} de ${p.phaseCount}`
    : `Phase ${p.currentPhaseIndex + 1} of ${p.phaseCount}`
  const actionsPart = isPt
    ? `${p.doneActions} de ${p.totalActions} ${p.totalActions === 1 ? 'ação concluída' : 'ações concluídas'}`
    : `${p.doneActions} of ${p.totalActions} ${p.totalActions === 1 ? 'action done' : 'actions done'}`
  return `${phasePart} · ${actionsPart}`
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden" role="progressbar"
      aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
      <div className="h-full rounded-full bg-taime-500 transition-all duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
)

// Linha de acao com toggle (checkbox). readOnly desabilita o clique (leitura pura).
export function ActionRow({ action, onToggle, disabled, readOnly }: {
  action: PlanAction; onToggle?: () => void; disabled?: boolean; readOnly?: boolean
}) {
  const done = action.status === 'done'
  const box = (
    <span className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors
      ${done ? 'bg-taime-600 border-taime-600 text-white' : 'border-zinc-300 group-hover:border-taime-400'}`}>
      {done && <CheckIcon />}
    </span>
  )
  const label = (
    <span className={`text-xs leading-snug ${done ? 'text-zinc-400 line-through' : 'text-zinc-700'}`}>{action.text}</span>
  )
  if (readOnly) {
    return <div className="flex items-start gap-2 py-1">{box}{label}</div>
  }
  return (
    <button type="button" onClick={onToggle} disabled={disabled}
      className="group flex items-start gap-2 text-left w-full py-1 disabled:opacity-60 disabled:cursor-wait">
      {box}{label}
    </button>
  )
}

// Detalhe completo de UMA fase: rotulo, acoes (toggle), o que nao fazer, criterio de
// saida. Usada na pagina de planos e no card da aba Inicio (fase atual).
export function PhaseDetail({ phase, isPt, onToggleAction, disabled, readOnly, dim }: {
  phase: PlanPhase; isPt: boolean
  onToggleAction?: (actionIndex: number) => void
  disabled?: boolean; readOnly?: boolean; dim?: boolean
}) {
  return (
    <div className={dim ? 'opacity-70' : ''}>
      <p className="text-xs font-bold text-zinc-800 mb-1.5">{phase.label}</p>
      <div className="flex flex-col">
        {phase.actions.map((a, i) => (
          <ActionRow key={i} action={a} readOnly={readOnly} disabled={disabled}
            onToggle={onToggleAction ? () => onToggleAction(i) : undefined} />
        ))}
      </div>
      {phase.avoid.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700/80 mb-1">
            {isPt ? 'Não fazer ainda' : 'Not yet'}
          </p>
          <ul className="flex flex-col gap-0.5">
            {phase.avoid.map((v, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-500 leading-snug">
                <span className="mt-1 shrink-0 w-1 h-1 rounded-full bg-amber-400" />{v}
              </li>
            ))}
          </ul>
        </div>
      )}
      {phase.exitCriteria && (
        <p className="mt-2 text-[11px] text-zinc-500 leading-snug">
          <span className="font-semibold text-zinc-600">{isPt ? 'Critério de saída: ' : 'Exit criterion: '}</span>
          {phase.exitCriteria}
        </p>
      )}
    </div>
  )
}

// Toggle imutavel do status de uma acao (todo <-> done) numa copia das fases.
export function togglePhaseAction(phases: PlanPhase[], phaseIndex: number, actionIndex: number): PlanPhase[] {
  return phases.map((p, pi) => pi !== phaseIndex ? p : {
    ...p,
    actions: p.actions.map((a, ai) => ai !== actionIndex ? a : { ...a, status: a.status === 'done' ? 'todo' : 'done' }),
  })
}

// PATCH das fases de um plano. Retorna o plano atualizado ou null (fail-safe).
export async function patchPlan(id: string, body: { status?: string; phases?: PlanPhase[] }): Promise<any | null> {
  try {
    const r = await fetch(`/api/advisor/plans/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) return null
    return (await r.json()).plan ?? null
  } catch { return null }
}
