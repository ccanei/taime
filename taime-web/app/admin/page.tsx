import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { costOf, type LlmCallRow } from '@/lib/telemetry-agg'
import { seriesByDay, countInWindow, windowDelta } from '@/lib/admin-agg'
import {
  AdminHeader, Section, StatCard, TrendLine, StackBar, StatusBadge,
  fmtInt, fmtUsd, EmptyState,
} from '@/components/admin/kit'
import ReloadButton from '@/components/admin/ReloadButton'

const DAY = 86_400_000

// Le so as colunas necessarias para cada metrica e agrega no servidor. Nada de
// tabela crua para o client: o cockpit recebe series/contagens compactas.
async function loadCockpit() {
  const svc = createSupabaseService()
  const now = Date.now()
  const since30 = new Date(now - 30 * DAY).toISOString()

  const [usersRes, advRes, anonRes, reportsRes, waitlistRes, feedbackRes, llmRes] = await Promise.all([
    svc.from('users').select('created_at'),
    svc.from('advisory_memory').select('session_id, role, created_at').eq('role', 'user').gte('created_at', since30).limit(50_000),
    svc.from('anon_advisor_log').select('created_at').gte('created_at', since30).limit(50_000),
    svc.from('reports').select('id, status, period, title_pt_br, created_at, published_at'),
    svc.from('waitlist').select('status, created_at'),
    svc.from('feedback').select('id, user_email, type, message, status, created_at').order('created_at', { ascending: false }).limit(8),
    svc.from('llm_calls').select('created_at, caller, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, latency_ms, success, error_code, user_id, meta').gte('created_at', since30).limit(100_000),
  ])

  const userDates = (usersRes.data ?? []).map(r => r.created_at as string)
  const advRows   = (advRes.data ?? []) as { session_id: string | null; created_at: string }[]
  const anonDates = (anonRes.data ?? []).map(r => r.created_at as string)
  const reports   = (reportsRes.data ?? []) as { id: string; status: string; period: string | null; title_pt_br: string | null; created_at: string; published_at: string | null }[]
  const waitlist  = (waitlistRes.data ?? []) as { status: string | null; created_at: string }[]
  const feedback  = (feedbackRes.data ?? []) as { id: string; user_email: string | null; type: string | null; message: string | null; status: string | null; created_at: string }[]
  const llmRows   = (llmRes.data ?? []) as LlmCallRow[]

  // Advisor: conversas (session_id distintos) e perguntas por janela.
  const advDates = advRows.map(r => r.created_at)
  const conv7d = new Set(advRows.filter(r => Date.parse(r.created_at) >= now - 7 * DAY).map(r => r.session_id).filter(Boolean)).size

  // Custo LLM: 7d vs 7d anterior para o delta.
  const cut7 = now - 7 * DAY, cut14 = now - 14 * DAY
  let cost7d = 0, costPrev7d = 0
  for (const r of llmRows) {
    const t = Date.parse(r.created_at)
    if (Number.isNaN(t)) continue
    const c = costOf(r)
    if (t >= cut7) cost7d += c
    else if (t >= cut14) costPrev7d += c
  }
  const costDelta = costPrev7d > 0 ? ((cost7d - costPrev7d) / costPrev7d) * 100 : 0

  // Distribuicao de reports por status (para o StackBar).
  const reportStatus = new Map<string, number>()
  for (const r of reports) reportStatus.set(r.status, (reportStatus.get(r.status) ?? 0) + 1)

  return {
    users: {
      total: userDates.length,
      new7d: countInWindow(userDates, 7, now),
      delta7d: windowDelta(userDates, 7, now),
      series: seriesByDay(userDates, 30, now),
    },
    advisor: {
      conv7d,
      q7d: countInWindow(advDates, 7, now),
      qDelta: windowDelta(advDates, 7, now),
      series: seriesByDay(advDates, 30, now),
    },
    ask: {
      q7d: countInWindow(anonDates, 7, now),
      delta: windowDelta(anonDates, 7, now),
    },
    reports: {
      published: reports.filter(r => r.status === 'published').length,
      pending: reports.filter(r => r.status === 'pending_review' || r.status === 'generating'),
      statusSegments: [...reportStatus.entries()].map(([label, value]) => ({ label, value })),
    },
    cost: { cost7d, costDelta },
    waitlistPending: waitlist.filter(w => (w.status ?? 'pending') === 'pending').length,
    feedback,
  }
}

