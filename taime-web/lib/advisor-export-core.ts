// Nucleo PURO da exportacao de ROI e checklist a partir de respostas do Advisor. SEM
// 'use client' e SEM import runtime das libs pesadas: recebe o construtor jsPDF e o
// namespace ExcelJS como parametros (o wrapper client faz o import dinamico). Mesma
// abordagem e mesma identidade visual do lib/plan-export-core.ts. Nunca inventa dado:
// campo ausente vira celula vazia com placeholder editavel.
import type { jsPDF as JsPDFType, jsPDFOptions } from 'jspdf'
import type ExcelJS from 'exceljs'
import type { RoiData, ChecklistData, CsvData } from '@/lib/advisor-export-detect'

type JsPDFCtor = new (opts?: jsPDFOptions) => JsPDFType

// ── Identidade visual (mesmos tons do plan-export-core, para consistencia) ────
type RGB = [number, number, number]
const BRAND: RGB = [29, 78, 216]
const BRAND_DK: RGB = [30, 64, 175]
const BRAND_LT: RGB = [240, 244, 255]
const INK: RGB = [24, 24, 27]
const INK2: RGB = [39, 39, 42]
const MUTE: RGB = [113, 113, 122]
const FAINT: RGB = [161, 161, 170]
const AMBER: RGB = [180, 83, 9]
const LINE: RGB = [228, 228, 231]

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1D4ED8' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } }
const INPUT_FILL  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF3C7' } } // amber-100: celula editavel
const THIN_BORDER = {
  top:    { style: 'thin' as const, color: { argb: 'FFE4E4E7' } },
  left:   { style: 'thin' as const, color: { argb: 'FFE4E4E7' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFE4E4E7' } },
  right:  { style: 'thin' as const, color: { argb: 'FFE4E4E7' } },
}

// ── Nome de arquivo: tipo + tema saneado + data ISO ───────────────────────────
export function exportFileName(kind: 'roi' | 'checklist', theme: string, isPt: boolean, now: Date): string {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const raw = (theme || (isPt ? 'advisor' : 'advisor'))
    .replace(/[\/\\:*?"<>| -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[ .]+$/g, '')
    .slice(0, 50)
    .replace(/\s/g, '-')
    .toLowerCase()
  return `${kind}-${raw || 'advisor'}-${iso}`
}

function dateLabel(isPt: boolean, now: Date): string {
  return now.toLocaleDateString(isPt ? 'pt-BR' : 'en-US', { day: '2-digit', month: 'long', year: 'numeric' })
}

// Titulo curto derivado do tema da conversa (a pergunta do cliente, geralmente).
function deriveTitle(theme: string, fallback: string): string {
  const t = (theme || '').replace(/\s+/g, ' ').trim().replace(/[?.!:]+$/, '')
  if (!t) return fallback
  return t.length > 70 ? t.slice(0, 69).trimEnd() + '…' : t
}

// ════════════════════════════════════════════════════════════════════════════
//  ROI
// ════════════════════════════════════════════════════════════════════════════

export interface RoiExportMeta { theme: string; isPt: boolean; now?: Date }

// ── ROI: PDF estatico (para circular) ────────────────────────────────────────
export function buildRoiPdf(JsPDF: JsPDFCtor, roi: RoiData, meta: RoiExportMeta): JsPDFType {
  const isPt = meta.isPt
  const now  = meta.now ?? new Date()
  const doc = new JsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 48
  const contentW = pageW - 2 * M
  const footerH = 40
  let y = M

  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])
  const ink  = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const draw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])
  const need = (h: number) => { if (y + h > pageH - footerH) { doc.addPage(); y = M } }
  const money = (n: number) => `R$ ${n.toLocaleString(isPt ? 'pt-BR' : 'en-US', { maximumFractionDigits: 0 })}`
  const TBD = isPt ? 'a preencher' : 'to fill in'

  // Cabecalho
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); ink(BRAND)
  doc.text('TAIME', M, y + 16)
  const wMark = doc.getTextWidth('TAIME')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); ink(FAINT)
  doc.text('Executive Advisor', M + wMark + 8, y + 16)
  y += 32
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); ink(INK)
  const title = deriveTitle(meta.theme, isPt ? 'Cálculo de ROI' : 'ROI estimate')
  for (const ln of doc.splitTextToSize(title, contentW)) { doc.text(ln, M, y + 12); y += 20 }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); ink(FAINT)
  doc.text(isPt ? `Cálculo de ROI · ${dateLabel(isPt, now)}` : `ROI estimate · ${dateLabel(isPt, now)}`, M, y + 8); y += 20
  draw(BRAND); doc.setLineWidth(1); doc.line(M, y, pageW - M, y); y += 18

  // Bloco: seus numeros
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); ink(BRAND_DK)
  doc.text(isPt ? 'Seus números' : 'Your numbers', M, y + 4); y += 18
  const rowsInput: Array<[string, string]> = [
    [isPt ? 'Horas por mês' : 'Hours per month', roi.inputs.hoursPerMonth !== null ? String(roi.inputs.hoursPerMonth) : TBD],
    [isPt ? 'Custo por hora' : 'Cost per hour',   roi.inputs.costPerHour !== null ? money(roi.inputs.costPerHour) : TBD],
    [isPt ? 'Esforço mensal' : 'Monthly effort',  roi.baseMonthly !== null ? money(roi.baseMonthly) : TBD],
    [isPt ? 'Esforço anual' : 'Annual effort',    roi.baseMonthly !== null ? money(roi.baseMonthly * 12) : TBD],
  ]
  doc.setFontSize(10)
  for (const [k, v] of rowsInput) {
    need(16)
    doc.setFont('helvetica', 'normal'); ink(MUTE); doc.text(k, M, y + 8)
    doc.setFont('helvetica', 'bold'); ink(INK2); doc.text(v, M + 200, y + 8)
    y += 16
  }
  y += 8

  // Bloco: cenarios
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); ink(BRAND_DK)
  doc.text(isPt ? 'Cenários de captura' : 'Capture scenarios', M, y + 4); y += 16
  // cabecalho da tabela
  fill(BRAND_LT); doc.rect(M, y, contentW, 18, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); ink(BRAND_DK)
  doc.text(isPt ? 'Cenário' : 'Scenario', M + 6, y + 12)
  doc.text('%', M + 200, y + 12)
  doc.text(isPt ? 'Mensal' : 'Monthly', M + 260, y + 12)
  doc.text(isPt ? 'Anual' : 'Annual', M + 380, y + 12)
  y += 18
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); ink(INK2)
  const scen = roi.scenarios.length ? roi.scenarios : [{ label: isPt ? 'conservador' : 'conservative', pct: null }, { label: isPt ? 'otimista' : 'optimistic', pct: null }]
  for (const s of scen) {
    need(16)
    const pctStr = s.pct !== null ? `${Math.round(s.pct * 100)}%` : TBD
    const mensal = (roi.baseMonthly !== null && s.pct !== null) ? money(roi.baseMonthly * s.pct) : TBD
    const anual  = (roi.baseMonthly !== null && s.pct !== null) ? money(roi.baseMonthly * 12 * s.pct) : TBD
    doc.text(capitalize(s.label), M + 6, y + 8)
    doc.text(pctStr, M + 200, y + 8)
    doc.text(mensal, M + 260, y + 8)
    doc.text(anual, M + 380, y + 8)
    draw(LINE); doc.setLineWidth(0.5); doc.line(M, y + 12, pageW - M, y + 12)
    y += 16
  }
  y += 12

  // EXIT
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); ink(AMBER)
  doc.text(isPt ? 'CRITÉRIO DE EXIT (parada do piloto)' : 'EXIT CRITERION (pilot stop)', M, y + 4); y += 14
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); ink(INK2)
  const exitText = roi.exit ?? (isPt ? 'Defina a condição de parada do piloto e a data de avaliação.' : 'Define the pilot stop condition and the evaluation date.')
  for (const ln of doc.splitTextToSize(exitText, contentW)) { need(14); doc.text(ln, M, y + 8); y += 14 }
  y += 14

  // Nota
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); ink(MUTE)
  const note = isPt
    ? `Baseado nos dados fornecidos em ${dateLabel(isPt, now)}. Cenários para raciocinar, não uma previsão de retorno.`
    : `Based on the data provided on ${dateLabel(isPt, now)}. Scenarios to reason with, not a forecast of the return.`
  for (const ln of doc.splitTextToSize(note, contentW)) { need(12); doc.text(ln, M, y + 8); y += 12 }

  footer(doc, isPt, M, pageW, pageH, footerH, draw, ink)
  return doc
}

