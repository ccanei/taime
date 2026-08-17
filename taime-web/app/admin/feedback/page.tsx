import { redirect } from 'next/navigation'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { seriesByDay, countInWindow, windowDelta } from '@/lib/admin-agg'
import { AdminHeader, Section, StatCard, TrendLine, fmtInt } from '@/components/admin/kit'
import ReloadButton from '@/components/admin/ReloadButton'
import FeedbackAdmin from './FeedbackAdmin'
import type { FeedbackRecord } from './FeedbackAdmin'

async function getFeedback(): Promise<FeedbackRecord[]> {
  const supabase = createSupabaseService()
  // rating/question/answer/source existem apos add-advisor-feedback-columns.sql.
  // Se a migration ainda nao rodou, o select falha; caimos no conjunto basico
  // para nao quebrar o admin existente.
  const { data, error } = await supabase
    .from('feedback')
    .select('id, user_id, user_email, type, message, locale, status, created_at, rating, question, answer, source')
    .order('created_at', { ascending: false })
  if (error) {
    const { data: basic } = await supabase
      .from('feedback')
      .select('id, user_id, user_email, type, message, locale, status, created_at')
      .order('created_at', { ascending: false })
    return (basic as FeedbackRecord[]) ?? []
  }
  return (data as FeedbackRecord[]) ?? []
}

export default async function AdminFeedbackPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const records = await getFeedback()

  // Resumo executivo (server-side): volume, janela recente e tendencia.
  const dates = records.map(r => r.created_at)
  const open  = records.filter(r => (r.status ?? 'open') === 'open' || r.status === 'pending').length
  const series = seriesByDay(dates, 30)

  return (
    <div className="min-h-screen bg-zinc-50">
      <AdminHeader title="Feedback" active="/admin/feedback" />

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Feedback dos usuários</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Sugestões, problemas e elogios enviados pelo dashboard.
            </p>
          </div>
          <ReloadButton />
        </div>

        {/* Resumo executivo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total" value={fmtInt(records.length)} />
          <StatCard label="Em aberto" value={fmtInt(open)} tone={open ? 'warn' : undefined} />
          <StatCard label="Novos 7d" value={fmtInt(countInWindow(dates, 7))} delta={windowDelta(dates, 7)} />
          <StatCard label="Novos 30d" value={fmtInt(countInWindow(dates, 30))} />
        </div>

        <Section title="Feedback por dia" note="Últimos 30 dias">
          <TrendLine data={series} unit=" mensagens" />
        </Section>

        <div className="mt-10">
          <FeedbackAdmin initialRecords={records} />
        </div>
      </main>
    </div>
  )
}
