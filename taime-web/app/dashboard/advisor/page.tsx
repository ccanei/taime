import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan } from '@/lib/plan'
import { getUsageStatus } from '@/lib/advisorUsage'
import LogoutButton from '@/components/LogoutButton'
import AdvisorView from './AdvisorView'

export const metadata = { title: 'Executive Advisor · TAIME' }

export default async function AdvisorPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Advisor liberado para todos os planos (Free, Essential, Strategic). O que
  // varia e o limite de mensagens, aplicado no /api/advisor/chat. O contador
  // (usado/limite) vem daqui e alimenta a UI; Strategic vem com limit null.
  const plan  = await getUserPlan(user.id)
  const usage = await getUsageStatus(user.id, plan)

  const service = createSupabaseService()
  const [{ data: profile }, { data: userRow }] = await Promise.all([
    service
      .from('advisor_profiles')
      .select('company_name,sector,company_size,strategic_objective,maturity_level')
      .eq('user_id', user.id)
      .maybeSingle(),
    service
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle(),
  ])
  const userName = (userRow as { full_name: string | null } | null)?.full_name ?? null

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-bold text-xl tracking-tight text-zinc-900">
              TAIME
            </Link>
            <span className="hidden sm:block text-zinc-300">·</span>
            <span className="hidden sm:block text-sm text-zinc-500">Executive Advisor</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:block">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        <AdvisorView
          userId={user.id}
          userName={userName}
          userEmail={user.email ?? null}
          plan={plan}
          usage={{ used: usage.used, limit: usage.limit }}
          profile={profile as {
            company_name: string | null
            sector:       string | null
          } | null}
        />
      </main>
    </div>
  )
}
