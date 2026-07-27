'use client'

import { useMemo, useState } from 'react'

export interface UserRow {
  id: string
  email: string
  full_name: string | null
  created_at: string
  plan: string | null           // subscription ativa; null = sem plano
  interest: string | null
  last_login: string | null     // auth.users.last_sign_in_at
  last_activity: string | null  // max(last_login, ultima mensagem no Advisor)
  msg_count: number             // perguntas no Advisor (advisory_memory role=user)
}

type PlanFilter = 'all' | 'free' | 'essential' | 'strategic' | 'none'
type ActFilter  = 'all' | 'active30' | 'dormant' | 'never'

const DAY = 86_400_000
const now = Date.now()

// Atividade da CONTA = ultima atividade (max entre ultimo login e ultima mensagem
// no Advisor). Particiona todas as contas:
//  never    = nunca acessou (sem login e sem mensagem no Advisor)
//  active30 = ultima atividade nos ultimos 30 dias
//  dormant  = ja teve atividade, mas nao nos ultimos 30 dias
// A coluna "Msgs" mostra, a parte, quem de fato usou o Advisor.
function activityBucket(r: UserRow): 'active30' | 'dormant' | 'never' {
  if (!r.last_activity) return 'never'
  return now - new Date(r.last_activity).getTime() <= 30 * DAY ? 'active30' : 'dormant'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const PLAN_BADGE: Record<string, string> = {
  free:      'bg-zinc-100 text-zinc-700',
  essential: 'bg-blue-50 text-blue-700',
  strategic: 'bg-taime-50 text-taime-700',
}

export default function UsersAdmin({ rows }: { rows: UserRow[] }) {
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')
  const [actFilter,  setActFilter]  = useState<ActFilter>('all')

  const withBucket = useMemo(() => rows.map(r => ({ r, bucket: activityBucket(r) })), [rows])

  const counts = useMemo(() => {
    const c = {
      total: rows.length,
      free: 0, essential: 0, strategic: 0, none: 0,
      active30: 0, dormant: 0, never: 0,
    }
    for (const { r, bucket } of withBucket) {
      if (r.plan === 'free') c.free++
      else if (r.plan === 'essential') c.essential++
      else if (r.plan === 'strategic') c.strategic++
      else c.none++
      c[bucket]++
    }
    return c
  }, [rows, withBucket])

  const filtered = useMemo(() => {
    return withBucket.filter(({ r, bucket }) => {
      if (planFilter !== 'all') {
        if (planFilter === 'none' ? r.plan !== null : r.plan !== planFilter) return false
      }
      if (actFilter !== 'all' && bucket !== actFilter) return false
      return true
    })
  }, [withBucket, planFilter, actFilter])

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
      active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
    }`

  const stat = (label: string, value: number, hint?: string) => (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <p className="text-2xl font-bold text-zinc-900 tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-zinc-400 mt-0.5">{hint}</p>}
    </div>
  )

  return (
    <div>
      {/* Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        {stat('Total de contas', counts.total)}
        {stat('Free', counts.free)}
        {stat('Essential', counts.essential)}
        {stat('Strategic', counts.strategic)}
        {stat('Sem plano', counts.none)}
        {stat('Ativos 30d', counts.active30, 'login ou Advisor')}
        {stat('Dormentes', counts.dormant, 'ativos antes')}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
          {([
            ['all', `Plano: todos`], ['free', 'Free'], ['essential', 'Essential'],
            ['strategic', 'Strategic'], ['none', 'Sem plano'],
          ] as [PlanFilter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setPlanFilter(k)} className={chip(planFilter === k)}>{label}</button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
          {([
            ['all', 'Atividade: todos'], ['active30', 'Ativos 30d'], ['dormant', 'Dormentes'], ['never', 'Nunca acessaram'],
          ] as [ActFilter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setActFilter(k)} className={chip(actFilter === k)}>{label}</button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center text-zinc-400">
          Nenhum usuário para este filtro.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  {['Nome', 'Email', 'Criado', 'Plano', 'Interesse', 'Último login', 'Última atividade', 'Msgs', 'Atividade'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-zinc-400 tracking-widest uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(({ r, bucket }) => (
                  <tr key={r.id} className="bg-white hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-900 whitespace-nowrap">
                      {r.full_name ?? <span className="text-zinc-400 italic">sem nome</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">{r.email}</td>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.plan ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${PLAN_BADGE[r.plan] ?? 'bg-zinc-100 text-zinc-700'}`}>
                          {r.plan}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-400">sem plano</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 max-w-[160px] truncate">
                      {r.interest ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{fmtDateTime(r.last_login)}</td>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{fmtDateTime(r.last_activity)}</td>
                    <td className="px-4 py-3 text-zinc-700 tabular-nums whitespace-nowrap">{r.msg_count}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {bucket === 'active30' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">Ativo 30d</span>
                      ) : bucket === 'dormant' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">Dormente</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-500">Nunca acessou</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-400">
        Último login vem de auth.users (last_sign_in_at). Última atividade e o maior entre o login e a última
        mensagem no Advisor, e e ela que classifica ativos/dormentes. A coluna Msgs mostra, a parte, quem usou o
        Advisor. O painel de Engagement conta atividade mais estrita (so uso de produto), entao pode mostrar menos
        ativos que esta lista, que conta qualquer login.
      </p>
    </div>
  )
}
