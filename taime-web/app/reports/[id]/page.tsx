import { notFound } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import ReportClient from '@/components/ReportClient'
import ReportRateLimited from '@/components/ReportRateLimited'
import type { Report, ReportTrend } from '@/lib/types'
import { getAccessLevel, type Plan } from '@/lib/access'
import { detectLocale } from '@/lib/i18n'

// Teto de aberturas de report COMPLETO por conta, por hora. Generoso para leitura
// humana; barra exportacao em massa (scraping logado).
const READ_HOURLY_CAP = 30

interface Props {
  params: Promise<{ id: string }>
}

async function getReport(id: string): Promise<{ report: Report; trends: ReportTrend[] } | null> {
  const supabase = createSupabaseService()

  const [{ data: report }, { data: trends }] = await Promise.all([
    supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .eq('status', 'published')
      .maybeSingle(),

    supabase
      .from('report_trends')
      .select('*')
      .eq('report_id', id)
      .order('rank', { ascending: true }),
  ])

  if (!report) return null
  return { report: report as Report, trends: (trends ?? []) as ReportTrend[] }
}

export default async function ReportPage({ params }: Props) {
  const { id } = await params

  const data = await getReport(id)
  if (!data) notFound()

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  let plan:            Plan | null = null
  let savedScrollPct:  number      = 0
  let freeUnlockCount: number      = 0
  let alreadyUnlocked: boolean     = false

  if (user) {
    // ── Plano corrente ──
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan')
        .eq('user_id', user.id)
        .maybeSingle()
      const p = sub?.plan as string | undefined
      if (p === 'free' || p === 'essential' || p === 'strategic') plan = p
    } catch { /* tabela ausente ou sem registro → plan null (tratado como free) */ }

    // ── Posição de leitura salva ──
    const { data: progress } = await supabase
      .from('reading_progress')
      .select('scroll_pct, completed')
      .eq('user_id', user.id)
      .eq('report_id', id)
      .maybeSingle()
    savedScrollPct = progress && !progress.completed ? (progress.scroll_pct ?? 0) : 0

    // ── FREE: conta desbloqueios ativos dos últimos 30 dias e verifica se
    //         ESTE relatório está entre eles (alreadyUnlocked).
    if (plan === 'free' || plan === null) {
      const service = createSupabaseService()
      const cutoff  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const { data: views } = await service
        .from('report_views')
        .select('report_id, unlocked_at')
        .eq('user_id', user.id)
        .gte('unlocked_at', cutoff)

      const distinctIds = new Set((views ?? []).map(v => v.report_id as string))
      freeUnlockCount = distinctIds.size
      alreadyUnlocked = distinctIds.has(id)
    }
  }

  const accessLevel = getAccessLevel({
    plan,
    reportPeriod: data.report.period,
    isLoggedIn,
    freeUnlockCount,
    alreadyUnlocked,
  })

  // ── FREE: se vai ver completo e ainda não desbloqueou, grava report_views.
  //   Consome 1 slot. Usa upsert para o caso raro de existir entrada antiga
  //   (>30 dias) — renova o unlocked_at para agora (re-unlock).
  if ((plan === 'free' || plan === null) && user && accessLevel.canSeeFullReport && !alreadyUnlocked) {
    const service = createSupabaseService()
    await service
      .from('report_views')
      .upsert(
        { user_id: user.id, report_id: id, unlocked_at: new Date().toISOString() },
        { onConflict: 'user_id,report_id' },
      )
  }

  const isPt = detectLocale((await cookies()).get('taime-locale')?.value) === 'pt'

  // ── Rate limit de leitura: so conta abertura de conteudo INTEGRAL por conta.
  //   Ignora prefetch do Next (link em viewport/hover) para nao inflar o contador.
  //   Fail-open se a funcao ainda nao existir (migration nao aplicada).
  if (user && accessLevel.canSeeFullReport) {
    const isPrefetch = (await headers()).get('next-router-prefetch') === '1'
    if (!isPrefetch) {
      try {
        const service = createSupabaseService()
        const { data: consume, error } = await service.rpc('report_read_consume', {
          p_user_id:    user.id,
          p_hourly_cap: READ_HOURLY_CAP,
        })
        if (!error) {
          const row = (Array.isArray(consume) ? consume[0] : consume) as { allowed?: boolean } | undefined
          if (row && row.allowed === false) {
            return <ReportRateLimited isPt={isPt} />
          }
        }
      } catch {
        // fail-open: nunca bloqueia leitura legitima por causa de erro de infra.
      }
    }
  }

  return (
    <ReportClient
      report={data.report}
      trends={data.trends}
      savedScrollPct={accessLevel.canSeeFullReport ? savedScrollPct : 0}
      accessLevel={accessLevel}
      plan={plan}
      viewerEmail={accessLevel.canSeeFullReport ? user?.email ?? null : null}
    />
  )
}
