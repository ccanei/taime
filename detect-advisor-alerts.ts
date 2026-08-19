#!/usr/bin/env npx ts-node
/*
 * ============================================================================
 * detect-advisor-alerts.ts  -  Fase 3.1: alertas por EVENTO do Advisor
 * ============================================================================
 * O produto volta ao cliente quando algo REALMENTE muda no que ele acompanha.
 * NAO e newsletter nem lembrete recorrente: cada email precisa justificar a
 * propria abertura. Dois eventos:
 *   new_signal     -> saiu uma analise (trend publicada e indexada) semanticamente
 *                     proxima ao TEMA de um plano ativo, via embeddings.
 *   stalled_action -> acao pendente na fase atual parada ha N dias.
 *
 * Anti-ruido (critico): no maximo 1 email por usuario a cada 7 dias, new_signal
 * tem prioridade sobre stalled_action, nunca repete o mesmo evento, e se nao
 * houver evento forte NAO envia nada. Idempotente: rodar duas vezes nao duplica.
 *
 * MODOS:
 *   (default)            detecta, grava advisor_alerts e ENVIA os emails.
 *   --dry-run            lista o que SERIA enviado, para quem e por que; nao grava.
 *   --send-test <email>  envia emails de TESTE reais (new_signal + stalled, PT e EN)
 *                        para <email>, usando um plano real; ignora os gates.
 *   --self-test          valida a logica pura (gates, escalonamento, prioridade)
 *                        com fixtures, sem rede.
 *
 * Rodavel por cron (ex: crontab / CI), como os demais scripts do pipeline:
 *   npx ts-node detect-advisor-alerts.ts --dry-run
 *
 * Env (.env.local, nunca hardcoded): SUPABASE_URL, SUPABASE_SERVICE_KEY,
 * OPENAI_API_KEY (embeddings), RESEND_API_KEY (envio), SITE_URL (opcional).
 * ============================================================================
 */
import dotenv from 'dotenv'
import { renderNewSignalEmail, renderStalledEmail, type AlertLang } from './advisor-alert-email'
dotenv.config({ path: '.env.local' })

// ── Constantes de politica (ponto UNICO de verdade, documentado) ─────────────
export const STALLED_ACTION_DAYS = 14         // N: acao pendente parada ha N dias vira candidata
export const STALLED_REALERT_DAYS = 30        // escalonamento: apos um lembrete, so 30 dias depois de novo
export const MIN_EMAIL_GAP_DAYS = 7           // anti-ruido: no maximo 1 email por usuario a cada 7 dias
// Limiar de similaridade cosine (text-embedding-3-small) para o new_signal. Conservador
// de proposito: o TEMA do plano e uma frase curta e a trend e um paragrafo, entao a
// similaridade roda baixa; melhor NAO alertar do que alertar por casamento fraco. O
// dry-run imprime a distribuicao das similaridades para calibragem informada.
export const NEW_SIGNAL_MIN_SIMILARITY = 0.42
export const NEW_SIGNAL_MATCH_COUNT = 20

const DAY_MS = 24 * 60 * 60 * 1000
const SITE = (process.env.SITE_URL ?? 'https://www.taime.tech').replace(/\/$/, '')
const FROM = 'TAIME | John <johnb@taime.tech>'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface PlanAction { text: string; status: string }
interface PlanPhase { label: string; actions: PlanAction[]; avoid: string[]; exitCriteria: string }
interface Plan { id: string; user_id: string; title: string | null; theme: string | null; phases: PlanPhase[]; created_at: string; updated_at: string }
interface UserRow { id: string; email: string; preferred_language: string; alert_new_signal: boolean; alert_stalled_action: boolean; alerts_muted: boolean; alert_optout_token: string }
interface AlertRow { user_id: string; type: string; status: string; sent_at: string | null; created_at: string; dedup_key: string | null; payload: Record<string, unknown> }
interface TrendMatch { trend_id: string; report_id: string; period: string; rank: number; theme_slug: string | null; category: string | null; similarity: number; indexed_at: string }

// ── Helpers PUROS (testaveis, sem rede) ──────────────────────────────────────

// Fase atual = a primeira com alguma acao pendente; se tudo feito, a ultima.
export function currentPhase(phases: PlanPhase[]): { index: number; phase: PlanPhase | null } {
  if (!phases.length) return { index: 0, phase: null }
  let i = phases.findIndex(p => (p.actions ?? []).some(a => a.status !== 'done'))
  if (i === -1) i = phases.length - 1
  return { index: i, phase: phases[i] }
}

