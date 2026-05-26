import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import type { Report } from '@/lib/types'
import LogoutButton from '@/components/LogoutButton'
import DashboardClient from '@/components/DashboardClient'
import LanguageSelector from '@/components/LanguageSelector'

async function getReports(): Promise<Report[]> {
  const supabase = createSupabaseService()
  const { data } = await supabase
    .from('reports')
    .select('*, report_trends(taime_score, rank)')
    .eq('status', 'published')
    .order('period', { ascending: false })
  return (data as Report[]) ?? []
}

async function getAdvisorStatus(userId: string): Promise<{
  hasProfile: boolean
  lastMessage: string | null
}> {
  const service = createSupabaseService()

  const { data: profile } = await service
    .from('advisor_profiles')
    .select('company_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile) return { hasProfile: false, lastMessage: null }

  const { data: lastMsg } = await service
    .from('advisory_memory')
    .select('content, role')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    hasProfile:  true,
    lastMessage: lastMsg ? (lastMsg as { content: string }).content.slice(0, 120) : null,
  }
}

// Badge is "new" for 30 days from 2026-05-21 launch
const ADVISOR_LAUNCH = new Date('2026-05-21')
const showNewBadge   = (new Date().getTime() - ADVISOR_LAUNCH.getTime()) < 30 * 24 * 60 * 60 * 1000

export default async function DashboardPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const localeCookie = (await cookies()).get('taime-locale')?.value
  const locale = localeCookie === 'en' ? 'en' : 'pt'
  const isEn = locale === 'en'

  const [reports, advisorStatus] = await Promise.all([
    getReports(),
    getAdvisorStatus(user.id),
  ])

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-xl tracking-tight text-zinc-900">
            TAIME
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:block">{user.email}</span>
            <LanguageSelector />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">

        {/* ── Executive Advisor card ─────────────────────────────────── */}
        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center
                          justify-between gap-4 px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-taime-50 ring-1 ring-taime-100
                             flex items-center justify-center shrink-0">
                <span className="text-lg">🧠</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-sm font-bold text-zinc-900">Executive Advisor</h2>
                  {showNewBadge && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold
                                     bg-taime-600 text-white tracking-wide">
                      {isEn ? 'NEW' : 'NOVO'}
                    </span>
                  )}
                </div>
                {advisorStatus.hasProfile ? (
                  <p className="text-xs text-zinc-400 max-w-sm leading-relaxed line-clamp-2">
                    {advisorStatus.lastMessage
                      ? `"${advisorStatus.lastMessage}..."`
                      : (isEn ? 'Advisor configured. Start a conversation.' : 'Advisor configurado. Inicie uma conversa.')}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                    {isEn
                      ? 'Strategic advisor with 25 years of historical memory and personalized context for your company.'
                      : 'Consultor estratégico com memória histórica de 25 anos e contexto personalizado para a sua empresa.'}
                  </p>
                )}
              </div>
            </div>

            <Link
              href="/dashboard/advisor"
              className="btn-primary text-sm px-4 py-2 shrink-0">
              {advisorStatus.hasProfile
                ? (isEn ? 'Continue conversation →' : 'Continuar conversa →')
                : (isEn ? 'Set up your Advisor →' : 'Configurar seu Advisor →')}
            </Link>
          </div>
        </div>

        {/* ── Reports section ────────────────────────────────────────── */}
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-zinc-900 mb-1">
              {isEn ? 'Reports' : 'Relatórios'}
            </h1>
            <p className="text-sm text-zinc-500">
              {isEn
                ? `${reports.length} published report${reports.length !== 1 ? 's' : ''}`
                : `${reports.length} relatório${reports.length !== 1 ? 's' : ''} publicado${reports.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-16 text-center">
              <p className="text-zinc-400">
                {isEn ? 'No published reports yet.' : 'Nenhum relatório publicado ainda.'}
              </p>
            </div>
          ) : (
            <DashboardClient reports={reports} locale={locale} />
          )}
        </div>

      </main>
    </div>
  )
}