// ── ROI: XLSX com formulas (para trabalhar) ──────────────────────────────────
export function buildRoiWorkbook(ExcelJSNS: typeof ExcelJS, roi: RoiData, meta: RoiExportMeta): ExcelJS.Workbook {
  const isPt = meta.isPt
  const now  = meta.now ?? new Date()
  const wb = new ExcelJSNS.Workbook()
  wb.creator = 'TAIME Executive Advisor'

  const ws = wb.addWorksheet(isPt ? 'Cenários' : 'Scenarios')
  ws.getColumn(1).width = 30
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 18
  ws.getColumn(4).width = 18

  const CUR = '#,##0'
  const setInput = (cell: ExcelJS.Cell, value: number | null, note: string) => {
    if (value !== null) cell.value = value
    else cell.note = note
    cell.fill = INPUT_FILL
    cell.border = THIN_BORDER
    cell.numFmt = CUR
  }

  // Cabecalho
  ws.mergeCells('A1:D1')
  ws.getCell('A1').value = 'TAIME Executive Advisor'
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1D4ED8' } }
  ws.mergeCells('A2:D2')
  ws.getCell('A2').value = deriveTitle(meta.theme, isPt ? 'Cálculo de ROI' : 'ROI estimate')
  ws.getCell('A2').font = { bold: true, size: 11 }
  ws.mergeCells('A3:D3')
  ws.getCell('A3').value = `${isPt ? 'Cálculo de ROI' : 'ROI estimate'} · ${dateLabel(isPt, now)}`
  ws.getCell('A3').font = { size: 9, color: { argb: 'FFA1A1AA' } }

  // Seus numeros (linhas 5..9). Inputs em amarelo; esforcos em formula.
  ws.getCell('A5').value = isPt ? 'Seus números (edite as células amarelas)' : 'Your numbers (edit the yellow cells)'
  ws.getCell('A5').font = { bold: true, color: { argb: 'FF1E40AF' } }

  ws.getCell('A6').value = isPt ? 'Horas por mês' : 'Hours per month'
  setInput(ws.getCell('B6'), roi.inputs.hoursPerMonth, isPt ? 'Preencha com suas horas por mês' : 'Fill in your hours per month')

  ws.getCell('A7').value = isPt ? 'Custo por hora (R$)' : 'Cost per hour (R$)'
  setInput(ws.getCell('B7'), roi.inputs.costPerHour, isPt ? 'Preencha com seu custo por hora' : 'Fill in your cost per hour')

  ws.getCell('A8').value = isPt ? 'Volume / multiplicador' : 'Volume / multiplier'
  const vol = ws.getCell('B8'); vol.value = 1; vol.fill = INPUT_FILL; vol.border = THIN_BORDER
  vol.note = isPt ? 'Multiplicador opcional (ex: nº de pessoas). Padrão 1.' : 'Optional multiplier (e.g. headcount). Default 1.'

  ws.getCell('A9').value = isPt ? 'Esforço mensal (R$)' : 'Monthly effort (R$)'
  const em = ws.getCell('B9'); em.value = { formula: 'B6*B7*B8' }; em.numFmt = CUR; em.font = { bold: true }
  ws.getCell('A10').value = isPt ? 'Esforço anual (R$)' : 'Annual effort (R$)'
  const ey = ws.getCell('B10'); ey.value = { formula: 'B9*12' }; ey.numFmt = CUR; ey.font = { bold: true }

  // Cenarios (cabecalho na linha 12; dados a partir de 13). Celulas setadas
  // explicitamente (A12..D12) para evitar o off-by-one de row.values.
  const headLabels: Array<[string, string]> = [
    ['A12', isPt ? 'Cenário' : 'Scenario'],
    ['B12', isPt ? '% captura' : 'Capture %'],
    ['C12', isPt ? 'Mensal (R$)' : 'Monthly (R$)'],
    ['D12', isPt ? 'Anual (R$)' : 'Annual (R$)'],
  ]
  for (const [addr, val] of headLabels) {
    const c = ws.getCell(addr); c.value = val; c.font = HEADER_FONT; c.fill = HEADER_FILL
  }

  const scen = roi.scenarios.length ? roi.scenarios : [{ label: isPt ? 'conservador' : 'conservative', pct: null }, { label: isPt ? 'otimista' : 'optimistic', pct: null }]
  let r = 13
  for (const s of scen) {
    ws.getCell(`A${r}`).value = capitalize(s.label)
    const pctCell = ws.getCell(`B${r}`)
    if (s.pct !== null) pctCell.value = s.pct
    else pctCell.note = isPt ? 'Preencha o % de captura' : 'Fill in the capture %'
    pctCell.numFmt = '0%'; pctCell.fill = INPUT_FILL; pctCell.border = THIN_BORDER
    ws.getCell(`C${r}`).value = { formula: `$B$9*B${r}` }; ws.getCell(`C${r}`).numFmt = CUR
    ws.getCell(`D${r}`).value = { formula: `$B$10*B${r}` }; ws.getCell(`D${r}`).numFmt = CUR
    r++
  }

  ws.getCell(`A${r + 1}`).value = isPt
    ? 'Cenários para raciocinar, não uma previsão. Ao trocar horas, custo ou %, os valores recalculam.'
    : 'Scenarios to reason with, not a forecast. Changing hours, cost or % recalculates the values.'
  ws.getCell(`A${r + 1}`).font = { italic: true, size: 9, color: { argb: 'FF71717A' } }
  ws.mergeCells(`A${r + 1}:D${r + 1}`)

  // Aba EXIT: criterio de parada + campo de data de avaliacao.
  const we = wb.addWorksheet('EXIT')
  we.getColumn(1).width = 24
  we.getColumn(2).width = 60
  we.getCell('A1').value = isPt ? 'Critério de EXIT (parada do piloto)' : 'EXIT criterion (pilot stop)'
  we.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFB45309' } }
  we.mergeCells('A1:B1')
  we.getCell('A3').value = isPt ? 'Condição de parada' : 'Stop condition'
  we.getCell('A3').font = { bold: true }
  const exitCell = we.getCell('B3')
  if (roi.exit) exitCell.value = roi.exit
  else exitCell.note = isPt ? 'Descreva a condição que encerra o piloto.' : 'Describe the condition that ends the pilot.'
  exitCell.alignment = { wrapText: true, vertical: 'top' }
  exitCell.fill = INPUT_FILL; exitCell.border = THIN_BORDER
  we.getRow(3).height = 60
  we.getCell('A5').value = isPt ? 'Data de avaliação' : 'Evaluation date'
  we.getCell('A5').font = { bold: true }
  const dateCell = we.getCell('B5')
  dateCell.note = isPt ? 'Preencha a data em que o piloto será avaliado.' : 'Fill in the date the pilot will be evaluated.'
  dateCell.fill = INPUT_FILL; dateCell.border = THIN_BORDER

  return wb
}

