#!/usr/bin/env npx ts-node
/*
 * compare-shadow-verdicts.ts  -  compara 1a vs 2a passada do judge (robustez).
 * Le reanalysis-pass1.json (congelado antes da 2a passada) e o estado atual do banco
 * (2a passada, ja re-validada), e reporta:
 *   - PASS duplo (verdict=pass nas duas) = robusto;
 *   - divergencias de verdict entre passadas;
 *   - divergencias no conjunto de flags (mesmo com verdict igual).
 * So leitura. O judge e nao-deterministico, entao divergencia nao e bug: e o sinal medido.
 */
import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' })
import { readFileSync } from 'fs'
import { snapshot, RepSnap } from './snapshot-shadow-verdicts'

const IN = process.env.SNAPSHOT_OUT ?? 'reanalysis-pass1.json'

function key(shadow: string, n: number) { return `${shadow}#${n}` }

async function main() {
  const pass1 = JSON.parse(readFileSync(IN, 'utf8')) as Record<string, RepSnap[]>
  const pass2 = await snapshot()

  const p1: Record<string, RepSnap> = {}, p2: Record<string, RepSnap> = {}
  for (const [s, reps] of Object.entries(pass1)) for (const r of reps) p1[key(s, r.report_number)] = r
  for (const [s, reps] of Object.entries(pass2)) for (const r of reps) p2[key(s, r.report_number)] = r

  const keys = [...new Set([...Object.keys(p1), ...Object.keys(p2)])].sort()
  let doublePass = 0, verdictDiverge = 0, flagDiverge = 0, missing = 0
  const rows: string[] = []
  console.log('report            | pass1                 | pass2                 | robustez')
  for (const k of keys) {
    const a = p1[k], b = p2[k]
    if (!a || !b) { missing++; console.log(`${k.padEnd(17)} | ${a ? 'ok' : 'FALTA'} | ${b ? 'ok' : 'FALTA'} | so em uma passada`); continue }
    const va = `${a.verdict}(b${a.blocking}/w${a.warning})`, vb = `${b.verdict}(b${b.blocking}/w${b.warning})`
    const verdictSame = a.verdict === b.verdict
    const flagsSame = JSON.stringify(a.flagIds) === JSON.stringify(b.flagIds)
    let robust: string
    if (a.verdict === 'pass' && b.verdict === 'pass') { doublePass++; robust = 'PASS DUPLO' }
    else if (!verdictSame) { verdictDiverge++; robust = 'DIVERGE verdict' }
    else if (!flagsSame) { flagDiverge++; robust = 'mesmo verdict, flags diferem' }
    else robust = 'estavel (nao-pass)'
    rows.push(`${k.padEnd(17)} | ${va.padEnd(21)} | ${vb.padEnd(21)} | ${robust}`)
    if (!flagsSame) rows.push(`    flags p1=[${a.flagIds.join(',')}] p2=[${b.flagIds.join(',')}]`)
  }
  for (const r of rows) console.log(r)
  console.log(`\n=== RESUMO 2 PASSADAS ===`)
  console.log(`reports comparados: ${keys.length}`)
  console.log(`PASS DUPLO (robusto): ${doublePass}`)
  console.log(`verdict divergente entre passadas: ${verdictDiverge}`)
  console.log(`mesmo verdict, conjunto de flags diferente: ${flagDiverge}`)
  console.log(`presente em so uma passada: ${missing}`)
}
main().catch(e => { console.error(e); process.exit(1) })
