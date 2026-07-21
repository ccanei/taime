import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import AdminNav from '@/components/AdminNav'
import EngagementAdmin from './EngagementAdmin'
import type { EngagementRow } from './EngagementAdmin'
import AnonAdvisorSection from './AnonAdvisorSection'
import type { AnonAdvisorSummary } from './AnonAdvisorSection'
import ContactRequestsSection from './ContactRequestsSection'
import type { ContactRequestRecord, ConvMessage } from './ContactRequestsSection'

// A view user_engagement_monthly é entregue em add-engagement-view.sql mas
// pode ainda não ter sido executada no banco. Distinguimos "view ausente" de
// "view vazia" para mostrar a instrução certa.
async function getEngagement(): Promise<{ rows: EngagementRow[]; viewMissing: boolean }> {
  const supabase = createSupabaseService()
  const { data, error } = await supabase
    .from('user_engagement_monthly')
    .select(
      'user_id, month, email, full_name, plan, reports_opened, reports_completed, ' +
      'reports_saved, advisor_messages, advisor_input_tokens, advisor_output_tokens, ' +
      'advisor_cost_tokens, last_activity_at',
    )
    .order('month', { ascending: true })

  if (error) {
    // 42P01 = relação inexistente (view ainda não criada).
    return { rows: [], viewMissing: true }
  }
  return { rows: (data as unknown as EngagementRow[]) ?? [], viewMissing: false }
}

// Agrega a telemetria do Advisor anonimo (/ask) a partir de anon_advisor_log.
// Uma linha por resposta (ip_hash + tokens, nunca IP cru nem conteudo). Volume
// baixo (funil anonimo, 3 perguntas por visitante, teto de IP), entao lemos as
// linhas dos ultimos 90 dias para as janelas e usamos count exato para o total
// acumulado de perguntas.
async function getAnonAdvisor(): Promise<AnonAdvisorSummary> {
  const supabase = createSupabaseService()
  const empty: AnonAdvisorSummary = {
    present: false,
    hasTokenData: false,
    allTime: { questions: 0, visitors: 0, inTok: 0, outTok: 0 },
    month:   { label: '', prefix: '', questions: 0, visitors: 0, inTok: 0, outTok: 0 },
    perDay:  [],
    abuse:   [],
  }

  // Linhas recentes (90 dias) para janelas de mes/30d/abuso.
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data: rows, error } = await supabase
    .from('anon_advisor_log')
    .select('ip_hash, model, input_tokens, output_tokens, created_at')
    .gte('created_at', since90)
    .order('created_at', { ascending: false })
    .limit(50_000)

  if (error) {
    // 42P01 = relacao inexistente (migration ainda nao aplicada).
    return empty
  }

  type LogRow = { ip_hash: string; input_tokens: number; output_tokens: number; created_at: string }
  const recent = (rows ?? []) as LogRow[]

  // Total acumulado (todas as janelas): count exato + visitantes distintos e
  // tokens all-time. Para o total acumulado de tokens/visitantes lemos so as
  // colunas necessarias; o count usa head:true (nao traz linhas).
  const { count: allQuestions } = await supabase
    .from('anon_advisor_log')
    .select('*', { count: 'exact', head: true })

  const { data: allRows } = await supabase
    .from('anon_advisor_log')
    .select('ip_hash, input_tokens, output_tokens')
    .limit(200_000)
  const allList = (allRows ?? []) as Pick<LogRow, 'ip_hash' | 'input_tokens' | 'output_tokens'>[]
  const allVisitors = new Set(allList.map(r => r.ip_hash)).size
  let allIn = 0, allOut = 0
  for (const r of allList) { allIn += r.input_tokens ?? 0; allOut += r.output_tokens ?? 0 }
  const hasTokenData = allIn + allOut > 0

  // Janela: mes corrente (UTC).
  const now = new Date()
  const monthPrefix = now.toISOString().slice(0, 7) // "YYYY-MM"
  const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const monthLabel = `${MONTHS_PT[now.getUTCMonth()]}/${String(now.getUTCFullYear()).slice(2)}`

  const monthRows = recent.filter(r => r.created_at.slice(0, 7) === monthPrefix)
  const monthVisitors = new Set(monthRows.map(r => r.ip_hash)).size
  let monthIn = 0, monthOut = 0
  for (const r of monthRows) { monthIn += r.input_tokens ?? 0; monthOut += r.output_tokens ?? 0 }

  // Perguntas por dia (ultimos 30 dias, desc).
  const cut30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const perDayMap = new Map<string, { questions: number; inTok: number; outTok: number }>()
  for (const r of recent) {
    if (r.created_at < cut30) continue
    const day = r.created_at.slice(0, 10)
    const cell = perDayMap.get(day) ?? { questions: 0, inTok: 0, outTok: 0 }
    cell.questions += 1
    cell.inTok += r.input_tokens ?? 0
    cell.outTok += r.output_tokens ?? 0
    perDayMap.set(day, cell)
  }
  const perDay = Array.from(perDayMap.entries())
    .map(([date, c]) => ({ date, ...c }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // Sinais de abuso: top 5 ip_hash por volume nos ultimos 7 dias.
  const cut7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const abuseMap = new Map<string, number>()
  for (const r of recent) {
    if (r.created_at < cut7) continue
    abuseMap.set(r.ip_hash, (abuseMap.get(r.ip_hash) ?? 0) + 1)
  }
  const abuse = Array.from(abuseMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ipHash, count]) => ({ ipHashShort: ipHash.slice(0, 12), count }))

  return {
    present: true,
    hasTokenData,
    allTime: { questions: allQuestions ?? allList.length, visitors: allVisitors, inTok: allIn, outTok: allOut },
    month:   { label: monthLabel, prefix: monthPrefix, questions: monthRows.length, visitors: monthVisitors, inTok: monthIn, outTok: monthOut },
    perDay,
    abuse,
  }
}

