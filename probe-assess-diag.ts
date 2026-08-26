#!/usr/bin/env npx ts-node
/* Diagnostico do bug de captura do Assessment. Checa: (1) a tabela existe; (2) uma
 * conversa de seguranca em producao -> context_metadata.assessment_capture presente?
 * asked populado? mapped? (3) advisor_assessments gravou linha? */
import dotenv from 'dotenv'
import { randomUUID } from 'crypto'
dotenv.config({ path: '.env.local' })

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const ANON = process.env.SUPABASE_ANON_KEY ?? ''
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const SITE = 'https://www.taime.tech'
const EMAIL = process.env.ACCEPTANCE_ADVISOR_EMAIL ?? 'advisor-acceptance@taime.tech'
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }

async function mint() {
  const gr = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: EMAIL }) })
  const link = await gr.json() as any
  const hashed = link.hashed_token ?? link.properties?.hashed_token
  const vr = await fetch(`${SUPA}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hashed }) })
  return await vr.json() as any
}
function cookie(s: any): string {
  const ref = new URL(SUPA).hostname.split('.')[0]; const key = `sb-${ref}-auth-token`
  const enc = 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64url'); const MAX = 3180
  if (enc.length <= MAX) return `${key}=${enc}`
  const p: string[] = []; for (let i = 0, n = 0; i < enc.length; i += MAX, n++) p.push(`${key}.${n}=${enc.slice(i, i + MAX)}`); return p.join('; ')
}
async function ask(ck: string, message: string, sessionId: string) {
  const r = await fetch(`${SITE}/api/advisor/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ message, sessionId }) })
  return { status: r.status, json: await r.json() as any }
}
async function readMeta(sessionId: string) {
  const r = await fetch(`${SUPA}/rest/v1/advisory_memory?session_id=eq.${sessionId}&role=eq.assistant&select=content,context_metadata&order=created_at.asc`, { headers: H })
  return await r.json() as Array<{ content: string; context_metadata: any }>
}

async function main() {
  const session = await mint(); const uid = session.user?.id; const ck = cookie(session)
  console.log(`user ${String(uid).slice(0, 8)}\n`)

  // (1) tabela existe? conta linhas
  const t = await fetch(`${SUPA}/rest/v1/advisor_assessments?select=id&limit=1`, { headers: H })
  console.log(`(1) advisor_assessments existe? HTTP ${t.status} ${t.status === 200 ? '(sim)' : '(NAO / erro: ' + (await t.text()).slice(0, 120) + ')'}`)
  const mine = await (await fetch(`${SUPA}/rest/v1/advisor_assessments?user_id=eq.${uid}&select=id,answers,scores,is_active,version`, { headers: H })).json() as any[]
  console.log(`    linhas do usuario de teste: ${mine.length} ${mine.length ? JSON.stringify(mine[0]).slice(0, 200) : ''}`)

  // (2) turno 1: pergunta de seguranca
  const sid = randomUUID()
  console.log(`\n(2) Turno 1 (seguranca) sessao ${sid.slice(0, 8)}`)
  const a1 = await ask(ck, 'Como está a segurança de acesso aos nossos sistemas? Quem tem acesso a quê hoje?', sid)
  console.log(`    reply status ${a1.status}, len ${(a1.json.reply ?? '').length}`)
  await new Promise(r => setTimeout(r, 1500))
  const m1 = await readMeta(sid)
  const cap1 = m1[m1.length - 1]?.context_metadata?.assessment_capture
  console.log(`    assessment_capture presente? ${cap1 !== undefined ? 'SIM -> ' + JSON.stringify(cap1) : 'AUSENTE (chave nao existe no context_metadata)'}`)
  console.log(`    keys do context_metadata: ${Object.keys(m1[m1.length - 1]?.context_metadata ?? {}).join(', ')}`)
  console.log(`    final da resposta 1: ...${(a1.json.reply ?? '').slice(-240)}`)

  // (3) turno 2: responde a pergunta (mapeamento)
  console.log(`\n(3) Turno 2 (resposta): mapeamento`)
  const a2 = await ask(ck, 'Os acessos foram sendo concedidos ao longo do tempo e nunca revisamos. Ninguém tem um mapa disso.', sid)
  console.log(`    reply status ${a2.status}`)
  await new Promise(r => setTimeout(r, 1500))
  const m2 = await readMeta(sid)
  const cap2 = m2[m2.length - 1]?.context_metadata?.assessment_capture
  console.log(`    assessment_capture turno 2: ${cap2 !== undefined ? JSON.stringify(cap2) : 'AUSENTE'}`)
  const mine2 = await (await fetch(`${SUPA}/rest/v1/advisor_assessments?user_id=eq.${uid}&select=answers,scores`, { headers: H })).json() as any[]
  console.log(`    advisor_assessments apos turno 2: ${mine2.length ? JSON.stringify(mine2[0]) : 'NENHUMA LINHA'}`)
}
main().catch(e => { console.error(e); process.exit(1) })
