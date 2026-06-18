import { NextResponse } from 'next/server'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface BriefingRow {
  id:            string
  briefing_date: string
  title_pt:      string | null
  title_en:      string | null
  body_pt:       string | null
  body_en:       string | null
}

interface SubscriberRow {
  id:                 string
  email:              string
  locale:             string | null
  unsubscribe_token:  string | null
}

interface SendInsertRow {
  id: string
}

interface ResendSendResult {
  email:      string
  ok:         boolean
  resend_id?: string | null
  error?:     string | null
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const SITE_URL = 'https://www.taime.tech'
const FROM     = 'TAIME Radar <noreply@taime.tech>'

// Tamanho máximo aceito pelo endpoint de batch do Resend.
const RESEND_BATCH_SIZE = 100

// ─── Helpers ───────────────────────────────────────────────────────────────────

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Quebra o corpo em parágrafos para virar HTML; aceita \n duplo ou simples.
function paragraphs(body: string): string[] {
  return body
    .split(/\n{2,}|\n/g)
    .map(p => p.trim())
    .filter(Boolean)
}

function isPt(locale: string | null): boolean {
  // Default pt-BR. Só vira EN se a coluna locale tiver 'en' explícito.
  return locale !== 'en'
}

function buildEmailHtml(args: {
  title:           string
  bodyParagraphs:  string[]
  unsubscribeUrl:  string
  isPtLocale:      boolean
}): string {
  const { title, bodyParagraphs, unsubscribeUrl, isPtLocale } = args

  const bodyHtml = bodyParagraphs.map(p =>
    `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;
      color:rgba(255,255,255,0.78);font-family:Georgia,serif;">${escapeHtml(p)}</p>`,
  ).join('')

  const radarLinkLabel = isPtLocale
    ? 'Abrir o Radar TAIME'
    : 'Open the TAIME Radar'

  const footerNote = isPtLocale
    ? 'Você está recebendo este e-mail porque assinou o Radar TAIME. Cancele a qualquer momento abaixo.'
    : 'You are receiving this email because you subscribed to the TAIME Radar. Unsubscribe at any time below.'

  const unsubscribeLabel = isPtLocale
    ? 'Cancelar inscrição'
    : 'Unsubscribe'

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#0F172A;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%"
    style="background-color:#0F172A;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="600"
          style="background-color:#0F172A;max-width:600px;">
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <span style="font-size:22px;font-weight:bold;
                color:#ffffff;letter-spacing:4px;
                font-family:Georgia,serif;">TAIME</span>
              <span style="font-size:12px;letter-spacing:2px;
                color:rgba(255,255,255,0.5);font-family:Georgia,serif;
                margin-left:10px;">RADAR</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 16px 40px;">
              <h1 style="margin:0;font-size:22px;color:#ffffff;
                font-family:Georgia,serif;font-weight:bold;line-height:1.35;">
                ${escapeHtml(title)}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 24px 40px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 40px 40px;">
              <a href="${SITE_URL}/radar"
                style="display:inline-block;background-color:#2563EB;
                color:#ffffff;padding:12px 22px;border-radius:8px;
                text-decoration:none;font-weight:bold;
                font-family:Georgia,serif;font-size:14px;
                letter-spacing:0.5px;">
                ${radarLinkLabel}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 40px 40px;
              border-top:1px solid rgba(255,255,255,0.1);">
              <p style="margin:0 0 10px 0;font-size:12px;
                color:rgba(255,255,255,0.45);font-family:Georgia,serif;
                line-height:1.6;">
                ${footerNote}
              </p>
              <p style="margin:0 0 10px 0;font-size:12px;
                color:rgba(255,255,255,0.6);font-family:Georgia,serif;">
                <a href="${unsubscribeUrl}"
                  style="color:rgba(255,255,255,0.7);text-decoration:underline;">
                  ${unsubscribeLabel}
                </a>
              </p>
              <p style="margin:0;font-size:11px;
                color:rgba(255,255,255,0.35);font-family:Georgia,serif;">
                TAIME &middot; Strategic Technology Intelligence<br/>
                contact@taime.tech &middot; taime.tech
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Envia um lote ao endpoint /emails/batch do Resend. Retorna 1 entrada por
// destinatário com sucesso/falha. Em falha total do batch, todos viram error.
async function sendBatch(args: {
  apiKey:    string
  payloads:  Array<{ to: string; subject: string; html: string }>
}): Promise<ResendSendResult[]> {
  const { apiKey, payloads } = args
  if (payloads.length === 0) return []

  try {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        payloads.map(p => ({
          from:    FROM,
          to:      [p.to],
          subject: p.subject,
          html:    p.html,
        })),
      ),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Resend batch non-ok:', res.status, errText)
      return payloads.map(p => ({
        email: p.to,
        ok:    false,
        error: `resend_status_${res.status}`,
      }))
    }

    const json = await res.json() as { data?: Array<{ id?: string }> } | Array<{ id?: string }>
    const items = Array.isArray(json) ? json : (json.data ?? [])
    return payloads.map((p, i) => ({
      email:     p.to,
      ok:        true,
      resend_id: items[i]?.id ?? null,
    }))
  } catch (e) {
    console.error('Resend batch threw:', e)
    return payloads.map(p => ({
      email: p.to,
      ok:    false,
      error: e instanceof Error ? e.message : String(e),
    }))
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''
  const resendKey   = process.env.RESEND_API_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { success: false, error: 'Missing Supabase env vars' },
      { status: 500 },
    )
  }
  if (!resendKey) {
    return NextResponse.json(
      { success: false, error: 'Missing RESEND_API_KEY' },
      { status: 500 },
    )
  }

  const headersGet = {
    apikey:        serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  }
  const headersWrite = {
    apikey:         serviceKey,
    Authorization:  `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    const briefingDate = todayUtcDate()

    // ── 1. Briefing do dia ───────────────────────────────────────────────────
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
      return NextResponse.json({
        success: true,
        skipped: true,
        reason:  'no_briefing_today',
      })
    }

    // ── 2. Já houve envio hoje? ─────────────────────────────────────────────
    const dupRes = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_sends` +
        `?briefing_date=eq.${briefingDate}` +
        `&status=in.(sent,partial)` +
        `&select=id&limit=1`,
      { headers: headersGet },
    )
    if (dupRes.ok) {
      const dup = await dupRes.json() as Array<{ id: string }>
      if (dup.length > 0) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason:  'already_sent',
        })
      }
    }

    // ── 3. Destinatários ativos ──────────────────────────────────────────────
    const subsRes = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_subscribers` +
        `?status=eq.active` +
        `&select=id,email,locale,unsubscribe_token`,
      { headers: headersGet },
    )
    if (!subsRes.ok) {
      const t = await subsRes.text()
      throw new Error(`subscribers fetch: ${subsRes.status}: ${t}`)
    }
    const subscribers = (await subsRes.json() as SubscriberRow[])
      .filter(s => !!s.email && !!s.unsubscribe_token)

    // Snapshot do conteúdo (mesmo se 0 ativos: preserva o que SERIA enviado).
    const subjectPt = briefing.title_pt ?? ''
    const subjectEn = briefing.title_en ?? subjectPt
    const bodyPt    = briefing.body_pt  ?? ''
    const bodyEn    = briefing.body_en  ?? bodyPt

    if (subscribers.length === 0) {
      const skipInsert = await fetch(
        `${supabaseUrl}/rest/v1/newsletter_sends`,
        {
          method: 'POST',
          headers: { ...headersWrite, Prefer: 'return=minimal' },
          body: JSON.stringify({
            briefing_id:     briefing.id,
            briefing_date:   briefing.briefing_date,
            subject_pt:      subjectPt,
            subject_en:      subjectEn,
            body_pt:         bodyPt,
            body_en:         bodyEn,
            recipient_count: 0,
            sent_count:      0,
            failed_count:    0,
            status:          'skipped',
          }),
        },
      )
      if (!skipInsert.ok) {
        const t = await skipInsert.text()
        console.error('newsletter_sends skipped insert:', skipInsert.status, t)
      }
      return NextResponse.json({
        success:         true,
        skipped:         true,
        reason:          'no_active_subscribers',
        recipient_count: 0,
      })
    }

    // ── 4. Monta payloads (1 por destinatário, com link de unsub único) ─────
    const payloads = subscribers.map(s => {
      const pt          = isPt(s.locale)
      const subject     = pt ? subjectPt : subjectEn
      const titleHtml   = pt ? (briefing.title_pt ?? subjectPt) : (briefing.title_en ?? subjectEn)
      const bodyText    = pt ? bodyPt : bodyEn
      const unsubUrl    = `${SITE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(s.unsubscribe_token ?? '')}`
      const html = buildEmailHtml({
        title:          titleHtml,
        bodyParagraphs: paragraphs(bodyText),
        unsubscribeUrl: unsubUrl,
        isPtLocale:     pt,
      })
      return { subscriber: s, to: s.email, subject, html }
    })

    // ── 5. Envia em lotes via Resend batch ──────────────────────────────────
    const results: ResendSendResult[] = []
    for (let i = 0; i < payloads.length; i += RESEND_BATCH_SIZE) {
      const slice = payloads.slice(i, i + RESEND_BATCH_SIZE)
      const batchResults = await sendBatch({
        apiKey:   resendKey,
        payloads: slice.map(p => ({ to: p.to, subject: p.subject, html: p.html })),
      })
      results.push(...batchResults)
    }

    const sentCount     = results.filter(r => r.ok).length
    const failedCount   = results.length - sentCount
    const status        = failedCount === 0 ? 'sent'
                        : sentCount === 0   ? 'failed'
                        : 'partial'
    const resendRef     = results.find(r => r.ok && r.resend_id)?.resend_id ?? null

    // ── 6a. Insere row em newsletter_sends e captura o id ───────────────────
    const insertRes = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_sends`,
      {
        method:  'POST',
        headers: { ...headersWrite, Prefer: 'return=representation' },
        body: JSON.stringify({
          briefing_id:      briefing.id,
          briefing_date:    briefing.briefing_date,
          subject_pt:       subjectPt,
          subject_en:       subjectEn,
          body_pt:          bodyPt,
          body_en:          bodyEn,
          recipient_count:  subscribers.length,
          sent_count:       sentCount,
          failed_count:     failedCount,
          status,
          resend_reference: resendRef,
        }),
      },
    )
    if (!insertRes.ok) {
      const t = await insertRes.text()
      throw new Error(`newsletter_sends insert: ${insertRes.status}: ${t}`)
    }
    const inserted   = await insertRes.json() as SendInsertRow[]
    const sendId     = inserted[0]?.id
    if (!sendId) {
      throw new Error('newsletter_sends insert returned no id')
    }

    // ── 6b. Insere N rows em newsletter_send_recipients (em chunks) ─────────
    const recipientRows = payloads.map(p => {
      const r = results.find(x => x.email === p.to)
      return {
        send_id:       sendId,
        subscriber_id: p.subscriber.id,
        email:         p.subscriber.email,
        locale:        p.subscriber.locale ?? 'pt-BR',
        delivered:     !!r?.ok,
        error:         r?.ok ? null : (r?.error ?? 'unknown_error'),
      }
    })

    for (let i = 0; i < recipientRows.length; i += RESEND_BATCH_SIZE) {
      const slice = recipientRows.slice(i, i + RESEND_BATCH_SIZE)
      const recRes = await fetch(
        `${supabaseUrl}/rest/v1/newsletter_send_recipients`,
        {
          method:  'POST',
          headers: { ...headersWrite, Prefer: 'return=minimal' },
          body:    JSON.stringify(slice),
        },
      )
      if (!recRes.ok) {
        const t = await recRes.text()
        // Não rompe o envio inteiro: registra no log; o newsletter_sends já
        // ficou em "sent/partial/failed" e a referência do Resend está lá.
        console.error('newsletter_send_recipients insert:', recRes.status, t)
      }
    }

    return NextResponse.json({
      success:         true,
      sent:            sentCount,
      failed:          failedCount,
      recipient_count: subscribers.length,
      status,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('newsletter-send cron error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
