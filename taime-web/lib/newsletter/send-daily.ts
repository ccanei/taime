// Envio diário da Newsletter Radar TAIME.
//
// Continua servindo o REENVIO MANUAL pontual do briefing do dia (via
// app/api/cron/newsletter-send, gatilho curl com Bearer CRON_SECRET). NÃO é mais
// encadeado ao radar-briefing: o e-mail agendado passou a ser SEMANAL e
// sintetizado por tema (ver lib/newsletter/send-weekly.ts). O briefing diário
// segue rodando e alimentando o dashboard /radar e o acervo.
//
// Lê o briefing do dia e delega envio + histórico ao núcleo compartilhado
// (lib/newsletter/shared.ts). Comportamento de envio idêntico ao anterior.

import { deliverNewsletter, todayUtcDate, type DeliverResult } from './shared'

interface BriefingRow {
  id:            string
  briefing_date: string
  title_pt:      string | null
  title_en:      string | null
  body_pt:       string | null
  body_en:       string | null
}

export type SendDailyResult =
  | { ok: true; skipped: true;  reason: 'no_briefing_today' | 'already_sent' | 'no_active_subscribers'; recipient_count?: number }
  | { ok: true; skipped?: false; sent: number; failed: number; recipient_count: number; status: 'sent' | 'partial' | 'failed' }
  | { ok: false; error: string }

export async function sendDailyNewsletter(): Promise<SendDailyResult> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: 'Missing Supabase env vars' }
  }

  const headersGet = {
    apikey:        serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  }

  try {
    const briefingDate = todayUtcDate()

    // ── Briefing do dia ──────────────────────────────────────────────────────
    const brRes = await fetch(
      `${supabaseUrl}/rest/v1/radar_briefings` +
        `?briefing_date=eq.${briefingDate}` +
        `&select=id,briefing_date,title_pt,title_en,body_pt,body_en&limit=1`,
      { headers: headersGet },
    )
    if (!brRes.ok) {
      const t = await brRes.text()
      throw new Error(`briefing fetch: ${brRes.status}: ${t}`)
    }
    const briefingRows = await brRes.json() as BriefingRow[]
    const briefing = briefingRows[0]
    if (!briefing) {
      return { ok: true, skipped: true, reason: 'no_briefing_today' }
    }

    // ── Entrega + histórico (idempotência por briefing_date) ─────────────────
    const result: DeliverResult = await deliverNewsletter(
      {
        title_pt: briefing.title_pt ?? '',
        title_en: briefing.title_en ?? (briefing.title_pt ?? ''),
        body_pt:  briefing.body_pt  ?? '',
        body_en:  briefing.body_en  ?? (briefing.body_pt ?? ''),
      },
      { briefingDate: briefing.briefing_date, briefingId: briefing.id },
    )
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('sendDailyNewsletter error:', msg)
    return { ok: false, error: msg }
  }
}
