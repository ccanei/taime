import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import EngagementAdmin from './EngagementAdmin'
import type { EngagementRow } from './EngagementAdmin'

// A view user_engagement_monthly é entregue em add-engagement-view.sql mas
// pode ainda não ter sido executada no banco. Distinguimos "view ausente" de
// "view vazia" para mostrar a instrução certa.
async function getEngagement(): Promise<{ rows: EngagementRow[]; viewMissing: boolean }> {
  const supabase = createSupabaseService()
  const { data, error } = await supabase
    .from('user_engagement_monthly')
    .select(
      'user_id, month, email, full_name, plan, reports_opened, reports_completed, ' +
      'reports_saved, advisor_messages, advisor_input_tokens, advisor_output_tokens, ' +
      'advisor_cost_tokens, last_activity_at',
    )
    .order('month', { ascending: true })

  if (error) {
    // 42P01 = relação inexistente (view ainda não criada).
    return { rows: [], viewMissing: true }
  }
  return { rows: (data as unknown as EngagementRow[]) ?? [], viewMissing: false }
}

export const metadata = { title: 'Engajamento · TAIME Admin' }

export default async function AdminEngagementPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const { rows, viewMissing } = await getEngagement()

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
              ← Dashboard
            </Link>
            <span className="text-zinc-200">/</span>
            <span className="text-sm font-semibold text-zinc-900">Engajamento</span>
            <nav className="flex items-center gap-3 ml-4 text-xs text-zinc-400">
              <Link href="/admin/feedback" className="hover:text-zinc-700 transition-colors">Feedback</Link>
              <span className="text-zinc-200">·</span>
              <Link href="/admin/waitlist" className="hover:text-zinc-700 transition-colors">Waitlist</Link>
              <span className="text-zinc-200">·</span>
              <Link href="/admin/reports" className="hover:text-zinc-700 transition-colors">Reports</Link>
            </nav>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-taime-50 text-taime-700 font-semibold border border-taime-100">
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">Engajamento por usuário</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Atividade mensal por usuário para detectar queda de uso e medir o custo do Advisor.
          </p>
        </div>

        {viewMissing ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-900">
            <p className="font-semibold mb-1">View ainda não criada</p>
            <p className="text-amber-800">
              Execute <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">add-engagement-view.sql</code>{' '}
              no SQL editor do Supabase para popular este painel. O arquivo está na raiz de{' '}
              <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">taime-web/</code>.
            </p>
          </div>
        ) : (
          <EngagementAdmin rows={rows} />
        )}
      </main>
    </div>
  )
}
