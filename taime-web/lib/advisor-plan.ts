// Tipos + helpers PUROS do plano salvo do Advisor (Fase 2.1/2.2). SEM imports
// server-side: seguro para client e server. A extracao (lib/advisor-plan-extract,
// server-only) reusa normalizePhases daqui para nao duplicar a validacao.

export type PlanActionStatus = 'todo' | 'doing' | 'done'
export interface PlanAction {
  text:       string
  status:     PlanActionStatus
  // Camada de DIMENSIONAMENTO (opcional; ausente em planos antigos e em roadmaps sem
  // dados de time). Nunca presumidos: so existem quando o Advisor os dimensionou a
  // partir dos dados reais do cliente. Strings livres (o modelo escreve o valor
  // humano: "16h", "3 dias", faixa etc.), idioma-neutras no espirito do formato.
  effort?:    string          // esforco estimado, ex: "16h" ou "3 dias"
  role?:      string          // papel que executa (FUNCAO, nunca nome de pessoa)
  dependsOn?: string          // dependencia: comeca depois de qual outra acao
}
export interface PlanPhase {
  label:        string        // rotulo + horizonte, ex: "Fase 1: Fundacao (0-3 meses)"
  actions:      PlanAction[]  // itens de acao, com status por item
  avoid:        string[]      // o que NAO fazer
  exitCriteria: string        // criterio de saida
  // Investimento estimado da fase = soma dos esforcos x custo-hora do cliente,
  // sempre como FAIXA ou cenarios (nunca ponto unico fechado). Opcional: so quando
  // o cliente forneceu custo-hora. Nunca faixa de mercado inventada.
  investment?:  string
}
export type PlanStatus = 'active' | 'archived' | 'completed'
export interface PlanRecord {
  id:         string
  title:      string | null
  theme:      string | null
  phases:     PlanPhase[]
  status:     PlanStatus
  session_id: string | null
  created_at: string
  updated_at: string
}

function asStr(v: unknown): string { return typeof v === 'string' ? v.trim() : '' }
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(asStr).filter(Boolean) : []
}
function asStatus(v: unknown): PlanActionStatus {
  return v === 'doing' || v === 'done' ? v : 'todo'
}
// Campo opcional de dimensionamento: string aparada ou undefined (nunca '' nem null).
// Assim o jsonb nao carrega chave vazia e a UI/export nunca mostram campo em branco.
function asOptStr(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : undefined
}

// Valida/normaliza um array de fases (jsonb). Descarta fases sem label ou sem acoes.
// Preserva o status de cada acao (todo/doing/done), essencial para o toggle da 2.2.
// Carrega a camada opcional de dimensionamento (effort/role/dependsOn por acao,
// investment por fase) quando presente; ausente, o campo simplesmente nao aparece,
// entao planos antigos e roadmaps sem dimensionamento seguem validos.
export function normalizePhases(raw: unknown): PlanPhase[] {
  const arr = Array.isArray(raw) ? raw : []
  return arr.map(p => {
    const ph = (p ?? {}) as Record<string, unknown>
    const actions = (Array.isArray(ph.actions) ? ph.actions : []).map(a => {
      const ac = (a ?? {}) as Record<string, unknown>
      const action: PlanAction = { text: asStr(ac.text), status: asStatus(ac.status) }
      const effort = asOptStr(ac.effort);       if (effort)    action.effort = effort
      const role = asOptStr(ac.role);           if (role)      action.role = role
      const dependsOn = asOptStr(ac.dependsOn); if (dependsOn) action.dependsOn = dependsOn
      return action
    }).filter(a => a.text)
    const phase: PlanPhase = {
      label:        asStr(ph.label),
      actions,
      avoid:        asStrArr(ph.avoid),
      exitCriteria: asStr(ph.exitCriteria),
    }
    const investment = asOptStr(ph.investment); if (investment) phase.investment = investment
    return phase
  }).filter(p => p.label && p.actions.length > 0)
}

export interface PlanProgress {
  phaseCount:        number
  currentPhaseIndex: number   // primeira fase com acao pendente; se tudo feito, a ultima
  totalActions:      number
  doneActions:       number
  allDone:           boolean
}

// Progresso derivado das fases. Fase atual = a primeira com alguma acao ainda nao
// concluida (se todas concluidas, a ultima fase).
export function computeProgress(phases: PlanPhase[]): PlanProgress {
  const phaseCount = phases.length
  let totalActions = 0, doneActions = 0
  for (const p of phases) {
    for (const a of (p.actions ?? [])) { totalActions++; if (a.status === 'done') doneActions++ }
  }
  let currentPhaseIndex = phases.findIndex(p => (p.actions ?? []).some(a => a.status !== 'done'))
  if (currentPhaseIndex === -1) currentPhaseIndex = Math.max(0, phaseCount - 1)
  return { phaseCount, currentPhaseIndex, totalActions, doneActions, allDone: totalActions > 0 && doneActions === totalActions }
}