function ago(iso: string): string {
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export const metadata = { title: 'Cockpit · TAIME Admin' }

export default async function AdminHomePage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const d = await loadCockpit()
  const actionCount = d.reports.pending.length + d.waitlistPending

  return (
    <div className="min-h-screen bg-zinc-50">
      <AdminHeader title="Cockpit" active="/admin" />

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Visão geral</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Estado da operação nos últimos 7 e 30 dias. Números no topo, ação logo abaixo.
            </p>
          </div>
          <ReloadButton />
        </div>

        {/* Linha executiva de StatCards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Usuários totais" value={fmtInt(d.users.total)} href="/admin/users"
            hint={`+${fmtInt(d.users.new7d)} nos últimos 7d`} delta={d.users.delta7d} />
          <StatCard label="Novos usuários 7d" value={fmtInt(d.users.new7d)} delta={d.users.delta7d} href="/admin/users" />
          <StatCard label="Conversas Advisor 7d" value={fmtInt(d.advisor.conv7d)} href="/admin/engagement"
            hint={`${fmtInt(d.advisor.q7d)} perguntas`} />
          <StatCard label="Perguntas /ask 7d" value={fmtInt(d.ask.q7d)} delta={d.ask.delta} href="/admin/engagement" />
          <StatCard label="Reports publicados" value={fmtInt(d.reports.published)} href="/admin/reports"
            hint={d.reports.pending.length ? `${d.reports.pending.length} aguardando revisão` : 'nada na fila'}
            tone={d.reports.pending.length ? 'warn' : undefined} />
          <StatCard label="Custo LLM 7d" value={fmtUsd(d.cost.cost7d)} delta={d.cost.costDelta}
            deltaGoodWhenUp={false} href="/admin/telemetry" />
        </div>

        {/* Tendencias */}
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <Section title="Novos usuários por dia" note="Últimos 30 dias" className="mt-0">
            <TrendLine data={d.users.series} unit=" usuários" />
          </Section>
          <Section title="Uso do Advisor por dia" note="Perguntas de usuários logados, 30 dias" className="mt-0">
            <TrendLine data={d.advisor.series} unit=" perguntas" />
          </Section>
        </div>

        {/* Fila de acao + distribuicao de reports */}
        <div className="grid lg:grid-cols-3 gap-6 mt-6">
          <Section
            title="Fila de ação"
            note={actionCount ? `${actionCount} item(ns) aguardando você` : 'tudo em dia'}
            className="mt-0 lg:col-span-2"
          >
            {actionCount === 0 && d.feedback.length === 0 ? (
              <EmptyState>Nada aguardando ação. Fila limpa.</EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-100 -my-1">
                {d.reports.pending.slice(0, 5).map(r => (
                  <li key={r.id}>
                    <Link href="/admin/reports" className="flex items-center gap-3 py-2.5 hover:bg-taime-50/40 -mx-2 px-2 rounded-lg transition-colors">
                      <StatusBadge status="pending_review" />
                      <span className="flex-1 min-w-0 truncate text-sm text-zinc-700">{r.title_pt_br ?? `Relatório ${r.period ?? ''}`}</span>
                      <span className="text-xs text-zinc-400 shrink-0">revisar →</span>
                    </Link>
                  </li>
                ))}
                {d.waitlistPending > 0 && (
                  <li>
                    <Link href="/admin/waitlist" className="flex items-center gap-3 py-2.5 hover:bg-taime-50/40 -mx-2 px-2 rounded-lg transition-colors">
                      <StatusBadge status="pending" />
                      <span className="flex-1 min-w-0 truncate text-sm text-zinc-700">{fmtInt(d.waitlistPending)} pedido(s) de acesso na waitlist</span>
                      <span className="text-xs text-zinc-400 shrink-0">aprovar →</span>
                    </Link>
                  </li>
                )}
                {d.feedback.slice(0, 4).map(f => (
                  <li key={f.id}>
                    <Link href="/admin/feedback" className="flex items-center gap-3 py-2.5 hover:bg-taime-50/40 -mx-2 px-2 rounded-lg transition-colors">
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-zinc-100 text-zinc-600 border-zinc-200 shrink-0">{f.type ?? 'feedback'}</span>
                      <span className="flex-1 min-w-0 truncate text-sm text-zinc-600">{f.message ?? f.user_email ?? '(sem mensagem)'}</span>
                      <span className="text-xs text-zinc-400 shrink-0 tabular-nums">{ago(f.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Reports por status" note="Toda a base" className="mt-0">
            {d.reports.statusSegments.length ? (
              <StackBar segments={d.reports.statusSegments} />
            ) : (
              <EmptyState>Ainda sem relatórios.</EmptyState>
            )}
          </Section>
        </div>
      </main>
    </div>
  )
}
