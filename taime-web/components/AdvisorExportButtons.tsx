'use client'

import { useState, useEffect } from 'react'
import { FileSpreadsheet, FileText, Table, Loader2 } from 'lucide-react'
import { detectRoi, detectChecklist, detectCsv, detectMarkdownTable } from '@/lib/advisor-export-detect'
import {
  exportRoiPDF, exportRoiXLSX, exportChecklistPDF, exportChecklistXLSX,
  exportCsvXLSX, exportCsvRaw, exportMarkdownTableXLSX, exportMarkdownTablePDF,
} from '@/lib/advisor-export'

// Botoes de exportacao que aparecem SO quando a resposta contem conteudo exportavel
// (ROI, checklist markdown, ou CSV inline), ao lado do feedback. Deteccao client-side
// sobre o markdown bruto. Geracao sob demanda (import dinamico no clique). Conservador:
// nada aparece sem sinal claro.

type IconKind = 'xlsx' | 'pdf' | 'csv'
interface ExportAction { key: string; label: string; icon: IconKind; run: () => Promise<void> }

const ICON: Record<IconKind, typeof FileSpreadsheet> = { xlsx: FileSpreadsheet, pdf: FileText, csv: Table }

function ExportGroup({ label, isPt, actions }: { label: string; isPt: boolean; actions: ExportAction[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr]   = useState(false)

  async function run(a: ExportAction) {
    if (busy) return
    setErr(false); setBusy(a.key)
    try { await a.run() }
    catch { setErr(true) }
    finally { setBusy(null) }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-zinc-400">{label}</span>
      {actions.map(a => {
        const Icon = ICON[a.icon]
        return (
          <button
            key={a.key}
            onClick={() => void run(a)}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-semibold
                       text-zinc-600 hover:text-taime-700 hover:border-taime-200 disabled:opacity-50 transition-colors"
          >
            {busy === a.key ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
            {a.label}
          </button>
        )
      })}
      {err && <span className="text-[11px] text-red-500">{isPt ? 'Falhou, tente de novo' : 'Failed, try again'}</span>}
    </span>
  )
}

export default function AdvisorExportButtons({
  answer, theme, isPt,
}: {
  answer: string
  theme:  string
  isPt:   boolean
}) {
  const hasRoi       = detectRoi(answer)
  const hasChecklist = detectChecklist(answer)
  const hasCsv       = detectCsv(answer)
  // Tabela markdown estruturada (inventario/checklist com |). detectMarkdownTable ja
  // exclui roadmap e ROI (prioridade roadmap > ROI > checklist).
  const hasTable     = detectMarkdownTable(answer)

  // Log de diagnostico da deteccao por resposta (visivel no console do browser). Ajuda
  // a investigar futuros casos onde um botao esperado nao aparece. Uma vez por resposta.
  useEffect(() => {
    console.debug('[advisor-export] detect', { roi: hasRoi, checklist: hasChecklist, csv: hasCsv, table: hasTable, len: answer.length })
  }, [answer, hasRoi, hasChecklist, hasCsv, hasTable])

  if (!hasRoi && !hasChecklist && !hasCsv && !hasTable) return null

  // Grupo checklist: uma so origem por vez, na ordem lista markdown > CSV inline >
  // tabela markdown. XLSX sempre; PDF para lista e para tabela; CSV bruto para CSV inline.
  const checklistActions: ExportAction[] = []
  if (hasChecklist || hasCsv || hasTable) {
    checklistActions.push({
      key: 'chk-xlsx', label: 'XLSX', icon: 'xlsx',
      run: () => (hasChecklist
        ? exportChecklistXLSX(answer, theme, isPt)
        : hasCsv
          ? exportCsvXLSX(answer, theme, isPt)
          : exportMarkdownTableXLSX(answer, theme, isPt)),
    })
    if (hasChecklist) {
      checklistActions.push({ key: 'chk-pdf', label: 'PDF', icon: 'pdf', run: () => exportChecklistPDF(answer, theme, isPt) })
    } else if (hasTable) {
      checklistActions.push({ key: 'chk-pdf', label: 'PDF', icon: 'pdf', run: () => exportMarkdownTablePDF(answer, theme, isPt) })
    }
    if (hasCsv) {
      checklistActions.push({ key: 'chk-csv', label: 'CSV', icon: 'csv', run: () => exportCsvRaw(answer, theme, isPt) })
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      {hasRoi && (
        <ExportGroup
          label={isPt ? 'Exportar ROI' : 'Export ROI'}
          isPt={isPt}
          actions={[
            { key: 'roi-xlsx', label: 'XLSX', icon: 'xlsx', run: () => exportRoiXLSX(answer, theme, isPt) },
            { key: 'roi-pdf',  label: 'PDF',  icon: 'pdf',  run: () => exportRoiPDF(answer, theme, isPt) },
          ]}
        />
      )}
      {checklistActions.length > 0 && (
        <ExportGroup label={isPt ? 'Exportar checklist' : 'Export checklist'} isPt={isPt} actions={checklistActions} />
      )}
    </div>
  )
}
