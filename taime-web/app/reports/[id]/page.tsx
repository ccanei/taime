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

  // Identifica usuário (se logado) e plano corrente — visitante segue como `free`.
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  let plan: Plan | null = null
  let savedScrollPct = 0
  if (user) {
    try {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan')
        .eq('user_id', user.id)
        .maybeSingle()
      const p = sub?.plan as string | undefined
      if (p === 'free' || p === 'essential' || p === 'strategic') plan = p
    } catch { /* tabela ausente ou sem registro → plan null (tratado como free) */ }

    // Posição de leitura salva (só faz sentido para usuário logado com acesso completo)
    const { data: progress } = await supabase
      .from('reading_progress')
      .select('scroll_pct, completed')
      .eq('user_id', user.id)
      .eq('report_id', id)
      .maybeSingle()
    savedScrollPct = progress && !progress.completed ? (progress.scroll_pct ?? 0) : 0
  }

  const accessLevel = getAccessLevel(plan, data.report.period)

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
