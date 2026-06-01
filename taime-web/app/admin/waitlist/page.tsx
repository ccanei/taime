import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import WaitlistAdmin from './WaitlistAdmin'
import type { WaitlistRecord } from './WaitlistAdmin'

async function getWaitlist(): Promise<WaitlistRecord[]> {
  const supabase = createSupabaseService()
  const { data } = await supabase
    .from('waitlist')
    .select('id, email, name, company, role, interest, requested_plan, created_at, contacted')
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })
  return (data as WaitlistRecord[]) ?? []
}

/**
 * Mapa email → plano aprovado (somente subscriptions ativas).
 * Faz 2 GETs: subscriptions e users — cruza por id (mais previsível que
 * depender de relação nomeada no PostgREST).
 */
async function getApprovedPlansByEmail(): Promise<Record<string, string>> {
  const supabase = createSupabaseService()
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('user_id, plan')
    .eq('status', 'active')
  const subRows = (subs ?? []) as { user_id: string; plan: string }[]
  if (subRows.length === 0) return {}

  const ids = [...new Set(subRows.map(s => s.user_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, email')
    .in('id', ids)
  const userRows = (users ?? []) as { id: string; email: string }[]
  const emailById = new Map(userRows.map(u => [u.id, u.email]))

  const map: Record<string, string> = {}
  for (const s of subRows) {
    const email = emailById.get(s.user_id)
    if (email) map[email] = s.plan
  }
  return map
}

export default async function AdminWaitlistPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const [records, approvedPlanByEmail] = await Promise.all([
    getWaitlist(),
    getApprovedPlansByEmail(),
  ])

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
              ← Dashboard
            </Link>
            <span className="text-zinc-200">/</span>
            <span className="text-sm font-semibold text-zinc-900">Waitlist</span>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-taime-50 text-taime-700 font-semibold border border-taime-100">
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">Lista de espera</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Gerencie os pedidos de acesso ao TAIME. Aprovação libera acesso por link seguro.
          </p>
        </div>

        <WaitlistAdmin initialRecords={records} approvedPlanByEmail={approvedPlanByEmail} />
      </main>
    </div>
  )
}
