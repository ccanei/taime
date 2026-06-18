import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import AdminNav from '@/components/AdminNav'
import NewsletterAdmin from './NewsletterAdmin'
import type { SubscriberRow, SendRow } from './NewsletterAdmin'

// As tabelas newsletter_subscribers / newsletter_sends podem ainda não estar
// presentes em ambientes onde add-newsletter-admin.sql não rodou. Distinguir
// "tabela ausente" de "lista vazia" é o mesmo padrão usado em /admin/engagement.

async function getSubscribers(): Promise<{ rows: SubscriberRow[]; missing: boolean }> {
  const supabase = createSupabaseService()
  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .select(
      'id, email, locale, source, status, created_at, ' +
      'status_changed_at, status_changed_by, blocked_reason',
    )
    .order('created_at', { ascending: false })

  if (error) {
    // 42P01 = relação inexistente. Outros erros caem na instrução também
    // (perfil de admin não muda se for SQL ausente vs sem permissão).
    return { rows: [], missing: true }
  }
  return { rows: (data as unknown as SubscriberRow[]) ?? [], missing: false }
}

async function getSends(): Promise<{ rows: SendRow[]; missing: boolean }> {
  const supabase = createSupabaseService()
  const { data, error } = await supabase
    .from('newsletter_sends')
    .select(
      'id, briefing_id, briefing_date, subject_pt, subject_en, body_pt, body_en, ' +
      'recipient_count, sent_count, failed_count, status, resend_reference, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return { rows: [], missing: true }
  }
  return { rows: (data as unknown as SendRow[]) ?? [], missing: false }
}

export const metadata = { title: 'Newsletter · TAIME Admin' }

export default async function AdminNewsletterPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const [subResult, sendResult] = await Promise.all([
    getSubscribers(),
    getSends(),
  ])

  const tablesMissing = subResult.missing || sendResult.missing

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
              ← Dashboard
            </Link>
            <span className="text-zinc-200">/</span>
            <span className="text-sm font-semibold text-zinc-900">Newsletter</span>
            <AdminNav active="/admin/newsletter" />
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-taime-50 text-taime-700 font-semibold border border-taime-100">
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">Newsletter do Radar</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Inscritos e histórico de envios. Inscrição já entra como ativa; este painel é para verificar e, se preciso, bloquear ou remover. Não é uma fila de aprovação.
          </p>
        </div>

        {tablesMissing ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-900">
            <p className="font-semibold mb-1">Tabelas ainda não criadas</p>
            <p className="text-amber-800">
              Execute <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">add-newsletter-admin.sql</code>{' '}
              no SQL editor do Supabase para criar as tabelas{' '}
              <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">newsletter_sends</code> e{' '}
              <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">newsletter_send_recipients</code>{' '}
              e os campos novos de <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">newsletter_subscribers</code>.
            </p>
          </div>
        ) : (
          <NewsletterAdmin
            initialSubscribers={subResult.rows}
            initialSends={sendResult.rows}
          />
        )}
      </main>
    </div>
  )
}
