import { redirect } from 'next/navigation'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { AdminHeader, Section, StatCard, BarRow, StackBar, fmtInt } from '@/components/admin/kit'
import ReloadButton from '@/components/admin/ReloadButton'
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

  // Resumo executivo (server-side): contagens por status, media de sinais e
  // distribuicoes para os graficos. Payload ja agregado; a tabela densa (com as
  // acoes) segue no client component logo abaixo, sem mudanca de logica.
  const published = records.filter(r => r.status === 'published').length
  const pending   = records.filter(r => r.status === 'pending_review' || r.status === 'generating').length
  const archived  = records.filter(r => r.status === 'archived').length
  const withSig   = records.filter(r => typeof r.signal_count === 'number')
  const avgSignals = withSig.length ? withSig.reduce((s, r) => s + (r.signal_count ?? 0), 0) / withSig.length : 0

  const statusCount = new Map<string, number>()
  for (const r of records) statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1)
  const statusSegments = [...statusCount.entries()].map(([label, value]) => ({ label, value }))

  const yearCount = new Map<string, number>()
  for (const r of records) {
    const y = (r.period ?? '').slice(0, 4)
    if (y) yearCount.set(y, (yearCount.get(y) ?? 0) + 1)
  }
  const byYear = [...yearCount.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }))

  return (
    <div className="min-h-screen bg-zinc-50">
      <AdminHeader title="Relatórios" active="/admin/reports" />

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Curadoria de relatórios</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Relatórios validados sem flags são publicados automaticamente. Os sinalizados ficam
              aqui aguardando sua revisão. Clique em um relatório para ler o conteúdo completo antes de decidir.
            </p>
          </div>
          <ReloadButton />
        </div>

        {/* Resumo executivo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Publicados" value={fmtInt(published)} tone="good" />
          <StatCard label="Aguardando revisão" value={fmtInt(pending)} tone={pending ? 'warn' : undefined}
            hint={pending ? 'na fila abaixo' : 'fila limpa'} />
          <StatCard label="Arquivados" value={fmtInt(archived)} />
          <StatCard label="Sinais por relatório" value={avgSignals ? avgSignals.toFixed(0) : 'n/d'} hint="média" />
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <Section title="Distribuição por status" note="Toda a base" className="mt-0">
            <StackBar segments={statusSegments} />
          </Section>
          <Section title="Relatórios por ano" note="Contagem por período" className="mt-0">
            <BarRow items={byYear} />
          </Section>
        </div>

        <div className="mt-10">
          <ReportsAdmin initialRecords={records} />
        </div>
      </main>
    </div>
  )
}
