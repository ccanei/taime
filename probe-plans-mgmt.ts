#!/usr/bin/env npx ts-node
/* Valida os endpoints da Fase 2.2 (GET list, POST, PATCH status+phases, DELETE) na
 * conta de teste, sem tocar nos planos reais do usuario. */
import dotenv from 'dotenv'
import { randomUUID } from 'crypto'
dotenv.config({ path: '.env.local' })

const SUPA_URL = (process.env.ACCEPTANCE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const ANON_KEY = process.env.ACCEPTANCE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.ACCEPTANCE_SUPABASE_SERVICE_KEY ?? ''
const SITE = (process.env.ACCEPTANCE_ADVISOR_URL ?? 'https://www.taime.tech').replace(/\/$/, '')
const EMAIL = process.env.ACCEPTANCE_ADVISOR_EMAIL ?? 'advisor-acceptance@taime.tech'

type Session = Record<string, unknown> & { access_token?: string; user?: { id?: string } }
async function mint(): Promise<Session> {
  const gr = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: EMAIL }) })
  const link = await gr.json() as any
  const hashed = link.hashed_token ?? link.properties?.hashed_token
  const vr = await fetch(`${SUPA_URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hashed }) })
  return await vr.json() as Session
}
function cookie(session: Session): string {
  const ref = new URL(SUPA_URL).hostname.split('.')[0]
  const key = `sb-${ref}-auth-token`
  const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const MAX = 3180
  if (encoded.length <= MAX) return `${key}=${encoded}`
  const parts: string[] = []
  for (let i = 0, n = 0; i < encoded.length; i += MAX, n++) parts.push(`${key}.${n}=${encoded.slice(i, i + MAX)}`)
  return parts.join('; ')
}
let CK = ''
const api = (path: string, init?: RequestInit) => fetch(`${SITE}/api/advisor/plans${path}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: CK, ...(init?.headers ?? {}) } })

const PHASES = [
  { label: 'Fase 1 (0-3 meses)', actions: [{ text: 'Acao 1', status: 'todo' }, { text: 'Acao 2', status: 'todo' }], avoid: ['Nao fazer X'], exitCriteria: 'Criterio 1' },
  { label: 'Fase 2 (3-6 meses)', actions: [{ text: 'Acao 3', status: 'todo' }], avoid: [], exitCriteria: 'Criterio 2' },
]
let pass = 0, fail = 0
const check = (name: string, ok: boolean, extra = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`); ok ? pass++ : fail++ }

async function main() {
  CK = cookie(await mint())
  console.log('auth ok\n')

  const base = await (await api('?all=1')).json() as any
  const baseCount = (base.plans ?? []).length
  console.log(`baseline: ${baseCount} planos na conta de teste\n`)

  // POST A + B
  const rA = await api('', { method: 'POST', body: JSON.stringify({ sessionId: randomUUID(), title: 'MGMT Probe A', theme: `probe-a-${Date.now()}`, phases: PHASES, mode: 'new' }) })
  const jA = await rA.json() as any
  const rB = await api('', { method: 'POST', body: JSON.stringify({ sessionId: randomUUID(), title: 'MGMT Probe B', theme: `probe-b-${Date.now()}`, phases: PHASES, mode: 'new' }) })
  const jB = await rB.json() as any
  check('POST cria plano A', rA.status === 200 && !!jA.id, `status=${rA.status}`)
  check('POST cria plano B', rB.status === 200 && !!jB.id)
  const A = jA.id, B = jB.id

  // GET active inclui A e B
  const act = await (await api('')).json() as any
  const ids = (act.plans ?? []).map((p: any) => p.id)
  check('GET active inclui A e B', ids.includes(A) && ids.includes(B), `active=${ids.length}`)

  // PATCH A phases: marca a 1a acao como done
  const donePhases = JSON.parse(JSON.stringify(PHASES)); donePhases[0].actions[0].status = 'done'
  const pt = await api(`/${A}`, { method: 'PATCH', body: JSON.stringify({ phases: donePhases }) })
  const jpt = await pt.json() as any
  check('PATCH A toggle acao -> done persiste', pt.status === 200 && jpt.plan?.phases?.[0]?.actions?.[0]?.status === 'done')

  // PATCH A status=completed
  const cp = await api(`/${A}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) })
  check('PATCH A -> completed', cp.status === 200 && (await cp.json()).plan?.status === 'completed')

  // PATCH B archived depois active
  const ar = await api(`/${B}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) })
  check('PATCH B -> archived', ar.status === 200 && (await ar.json()).plan?.status === 'archived')
  const re = await api(`/${B}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) })
  check('PATCH B -> active (reativar)', re.status === 200 && (await re.json()).plan?.status === 'active')

  // Guardas: id invalido, status invalido, dono (nao testavel cross-user aqui)
  const bad = await api(`/${A}`, { method: 'PATCH', body: JSON.stringify({ status: 'bogus' }) })
  check('PATCH status invalido -> 400', bad.status === 400)

  // DELETE A e B
  const dA = await api(`/${A}`, { method: 'DELETE' })
  const dB = await api(`/${B}`, { method: 'DELETE' })
  check('DELETE A', dA.status === 200)
  check('DELETE B', dB.status === 200)

  // Baseline restaurado
  const fin = await (await api('?all=1')).json() as any
  check('baseline restaurado (sem lixo do probe)', (fin.plans ?? []).length === baseCount, `agora=${(fin.plans ?? []).length}`)

  console.log(`\n${fail === 0 ? 'TODOS OK' : 'HOUVE FALHA'}: ${pass} ok, ${fail} fail`)
  if (fail > 0) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
