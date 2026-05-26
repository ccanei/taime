import { notFound, redirect } from 'next/navigation'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import ReportClient from '@/components/ReportClient'
import type { Report, ReportTrend } from '@/lib/types'

interface Props {
  params: { id: string }
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
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await getReport(params.id)
  if (!data) notFound()

  return <ReportClient report={data.report} trends={data.trends} />
}