// Primeira acao pendente da fase (a que "esta parada").
export function firstPendingAction(phase: PlanPhase | null): { index: number; text: string } | null {
  if (!phase) return null
  const i = (phase.actions ?? []).findIndex(a => a.status !== 'done')
  return i === -1 ? null : { index: i, text: phase.actions[i].text }
}

// Escalonamento: ja houve alerta ENVIADO desta mesma acao dentro da janela de re-alerta?
export function isStalledEscalated(alerts: AlertRow[], userId: string, actionText: string, now: number): boolean {
  const cut = now - STALLED_REALERT_DAYS * DAY_MS
  return alerts.some(a =>
    a.user_id === userId && a.type === 'stalled_action' &&
    (a.payload?.action_text as string) === actionText &&
    ((a.status === 'sent' && a.sent_at && new Date(a.sent_at).getTime() >= cut) ||
     (a.status === 'pending')))   // pending tambem bloqueia (evita duplicar antes do envio)
}

// Ponto de partida da janela de new_signal: o maior entre a criacao do plano e o
// ultimo new_signal do usuario (so olhamos trends indexadas DEPOIS disso).
export function sinceForNewSignal(plan: Plan, lastNewSignalCreatedAt: string | null): string {
  const planT = new Date(plan.created_at).getTime()
  const lastT = lastNewSignalCreatedAt ? new Date(lastNewSignalCreatedAt).getTime() : 0
  return new Date(Math.max(planT, lastT)).toISOString()
}

export function daysBetween(aIso: string, nowMs: number): number {
  return Math.floor((nowMs - new Date(aIso).getTime()) / DAY_MS)
}

export function langOf(preferred: string): AlertLang { return preferred === 'en' ? 'en' : 'pt' }
export function embedLangOf(preferred: string): 'pt' | 'en' { return preferred === 'en' ? 'en' : 'pt' }

// ── Rede: Supabase REST + OpenAI + Resend (raw fetch, padrao do pipeline) ─────
const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
function headers(represent = false) {
  return { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: represent ? 'return=representation' : 'return=minimal' }
}
async function dbGet<T>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: headers() })
  if (!r.ok) throw new Error(`DB GET /${path.slice(0, 60)}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json() as Promise<T[]>
}
async function dbInsert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPA}/rest/v1/${table}`, { method: 'POST', headers: headers(true), body: JSON.stringify(row) })
  if (!r.ok) throw new Error(`DB INSERT ${table}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return (await r.json())[0] as T
}
async function dbPatch(table: string, filter: string, patch: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SUPA}/rest/v1/${table}?${filter}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) })
  if (!r.ok) throw new Error(`DB PATCH ${table}: ${r.status} ${(await r.text()).slice(0, 200)}`)
}
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) })
  if (!r.ok) throw new Error(`RPC ${fn}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json() as Promise<T[]>
}
async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY missing')
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
    })
    if (!r.ok) { console.error('[embed] falhou', r.status); return null }
    const j = await r.json() as { data?: Array<{ embedding: number[] }> }
    return j.data?.[0]?.embedding ?? null
  } catch (e) { console.error('[embed] excecao', e instanceof Error ? e.message : e); return null }
}
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) { console.error('[email] RESEND_API_KEY missing'); return false }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, reply_to: 'johnb@taime.tech', to: [to], subject, html }),
    })
    if (!r.ok) { console.error('[email] resend falhou', r.status, (await r.text()).slice(0, 160)); return false }
    return true
  } catch (e) { console.error('[email] excecao', e instanceof Error ? e.message : e); return false }
}

function optoutUrl(token: string): string { return `${SITE}/api/alerts/unsubscribe?token=${encodeURIComponent(token)}` }
function newSignalCta(planTheme: string, lang: AlertLang): string {
  const q = lang === 'pt'
    ? `O que a análise mais recente sobre ${planTheme} muda para o meu plano?`
    : `What does the most recent analysis on ${planTheme} change for my plan?`
  return `${SITE}/dashboard/advisor?ask=${encodeURIComponent(q)}`
}
function stalledCta(planId: string): string { return `${SITE}/dashboard/advisor/plans?id=${planId}` }

// ── Candidato de evento por usuario ──────────────────────────────────────────
interface Candidate {
  type: 'new_signal' | 'stalled_action'
  plan: Plan
  reason: string
  dedupKey: string | null
  payload: Record<string, unknown>
  email: { subject: string; html: string }
}