// ════════════════════════════════════════════════════════════════════════════
//  Checklist
// ════════════════════════════════════════════════════════════════════════════

// Agrupa os itens por secao preservando a ordem de aparicao.
function groupChecklist(list: ChecklistData): Array<{ section: string | null; items: string[] }> {
  const groups: Array<{ section: string | null; items: string[] }> = []
  for (const it of list.items) {
    const last = groups[groups.length - 1]
    if (last && last.section === it.section) last.items.push(it.text)
    else groups.push({ section: it.section, items: [it.text] })
  }
  return groups
}

export function buildChecklistPdf(JsPDF: JsPDFCtor, list: ChecklistData, meta: RoiExportMeta): JsPDFType {
  const isPt = meta.isPt
  const now  = meta.now ?? new Date()
  const doc = new JsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 48
  const contentW = pageW - 2 * M
  const footerH = 40
  let y = M
  const ink  = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const draw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])
  const need = (h: number) => { if (y + h > pageH - footerH) { doc.addPage(); y = M } }

  // Cabecalho
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); ink(BRAND)
  doc.text('TAIME', M, y + 16)
  const wMark = doc.getTextWidth('TAIME')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); ink(FAINT)
  doc.text('Executive Advisor', M + wMark + 8, y + 16)
  y += 32
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); ink(INK)
  const title = deriveTitle(meta.theme, isPt ? 'Checklist' : 'Checklist')
  for (const ln of doc.splitTextToSize(title, contentW)) { doc.text(ln, M, y + 12); y += 20 }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); ink(FAINT)
  doc.text(`Checklist · ${dateLabel(isPt, now)}`, M, y + 8); y += 20
  draw(BRAND); doc.setLineWidth(1); doc.line(M, y, pageW - M, y); y += 20

  for (const g of groupChecklist(list)) {
    if (g.section) {
      need(24)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); ink(BRAND_DK)
      for (const ln of doc.splitTextToSize(g.section, contentW)) { doc.text(ln, M, y + 4); y += 16 }
      y += 4
    }
    for (const item of g.items) {
      const lines = doc.splitTextToSize(item, contentW - 22)
      const lineH = 14
      const blockH = Math.max(20, lines.length * lineH) + 8 // espaco generoso para anotar
      need(blockH)
      // checkbox vazio para imprimir e marcar
      draw(FAINT); doc.setLineWidth(1); doc.roundedRect(M, y + 1, 11, 11, 2, 2, 'S')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); ink(INK2)
      for (let i = 0; i < lines.length; i++) doc.text(lines[i], M + 22, y + 10 + i * lineH)
      y += blockH
    }
    y += 6
  }

  footer(doc, isPt, M, pageW, pageH, footerH, draw, ink)
  return doc
}

