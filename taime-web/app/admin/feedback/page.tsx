import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import AdminNav from '@/components/AdminNav'
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

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
              ← Dashboard
            </Link>
            <span className="text-zinc-200">/</span>
            <span className="text-sm font-semibold text-zinc-900">Feedback</span>
            <AdminNav active="/admin/feedback" />
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-taime-50 text-taime-700 font-semibold border border-taime-100">
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">Feedback dos usuários</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sugestões, problemas e elogios enviados pelo dashboard.
          </p>
        </div>

        <FeedbackAdmin initialRecords={records} />
      </main>
    </div>
  )
}
