#!/usr/bin/env npx ts-node
/* Validacao do fix Fase 2.1 em producao:
 *  1. Pergunta exata da evidencia (+ follow-up canal/volume) -> oferta aparece
 *     (plan_offer presente) e plan_detection gravado com via='table'.
 *  2. Salvar grava em advisor_plans com as fases corretas (imprime o jsonb).
 *  3. Regressao: tatica + factual -> sem oferta, plan_detection explica.
 * Espera o deploy: se plan_detection ainda nao existe (codigo antigo), aguarda. */
import dotenv from 'dotenv'
import { randomUUID } from 'crypto'
dotenv.config({ path: '.env.local' })

const SUPA_URL = (process.env.ACCEPTANCE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const ANON_KEY = process.env.ACCEPTANCE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.ACCEPTANCE_SUPABASE_SERVICE_KEY ?? ''
const SITE = (process.env.ACCEPTANCE_ADVISOR_URL ?? 'https://www.taime.tech').replace(/\/$/, '')
const EMAIL = process.env.ACCEPTANCE_ADVISOR_EMAIL ?? 'advisor-acceptance@taime.tech'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Session = Record<string, unknown> & { access_token?: string; user?: { id?: string } }
async function mint(): Promise<Session> {
  const gr = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', email: EMAIL }) })
  const link = await gr.json() as { hashed_token?: string; properties?: { hashed_token?: string } }
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
async function ask(ck: string, message: string, sessionId: string) {
  const r = await fetch(`${SITE}/api/advisor/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ message, sessionId }) })
  const j = await r.json() as { reply?: string; plan_offer?: any }
  return { reply: j.reply ?? '', planOffer: j.plan_offer ?? null }
}
async function readDetection(sessionId: string): Promise<any> {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${SUPA_URL}/rest/v1/advisory_memory?session_id=eq.${sessionId}&role=eq.assistant&select=context_metadata&order=created_at.desc&limit=1`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
    if (r.ok) { const rows = await r.json() as any[]; if (rows[0]?.context_metadata) return rows[0].context_metadata.plan_detection ?? 'ABSENT' }
    await sleep(700)
  }
  return 'ABSENT'
}

async function main() {
  const s = await mint(); const ck = cookie(s); const uid = String(s.user?.id)
  console.log(`auth ok (user ${uid.slice(0, 8)}...)\n`)

  // ── 1. Pergunta exata da evidencia + follow-up canal/volume ────────────────
  const sidA = randomUUID()
  console.log('=== 1. ROADMAP (pergunta da evidencia) ===')
  await ask(ck, 'como implantar agentes de IA para atendimento ao cliente na minha empresa?', sidA)
  const a2 = await ask(ck, 'O canal e WhatsApp, volume de 5 mil atendimentos por mes, e-commerce de moda. Me da o roadmap por fases.', sidA)
  const det = await readDetection(sidA)
  console.log(`  plan_offer=${a2.planOffer ? 'PRESENTE' : 'null'}`)
  console.log(`  plan_detection=${JSON.stringify(det)}`)

  // ── 2. Salvar em advisor_plans e reler o jsonb ─────────────────────────────
  console.log('\n=== 2. SALVAR em advisor_plans ===')
  if (a2.planOffer) {
    const save = await fetch(`${SITE}/api/advisor/plans`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ sessionId: sidA, title: a2.planOffer.title, theme: a2.planOffer.theme, phases: a2.planOffer.phases, mode: 'new' }) })
    const sj = await save.json() as any
    console.log(`  POST status=${save.status} resp=${JSON.stringify(sj)}`)
    if (sj.id) {
      const g = await fetch(`${SUPA_URL}/rest/v1/advisor_plans?id=eq.${sj.id}&select=id,title,theme,status,phases`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
      const rows = await g.json() as any[]
      console.log('  --- jsonb gravado em advisor_plans ---')
      console.log('  ' + JSON.stringify(rows[0], null, 2).split('\n').join('\n  '))
    }
  } else {
    console.log('  (sem plan_offer, nao ha o que salvar)')
  }

  // ── 3. Regressao: tatica + factual -> sem oferta ───────────────────────────
  console.log('\n=== 3. REGRESSAO (sem roadmap -> sem oferta) ===')
  const sidT = randomUUID()
  const t = await ask(ck, 'quais criterios para escolher uma ferramenta de observabilidade?', sidT)
  const detT = await readDetection(sidT)
  console.log(`  [TATICA] plan_offer=${t.planOffer ? 'PRESENTE (INESPERADO)' : 'null'}  plan_detection=${JSON.stringify(detT)}`)
  const sidF = randomUUID()
  const f = await ask(ck, 'o que o arquivo tem de 2016?', sidF)
  const detF = await readDetection(sidF)
  console.log(`  [FACTUAL] plan_offer=${f.planOffer ? 'PRESENTE (INESPERADO)' : 'null'}  plan_detection=${JSON.stringify(detF)}`)
}
main().catch(e => { console.error(e); process.exit(1) })
