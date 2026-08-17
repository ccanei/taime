// Envio SEMANAL da Newsletter Radar TAIME (segunda, 09h BRT = 12h UTC).
//
// Le os briefings da SEMANA COBERTA (segunda a domingo da semana ANTERIOR, ja que o
// envio e na segunda) e produz uma SINTESE EDITORIAL DIAGRAMADA com Sonnet 4.6: um
// lead ("a semana em uma frase"), 3 a 5 temas dominantes (cada um com paragrafo
// executivo, pull quote opcional e chips) e, quando ha contagens reais, um grafico
// de composicao por tema. O envio e o historico reusam o nucleo compartilhado
// (lib/newsletter/shared.ts). Idempotencia POR SEMANA: briefing_date = a segunda do
// envio.
//
// REGRA INVIOLAVEL: o grafico "os sinais da semana" so exibe contagens REAIS de
// sinais por tema, atribuidas pelo modelo. O TOTAL vem dos radar_briefings
// (signal_count). Nada de numeros inventados: sem contagens validas, o grafico e
// omitido (degradacao segura).

import {
  deliverNewsletter,
  removeEmDash,
  stripFences,
  escapeHtml,
  SITE_URL,
  FROM,
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
  signal_count:  number | null
  signal_ids:    string[] | null
}

export type SendWeeklyResult =
  | { ok: true; skipped: true;  reason: 'no_briefings_this_week' | 'already_sent' | 'no_active_subscribers'; recipient_count?: number }
  | { ok: true; skipped?: false; sent: number; failed: number; recipient_count: number; status: 'sent' | 'partial' | 'failed' }
  | { ok: false; error: string }

// ─── Tipos da sintese estruturada ────────────────────────────────────────────

interface WeeklyTheme {
  numero:       number
  titulo:       string
  corpo:        string
  pull_quote:   string | null
  chips:        string[]
  signal_count: number
}

interface WeeklyLang {
  titulo:        string
  lead:          string
  temas:         WeeklyTheme[]
  total_signals: number
}

interface WeeklyStructured {
  pt: WeeklyLang
  en: WeeklyLang
}

// ─── System prompt: JSON estruturado por idioma ──────────────────────────────

const WEEKLY_SYSTEM_PROMPT = `You are the lead analyst at TAIME, a strategic
technology intelligence platform. You write the WEEKLY digest for executives: an
editorial synthesis of the week's daily briefings, not a chronological recap.

ABSOLUTE RULES:
- Base everything STRICTLY on the briefings provided. Never invent facts, numbers,
  company names, places, or events not present in them.
- Refer to sources ONLY by category (research institutes, consulting firms,
  technology vendors, financial institutions, etc). NEVER name a specific research
  or consulting firm.
- A company may appear as the ACTOR of a fact ("X launched"), never as a SOURCE or
  authority ("according to X").
- NEVER use the em dash character. Use colon, period, or comma.
- No monetary values in any paragraph.
- Write for leaders, managers, consultants and entrepreneurs of any size.
- Tone: sharp, executive, insight-driven. A reading of what the week MEANS.

TASK: group the week into 3 to 5 DOMINANT THEMES (not one per day). For EACH theme
write one executive paragraph that connects the threads across the week and says
what it means strategically. Then ATTRIBUTE the week's signals to themes.

SIGNAL COUNTS (this is measured, never decorative):
- You are given TOTAL_SIGNALS: the real number of signals collected this week.
- Assign every signal to exactly one theme. The signal_count of each theme is how
  many of the week's signals belong to that theme. The sum of all signal_count
  MUST equal TOTAL_SIGNALS. Distribute honestly by the weight of each theme across
  the daily briefings; never fabricate a number to make a bar look good.

pull_quote: the single strongest sentence of the theme, verbatim in spirit, or null.
At most TWO pull quotes in the whole edition. Most themes have null.

chips: only places, entities or countable facts EXPLICITLY named in that theme's
paragraph (for example country names). Empty array if none. Never invent chips.

Generate BOTH Portuguese (pt-BR) and English (en) natively, with equivalent
information and the SAME theme structure and the SAME signal_count per theme in both
languages. Return ONLY valid JSON, no markdown, in exactly this shape:
{
  "pt": {
    "titulo": "manchete forte da semana",
    "lead": "a semana em uma frase",
    "temas": [
      { "numero": 1, "titulo": "nome do tema", "corpo": "paragrafo executivo",
        "pull_quote": "frase de maior impacto ou null", "chips": ["lugar ou fato"],
        "signal_count": 0 }
    ],
    "total_signals": 0
  },
  "en": { "titulo": "...", "lead": "...", "temas": [ ... ], "total_signals": 0 }
}`

