import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import type { Report } from '@/lib/types'
import LogoutButton from '@/components/LogoutButton'
import DashboardClient from '@/components/DashboardClient'
import LanguageSelector from '@/components/LanguageSelector'
import ContinueReadingCard from '@/components/ContinueReadingCard'
import NextReadsPanel, { type NextRead } from '@/components/NextReadsPanel'
import FeedbackWidget from '@/components/FeedbackWidget'

async function getReports(): Promise<Report[]> {
  const supabase = createSupabaseService()
  const { data } = await supabase
    .from('reports')
    .select('*, report_trends(taime_score, rank, category)')
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

// ── Tipos auxiliares ─────────────────────────────────────────────────────────
type TrendRow = {
  report_id: string
  category: string | null
  theme_slug: string | null
  taime_score: number
}

// Trends de TODOS os reports — usado para detectar tema dominante e recomendar.
async function getAllTrendMeta(): Promise<TrendRow[]> {
  const service = createSupabaseService()
  const { data } = await service
    .from('report_trends')
    .select('report_id, category, theme_slug, taime_score')
  return (data as TrendRow[]) ?? []
}

/**
 * Detecta os temas dominantes a partir das últimas leituras do usuário e
 * recomenda relatórios NÃO lidos que tocam nesses temas.
 */
function buildNextReads(
  reports: Report[],
  trendMetaRaw: TrendRow[],
  readReportIds: string[],          // reports já lidos, mais recentes primeiro
): { reads: NextRead[]; topTheme: string | null } {
  // só considera trends de reports publicados (que estão na lista `reports`)
  const publishedIds = new Set(reports.map(r => r.id))
  const trendMeta = trendMetaRaw.filter(t => publishedIds.has(t.report_id))

  // 1) temas (category) das últimas 5 leituras, com peso por recência
  const recent = readReportIds.slice(0, 5)
  const themeScore = new Map<string, number>()        // category -> peso
  recent.forEach((rid, idx) => {
    const weight = 5 - idx                             // leitura mais recente pesa mais
    for (const t of trendMeta) {
      if (t.report_id !== rid || !t.category) continue
      themeScore.set(t.category, (themeScore.get(t.category) ?? 0) + weight)
    }
  })

  const ranked = [...themeScore.entries()].sort((a, b) => b[1] - a[1])
  const topTheme = ranked[0]?.[0] ?? null
  if (!topTheme) return { reads: [], topTheme: null }

  // 2) reports NÃO lidos que contêm trends do(s) tema(s) dominante(s)
  const readSet = new Set(readReportIds)
  const topThemes = new Set(ranked.slice(0, 2).map(([c]) => c))   // top 1-2 temas

  const candidates = new Map<string, number>()        // report_id -> melhor score no tema
  for (const t of trendMeta) {
    if (readSet.has(t.report_id)) continue
    if (!t.category || !topThemes.has(t.category)) continue
    candidates.set(t.report_id, Math.max(candidates.get(t.report_id) ?? 0, t.taime_score))
  }

  const reads: NextRead[] = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rid, score]) => {
      const r = reports.find(rr => rr.id === rid)
      if (!r) return null // trend de report não publicado / fora da lista
      return {
        reportId:    rid,
        titlePt:     r.title_pt_br,
        titleEn:     r.title_en,
        periodLabel: r.period_label ?? null,
        score,
      }
    })
    .filter((x): x is NextRead => x !== null)
    .slice(0, 4)

  return { reads, topTheme }
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const localeCookie = (await cookies()).get('taime-locale')?.value
  const locale = localeCookie === 'en' ? 'en' : 'pt'
  const isEn = locale === 'en'

  const [reports, advisorStatus, plan] = await Promise.all([
    getReports(),
    getAdvisorStatus(user.id),
    getUserPlan(user.id),
  ])
  const advisorUnlocked = hasAdvisorAccess(plan)

  // ── Reading progress (dado pessoal: cliente autenticado, respeita RLS) ──────
  const { data: progressRows } = await supabase
    .from('reading_progress')
    .select('report_id, scroll_pct, completed, last_read_at')
    .eq('user_id', user.id)
    .order('last_read_at', { ascending: false })

  const progress = progressRows ?? []

  // "Continuar lendo" = último report aberto e ainda não concluído.
  // Limiar baixo (scroll_pct >= 0) — basta ter aberto.
  const continueRow = progress.find(p => !p.completed)
  const continueReport = continueRow
    ? reports.find(r => r.id === continueRow.report_id)
    : undefined

  // ── Próximas leituras (por tema dominante das últimas 5 leituras) ───────────
  const readReportIds = progress.map(p => p.report_id)
  const trendMeta = readReportIds.length > 0 ? await getAllTrendMeta() : []
  const { reads: nextReads, topTheme } = buildNextReads(reports, trendMeta, readReportIds)

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
            <Link
              href="/conta"
              className="text-sm font-medium text-zinc-500 hover:text-taime-700 transition-colors"
            >
              {isEn ? 'My Account' : 'Minha Conta'}
            </Link>
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
                  {advisorUnlocked && showNewBadge && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold
                                     bg-taime-600 text-white tracking-wide">
                      {isEn ? 'NEW' : 'NOVO'}
                    </span>
                  )}
                  {!advisorUnlocked && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold
                                     bg-zinc-100 text-zinc-500 tracking-wide">
                      {isEn ? 'SOON' : 'EM BREVE'}
                    </span>
                  )}
                </div>
                {advisorUnlocked && advisorStatus.hasProfile ? (
                  <p className="text-xs text-zinc-400 max-w-sm leading-relaxed line-clamp-2">
                    {advisorStatus.lastMessage
                      ? `"${advisorStatus.lastMessage}..."`
                      : (isEn ? 'Advisor configured. Start a conversation.' : 'Advisor configurado. Inicie uma conversa.')}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                    {isEn
                      ? 'Strategic advisor with strategic memory across the TAIME archive and personalized context for your company.'
                      : 'Consultor estratégico com memória estratégica do arquivo TAIME e contexto personalizado para a sua empresa.'}
                  </p>
                )}
              </div>
            </div>

            {advisorUnlocked ? (
              <Link
                href="/dashboard/advisor"
                className="btn-primary text-sm px-4 py-2 shrink-0">
                {advisorStatus.hasProfile
                  ? (isEn ? 'Continue conversation →' : 'Continuar conversa →')
                  : (isEn ? 'Set up your Advisor →' : 'Configurar seu Advisor →')}
              </Link>
            ) : (
              <Link
                href="/planos"
                className="text-sm font-medium text-zinc-500 hover:text-taime-700
                           transition-colors shrink-0 px-4 py-2">
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

        {/* ── Próximas leituras (por tema) ───────────────────────────── */}
        {nextReads.length > 0 && (
          <NextReadsPanel items={nextReads} topTheme={topTheme} locale={locale} />
        )}

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

      <FeedbackWidget />
    </div>
  )
}
