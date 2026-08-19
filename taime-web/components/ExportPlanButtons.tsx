'use client'

import { useState } from 'react'
import { exportPlanPDF, exportPlanXLSX } from '@/lib/plan-export'
import type { PlanRecord } from '@/lib/advisor-plan'

// Botoes de exportacao (PDF / XLSX) de um plano. Geracao no cliente com import
// dinamico das libs. Estados: carregando (spinner no botao) e erro breve (some
// sozinho, nao quebra a tela). compact = variante enxuta para o card do Inicio.
type Busy = 'pdf' | 'xlsx' | null

function Spinner() {
  return (
    <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function ExportPlanButtons({ plan, isPt, compact }: { plan: PlanRecord; isPt: boolean; compact?: boolean }) {
  const [busy, setBusy]   = useState<Busy>(null)
  const [error, setError] = useState(false)

  async function run(kind: 'pdf' | 'xlsx') {
    if (busy) return
    setError(false)
    setBusy(kind)
    try {
      if (kind === 'pdf') await exportPlanPDF(plan, isPt)
      else                await exportPlanXLSX(plan, isPt)
    } catch (e) {
      console.error('[plan-export] falhou (ignorado):', e instanceof Error ? e.message : e)
      setError(true)
      setTimeout(() => setError(false), 4000)
    } finally {
      setBusy(null)
    }
  }

  const base = compact
    ? 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-wait'
    : 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-wait'
  const cls = `${base} text-zinc-600 bg-white border-zinc-200 hover:bg-zinc-50 hover:text-taime-700`

  return (
    <div className="inline-flex items-center gap-2">
      {!compact && <span className="text-[11px] text-zinc-400">{isPt ? 'Exportar:' : 'Export:'}</span>}
      <button type="button" onClick={() => run('pdf')} disabled={!!busy} className={cls}
        aria-label={isPt ? 'Exportar em PDF' : 'Export as PDF'}>
        {busy === 'pdf' ? <Spinner /> : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
        )}
        PDF
      </button>
      <button type="button" onClick={() => run('xlsx')} disabled={!!busy} className={cls}
        aria-label={isPt ? 'Exportar em XLSX' : 'Export as XLSX'}>
        {busy === 'xlsx' ? <Spinner /> : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 13 6 6M15 13l-6 6" /></svg>
        )}
        {isPt ? 'Excel' : 'Excel'}
      </button>
      {error && <span className="text-[11px] text-amber-700">{isPt ? 'Falhou, tente de novo.' : 'Failed, try again.'}</span>}
    </div>
  )
}
