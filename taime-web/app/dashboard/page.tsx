import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import { getTranslations } from '@/lib/i18n'
import { scoreColor, scoreRing, type Report } from '@/lib/types'
import { buildEditions, CURATED_THEME_SLUGS } from '@/lib/dashboard'
import { stripMarkdown, truncateWords } from '@/lib/strip-markdown'
import LogoutButton from '@/components/LogoutButton'
import LanguageSelector from '@/components/LanguageSelector'
import ContinueReadingCard from '@/components/ContinueReadingCard'
import DashboardLibrary, { type TrajectoryTheme } from '@/components/DashboardLibrary'
import FeedbackWidget from '@/components/FeedbackWidget'

async function getReports(): Promise<Report[]> {
  const supabase = createSupabaseService()
  const { data } = await supabase
    .from('reports')
    .select('id, period, period_label, report_number, published_at, title_pt_br, title_en, executive_summary_pt_br, executive_summary_en, report_trends(taime_score, rank, category, theme_slug)')
    .eq('status', 'published')
    .order('period', { ascending: false })
  return (data as unknown as Report[]) ?? []
}

async function getAdvisorStatus(userId: string): Promise<{ hasProfile: boolean; lastMessage: string | null }> {
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

  // Guarda o conteudo cru (mais folga); o strip de markdown + truncate acontece no render.
  return { hasProfile: true, lastMessage: lastMsg ? (lastMsg as { content: string }).content.slice(0, 400) : null }
}

// Badge "novo" do Advisor por 30 dias desde o lancamento (2026-05-21).
const ADVISOR_LAUNCH = new Date('2026-05-21')
const showNewBadge   = (Date.now() - ADVISOR_LAUNCH.getTime()) < 30 * 24 * 60 * 60 * 1000

