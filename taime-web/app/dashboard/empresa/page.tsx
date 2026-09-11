import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import LogoutButton from '@/components/LogoutButton'
import MinhaEmpresaView, { type ProfileSummary } from '@/components/MinhaEmpresaView'

export const metadata = { title: 'Minha Empresa · TAIME' }

// Aba unificada "Minha Empresa": perfil, maturidade, fatos e planos num so lugar.
// Acessivel do dashboard E do Advisor (dois pontos de entrada, uma fonte). So carrega
// o RESUMO do perfil no server (para decidir Completar vs Editar e mostrar os valores);
// cada bloco faz o proprio fetch no cliente ao expandir.
export default async function MinhaEmpresaPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fatos, maturidade e planos sao superficies do Advisor: exigem acesso ao Advisor.
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) redirect('/dashboard')

  const isPt = (await cookies()).get('taime-locale')?.value !== 'en'

  const service = createSupabaseService()
  const { data: profileRow } = await service
    .from('advisor_profiles')
    .select('company_name, sector, company_size, strategic_objective, current_infrastructure')
    .eq('user_id', user.id)
    .maybeSingle()
  const profile = (profileRow as ProfileSummary) ?? null

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
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 mb-1">{isPt ? 'Minha Empresa' : 'My Company'}</h1>
            <p className="text-sm text-zinc-500">{isPt
              ? 'Perfil, maturidade, fatos e planos de ação em um só lugar. O Advisor usa tudo isto como contexto.'
              : 'Profile, maturity, facts and action plans in one place. The Advisor uses all of this as context.'}</p>
          </div>
          <Link href="/dashboard/advisor" className="shrink-0 text-sm font-medium text-zinc-500 hover:text-taime-700 transition-colors whitespace-nowrap">
            {isPt ? '← Voltar à conversa' : '← Back to conversation'}
          </Link>
        </div>

        <MinhaEmpresaView userId={user.id} isPt={isPt} profile={profile} />
      </main>
    </div>
  )
}
