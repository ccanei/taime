import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
const PAIRS: Array<[string, string]> = [
  ['2026-01-01', '2026-01-08'], ['2026-03-01', '2026-03-08'], ['2026-06-01', '2026-06-08'],
]
async function get<T>(p: string): Promise<T[]> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json() as Promise<T[]> }
async function main() {
  for (const [real, shadow] of PAIRS) {
    for (const [tag, p] of [['REAL', real], ['SOMBRA', shadow]] as const) {
      const reps = await get<{ id: string; report_number: number; status: string; period_label: string | null; is_public: boolean | null }>(`reports?period=eq.${p}&select=id,report_number,status,period_label,is_public&order=report_number.asc`)
      console.log(`${tag} ${p}: ${reps.length} reports -> ${reps.map(r => `#${r.report_number}[${r.status}${r.is_public ? ',PUB' : ''}]`).join(' ')}`)
      if (tag === 'REAL' && reps.length) console.log(`     period_label real: "${reps[0].period_label}"`)
      // hero trends?
      for (const r of reps) {
        const heroes = await get<{ rank: number }>(`report_trends?report_id=eq.${r.id}&is_hero=eq.true&select=rank`)
        if (heroes.length) console.log(`     ${tag} #${r.report_number} hero trends: ranks ${heroes.map(h => h.rank).join(',')}`)
      }
    }
  }
  // report_trend_embeddings: schema present? sample
  try {
    const emb = await get<{ trend_id: string; period: string; lang: string }>(`report_trend_embeddings?select=trend_id,period,lang&limit=3`)
    console.log(`\nreport_trend_embeddings sample: ${JSON.stringify(emb)}`)
  } catch (e) { console.log('report_trend_embeddings query err:', (e as Error).message) }
}
main().catch(e => { console.error(e); process.exit(1) })
