import { notFound } from 'next/navigation'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import ReportClient from '@/components/ReportClient'
import type { Report, ReportTrend } from '@/lib/types'
import { getAccessLevel, type Plan } from '@/lib/access'

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

  return (
    <ReportClient
      report={data.report}
      trends={data.trends}
      savedScrollPct={accessLevel.canSeeFullReport ? savedScrollPct : 0}
      accessLevel={accessLevel}
      plan={plan}
    />
  )
}
