#!/usr/bin/env npx ts-node
/*
 * shadow-report-exists.ts  -  gate de retomada do batch de re-analise.
 * Sai 0 (sucesso) se JA existe pelo menos um report vivo (nao rejected/archived)
 * para o PERIOD dado; sai 1 caso contrario. O batch usa isso para pular periodos
 * ja concluidos sem re-rodar o pipeline inteiro.
 * Uso: PERIOD=2026-01-08 npx ts-node shadow-report-exists.ts   (ou passar como argv[2])
 */
import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const P = process.env.PERIOD ?? process.argv[2] ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }

async function main() {
  if (!P) { console.error('PERIOD nao informado'); process.exit(2) }
  const r = await fetch(`${SUPA}/rest/v1/reports?period=eq.${P}&status=neq.rejected&select=id,status`, { headers: H })
  if (!r.ok) { console.error(`GET reports: ${r.status}`); process.exit(2) }
  const rows = await r.json() as Array<{ id: string; status: string }>
  const live = rows.filter(x => x.status !== 'archived')
  if (live.length > 0) { console.log(`ja existe report vivo em ${P}: ${live.map(x => x.status).join(',')}`); process.exit(0) }
  console.log(`sem report vivo em ${P}`); process.exit(1)
}
main().catch(e => { console.error(e); process.exit(2) })
