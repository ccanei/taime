'use client'

import { buildExportData, buildPlanPdf, buildPlanWorkbook } from '@/lib/plan-export-core'
import type { PlanRecord } from '@/lib/advisor-plan'

// Wrapper client da exportacao: import DINAMICO de jspdf/exceljs (sob demanda, fora
// do bundle da pagina) e disparo do download. A montagem do documento vive no nucleo
// puro (plan-export-core), reutilizavel e testavel.

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportPlanPDF(plan: PlanRecord, isPt: boolean): Promise<void> {
  const data = buildExportData(plan, isPt)
  const { jsPDF } = await import('jspdf')
  const doc = buildPlanPdf(jsPDF, data)
  doc.save(`${data.fileName}.pdf`)
}

export async function exportPlanXLSX(plan: PlanRecord, isPt: boolean): Promise<void> {
  const data = buildExportData(plan, isPt)
  const ExcelJS = (await import('exceljs')).default
  const wb = buildPlanWorkbook(ExcelJS, data)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  triggerDownload(blob, `${data.fileName}.xlsx`)
}
