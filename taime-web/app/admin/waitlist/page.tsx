import { redirect } from 'next/navigation'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { seriesByDay, countInWindow } from '@/lib/admin-agg'
import { AdminHeader, Section, StatCard, TrendLine, fmtInt, fmtPct } from '@/components/admin/kit'
import ReloadButton from '@/components/admin/ReloadButton'
import WaitlistAdmin from './WaitlistAdmin'
import type { WaitlistRecord } from './WaitlistAdmin'

async function getWaitlist(): Promise<WaitlistRecord[]> {
  const supabase = createSupabaseService()
  // Traz TODOS os status (inclui rejected, antes invisiveis). O filtro por status
  // agora e feito na UI, com aba/contador dedicado para rejeitados.
  const { data } = await supabase
    .from('waitlist')
    .select('id, email, name, company, role, interest, requested_plan, created_at, contacted, status')
    .order('created_at', { ascending: false })
  return (data as WaitlistRecord[]) ?? []
}

/**
 * Mapa email → plano aprovado (somente subscriptions ativas).
 * Faz 2 GETs: subscriptions e users, cruza por id (mais previsível que
 * depender de relação nomeada no PostgREST).
 */
async function getApprovedPlansByEmail(): Promise<Record<string, string>> {
  const supabase = createSupabaseService()
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('user_id, plan')
    .eq('status', 'active')
  const subRows = (subs ?? []) as { user_id: string; plan: string }[]
  if (subRows.length === 0) return {}

  const ids = [...new Set(subRows.map(s => s.user_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, email')
    .in('id', ids)
  const userRows = (users ?? []) as { id: string; email: string }[]
  const emailById = new Map(userRows.map(u => [u.id, u.email]))

  const map: Record<string, string> = {}
  for (const s of subRows) {
    const email = emailById.get(s.user_id)
    if (email) map[email] = s.plan
  }
  return map
}

export default async function AdminWaitlistPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const [records, approvedPlanByEmail] = await Promise.all([
    getWaitlist(),
    getApprovedPlansByEmail(),
  ])

  // Resumo executivo (server-side): funil de status, taxa de aprovacao e entradas
  // por dia. A tabela com as acoes (aprovar/rejeitar) segue intacta abaixo.
  const pending  = records.filter(r => (r.status ?? 'pending') === 'pending').length
  const approved = records.filter(r => r.status === 'approved').length
  const rejected = records.filter(r => r.status === 'rejected').length
  const decided  = approved + rejected
  const approvalRate = decided ? (approved / decided) * 100 : 0
  const entrySeries = seriesByDay(records.map(r => r.created_at), 30)
  const new7d = countInWindow(records.map(r => r.created_at), 7)

  return (
    <div className="min-h-screen bg-zinc-50">
      <AdminHeader title="Waitlist" active="/admin/waitlist" />

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Lista de espera</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Gerencie os pedidos de acesso ao TAIME. Aprovação libera acesso por link seguro.
            </p>
          </div>
          <ReloadButton />
        </div>

        {/* Resumo executivo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Pendentes" value={fmtInt(pending)} tone={pending ? 'warn' : undefined}
            hint={pending ? 'aguardando decisão' : 'fila limpa'} />
          <StatCard label="Aprovados" value={fmtInt(approved)} tone="good" />
          <StatCard label="Taxa de aprovação" value={decided ? fmtPct(approvalRate) : 'n/d'}
            hint={`${fmtInt(rejected)} rejeitados`} />
          <StatCard label="Entradas 7d" value={fmtInt(new7d)} />
        </div>

        <Section title="Entradas por dia" note="Últimos 30 dias">
          <TrendLine data={entrySeries} unit=" pedidos" />
        </Section>

        <div className="mt-10">
          <WaitlistAdmin initialRecords={records} approvedPlanByEmail={approvedPlanByEmail} />
        </div>
      </main>
    </div>
  )
}
