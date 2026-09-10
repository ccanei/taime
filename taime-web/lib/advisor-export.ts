'use client'

import { extractRoi, extractChecklist } from '@/lib/advisor-export-detect'
import {
  buildRoiPdf, buildRoiWorkbook, buildChecklistPdf, buildChecklistWorkbook,
  exportFileName, type RoiExportMeta,
} from '@/lib/advisor-export-core'

// Wrapper client: import DINAMICO de jspdf/exceljs (so no clique, fora do bundle) e
// disparo do download. A montagem dos documentos vive no nucleo puro (advisor-export-core).

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

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function exportRoiPDF(answer: string, theme: string, isPt: boolean): Promise<void> {
  const roi = extractRoi(answer)
  const meta: RoiExportMeta = { theme, isPt }
  const { jsPDF } = await import('jspdf')
  const doc = buildRoiPdf(jsPDF, roi, meta)
  doc.save(`${exportFileName('roi', theme, isPt, new Date())}.pdf`)
}

export async function exportRoiXLSX(answer: string, theme: string, isPt: boolean): Promise<void> {
  const roi = extractRoi(answer)
  const meta: RoiExportMeta = { theme, isPt }
  const ExcelJS = (await import('exceljs')).default
  const wb = buildRoiWorkbook(ExcelJS, roi, meta)
  const buf = await wb.xlsx.writeBuffer()
  triggerDownload(new Blob([buf], { type: XLSX_MIME }), `${exportFileName('roi', theme, isPt, new Date())}.xlsx`)
}

export async function exportChecklistPDF(answer: string, theme: string, isPt: boolean): Promise<void> {
  const list = extractChecklist(answer)
  const meta: RoiExportMeta = { theme, isPt }
  const { jsPDF } = await import('jspdf')
  const doc = buildChecklistPdf(jsPDF, list, meta)
  doc.save(`${exportFileName('checklist', theme, isPt, new Date())}.pdf`)
}

export async function exportChecklistXLSX(answer: string, theme: string, isPt: boolean): Promise<void> {
  const list = extractChecklist(answer)
  const meta: RoiExportMeta = { theme, isPt }
  const ExcelJS = (await import('exceljs')).default
  const wb = buildChecklistWorkbook(ExcelJS, list, meta)
  const buf = await wb.xlsx.writeBuffer()
  triggerDownload(new Blob([buf], { type: XLSX_MIME }), `${exportFileName('checklist', theme, isPt, new Date())}.xlsx`)
}
