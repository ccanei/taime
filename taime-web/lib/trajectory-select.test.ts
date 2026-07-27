// Testes de trajectory-select (v4.8). Roda com Node 24 (strip de tipos nativo):
//   node lib/trajectory-select.test.ts
import assert from 'node:assert'
import { firstOfMonthUTC, yearDistribution, rebalanceByYear, selectTrajectoryChunks } from './trajectory-select.ts'

const NOW = new Date('2026-06-30T12:00:00Z')

// helper: cria um chunk minimo
function chunk(period: string, similarity: number, id = period + ':' + similarity) {
  return { id, period, similarity }
}

let pass = 0
const fails: string[] = []
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log('OK  ' + name) }
  catch (e) { fails.push('XX  ' + name + '\n      ' + (e instanceof Error ? e.message : String(e))) }
}

// ── firstOfMonthUTC ──────────────────────────────────────────────────────────
check('firstOfMonthUTC 18 meses atras de jun/2026 = dez/2024', () => {
  assert.strictEqual(firstOfMonthUTC(NOW, 18), '2024-12-01')
})
check('firstOfMonthUTC 12 meses atras de jun/2026 = jun/2025', () => {
  assert.strictEqual(firstOfMonthUTC(NOW, 12), '2025-06-01')
})

// ── yearDistribution ─────────────────────────────────────────────────────────
check('yearDistribution conta e ordena por ano', () => {
  const d = yearDistribution([chunk('2020-01-01', .9), chunk('2020-05-01', .8), chunk('2018-03-01', .7)])
  assert.deepStrictEqual(d, { '2018': 1, '2020': 2 })
})

// ── rebalanceByYear ──────────────────────────────────────────────────────────
check('rebalanceByYear espalha por ano (round-robin cronologico)', () => {
  // 2021 domina (5), 2019 tem 2, 2016 tem 1. cap 4 -> um de cada ano primeiro.
  const chunks = [
    chunk('2021-01-01', .99), chunk('2021-02-01', .98), chunk('2021-03-01', .97),
    chunk('2021-04-01', .96), chunk('2021-05-01', .95),
    chunk('2019-01-01', .80), chunk('2019-02-01', .79),
    chunk('2016-01-01', .50),
  ]
  const out = rebalanceByYear(chunks, 4)
  const years = out.map(c => c.period.slice(0, 4))
  // rodada 0: 2016, 2019, 2021 (crescente). depois preenche.
  assert.deepStrictEqual(new Set(years), new Set(['2016', '2019', '2021']))
  assert.strictEqual(out.length, 4)
})
check('rebalanceByYear ano unico devolve top-N por ordem', () => {
  const chunks = [chunk('2021-01-01', .9), chunk('2021-02-01', .8), chunk('2021-03-01', .7)]
  const out = rebalanceByYear(chunks, 2)
  assert.strictEqual(out.length, 2)
  assert.strictEqual(out[0].period, '2021-01-01')
})

// ── selectTrajectoryChunks: reserva de recencia ──────────────────────────────
check('reserva de recencia garante vaga ao ano corrente afogado na similaridade', () => {
  // 2021/2022 dominam (alta similaridade); 2026 tem 2 chunks de baixa sim.
  const chunks = [
    ...Array.from({ length: 10 }, (_, i) => chunk('2021-0' + ((i % 9) + 1) + '-01', 0.99 - i * 0.001, 'a' + i)),
    ...Array.from({ length: 10 }, (_, i) => chunk('2022-0' + ((i % 9) + 1) + '-01', 0.95 - i * 0.001, 'b' + i)),
    chunk('2026-05-01', 0.60, 'now1'),
    chunk('2026-06-01', 0.58, 'now2'),
  ]
  const out = selectTrajectoryChunks(chunks, { now: NOW, totalCap: 8, recentMonths: 18, reservePct: 0.28 })
  const years = out.map(c => c.period.slice(0, 4))
  assert.ok(years.includes('2026'), 'esperado 2026 (recente) presente; veio: ' + years.join(','))
  assert.ok(out.length <= 8)
})
check('reserva degrada com graca quando nao ha material recente', () => {
  const chunks = [
    chunk('2021-01-01', .99), chunk('2021-02-01', .98),
    chunk('2019-01-01', .80), chunk('2016-01-01', .50),
  ]
  const out = selectTrajectoryChunks(chunks, { now: NOW, totalCap: 4, recentMonths: 18, reservePct: 0.28 })
  // sem recentes: cai no rebalance puro, todos os anos aparecem
  assert.deepStrictEqual(new Set(out.map(c => c.period.slice(0, 4))), new Set(['2016', '2019', '2021']))
})
check('recentes vem na frente da lista', () => {
  const chunks = [
    chunk('2021-01-01', .99), chunk('2021-02-01', .98), chunk('2019-01-01', .80),
    chunk('2026-06-01', .40, 'now'),
  ]
  const out = selectTrajectoryChunks(chunks, { now: NOW, totalCap: 4, recentMonths: 18, reservePct: 0.28 })
  assert.strictEqual(out[0].period.slice(0, 4), '2026')
})

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { console.error('\n' + fails.join('\n')); process.exit(1) }
console.log('ALL PASS')
