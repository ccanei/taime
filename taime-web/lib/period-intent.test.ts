// Testes unitarios de detectPeriodIntent (v4.7). Sem framework: roda com Node 24
// (strip de tipos nativo). Do diretorio taime-web:  node lib/period-intent.test.ts
// Sai com codigo != 0 se qualquer caso falhar, para travar CI/commit.
import assert from 'node:assert'
import { detectPeriodIntent, type PeriodIntent } from './period-intent.ts'

// Data fixa para os casos relativos ("this month" etc.) serem deterministicos.
const NOW = new Date('2026-06-30T12:00:00Z')

interface Case { msg: string; want: PeriodIntent | null; note: string }

const cases: Case[] = [
  // ── BUG CRITICO: piso aberto "desde X" / "de X ate hoje" (PT + EN) ──────────
  { msg: 'desde 2016',                    want: { kind: 'floor', from: '2016-01-01' }, note: 'desde YYYY -> piso aberto' },
  { msg: 'desde 2016 ate hoje',           want: { kind: 'floor', from: '2016-01-01' }, note: 'desde YYYY ate hoje' },
  { msg: 'de 2016 ate hoje',              want: { kind: 'floor', from: '2016-01-01' }, note: 'de YYYY ate hoje' },
  { msg: 'a partir de 2016',              want: { kind: 'floor', from: '2016-01-01' }, note: 'a partir de YYYY' },
  { msg: 'since 2016',                    want: { kind: 'floor', from: '2016-01-01' }, note: 'since YYYY' },
  { msg: 'from 2016 to today',            want: { kind: 'floor', from: '2016-01-01' }, note: 'from YYYY to today' },
  { msg: '2016 ate hoje',                 want: { kind: 'floor', from: '2016-01-01' }, note: 'YYYY ate hoje (nu)' },
  { msg: '2016 em diante',                want: { kind: 'floor', from: '2016-01-01' }, note: 'YYYY em diante' },
  { msg: 'como cloud evoluiu desde 2021?', want: { kind: 'floor', from: '2021-01-01' }, note: 'trajetoria desde YYYY' },
  { msg: 'how did cloud evolve since 2019', want: { kind: 'floor', from: '2019-01-01' }, note: 'EN trajetoria since' },

  // ── Intervalo FECHADO: ambas as pontas ──────────────────────────────────────
  { msg: 'entre 2016 e 2020',   want: { kind: 'range', from: '2016-01-01', to: '2020-12-01' }, note: 'entre X e Y (fechado)' },
  { msg: 'entre 2017 e 2025',   want: { kind: 'range', from: '2017-01-01', to: '2025-12-01' }, note: 'entre 2017 e 2025 (fechado)' },
  { msg: 'de 2018 a 2021',      want: { kind: 'range', from: '2018-01-01', to: '2021-12-01' }, note: 'de X a Y (fechado)' },
  { msg: 'from 2019 to 2022',   want: { kind: 'range', from: '2019-01-01', to: '2022-12-01' }, note: 'from X to Y (fechado)' },
  { msg: '2020-2023',           want: { kind: 'range', from: '2020-01-01', to: '2023-12-01' }, note: 'YYYY-YYYY (fechado)' },
  { msg: 'desde 2016 ate 2020', want: { kind: 'range', from: '2016-01-01', to: '2020-12-01' }, note: 'desde X ate Y -> FECHADO (ponta final vence)' },

  // ── Ano isolado: so o ano ───────────────────────────────────────────────────
  { msg: 'em 2016',   want: { kind: 'range', from: '2016-01-01', to: '2016-12-01' }, note: 'em YYYY (ano unico)' },
  { msg: 'in 2024',   want: { kind: 'range', from: '2024-01-01', to: '2024-12-01' }, note: 'in YYYY (ano unico)' },
  { msg: 'o relatorio de 2016', want: { kind: 'range', from: '2016-01-01', to: '2016-12-01' }, note: '"de YYYY" nu = ano unico (nao piso)' },

  // ── Mes + ano ───────────────────────────────────────────────────────────────
  { msg: 'junho de 2026', want: { kind: 'range', from: '2026-06-01', to: '2026-06-01' }, note: 'mes de ano' },
  { msg: 'June 2026',     want: { kind: 'range', from: '2026-06-01', to: '2026-06-01' }, note: 'Month Year (EN)' },

  // ── Relativos e atemporais ──────────────────────────────────────────────────
  { msg: 'o relatorio mais recente', want: { kind: 'latest' }, note: 'mais recente -> latest' },
  { msg: 'the latest report',        want: { kind: 'latest' }, note: 'latest -> latest' },
  { msg: 'this month',               want: { kind: 'range', from: '2026-06-01', to: '2026-06-01' }, note: 'this month (relativo a NOW)' },
  { msg: 'o que e computacao em nuvem?', want: null, note: 'atemporal -> null' },
  { msg: 'quais as tendencias de IA?',   want: null, note: 'atemporal -> null' },
]

let pass = 0
const fails: string[] = []
for (const c of cases) {
  const got = detectPeriodIntent(c.msg, NOW)
  try {
    assert.deepStrictEqual(got, c.want)
    pass++
    console.log(`OK  ${c.note}  ::  "${c.msg}"`)
  } catch {
    fails.push(`XX  ${c.note}  ::  "${c.msg}"\n      want ${JSON.stringify(c.want)}\n      got  ${JSON.stringify(got)}`)
  }
}

console.log(`\n${pass}/${cases.length} passed`)
if (fails.length) {
  console.error('\nFAILURES:\n' + fails.join('\n'))
  process.exit(1)
}
console.log('ALL PASS')
