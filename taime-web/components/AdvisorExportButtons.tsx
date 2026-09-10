'use client'

import { useState } from 'react'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { detectRoi, detectChecklist } from '@/lib/advisor-export-detect'
import { exportRoiPDF, exportRoiXLSX, exportChecklistPDF, exportChecklistXLSX } from '@/lib/advisor-export'

// Botoes de exportacao que aparecem SO quando a resposta contem conteudo exportavel
// (ROI e/ou checklist), ao lado dos botoes de feedback. Deteccao client-side sobre o
// markdown bruto da resposta. Geracao sob demanda (import dinamico no clique). Nunca
// aparece quando nao ha sinal claro (deteccao conservadora).

type Fmt = 'pdf' | 'xlsx'

function ExportGroup({
  label, isPt, onExport,
}: {
  label: string
  isPt: boolean
  onExport: (fmt: Fmt) => Promise<void>
}) {
  const [busy, setBusy] = useState<Fmt | null>(null)
  const [err, setErr]   = useState(false)

  async function run(fmt: Fmt) {
    if (busy) return
    setErr(false); setBusy(fmt)
    try { await onExport(fmt) }
    catch { setErr(true) }
    finally { setBusy(null) }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-zinc-400">{label}</span>
      <button
        onClick={() => void run('xlsx')}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-semibold
                   text-zinc-600 hover:text-taime-700 hover:border-taime-200 disabled:opacity-50 transition-colors"
      >
        {busy === 'xlsx' ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
        XLSX
      </button>
      <button
        onClick={() => void run('pdf')}
        disabled={busy !== null}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-semibold
                   text-zinc-600 hover:text-taime-700 hover:border-taime-200 disabled:opacity-50 transition-colors"
      >
        {busy === 'pdf' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
        PDF
      </button>
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
  const hasRoi = detectRoi(answer)
  const hasChecklist = detectChecklist(answer)
  if (!hasRoi && !hasChecklist) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      {hasRoi && (
        <ExportGroup
          label={isPt ? 'Exportar ROI' : 'Export ROI'}
          isPt={isPt}
          onExport={fmt => (fmt === 'pdf' ? exportRoiPDF(answer, theme, isPt) : exportRoiXLSX(answer, theme, isPt))}
        />
      )}
      {hasChecklist && (
        <ExportGroup
          label={isPt ? 'Exportar checklist' : 'Export checklist'}
          isPt={isPt}
          onExport={fmt => (fmt === 'pdf' ? exportChecklistPDF(answer, theme, isPt) : exportChecklistXLSX(answer, theme, isPt))}
        />
      )}
    </div>
  )
}
