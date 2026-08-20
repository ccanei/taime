import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createSupabaseServer } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import LogoutButton from '@/components/LogoutButton'
import AssessmentView from '@/components/AssessmentView'

export const metadata = { title: 'Diagnóstico de maturidade · Executive Advisor · TAIME' }

export default async function AssessmentPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) redirect('/dashboard')

  const isPt = (await cookies()).get('taime-locale')?.value !== 'en'

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
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

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 mb-1">{isPt ? 'Diagnóstico de maturidade' : 'Maturity assessment'}</h1>
          <p className="text-sm text-zinc-500">{isPt
            ? 'Um retrato do seu estágio por domínio. Você reconhece a sua situação em cada opção, nada é autoavaliação. O que já surgiu nas conversas vem pré-preenchido e editável.'
            : 'A portrait of your stage by domain. You recognize your situation in each option, nothing is self-rating. What already came up in conversations is pre-filled and editable.'}</p>
        </div>
        <AssessmentView />
      </main>
    </div>
  )
}
