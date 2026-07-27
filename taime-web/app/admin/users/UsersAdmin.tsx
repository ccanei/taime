'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

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
  origin: 'waitlist' | 'direct' // veio da waitlist ou signup direto (sem waitlist)
  banned: boolean               // conta suspensa (ban no Auth)
  suspect_reasons: string[]     // motivos de suspeita (vazio = nao suspeita)
}

type PlanFilter = 'all' | 'free' | 'essential' | 'strategic' | 'none'
type ActFilter  = 'all' | 'active30' | 'dormant' | 'never'
type FlagFilter = 'all' | 'suspect' | 'no_waitlist'

const DAY = 86_400_000
const now = Date.now()

const REASON_LABEL: Record<string, string> = {
  gmail_dottrick:          'Gmail dot-trick (pontos aleatórios no email)',
  gibberish_name:          'Nome parece string aleatória',
  no_waitlist_free_unused: 'Sem waitlist + free + zero uso do produto',
}

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
  const [list, setList] = useState<UserRow[]>(rows)
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')
  const [actFilter,  setActFilter]  = useState<ActFilter>('all')
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('all')
  const [busy, setBusy]   = useState<string | null>(null)
  const [error, setError] = useState<Map<string, string>>(new Map())

  const withBucket = useMemo(() => list.map(r => ({ r, bucket: activityBucket(r) })), [list])

  const counts = useMemo(() => {
    const c = { total: list.length, free: 0, essential: 0, strategic: 0, none: 0, active30: 0, dormant: 0, never: 0, suspect: 0, noWaitlist: 0, banned: 0 }
    for (const { r, bucket } of withBucket) {
      if (r.plan === 'free') c.free++
      else if (r.plan === 'essential') c.essential++
      else if (r.plan === 'strategic') c.strategic++
      else c.none++
      c[bucket]++
      if (r.suspect_reasons.length > 0) c.suspect++
      if (r.origin === 'direct') c.noWaitlist++
      if (r.banned) c.banned++
    }
    return c
  }, [list, withBucket])

  const filtered = useMemo(() => withBucket.filter(({ r, bucket }) => {
    if (planFilter !== 'all' && (planFilter === 'none' ? r.plan !== null : r.plan !== planFilter)) return false
    if (actFilter !== 'all' && bucket !== actFilter) return false
    if (flagFilter === 'suspect' && r.suspect_reasons.length === 0) return false
    if (flagFilter === 'no_waitlist' && r.origin !== 'direct') return false
    return true
  }), [withBucket, planFilter, actFilter, flagFilter])

  async function act(r: UserRow, action: 'suspend' | 'reactivate') {
    const who = r.full_name ?? r.email
    const msg = action === 'suspend'
      ? `Suspender ${who}? Bloqueia o login e cancela o plano. Reversível.`
      : `Reativar ${who}? Remove o bloqueio e reativa o plano.`
    if (!window.confirm(msg)) return
    setBusy(r.id)
    setError(prev => { const m = new Map(prev); m.delete(r.id); return m })
    try {
      const res = await fetch('/api/admin/user-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, action }),
      })
      const json = await res.json() as { success?: boolean; banned?: boolean; error?: string }
      if (!res.ok || !json.success) {
        setError(prev => new Map(prev).set(r.id, json.error ?? 'Erro'))
        return
      }
      setList(prev => prev.map(x => x.id === r.id ? { ...x, banned: !!json.banned } : x))
    } catch (e) {
      setError(prev => new Map(prev).set(r.id, String(e)))
    } finally {
      setBusy(null)
    }
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`
  const stat = (label: string, value: number, hint?: string, tone?: string) => (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <p className={`text-2xl font-bold tabular-nums ${tone ?? 'text-zinc-900'}`}>{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-zinc-400 mt-0.5">{hint}</p>}
    </div>
  )

  return (
    <div>
      {/* Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
        {stat('Total de contas', counts.total)}
        {stat('Free', counts.free)}
        {stat('Essential', counts.essential)}
        {stat('Strategic', counts.strategic)}
        {stat('Ativos 30d', counts.active30, 'login ou Advisor')}
        {stat('Dormentes', counts.dormant)}
        {stat('Sem waitlist', counts.noWaitlist, 'signup direto', 'text-amber-700')}
        {stat('Suspeitas', counts.suspect, 'para revisar', 'text-red-600')}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
          {([['all', 'Plano: todos'], ['free', 'Free'], ['essential', 'Essential'], ['strategic', 'Strategic'], ['none', 'Sem plano']] as [PlanFilter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setPlanFilter(k)} className={chip(planFilter === k)}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
          {([['all', 'Atividade: todos'], ['active30', 'Ativos 30d'], ['dormant', 'Dormentes'], ['never', 'Nunca acessaram']] as [ActFilter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setActFilter(k)} className={chip(actFilter === k)}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit">
          {([['all', 'Flags: todos'], ['suspect', `Suspeitas (${counts.suspect})`], ['no_waitlist', `Sem waitlist (${counts.noWaitlist})`]] as [FlagFilter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFlagFilter(k)} className={chip(flagFilter === k)}>{l}</button>
          ))}
        </div>
      </div>

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
                  {['Nome', 'Email', 'Origem', 'Criado', 'Plano', 'Interesse', 'Último login', 'Última atividade', 'Msgs', 'Atividade', 'Suspeita', 'Ações'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-zinc-400 tracking-widest uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map(({ r, bucket }) => {
                  const err = error.get(r.id)
                  const isBusy = busy === r.id
                  return (
                    <tr key={r.id} className={`bg-white hover:bg-zinc-50 transition-colors ${r.banned ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-zinc-900 whitespace-nowrap">
                        {r.full_name ?? <span className="text-zinc-400 italic">sem nome</span>}
                        {r.banned && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">suspenso</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">{r.email}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.origin === 'waitlist' ? (
                          <Link href="/admin/waitlist" className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600 hover:bg-zinc-200">waitlist ↗</Link>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">signup direto</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.plan ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${PLAN_BADGE[r.plan] ?? 'bg-zinc-100 text-zinc-700'}`}>{r.plan}</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-400">sem plano</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 max-w-[140px] truncate">{r.interest ?? <span className="text-zinc-300">—</span>}</td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{fmtDateTime(r.last_login)}</td>
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{fmtDateTime(r.last_activity)}</td>
                      <td className="px-4 py-3 text-zinc-700 tabular-nums whitespace-nowrap">{r.msg_count}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {bucket === 'active30' ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">Ativo 30d</span>
                          : bucket === 'dormant' ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">Dormente</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-500">Nunca acessou</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.suspect_reasons.length > 0 ? (
                          <span
                            title={r.suspect_reasons.map(x => REASON_LABEL[x] ?? x).join(' · ')}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 cursor-help">
                            ⚠ Suspeita ({r.suspect_reasons.length})
                          </span>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          {r.banned ? (
                            <button onClick={() => act(r, 'reactivate')} disabled={isBusy}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                              {isBusy ? '...' : 'Reativar'}
                            </button>
                          ) : (
                            <button onClick={() => act(r, 'suspend')} disabled={isBusy}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors">
                              {isBusy ? '...' : 'Suspender'}
                            </button>
                          )}
                          {err && <p className="text-[11px] text-red-600 max-w-[160px]">{err}</p>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-400 max-w-3xl">
        Suspeita e apenas SINALIZAÇÃO (nunca ação automática): passe o mouse no selo para ver os motivos. Suspender
        bane o login (Admin API do Supabase) e cancela o plano; reativar desfaz. Origem "signup direto" = conta sem
        registro na waitlist. Último login vem de auth.users; última atividade e o maior entre login e uso do Advisor.
      </p>
    </div>
  )
}