// ── Deteccao (com rede) ──────────────────────────────────────────────────────
async function detectForUser(user: UserRow, plans: Plan[], alerts: AlertRow[], nowMs: number, log: (s: string) => void): Promise<Candidate | null> {
  const lang = langOf(user.preferred_language)
  const userAlerts = alerts.filter(a => a.user_id === user.id)
  const alertedTrendIds = new Set(userAlerts.filter(a => a.type === 'new_signal' && a.dedup_key).map(a => a.dedup_key!.replace('new_signal:', '')))
  const lastNewSignal = userAlerts.filter(a => a.type === 'new_signal').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.created_at ?? null

  // 1) NEW_SIGNAL (prioridade). So se o usuario optou.
  if (user.alert_new_signal) {
    let best: { plan: Plan; match: TrendMatch } | null = null
    for (const plan of plans) {
      const theme = (plan.theme || plan.title || '').trim()
      if (!theme) continue
      const vec = await embed(theme)
      if (!vec) continue
      const since = sinceForNewSignal(plan, lastNewSignal)
      let rows: TrendMatch[] = []
      try {
        rows = await rpc<TrendMatch>('match_trend_chunks_since', {
          query_embedding: vec, since_ts: since, match_lang: embedLangOf(user.preferred_language),
          min_similarity: NEW_SIGNAL_MIN_SIMILARITY, match_count: NEW_SIGNAL_MATCH_COUNT,
        })
      } catch (e) { log(`    rpc erro (${theme.slice(0, 30)}): ${e instanceof Error ? e.message : e}`); continue }
      const fresh = rows.filter(r => !alertedTrendIds.has(r.trend_id))
      if (rows.length) log(`    plano "${theme.slice(0, 30)}": ${rows.length} match(es) >=${NEW_SIGNAL_MIN_SIMILARITY}, ${fresh.length} novos; top sim=${rows[0]?.similarity.toFixed(3)}`)
      const top = fresh[0]
      if (top && (!best || top.similarity > best.match.similarity)) best = { plan, match: top }
    }
    if (best) {
      const { index: phIdx, phase } = currentPhase(best.plan.phases)
      const theme = best.plan.theme || best.plan.title || ''
      const email = renderNewSignalEmail({ lang, planTheme: theme, phaseLabel: phase?.label ?? null, ctaUrl: newSignalCta(theme, lang), optoutUrl: optoutUrl(user.alert_optout_token) })
      return {
        type: 'new_signal', plan: best.plan,
        reason: `trend ${best.match.trend_id.slice(0, 8)} (${best.match.category ?? best.match.theme_slug ?? '?'}, ${best.match.period}) sim=${best.match.similarity.toFixed(3)}`,
        dedupKey: `new_signal:${best.match.trend_id}`,
        payload: { theme, trend_id: best.match.trend_id, report_id: best.match.report_id, rank: best.match.rank, period: best.match.period, theme_slug: best.match.theme_slug, category: best.match.category, similarity: best.match.similarity, phase_index: phIdx, phase_label: phase?.label ?? null },
        email,
      }
    }
  }

  // 2) STALLED_ACTION (so se nao houve new_signal e o usuario optou).
  if (user.alert_stalled_action) {
    const stalledPlans = plans
      .filter(p => daysBetween(p.updated_at, nowMs) >= STALLED_ACTION_DAYS)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))   // o mais parado primeiro
    for (const plan of stalledPlans) {
      const { index: phIdx, phase } = currentPhase(plan.phases)
      const pending = firstPendingAction(phase)
      if (!pending) continue
      if (isStalledEscalated(alerts, user.id, pending.text, nowMs)) { log(`    stalled escalado (30d), pula: "${pending.text.slice(0, 30)}"`); continue }
      const days = daysBetween(plan.updated_at, nowMs)
      const email = renderStalledEmail({ lang, planTitle: plan.title || (lang === 'pt' ? 'seu plano' : 'your plan'), phaseLabel: phase?.label ?? null, actionText: pending.text, daysStalled: days, ctaUrl: stalledCta(plan.id), optoutUrl: optoutUrl(user.alert_optout_token) })
      return {
        type: 'stalled_action', plan,
        reason: `acao "${pending.text.slice(0, 40)}" parada ha ${days}d na fase ${phIdx + 1}`,
        dedupKey: null,
        payload: { plan_id: plan.id, phase_index: phIdx, phase_label: phase?.label ?? null, action_index: pending.index, action_text: pending.text, days_stalled: days },
        email,
      }
    }
  }
  return null
}

