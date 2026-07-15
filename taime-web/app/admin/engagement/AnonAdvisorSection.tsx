'use client'

// Secao "Advisor Anonimo (/ask)" do /admin/engagement. Recebe agregados ja
// calculados no server (page.tsx) a partir de anon_advisor_log e so renderiza.
// A pagina que a monta ja e admin-only (isAdmin no server component), entao esta
// secao herda a mesma protecao de acesso.

export interface AnonAdvisorSummary {
  present:      boolean   // a tabela anon_advisor_log existe?
  hasTokenData: boolean   // ha ao menos 1 resposta com tokens gravados?
  allTime: { questions: number; visitors: number; inTok: number; outTok: number }
  month:   { label: string; prefix: string; questions: number; visitors: number; inTok: number; outTok: number } // prefix = "YYYY-MM"
  perDay:  { date: string; questions: number; inTok: number; outTok: number }[] // ultimos 30 dias, desc
  abuse:   { ipHashShort: string; count: number }[]  // top 5 por ip_hash, ultimos 7 dias
}

// ── Precos Sonnet 5 (claude-sonnet-5), USD por 1M tokens ─────────────────────
// Introdutorio ate 2026-08-31: $2 entrada / $10 saida. Depois: $3 / $15.
// ATUALIZAR estes numeros (ou a data de corte) quando o preco de intro expirar.
const SONNET5_INTRO_UNTIL       = '2026-08-31'
const SONNET5_IN_INTRO  = 2,  SONNET5_OUT_INTRO  = 10
const SONNET5_IN_STD    = 3,  SONNET5_OUT_STD    = 15

// Fallback para o periodo PRE-telemetria (sem tokens gravados): estimativa grosseira
// por pergunta. Rotulado claramente como aproximacao na UI.
const FALLBACK_USD_PER_QUESTION = 0.04

// Taxa efetiva para uma data (YYYY-MM-DD). Um dia dentro do periodo introdutorio
// usa a taxa de intro; depois de 2026-08-31, a taxa padrao.
function rateForDate(date: string): { in: number; out: number } {
  return date <= SONNET5_INTRO_UNTIL
    ? { in: SONNET5_IN_INTRO, out: SONNET5_OUT_INTRO }
    : { in: SONNET5_IN_STD,   out: SONNET5_OUT_STD }
}

function usdFromTokens(inTok: number, outTok: number, rate: { in: number; out: number }): number {
  return (inTok / 1_000_000) * rate.in + (outTok / 1_000_000) * rate.out
}