// ─── Janela da semana coberta (segunda a domingo ANTERIOR ao envio) ──────────

interface WeekWindow {
  currentMonday: Date   // segunda da semana do ENVIO (idempotencia)
  coveredMonday: Date   // segunda da semana COBERTA
  coveredSunday: Date   // domingo da semana COBERTA
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// O envio ocorre na segunda: a edicao cobre a SEMANA ANTERIOR completa (segunda a
// domingo). currentMonday e a segunda da semana do envio; a janela coberta e
// [currentMonday - 7, currentMonday - 1]. Robusto para disparo manual em outro dia.
function computeWeekWindow(now: Date): WeekWindow {
  const dow  = now.getUTCDay()            // 0 domingo .. 6 sabado
  const back = (dow + 6) % 7              // dias desde a segunda desta semana
  const currentMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back))
  const coveredMonday = new Date(currentMonday.getTime() - 7 * 86_400_000)
  const coveredSunday = new Date(currentMonday.getTime() - 1 * 86_400_000)
  return { currentMonday, coveredMonday, coveredSunday }
}

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// "SEMANA DE {seg} A {dom} {mes}", com o intervalo EXATO da janela lida. Trata
// semana que atravessa a virada de mes.
function formatWeekHeader(mon: Date, sun: Date, isPt: boolean): string {
  const d1 = mon.getUTCDate(), d2 = sun.getUTCDate()
  const m1 = mon.getUTCMonth(), m2 = sun.getUTCMonth()
  const MO = isPt ? MONTHS_PT : MONTHS_EN
  if (isPt) {
    return m1 === m2
      ? `SEMANA DE ${d1} A ${d2} DE ${MO[m2]}`
      : `SEMANA DE ${d1} DE ${MO[m1]} A ${d2} DE ${MO[m2]}`
  }
  return m1 === m2
    ? `WEEK OF ${MO[m2]} ${d1} TO ${d2}`
    : `WEEK OF ${MO[m1]} ${d1} TO ${MO[m2]} ${d2}`
}

// ─── Prompt do usuario ───────────────────────────────────────────────────────

function buildUserPrompt(briefings: BriefingRow[], totalSignals: number): string {
  const lines = briefings.map(b => {
    const date  = b.briefing_date
    const count = b.signal_count ?? (b.signal_ids?.length ?? 0)
    const title = b.title_en ?? b.title_pt ?? ''
    const body  = b.body_en  ?? b.body_pt  ?? ''
    return `[${date}] (${count} signals) ${title}\n${body}`
  })
  return `TOTAL_SIGNALS this week: ${totalSignals}\n\n` +
    `Daily briefings from the covered week (${briefings.length} days), oldest first. ` +
    `Each line shows the real number of signals that day; group them into themes and ` +
    `distribute all ${totalSignals} signals across the themes (sum of signal_count = ${totalSignals}):\n\n` +
    lines.join('\n\n---\n\n')
}

// ─── Validacao / sanitizacao da resposta do modelo ───────────────────────────

function sanitizeLang(raw: unknown): WeeklyLang | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const titulo = removeEmDash(typeof o.titulo === 'string' ? o.titulo : '')
  const lead   = removeEmDash(typeof o.lead === 'string' ? o.lead : '')
  const temasRaw = Array.isArray(o.temas) ? o.temas : []
  const temas: WeeklyTheme[] = temasRaw.map((t, i) => {
    const to = (t && typeof t === 'object') ? t as Record<string, unknown> : {}
    const chips = Array.isArray(to.chips)
      ? to.chips.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).map(c => removeEmDash(c.trim()))
      : []
    const sc = to.signal_count
    const count = typeof sc === 'number' && Number.isFinite(sc) && sc >= 0 ? Math.round(sc) : NaN
    const pq = typeof to.pull_quote === 'string' && to.pull_quote.trim().length > 0
      ? removeEmDash(to.pull_quote.trim()) : null
    return {
      numero:       typeof to.numero === 'number' ? to.numero : i + 1,
      titulo:       removeEmDash(typeof to.titulo === 'string' ? to.titulo : ''),
      corpo:        removeEmDash(typeof to.corpo === 'string' ? to.corpo : ''),
      pull_quote:   pq,
      chips,
      signal_count: count,
    }
  }).filter(t => t.titulo && t.corpo)
  if (!titulo || !lead || temas.length === 0) return null
  const ts = typeof o.total_signals === 'number' ? o.total_signals : NaN
  return { titulo, lead, temas, total_signals: Number.isFinite(ts) ? ts : NaN }
}

