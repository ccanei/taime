import { logLlmCall, usageTokens } from '@/lib/llm-telemetry'

// Extracao estruturada do roadmap que o Advisor entrega, para virar um plano salvo
// (Fase 2.1). FORA do caminho critico da resposta: chamada Haiku com timeout e
// fail-safe. Se qualquer coisa falhar, retorna null e nenhum plano e oferecido; a
// resposta ao cliente NUNCA e alterada por isto.

export type PlanActionStatus = 'todo' | 'doing' | 'done'
export interface PlanAction { text: string; status: PlanActionStatus }
export interface PlanPhase {
  label:        string          // rotulo + horizonte, ex: "Fase 1: Fundacao (0-3 meses)"
  actions:      PlanAction[]    // itens de acao, com status por item
  avoid:        string[]        // o que NAO fazer
  exitCriteria: string          // criterio de saida
}
export interface PlanOffer {
  title:  string
  theme:  string
  phases: PlanPhase[]
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const EXTRACT_MODEL  = 'claude-haiku-4-5'

// Heuristica barata: so vale a chamada Haiku se a resposta PARECE um roadmap
// (fases com horizonte, criterio de saida, o que nao fazer). Precisa de >= 2 sinais
// DISTINTOS para reduzir falso-positivo. Sem sinal -> nenhuma chamada, custo zero.
const ROADMAP_CUES = /(\bfase\s*\d|\bphase\s*\d|0\s*[-a]\s*3\s*(?:meses|months)|3\s*[-a]\s*6\s*(?:meses|months)|6\s*[-a]\s*12\s*(?:meses|months)|90\s*dias|90\s*days|curto\s+prazo|m[eé]dio\s+prazo|longo\s+prazo|short\s+term|medium\s+term|long\s+term|crit[eé]rio\s+de\s+sa[ií]da|exit\s+criteria|o\s+que\s+n[aã]o\s+fazer|what\s+not\s+to\s+do|\broadmap\b)/gi

export function looksLikeRoadmap(text: string): boolean {
  if (!text || text.length < 200) return false
  const m = text.match(ROADMAP_CUES)
  if (!m) return false
  const distinct = new Set(m.map(s => s.toLowerCase().replace(/\s+/g, ' ').trim()))
  return distinct.size >= 2
}

function asStr(v: unknown): string { return typeof v === 'string' ? v.trim() : '' }
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(asStr).filter(Boolean) : []
}
function asStatus(v: unknown): PlanActionStatus {
  return v === 'doing' || v === 'done' ? v : 'todo'
}

// Valida e normaliza a estrutura extraida. Retorna null se nao houver ao menos uma
// fase com ao menos uma acao (nao ofertar plano vazio).
export function normalizeOffer(raw: unknown): PlanOffer | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.roadmap === false) return null
  const phasesRaw = Array.isArray(o.phases) ? o.phases : []
  const phases: PlanPhase[] = phasesRaw.map(p => {
    const ph = (p ?? {}) as Record<string, unknown>
    const actions = (Array.isArray(ph.actions) ? ph.actions : []).map(a => {
      const ac = (a ?? {}) as Record<string, unknown>
      return { text: asStr(ac.text), status: asStatus(ac.status) }
    }).filter(a => a.text)
    return {
      label:        asStr(ph.label),
      actions,
      avoid:        asStrArr(ph.avoid),
      exitCriteria: asStr(ph.exitCriteria),
    }
  }).filter(p => p.label && p.actions.length > 0)
  if (phases.length === 0) return null
  return { title: asStr(o.title) || 'Plano estratégico', theme: asStr(o.theme), phases }
}

const SYS = `You extract a STRATEGIC ROADMAP from an executive advisor's answer into strict JSON. The roadmap has phases (each with a time horizon), action items, what NOT to do, and an exit criterion.

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
