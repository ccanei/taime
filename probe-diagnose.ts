#!/usr/bin/env npx ts-node
/* Diagnostico Fase 2.1 bug: reproduz a pergunta da evidencia em producao, captura o
 * reply (roadmap em tabela markdown) e testa a heuristica ATUAL vs CANDIDATA. */
import dotenv from 'dotenv'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
dotenv.config({ path: '.env.local' })

const SUPA_URL = (process.env.ACCEPTANCE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const ANON_KEY = process.env.ACCEPTANCE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.ACCEPTANCE_SUPABASE_SERVICE_KEY ?? ''
const SITE = (process.env.ACCEPTANCE_ADVISOR_URL ?? 'https://www.taime.tech').replace(/\/$/, '')
const EMAIL = process.env.ACCEPTANCE_ADVISOR_EMAIL ?? 'advisor-acceptance@taime.tech'

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
  const j = await r.json() as { reply?: string; plan_offer?: unknown }
  return { reply: j.reply ?? '', planOffer: j.plan_offer ?? null }
}

// Heuristica ATUAL (copia verbatim do lib para diagnostico).
const CUR = /(\bfase\s*\d|\bphase\s*\d|0\s*[-a]\s*3\s*(?:meses|months)|3\s*[-a]\s*6\s*(?:meses|months)|6\s*[-a]\s*12\s*(?:meses|months)|90\s*dias|90\s*days|curto\s+prazo|m[eé]dio\s+prazo|longo\s+prazo|short\s+term|medium\s+term|long\s+term|crit[eé]rio\s+de\s+sa[ií]da|exit\s+criteria|o\s+que\s+n[aã]o\s+fazer|what\s+not\s+to\s+do|\broadmap\b)/gi
function curHeuristic(text: string): { pass: boolean; distinct: string[] } {
  if (!text || text.length < 200) return { pass: false, distinct: [] }
  const m = text.match(CUR)
  const distinct = m ? [...new Set(m.map(s => s.toLowerCase().replace(/\s+/g, ' ').trim()))] : []
  return { pass: distinct.length >= 2, distinct }
}

async function main() {
  const s = await mint(); const ck = cookie(s)
  console.log(`auth ok\n`)
  const sid = randomUUID()

  const q1 = 'como implantar agentes de IA para atendimento ao cliente na minha empresa?'
  console.log(`[Q1] ${q1}`)
  const a1 = await ask(ck, q1, sid)
  console.log(`  replyLen=${a1.reply.length} plan_offer=${a1.planOffer ? 'PRESENTE' : 'null'}`)
  const h1 = curHeuristic(a1.reply)
  console.log(`  heuristica ATUAL: ${h1.pass ? 'PASS' : 'FAIL'} (cues: ${JSON.stringify(h1.distinct)})`)
  console.log(`  tem tabela markdown? ${/\n\s*\|.*\|.*\n\s*\|?\s*[-:| ]+\|/.test(a1.reply) || /\|.*\|/.test(a1.reply)}`)
  writeFileSync('/tmp/reply1.md', a1.reply)

  const q2 = 'O canal e WhatsApp, volume de 5 mil atendimentos por mes, e-commerce de moda. Me da o roadmap.'
  console.log(`\n[Q2] ${q2}`)
  const a2 = await ask(ck, q2, sid)
  console.log(`  replyLen=${a2.reply.length} plan_offer=${a2.planOffer ? 'PRESENTE' : 'null'}`)
  const h2 = curHeuristic(a2.reply)
  console.log(`  heuristica ATUAL: ${h2.pass ? 'PASS' : 'FAIL'} (cues: ${JSON.stringify(h2.distinct)})`)
  console.log(`  tem tabela markdown (pipes)? ${/\|.*\|/.test(a2.reply)}`)
  writeFileSync('/tmp/reply2.md', a2.reply)
  console.log('\nReplies salvos em /tmp/reply1.md e /tmp/reply2.md')
}
main().catch(e => { console.error(e); process.exit(1) })