// So renderiza o grafico se TODOS os temas tem signal_count finito e pelo menos um
// tem contagem > 0. Nunca inventa numero para preencher barra.
function chartIsValid(lang: WeeklyLang): boolean {
  if (lang.temas.length === 0) return false
  if (!lang.temas.every(t => Number.isFinite(t.signal_count) && t.signal_count >= 0)) return false
  return lang.temas.some(t => t.signal_count > 0)
}

// ─── Template HTML editorial (table-based, compativel Outlook) ───────────────

interface WeeklyRenderArgs {
  lang:          WeeklyLang
  isPt:          boolean
  headerRight:   string       // "SEMANA DE ..."
  totalSignals:  number       // total REAL derivado dos briefings
  showChart:     boolean
  unsubscribeUrl: string
}

function renderChartBlock(lang: WeeklyLang, isPt: boolean, totalSignals: number): string {
  const max = Math.max(...lang.temas.map(t => t.signal_count), 1)
  const dominant = lang.temas.reduce((a, b) => (b.signal_count > a.signal_count ? b : a), lang.temas[0])

  const rows = lang.temas.map(t => {
    const isDom  = t === dominant
    const pct    = Math.max(t.signal_count > 0 ? 4 : 0, Math.round((t.signal_count / max) * 100))
    const fill   = isDom ? '#3B82F6' : '#60A5FA'
    const nameColor = isDom ? '#F1F5F9' : '#CBD5E1'
    const nameWeight = isDom ? 'bold' : 'normal'
    const numColor = isDom ? '#3B82F6' : '#64748B'
    const numSize  = isDom ? '18px' : '14px'
    return `
      <tr><td style="padding:0 0 14px 0;">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-family:Georgia,serif;font-size:14px;color:${nameColor};font-weight:${nameWeight};">${escapeHtml(t.titulo)}</td>
            <td align="right" style="font-family:Georgia,serif;font-size:${numSize};color:${numColor};font-weight:bold;white-space:nowrap;padding-left:12px;">${t.signal_count}</td>
          </tr>
          <tr><td colspan="2" style="padding-top:7px;">
            <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#1E293B;border-radius:4px;">
              <tr>
                <td width="${pct}%" style="background-color:${fill};height:8px;line-height:8px;font-size:1px;border-radius:4px;">&nbsp;</td>
                <td style="font-size:1px;line-height:8px;">&nbsp;</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>`
  }).join('')

  const blockLabel = isPt ? 'OS SINAIS DA SEMANA' : 'THE WEEK\'S SIGNALS'
  const rightLabel = isPt
    ? `${totalSignals} sinais &middot; ${lang.temas.length} temas`
    : `${totalSignals} signals &middot; ${lang.temas.length} themes`

  return `
    <tr><td style="padding:8px 40px 28px 40px;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#0B1220;border-radius:12px;">
        <tr><td style="padding:20px 22px 6px 22px;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-family:Georgia,serif;font-size:11px;letter-spacing:1.5px;color:#94A3B8;text-transform:uppercase;">${blockLabel}</td>
              <td align="right" style="font-family:Georgia,serif;font-size:11px;color:#64748B;white-space:nowrap;padding-left:10px;">${rightLabel}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 22px 8px 22px;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>
      </table>
    </td></tr>`
}

