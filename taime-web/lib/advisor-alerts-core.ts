// Nucleo COMPARTILHADO da deteccao/envio dos alertas por evento (Fase 3.1). Uma unica
// fonte das regras (limiar, anti-ruido, escalonamento), consumida por:
//   - o script de raiz detect-advisor-alerts.ts (dry-run manual, --send-test, --self-test)
//   - a rota de cron taime-web/app/api/cron/advisor-alerts (execucao agendada)
// Sem 'use client', sem '@' alias e sem dependencia de Next: roda no Node do script E
// no runtime da funcao. Toda I/O e via fetch (Supabase REST, OpenAI, Resend), com a
// config injetada (nada de process.env aqui dentro).
import { renderNewSignalEmail, renderStalledEmail, type AlertLang } from './advisor-alert-email'

// ── Constantes de politica (ponto UNICO de verdade) ──────────────────────────
export const STALLED_ACTION_DAYS = 14         // acao pendente parada ha N dias vira candidata
export const STALLED_REALERT_DAYS = 30        // escalonamento: apos um lembrete, so 30 dias depois
export const MIN_EMAIL_GAP_DAYS = 7           // anti-ruido: no maximo 1 email por usuario a cada 7 dias
// Limiar cosine conservador (text-embedding-3-small): o TEMA e uma frase curta e a trend
// e um paragrafo, entao a similaridade roda baixa; melhor NAO alertar por casamento fraco.
export const NEW_SIGNAL_MIN_SIMILARITY = 0.42
export const NEW_SIGNAL_MATCH_COUNT = 20

const DAY_MS = 24 * 60 * 60 * 1000

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface PlanAction { text: string; status: string }
export interface PlanPhase { label: string; actions: PlanAction[]; avoid: string[]; exitCriteria: string }
export interface Plan { id: string; user_id: string; title: string | null; theme: string | null; phases: PlanPhase[]; created_at: string; updated_at: string }
export interface UserRow { id: string; email: string; preferred_language: string; alert_new_signal: boolean; alert_stalled_action: boolean; alerts_muted: boolean; alert_optout_token: string }
export interface AlertRow { user_id: string; type: string; status: string; sent_at: string | null; created_at: string; dedup_key: string | null; payload: Record<string, unknown> }
export interface TrendMatch { trend_id: string; report_id: string; period: string; rank: number; theme_slug: string | null; category: string | null; similarity: number; indexed_at: string }

export interface AlertConfig { supabaseUrl: string; serviceKey: string; openaiKey: string; resendKey: string; siteUrl: string }
export interface EventDecision { userId: string; email: string; type: 'new_signal' | 'stalled_action'; planId: string; reason: string; delivered?: boolean }
export interface RunResult {
  dryRun: boolean
  stats: { candidates: number; sent: number; failed: number; skipMuted: number; skipNoOptIn: number; skipGap: number; skipNoEvent: number; usersWithPlans: number }
  events: EventDecision[]
  lines: string[]
}

const FROM = 'TAIME | John <johnb@taime.tech>'

// ── Helpers PUROS (testaveis, sem rede) ──────────────────────────────────────
export function currentPhase(phases: PlanPhase[]): { index: number; phase: PlanPhase | null } {
  if (!phases.length) return { index: 0, phase: null }
  let i = phases.findIndex(p => (p.actions ?? []).some(a => a.status !== 'done'))
  if (i === -1) i = phases.length - 1
  return { index: i, phase: phases[i] }
}
export function firstPendingAction(phase: PlanPhase | null): { index: number; text: string } | null {
  if (!phase) return null
  const i = (phase.actions ?? []).findIndex(a => a.status !== 'done')
  return i === -1 ? null : { index: i, text: phase.actions[i].text }
}
export function isStalledEscalated(alerts: AlertRow[], userId: string, actionText: string, now: number): boolean {
  const cut = now - STALLED_REALERT_DAYS * DAY_MS
  return alerts.some(a =>
    a.user_id === userId && a.type === 'stalled_action' &&
    (a.payload?.action_text as string) === actionText &&
    ((a.status === 'sent' && a.sent_at && new Date(a.sent_at).getTime() >= cut) || (a.status === 'pending')))
}
export function sinceForNewSignal(plan: Plan, lastNewSignalCreatedAt: string | null): string {
  const planT = new Date(plan.created_at).getTime()
  const lastT = lastNewSignalCreatedAt ? new Date(lastNewSignalCreatedAt).getTime() : 0
  return new Date(Math.max(planT, lastT)).toISOString()
}
export function daysBetween(aIso: string, nowMs: number): number { return Math.floor((nowMs - new Date(aIso).getTime()) / DAY_MS) }
export function langOf(preferred: string): AlertLang { return preferred === 'en' ? 'en' : 'pt' }
export function embedLangOf(preferred: string): 'pt' | 'en' { return preferred === 'en' ? 'en' : 'pt' }

