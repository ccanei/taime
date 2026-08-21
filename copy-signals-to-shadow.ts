#!/usr/bin/env npx ts-node
/*
 * copy-signals-to-shadow.ts  -  Piloto de RE-ANALISE (sem recoleta)
 *
 * Copia os signals de um periodo REAL para um periodo-SOMBRA (que nao existe no
 * calendario), para o pipeline atual re-processar a mesma materia-prima sem Serper.
 * SO INSERE novas linhas sob a sombra; NUNCA toca (update/delete) o periodo real.
 * Cada copia: novo id (default do banco), period = sombra, is_noise = false (reset,
 * o filter do piloto marca is_noise SO nas copias), metadata.origin='reanalysis_pilot'
 * e metadata.source_signal_id = id de origem. Demais campos preservados.
 *
 * Uso: SOURCE_PERIOD=2026-03-01 SHADOW_PERIOD=2026-03-08 npx ts-node copy-signals-to-shadow.ts
 *      (--force reinsere mesmo se a sombra ja tiver signals)
 */
import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const SOURCE = process.env.SOURCE_PERIOD ?? '2026-03-01'
const SHADOW = process.env.SHADOW_PERIOD ?? '2026-03-08'
const FORCE = process.argv.includes('--force')
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' }

// Guarda dura: a sombra precisa ser um dia != 01/16 (nunca um periodo real de producao).
const day = parseInt(SHADOW.split('-')[2] ?? '0', 10)
if (day === 1 || day === 16) { console.error(`✗ SHADOW_PERIOD=${SHADOW} parece um periodo REAL (dia 01/16). Recusando.`); process.exit(1) }

interface Signal { id: string; source_id: string | null; title: string | null; url: string | null; content: string | null; summary: string | null; metadata: Record<string, unknown> | null; collected_at: string | null }

async function getAll(): Promise<Signal[]> {
  const out: Signal[] = []
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${SUPA}/rest/v1/signals?period=eq.${SOURCE}&select=id,source_id,title,url,content,summary,metadata,collected_at&order=id.asc&limit=1000&offset=${offset}`, { headers: H })
    if (!r.ok) throw new Error(`GET signals: ${r.status} ${await r.text()}`)
    const batch = await r.json() as Signal[]
    out.push(...batch)
    if (batch.length < 1000) break
  }
  return out
}
async function countShadow(): Promise<number> {
  const r = await fetch(`${SUPA}/rest/v1/signals?period=eq.${SHADOW}&select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  return parseInt((r.headers.get('content-range') ?? '').split('/')[1] ?? '0', 10)
}
async function insert(rows: unknown[]): Promise<void> {
  const r = await fetch(`${SUPA}/rest/v1/signals`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(rows) })
  if (!r.ok) throw new Error(`INSERT signals: ${r.status} ${(await r.text()).slice(0, 200)}`)
}

async function main() {
  console.log(`Copia de sinais: ${SOURCE} (real, so leitura) -> ${SHADOW} (sombra, insert)`)
  const existing = await countShadow()
  if (existing > 0 && !FORCE) { console.error(`✗ ${SHADOW} ja tem ${existing} signals. Limpe a sombra ou use --force. Recusando p/ nao duplicar.`); process.exit(1) }

  const src = await getAll()
  console.log(`origem: ${src.length} signals`)
  const copies = src.map(s => ({
    source_id:    s.source_id,
    period:       SHADOW,
    title:        s.title,
    url:          s.url,
    content:      s.content,
    summary:      s.summary,
    is_noise:     false,                       // reset: o filter do piloto decide de novo
    collected_at: s.collected_at,
    metadata:     { ...(s.metadata ?? {}), origin: 'reanalysis_pilot', source_period: SOURCE, source_signal_id: s.id },
  }))

  const BATCH = 100
  let done = 0
  for (let i = 0; i < copies.length; i += BATCH) {
    await insert(copies.slice(i, i + BATCH))
    done += Math.min(BATCH, copies.length - i)
    process.stdout.write(`\r  inseridos ${done}/${copies.length}`)
  }
  console.log(`\n✓ ${done} copias inseridas sob ${SHADOW} (origin=reanalysis_pilot). Nada do periodo real foi alterado.`)
}
main().catch(e => { console.error(e); process.exit(1) })
