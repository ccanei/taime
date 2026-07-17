import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { createSupabaseService } from '@/lib/supabase-server'
import type { Report, ReportTrend } from '@/lib/types'
import ReportClient from '@/components/ReportClient'
import type { LockedTrendStub } from '@/components/ReportClient'
import JsonLd from '@/components/JsonLd'
import { articleNode, toIsoDate, SITE_URL } from '@/lib/structured-data'

interface Props {
  params: Promise<{ id: string }>
}

interface PublicReport extends Report {
  is_public:             boolean
  public_unlocked_rank?: number | null
}

async function getPublicReport(id: string): Promise<{ report: PublicReport; trends: ReportTrend[] } | null> {
  const supabase = createSupabaseService()

  const [{ data: report }, { data: trends }] = await Promise.all([
    supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .eq('status', 'published')
      .eq('is_public', true)
      .maybeSingle(),

    supabase
      .from('report_trends')
      .select('*')
      .eq('report_id', id)
      .order('rank', { ascending: true }),
  ])

  if (!report) return null
  return { report: report as PublicReport, trends: (trends ?? []) as ReportTrend[] }
}

// ─── Metadata para o preview do link (LinkedIn, WhatsApp, X, etc.) ───────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const data = await getPublicReport(id)
  if (!data) return { title: 'TAIME — Sample report' }

  const localeCookie = (await cookies()).get('taime-locale')?.value
  const isEn = localeCookie !== 'pt' // default EN para crawlers (sem cookie)
  const { report } = data

  const title = isEn ? report.title_en : report.title_pt_br
  const summary = (isEn ? report.executive_summary_en : report.executive_summary_pt_br) ?? ''
  const description = summary.split('\n').find(s => s.trim().length > 60)?.slice(0, 200)
    ?? summary.slice(0, 200)

  return {
    title,
    description,
    openGraph: {
      type:        'article',
      title,
      description,
      siteName:    'TAIME',
      images:      [{ url: '/og-image.png', width: 1200, height: 630, alt: 'TAIME' }],
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
      images:      ['/og-image.png'],
    },
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function PublicReportPage({ params }: Props) {
  const { id } = await params
  const data = await getPublicReport(id)
  if (!data) notFound()

  const { report, trends } = data

  // ── JSON-LD Article: mesma logica de locale do generateMetadata (crawler sem
  // cookie ve EN). So campos VISIVEIS na pagina: titulo e o preview do resumo.
  const isEn = (await cookies()).get('taime-locale')?.value !== 'pt'
  const headline = isEn ? report.title_en : report.title_pt_br
  const summary  = (isEn ? report.executive_summary_en : report.executive_summary_pt_br) ?? ''
  const description = summary.split('\n').find(s => s.trim().length > 60)?.slice(0, 200)
    ?? summary.slice(0, 200)
  const updatedAt = (report as unknown as { updated_at?: string }).updated_at
  const articleData = articleNode({
    headline,
    description,
    datePublished: toIsoDate(report.published_at ?? report.period),
    dateModified:  toIsoDate(updatedAt),
    inLanguage:    isEn ? 'en' : 'pt-BR',
    url:           `${SITE_URL}/r/${report.id}`,
  })

  const unlockedRank = report.public_unlocked_rank ?? 1

  // Sanitização server-side: o cliente NUNCA recebe o conteúdo das trends
  // bloqueadas — só o stub mínimo (rank, título, score). Isso garante que
  // não dá para extrair o resto via DevTools/View Source.
  const unlocked = trends.filter(t => t.rank === unlockedRank)
  const lockedStubs: LockedTrendStub[] = trends
    .filter(t => t.rank !== unlockedRank)
    .map(t => ({
      rank:        t.rank,
      title_pt_br: t.title_pt_br,
      title_en:    t.title_en,
      taime_score: t.taime_score,
    }))

  return (
    <>
      <JsonLd data={articleData} />
      <ReportClient
        report={report}
        trends={unlocked}
        publicUnlock={{ unlockedRank, lockedStubs }}
      />
    </>
  )
}