// ── Rede (closures sobre a config) ───────────────────────────────────────────
function net(cfg: AlertConfig) {
  const base = cfg.supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const headers = (represent = false) => ({ apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': 'application/json', Prefer: represent ? 'return=representation' : 'return=minimal' })
  return {
    async dbGet<T>(path: string): Promise<T[]> {
      const r = await fetch(`${base}/rest/v1/${path}`, { headers: headers() })
      if (!r.ok) throw new Error(`DB GET /${path.slice(0, 50)}: ${r.status} ${(await r.text()).slice(0, 160)}`)
      return r.json() as Promise<T[]>
    },
    async dbInsert<T>(table: string, row: Record<string, unknown>): Promise<T> {
      const r = await fetch(`${base}/rest/v1/${table}`, { method: 'POST', headers: headers(true), body: JSON.stringify(row) })
      if (!r.ok) throw new Error(`DB INSERT ${table}: ${r.status} ${(await r.text()).slice(0, 160)}`)
      return (await r.json())[0] as T
    },
    async dbPatch(table: string, filter: string, patch: Record<string, unknown>): Promise<void> {
      const r = await fetch(`${base}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) })
      if (!r.ok) throw new Error(`DB PATCH ${table}: ${r.status} ${(await r.text()).slice(0, 160)}`)
    },
    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
      const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) })
      if (!r.ok) throw new Error(`RPC ${fn}: ${r.status} ${(await r.text()).slice(0, 160)}`)
      return r.json() as Promise<T[]>
    },
    async embed(text: string): Promise<number[] | null> {
      try {
        const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { Authorization: `Bearer ${cfg.openaiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'text-embedding-3-small', input: text }) })
        if (!r.ok) return null
        const j = await r.json() as { data?: Array<{ embedding: number[] }> }
        return j.data?.[0]?.embedding ?? null
      } catch { return null }
    },
    async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
      if (!cfg.resendKey) return false
      try {
        const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, reply_to: 'johnb@taime.tech', to: [to], subject, html }) })
        return r.ok
      } catch { return false }
    },
  }
}

function optoutUrl(site: string, token: string): string { return `${site}/api/alerts/unsubscribe?token=${encodeURIComponent(token)}` }
function newSignalCta(site: string, planTheme: string, lang: AlertLang): string {
  const q = lang === 'pt' ? `O que a análise mais recente sobre ${planTheme} muda para o meu plano?` : `What does the most recent analysis on ${planTheme} change for my plan?`
  return `${site}/dashboard/advisor?ask=${encodeURIComponent(q)}`
}
function stalledCta(site: string, planId: string): string { return `${site}/dashboard/advisor/plans?id=${planId}` }

interface Candidate { type: 'new_signal' | 'stalled_action'; plan: Plan; reason: string; dedupKey: string | null; payload: Record<string, unknown>; email: { subject: string; html: string } }