export function buildChecklistWorkbook(ExcelJSNS: typeof ExcelJS, list: ChecklistData, meta: RoiExportMeta): ExcelJS.Workbook {
  const isPt = meta.isPt
  const wb = new ExcelJSNS.Workbook()
  wb.creator = 'TAIME Executive Advisor'
  const ws = wb.addWorksheet(isPt ? 'Checklist' : 'Checklist', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Item',                              key: 'item',  width: 56 },
    { header: isPt ? 'Responsável' : 'Owner',      key: 'resp',  width: 22 },
    { header: isPt ? 'Prazo' : 'Due date',         key: 'prazo', width: 16 },
    { header: 'Status',                             key: 'st',    width: 18 },
    { header: isPt ? 'Observações' : 'Notes',      key: 'obs',   width: 34 },
  ]
  const opts = isPt ? ['Pendente', 'Em andamento', 'Concluído'] : ['Pending', 'In progress', 'Done']
  const groups = groupChecklist(list)
  for (const g of groups) {
    if (g.section) {
      const sep = ws.addRow({ item: `▸ ${g.section}` })
      sep.getCell('item').font = { bold: true, color: { argb: 'FF1E40AF' } }
    }
    for (const item of g.items) {
      ws.addRow({ item, resp: '', prazo: '', st: opts[0], obs: '' })
    }
  }
  // header
  const head = ws.getRow(1)
  head.height = 18
  head.eachCell(c => { c.font = HEADER_FONT; c.fill = HEADER_FILL; c.alignment = { vertical: 'middle' } })
  ws.getColumn('item').alignment = { wrapText: true, vertical: 'top' }
  ws.getColumn('obs').alignment = { wrapText: true, vertical: 'top' }
  // dropdown de status
  const stCol = ws.getColumn('st').letter
  for (let rr = 2; rr <= ws.rowCount; rr++) {
    const itemCell = ws.getCell(`A${rr}`).value
    if (typeof itemCell === 'string' && itemCell.startsWith('▸')) continue // separador de secao
    ws.getCell(`${stCol}${rr}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${opts.join(',')}"`] }
  }
  return wb
}