// Custo do periodo somando dia a dia (respeita a virada de preco em 2026-08-31).
function periodCost(perDay: AnonAdvisorSummary['perDay']): number {
  let usd = 0
  for (const d of perDay) usd += usdFromTokens(d.inTok, d.outTok, rateForDate(d.date))
  return usd
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// "2026-07-15" -> "15 jul"
function dayLabel(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(d)} ${MONTHS_PT[Number(m) - 1]}`
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-zinc-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function AnonAdvisorSection({ data }: { data: AnonAdvisorSummary }) {
  if (!data.present) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-900">
        <p className="font-semibold mb-1">Tabela de telemetria ainda nao criada</p>
        <p className="text-amber-800">
          Execute <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">add-anon-advisor-log.sql</code>{' '}
          no SQL editor do Supabase para comecar a gravar o usage por resposta do{' '}
          <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">/ask</code>. O arquivo esta na raiz do projeto.
        </p>
      </div>
    )
  }

  // Um mes-calendario usa uma unica taxa (a virada de preco cai em 2026-08-31,
  // ultimo dia de agosto, ainda intro). rateForDate no meio do mes resolve isso.
  const monthUsd    = usdFromTokens(data.month.inTok, data.month.outTok, rateForDate(`${data.month.prefix}-15`))
  const period30Usd = periodCost(data.perDay)
  const q30 = data.perDay.reduce((s, d) => s + d.questions, 0)

  // Custo do mes: preferir tokens; se nao ha token nenhum, cair no fallback.
  const monthCostLabel = data.hasTokenData
    ? `$${monthUsd.toFixed(2)}`
    : `~$${(data.month.questions * FALLBACK_USD_PER_QUESTION).toFixed(2)}`
  const period30CostLabel = data.hasTokenData
    ? `$${period30Usd.toFixed(2)}`
    : `~$${(q30 * FALLBACK_USD_PER_QUESTION).toFixed(2)}`

  const maxDay = data.perDay.reduce((m, d) => Math.max(m, d.questions), 0)

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-zinc-900">Advisor Anonimo (/ask)</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Visitantes sem conta que testam o Advisor (3 perguntas por visitante, Sonnet 5).
          {!data.hasTokenData && (
            <span className="text-amber-600"> Sem tokens gravados ainda: custo aproximado por pergunta.</span>
          )}
        </p>
      </div>

      {/* Cartoes de resumo */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat
          label={`Perguntas (${data.month.label})`}
          value={data.month.questions.toLocaleString('pt-BR')}
          sub={`${data.month.visitors.toLocaleString('pt-BR')} visitantes distintos`}
        />
        <Stat
          label="Perguntas (acumulado)"
          value={data.allTime.questions.toLocaleString('pt-BR')}
          sub={`${data.allTime.visitors.toLocaleString('pt-BR')} visitantes distintos`}
        />
        <Stat
          label={`Custo (${data.month.label})`}
          value={monthCostLabel}
          sub={data.hasTokenData ? 'dos tokens gravados' : 'estimado: perguntas x $0,04'}
        />
        <Stat
          label="Custo (30 dias)"
          value={period30CostLabel}
          sub={data.hasTokenData ? `${q30.toLocaleString('pt-BR')} perguntas` : 'estimado: perguntas x $0,04'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Perguntas por dia (30 dias) */}
        <div className="lg:col-span-2 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 text-sm font-semibold text-zinc-700">
            Perguntas por dia (ultimos 30 dias)
          </div>
          {data.perDay.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">Sem perguntas nos ultimos 30 dias.</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="min-w-full text-sm">
                <tbody>
                  {data.perDay.map(d => {
                    const usd = usdFromTokens(d.inTok, d.outTok, rateForDate(d.date))
                    const pct = maxDay > 0 ? Math.round((d.questions / maxDay) * 100) : 0
                    return (
                      <tr key={d.date} className="border-b border-zinc-50 last:border-0">
                        <td className="px-4 py-2 whitespace-nowrap text-zinc-500 w-24">{dayLabel(d.date)}</td>
                        <td className="px-3 py-2 w-full">
                          <div className="h-2 rounded-full bg-taime-100">
                            <div className="h-2 rounded-full bg-taime-500" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-700 w-12">{d.questions}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-[11px] text-zinc-400 w-16">
                          {data.hasTokenData ? `$${usd.toFixed(2)}` : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sinais de abuso */}
        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 text-sm font-semibold text-zinc-700">
            Sinais de abuso (7 dias)
          </div>
          {data.abuse.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">Nada acima do normal.</div>
          ) : (
            <ul className="divide-y divide-zinc-50">
              {data.abuse.map((a, i) => (
                <li key={a.ipHashShort} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-zinc-300 tabular-nums w-4">{i + 1}</span>
                    <code className="text-xs text-zinc-500 font-mono truncate">{a.ipHashShort}</code>
                  </span>
                  <span className={`text-xs tabular-nums font-semibold ${a.count >= 8 ? 'text-rose-600' : 'text-zinc-600'}`}>
                    {a.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="px-4 py-2.5 text-[11px] text-zinc-400 border-t border-zinc-50">
            Top 5 ip_hash por volume. Nunca guardamos o IP cru; so o hash. Vermelho = bateu o teto horario (8/h).
          </p>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-zinc-400">
        Custo estima preco Sonnet 5 (intro ${SONNET5_IN_INTRO}/M entrada, ${SONNET5_OUT_INTRO}/M saida ate {SONNET5_INTRO_UNTIL};
        depois ${SONNET5_IN_STD}/${SONNET5_OUT_STD}). Telemetria grava so ip_hash e tokens, nunca o conteudo das perguntas.
      </p>
    </div>
  )
}
