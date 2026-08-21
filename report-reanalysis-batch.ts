#!/usr/bin/env npx ts-node
/*
 * report-reanalysis-batch.ts  -  relatorio comparativo final das 11 quinzenas.
 * Para cada par REAL->SOMBRA: uteis pos-filtro e % ruido revelado, clusters antes->agora,
 * trends antes->agora, veredito 1a e 2a passada, e custo (llm_calls da sombra).
 * Le reanalysis-pass1.json (veredito da 1a passada) se existir. So leitura.
 */
import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
import { existsSync, readFileSync } from 'fs'

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
const PRICE: Record<string, [number, number]> = { 'claude-haiku-4-5': [1, 5], 'claude-sonnet-4-6': [3, 15], 'claude-sonnet-5': [3, 15], 'claude-opus-4-8': [5, 25] }

const PAIRS: Array<[string, string]> = [
  ['2026-01-01', '2026-01-08'], ['2026-01-16', '2026-01-23'], ['2026-02-01', '2026-02-08'],
  ['2026-02-16', '2026-02-23'], ['2026-03-01', '2026-03-08'], ['2026-03-16', '2026-03-23'],
  ['2026-04-01', '2026-04-08'], ['2026-04-16', '2026-04-23'], ['2026-05-01', '2026-05-08'],
  ['2026-05-16', '2026-05-23'], ['2026-06-01', '2026-06-08'],
]

async function get<T>(p: string): Promise<T[]> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json() as Promise<T[]> }
async function count(p: string): Promise<number> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }); return parseInt((r.headers.get('content-range') ?? '').split('/')[1] ?? '0', 10) }

async function side(period: string) {
  const total = await count(`signals?period=eq.${period}&select=id`)
  const noise = await count(`signals?period=eq.${period}&is_noise=eq.true&select=id`)
  const clusters = await count(`signal_clusters?period=eq.${period}&select=id`)
  const reps = await get<{ id: string; status: string }>(`reports?period=eq.${period}&status=neq.rejected&select=id,status`)
  let trends = 0
  for (const r of reps) trends += await count(`report_trends?report_id=eq.${r.id}&select=rank`)
  return { total, noise, useful: total - noise, noisePct: total ? 100 * noise / total : 0, clusters, reports: reps.length, trends, statuses: reps.map(r => r.status) }
}
async function shadowCost(shadow: string) {
  const calls = await get<{ model: string; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null }>(`llm_calls?period=eq.${shadow}&select=model,input_tokens,output_tokens,latency_ms`)
  let usd = 0, ms = 0
  for (const c of calls) { const pr = PRICE[c.model] ?? [0, 0]; usd += (c.input_tokens ?? 0) / 1e6 * pr[0] + (c.output_tokens ?? 0) / 1e6 * pr[1]; ms += c.latency_ms ?? 0 }
  return { usd, ms, calls: calls.length }
}
function verdictSummary(reps: Array<{ verdict: string | null }> | undefined): string {
  if (!reps || !reps.length) return 'n/a'
  const by: Record<string, number> = {}
  for (const r of reps) { const v = r.verdict ?? 'null'; by[v] = (by[v] ?? 0) + 1 }
  return Object.entries(by).map(([v, n]) => `${n}x${v}`).join(',')
}

async function main() {
  const pass1: Record<string, Array<{ verdict: string | null }>> = existsSync('reanalysis-pass1.json') ? JSON.parse(readFileSync('reanalysis-pass1.json', 'utf8')) : {}

  console.log('\n================ RE-ANALISE EM LOTE 2026 (11 quinzenas) ================\n')
  console.log('quinzena(real->sombra) | uteis (ruido%)     | clusters | trends | verdict 1a | verdict 2a | custo US$')
  const T = { usefulR: 0, usefulS: 0, noiseS: 0, sigS: 0, clR: 0, clS: 0, trR: 0, trS: 0, usd: 0, ms: 0, calls: 0 }
  for (const [real, shadow] of PAIRS) {
    const r = await side(real), s = await side(shadow), c = await shadowCost(shadow)
    // verdict 2a passada = estado atual do banco
    const repsNow = await get<{ validation_verdict: string | null }>(`reports?period=eq.${shadow}&status=neq.rejected&select=validation_verdict`)
    const v2 = verdictSummary(repsNow.map(x => ({ verdict: x.validation_verdict })))
    const v1 = verdictSummary(pass1[shadow])
    const label = `${real}->${shadow.slice(8)}`
    const uteis = `${s.useful} (${s.noisePct.toFixed(1)}%)`
    console.log(`${label.padEnd(22)} | ${uteis.padEnd(18)} | ${String(`${r.clusters}->${s.clusters}`).padEnd(8)} | ${String(`${r.trends}->${s.trends}`).padEnd(6)} | ${v1.padEnd(10)} | ${v2.padEnd(10)} | ${c.usd.toFixed(2)}`)
    T.usefulR += r.useful; T.usefulS += s.useful; T.noiseS += s.noise; T.sigS += s.total
    T.clR += r.clusters; T.clS += s.clusters; T.trR += r.trends; T.trS += s.trends; T.usd += c.usd; T.ms += c.ms; T.calls += c.calls
  }
  console.log('\n================ TOTAIS DO LOTE ================')
  console.log(`sinais processados (sombras): ${T.sigS}`)
  console.log(`uteis pos-filtro: real ${T.usefulR} -> sombra ${T.usefulS}   (ruido revelado nas sombras: ${T.noiseS}, ${T.sigS ? (100 * T.noiseS / T.sigS).toFixed(1) : 0}%)`)
  console.log(`clusters: ${T.clR} -> ${T.clS}`)
  console.log(`trends:   ${T.trR} -> ${T.trS}`)
  console.log(`custo LLM total: US$ ${T.usd.toFixed(2)}  (${T.calls} calls, ~${(T.ms / 60000).toFixed(0)} min de LLM)`)
  const pub = await count(`reports?period=in.(${PAIRS.map(p => p[1]).join(',')})&status=eq.published&select=id`)
  console.log(`\nseguranca: reports-sombra com status=published: ${pub} (esperado 0; NO_AUTO_PUBLISH mantem pending_review)`)
}
main().catch(e => { console.error(e); process.exit(1) })
