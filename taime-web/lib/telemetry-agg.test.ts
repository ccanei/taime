// Teste da agregacao de telemetria. node lib/telemetry-agg.test.ts
import assert from 'node:assert'
import { aggregate, costOf, PRICING, type LlmCallRow } from './telemetry-agg.ts'

const NOW = Date.parse('2026-08-03T12:00:00Z')
const iso = (daysAgo: number, h = 1) => new Date(NOW - daysAgo * 86_400_000 + h * 3600_000).toISOString()

function row(p: Partial<LlmCallRow>): LlmCallRow {
  return {
    created_at: iso(0), caller: 'generate', model: 'claude-sonnet-4-6',
    input_tokens: 1000, output_tokens: 500, cache_read_tokens: 0, cache_write_tokens: 0,
    latency_ms: 2000, success: true, error_code: null, user_id: null, meta: null, ...p,
  }
}

let pass = 0; const fails: string[] = []
const check = (n: string, fn: () => void) => { try { fn(); pass++; console.log('OK  ' + n) } catch (e) { fails.push('XX ' + n + '\n   ' + (e instanceof Error ? e.message : e)) } }

check('costOf: sonnet 1M in + 1M out = 3 + 15 = 18', () => {
  assert.strictEqual(costOf(row({ input_tokens: 1e6, output_tokens: 1e6 })), 18)
})
check('costOf: cache_read a 10% do input', () => {
  // haiku in=1/M; 1M cache_read => 0.10
  assert.ok(Math.abs(costOf(row({ model: 'claude-haiku-4-5', input_tokens: 0, output_tokens: 0, cache_read_tokens: 1e6 })) - 0.10) < 1e-9)
})
check('modelo com sufixo de data casa pelo prefixo', () => {
  assert.strictEqual(costOf(row({ model: 'claude-haiku-4-5-20251001', input_tokens: 1e6, output_tokens: 0 })), 1)
})

const rows: LlmCallRow[] = [
  row({ caller: 'generate', created_at: iso(0),  input_tokens: 200000, output_tokens: 50000, latency_ms: 20000 }),
  row({ caller: 'validate', created_at: iso(1),  input_tokens: 100000, output_tokens: 10000, latency_ms: 8000 }),
  row({ caller: 'advisor', created_at: iso(0), model: 'claude-sonnet-5', input_tokens: 5000, output_tokens: 800, latency_ms: 12000, user_id: 'u1', meta: { step: 'main' } }),
  row({ caller: 'advisor', created_at: iso(0), model: 'claude-haiku-4-5', input_tokens: 2000, output_tokens: 100, latency_ms: 900, user_id: 'u1', meta: { step: 'refine' } }),
  row({ caller: 'advisor', created_at: iso(2), model: 'claude-sonnet-5', input_tokens: 6000, output_tokens: 900, latency_ms: 40000, user_id: 'u2', meta: { step: 'main' } }),
  row({ caller: 'ask', created_at: iso(3), model: 'claude-sonnet-5', input_tokens: 4000, output_tokens: 600, latency_ms: 9000, success: false, error_code: 'http_502' }),
]

const agg = aggregate(rows, NOW)

check('cards: cost30d = soma de todos', () => {
  const total = rows.reduce((s, r) => s + costOf(r), 0)
  assert.ok(Math.abs(agg.cards.cost30d - total) < 1e-9)
  assert.ok(agg.cards.costToday > 0 && agg.cards.cost7d > 0)
})
check('cards: taxa de erro 7d = 1/6', () => {
  assert.ok(Math.abs(agg.cards.errRate7d - (1 / 6) * 100) < 1e-6)
})
check('byCaller ordenado por custo desc e soma 100%', () => {
  const pcts = agg.byCaller.reduce((s, c) => s + c.pct, 0)
  assert.ok(Math.abs(pcts - 100) < 1e-6)
  for (let i = 1; i < agg.byCaller.length; i++) assert.ok(agg.byCaller[i - 1].cost >= agg.byCaller[i].cost)
})
check('advisorByUser: u1 tem 1 mensagem (so main conta), inclui tokens do refine', () => {
  const u1 = agg.advisorByUser.find(u => u.userId === 'u1')!
  assert.strictEqual(u1.messages, 1)
  assert.strictEqual(u1.inTok, 7000) // 5000 main + 2000 refine
})
check('health: advisor p95 alto (40s) capturado; ask com erro registrado', () => {
  const adv = agg.health.find(h => h.caller === 'advisor')!
  assert.ok(adv.p95 >= 12000)
  const ask = agg.health.find(h => h.caller === 'ask')!
  assert.strictEqual(ask.successRate, 0)
  assert.strictEqual(ask.lastError?.code, 'http_502')
})
check('timeline: 14 dias contiguos', () => {
  assert.strictEqual(agg.timeline.length, 14)
})
check('vazio: aggregate([]) nao quebra', () => {
  const e = aggregate([], NOW)
  assert.strictEqual(e.cards.cost30d, 0)
  assert.strictEqual(e.byCaller.length, 0)
  assert.strictEqual(e.timeline.length, 14)
})

console.log(`\n${pass} passed, ${fails.length} failed`)
console.log('PRICING models:', Object.keys(PRICING).join(', '))
if (fails.length) { console.error('\n' + fails.join('\n')); process.exit(1) }
console.log('ALL PASS')
