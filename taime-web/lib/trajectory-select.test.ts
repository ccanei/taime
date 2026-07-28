// Testes de trajectory-select (v4.8). Roda com Node 24 (strip de tipos nativo):
//   node lib/trajectory-select.test.ts
import assert from 'node:assert'
import { firstOfMonthUTC, yearDistribution, rebalanceByYear, selectTrajectoryChunks, scoreTieBreakSort, dominantThemeSlugs } from './trajectory-select.ts'

const NOW = new Date('2026-06-30T12:00:00Z')

// helper: cria um chunk minimo
function chunk(period: string, similarity: number, id = period + ':' + similarity) {
  return { id, period, similarity }
}
// helper com theme_slug e score (Part B)
function chunkX(period: string, similarity: number, theme_slug: string | null, score: number | null, id = period + ':' + similarity + ':' + theme_slug) {
  return { id, period, similarity, theme_slug, score }
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
  const { selected } = selectTrajectoryChunks(chunks, { now: NOW, totalCap: 8, recentMonths: 18, reservePct: 0.28 })
  const years = selected.map(c => c.period.slice(0, 4))
  assert.ok(years.includes('2026'), 'esperado 2026 (recente) presente; veio: ' + years.join(','))
  assert.ok(selected.length <= 8)
})
check('reserva degrada com graca quando nao ha material recente', () => {
  const chunks = [
    chunk('2021-01-01', .99), chunk('2021-02-01', .98),
    chunk('2019-01-01', .80), chunk('2016-01-01', .50),
  ]
  const { selected } = selectTrajectoryChunks(chunks, { now: NOW, totalCap: 4, recentMonths: 18, reservePct: 0.28 })
  // sem recentes: cai no rebalance puro, todos os anos aparecem
  assert.deepStrictEqual(new Set(selected.map(c => c.period.slice(0, 4))), new Set(['2016', '2019', '2021']))
})
check('recentes vem entre os selecionados', () => {
  const chunks = [
    chunk('2021-01-01', .99), chunk('2021-02-01', .98), chunk('2019-01-01', .80),
    chunk('2026-06-01', .40, 'now'),
  ]
  const { selected } = selectTrajectoryChunks(chunks, { now: NOW, totalCap: 4, recentMonths: 18, reservePct: 0.28 })
  assert.ok(selected.some(c => c.period.slice(0, 4) === '2026'), 'esperado 2026 presente')
})

// ── Part B: desempate por TAIME Score ────────────────────────────────────────
check('scoreTieBreakSort: score desempata dentro da mesma faixa de similaridade', () => {
  // duas trends com similaridade quase igual (0.90 vs 0.89, delta 0.04 -> mesma faixa):
  // a de MAIOR score vem primeiro. A de similaridade claramente maior (0.99) lidera.
  const chunks = [
    chunkX('2021-01-01', 0.90, 't1', 40, 'low-score'),
    chunkX('2022-01-01', 0.89, 't2', 95, 'high-score'),
    chunkX('2020-01-01', 0.99, 't3', 10, 'top-sim'),
  ]
  const out = scoreTieBreakSort(chunks, 0.04)
  assert.strictEqual(out[0].id, 'top-sim', 'similaridade claramente maior lidera')
  assert.strictEqual(out[1].id, 'high-score', 'na faixa empatada, maior score primeiro')
  assert.strictEqual(out[2].id, 'low-score')
})
check('scoreTieBreakSort: similaridade continua primaria (faixas diferentes nao invertem)', () => {
  // 0.99 (score 10) vs 0.80 (score 99): faixas diferentes -> 0.99 lidera apesar do score menor.
  const out = scoreTieBreakSort([chunkX('2020-01-01', 0.80, 'a', 99), chunkX('2021-01-01', 0.99, 'b', 10)], 0.04)
  assert.strictEqual(out[0].similarity, 0.99)
})

