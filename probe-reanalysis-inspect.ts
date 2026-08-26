import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
async function get<T>(p: string): Promise<T[]> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json() as Promise<T[]> }
async function count(p: string): Promise<number> {
  const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  const cr = r.headers.get('content-range') ?? ''; return parseInt(cr.split('/')[1] ?? '0', 10)
}
async function main() {
  const REAL = '2026-03-01', SHADOW = '2026-03-08'
  console.log('=== SIGNALS 2026-03-01 (real) ===')
  const total = await count(`signals?period=eq.${REAL}&select=id`)
  const noise = await count(`signals?period=eq.${REAL}&is_noise=eq.true&select=id`)
  const useful = await count(`signals?period=eq.${REAL}&is_noise=eq.false&select=id`)
  console.log(`total=${total} is_noise=true:${noise} is_noise=false:${useful} (ruido ${total ? (100 * noise / total).toFixed(1) : 0}%)`)
  const sample = await get<Record<string, unknown>>(`signals?period=eq.${REAL}&select=*&limit=1`)
  console.log('colunas do signal:', Object.keys(sample[0] ?? {}).join(', '))
  console.log('sample metadata keys:', Object.keys((sample[0]?.metadata ?? {}) as object).join(', '))

  console.log('\n=== CLUSTERS 2026-03-01 (real) ===')
  const clusters = await get<{ id: string; label?: string; theme?: string; signal_ids?: unknown[]; size?: number }>(`signal_clusters?period=eq.${REAL}&select=*`)
  console.log(`clusters=${clusters.length}`)
  console.log('cols cluster:', Object.keys(clusters[0] ?? {}).join(', '))
  for (const c of clusters) { const n = Array.isArray(c.signal_ids) ? c.signal_ids.length : (c.size ?? '?'); console.log(`  cluster ${String(c.id).slice(0, 8)} size=${n} ${(c as any).label ?? (c as any).theme ?? ''}`) }

  console.log('\n=== REPORTS 2026-03-01 (real) ===')
  const reports = await get<{ id: string; status: string; report_number: number; title_pt_br?: string; published_at?: string }>(`reports?period=eq.${REAL}&select=id,status,report_number,title_pt_br,published_at`)
  for (const r of reports) {
    console.log(`  report ${r.report_number} [${r.status}] ${r.title_pt_br ?? ''}`)
    const trends = await get<{ rank: number; title_pt_br?: string; category?: string; theme_slug?: string }>(`report_trends?report_id=eq.${r.id}&select=rank,title_pt_br,category,theme_slug&order=rank.asc`)
    for (const t of trends) console.log(`     #${t.rank} [${t.category ?? ''}] ${t.title_pt_br ?? ''}`)
  }

  console.log('\n=== SHADOW 2026-03-08 (deve estar vazio) ===')
  console.log(`signals=${await count(`signals?period=eq.${SHADOW}&select=id`)} clusters=${await count(`signal_clusters?period=eq.${SHADOW}&select=id`)} reports=${await count(`reports?period=eq.${SHADOW}&select=id`)}`)
}
main().catch(e => { console.error(e); process.exit(1) })
