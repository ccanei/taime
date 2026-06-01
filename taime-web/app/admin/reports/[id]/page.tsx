import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import ReportClient from '@/components/ReportClient'
import ReviewPanel from './ReviewPanel'
import type { Report, ReportTrend } from '@/lib/types'
import type { ValidationFlag } from '../ReportsAdmin'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * Busca o relatório por id SEM filtrar por status (service key).
 * Diferente do /reports/[id] público, que só mostra 'published'.
 * Aqui o admin precisa ler pendentes, recusados e arquivados.
 */
async function getReport(id: string): Promise<{ report: Report; trends: ReportTrend[] } | null> {
  const supabase = createSupabaseService()
  const [{ data: report }, { data: trends }] = await Promise.all([
    supabase.from('reports').select('*').eq('id', id).maybeSingle(),
    supabase.from('report_trends').select('*').eq('report_id', id).order('rank', { ascending: true }),
  ])
  if (!report) return null
  return { report: report as Report, trends: (trends ?? []) as ReportTrend[] }
}

export default async function AdminReportDetail({ params }: Props) {
  const { id } = await params

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const data = await getReport(id)
  if (!data) notFound()

  const { report, trends } = data
  // validation_flags vem da tabela reports (coluna jsonb)
  const flags = ((report as unknown as { validation_flags?: ValidationFlag[] }).validation_flags) ?? []
  const verdict = (report as unknown as { validation_verdict?: string }).validation_verdict ?? null
  const signalCount = (report as unknown as { signal_count?: number }).signal_count ?? null

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/admin/reports" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
            ← Fila
          </Link>
          <span className="text-zinc-200">/</span>
          <span className="text-sm font-semibold text-zinc-900">Revisão de relatório</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Painel de validação + ações (client) */}
        <ReviewPanel
          reportId={report.id}
          status={report.status}
          verdict={verdict}
          flags={flags}
          signalCount={signalCount}
          trends={trends as unknown as Record<string, unknown>[]}
        />

        {/* Viewer real, exatamente como o usuário veria */}
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <ReportClient report={report} trends={trends} />
        </div>
      </main>
    </div>
  )
}
