import { redirect } from 'next/navigation'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { AdminHeader } from '@/components/admin/kit'
import ReloadButton from './ReloadButton'
import { aggregate, type LlmCallRow, type TelemetryAgg } from '@/lib/telemetry-agg'

export const metadata = { title: 'Telemetria · TAIME Admin' }
export const dynamic = 'force-dynamic' // sempre dados frescos (sem cache de rota)

// ── Busca as linhas de llm_calls dos ultimos 30 dias (via service key). ────────
async function getRows(): Promise<{ rows: LlmCallRow[]; tableMissing: boolean }> {
  const supabase = createSupabaseService()
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('llm_calls')
    .select('created_at, caller, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, latency_ms, success, error_code, user_id, meta')
    .gte('created_at', since30)
    .order('created_at', { ascending: false })
    .limit(100_000)

  if (error) {
    // 42P01 = relacao inexistente (migration ainda nao aplicada).
    return { rows: [], tableMissing: true }
  }
  return { rows: (data ?? []) as LlmCallRow[], tableMissing: false }
}

// Resolve e-mail dos user_ids do advisor (top 20). Barato: uma query IN.
async function resolveEmails(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (userIds.length === 0) return out
  try {
    const supabase = createSupabaseService()
    const { data } = await supabase.from('users').select('id, email').in('id', userIds)
    for (const u of (data ?? []) as { id: string; email: string | null }[]) {
      if (u.email) out.set(u.id, u.email)
    }
  } catch { /* segue com user_id cru */ }
  return out
}

// ── Formatadores ───────────────────────────────────────────────────────────
const usd = (n: number) => '$' + n.toLocaleString('pt-BR', { minimumFractionDigits: n < 10 ? 4 : 2, maximumFractionDigits: n < 10 ? 4 : 2 })
const int = (n: number) => n.toLocaleString('pt-BR')
function tok(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(n)
}
function ms(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 's' : Math.round(n) + 'ms'
}
function ago(iso: string): string {
  const d = Date.now() - Date.parse(iso)
  const m = Math.floor(d / 60000)
  if (m < 60) return `ha ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `ha ${h}h`
  return `ha ${Math.floor(h / 24)}d`
}

function Card({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className={`rounded-2xl border p-5 ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-zinc-200 bg-white'}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tone === 'warn' ? 'text-amber-700' : 'text-zinc-900'}`}>{value}</p>
    </div>
  )
}

function Timeline({ data }: { data: TelemetryAgg['timeline'] }) {
  const max = Math.max(...data.map(d => d.cost), 0.0001)
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map(d => (
        <div key={d.date} className="flex-1 flex flex-col items-center justify-end group" title={`${d.date}: ${usd(d.cost)}`}>
          <div
            className="w-full rounded-t bg-taime-500/70 group-hover:bg-taime-600 transition-colors min-h-[2px]"
            style={{ height: `${Math.max(2, (d.cost / max) * 100)}%` }}
          />
          <span className="mt-1 text-[9px] text-zinc-400 tabular-nums">{d.date.slice(8, 10)}</span>
        </div>
      ))}
    </div>
  )
}