// ── Fluxo principal ──────────────────────────────────────────────────────────
async function run(dryRun: boolean) {
  const nowMs = Date.now()
  console.log(`\nTAIME alertas por evento ${dryRun ? '(DRY-RUN)' : '(ENVIO REAL)'}`)
  console.log(`limiar new_signal=${NEW_SIGNAL_MIN_SIMILARITY} | stalled=${STALLED_ACTION_DAYS}d, re-alerta ${STALLED_REALERT_DAYS}d | gap ${MIN_EMAIL_GAP_DAYS}d\n`)

  const plans = await dbGet<Plan>('advisor_plans?status=eq.active&select=id,user_id,title,theme,phases,created_at,updated_at')
  if (!plans.length) { console.log('Nenhum plano ativo. Nada a fazer.'); return }
  const userIds = [...new Set(plans.map(p => p.user_id))]
  const users = await dbGet<UserRow>(`users?id=in.(${userIds.join(',')})&select=id,email,preferred_language,alert_new_signal,alert_stalled_action,alerts_muted,alert_optout_token`)
  const userMap = new Map(users.map(u => [u.id, u]))
  const plansByUser = new Map<string, Plan[]>()
  for (const p of plans) { const a = plansByUser.get(p.user_id) ?? []; a.push(p); plansByUser.set(p.user_id, a) }

  const alerts = await dbGet<AlertRow>(`advisor_alerts?user_id=in.(${userIds.join(',')})&select=user_id,type,status,sent_at,created_at,dedup_key,payload`)
  const sentCut = nowMs - MIN_EMAIL_GAP_DAYS * DAY_MS
  const sentRecently = new Set(alerts.filter(a => a.status === 'sent' && a.sent_at && new Date(a.sent_at).getTime() >= sentCut).map(a => a.user_id))

  const stats = { candidates: 0, sent: 0, skipMuted: 0, skipNoOptIn: 0, skipGap: 0, skipNoEvent: 0, failed: 0 }

  for (const uid of userIds) {
    const user = userMap.get(uid)
    if (!user) continue
    const label = `user ${uid.slice(0, 8)} (${user.email})`
    if (user.alerts_muted) { stats.skipMuted++; continue }
    if (!user.alert_new_signal && !user.alert_stalled_action) { stats.skipNoOptIn++; continue }
    if (sentRecently.has(uid)) { stats.skipGap++; console.log(`- ${label}: SKIP (recebeu email ha < ${MIN_EMAIL_GAP_DAYS}d)`); continue }

    const cand = await detectForUser(user, plansByUser.get(uid) ?? [], alerts, nowMs, s => console.log(s))
    if (!cand) { stats.skipNoEvent++; console.log(`- ${label}: sem evento forte`); continue }
    stats.candidates++
    console.log(`* ${label}: ${cand.type.toUpperCase()} -> ${cand.reason}`)

    if (dryRun) continue

    // Grava (pending) e envia. Idempotencia: dedup_key unico no new_signal.
    try {
      const row = await dbInsert<{ id: string }>('advisor_alerts', {
        user_id: uid, plan_id: cand.plan.id, type: cand.type, payload: cand.payload, status: 'pending', dedup_key: cand.dedupKey,
      })
      const ok = await sendEmail(user.email, cand.email.subject, cand.email.html)
      if (ok) { await dbPatch('advisor_alerts', `id=eq.${row.id}`, { status: 'sent', sent_at: new Date().toISOString() }); stats.sent++; console.log(`    email enviado`) }
      else { stats.failed++; console.log(`    envio falhou (alerta fica pending para retry)`) }
    } catch (e) {
      // dedup unico pode barrar corrida: nao e erro fatal.
      stats.failed++
      console.log(`    grava/envia falhou: ${e instanceof Error ? e.message : e}`)
    }
  }

  console.log(`\nResumo: ${stats.candidates} evento(s), ${dryRun ? '(dry-run, nada enviado)' : `${stats.sent} enviado(s), ${stats.failed} falha(s)`}`)
  console.log(`Descartados: muted=${stats.skipMuted}, sem opt-in=${stats.skipNoOptIn}, gap 7d=${stats.skipGap}, sem evento=${stats.skipNoEvent}`)
}

