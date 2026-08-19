import { logLlmCall, usageTokens } from '@/lib/llm-telemetry'
import { normalizePhases, type PlanPhase } from '@/lib/advisor-plan'

// Extracao estruturada do roadmap que o Advisor entrega, para virar um plano salvo
// (Fase 2.1). FORA do caminho critico da resposta: chamada Haiku com timeout e
// fail-safe. Se qualquer coisa falhar, retorna null e nenhum plano e oferecido; a
// resposta ao cliente NUNCA e alterada por isto.

export type { PlanActionStatus, PlanAction, PlanPhase } from '@/lib/advisor-plan'
export interface PlanOffer {
  title:  string
  theme:  string
  phases: PlanPhase[]
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const EXTRACT_MODEL  = 'claude-haiku-4-5'

// Heuristica barata: so vale a chamada Haiku se a resposta PARECE um roadmap. Dois
// caminhos, ambos conservadores (nao ofertar plano em resposta que nao e roadmap):
//   1) TABELA: o Advisor (v5.3) entrega roadmaps copiaveis em tabela markdown
//      (Horizonte | Decidir | Iniciar | Nao fazer | Criterio de saida). Detectamos a
//      ESTRUTURA da tabela, nao os rotulos de horizonte, que variam ("Agora",
//      "Proximo trimestre"). Robusto a fraseado; foi o gap que deixou a oferta sumir.
//   2) PROSA/LISTA: fases com horizonte + criterio de saida + o que nao fazer.
//      Exige >= 2 sinais DISTINTOS.
const ROADMAP_CUES = /(\bfase\s*\d|\bphase\s*\d|0\s*[-a]\s*3\s*(?:meses|months)|3\s*[-a]\s*6\s*(?:meses|months)|6\s*[-a]\s*12\s*(?:meses|months)|90\s*dias|90\s*days|curto\s+prazo|m[eé]dio\s+prazo|longo\s+prazo|short\s+term|medium\s+term|long\s+term|crit[eé]rio\s+de\s+sa[ií]da|exit\s+criteria|o\s+que\s+n[aã]o\s+fazer|what\s+not\s+to\s+do|\broadmap\b)/gi

// Termos de coluna de uma tabela de roadmap (case-insensitive, PT + EN).
const COL_HORIZON = /horizonte|horizon|prazo|timeframe|time frame|per[ií]odo|quando|\bwhen\b|\bfase\b|\bphase\b/
const COL_DECIDE  = /decid|decis|decide|decision/
const COL_ACTION  = /iniciar|a[çc][aã]o|a[çc][õo]es|\bacao\b|\baction\b|\bstart\b|fazer agora|do now|\bto do\b/
const COL_AVOID   = /n[aã]o fazer|ainda n[aã]o|\bn[aã]o\b.*\bainda\b|evit|avoid|not yet|don'?t|do not/
const COL_EXIT    = /crit[eé]rio|sa[ií]da|\bexit\b|done when|definition of done|conclu[ií]|complete when/

// Detecta uma tabela markdown de roadmap: uma linha-cabecalho com coluna de horizonte
// + ao menos 2 colunas de roadmap (decidir/iniciar/nao-fazer/criterio). Conservador:
// uma tabela comum (ex: comparacao de ferramentas) nao casa horizonte + essas colunas.
function detectRoadmapTable(text: string): boolean {
  for (const line of text.split('\n')) {
    if ((line.match(/\|/g)?.length ?? 0) < 3) continue   // precisa de tabela multi-coluna
    const joined = line.toLowerCase()
    if (!COL_HORIZON.test(joined)) continue
    let cols = 0
    if (COL_DECIDE.test(joined)) cols++
    if (COL_ACTION.test(joined)) cols++
    if (COL_AVOID.test(joined))  cols++
    if (COL_EXIT.test(joined))   cols++
    if (cols >= 2) return true
  }
  return false
}

export interface RoadmapDetection { matched: boolean; via: 'table' | 'cues' | null; cues: string[] }

// Resultado detalhado (para observabilidade: plan_detection no context_metadata).
export function detectRoadmap(text: string): RoadmapDetection {
  if (!text || text.length < 200) return { matched: false, via: null, cues: [] }
  if (detectRoadmapTable(text)) return { matched: true, via: 'table', cues: ['markdown_table'] }
  const m = text.match(ROADMAP_CUES)
  const cues = m ? [...new Set(m.map(s => s.toLowerCase().replace(/\s+/g, ' ').trim()))] : []
  return cues.length >= 2 ? { matched: true, via: 'cues', cues } : { matched: false, via: null, cues }
}

export function looksLikeRoadmap(text: string): boolean {
  return detectRoadmap(text).matched
}

function asStr(v: unknown): string { return typeof v === 'string' ? v.trim() : '' }

// Valida e normaliza a estrutura extraida. Retorna null se nao houver ao menos uma
// fase com ao menos uma acao (nao ofertar plano vazio). A normalizacao das fases
// e compartilhada (lib/advisor-plan) com a rota de edicao da 2.2.
export function normalizeOffer(raw: unknown): PlanOffer | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.roadmap === false) return null
  const phases = normalizePhases(o.phases)
  if (phases.length === 0) return null
  return { title: asStr(o.title) || 'Plano estratégico', theme: asStr(o.theme), phases }
}