export default async function AdminTelemetryPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const { rows, tableMissing } = await getRows()
  const agg = aggregate(rows, Date.now())
  const emails = await resolveEmails(agg.advisorByUser.map(u => u.userId))
  const empty = !tableMissing && rows.length === 0

  return (
    <div className="min-h-screen bg-zinc-50">
      <AdminHeader title="Telemetria" active="/admin/telemetry" />

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Telemetria de LLM</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Custo, latencia e saude das chamadas de modelo. Janela: ultimos 30 dias.{' '}
              <span className="text-zinc-400">Custos <strong>estimados</strong> a partir dos tokens.</span>
            </p>
          </div>
          <ReloadButton />
        </div>

        {tableMissing ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-900">
            <p className="font-semibold mb-1">Tabela llm_calls ainda nao criada</p>
            <p className="text-amber-800">
              Execute <code className="px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">migration-llm-calls.sql</code>{' '}
              (raiz do taime-CLEAN) no SQL editor do Supabase para popular este painel.
            </p>
          </div>
        ) : (
          <>
            {/* ── CARDS ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card label="Gasto hoje (estimado)"        value={usd(agg.cards.costToday)} />
              <Card label="Gasto ultimos 7 dias"          value={usd(agg.cards.cost7d)} />
              <Card label="Gasto ultimos 30 dias"         value={usd(agg.cards.cost30d)} />
              <Card label="Taxa de erro 7 dias"           value={`${agg.cards.errRate7d.toFixed(1)}%`} tone={agg.cards.errRate7d > 5 ? 'warn' : undefined} />
            </div>

            {empty ? (
              <div className="mt-10 rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
                Sem dados no periodo. As linhas aparecem conforme o pipeline e o Advisor rodam.
              </div>
            ) : (
              <>
                {/* ── GASTO POR CALLER ──────────────────────────────── */}
                <Section title="Gasto por caller" note="Ultimos 30 dias, ordenado por custo estimado.">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                        <th className="py-2 font-medium">Caller</th>
                        <th className="py-2 font-medium text-right">Chamadas</th>
                        <th className="py-2 font-medium text-right">Tokens in</th>
                        <th className="py-2 font-medium text-right">Tokens out</th>
                        <th className="py-2 font-medium text-right">Cache read</th>
                        <th className="py-2 font-medium text-right">Custo est.</th>
                        <th className="py-2 font-medium text-right">% total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agg.byCaller.map(c => (
                        <tr key={c.caller} className="border-b border-zinc-50">
                          <td className="py-2 font-semibold text-zinc-800">{c.caller}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-600">{int(c.calls)}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-600">{tok(c.inTok)}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-600">{tok(c.outTok)}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-600">{tok(c.cacheRead)}</td>
                          <td className="py-2 text-right tabular-nums font-semibold text-zinc-900">{usd(c.cost)}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-500">{c.pct.toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>

                {/* ── UNIT ECONOMICS DO ADVISOR ─────────────────────── */}
                <Section title="Unit economics do Advisor" note="Custo por usuario (caller advisor, 30 dias). Top 20 por custo. Base de precificacao do Essential.">
                  {agg.advisorByUser.length === 0 ? (
                    <p className="text-sm text-zinc-400 py-4">Sem chamadas do Advisor logado no periodo.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                          <th className="py-2 font-medium">Usuario</th>
                          <th className="py-2 font-medium text-right">Mensagens</th>
                          <th className="py-2 font-medium text-right">Tokens in</th>
                          <th className="py-2 font-medium text-right">Tokens out</th>
                          <th className="py-2 font-medium text-right">Custo est.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agg.advisorByUser.map(u => (
                          <tr key={u.userId} className="border-b border-zinc-50">
                            <td className="py-2 text-zinc-700">{emails.get(u.userId) ?? <span className="font-mono text-xs text-zinc-400">{u.userId.slice(0, 8)}…</span>}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-600">{int(u.messages)}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-600">{tok(u.inTok)}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-600">{tok(u.outTok)}</td>
                            <td className="py-2 text-right tabular-nums font-semibold text-zinc-900">{usd(u.cost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Section>

                {/* ── LATENCIA E SAUDE ──────────────────────────────── */}
                <Section title="Latencia e saude" note="Por caller, 30 dias. Destaque quando p95 do advisor/ask passa de 30s ou erro passa de 5%.">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                        <th className="py-2 font-medium">Caller</th>
                        <th className="py-2 font-medium text-right">Chamadas</th>
                        <th className="py-2 font-medium text-right">p50</th>
                        <th className="py-2 font-medium text-right">p95</th>
                        <th className="py-2 font-medium text-right">Sucesso</th>
                        <th className="py-2 font-medium">Ultimo erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agg.health.map(h => {
                        const slowUser = (h.caller === 'advisor' || h.caller === 'ask') && h.p95 > 30_000
                        const lowSuccess = h.successRate < 95
                        return (
                          <tr key={h.caller} className="border-b border-zinc-50">
                            <td className="py-2 font-semibold text-zinc-800">{h.caller}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-600">{int(h.calls)}</td>
                            <td className="py-2 text-right tabular-nums text-zinc-600">{ms(h.p50)}</td>
                            <td className={`py-2 text-right tabular-nums ${slowUser ? 'text-amber-700 font-semibold' : 'text-zinc-600'}`}>{ms(h.p95)}</td>
                            <td className={`py-2 text-right tabular-nums ${lowSuccess ? 'text-amber-700 font-semibold' : 'text-zinc-600'}`}>{h.successRate.toFixed(1)}%</td>
                            <td className="py-2 text-xs text-zinc-500">
                              {h.lastError ? <><span className="font-mono text-zinc-600">{h.lastError.code}</span> <span className="text-zinc-400">{ago(h.lastError.at)}</span></> : <span className="text-zinc-300">-</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </Section>

                {/* ── LINHA DO TEMPO ────────────────────────────────── */}
                <Section title="Custo por dia" note="Ultimos 14 dias (estimado).">
                  <Timeline data={agg.timeline} />
                </Section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
      {note && <p className="mt-0.5 mb-4 text-xs text-zinc-500">{note}</p>}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 overflow-x-auto">{children}</div>
    </section>
  )
}
