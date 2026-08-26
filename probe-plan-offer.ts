#!/usr/bin/env npx ts-node
/* Probe de validacao (Fase 2.1): exercita o pipeline REAL de producao para provar
 * (a) pergunta com roadmap -> plan_offer estruturado presente; (b) pergunta sem
 * roadmap -> plan_offer null (sem oferta). Nao grava nada (a extracao nao toca o DB).
 * Untracked, descartavel. Reusa o mesmo auth admin da suite de aceitacao. */
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
  const gr = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
  })
  const link = await gr.json() as { hashed_token?: string; properties?: { hashed_token?: string } }
  const hashed = link.hashed_token ?? link.properties?.hashed_token
  const vr = await fetch(`${SUPA_URL}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
  })
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

async function ask(ck: string, message: string) {
  const r = await fetch(`${SITE}/api/advisor/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck },
    body: JSON.stringify({ message, sessionId: randomUUID() }),
  })
  const j = await r.json() as { reply?: string; plan_offer?: unknown }
  return { status: r.status, replyLen: (j.reply ?? '').length, planOffer: j.plan_offer ?? null }
}

async function main() {
  const s = await mint()
  const ck = cookie(s)
  console.log(`auth ok (user ${String(s.user?.id).slice(0, 8)}...)\n`)

  const roadmapQ = 'Me de um roadmap por fases com horizontes (0-3, 3-6 e 6-12 meses) para adotar agentes de IA no atendimento ao cliente. Em cada fase, liste as acoes, o que nao fazer e o criterio de saida.'
  const plainQ   = 'quais criterios para escolher uma ferramenta de observabilidade?'

  console.log('[CASO A] pergunta COM roadmap ->')
  const a = await ask(ck, roadmapQ)
  console.log(`  status=${a.status} replyLen=${a.replyLen} plan_offer=${a.planOffer ? 'PRESENTE' : 'null'}`)
  if (a.planOffer) console.log('  ' + JSON.stringify(a.planOffer, null, 2).split('\n').join('\n  '))

  console.log('\n[CASO B] pergunta SEM roadmap ->')
  const b = await ask(ck, plainQ)
  console.log(`  status=${b.status} replyLen=${b.replyLen} plan_offer=${b.planOffer ? 'PRESENTE (INESPERADO)' : 'null (correto: sem oferta)'}`)
}

main().catch(e => { console.error(e); process.exit(1) })
