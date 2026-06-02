import { NextResponse } from 'next/server'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

interface RadarSignal {
  id:              string
  title_pt:        string | null
  title_en:        string | null
  summary_pt:      string | null
  summary_en:      string | null
  category:        string | null
  relevance:       string | null
  source_category: string | null
  url:             string | null
  collected_at:    string | null
}

interface BriefingPayload {
  title_pt: string
  title_en: string
  body_pt:  string
  body_en:  string
}

const SYSTEM_PROMPT = `You are the lead analyst at TAIME, a strategic technology
intelligence platform. You write a concise daily briefing analyzing
today's technology signals for executives.

ABSOLUTE RULES:
- Base everything STRICTLY on the signals provided. Never invent
  facts, numbers, company names, or events not present in the signals.
- Refer to sources ONLY by category (research institutes, consulting
  firms, technology vendors, financial institutions, etc). NEVER name
  specific firms like Gartner, McKinsey, Forrester.
- NEVER use the em dash character. Use colon, period, or comma.
- No monetary values.
- Write for leaders, managers, consultants, entrepreneurs of any size.
- Tone: sharp, executive, insight-driven. Not a news recap, but a
  reading of what the signals MEAN.

Produce a briefing with:
- A title (one strong line capturing the day's dominant theme)
- A body of 2 to 3 short paragraphs: what the signals show, what
  pattern connects them, and what it means strategically.

Generate BOTH Portuguese (pt-BR) and English versions, natively
(not translated). Return ONLY valid JSON, no markdown:
{
  "title_pt": "...",
  "title_en": "...",
  "body_pt": "...",
  "body_en": "..."
}`

function todayUtcDate(): string {
  // briefing_date é DATE no banco; usamos a data UTC para evitar drift de fuso.
  return new Date().toISOString().slice(0, 10)
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()
}

function removeEmDash(s: string): string {
  return s.replace(/—/g, ':')
}

function buildUserPrompt(signals: RadarSignal[]): string {
  const lines = signals.map((s, i) => {
    const title    = s.title_en   ?? s.title_pt   ?? ''
    const summary  = s.summary_en ?? s.summary_pt ?? ''
    const cat      = s.category   ?? '(uncategorized)'
    return `[${i + 1}] (${cat}) ${title}\n    ${summary}`
  })
  return `Today's collected signals (${signals.length} total):\n\n${lines.join('\n\n')}`
}

export async function GET(request: Request) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabaseUrl  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
      .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
    const serviceKey   = process.env.SUPABASE_SERVICE_KEY ?? ''
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? ''

    if (!supabaseUrl || !serviceKey || !anthropicKey) {
      return NextResponse.json(
        { success: false, error: 'Missing env vars' },
        { status: 500 },
      )
    }

    // ── 1. Idempotência: já existe briefing pra hoje? ──────────────────────
    const briefingDate = todayUtcDate()
    const existsRes = await fetch(
      `${supabaseUrl}/rest/v1/radar_briefings?briefing_date=eq.${briefingDate}&select=id&limit=1`,
      {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    )
    if (existsRes.ok) {
      const rows = await existsRes.json() as Array<{ id: string }>
      if (rows.length > 0) {
        return NextResponse.json({ success: true, skipped: true, reason: 'already_exists' })
      }
    }

    // ── 2. Busca sinais das últimas 24h ────────────────────────────────────
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const sigsRes = await fetch(
      `${supabaseUrl}/rest/v1/radar_signals` +
        `?collected_at=gte.${encodeURIComponent(since)}` +
        `&order=collected_at.desc` +
        `&select=id,title_pt,title_en,summary_pt,summary_en,category,relevance,source_category,url,collected_at`,
      {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    )
    if (!sigsRes.ok) {
      const err = await sigsRes.text()
      throw new Error(`Supabase signals fetch: ${sigsRes.status}: ${err}`)
    }
    const signals = await sigsRes.json() as RadarSignal[]

    if (signals.length === 0) {
      return NextResponse.json({ success: true, count: 0, reason: 'no_signals_in_24h' })
    }

    // ── 3. Claude: gera briefing PT + EN ──────────────────────────────────
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
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: buildUserPrompt(signals) }],
      }),
    })

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text()
      console.error('Claude error:', claudeRes.status, errBody)
      throw new Error(`Anthropic API (${claudeRes.status}): ${errBody}`)
    }

    const claudeData = await claudeRes.json() as { content?: Array<{ text?: string }> }
    const rawText    = claudeData.content?.[0]?.text ?? ''
    const cleaned    = stripFences(rawText)

    let briefing: BriefingPayload
    try {
      briefing = JSON.parse(cleaned) as BriefingPayload
    } catch (e) {
      console.error('Briefing JSON parse failed:', cleaned.substring(0, 500))
      throw new Error(`Failed to parse Claude JSON: ${e}`)
    }

    // ── 4. Defesa: remove qualquer em dash que o modelo tenha deixado passar
    const safe: BriefingPayload = {
      title_pt: removeEmDash(briefing.title_pt ?? ''),
      title_en: removeEmDash(briefing.title_en ?? ''),
      body_pt:  removeEmDash(briefing.body_pt  ?? ''),
      body_en:  removeEmDash(briefing.body_en  ?? ''),
    }

    if (!safe.title_pt || !safe.title_en || !safe.body_pt || !safe.body_en) {
      throw new Error('Claude returned incomplete briefing (missing fields)')
    }

    // ── 5. Salva em radar_briefings ───────────────────────────────────────
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/radar_briefings`, {
      method: 'POST',
      headers: {
        apikey:         serviceKey,
        Authorization:  `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      },
      body: JSON.stringify({
        briefing_date: briefingDate,
        title_pt:      safe.title_pt,
        title_en:      safe.title_en,
        body_pt:       safe.body_pt,
        body_en:       safe.body_en,
        signal_count:  signals.length,
        signal_ids:    signals.map(s => s.id),
      }),
    })

    if (!insertRes.ok) {
      const err = await insertRes.text()
      throw new Error(`Supabase briefing insert: ${insertRes.status}: ${err}`)
    }

    return NextResponse.json({ success: true, count: signals.length, briefing_date: briefingDate })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Radar briefing cron error:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
