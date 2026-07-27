import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { looksRandom } from '@/lib/anti-abuse'
import AdminNav from '@/components/AdminNav'
import UsersAdmin from './UsersAdmin'
import type { UserRow } from './UsersAdmin'

// Ultimo login e status de banimento vem da Admin API (auth.users nao e acessivel
// via PostgREST). Best-effort: se falhar, cai para a atividade do Advisor.
async function getAuthMeta(): Promise<Map<string, { last_sign_in_at: string | null; banned_until: string | null }>> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_KEY ?? ''
  const m = new Map<string, { last_sign_in_at: string | null; banned_until: string | null }>()
  if (!url || !key) return m
  try {
    let page = 1
    for (;;) {
      const r = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store',
      })
      if (!r.ok) break
      const j = await r.json() as { users?: Array<{ id: string; last_sign_in_at: string | null; banned_until: string | null }> }
      const arr = j.users ?? []
      for (const u of arr) m.set(u.id, { last_sign_in_at: u.last_sign_in_at ?? null, banned_until: u.banned_until ?? null })
      if (arr.length < 200) break
      page++
      if (page > 25) break
    }
  } catch { /* best-effort */ }
  return m
}

async function getAdvisoryAgg(
  service: ReturnType<typeof createSupabaseService>,
): Promise<{ msgCountBy: Map<string, number>; lastMsgBy: Map<string, string> }> {
  const msgCountBy = new Map<string, number>()
  const lastMsgBy  = new Map<string, string>()
  let from = 0
  for (;;) {
    const { data } = await service
      .from('advisory_memory').select('user_id, role, created_at').range(from, from + 999)
    const rows = (data ?? []) as { user_id: string | null; role: string; created_at: string }[]
    for (const r of rows) {
      if (!r.user_id) continue
      if (r.role === 'user') msgCountBy.set(r.user_id, (msgCountBy.get(r.user_id) ?? 0) + 1)
      const cur = lastMsgBy.get(r.user_id)
      if (!cur || r.created_at > cur) lastMsgBy.set(r.user_id, r.created_at)
    }
    if (rows.length < 1000) break
    from += 1000
  }
  return { msgCountBy, lastMsgBy }
}

// Gmail dot-trick: pontos no local-part sao ignorados pelo Gmail, entao bots
// geram muitos "emails unicos" a partir de um so. 3+ pontos e sinal forte.
function gmailDotTrick(email: string): boolean {
  const [local, domain] = (email ?? '').toLowerCase().split('@')
  if (!domain || !(domain === 'gmail.com' || domain === 'googlemail.com')) return false
  return ((local ?? '').match(/\./g) ?? []).length >= 3
}

async function getUsers(): Promise<UserRow[]> {
  const service = createSupabaseService()
  const now = Date.now()

  const [{ data: users }, { data: subs }, { data: wl }, authMeta, agg] = await Promise.all([
    service.from('users').select('id, email, full_name, created_at').order('created_at', { ascending: false }),
    service.from('subscriptions').select('user_id, plan').eq('status', 'active'),
    service.from('waitlist').select('email, interest, created_at').order('created_at', { ascending: false }),
    getAuthMeta(),
    getAdvisoryAgg(service),
  ])

  const planBy = new Map<string, string>()
  for (const s of (subs ?? []) as { user_id: string; plan: string }[]) if (!planBy.has(s.user_id)) planBy.set(s.user_id, s.plan)

  const interestBy = new Map<string, string>()
  const waitlistEmails = new Set<string>()
  for (const w of (wl ?? []) as { email: string | null; interest: string | null }[]) {
    const e = (w.email ?? '').toLowerCase()
    if (!e) continue
    waitlistEmails.add(e)
    if (w.interest && !interestBy.has(e)) interestBy.set(e, w.interest)
  }

  const userRows = (users ?? []) as { id: string; email: string; full_name: string | null; created_at: string }[]
  return userRows.map(u => {
    const emailLc = (u.email ?? '').toLowerCase()
    const login   = authMeta.get(u.id)?.last_sign_in_at ?? null
    const bannedUntil = authMeta.get(u.id)?.banned_until ?? null
    const banned  = !!bannedUntil && new Date(bannedUntil).getTime() > now
    const lastMsg = agg.lastMsgBy.get(u.id) ?? null
    const lastActivity = [login, lastMsg].filter(Boolean).sort().slice(-1)[0] ?? null
    const plan = planBy.get(u.id) ?? null
    const msgCount = agg.msgCountBy.get(u.id) ?? 0
    const origin: 'waitlist' | 'direct' = waitlistEmails.has(emailLc) ? 'waitlist' : 'direct'

    // Sinalizacao (NAO acao): motivos de suspeita.
    const reasons: string[] = []
    if (gmailDotTrick(u.email)) reasons.push('gmail_dottrick')
    if (looksRandom(u.full_name)) reasons.push('gibberish_name')
    if (origin === 'direct' && plan === 'free' && msgCount === 0) reasons.push('no_waitlist_free_unused')

    return {
      id: u.id, email: u.email, full_name: u.full_name, created_at: u.created_at,
      plan, interest: interestBy.get(emailLc) ?? null,
      last_login: login, last_activity: (lastActivity as string | null), msg_count: msgCount,
      origin, banned, suspect_reasons: reasons,
    }
  })
}

export const metadata = { title: 'Usuários · TAIME Admin' }

export default async function AdminUsersPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const rows = await getUsers()

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
              ← Dashboard
            </Link>
            <span className="text-zinc-200">/</span>
            <span className="text-sm font-semibold text-zinc-900">Usuários</span>
            <AdminNav active="/admin/users" />
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-taime-50 text-taime-700 font-semibold border border-taime-100">
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">Usuários</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Todas as contas de public.users, origem, plano, atividade e sinalização de suspeita.
            Decisão sempre humana: suspender e reativar são manuais, com confirmação.
          </p>
        </div>

        <UsersAdmin rows={rows} />
      </main>
    </div>
  )
}
