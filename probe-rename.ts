#!/usr/bin/env npx ts-node
/* Valida a rota de renomear conversa: 401 sem auth, 400 titulo vazio, e o rename real
 * (ou 503 migration_pending se a coluna title_custom ainda nao existe). Reverte o titulo. */
import dotenv from 'dotenv'
import { randomUUID } from 'crypto'
dotenv.config({ path: '.env.local' })

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const ANON = process.env.SUPABASE_ANON_KEY ?? ''
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const SITE = 'https://www.taime.tech'
const EMAIL = process.env.ACCEPTANCE_ADVISOR_EMAIL ?? 'advisor-acceptance@taime.tech'

async function mint() {
  const gr = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: EMAIL }) })
  const link = await gr.json() as any
  const hashed = link.hashed_token ?? link.properties?.hashed_token
  const vr = await fetch(`${SUPA}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hashed }) })
  return await vr.json() as any
}
function cookie(session: any): string {
  const ref = new URL(SUPA).hostname.split('.')[0]
  const key = `sb-${ref}-auth-token`
  const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const MAX = 3180
  if (encoded.length <= MAX) return `${key}=${encoded}`
  const parts: string[] = []
  for (let i = 0, n = 0; i < encoded.length; i += MAX, n++) parts.push(`${key}.${n}=${encoded.slice(i, i + MAX)}`)
  return parts.join('; ')
}

async function main() {
  const ck = cookie(await mint())
  // pega uma sessao existente do usuario de teste
  const sres = await fetch(`${SITE}/api/advisor/sessions`, { headers: { Cookie: ck } })
  const sj = await sres.json() as { sessions?: Array<{ session_id: string; title: string | null }> }
  const sess = sj.sessions?.[0]
  console.log(`sessoes: ${sj.sessions?.length ?? 0}; alvo: ${sess?.session_id?.slice(0, 8)} titulo="${sess?.title}"`)

  const url = (id: string) => `${SITE}/api/advisor/sessions/${id}`

  // 1) sem auth -> 401
  const noAuth = await fetch(url(sess?.session_id ?? randomUUID()), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }) })
  console.log(`sem auth            -> HTTP ${noAuth.status} (esperado 401)`)

  if (!sess) { console.log('sem sessao para testar rename'); return }

  // 2) titulo vazio -> 400
  const empty = await fetch(url(sess.session_id), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ title: '   ' }) })
  console.log(`titulo vazio        -> HTTP ${empty.status} ${JSON.stringify(await empty.json())} (esperado 400 empty_title)`)

  // 3) rename real
  const novo = `Renomeada probe ${new Date().toISOString().slice(11, 19)}`
  const r = await fetch(url(sess.session_id), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ title: novo }) })
  const rj = await r.json() as any
  console.log(`rename "${novo}"     -> HTTP ${r.status} ${JSON.stringify(rj)}`)

  if (r.status === 200) {
    // confirma propagacao na lista (GET sessions) + reverte
    const chk = await (await fetch(`${SITE}/api/advisor/sessions`, { headers: { Cookie: ck } })).json() as any
    const found = chk.sessions?.find((x: any) => x.session_id === sess.session_id)
    console.log(`  propagou na lista? titulo agora="${found?.title}" -> ${found?.title === novo ? 'SIM' : 'NAO'}`)
    // confirma title_custom=true no banco
    const dbrow = await (await fetch(`${SUPA}/rest/v1/advisor_sessions?session_id=eq.${sess.session_id}&select=title,title_custom`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } })).json() as any[]
    console.log(`  banco: title_custom=${dbrow[0]?.title_custom}`)
    // reverte
    await fetch(url(sess.session_id), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ title: sess.title || 'Conversa' }) })
    console.log(`  revertido para "${sess.title || 'Conversa'}"`)
  } else if (rj.error === 'migration_pending') {
    console.log('  -> migracao title_custom ainda nao aplicada (endpoint OK; funciona apos aplicar)')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
