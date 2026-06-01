import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import ReportsAdmin from './ReportsAdmin'
import type { ReportRecord } from './ReportsAdmin'

async function getReports(): Promise<ReportRecord[]> {
  const supabase = createSupabaseService()
  const { data } = await supabase
    .from('reports')
    .select('id, period, period_label, report_number, status, title_pt_br, validation_verdict, validation_flags, signal_count, created_at, published_at')
    .order('period', { ascending: false })
    .order('report_number', { ascending: true })
  return (data as ReportRecord[]) ?? []
}

export default async function AdminReportsPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const records = await getReports()

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
              ← Dashboard
            </Link>
            <span className="text-zinc-200">/</span>
            <span className="text-sm font-semibold text-zinc-900">Relatórios</span>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-taime-50 text-taime-700 font-semibold border border-taime-100">
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">Curadoria de relatórios</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Relatórios validados sem flags são publicados automaticamente. Os sinalizados ficam
            aqui aguardando sua revisão. Clique em um relatório para ler o conteúdo completo antes de decidir.
          </p>
        </div>

        <ReportsAdmin initialRecords={records} />
      </main>
    </div>
  )
}
