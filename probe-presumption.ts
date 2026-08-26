#!/usr/bin/env npx ts-node
/* Valida a regra 4b: o Advisor nao presume fatos sobre a empresa do cliente.
 * Perfil do teste: Azure definido, mas SEM ferramenta de observabilidade/SIEM.
 *  A) plano cloud -> deve usar Azure (perfil) e NUNCA presumir AWS/GCP.
 *  B) ferramenta nao informada -> agnostico ou pergunta, nunca nomeia como "a de voces".
 *  C) dado no perfil (setor/porte) -> usa sem re-perguntar. */
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
function cookie(s: any): string {
  const ref = new URL(SUPA).hostname.split('.')[0]; const key = `sb-${ref}-auth-token`
  const enc = 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64url'); const MAX = 3180
  if (enc.length <= MAX) return `${key}=${enc}`
  const parts: string[] = []; for (let i = 0, n = 0; i < enc.length; i += MAX, n++) parts.push(`${key}.${n}=${enc.slice(i, i + MAX)}`); return parts.join('; ')
}
async function ask(ck: string, message: string): Promise<string> {
  const r = await fetch(`${SITE}/api/advisor/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ message, sessionId: randomUUID() }) })
  return ((await r.json()) as any).reply ?? ''
}
const has = (t: string, re: RegExp) => re.test(t)

async function main() {
  const ck = cookie(await mint())

  console.log('=== A) plano cloud (perfil=Azure): nao pode presumir AWS/GCP ===')
  const a = await ask(ck, 'Monte um plano de ação com passos concretos para migrarmos nossa criptografia para pós-quântica.')
  console.log(a + '\n')
  console.log(`  menciona AWS/Amazon?   ${has(a, /\bAWS\b|Amazon Web Services/i) ? 'SIM (VIOLACAO: nao esta no perfil)' : 'nao'}`)
  console.log(`  menciona GCP/Google?   ${has(a, /\bGCP\b|Google Cloud/i) ? 'SIM (VIOLACAO)' : 'nao'}`)
  console.log(`  menciona Azure (perfil)? ${has(a, /Azure/i) ? 'sim (ok, esta no perfil)' : 'nao (usou agnostico)'}`)

  console.log('\n=== B) ferramenta NAO informada (observabilidade/SIEM): agnostico ou pergunta ===')
  const b = await ask(ck, 'Precisamos escolher e implantar observabilidade e um SIEM. Monte o roadmap com passos concretos.')
  console.log(b + '\n')
  const tools = b.match(/Datadog|Splunk|New Relic|Grafana|Elastic|Dynatrace|Sentry|QRadar|Sentinel|Prometheus|Wazuh/gi)
  console.log(`  nomeia produto especifico? ${tools ? 'SIM -> ' + [...new Set(tools.map(s => s.toLowerCase()))].join(', ') + ' (checar se rotulado hipotetico ou dito como "a de voces")' : 'nao (agnostico)'}`)
  console.log(`  fraseado agnostico/pergunta? ${has(b, /sua ferramenta|ferramenta que voc[eê]s|qual ferramenta|que voc[eê]s (usam|escolher)|seu SIEM|o SIEM que|depende de qual/i) ? 'sim' : 'checar no texto'}`)

  console.log('\n=== C) dado no perfil (setor=Tecnologia, porte=51-200): usa sem re-perguntar ===')
  const c = await ask(ck, 'Considerando o nosso porte e setor, por onde começar com IA agêntica?')
  console.log(c + '\n')
  console.log(`  re-pergunta setor/porte? ${has(c, /qual (o )?(seu|o) setor|qual (o )?porte|what.{0,10}sector|how many (employees|people)|quantos funcion/i) ? 'SIM (ruim: ja esta no perfil)' : 'nao (bom)'}`)
  console.log(`  usa contexto tecnologia/porte? ${has(c, /tecnologia|51-200|m[eé]dio porte|seu porte|seu setor/i) ? 'sim' : 'checar no texto'}`)
}
main().catch(e => { console.error(e); process.exit(1) })
