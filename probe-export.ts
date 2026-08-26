#!/usr/bin/env npx ts-node
/* Valida a exportacao (Fase 2.2 export) usando os builders REAIS de plan-export-core
 * sobre um plano real do banco. Gera PDF+XLSX em PT e EN, escreve em /tmp e rele o
 * XLSX para dumpar a estrutura (abas, cabecalho, linhas, status refletido). */
import dotenv from 'dotenv'
import { writeFileSync } from 'fs'
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import { buildExportData, buildPlanPdf, buildPlanWorkbook } from './taime-web/lib/plan-export-core'
dotenv.config({ path: '.env.local' })

const SUPA_URL = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const FIXED = new Date('2026-08-19T12:00:00Z')  // data fixa p/ reprodutibilidade do nome

async function fetchPlan(): Promise<any> {
  const r = await fetch(`${SUPA_URL}/rest/v1/advisor_plans?select=id,title,theme,phases,status,session_id,created_at,updated_at&order=updated_at.desc&limit=20`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  const rows = await r.json() as any[]
  const withPhases = rows.find(p => Array.isArray(p.phases) && p.phases.length > 0)
  if (!withPhases) throw new Error('nenhum plano com fases encontrado')
  return withPhases
}

async function dumpXlsx(buf: ArrayBuffer, tag: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as any)
  console.log(`  [${tag}] abas: ${wb.worksheets.map(w => w.name).join(', ')}`)
  for (const ws of wb.worksheets) {
    const freeze = (ws.views?.[0] as any)?.state === 'frozen' ? 'frozen y=1' : 'none'
    console.log(`  [${tag}] "${ws.name}" linhas=${ws.rowCount} colunas=${ws.columnCount} freeze=${freeze}`)
    const header = (ws.getRow(1).values as any[]).slice(1)
    console.log(`      header: ${JSON.stringify(header)}`)
    for (let r = 2; r <= Math.min(4, ws.rowCount); r++) {
      const vals = (ws.getRow(r).values as any[]).slice(1).map(v => typeof v === 'string' ? v.slice(0, 40) : v)
      console.log(`      row${r}: ${JSON.stringify(vals)}`)
    }
    // valida dropdown de Status na aba principal
    if (ws.name === 'Plano' || ws.name === 'Plan') {
      const dv = (ws.getCell('D2') as any).dataValidation
      console.log(`      Status!D2 dataValidation: ${dv ? JSON.stringify(dv.formulae) : 'NENHUMA'}`)
    }
  }
}

async function main() {
  const plan = await fetchPlan()
  console.log(`plano: "${plan.title}" (${plan.status}) - ${plan.phases.length} fases\n`)

  for (const isPt of [true, false]) {
    const tag = isPt ? 'PT' : 'EN'
    const data = buildExportData(plan, isPt, FIXED)
    console.log(`=== ${tag} ===`)
    console.log(`  fileName: ${data.fileName}`)
    console.log(`  title:    ${data.title}`)
    console.log(`  progress: ${data.progressLine}`)
    const totalDone = data.phases.reduce((s, ph) => s + ph.actions.filter(a => a.done).length, 0)
    const totalAct  = data.phases.reduce((s, ph) => s + ph.actions.length, 0)
    console.log(`  acoes: ${totalDone}/${totalAct} done; fases: ${data.phases.map(p => `${p.num}:"${p.label.slice(0, 24)}"(${p.actions.length}a/${p.avoid.length}x)`).join(', ')}`)

    // PDF
    const doc = buildPlanPdf(jsPDF as any, data)
    const pdfBuf = Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
    const pdfPath = `/tmp/${data.fileName}.pdf`
    writeFileSync(pdfPath, pdfBuf)
    console.log(`  PDF -> ${pdfPath} (${(pdfBuf.length / 1024).toFixed(1)}kb, ${doc.getNumberOfPages()} pag)`)

    // XLSX
    const wb = buildPlanWorkbook(ExcelJS, data)
    const xbuf = await wb.xlsx.writeBuffer()
    const xPath = `/tmp/${data.fileName}.xlsx`
    writeFileSync(xPath, Buffer.from(xbuf as ArrayBuffer))
    console.log(`  XLSX -> ${xPath} (${((xbuf as ArrayBuffer).byteLength / 1024).toFixed(1)}kb)`)
    await dumpXlsx(xbuf as ArrayBuffer, tag)
    console.log('')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