// Pedidos de contato do Advisor logado: lista + conversa associada (advisory_memory
// do conversation_id) + plano do usuario. Graceful se a tabela ainda nao existe.
async function getContactRequests(): Promise<{ rows: ContactRequestRecord[]; tableMissing: boolean }> {
  const supabase = createSupabaseService()
  const { data, error } = await supabase
    .from('contact_requests')
    .select('id, created_at, subject, message, status, conversation_id, user_id, users(email, full_name)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    return { rows: [], tableMissing: true } // 42P01 = tabela ausente (migration nao aplicada)
  }

  type Raw = {
    id: string; created_at: string; subject: string; message: string; status: string
    conversation_id: string | null; user_id: string
    users: { email: string | null; full_name: string | null } | { email: string | null; full_name: string | null }[] | null
  }
  const raw = (data ?? []) as Raw[]

  // Plano por usuario.
  const userIds = [...new Set(raw.map(r => r.user_id))]
  const planByUser = new Map<string, string>()
  if (userIds.length) {
    const { data: subs } = await supabase.from('subscriptions').select('user_id, plan').in('user_id', userIds)
    for (const s of (subs ?? []) as { user_id: string; plan: string | null }[]) {
      if (s.plan) planByUser.set(s.user_id, s.plan)
    }
  }

  // Conversa por conversation_id (advisory_memory), ordem cronologica.
  const convIds = [...new Set(raw.map(r => r.conversation_id).filter((x): x is string => !!x))]
  const convById = new Map<string, ConvMessage[]>()
  if (convIds.length) {
    const { data: msgs } = await supabase
      .from('advisory_memory')
      .select('session_id, role, content, created_at')
      .in('session_id', convIds)
      .order('created_at', { ascending: true })
      .limit(2000)
    for (const m of (msgs ?? []) as { session_id: string; role: string; content: string }[]) {
      const arr = convById.get(m.session_id) ?? []
      arr.push({ role: m.role, content: m.content })
      convById.set(m.session_id, arr)
    }
  }

  const rows: ContactRequestRecord[] = raw.map(r => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users
    return {
      id: r.id, created_at: r.created_at, subject: r.subject, message: r.message, status: r.status,
      email: u?.email ?? null, full_name: u?.full_name ?? null,
      plan: planByUser.get(r.user_id) ?? 'free',
      conversation: r.conversation_id ? (convById.get(r.conversation_id) ?? []) : [],
    }
  })
  return { rows, tableMissing: false }
}

export const metadata = { title: 'Engajamento · TAIME Admin' }

export default async function AdminEngagementPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const { rows, viewMissing } = await getEngagement()
  const anon = await getAnonAdvisor()
  const contact = await getContactRequests()

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
              ← Dashboard
            </Link>
            <span className="text-zinc-200">/</span>
            <span className="text-sm font-semibold text-zinc-900">Engajamento</span>
            <AdminNav active="/admin/engagement" />
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-taime-50 text-taime-700 font-semibold border border-taime-100">
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">Engajamento por usuário</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Atividade mensal por usuário para detectar queda de uso e medir o custo do Advisor.
          </p>
        </div>

        {viewMissing ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-900">
            <p className="font-semibold mb-1">View ainda não criada</p>
            <p className="text-amber-800">
              Execute <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">add-engagement-view.sql</code>{' '}
              no SQL editor do Supabase para popular este painel. O arquivo está na raiz de{' '}
              <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">taime-web/</code>.
            </p>
          </div>
        ) : (
          <EngagementAdmin rows={rows} />
        )}

        {/* Pedidos de contato do Advisor logado. */}
        <div className="mt-14 pt-10 border-t border-zinc-200">
          <ContactRequestsSection initial={contact.rows} tableMissing={contact.tableMissing} />
        </div>

        {/* Advisor anonimo (/ask): bloco separado, abaixo do engagement logado. */}
        <div className="mt-14 pt-10 border-t border-zinc-200">
          <AnonAdvisorSection data={anon} />
        </div>
      </main>
    </div>
  )
}
