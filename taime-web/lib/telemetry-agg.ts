// ── Agregacao de telemetria LLM (llm_calls) ─────────────────────────────────
// Modulo PURO (sem DB): recebe as linhas cruas e devolve os agregados do painel
// /admin/telemetry. Testavel isoladamente. A pagina (server component) so busca
// via service key e chama aggregate().

// Precos por 1M tokens. MANTER EM SINCRONIA com llm-calls-queries.md e com a
// tabela oficial da Anthropic. cache_read ~= 10% do input; cache_write ~= 125%.
// Casa por PREFIXO (ex: 'claude-haiku-4-5-20251001' casa 'claude-haiku-4-5').
export const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8':   { in: 5.00, out: 25.00 },
  'claude-sonnet-5':   { in: 3.00, out: 15.00 },
  'claude-sonnet-4-6': { in: 3.00, out: 15.00 },
  'claude-haiku-4-5':  { in: 1.00, out: 5.00 },
}
const DEFAULT_PRICE = { in: 3.00, out: 15.00 } // fallback p/ modelo novo nao mapeado
const CACHE_READ_MULT  = 0.10
const CACHE_WRITE_MULT = 1.25

function priceFor(model: string): { in: number; out: number } {
  for (const prefix of Object.keys(PRICING)) {
    if (model.startsWith(prefix)) return PRICING[prefix]
  }
  return DEFAULT_PRICE
}

export interface LlmCallRow {
  created_at:         string
  caller:             string
  model:              string
  input_tokens:       number | null
  output_tokens:      number | null
  cache_read_tokens:  number | null
  cache_write_tokens: number | null
  latency_ms:         number | null
  success:            boolean
  error_code:         string | null
  user_id:            string | null
  meta:               { step?: string } | null
}

export function costOf(row: LlmCallRow): number {
  const p = priceFor(row.model)
  return (row.input_tokens       ?? 0) / 1e6 * p.in
       + (row.cache_read_tokens  ?? 0) / 1e6 * p.in * CACHE_READ_MULT
       + (row.cache_write_tokens ?? 0) / 1e6 * p.in * CACHE_WRITE_MULT
       + (row.output_tokens      ?? 0) / 1e6 * p.out
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.ceil(p * sortedAsc.length) - 1)
  return sortedAsc[Math.max(0, idx)]
}

export interface TelemetryAgg {
  cards: {
    costToday: number; cost7d: number; cost30d: number; errRate7d: number
    calls30d: number; calls7d: number
  }
  byCaller: Array<{
    caller: string; calls: number; inTok: number; outTok: number
    cacheRead: number; cost: number; pct: number
  }>
  advisorByUser: Array<{ userId: string; messages: number; inTok: number; outTok: number; cost: number }>
  health: Array<{
    caller: string; calls: number; p50: number; p95: number
    successRate: number; lastError: { code: string; at: string } | null
  }>
  timeline: Array<{ date: string; cost: number }>
}

// `nowMs` injetado para determinismo/testes. Assume que `rows` ja vem dos ultimos
// 30 dias (a query limita); recalcula as janelas internas mesmo assim.
export function aggregate(rows: LlmCallRow[], nowMs: number): TelemetryAgg {
  const DAY = 86_400_000
  const startOfTodayUtc = Date.UTC(
    new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate(),
  )
  const cut7  = nowMs - 7 * DAY
  const cut30 = nowMs - 30 * DAY
  const cut14 = nowMs - 14 * DAY

  let costToday = 0, cost7d = 0, cost30d = 0
  let calls7d = 0, calls30d = 0, err7d = 0

  // by caller (30d)
  const caller = new Map<string, { calls: number; inTok: number; outTok: number; cacheRead: number; cost: number }>()
  // advisor by user (30d)
  const user = new Map<string, { messages: number; inTok: number; outTok: number; cost: number }>()
  // health by caller (30d): latencias, sucesso, ultimo erro
  const health = new Map<string, { calls: number; lat: number[]; ok: number; lastError: { code: string; at: string } | null }>()
  // timeline (14d): custo por dia
  const timeline = new Map<string, number>()

  for (const r of rows) {
    const t = Date.parse(r.created_at)
    if (Number.isNaN(t) || t < cut30) continue
    const c = costOf(r)
    cost30d += c; calls30d++
    if (t >= startOfTodayUtc) costToday += c
    if (t >= cut7) { cost7d += c; calls7d++; if (!r.success) err7d++ }

    // by caller
    const cc = caller.get(r.caller) ?? { calls: 0, inTok: 0, outTok: 0, cacheRead: 0, cost: 0 }
    cc.calls++; cc.inTok += r.input_tokens ?? 0; cc.outTok += r.output_tokens ?? 0
    cc.cacheRead += r.cache_read_tokens ?? 0; cc.cost += c
    caller.set(r.caller, cc)

    // health
    const hh = health.get(r.caller) ?? { calls: 0, lat: [], ok: 0, lastError: null }
    hh.calls++
    if (typeof r.latency_ms === 'number') hh.lat.push(r.latency_ms)
    if (r.success) hh.ok++
    else if (!hh.lastError || r.created_at > hh.lastError.at) hh.lastError = { code: r.error_code ?? 'erro', at: r.created_at }
    health.set(r.caller, hh)

    // advisor unit economics
    if (r.caller === 'advisor' && r.user_id) {
      const uu = user.get(r.user_id) ?? { messages: 0, inTok: 0, outTok: 0, cost: 0 }
      if (r.meta?.step === 'main') uu.messages++
      uu.inTok += r.input_tokens ?? 0; uu.outTok += r.output_tokens ?? 0; uu.cost += c
      user.set(r.user_id, uu)
    }

    // timeline (14d)
    if (t >= cut14) {
      const day = r.created_at.slice(0, 10)
      timeline.set(day, (timeline.get(day) ?? 0) + c)
    }
  }

  const byCaller = [...caller.entries()]
    .map(([name, v]) => ({ caller: name, calls: v.calls, inTok: v.inTok, outTok: v.outTok, cacheRead: v.cacheRead, cost: v.cost, pct: cost30d > 0 ? (v.cost / cost30d) * 100 : 0 }))
    .sort((a, b) => b.cost - a.cost)

  const advisorByUser = [...user.entries()]
    .map(([userId, v]) => ({ userId, messages: v.messages, inTok: v.inTok, outTok: v.outTok, cost: v.cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 20)

  const healthRows = [...health.entries()]
    .map(([name, v]) => {
      const sorted = [...v.lat].sort((a, b) => a - b)
      return { caller: name, calls: v.calls, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), successRate: v.calls > 0 ? (v.ok / v.calls) * 100 : 100, lastError: v.lastError }
    })
    .sort((a, b) => b.calls - a.calls)

  // timeline: 14 dias contiguos (preenche zeros), mais antigo -> mais novo.
  const timelineRows: Array<{ date: string; cost: number }> = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowMs - i * DAY).toISOString().slice(0, 10)
    timelineRows.push({ date: d, cost: timeline.get(d) ?? 0 })
  }

  return {
    cards: { costToday, cost7d, cost30d, errRate7d: calls7d > 0 ? (err7d / calls7d) * 100 : 0, calls30d, calls7d },
    byCaller,
    advisorByUser,
    health: healthRows,
    timeline: timelineRows,
  }
}