async function detectForUser(n: ReturnType<typeof net>, site: string, user: UserRow, plans: Plan[], alerts: AlertRow[], nowMs: number, log: (s: string) => void): Promise<Candidate | null> {
  const lang = langOf(user.preferred_language)
  const userAlerts = alerts.filter(a => a.user_id === user.id)
  const alertedTrendIds = new Set(userAlerts.filter(a => a.type === 'new_signal' && a.dedup_key).map(a => a.dedup_key!.replace('new_signal:', '')))
  const lastNewSignal = userAlerts.filter(a => a.type === 'new_signal').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.created_at ?? null

  // 1) NEW_SIGNAL (prioridade)
  if (user.alert_new_signal) {
    let best: { plan: Plan; match: TrendMatch } | null = null
    for (const plan of plans) {
      const theme = (plan.theme || plan.title || '').trim()
      if (!theme) continue
      const vec = await n.embed(theme)
      if (!vec) continue
      const since = sinceForNewSignal(plan, lastNewSignal)
      let rows: TrendMatch[] = []
      try {
        rows = await n.rpc<TrendMatch>('match_trend_chunks_since', { query_embedding: vec, since_ts: since, match_lang: embedLangOf(user.preferred_language), min_similarity: NEW_SIGNAL_MIN_SIMILARITY, match_count: NEW_SIGNAL_MATCH_COUNT })
      } catch (e) { log(`    rpc erro (${theme.slice(0, 30)}): ${e instanceof Error ? e.message : e}`); continue }
      const fresh = rows.filter(r => !alertedTrendIds.has(r.trend_id))
      if (rows.length) log(`    plano "${theme.slice(0, 30)}": ${rows.length} match(es) >=${NEW_SIGNAL_MIN_SIMILARITY}, ${fresh.length} novos; top sim=${rows[0]?.similarity.toFixed(3)}`)
      const top = fresh[0]
      if (top && (!best || top.similarity > best.match.similarity)) best = { plan, match: top }
    }
    if (best) {
      const { index: phIdx, phase } = currentPhase(best.plan.phases)
      const theme = best.plan.theme || best.plan.title || ''
      const email = renderNewSignalEmail({ lang, planTheme: theme, phaseLabel: phase?.label ?? null, ctaUrl: newSignalCta(site, theme, lang), optoutUrl: optoutUrl(site, user.alert_optout_token) })
      return { type: 'new_signal', plan: best.plan, reason: `trend ${best.match.trend_id.slice(0, 8)} (${best.match.category ?? best.match.theme_slug ?? '?'}, ${best.match.period}) sim=${best.match.similarity.toFixed(3)}`, dedupKey: `new_signal:${best.match.trend_id}`, payload: { theme, trend_id: best.match.trend_id, report_id: best.match.report_id, rank: best.match.rank, period: best.match.period, theme_slug: best.match.theme_slug, category: best.match.category, similarity: best.match.similarity, phase_index: phIdx, phase_label: phase?.label ?? null }, email }
    }
  }

  // 2) STALLED_ACTION (so se nao houve new_signal)
  if (user.alert_stalled_action) {
    const stalledPlans = plans.filter(p => daysBetween(p.updated_at, nowMs) >= STALLED_ACTION_DAYS).sort((a, b) => a.updated_at.localeCompare(b.updated_at))
    for (const plan of stalledPlans) {
      const { index: phIdx, phase } = currentPhase(plan.phases)
      const pending = firstPendingAction(phase)
      if (!pending) continue
      if (isStalledEscalated(alerts, user.id, pending.text, nowMs)) { log(`    stalled escalado (30d), pula: "${pending.text.slice(0, 30)}"`); continue }
      const days = daysBetween(plan.updated_at, nowMs)
      const email = renderStalledEmail({ lang, planTitle: plan.title || (lang === 'pt' ? 'seu plano' : 'your plan'), phaseLabel: phase?.label ?? null, actionText: pending.text, daysStalled: days, ctaUrl: stalledCta(site, plan.id), optoutUrl: optoutUrl(site, user.alert_optout_token) })
      return { type: 'stalled_action', plan, reason: `acao "${pending.text.slice(0, 40)}" parada ha ${days}d na fase ${phIdx + 1}`, dedupKey: null, payload: { plan_id: plan.id, phase_index: phIdx, phase_label: phase?.label ?? null, action_index: pending.index, action_text: pending.text, days_stalled: days }, email }
    }
  }
  return null
}