function renderThemeBlock(t: WeeklyTheme): string {
  const chipsHtml = t.chips.length > 0
    ? `<div style="margin:14px 0 0 0;">${t.chips.map(c =>
        `<span style="display:inline-block;background-color:#1E293B;color:#93C5FD;border-radius:20px;padding:5px 13px;font-size:12px;font-family:Georgia,serif;margin:0 6px 6px 0;">${escapeHtml(c)}</span>`,
      ).join('')}</div>`
    : ''

  const quoteHtml = t.pull_quote
    ? `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:16px 0 0 0;">
         <tr><td style="border-left:2px solid #3B82F6;padding:2px 0 2px 16px;">
           <p style="margin:0;font-style:italic;color:#E2E8F0;font-size:16px;line-height:1.6;font-family:Georgia,serif;">${escapeHtml(t.pull_quote)}</p>
         </td></tr>
       </table>`
    : ''

  return `
    <tr><td style="padding:0 40px 28px 40px;">
      <p style="margin:0 0 8px 0;">
        <span style="font-family:Georgia,serif;font-size:20px;color:#3B82F6;font-weight:bold;">${escapeHtml(String(t.numero))}.</span>
        <span style="font-family:Georgia,serif;font-size:16px;color:#E2E8F0;font-weight:bold;">&nbsp;${escapeHtml(t.titulo)}</span>
      </p>
      <p style="margin:0;font-family:Georgia,serif;font-size:15px;line-height:1.8;color:#94A3B8;">${escapeHtml(t.corpo)}</p>
      ${chipsHtml}
      ${quoteHtml}
    </td></tr>`
}

function buildWeeklyEmailHtml(args: WeeklyRenderArgs): string {
  const { lang, isPt, headerRight, totalSignals, showChart, unsubscribeUrl } = args

  const kicker = isPt ? 'A SEMANA EM UMA FRASE' : 'THE WEEK IN ONE SENTENCE'
  const radarLabel = isPt ? 'Abrir o Radar TAIME' : 'Open the TAIME Radar'
  const footerNote = isPt
    ? 'Voce esta recebendo este e-mail porque assinou o Radar TAIME. Cancele a qualquer momento abaixo.'
    : 'You are receiving this email because you subscribed to the TAIME Radar. Unsubscribe at any time below.'
  const unsubLabel = isPt ? 'Cancelar inscricao' : 'Unsubscribe'

  const chartHtml  = showChart ? renderChartBlock(lang, isPt, totalSignals) : ''
  const themesHtml = lang.temas.map(renderThemeBlock).join('')

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#0F172A;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0F172A;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#0F172A;max-width:600px;">
          <!-- a) Cabecalho -->
          <tr><td style="padding:0 40px 22px 40px;">
            <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="white-space:nowrap;">
                  <span style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:3px;font-family:Georgia,serif;">TAIME</span>
                  <span style="font-size:12px;letter-spacing:2px;color:rgba(255,255,255,0.5);font-family:Georgia,serif;margin-left:8px;">RADAR</span>
                </td>
                <td align="right" style="font-family:Georgia,serif;font-size:11px;letter-spacing:1.5px;color:#64748B;white-space:nowrap;padding-left:10px;">${escapeHtml(headerRight)}</td>
              </tr>
            </table>
          </td></tr>
          <!-- b) Titulo da edicao -->
          <tr><td style="padding:0 40px 18px 40px;">
            <h1 style="margin:0;font-size:26px;color:#ffffff;font-family:Georgia,serif;font-weight:bold;line-height:1.3;">${escapeHtml(lang.titulo)}</h1>
          </td></tr>
          <!-- c) Kicker + lead -->
          <tr><td style="padding:0 40px 24px 40px;">
            <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:11px;letter-spacing:2px;color:#3B82F6;text-transform:uppercase;">${kicker}</p>
            <p style="margin:0;font-family:Georgia,serif;font-size:18px;line-height:1.55;color:#E2E8F0;">${escapeHtml(lang.lead)}</p>
          </td></tr>
          <!-- d) Grafico de composicao (so com contagens reais) -->
          ${chartHtml}
          <!-- e) Temas -->
          ${themesHtml}
          <!-- f) CTA -->
          <tr><td style="padding:8px 40px 40px 40px;">
            <a href="${SITE_URL}/radar" style="display:inline-block;background-color:#2563EB;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;font-family:Georgia,serif;font-size:14px;letter-spacing:0.5px;">${radarLabel}</a>
          </td></tr>
          <!-- g) Rodape -->
          <tr><td style="padding:24px 40px 40px 40px;border-top:1px solid rgba(255,255,255,0.1);">
            <p style="margin:0 0 10px 0;font-size:12px;color:rgba(255,255,255,0.45);font-family:Georgia,serif;line-height:1.6;">${footerNote}</p>
            <p style="margin:0 0 10px 0;font-size:12px;color:rgba(255,255,255,0.6);font-family:Georgia,serif;">
              <a href="${unsubscribeUrl}" style="color:rgba(255,255,255,0.7);text-decoration:underline;">${unsubLabel}</a>
            </p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);font-family:Georgia,serif;">
              TAIME &middot; Strategic Technology Intelligence<br/>
              contact@taime.tech
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Serializacao do corpo para o snapshot (colunas body_pt/body_en) ─────────