// ── --send-test <email> ──────────────────────────────────────────────────────
async function sendTest(email: string) {
  console.log(`\nEnvio de TESTE para ${email} (PT e EN, new_signal + stalled)`)
  const plans = await dbGet<Plan>('advisor_plans?status=eq.active&select=id,user_id,title,theme,phases,created_at,updated_at&limit=1')
  const plan = plans[0]
  const theme = plan?.theme || plan?.title || 'atendimento com IA'
  const { phase } = plan ? currentPhase(plan.phases) : { phase: null as PlanPhase | null }
  const pending = firstPendingAction(phase)
  const token = 'TEST-TOKEN'
  const emails: Array<{ subject: string; html: string; tag: string }> = []
  for (const lang of ['pt', 'en'] as AlertLang[]) {
    const ns = renderNewSignalEmail({ lang, planTheme: theme, phaseLabel: phase?.label ?? null, ctaUrl: newSignalCta(theme, lang), optoutUrl: optoutUrl(token) })
    emails.push({ ...ns, tag: `new_signal ${lang}` })
    const st = renderStalledEmail({ lang, planTitle: plan?.title || 'Plano', phaseLabel: phase?.label ?? null, actionText: pending?.text || (lang === 'pt' ? 'Designar responsável pela iniciativa' : 'Assign an owner for the initiative'), daysStalled: 17, ctaUrl: stalledCta(plan?.id || '00000000-0000-0000-0000-000000000000'), optoutUrl: optoutUrl(token) })
    emails.push({ ...st, tag: `stalled ${lang}` })
  }
  for (const e of emails) {
    const ok = await sendEmail(email, e.subject, e.html)
    console.log(`  [${e.tag}] "${e.subject}" -> ${ok ? 'enviado' : 'FALHOU'}`)
  }
}

// ── --self-test (logica pura, sem rede) ──────────────────────────────────────
function selfTest() {
  let pass = 0, fail = 0
  const chk = (n: string, ok: boolean) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}`); ok ? pass++ : fail++ }
  const now = Date.now()
  const ph = (label: string, acts: Array<[string, string]>): PlanPhase => ({ label, actions: acts.map(([text, status]) => ({ text, status })), avoid: [], exitCriteria: '' })

  // currentPhase: primeira com pendente
  const phases = [ph('F1', [['a', 'done'], ['b', 'done']]), ph('F2', [['c', 'todo'], ['d', 'todo']]), ph('F3', [['e', 'todo']])]
  chk('currentPhase pula fase concluida', currentPhase(phases).index === 1)
  chk('firstPendingAction pega a 1a pendente', firstPendingAction(currentPhase(phases).phase)?.text === 'c')
  chk('tudo concluido -> ultima fase', currentPhase([ph('X', [['a', 'done']])]).index === 0)

  // escalonamento
  const iso = (d: number) => new Date(now - d * DAY_MS).toISOString()
  const al: AlertRow[] = [{ user_id: 'u', type: 'stalled_action', status: 'sent', sent_at: iso(10), created_at: iso(10), dedup_key: null, payload: { action_text: 'c' } }]
  chk('escalonado: enviado ha 10d bloqueia (< 30d)', isStalledEscalated(al, 'u', 'c', now) === true)
  chk('nao escalonado: enviado ha 40d libera', isStalledEscalated([{ ...al[0], sent_at: iso(40), created_at: iso(40) }], 'u', 'c', now) === false)
  chk('pending bloqueia re-criacao', isStalledEscalated([{ user_id: 'u', type: 'stalled_action', status: 'pending', sent_at: null, created_at: iso(1), dedup_key: null, payload: { action_text: 'c' } }], 'u', 'c', now) === true)
  chk('acao diferente nao bloqueia', isStalledEscalated(al, 'u', 'd', now) === false)

  // sinceForNewSignal: maior entre criacao do plano e ultimo alerta
  const plan: Plan = { id: 'p', user_id: 'u', title: 't', theme: 'x', phases, created_at: iso(100), updated_at: iso(1) }
  chk('since = criacao do plano quando nunca alertou', sinceForNewSignal(plan, null) === iso(100))
  chk('since = ultimo alerta quando mais recente', sinceForNewSignal(plan, iso(20)) === iso(20))

  // stalled proxy por updated_at
  chk('daysBetween conta dias parados', daysBetween(iso(15), now) === 15)

  console.log(`\n${fail === 0 ? 'SELF-TEST OK' : 'SELF-TEST FALHOU'}: ${pass} ok, ${fail} fail`)
  if (fail > 0) process.exit(1)
}

// ── Entrypoint ───────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv
  if (argv.includes('--self-test')) { selfTest(); return }
  const ti = argv.indexOf('--send-test')
  if (ti >= 0) { const to = argv[ti + 1]; if (!to) { console.error('uso: --send-test <email>'); process.exit(1) } await sendTest(to); return }
  await run(argv.includes('--dry-run'))
}
main().catch(e => { console.error(e); process.exit(1) })
