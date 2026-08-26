import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
const FIRMS = ['Gartner', 'McKinsey', 'Forrester', 'Accenture', 'Deloitte', 'KPMG', 'CB Insights', 'PitchBook', 'Omdia', 'Bain', 'PwC', 'BCG', 'IDC', 'EY']
const FIRM_RE = new RegExp(`\\b(${FIRMS.join('|')})\\b`)
const MONETARY_RE = /(R\$|US\$|U\$|\bUSD\b|\bBRL\b|\bEUR\b|€|\bsalár|\bbudget of|\$\s?\d)/i
async function get<T>(p: string): Promise<T[]> { const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: H }); return r.json() as Promise<T[]> }
async function trend(shadow: string, repNum: number, rank: number) {
  const reps = await get<{ id: string }>(`reports?period=eq.${shadow}&report_number=eq.${repNum}&select=id`)
  const t = (await get<any>(`report_trends?report_id=eq.${reps[0].id}&rank=eq.${rank}&select=*`))[0]
  return t
}
function firmHit(txt: string | null | undefined) { if (typeof txt !== 'string') return null; const m = FIRM_RE.exec(txt); return m ? { firm: m[1], idx: m.index, ctx: txt.slice(Math.max(0, m.index - 50), m.index + 40) } : null }
function monHit(txt: string | null | undefined) { if (typeof txt !== 'string') return null; const m = MONETARY_RE.exec(txt); return m ? txt.slice(Math.max(0, m.index - 40), m.index + 60) : null }
async function main() {
  console.log('=== 2026-01-23 #2 trend#4 (firm_bare) ===')
  let t = await trend('2026-01-23', 2, 4)
  for (const [f, v] of [['tnn.now pt', t.then_now_next_pt_br?.now], ['tnn.now en', t.then_now_next_en?.now]] as const) { const h = firmHit(v); if (h) console.log(`  ${f}: FIRM="${h.firm}" ctx: ...${h.ctx}...`) }
  console.log('\n=== 2026-05-23 #2 trend#6 (firm_bare) ===')
  t = await trend('2026-05-23', 2, 6)
  { const h = firmHit(t.taime_framework_pt_br?.type); if (h) console.log(`  fw.type pt: FIRM="${h.firm}" ctx: ...${h.ctx}...`) }
  console.log('\n=== 2026-05-23 #3 trend#5 (monetary) ===')
  t = await trend('2026-05-23', 3, 5)
  console.log('  fw.executive_snapshot en:', monHit(t.taime_framework_en?.executive_snapshot))
  console.log('  tnn.now en:', monHit(t.then_now_next_en?.now))
}
main().catch(e => { console.error(e); process.exit(1) })
