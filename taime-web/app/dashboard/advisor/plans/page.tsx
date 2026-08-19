import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import LogoutButton from '@/components/LogoutButton'
import PlansManager from '@/components/PlansManager'

export const metadata = { title: 'Meus planos · Executive Advisor · TAIME' }

export default async function AdvisorPlansPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Planos sao exclusivos de usuario logado com acesso ao Advisor.
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) redirect('/dashboard')

  const localeCookie = (await cookies()).get('taime-locale')?.value
  const isPt = localeCookie !== 'en'

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-bold text-xl tracking-tight text-zinc-900">TAIME</Link>
            <span className="hidden sm:block text-zinc-300">·</span>
            <Link href="/dashboard/advisor" className="hidden sm:block text-sm text-zinc-500 hover:text-taime-700 transition-colors">Executive Advisor</Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:block">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 mb-1">{isPt ? 'Meus planos' : 'My plans'}</h1>
            <p className="text-sm text-zinc-500">{isPt
              ? 'Os roadmaps que você salvou do Advisor, com o progresso de cada fase.'
              : 'The roadmaps you saved from the Advisor, with the progress of each phase.'}</p>
          </div>
          <Link href="/dashboard/advisor" className="shrink-0 text-sm font-medium text-zinc-500 hover:text-taime-700 transition-colors whitespace-nowrap">
            {isPt ? '← Voltar à conversa' : '← Back to conversation'}
          </Link>
        </div>

        <PlansManager />
      </main>
    </div>
  )
}
