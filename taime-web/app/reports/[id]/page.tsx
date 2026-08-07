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

  // Prefetch do Next (link em viewport/hover) executa o server component. NUNCA
  // pode CONSUMIR cota nem contar leitura: so a navegacao real consome.
  const isPrefetch = (await headers()).get('next-router-prefetch') === '1'

  let plan:             Plan | null = null
  let savedScrollPct:   number      = 0
  let freeUnlockAllowed: boolean    = false

  // Sample publico (is_public): NUNCA consome cota e fica aberto para o Free.
  const isPublicSample = (data.report as { is_public?: boolean }).is_public === true

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

    // ── COTA do Free (arquivo completo, 2 reports por 30 dias) ──
    // Decidido ATOMICAMENTE por free_unlock_report (SECURITY DEFINER): report ja
    // desbloqueado na janela relê sem consumir; sob cota consome e libera; sem cota
    // nega (só preview). Essential/Strategic e o sample publico nao passam pela cota.
    if (plan === 'free' || plan === null) {
      if (isPublicSample) {
        freeUnlockAllowed = true // sample publico: aberto, sem consumir
      } else if (isPrefetch) {
        // Prefetch: checagem READ-ONLY da cota (nunca consome). Se ja ativo ou sob
        // a cota, mostra completo no prefetch; a navegacao real e que consome.
        try {
          const service = createSupabaseService()
          const cutoff  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          const { data: views, error } = await service
            .from('free_report_unlocks')
            .select('report_id, unlocked_at')
            .eq('user_id', user.id)
            .gte('unlocked_at', cutoff)
          if (error) {
            freeUnlockAllowed = true // tabela ausente: fail-open
          } else {
            const distinct = new Set((views ?? []).map(v => (v as { report_id: string }).report_id))
            freeUnlockAllowed = distinct.has(id) || distinct.size < 2
          }
        } catch {
          freeUnlockAllowed = true // fail-open
        }
      } else {
        // Navegacao real: desbloqueio ATOMICO (decide + consome).
        try {
          const service = createSupabaseService()
          const { data: unlock, error } = await service.rpc('free_unlock_report', {
            p_user_id:   user.id,
            p_report_id: id,
          })
          if (error) {
            // Migration ainda nao aplicada (funcao ausente) ou erro de infra:
            // fail-open para nao bloquear leitura legitima antes da migration.
            freeUnlockAllowed = true
          } else {
            const row = (Array.isArray(unlock) ? unlock[0] : unlock) as { allowed?: boolean } | undefined
            freeUnlockAllowed = row?.allowed === true
          }
        } catch {
          freeUnlockAllowed = true // fail-open
        }
      }
    } else {
      freeUnlockAllowed = true // essential/strategic: sem gate de cota
    }
  }

  const accessLevel = getAccessLevel({ plan, isLoggedIn, freeUnlockAllowed })

  const isPt = detectLocale((await cookies()).get('taime-locale')?.value) === 'pt'

  // ── Rate limit de leitura: so conta abertura de conteudo INTEGRAL por conta.
  //   Ignora prefetch do Next (link em viewport/hover) para nao inflar o contador.
  //   Fail-open se a funcao ainda nao existir (migration nao aplicada).
  if (user && accessLevel.canSeeFullReport) {
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
