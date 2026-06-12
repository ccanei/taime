import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import LogoutButton from '@/components/LogoutButton'
import AdvisorView from './AdvisorView'

export const metadata = { title: 'Executive Advisor · TAIME' }

export default async function AdvisorPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Gate de plano: hoje só Strategic tem o Advisor funcional.
  const plan = await getUserPlan(user.id)
  console.log('[advisor-gate]', { userId: user.id, plan, hasAccess: hasAdvisorAccess(plan) })
  const hasAccess = hasAdvisorAccess(plan)

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-zinc-50">
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

        <main className="max-w-4xl mx-auto px-6 py-16">
          <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-taime-50 ring-1 ring-taime-100
                           flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl">🧠</span>
            </div>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold
                             bg-zinc-100 text-zinc-500 tracking-wide mb-4">
              EM BREVE
            </span>
            <h1 className="text-2xl font-bold text-zinc-900 mb-2">Executive Advisor</h1>
            <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
              Consultor estratégico com memória histórica de 25 anos e contexto
              personalizado para a sua empresa. Disponível no plano Strategic.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link href="/planos" className="btn-primary text-sm px-4 py-2">
                Conhecer o Strategic →
              </Link>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-zinc-500 hover:text-taime-700 transition-colors">
                Voltar
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

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
