#!/usr/bin/env npx ts-node
/* Valida a rota de cron dos alertas em producao: 401 sem/errado o segredo, 200 com o
 * segredo e ?dry=1 (dry-run pela rota), reportando os stats. Nunca imprime o segredo. */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const SITE = 'https://www.taime.tech'
const URL = `${SITE}/api/cron/advisor-alerts`
const secret = process.env.CRON_SECRET ?? ''

async function status(headers: Record<string, string>, qs = ''): Promise<{ code: number; body: any }> {
  const r = await fetch(`${URL}${qs}`, { headers })
  let body: any = null
  try { body = await r.json() } catch { body = await r.text() }
  return { code: r.status, body }
}

async function main() {
  console.log('CRON_SECRET presente:', secret ? 'sim' : 'NAO')
  const noAuth = await status({})
  console.log(`sem segredo         -> HTTP ${noAuth.code} ${JSON.stringify(noAuth.body)}`)
  const badAuth = await status({ Authorization: 'Bearer wrong-secret' })
  console.log(`segredo errado      -> HTTP ${badAuth.code} ${JSON.stringify(badAuth.body)}`)
  if (secret) {
    const dry = await status({ Authorization: `Bearer ${secret}` }, '?dry=1')
    console.log(`segredo ok + dry=1  -> HTTP ${dry.code}`)
    console.log('  resposta:', JSON.stringify(dry.body, null, 2))
  } else {
    console.log('(sem CRON_SECRET local: nao da para exercitar o caminho autorizado aqui)')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