// ════════════════════════════════════════════════════════════════════════════
//  CSV inline (planilha copiavel entregue pelo Advisor)
// ════════════════════════════════════════════════════════════════════════════

// XLSX: cada campo do CSV vira uma celula; cabecalho destacado e congelado.
export function buildCsvWorkbook(ExcelJSNS: typeof ExcelJS, csv: CsvData, meta: RoiExportMeta): ExcelJS.Workbook {
  const isPt = meta.isPt
  const wb = new ExcelJSNS.Workbook()
  wb.creator = 'TAIME Executive Advisor'
  const ws = wb.addWorksheet(isPt ? 'Planilha' : 'Sheet', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow(csv.header)
  for (const row of csv.rows) ws.addRow(row)
  const head = ws.getRow(1)
  head.height = 18
  head.eachCell(c => { c.font = HEADER_FONT; c.fill = HEADER_FILL; c.alignment = { vertical: 'middle' } })
  csv.header.forEach((h, idx) => {
    const maxLen = Math.max(h.length, ...csv.rows.map(r => (r[idx] ?? '').length))
    const col = ws.getColumn(idx + 1)
    col.width = Math.min(44, Math.max(12, maxLen + 2))
    col.alignment = { wrapText: true, vertical: 'top' }
  })
  return wb
}

// CSV bruto (texto): reconstroi o CSV com aspas onde necessario (virgula, aspas ou
// quebra de linha no campo). Para o cliente colar direto no Excel.
export function csvToString(csv: CsvData): string {
  const esc = (f: string) => /[",\n\r]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f
  return [csv.header, ...csv.rows].map(row => row.map(esc).join(',')).join('\r\n')
}

// ── util ──────────────────────────────────────────────────────────────────────
function capitalize(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

function footer(
  doc: JsPDFType, isPt: boolean, M: number, pageW: number, pageH: number, footerH: number,
  draw: (c: RGB) => void, ink: (c: RGB) => void,
) {
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    draw(LINE); doc.setLineWidth(0.5); doc.line(M, pageH - footerH + 8, pageW - M, pageH - footerH + 8)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); ink(FAINT)
    doc.text(isPt ? 'Gerado pelo TAIME Executive Advisor' : 'Generated by the TAIME Executive Advisor', M, pageH - footerH + 22)
    const pg = `${isPt ? 'Página' : 'Page'} ${i}/${pages}`
    doc.text(pg, pageW - M - doc.getTextWidth(pg), pageH - footerH + 22)
  }
}
