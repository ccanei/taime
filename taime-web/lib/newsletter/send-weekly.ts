// Envio SEMANAL da Newsletter Radar TAIME (segunda, 09h BRT = 12h UTC).
//
// Lê os briefings dos últimos 7 dias (já gravados pelo cron diário) e produz uma
// SÍNTESE por tema com Sonnet 4.6: 3 a 5 temas dominantes da semana, cada um com
// um parágrafo executivo, abrindo com "a semana em uma frase". Não repete o
// conteúdo diário. O envio e o histórico reusam o núcleo compartilhado
// (lib/newsletter/shared.ts). Idempotência POR SEMANA: usa briefing_date = a
// segunda-feira do envio.

import {
  deliverNewsletter,
  removeEmDash,
  stripFences,
  type DeliverResult,
  type NewsletterContent,
} from './shared'

interface BriefingRow {
  id:            string
  briefing_date: string
  title_pt:      string | null
  title_en:      string | null
  body_pt:       string | null
  body_en:       string | null
}

export type SendWeeklyResult =
  | { ok: true; skipped: true;  reason: 'no_briefings_this_week' | 'already_sent' | 'no_active_subscribers'; recipient_count?: number }
  | { ok: true; skipped?: false; sent: number; failed: number; recipient_count: number; status: 'sent' | 'partial' | 'failed' }
  | { ok: false; error: string }

const WEEKLY_SYSTEM_PROMPT = `You are the lead analyst at TAIME, a strategic
technology intelligence platform. You write the WEEKLY digest for executives: a
synthesis of the week's daily briefings, not a chronological recap.

ABSOLUTE RULES:
- Base everything STRICTLY on the briefings provided. Never invent facts,
  numbers, company names, or events not present in them.
- Refer to sources ONLY by category (research institutes, consulting firms,
  technology vendors, financial institutions, etc). NEVER name specific firms
  like Gartner, McKinsey, Forrester.
- NEVER use the em dash character. Use colon, period, or comma.
- No monetary values.
- Write for leaders, managers, consultants, entrepreneurs of any size.
- Tone: sharp, executive, insight-driven. A reading of what the week MEANS.

STRUCTURE of the digest (this is a SYNTHESIS, not a list of days):
- Open the body with a short "the week in one sentence" line that captures the
  dominant thread of the whole week.
- Then group the week into 3 to 5 DOMINANT THEMES (not one per day). Name each
  theme and write ONE executive paragraph per theme that connects the threads
  across the week and says what it means strategically. Do not enumerate days.
- The title is one strong line capturing the week's dominant theme.

Generate BOTH Portuguese (pt-BR) and English versions, natively (not translated).
In body_pt and body_en, separate the opening line and each theme paragraph with a
blank line. Return ONLY valid JSON, no markdown:
{
  "title_pt": "...",
  "title_en": "...",
  "body_pt": "...",
  "body_en": "..."
}`

// Data UTC de N dias atrás, formato YYYY-MM-DD (para o filtro gte).
function daysAgoUtcDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// Segunda-feira da semana corrente em UTC (YYYY-MM-DD). O cron roda segunda, mas
// isto mantém a idempotência correta mesmo em disparo manual em outro dia.
function currentMondayUtc(): string {
  const now  = new Date()
  const dow  = now.getUTCDay()            // 0 domingo .. 6 sábado
  const back = (dow + 6) % 7              // dias desde a última segunda
  const mon  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back))
  return mon.toISOString().slice(0, 10)
}

function buildUserPrompt(briefings: BriefingRow[]): string {
  const lines = briefings.map(b => {
    const date  = b.briefing_date
    const title = b.title_en ?? b.title_pt ?? ''
    const body  = b.body_en  ?? b.body_pt  ?? ''
    return `[${date}] ${title}\n${body}`
  })
  return `Daily briefings from the past week (${briefings.length} total), oldest first:\n\n${lines.join('\n\n---\n\n')}`
}

export async function sendWeeklyNewsletter(): Promise<SendWeeklyResult> {
  const supabaseUrl  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey   = process.env.SUPABASE_SERVICE_KEY ?? ''
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: 'Missing Supabase env vars' }
  }
  if (!anthropicKey) {
    return { ok: false, error: 'Missing ANTHROPIC_API_KEY' }
  }

  const headersGet = {
    apikey:        serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  }

  try {
    // ── 1. Briefings dos últimos 7 dias ──────────────────────────────────────
    const since = daysAgoUtcDate(7)
    const brRes = await fetch(
      `${supabaseUrl}/rest/v1/radar_briefings` +
        `?briefing_date=gte.${since}` +
        `&order=briefing_date.asc` +
        `&select=id,briefing_date,title_pt,title_en,body_pt,body_en`,
      { headers: headersGet },
    )
    if (!brRes.ok) {
      const t = await brRes.text()
      throw new Error(`briefings fetch: ${brRes.status}: ${t}`)
    }
    const briefings = (await brRes.json() as BriefingRow[])
      .filter(b => (b.body_pt || b.body_en))
    if (briefings.length === 0) {
      return { ok: true, skipped: true, reason: 'no_briefings_this_week' }
    }

    // ── 2. Sonnet: síntese por tema PT + EN ──────────────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4000,
        system:     WEEKLY_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: buildUserPrompt(briefings) }],
      }),
    })
    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      console.error('Claude weekly error:', claudeRes.status, errBody)
      throw new Error(`Anthropic API (${claudeRes.status}): ${errBody}`)
    }

    const claudeData = await claudeRes.json() as { content?: Array<{ text?: string }> }
    const rawText    = claudeData.content?.[0]?.text ?? ''
    const cleaned    = stripFences(rawText)

    let parsed: NewsletterContent
    try {
      parsed = JSON.parse(cleaned) as NewsletterContent
    } catch (e) {
      console.error('Weekly digest JSON parse failed:', cleaned.substring(0, 500))
      throw new Error(`Failed to parse Claude JSON: ${e}`)
    }

    // Defesa: remove qualquer travessão que o modelo tenha deixado passar.
    const content: NewsletterContent = {
      title_pt: removeEmDash(parsed.title_pt ?? ''),
      title_en: removeEmDash(parsed.title_en ?? ''),
      body_pt:  removeEmDash(parsed.body_pt  ?? ''),
      body_en:  removeEmDash(parsed.body_en  ?? ''),
    }
    if (!content.title_pt || !content.title_en || !content.body_pt || !content.body_en) {
      throw new Error('Claude returned incomplete weekly digest (missing fields)')
    }

    // ── 3. Entrega + histórico (idempotência por semana = segunda-feira) ─────
    const monday = currentMondayUtc()
    const result: DeliverResult = await deliverNewsletter(content, {
      briefingDate: monday,
      briefingId:   null,
    })
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('sendWeeklyNewsletter error:', msg)
    return { ok: false, error: msg }
  }
}