// ── Part B: espinha de theme_slug ────────────────────────────────────────────
check('dominantThemeSlugs identifica o tema mais frequente no topo', () => {
  const chunks = [
    chunkX('2026-01-01', .99, 'cyber', 80), chunkX('2025-01-01', .98, 'cyber', 80),
    chunkX('2024-01-01', .97, 'cyber', 80), chunkX('2023-01-01', .60, 'cloud', 50),
  ]
  assert.deepStrictEqual(dominantThemeSlugs(chunks), ['cyber'])
})
check('espinha do tema dominante presente e cronologica no resultado', () => {
  // tema "cyber" atravessa 2018..2026; distractors "cloud" pontuais.
  const cyber = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']
    .map((y, i) => chunkX(y + '-03-01', 0.95 - i * 0.001, 'cyber', 70, 'cy' + y))
  const cloud = [chunkX('2021-06-01', 0.999, 'cloud', 90, 'cl1'), chunkX('2022-06-01', 0.998, 'cloud', 90, 'cl2')]
  const { selected, spineSlugs } = selectTrajectoryChunks([...cloud, ...cyber], { now: NOW, totalCap: 8, recentMonths: 18, reservePct: 0.28 })
  assert.strictEqual(spineSlugs[0], 'cyber', 'cyber e o tema dominante (primeiro); veio: ' + JSON.stringify(spineSlugs))
  const cyberYears = selected.filter(c => c.theme_slug === 'cyber').map(c => c.period.slice(0, 4))
  // a espinha traz varios anos distintos de cyber (backbone do arco)
  assert.ok(new Set(cyberYears).size >= 4, 'espinha cyber com >=4 anos; veio: ' + cyberYears.join(','))
})
check('espinha degrada com graca quando nenhum tema se repete', () => {
  const chunks = [
    chunkX('2021-01-01', .99, 'a', 50), chunkX('2020-01-01', .90, 'b', 50),
    chunkX('2019-01-01', .80, 'c', 50), chunkX('2018-01-01', .70, 'd', 50),
  ]
  const { selected, spineSlugs } = selectTrajectoryChunks(chunks, { now: NOW, totalCap: 4, recentMonths: 18, reservePct: 0.28 })
  assert.deepStrictEqual(spineSlugs, [], 'nenhum tema dominante')
  assert.strictEqual(selected.length, 4, 'ainda seleciona pelo rebalance')
})
check('recencia vence espinha antiga: 2026 (baixa sim, fora do tema dominante) DEVE entrar', () => {
  // Regressao pos-e13b104: o tema dominante "cyber" vai ate 2025 (espinha termina
  // em 2025); 2026 existe em OUTRO theme_slug com similaridade BAIXA. A janela
  // recente e povoada por 2025 de alta similaridade. Uma reserva por similaridade
  // pura deixaria 2026 de fora; a reserva por ano DENTRO da janela recente garante.
  const cyber = ['2016', '2018', '2020', '2022', '2024', '2025']
    .map((y, i) => chunkX(y + '-06-01', 0.90 - i * 0.001, 'cyber', 75, 'cy' + y))
  const noise2025 = Array.from({ length: 5 }, (_, i) => chunkX('2025-0' + (i + 1) + '-01', 0.88 - i * 0.001, 'cyber', 75, 'n25_' + i))
  const now2026 = chunkX('2026-02-01', 0.40, 'emerging-2026', 60, 'now26') // baixa sim, tema diferente
  const { selected, spineSlugs } = selectTrajectoryChunks([...cyber, ...noise2025, now2026], { now: NOW, totalCap: 10, recentMonths: 18, reservePct: 0.28 })
  assert.strictEqual(spineSlugs[0], 'cyber', 'cyber e o tema dominante')
  assert.ok(selected.some(c => c.period.slice(0, 4) === '2026'), '2026 (recente, fora da espinha) DEVE entrar por recencia; veio: ' + selected.map(c => c.period.slice(0, 7)).join(','))
  // e o arco historico da espinha continua presente (2016 etc)
  assert.ok(selected.some(c => c.period.slice(0, 4) === '2016'), 'espinha historica preservada (2016)')
})
check('espinha consistente entre execucoes repetidas (mesma entrada -> mesma espinha)', () => {
  const mk = () => {
    const cyber = ['2019', '2021', '2023', '2025', '2026'].map((y, i) => chunkX(y + '-03-01', 0.9 - i * 0.001, 'cyber', 70, 'cy' + y))
    const noise = ['2020', '2022', '2024'].map((y, i) => chunkX(y + '-07-01', 0.95 - i * 0.001, 'noise' + y, 40, 'n' + y))
    return [...noise, ...cyber]
  }
  const a = selectTrajectoryChunks(mk(), { now: NOW, totalCap: 6, recentMonths: 18, reservePct: 0.28 })
  const b = selectTrajectoryChunks(mk(), { now: NOW, totalCap: 6, recentMonths: 18, reservePct: 0.28 })
  const spineA = a.selected.filter(c => c.theme_slug === 'cyber').map(c => c.id).sort()
  const spineB = b.selected.filter(c => c.theme_slug === 'cyber').map(c => c.id).sort()
  assert.deepStrictEqual(spineA, spineB, 'a espinha cyber e identica entre execucoes')
})

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { console.error('\n' + fails.join('\n')); process.exit(1) }
console.log('ALL PASS')
