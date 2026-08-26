import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const EMAIL = process.env.ACCEPTANCE_ADVISOR_EMAIL ?? 'advisor-acceptance@taime.tech'
async function main() {
  const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
  const u = await (await fetch(`${SUPA}/rest/v1/users?email=eq.${encodeURIComponent(EMAIL)}&select=id`, { headers: H })).json() as any[]
  const uid = u[0]?.id; console.log('uid', uid?.slice(0, 8))
  const p = await (await fetch(`${SUPA}/rest/v1/advisor_profiles?user_id=eq.${uid}&select=*`, { headers: H })).json() as any[]
  console.log('profile:', JSON.stringify(p[0] ?? null, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
