import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import LogoutButton from '@/components/LogoutButton'
import AdvisorView from './AdvisorView'

export const metadata = { title: 'Executive Advisor · TAIME' }

export default async function AdvisorPage() {
  const supabase = createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseService()
  const { data: profile } = await service
    .from('advisor_profiles')
    .select('company_name,sector,company_size,strategic_objective,maturity_level')
    .eq('user_id', user.id)
    .maybeSingle()

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
          profile={profile as {
            company_name: string | null
            sector:       string | null
          } | null}
        />
      </main>
    </div>
  )
}