export default async function DashboardPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const localeCookie = (await cookies()).get('taime-locale')?.value
  const locale: 'pt' | 'en' = localeCookie === 'en' ? 'en' : 'pt'
  const isEn = locale === 'en'

  const [reports, advisorStatus, plan] = await Promise.all([
    getReports(),
    getAdvisorStatus(user.id),
    getUserPlan(user.id),
  ])
  const advisorUnlocked = hasAdvisorAccess(plan)

  // Agregacao server-side em edicoes (payload compacto p/ o client).
  const { editions, reportLookup, categories } = buildEditions(reports, locale)
  const hero    = editions[0] ?? null
  const archive = editions.slice(1)

  // Temas curados para o rail de trajetoria (nomes localizados da home + index).
  const themeItems = getTranslations(locale).home.themesCards.items
  const trajectory: TrajectoryTheme[] = themeItems
    .slice(0, CURATED_THEME_SLUGS.length)
    .map((it, i) => ({ name: it.name, start: it.start, index: i }))

  // Reading progress (pessoal, respeita RLS).
  const { data: progressRows } = await supabase
    .from('reading_progress')
    .select('report_id, scroll_pct, completed, last_read_at')
    .eq('user_id', user.id)
    .order('last_read_at', { ascending: false })
  const progress = progressRows ?? []

  const continueRow    = progress.find(p => !p.completed)
  const continueReport = continueRow ? reports.find(r => r.id === continueRow.report_id) : undefined

  // "Novo desde a ultima visita" (mecanismo barato): edicoes publicadas DEPOIS da
  // ultima atividade do usuario, nao lidas, e recentes (30d). Sem historico, nada.
  const lastActivity = progress[0]?.last_read_at ?? null
  const readSet = new Set(progress.map(p => p.report_id))
  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const newSincePeriods = lastActivity
    ? editions
        .filter(e => e.publishedAt && e.publishedAt > lastActivity && e.publishedAt > cutoff30 && !e.parts.some(p => readSet.has(p.id)))
        .map(e => e.period)
    : []

  const advisorSnippet = advisorStatus.lastMessage
    ? truncateWords(stripMarkdown(advisorStatus.lastMessage), 130)
    : null

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-xl tracking-tight text-zinc-900">TAIME</Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400 hidden sm:block">{user.email}</span>
            <Link href="/conta" className="text-sm font-medium text-zinc-500 hover:text-taime-700 transition-colors">
              {isEn ? 'My Account' : 'Minha Conta'}
            </Link>
            <LanguageSelector />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">

        {/* ── Faixa do Advisor (discreta, integrada) ─────────────────── */}
        <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-taime-50 ring-1 ring-taime-100 flex items-center justify-center shrink-0">
                <span className="text-base">🧠</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-zinc-900">Executive Advisor</h2>
                  {advisorUnlocked && showNewBadge && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-taime-600 text-white tracking-wide">{isEn ? 'NEW' : 'NOVO'}</span>
                  )}
                  {!advisorUnlocked && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-500 tracking-wide">{isEn ? 'SOON' : 'EM BREVE'}</span>
                  )}
                </div>
                {advisorUnlocked && advisorStatus.hasProfile ? (
                  <p className="text-xs text-zinc-500 leading-relaxed line-clamp-1 mt-0.5">
                    {advisorSnippet
                      ? advisorSnippet
                      : (isEn ? 'Advisor configured. Start a conversation.' : 'Advisor configurado. Inicie uma conversa.')}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400 leading-relaxed mt-0.5 max-w-md">
                    {isEn
                      ? 'Strategic advisor with strategic memory across the TAIME archive and personalized context for your company.'
                      : 'Consultor estratégico com memória estratégica do arquivo TAIME e contexto personalizado para a sua empresa.'}
                  </p>
                )}
              </div>
            </div>
            {advisorUnlocked ? (
              <Link href="/dashboard/advisor" className="btn-primary text-sm px-4 py-2 shrink-0 whitespace-nowrap">
                {advisorStatus.hasProfile
                  ? (isEn ? 'Continue conversation →' : 'Continuar conversa →')
                  : (isEn ? 'Set up your Advisor →' : 'Configurar seu Advisor →')}
              </Link>
            ) : (
              <Link href="/planos" className="text-sm font-medium text-zinc-500 hover:text-taime-700 transition-colors shrink-0 px-4 py-2 whitespace-nowrap">
                {isEn ? 'Essential and Strategic plans →' : 'Planos Essential e Strategic →'}
              </Link>
            )}
          </div>
        </div>

        {/* ── Continuar lendo ────────────────────────────────────────── */}
        {continueReport && continueRow && (
          <ContinueReadingCard
            reportId={continueReport.id}
            titlePt={continueReport.title_pt_br}
            titleEn={continueReport.title_en}
            periodLabel={continueReport.period_label ?? null}
            scrollPct={continueRow.scroll_pct}
            locale={locale}
          />
        )}

        {/* ── EDIÇÃO ATUAL (herói editorial) ─────────────────────────── */}
        {hero && (
          <section className="rounded-2xl border border-taime-200 bg-gradient-to-br from-taime-50 to-white ring-1 ring-taime-100 overflow-hidden">
            <div className="p-6 sm:p-8">
              <p className="text-[11px] font-bold tracking-[0.15em] text-taime-700 uppercase">
                {isEn ? 'Current edition' : 'Edição atual'} <span className="text-taime-300">·</span> {hero.periodLabel}
              </p>
              {hero.summary && (
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 max-w-2xl line-clamp-2"
                   style={{ fontFamily: 'Georgia, serif' }}>
                  {hero.summary}
                </p>
              )}
              <div className="mt-5 space-y-2">
                {hero.parts.map(p => (
                  <Link key={p.id} href={`/reports/${p.id}`}
                    className="group flex items-center gap-4 rounded-xl bg-white/70 hover:bg-white border border-zinc-200/80 hover:border-taime-200 px-4 py-3 transition-all">
                    <span className="text-[10px] font-bold text-taime-600 tabular-nums uppercase tracking-wide shrink-0 w-14">
                      {isEn ? `Part ${p.number}` : `Parte ${p.number}`}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-semibold text-zinc-900 group-hover:text-taime-600 transition-colors line-clamp-1">
                      {p.title}
                    </span>
                    <span className="text-[11px] text-zinc-400 shrink-0 hidden sm:block">
                      {isEn ? `${p.nTrends} trends` : `${p.nTrends} trends`}
                    </span>
                    <div className={`shrink-0 w-9 h-9 rounded-lg ring-2 ${scoreRing(p.score)} flex items-center justify-center`}>
                      <span className={`text-sm font-bold tabular-nums ${scoreColor(p.score)}`}>{p.score}</span>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-5">
                <Link href={`/reports/${hero.parts[0]?.id ?? ''}`} className="btn-primary text-sm px-5 py-2.5 inline-flex">
                  {isEn ? 'Read the edition →' : 'Ler a edição →'}
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── Trajetórias + Filtros + Arquivo por edição ─────────────── */}
        {editions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 p-16 text-center">
            <p className="text-zinc-400">{isEn ? 'No published reports yet.' : 'Nenhum relatório publicado ainda.'}</p>
          </div>
        ) : (
          <DashboardLibrary
            editions={archive}
            reportLookup={reportLookup}
            categories={categories}
            themes={trajectory}
            newSincePeriods={newSincePeriods}
            locale={locale}
          />
        )}

      </main>

      <FeedbackWidget />
    </div>
  )
}