// ── Fluxo principal (usado por CLI e rota) ───────────────────────────────────
export async function runDetection(cfg: AlertConfig, opts: { dryRun: boolean; onLog?: (s: string) => void }): Promise<RunResult> {
  const nowMs = Date.now()
  const n = net(cfg)
  const lines: string[] = []
  const events: EventDecision[] = []
  const stats = { candidates: 0, sent: 0, failed: 0, skipMuted: 0, skipNoOptIn: 0, skipGap: 0, skipNoEvent: 0, usersWithPlans: 0 }
  const log = (s: string) => { lines.push(s); opts.onLog?.(s) }

  log(`TAIME alertas por evento ${opts.dryRun ? '(DRY-RUN)' : '(ENVIO REAL)'}`)
  log(`limiar new_signal=${NEW_SIGNAL_MIN_SIMILARITY} | stalled=${STALLED_ACTION_DAYS}d, re-alerta ${STALLED_REALERT_DAYS}d | gap ${MIN_EMAIL_GAP_DAYS}d`)

  const plans = await n.dbGet<Plan>('advisor_plans?status=eq.active&select=id,user_id,title,theme,phases,created_at,updated_at')
  if (!plans.length) { log('Nenhum plano ativo. Nada a fazer.'); return { dryRun: opts.dryRun, stats, events, lines } }
  const userIds = [...new Set(plans.map(p => p.user_id))]
  stats.usersWithPlans = userIds.length
  const users = await n.dbGet<UserRow>(`users?id=in.(${userIds.join(',')})&select=id,email,preferred_language,alert_new_signal,alert_stalled_action,alerts_muted,alert_optout_token`)
  const userMap = new Map(users.map(u => [u.id, u]))
  const plansByUser = new Map<string, Plan[]>()
  for (const p of plans) { const a = plansByUser.get(p.user_id) ?? []; a.push(p); plansByUser.set(p.user_id, a) }

  const alerts = await n.dbGet<AlertRow>(`advisor_alerts?user_id=in.(${userIds.join(',')})&select=user_id,type,status,sent_at,created_at,dedup_key,payload`)
  const sentCut = nowMs - MIN_EMAIL_GAP_DAYS * DAY_MS
  const sentRecently = new Set(alerts.filter(a => a.status === 'sent' && a.sent_at && new Date(a.sent_at).getTime() >= sentCut).map(a => a.user_id))

  for (const uid of userIds) {
    const user = userMap.get(uid)
    if (!user) continue
    const label = `user ${uid.slice(0, 8)} (${user.email})`
    if (user.alerts_muted) { stats.skipMuted++; continue }
    if (!user.alert_new_signal && !user.alert_stalled_action) { stats.skipNoOptIn++; continue }
    if (sentRecently.has(uid)) { stats.skipGap++; log(`- ${label}: SKIP (recebeu email ha < ${MIN_EMAIL_GAP_DAYS}d)`); continue }

    const cand = await detectForUser(n, cfg.siteUrl, user, plansByUser.get(uid) ?? [], alerts, nowMs, log)
    if (!cand) { stats.skipNoEvent++; log(`- ${label}: sem evento forte`); continue }
    stats.candidates++
    log(`* ${label}: ${cand.type.toUpperCase()} -> ${cand.reason}`)
    const ev: EventDecision = { userId: uid, email: user.email, type: cand.type, planId: cand.plan.id, reason: cand.reason }
    events.push(ev)

    if (opts.dryRun) continue
    try {
      const row = await n.dbInsert<{ id: string }>('advisor_alerts', { user_id: uid, plan_id: cand.plan.id, type: cand.type, payload: cand.payload, status: 'pending', dedup_key: cand.dedupKey })
      const ok = await n.sendEmail(user.email, cand.email.subject, cand.email.html)
      if (ok) { await n.dbPatch('advisor_alerts', `id=eq.${row.id}`, { status: 'sent', sent_at: new Date().toISOString() }); stats.sent++; ev.delivered = true; log(`    email enviado`) }
      else { stats.failed++; log(`    envio falhou (alerta fica pending para retry)`) }
    } catch (e) { stats.failed++; log(`    grava/envia falhou: ${e instanceof Error ? e.message : e}`) }
  }

  log(`Resumo: ${stats.candidates} evento(s), ${opts.dryRun ? '(dry-run, nada enviado)' : `${stats.sent} enviado(s), ${stats.failed} falha(s)`}`)
  log(`Descartados: muted=${stats.skipMuted}, sem opt-in=${stats.skipNoOptIn}, gap 7d=${stats.skipGap}, sem evento=${stats.skipNoEvent}`)
  return { dryRun: opts.dryRun, stats, events, lines }
}

// ── Envio de TESTE (PT+EN, new_signal+stalled) usando um plano real ──────────
export async function sendTestEmails(cfg: AlertConfig, email: string, onLog?: (s: string) => void): Promise<Array<{ tag: string; subject: string; ok: boolean }>> {
  const n = net(cfg)
  const log = (s: string) => onLog?.(s)
  const plans = await n.dbGet<Plan>('advisor_plans?status=eq.active&select=id,user_id,title,theme,phases,created_at,updated_at&limit=1')
  const plan = plans[0]
  const theme = plan?.theme || plan?.title || 'atendimento com IA'
  const { phase } = plan ? currentPhase(plan.phases) : { phase: null as PlanPhase | null }
  const pending = firstPendingAction(phase)
  const token = 'TEST-TOKEN'
  const out: Array<{ tag: string; subject: string; ok: boolean }> = []
  for (const lang of ['pt', 'en'] as AlertLang[]) {
    const ns = renderNewSignalEmail({ lang, planTheme: theme, phaseLabel: phase?.label ?? null, ctaUrl: newSignalCta(cfg.siteUrl, theme, lang), optoutUrl: optoutUrl(cfg.siteUrl, token) })
    const nsOk = await n.sendEmail(email, ns.subject, ns.html)
    out.push({ tag: `new_signal ${lang}`, subject: ns.subject, ok: nsOk }); log(`  [new_signal ${lang}] ${nsOk ? 'enviado' : 'FALHOU'}`)
    const st = renderStalledEmail({ lang, planTitle: plan?.title || 'Plano', phaseLabel: phase?.label ?? null, actionText: pending?.text || (lang === 'pt' ? 'Designar responsável pela iniciativa' : 'Assign an owner for the initiative'), daysStalled: 17, ctaUrl: stalledCta(cfg.siteUrl, plan?.id || '00000000-0000-0000-0000-000000000000'), optoutUrl: optoutUrl(cfg.siteUrl, token) })
    const stOk = await n.sendEmail(email, st.subject, st.html)
    out.push({ tag: `stalled ${lang}`, subject: st.subject, ok: stOk }); log(`  [stalled ${lang}] ${stOk ? 'enviado' : 'FALHOU'}`)
  }
  return out
}