const SYS = `You extract a STRATEGIC ROADMAP from an executive advisor's answer into strict JSON. The roadmap has phases (each with a time horizon), action items, what NOT to do, and an exit criterion.

The roadmap may appear as prose, as a list, OR as a MARKDOWN TABLE. The table usually has columns like: Horizonte/Horizon (the phase label), Decidir/Decide and Iniciar/Start (the actions), Nao fazer/Ainda nao/Avoid (what NOT to do), and Criterio de saida/Exit criteria. When it is a table:
- Each ROW is one phase. Use the horizon cell (e.g. "Agora", "Proximo trimestre", "6 a 12 meses") as the phase "label".
- Merge the Decidir and Iniciar (decide/start/action) cells into "actions" (one action per distinct item; split on sentence or clear list boundaries).
- Map the Nao fazer / Ainda nao / Avoid cell to "avoid".
- Map the Criterio de saida / Exit criteria cell to "exitCriteria".

Rules:
- Extract ONLY what is present in the answer. Do NOT invent phases, actions, horizons or criteria.
- If the answer does NOT contain a real phased roadmap (phases with a horizon and concrete actions), return exactly {"roadmap": false}.
- Every action item status is "todo".
- Never use the em dash character; use a hyphen or a comma.
- Output ONLY the JSON object, nothing else.

Shape when it IS a roadmap:
{
  "roadmap": true,
  "title": "<= 8 words, plan title in the answer's language>",
  "theme": "2 to 5 words, main theme in the answer's language",
  "phases": [
    {
      "label": "phase name with its horizon, e.g. 'Fase 1: Fundacao (0-3 meses)'",
      "actions": [ { "text": "action item", "status": "todo" } ],
      "avoid": [ "what not to do" ],
      "exitCriteria": "the exit criterion for this phase"
    }
  ]
}`

// Extrai o roadmap via Haiku. Fail-safe: qualquer erro retorna null (sem log de
// stacktrace ruidoso; loga o motivo curto). O caller SEMPRE segue normal.
export async function extractRoadmap(
  reply: string,
  opts: { userId: string; sessionId: string },
): Promise<PlanOffer | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const t0 = Date.now()
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      EXTRACT_MODEL,
        max_tokens: 1600,
        system:     SYS,
        messages:   [{ role: 'user', content: `ADVISOR ANSWER:\n\n${reply}` }],
      }),
    })
    const data = await res.json() as { content?: Array<{ type: string; text: string }>; usage?: Record<string, number> }
    logLlmCall({ caller: 'advisor', model: EXTRACT_MODEL, ...usageTokens(data?.usage ?? null), latency_ms: Date.now() - t0, success: res.ok, error_code: res.ok ? null : 'api_error', user_id: opts.userId, meta: { step: 'plan_extract', session_id: opts.sessionId } })
    if (!res.ok) return null
    const text = (data.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('').trim()
    const jsonStr = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    let parsed: unknown
    try { parsed = JSON.parse(jsonStr) } catch { return null }
    return normalizeOffer(parsed)
  } catch (e) {
    console.error('[advisor-plan-extract] falhou (ignorado, nao afeta a resposta):', e instanceof Error ? e.message : e)
    return null
  }
}