function serializeBody(lang: WeeklyLang): string {
  const parts = [lang.lead]
  for (const t of lang.temas) {
    parts.push(`${t.numero}. ${t.titulo}\n${t.corpo}`)
  }
  return parts.join('\n\n')
}

// ─── Nucleo: le briefings + gera a sintese estruturada ───────────────────────

interface BuiltWeekly {
  structured:   WeeklyStructured
  content:      NewsletterContent
  window:       WeekWindow
  headerPt:     string
  headerEn:     string
  totalSignals: number
  showChartPt:  boolean
  showChartEn:  boolean
}

async function buildWeeklyContent(now: Date): Promise<
  { ok: true; built: BuiltWeekly } | { ok: false; skipReason?: 'no_briefings_this_week'; error?: string }
> {
  const supabaseUrl  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey   = process.env.SUPABASE_SERVICE_KEY ?? ''
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!supabaseUrl || !serviceKey) return { ok: false, error: 'Missing Supabase env vars' }
  if (!anthropicKey) return { ok: false, error: 'Missing ANTHROPIC_API_KEY' }

  const headersGet = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const win = computeWeekWindow(now)

  // Briefings da SEMANA COBERTA [coveredMonday, coveredSunday], inclusivo.
  const brRes = await fetch(
    `${supabaseUrl}/rest/v1/radar_briefings` +
      `?briefing_date=gte.${isoDate(win.coveredMonday)}` +
      `&briefing_date=lte.${isoDate(win.coveredSunday)}` +
      `&order=briefing_date.asc` +
      `&select=id,briefing_date,title_pt,title_en,body_pt,body_en,signal_count,signal_ids`,
    { headers: headersGet },
  )
  if (!brRes.ok) return { ok: false, error: `briefings fetch: ${brRes.status}: ${await brRes.text()}` }

  const briefings = (await brRes.json() as BriefingRow[]).filter(b => (b.body_pt || b.body_en))
  if (briefings.length === 0) return { ok: false, skipReason: 'no_briefings_this_week' }

  // Total REAL de sinais da semana (soma dos signal_count; fallback signal_ids).
  const totalSignals = briefings.reduce(
    (acc, b) => acc + (b.signal_count ?? (b.signal_ids?.length ?? 0)), 0,
  )

  // Sonnet: sintese estruturada PT + EN.
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 6000,
      system:     WEEKLY_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: buildUserPrompt(briefings, totalSignals) }],
    }),
  })
  if (!claudeRes.ok) {
    const errBody = await claudeRes.text()
    console.error('Claude weekly error:', claudeRes.status, errBody)
    return { ok: false, error: `Anthropic API (${claudeRes.status}): ${errBody}` }
  }

  const claudeData = await claudeRes.json() as { content?: Array<{ text?: string }> }
  const cleaned    = stripFences(claudeData.content?.[0]?.text ?? '')

  let parsedRaw: unknown
  try {
    parsedRaw = JSON.parse(cleaned)
  } catch (e) {
    console.error('Weekly digest JSON parse failed:', cleaned.substring(0, 500))
    return { ok: false, error: `Failed to parse Claude JSON: ${e}` }
  }

  const root = (parsedRaw && typeof parsedRaw === 'object') ? parsedRaw as Record<string, unknown> : {}
  const pt = sanitizeLang(root.pt)
  const en = sanitizeLang(root.en)
  if (!pt || !en) return { ok: false, error: 'Claude returned incomplete weekly digest (missing pt/en)' }

  const structured: WeeklyStructured = { pt, en }
  const content: NewsletterContent = {
    title_pt: pt.titulo,
    title_en: en.titulo,
    body_pt:  serializeBody(pt),
    body_en:  serializeBody(en),
  }

  return {
    ok: true,
    built: {
      structured,
      content,
      window:       win,
      headerPt:     formatWeekHeader(win.coveredMonday, win.coveredSunday, true),
      headerEn:     formatWeekHeader(win.coveredMonday, win.coveredSunday, false),
      totalSignals,
      showChartPt:  chartIsValid(pt),
      showChartEn:  chartIsValid(en),
    },
  }
}

// ─── Envio SEMANAL (producao) ────────────────────────────────────────────────

