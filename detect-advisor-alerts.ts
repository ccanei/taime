#!/usr/bin/env npx ts-node
/*
 * ============================================================================
 * detect-advisor-alerts.ts  -  Fase 3.1: alertas por EVENTO do Advisor (CLI)
 * ============================================================================
 * CLI fino sobre o NUCLEO COMPARTILHADO taime-web/lib/advisor-alerts-core.ts. A
 * mesma logica (limiar, anti-ruido, escalonamento) roda aqui (dry-run manual) e na
 * rota de cron /api/cron/advisor-alerts. Nao ha duplicacao de regras.
 *
 * MODOS:
 *   (default)            detecta, grava advisor_alerts e ENVIA os emails.
 *   --dry-run            lista o que SERIA enviado, para quem e por que; nao grava.
 *   --send-test <email>  envia emails de TESTE (new_signal + stalled, PT e EN).
 *   --self-test          valida a logica pura (gates, escalonamento, prioridade).
 *
 * Rodavel por cron manual (crontab/CI):
 *   npx ts-node detect-advisor-alerts.ts --dry-run
 *
 * Env (.env.local): SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, RESEND_API_KEY,
 * SITE_URL (opcional).
 * ============================================================================
 */
import dotenv from 'dotenv'
import {
  runDetection, sendTestEmails, type AlertConfig,
  currentPhase, firstPendingAction, isStalledEscalated, sinceForNewSignal, daysBetween,
  type PlanPhase, type AlertRow, type Plan,
} from './taime-web/lib/advisor-alerts-core'
dotenv.config({ path: '.env.local' })

const DAY_MS = 86400000

function cfg(): AlertConfig {
  return {
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    serviceKey:  process.env.SUPABASE_SERVICE_KEY ?? '',
    openaiKey:   process.env.OPENAI_API_KEY ?? '',
    resendKey:   process.env.RESEND_API_KEY ?? '',
    siteUrl:     (process.env.SITE_URL ?? 'https://www.taime.tech').replace(/\/$/, ''),
  }
}

// ── --self-test (logica pura, sem rede) ──────────────────────────────────────
function selfTest() {
  let pass = 0, fail = 0
  const chk = (n: string, ok: boolean) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}`); ok ? pass++ : fail++ }
  const now = Date.now()
  const ph = (label: string, acts: Array<[string, string]>): PlanPhase => ({ label, actions: acts.map(([text, status]) => ({ text, status })), avoid: [], exitCriteria: '' })
  const phases = [ph('F1', [['a', 'done'], ['b', 'done']]), ph('F2', [['c', 'todo'], ['d', 'todo']]), ph('F3', [['e', 'todo']])]
  chk('currentPhase pula fase concluida', currentPhase(phases).index === 1)
  chk('firstPendingAction pega a 1a pendente', firstPendingAction(currentPhase(phases).phase)?.text === 'c')
  chk('tudo concluido -> ultima fase', currentPhase([ph('X', [['a', 'done']])]).index === 0)
  const iso = (d: number) => new Date(now - d * DAY_MS).toISOString()
  const al: AlertRow[] = [{ user_id: 'u', type: 'stalled_action', status: 'sent', sent_at: iso(10), created_at: iso(10), dedup_key: null, payload: { action_text: 'c' } }]
  chk('escalonado: enviado ha 10d bloqueia (< 30d)', isStalledEscalated(al, 'u', 'c', now) === true)
  chk('nao escalonado: enviado ha 40d libera', isStalledEscalated([{ ...al[0], sent_at: iso(40), created_at: iso(40) }], 'u', 'c', now) === false)
  chk('pending bloqueia re-criacao', isStalledEscalated([{ user_id: 'u', type: 'stalled_action', status: 'pending', sent_at: null, created_at: iso(1), dedup_key: null, payload: { action_text: 'c' } }], 'u', 'c', now) === true)
  chk('acao diferente nao bloqueia', isStalledEscalated(al, 'u', 'd', now) === false)
  const plan: Plan = { id: 'p', user_id: 'u', title: 't', theme: 'x', phases, created_at: iso(100), updated_at: iso(1) }
  chk('since = criacao do plano quando nunca alertou', sinceForNewSignal(plan, null) === iso(100))
  chk('since = ultimo alerta quando mais recente', sinceForNewSignal(plan, iso(20)) === iso(20))
  chk('daysBetween conta dias parados', daysBetween(iso(15), now) === 15)
  console.log(`\n${fail === 0 ? 'SELF-TEST OK' : 'SELF-TEST FALHOU'}: ${pass} ok, ${fail} fail`)
  if (fail > 0) process.exit(1)
}

async function main() {
  const argv = process.argv
  if (argv.includes('--self-test')) { selfTest(); return }
  const ti = argv.indexOf('--send-test')
  if (ti >= 0) {
    const to = argv[ti + 1]
    if (!to) { console.error('uso: --send-test <email>'); process.exit(1) }
    console.log(`\nEnvio de TESTE para ${to} (PT e EN, new_signal + stalled)`)
    await sendTestEmails(cfg(), to, s => console.log(s))
    return
  }
  console.log('')
  await runDetection(cfg(), { dryRun: argv.includes('--dry-run'), onLog: s => console.log(s) })
}
main().catch(e => { console.error(e); process.exit(1) })
