import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
const REAL = '2026-03-01', SHADOW = '2026-03-08'
const PRICE: Record<string, [number, number]> = { 'claude-haiku-4-5': [1, 5], 'claude-sonnet-4-6': [3, 15], 'claude-sonnet-5': [3, 15], 'claude-opus-4-8': [5, 25] }

async function get<T>(p: string): Promise<T[]> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json() as Promise<T[]> }
async function count(p: string): Promise<number> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }); return parseInt((r.headers.get('content-range') ?? '').split('/')[1] ?? '0', 10) }

async function side(period: string) {
  const total = await count(`signals?period=eq.${period}&select=id`)
  const noise = await count(`signals?period=eq.${period}&is_noise=eq.true&select=id`)
  const useful = total - noise
  const clusters = await get<{ id: string; name?: string; signal_ids?: unknown[] }>(`signal_clusters?period=eq.${period}&select=id,name,signal_ids`)
  const sizes = clusters.map(c => Array.isArray(c.signal_ids) ? c.signal_ids.length : 0).sort((a, b) => b - a)
  const reports = await get<{ id: string; status: string; report_number: number; title_pt_br?: string }>(`reports?period=eq.${period}&select=id,status,report_number,title_pt_br&order=report_number.asc`)
  const trends: Array<{ rank: number; title: string; category: string; report_status: string }> = []
  for (const r of reports) {
    const ts = await get<{ rank: number; title_pt_br?: string; category?: string }>(`report_trends?report_id=eq.${r.id}&select=rank,title_pt_br,category&order=rank.asc`)
    for (const t of ts) trends.push({ rank: t.rank, title: t.title_pt_br ?? '', category: t.category ?? '', report_status: r.status })
  }
  return { total, noise, useful, noisePct: total ? (100 * noise / total) : 0, clusters: clusters.length, sizes, reports, trends }
}

async function cost() {
  const calls = await get<{ caller: string; model: string; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null; success: boolean }>(`llm_calls?period=eq.${SHADOW}&select=caller,model,input_tokens,output_tokens,latency_ms,success`)
  const byCaller: Record<string, { n: number; in: number; out: number; ms: number; usd: number }> = {}
  let totalUsd = 0, totalMs = 0
  for (const c of calls) {
    const k = `${c.caller}/${c.model}`
    const pr = PRICE[c.model] ?? [0, 0]
    const usd = ((c.input_tokens ?? 0) / 1e6) * pr[0] + ((c.output_tokens ?? 0) / 1e6) * pr[1]
    byCaller[k] = byCaller[k] ?? { n: 0, in: 0, out: 0, ms: 0, usd: 0 }
    byCaller[k].n++; byCaller[k].in += c.input_tokens ?? 0; byCaller[k].out += c.output_tokens ?? 0; byCaller[k].ms += c.latency_ms ?? 0; byCaller[k].usd += usd
    totalUsd += usd; totalMs += c.latency_ms ?? 0
  }
  return { byCaller, totalUsd, totalMs, calls: calls.length }
}

async function main() {
  const real = await side(REAL)
  const shadow = await side(SHADOW)
  console.log('\n============ RE-ANALISE 2026-03-01 (real/ANTIGO) vs 2026-03-08 (sombra/PILOTO) ============\n')
  console.log('metric                | ANTIGO (2026-03-01)        | PILOTO (2026-03-08)')
  console.log('sinais brutos         | ' + String(real.total).padEnd(26) + '| ' + shadow.total)
  console.log('sinais uteis (pos-flt)| ' + String(`${real.useful} (ruido ${real.noisePct.toFixed(1)}%)`).padEnd(26) + '| ' + `${shadow.useful} (ruido ${shadow.noisePct.toFixed(1)}%)`)
  console.log('clusters              | ' + String(`${real.clusters}  sizes[${real.sizes.join(',')}]`).padEnd(26) + '| ' + `${shadow.clusters}  sizes[${shadow.sizes.join(',')}]`)
  console.log('reports               | ' + String(real.reports.map(r => `#${r.report_number}[${r.status}]`).join(' ')).padEnd(26) + '| ' + shadow.reports.map(r => `#${r.report_number}[${r.status}]`).join(' '))
  console.log('\n--- TRENDS ANTIGO (2026-03-01, publicadas) ---')
  for (const t of real.trends) console.log(`  #${t.rank} [${t.category}] ${t.title}`)
  console.log('\n--- TRENDS PILOTO (2026-03-08, ' + (shadow.reports[0]?.status ?? 'n/a') + ') ---')
  for (const t of shadow.trends) console.log(`  #${t.rank} [${t.category}] ${t.title}`)

  const cc = await cost()
  console.log('\n--- CUSTO REAL (llm_calls, period=2026-03-08) ---')
  for (const [k, v] of Object.entries(cc.byCaller)) console.log(`  ${k}: ${v.n} calls, ${v.in}in/${v.out}out, ${(v.ms / 1000).toFixed(0)}s, US$ ${v.usd.toFixed(4)}`)
  console.log(`  TOTAL: ${cc.calls} calls, US$ ${cc.totalUsd.toFixed(4)}, tempo LLM ~${(cc.totalMs / 60000).toFixed(1)} min`)

  console.log('\n--- VAZAMENTO PUBLICO (deve ser 0 published na sombra) ---')
  const pub = await count(`reports?period=eq.${SHADOW}&status=eq.published&select=id`)
  console.log(`  reports sombra com status=published: ${pub} (esperado 0; validate com NO_AUTO_PUBLISH mantem pending_review)`)
  console.log(`  real 2026-03-01 intacto: signals=${real.total} noise=${real.noise} (esperado 427 / 0)`)
}
main().catch(e => { console.error(e); process.exit(1) })
