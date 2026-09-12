import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import { computeProgress, type PlanRecord } from '@/lib/advisor-plan'
import { computeScores, TOTAL_QUESTIONS, type Answers, type DomainScore } from '@/lib/assessment-model'
import AssessmentPortrait from '@/components/AssessmentPortrait'
import ProgressDonut from '@/components/ProgressDonut'
import AdvisorQuickCard from '@/components/AdvisorQuickCard'
import { getTranslations } from '@/lib/i18n'
import { scoreColor, scoreRing, type Report } from '@/lib/types'
import { buildEditions, buildTrendingThemes, computeAnnualGrowth, CURATED_THEME_SLUGS, type ArchiveStats } from '@/lib/dashboard'
import { stripMarkdown, truncateWords } from '@/lib/strip-markdown'
import LogoutButton from '@/components/LogoutButton'
import LanguageSelector from '@/components/LanguageSelector'
import ContinueReadingCard from '@/components/ContinueReadingCard'
import DashboardLibrary, { type TrajectoryTheme } from '@/components/DashboardLibrary'
import DashboardSidebar from '@/components/DashboardSidebar'
import FeedbackWidget from '@/components/FeedbackWidget'

async function getReports(): Promise<Report[]> {
  const supabase = createSupabaseService()
  const { data } = await supabase
    .from('reports')
    .select('id, period, period_label, report_number, published_at, title_pt_br, title_en, executive_summary_pt_br, executive_summary_en, report_trends(taime_score, rank, category, theme_slug, title_pt_br, title_en)')
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

// Plano ativo mais recente do usuario (Fase 2.2, TAREFA 4). Fail-safe: tabela
// ausente ou erro -> null (o card simplesmente nao aparece, sem quebrar o dashboard).
async function getActivePlan(userId: string): Promise<PlanRecord | null> {
  try {
    const service = createSupabaseService()
    const { data, error } = await service
      .from('advisor_plans')
      .select('id, title, theme, phases, status, session_id, created_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return data as PlanRecord
  } catch (e) {
    console.error('[dashboard] getActivePlan falhou (ignorado):', e instanceof Error ? e.message : e)
    return null
  }
}

// Diagnostico de maturidade ativo do usuario (Assessment Parte A, TAREFA 4). Fail-safe:
// tabela ausente (migracao pendente) ou erro -> available=false (o card nao aparece).
async function getAssessment(userId: string): Promise<{ available: boolean; answered: number; domains: DomainScore[] }> {
  try {
    const service = createSupabaseService()
    const { data, error } = await service
      .from('advisor_assessments')
      .select('answers')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
    if (error) return { available: error.code !== '42P01', answered: 0, domains: [] }
    const answers = ((data?.answers ?? {}) as Answers)
    return { available: true, answered: Object.keys(answers).length, domains: computeScores(answers) }
  } catch (e) {
    console.error('[dashboard] getAssessment falhou (ignorado):', e instanceof Error ? e.message : e)
    return { available: false, answered: 0, domains: [] }
  }
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

  const [reports, advisorStatus, plan, activePlan, assessment] = await Promise.all([
    getReports(),
    getAdvisorStatus(user.id),
    getUserPlan(user.id),
    getActivePlan(user.id),
    getAssessment(user.id),
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

  // "O arquivo em numeros" (rail): derivado da agregacao ja existente, sem fetch novo.
  // growthPct: crescimento anual real (trends dos ultimos 12m vs 12m anteriores).
  const stats: ArchiveStats = {
    totalEditions: editions.length,
    totalTrends:   editions.reduce((s, e) => s + e.totalTrends, 0),
    spanStartYear: editions.length ? editions[editions.length - 1].period.slice(0, 4) : '',
    spark:         editions.slice(0, 24).reverse().map(e => e.avgScore),
    growthPct:     computeAnnualGrowth(reports),
  }

  // Tendencias em destaque (cards com sparkline do score por periodo). Dado real, do
  // arquivo ja carregado; sparkline omitido no card sem historico suficiente (< 3 pts).
  const trending = buildTrendingThemes(reports, locale, 6)

  // ── Herói editorial (coluna principal) ──────────────────────────────
  const heroNode = hero && (
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
              <span className="text-[11px] text-zinc-400 shrink-0 hidden sm:block">{p.nTrends} {isEn ? 'trends' : 'tendências'}</span>
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
  )

  // ── Advisor ATIVO (input direto + status + preview de continuacao) ──────
  const advisorNode = (
    <AdvisorQuickCard
      isEn={isEn}
      unlocked={advisorUnlocked}
      hasProfile={advisorStatus.hasProfile}
      snippet={advisorSnippet}
      newBadge={showNewBadge}
    />
  )

  // ── Card do plano ativo (Fase 2.2). Sem plano ativo, nada aparece ──────
  const planCardNode = (advisorUnlocked && activePlan && activePlan.phases.length > 0) ? (() => {
    const progress = computeProgress(activePlan.phases)
    const pct = progress.totalActions > 0 ? Math.round((progress.doneActions / progress.totalActions) * 100) : 0
    return (
      <Link href="/dashboard/advisor/plans"
        className="group block rounded-xl border border-zinc-200 border-t-2 border-t-taime-500 bg-white p-4 hover:shadow-md transition-all">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-taime-600 mb-1">{isEn ? 'Your plan' : 'Seu plano'}</p>
        <h3 className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2 group-hover:text-taime-700 transition-colors">
          {activePlan.title ?? (isEn ? 'Strategic plan' : 'Plano estratégico')}
        </h3>
        <p className="mt-1.5 text-[11px] text-zinc-500 tabular-nums">
          {(isEn ? `Phase ${progress.currentPhaseIndex + 1} of ${progress.phaseCount}` : `Fase ${progress.currentPhaseIndex + 1} de ${progress.phaseCount}`)}
          {` · ${progress.doneActions}/${progress.totalActions} ${isEn ? 'actions' : 'ações'}`}
        </p>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
          <div className="h-full rounded-full bg-taime-500" style={{ width: `${pct}%` }} />
        </div>
      </Link>
    )
  })() : null

  // ── Card do diagnóstico (Assessment A). Dormente (available=false) nada aparece;
  //    sem respostas ainda, convite discreto; com respostas, o retrato compacto ──
  const assessmentCardNode = (advisorUnlocked && assessment.available) ? (
    <Link href="/dashboard/empresa"
      className="group block rounded-xl border border-zinc-200 bg-white p-4 hover:shadow-md transition-all">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-taime-600 mb-1">{isEn ? 'Maturity' : 'Maturidade'}</p>
      {assessment.answered === 0 ? (
        <>
          <p className="text-xs text-zinc-500 leading-snug">{isEn ? 'Map your stage by domain to sharpen the Advisor.' : 'Mapeie seu estágio por domínio para afinar o Advisor.'}</p>
          <span className="mt-1.5 inline-block text-xs font-semibold text-taime-700 group-hover:text-taime-800">{isEn ? 'Map maturity →' : 'Mapear maturidade →'}</span>
        </>
      ) : (
        <>
          {/* Donut do progresso geral (respondidas/total) com o numero no centro. */}
          <div className="flex justify-center mb-3">
            <ProgressDonut
              value={assessment.answered}
              total={TOTAL_QUESTIONS}
              centerTop={String(assessment.answered)}
              centerSub={isEn ? `of ${TOTAL_QUESTIONS} answered` : `de ${TOTAL_QUESTIONS} respondidas`}
            />
          </div>
          {/* Os 5 dominios com suas barras individuais permanecem abaixo. */}
          <AssessmentPortrait domains={assessment.domains} isPt={!isEn} compact />
        </>
      )}
    </Link>
  ) : null

  const continueNode = (continueReport && continueRow) ? (
    <ContinueReadingCard
      reportId={continueReport.id}
      titlePt={continueReport.title_pt_br}
      titleEn={continueReport.title_en}
      periodLabel={continueReport.period_label ?? null}
      scrollPct={continueRow.scroll_pct}
      locale={locale}
    />
  ) : null

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Conteudo a direita da sidebar (lg:pl-60 abre espaco para a sidebar fixa). */}
      <div className="lg:pl-60">
        {/* Header slim: hamburguer (mobile) + controles do usuario. O DashboardSidebar
            (montado UMA vez aqui) renderiza a sidebar fixa do desktop (position:fixed,
            independe do DOM), o hamburguer inline no mobile e o drawer. */}
        <header className="bg-white border-b border-zinc-200 px-4 sm:px-6 h-16 flex items-center sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <DashboardSidebar isEn={isEn} />
            <span className="lg:hidden font-bold text-lg tracking-tight text-zinc-900">TAIME</span>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <span className="text-sm text-zinc-400 hidden sm:block">{user.email}</span>
            <LanguageSelector />
            <LogoutButton />
          </div>
        </header>

        <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {editions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-16 text-center">
              <p className="text-zinc-400">{isEn ? 'No published analyses yet.' : 'Nenhuma análise publicada ainda.'}</p>
            </div>
          ) : (
            <DashboardLibrary
              editions={archive}
              reportLookup={reportLookup}
              categories={categories}
              themes={trajectory}
              newSincePeriods={newSincePeriods}
              locale={locale}
              stats={stats}
              trending={trending}
              heroNode={heroNode}
              advisorNode={(planCardNode || assessmentCardNode)
                ? <div className="flex flex-col gap-3">{advisorNode}{planCardNode}{assessmentCardNode}</div>
                : advisorNode}
              continueNode={continueNode}
            />
          )}
        </main>
      </div>

      <FeedbackWidget />
    </div>
  )
}