export async function sendWeeklyNewsletter(): Promise<SendWeeklyResult> {
  try {
    const now = new Date()
    const res = await buildWeeklyContent(now)
    if (!res.ok) {
      if (res.skipReason === 'no_briefings_this_week') {
        return { ok: true, skipped: true, reason: 'no_briefings_this_week' }
      }
      return { ok: false, error: res.error ?? 'unknown build error' }
    }
    const b = res.built

    // Snapshot estruturado do que foi enviado (jsonb; resiliente se a coluna faltar).
    const structuredSnapshot = {
      pt:            b.structured.pt,
      en:            b.structured.en,
      total_signals: b.totalSignals,
      week: {
        covered_monday: isoDate(b.window.coveredMonday),
        covered_sunday: isoDate(b.window.coveredSunday),
        header_pt:      b.headerPt,
        header_en:      b.headerEn,
      },
      chart: { pt: b.showChartPt, en: b.showChartEn },
    }

    const result: DeliverResult = await deliverNewsletter(b.content, {
      briefingDate: isoDate(b.window.currentMonday), // idempotencia por semana = segunda do envio
      briefingId:   null,
      structured:   structuredSnapshot,
      buildHtml: ({ isPtLocale, unsubscribeUrl }) => buildWeeklyEmailHtml({
        lang:           isPtLocale ? b.structured.pt : b.structured.en,
        isPt:           isPtLocale,
        headerRight:    isPtLocale ? b.headerPt : b.headerEn,
        totalSignals:   b.totalSignals,
        showChart:      isPtLocale ? b.showChartPt : b.showChartEn,
        unsubscribeUrl,
      }),
    })
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('sendWeeklyNewsletter error:', msg)
    return { ok: false, error: msg }
  }
}

// ─── PREVIEW: envia SO para 1 endereco, sem historico, sem idempotencia ──────
// Para conferir o layout na propria caixa antes do deploy. NAO toca na lista de
// ativos, no historico, nem na idempotencia da producao.
export type WeeklyPreviewResult =
  | { ok: true; sent: true; to: string; chart: boolean; total_signals: number; week: string }
  | { ok: true; skipped: true; reason: 'no_briefings_this_week' }
  | { ok: false; error: string }

// Constroi o HTML da preview (sem enviar). Reusado pela preview e util para
// inspecao local do layout. now injetado para determinismo em teste.
export async function renderWeeklyPreview(now: Date, lang: 'pt' | 'en'): Promise<
  | { ok: true; html: string; subject: string; chart: boolean; total_signals: number; week: string }
  | { ok: true; skipped: true; reason: 'no_briefings_this_week' }
  | { ok: false; error: string }
> {
  const res = await buildWeeklyContent(now)
  if (!res.ok) {
    if (res.skipReason === 'no_briefings_this_week') return { ok: true, skipped: true, reason: 'no_briefings_this_week' }
    return { ok: false, error: res.error ?? 'unknown build error' }
  }
  const b    = res.built
  const isPt = lang !== 'en'
  const langObj = isPt ? b.structured.pt : b.structured.en
  const html = buildWeeklyEmailHtml({
    lang:           langObj,
    isPt,
    headerRight:    isPt ? b.headerPt : b.headerEn,
    totalSignals:   b.totalSignals,
    showChart:      isPt ? b.showChartPt : b.showChartEn,
    unsubscribeUrl: `${SITE_URL}/api/newsletter/unsubscribe?token=preview`,
  })
  return {
    ok: true,
    html,
    subject:       `[PREVIEW] ${langObj.titulo}`,
    chart:         isPt ? b.showChartPt : b.showChartEn,
    total_signals: b.totalSignals,
    week:          isPt ? b.headerPt : b.headerEn,
  }
}

export async function sendWeeklyPreview(to: string, lang: 'pt' | 'en'): Promise<WeeklyPreviewResult> {
  try {
    const resendKey = process.env.RESEND_API_KEY ?? ''
    if (!resendKey) return { ok: false, error: 'Missing RESEND_API_KEY' }
    if (!to || !to.includes('@')) return { ok: false, error: 'Invalid preview address' }

    const r = await renderWeeklyPreview(new Date(), lang)
    if (!r.ok) return r
    if ('skipped' in r) return r

    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject: r.subject, html: r.html }),
    })
    if (!send.ok) return { ok: false, error: `resend_status_${send.status}: ${await send.text()}` }

    return { ok: true, sent: true, to, chart: r.chart, total_signals: r.total_signals, week: r.week }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('sendWeeklyPreview error:', msg)
    return { ok: false, error: msg }
  }
}
