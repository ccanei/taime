#!/usr/bin/env npx ts-node
/*
 * snapshot-shadow-verdicts.ts  -  congela o veredito da 1a passada do judge.
 * Le validation_verdict/validation_flags de TODOS os reports das 11 sombras e grava
 * em reanalysis-pass1.json. RODAR ANTES da 2a passada (validate sobrescreve esses campos).
 * Nao altera nada no banco (so leitura + escrita de arquivo local).
 */
import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
import { writeFileSync } from 'fs'

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
const OUT = process.env.SNAPSHOT_OUT ?? 'reanalysis-pass1.json'

export const SHADOWS = [
  '2026-01-08', '2026-01-23', '2026-02-08', '2026-02-23', '2026-03-08',
  '2026-03-23', '2026-04-08', '2026-04-23', '2026-05-08', '2026-05-23', '2026-06-08',
]

type Flag = { id?: string; severity?: string }
interface RepRow { id: string; report_number: number; status: string; validation_verdict: string | null; validation_flags: Flag[] | null }
export interface RepSnap { id: string; report_number: number; status: string; verdict: string | null; blocking: number; warning: number; info: number; flagIds: string[] }

async function get<T>(p: string): Promise<T[]> {
  const r = await fetch(`${SUPA}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json() as Promise<T[]>
}
export function summarizeFlags(flags: Flag[] | null): { blocking: number; warning: number; info: number; flagIds: string[] } {
  const f = Array.isArray(flags) ? flags : []
  const by = (s: string) => f.filter(x => x.severity === s).length
  return { blocking: by('blocking'), warning: by('warning'), info: by('info'), flagIds: f.map(x => x.id ?? '?').sort() }
}
export async function snapshot(): Promise<Record<string, RepSnap[]>> {
  const out: Record<string, RepSnap[]> = {}
  for (const shadow of SHADOWS) {
    const reps = await get<RepRow>(`reports?period=eq.${shadow}&select=id,report_number,status,validation_verdict,validation_flags&order=report_number.asc`)
    out[shadow] = reps.map(r => ({ id: r.id, report_number: r.report_number, status: r.status, verdict: r.validation_verdict, ...summarizeFlags(r.validation_flags) }))
  }
  return out
}

async function main() {
  const snap = await snapshot()
  writeFileSync(OUT, JSON.stringify(snap, null, 2))
  let n = 0
  for (const [shadow, reps] of Object.entries(snap)) {
    for (const r of reps) { n++; console.log(`${shadow} #${r.report_number} [${r.status}] verdict=${r.verdict} blocking=${r.blocking} warning=${r.warning}`) }
  }
  console.log(`\n✓ ${n} reports em ${SHADOWS.length} sombras -> ${OUT}`)
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
