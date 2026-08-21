import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
const PAIRS: Array<[string, string]> = [
  ['2026-01-01', '2026-01-08'], ['2026-01-16', '2026-01-23'], ['2026-02-01', '2026-02-08'],
  ['2026-02-16', '2026-02-23'], ['2026-03-16', '2026-03-23'], ['2026-04-01', '2026-04-08'],
  ['2026-04-16', '2026-04-23'], ['2026-05-01', '2026-05-08'], ['2026-05-16', '2026-05-23'],
  ['2026-06-01', '2026-06-08'],
]
async function count(p: string): Promise<number> {
  const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  return parseInt((r.headers.get('content-range') ?? '').split('/')[1] ?? '0', 10)
}
async function main() {
  console.log('REAL        signals(real)  SOMBRA       signals(sombra)  reports(sombra)')
  for (const [real, shadow] of PAIRS) {
    const sr = await count(`signals?period=eq.${real}&select=id`)
    const ss = await count(`signals?period=eq.${shadow}&select=id`)
    const rs = await count(`reports?period=eq.${shadow}&select=id`)
    console.log(`${real}  ${String(sr).padEnd(13)}  ${shadow}  ${String(ss).padEnd(15)}  ${rs}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
