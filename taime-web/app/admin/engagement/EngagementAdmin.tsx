'use client'

import { useMemo, useState } from 'react'

export interface EngagementRow {
  user_id:                string
  month:                  string  // timestamptz (1º dia do mês)
  email:                  string | null
  full_name:              string | null
  plan:                   string | null
  reports_opened:         number
  reports_completed:      number
  reports_saved:          number
  advisor_messages:       number
  advisor_input_tokens:   number
  advisor_output_tokens:  number
  advisor_cost_tokens:    number
  last_activity_at:       string | null
}

// Preço Sonnet (claude-sonnet-4-6), USD por 1M tokens. Ajuste se o modelo mudar.
const SONNET_USD_PER_M_INPUT  = 3
const SONNET_USD_PER_M_OUTPUT = 15

function usdCost(inTok: number, outTok: number): number {
  return (inTok / 1_000_000) * SONNET_USD_PER_M_INPUT
       + (outTok / 1_000_000) * SONNET_USD_PER_M_OUTPUT
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// "2026-04-01T..." -> "abr/26"
function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS_PT[Number(m) - 1]}/${y.slice(2)}`
}

function monthKey(ts: string): string {
  return ts.slice(0, 7) // "2026-04"
}

function daysSince(ts: string | null): number | null {
  if (!ts) return null
  const ms = Date.now() - new Date(ts).getTime()
  return Math.floor(ms / 86_400_000)
}

function fmtDate(ts: string | null): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
}

interface MonthCell {
  opened:    number
  completed: number
  saved:     number
  messages:  number
  inTok:     number
  outTok:    number
}

interface UserAgg {
  user_id:      string
  email:        string | null
  full_name:    string | null
  plan:         string
  lastActivity: string | null
  byMonth:      Map<string, MonthCell>
}

type Trend = 'green' | 'yellow' | 'red'

const PLAN_CHIPS: { key: string; label: string }[] = [
  { key: 'all',       label: 'Todos' },
  { key: 'free',      label: 'Free' },
  { key: 'essential', label: 'Essential' },
  { key: 'strategic', label: 'Strategic' },
]

const TREND_STYLE: Record<Trend, { dot: string; label: string }> = {
  green:  { dot: 'bg-emerald-500', label: 'Estável' },
  yellow: { dot: 'bg-amber-500',   label: 'Queda' },
  red:    { dot: 'bg-rose-500',    label: 'Inativo' },
}

export default function EngagementAdmin({ rows }: { rows: EngagementRow[] }) {
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [expanded, setExpanded]     = useState<string | null>(null)

  // 3 meses mais recentes presentes nos dados (ordenados do mais antigo p/ o mais novo).
  const months = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(monthKey(r.month))
    return Array.from(set).sort().slice(-3)
  }, [rows])

  // Agrega linhas (user, mês) por usuário.
  const users = useMemo(() => {
    const map = new Map<string, UserAgg>()
    for (const r of rows) {
      let u = map.get(r.user_id)
      if (!u) {
        u = {
          user_id:      r.user_id,
          email:        r.email,
          full_name:    r.full_name,
          plan:         r.plan ?? 'free',
          lastActivity: r.last_activity_at,
          byMonth:      new Map(),
        }
        map.set(r.user_id, u)
      }
      // mantém a última atividade mais recente
      if (r.last_activity_at && (!u.lastActivity || r.last_activity_at > u.lastActivity)) {
        u.lastActivity = r.last_activity_at
      }
      u.byMonth.set(monthKey(r.month), {
        opened:    r.reports_opened,
        completed: r.reports_completed,
        saved:     r.reports_saved,
        messages:  r.advisor_messages,
        inTok:     r.advisor_input_tokens,
        outTok:    r.advisor_output_tokens,
      })
    }
    return Array.from(map.values())
  }, [rows])

  // Sinal de tendência por usuário:
  //   red    = sem atividade há 30+ dias
  //   yellow = atividade do mês mais recente caiu >50% vs mês anterior
  //   green  = estável ou crescendo
  function trendFor(u: UserAgg): Trend {
    const inactive = daysSince(u.lastActivity)
    if (inactive === null || inactive >= 30) return 'red'
    if (months.length >= 2) {
      const cur  = u.byMonth.get(months[months.length - 1])
      const prev = u.byMonth.get(months[months.length - 2])
      const curAct  = cur  ? cur.opened  + cur.messages  : 0
      const prevAct = prev ? prev.opened + prev.messages : 0
      if (prevAct > 0 && curAct < prevAct * 0.5) return 'yellow'
    }
    return 'green'
  }

  const visible = useMemo(() => {
    const filtered = planFilter === 'all'
      ? users
      : users.filter(u => u.plan === planFilter)
    return filtered.sort((a, b) => {
      const av = a.lastActivity ?? ''
      const bv = b.lastActivity ?? ''
      return bv.localeCompare(av) // mais recente primeiro
    })
  }, [users, planFilter])

  function costFor(u: UserAgg): { tokens: number; usd: number } {
    let inTok = 0, outTok = 0
    for (const k of months) {
      const c = u.byMonth.get(k)
      if (c) { inTok += c.inTok; outTok += c.outTok }
    }
    return { tokens: inTok + outTok, usd: usdCost(inTok, outTok) }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-500">
        Sem dados de engajamento ainda.
      </div>
    )
  }

  return (
    <div>
      {/* Filtro por plano */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {PLAN_CHIPS.map(chip => (
          <button
            key={chip.key}
            onClick={() => setPlanFilter(chip.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              planFilter === chip.key
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300'
            }`}>
            {chip.label}
          </button>
        ))}
        <span className="text-xs text-zinc-400 ml-auto">{visible.length} usuários</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs text-zinc-400">
              <th className="text-left font-medium px-4 py-3">Usuário</th>
              <th className="text-left font-medium px-3 py-3">Plano</th>
              {months.map(k => (
                <th key={k} className="text-center font-medium px-3 py-3 whitespace-nowrap">
                  {monthLabel(k)}
                  <div className="text-[10px] text-zinc-300 font-normal">abertos · msgs</div>
                </th>
              ))}
              <th className="text-left font-medium px-3 py-3 whitespace-nowrap">Últ. atividade</th>
              <th className="text-left font-medium px-3 py-3">Sinal</th>
              <th className="text-right font-medium px-4 py-3 whitespace-nowrap">Custo Advisor (3m)</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(u => {
              const trend = trendFor(u)
              const ts    = TREND_STYLE[trend]
              const cost  = costFor(u)
              const isOpen = expanded === u.user_id
              const inactive = daysSince(u.lastActivity)
              return (
                <FragmentRow key={u.user_id}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : u.user_id)}
                    className="border-b border-zinc-50 hover:bg-zinc-50 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{u.full_name ?? '-'}</div>
                      <div className="text-xs text-zinc-400">{u.email ?? u.user_id.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 capitalize">
                        {u.plan}
                      </span>
                    </td>
                    {months.map(k => {
                      const c = u.byMonth.get(k)
                      return (
                        <td key={k} className="px-3 py-3 text-center tabular-nums">
                          {c
                            ? <span className="text-zinc-700">{c.opened} · {c.messages}</span>
                            : <span className="text-zinc-300">-</span>}
                        </td>
                      )
                    })}
                    <td className="px-3 py-3 text-xs text-zinc-500 whitespace-nowrap">
                      {fmtDate(u.lastActivity)}
                      {inactive !== null && (
                        <span className="text-zinc-300"> · {inactive}d</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className={`w-2 h-2 rounded-full ${ts.dot}`} />
                        {ts.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      <div className="text-zinc-800">${cost.usd.toFixed(2)}</div>
                      <div className="text-[10px] text-zinc-400">{cost.tokens.toLocaleString('pt-BR')} tok</div>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="bg-zinc-50/60">
                      <td colSpan={5 + months.length} className="px-4 py-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          {months.map(k => {
                            const c = u.byMonth.get(k)
                            const usd = c ? usdCost(c.inTok, c.outTok) : 0
                            return (
                              <div key={k} className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
                                <div className="text-xs font-semibold text-zinc-700 mb-1.5">{monthLabel(k)}</div>
                                <dl className="text-xs text-zinc-500 space-y-0.5">
                                  <Row label="Abertos"   value={c?.opened ?? 0} />
                                  <Row label="Concluídos" value={c?.completed ?? 0} />
                                  <Row label="Salvos"     value={c?.saved ?? 0} />
                                  <Row label="Msgs Advisor" value={c?.messages ?? 0} />
                                  <Row label="Tokens" value={(c ? c.inTok + c.outTok : 0).toLocaleString('pt-BR')} />
                                  <Row label="Custo" value={`$${usd.toFixed(2)}`} />
                                </dl>
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-zinc-400">
        Sinal: verde = estável/crescendo · amarelo = queda &gt;50% vs mês anterior · vermelho = sem atividade há 30+ dias.
        Custo estima preço Sonnet (${SONNET_USD_PER_M_INPUT}/M entrada, ${SONNET_USD_PER_M_OUTPUT}/M saída) somando os 3 meses.
      </p>
    </div>
  )
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="tabular-nums text-zinc-700">{value}</dd>
    </div>
  )
}
