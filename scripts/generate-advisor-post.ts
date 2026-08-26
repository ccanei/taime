#!/usr/bin/env npx ts-node
/*
 * ============================================================================
 * generate-advisor-post.ts
 * ----------------------------------------------------------------------------
 * Maquina de rascunhos de posts de LinkedIn a partir do uso REAL do Executive
 * Advisor sobre as trends do ultimo periodo publicado.
 *
 * Fluxo:
 *   1. periodo mais recente com relatorios published
 *   2. sorteia UMA trend desse periodo, peso proporcional ao taime_score,
 *      excluindo as usadas nos ultimos 4 marketing_posts
 *   3. gera uma pergunta estrategica C-level (alterna dois angulos por execucao)
 *   4. envia ao Advisor pela VIA INTERNA (mesmo modelo/regras do chat, marcado
 *      como interno em llm_calls: caller='marketing', meta.internal=true; nao
 *      consome contador de nenhum usuario nem polui metrica de uso real)
 *   5. transforma a resposta em dois posts (PT nativo, EN nativo)
 *   6. grava em marketing_posts com status 'draft'
 *
 * Rodar: npx ts-node scripts/generate-advisor-post.ts   (na raiz do taime-CLEAN)
 * ============================================================================
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()

const SUPA    = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? ''
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const ADVISOR_MODEL = 'claude-sonnet-5'   // mesmo modelo do chat do Advisor
const HAIKU_MODEL   = 'claude-haiku-4-5'

const SITE = 'taime.tech/ask'

// ── Rede de seguranca anti-travessao (deterministica, aplicada ao output) ────
function stripEmDash(s: string): string {
  if (!s) return s
  return s.replace(/\s*\u2014\s*/g, ', ').replace(/,\s*([.;:!?])/g, '$1')
}

// ── REST Supabase (service key) ──────────────────────────────────────────────
async function rest<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  let data: unknown = null
  try { data = await r.json() } catch { /* vazio */ }
  return { status: r.status, data: data as T }
}

// ── Telemetria: marca a chamada como INTERNA (caller='marketing'), sem tocar em
//    contador de usuario. Fire-and-forget. ────────────────────────────────────
async function logLlmCall(rec: Record<string, unknown>): Promise<void> {
  try {
    await rest('llm_calls', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rec) })
  } catch (e) {
    console.error('[marketing] llm_calls insert falhou (ignorado):', e instanceof Error ? e.message : e)
  }
}

interface AnthropicUsage { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
async function callModel(opts: {
  model: string; system: string; user: string; maxTokens: number; step: string; trendId?: string; period?: string
}): Promise<string> {
  const t0 = Date.now()
  let ok = false, usage: AnthropicUsage | null = null, text = ''
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: opts.model, max_tokens: opts.maxTokens,
        system: [{ type: 'text', text: opts.system }],
        messages: [{ role: 'user', content: opts.user }],
      }),
    })
    ok = res.ok
    const data = await res.json() as { content?: Array<{ type: string; text: string }>; usage?: AnthropicUsage; error?: { message?: string } }
    if (!ok) throw new Error(`anthropic ${res.status}: ${data.error?.message ?? ''}`)
    usage = data.usage ?? null
    text = data.content?.find(b => b.type === 'text')?.text ?? ''
  } finally {
    // caller='marketing' + meta.internal=true: identifica a chamada interna sem
    // sujar as metricas de uso real (advisor/ask) nem contador de mensagens.
    void logLlmCall({
      caller: 'marketing', model: opts.model,
      input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null,
      cache_read_tokens: usage?.cache_read_input_tokens ?? null, cache_write_tokens: usage?.cache_creation_input_tokens ?? null,
      latency_ms: Date.now() - t0, success: ok, error_code: ok ? null : 'api_error',
      meta: { internal: true, step: opts.step, trend_id: opts.trendId ?? null, period: opts.period ?? null },
    })
  }
  return text
}

function parseJson<T>(raw: string): T | null {
  const s = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try { return JSON.parse(s) as T } catch { return null }
}

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Tnn { then?: string; now?: string; next?: string }
interface Framework { executive_snapshot?: string; type?: string; act?: string; impact?: string; move?: string; exit?: string }
interface TrendRow {
  id: string; report_id: string; taime_score: number; category: string | null; theme_slug: string | null
  title_pt_br: string; title_en: string
  then_now_next_pt_br: Tnn | null; then_now_next_en: Tnn | null
  taime_framework_pt_br: Framework | null; taime_framework_en: Framework | null
  recommended_move_pt_br: string | null; recommended_move_en: string | null
}

// ── Hashtag do tema (4a; as 3 primeiras sao fixas) ──────────────────────────
function themeHashtag(category: string | null, themeSlug: string | null): string {
  const src = (category ?? '').trim()
  if (src) {
    if (/^ia$|^ai$/i.test(src)) return '#AI'
    const camel = src.replace(/[^a-zA-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
    if (camel) return `#${camel}`
  }
  if (themeSlug) {
    const camel = themeSlug.split('-').filter(Boolean).map(w => w === 'ia' || w === 'ai' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join('')
    if (camel) return `#${camel}`
  }
  return '#TechIntelligence'
}

// ── Sorteio ponderado pelo score ─────────────────────────────────────────────
function weightedPick(trends: TrendRow[]): TrendRow {
  const total = trends.reduce((s, t) => s + Math.max(1, t.taime_score), 0)
  let r = Math.random() * total
  for (const t of trends) { r -= Math.max(1, t.taime_score); if (r <= 0) return t }
  return trends[trends.length - 1]
}

// ── Regras invioláveis (no prompt) ───────────────────────────────────────────
const HARD_RULES = `INVIOLABLE OUTPUT RULES (no exception):
- Never use the em dash character (U+2014). Use a comma, a colon, parentheses or a period.
- No monetary value in any currency (no $, R$, EUR, USD, "R$", figures of cost, price, budget or revenue).
- No plan prices.
- Sources ONLY by category, NEVER the name of a publication, consultancy, analyst house or research firm ("according to X" is forbidden). Do not name or imitate any sector firm.
- A company may be named ONLY as the actor of a documented fact ("X launched", "Y went to production").
- No percentage or statistic that is not present in the provided trend material.
- Executive register, formal, no colloquial contractions.
- Voice of a senior strategic advisor speaking to a C-level reader: business implication before technical detail, the cost of inaction made explicit, and a named decision window.`

// ── Fluxo ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!SUPA || !SERVICE) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(2) }
  if (!ANTHROPIC_KEY)     { console.error('Falta ANTHROPIC_API_KEY'); process.exit(2) }

  // 1) periodo mais recente published
  const { data: periodRows } = await rest<Array<{ period: string }>>('reports?status=eq.published&select=period&order=period.desc&limit=1')
  const period = Array.isArray(periodRows) ? periodRows[0]?.period : undefined
  if (!period) { console.error('Nenhum relatorio published encontrado.'); process.exit(1) }
  console.log('Periodo mais recente publicado:', period)

  // 2) trends desse periodo
  const { data: reps } = await rest<Array<{ id: string }>>(`reports?status=eq.published&period=eq.${period}&select=id`)
  const reportIds = (reps ?? []).map(r => r.id)
  if (reportIds.length === 0) { console.error('Sem relatorios no periodo.'); process.exit(1) }
  const sel = 'id,report_id,taime_score,category,theme_slug,title_pt_br,title_en,then_now_next_pt_br,then_now_next_en,taime_framework_pt_br,taime_framework_en,recommended_move_pt_br,recommended_move_en'
  const { data: trendData } = await rest<TrendRow[]>(`report_trends?report_id=in.(${reportIds.join(',')})&select=${sel}`)
  let trends = (trendData ?? [])
  if (trends.length === 0) { console.error('Sem trends no periodo.'); process.exit(1) }

  // exclui as usadas nos ultimos 4 posts (tolerante a tabela ausente). A janela
  // inclui posts source='manual' (a query nao filtra por source): considera tanto
  // trend_id quanto trend_title, pois um post manual pode ter so o titulo do tema
  // preenchido, sem trend_id.
  const mp = await rest<Array<{ trend_id: string | null; trend_title: string | null }>>(
    'marketing_posts?select=trend_id,trend_title&order=created_at.desc&limit=4')
  const tableMissing = mp.status === 404 || mp.status === 400
  const recentRows = Array.isArray(mp.data) ? mp.data : []
  const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase()
  const recentUsedIds    = new Set(recentRows.map(x => x.trend_id).filter(Boolean) as string[])
  const recentUsedTitles = new Set(recentRows.map(x => norm(x.trend_title)).filter(Boolean))
  const isRecentlyUsed = (t: TrendRow): boolean =>
    recentUsedIds.has(t.id) || recentUsedTitles.has(norm(t.title_pt_br)) || recentUsedTitles.has(norm(t.title_en))
  const pool = trends.filter(t => !isRecentlyUsed(t))
  trends = pool.length > 0 ? pool : trends
  console.log(`Trends candidatas: ${trends.length} (janela recente: ${recentUsedIds.size} por id, ${recentUsedTitles.size} por titulo)`)

  // total de posts p/ alternar o angulo
  const cnt = await rest<Array<{ id: string }>>('marketing_posts?select=id')
  const totalPosts = tableMissing ? 0 : (Array.isArray(cnt.data) ? cnt.data.length : 0)
  const angle: 'read' | 'trajectory' = totalPosts % 2 === 0 ? 'read' : 'trajectory'
  console.log('Angulo desta execucao:', angle)

  // 3) trend escolhida
  const trend = weightedPick(trends)
  const titleEn = trend.title_en || trend.title_pt_br
  const titlePt = trend.title_pt_br || trend.title_en
  const tnnEn = trend.then_now_next_en ?? trend.then_now_next_pt_br ?? {}
  const fwEn  = trend.taime_framework_en ?? trend.taime_framework_pt_br ?? {}
  console.log(`Trend escolhida: [${trend.taime_score}] ${titleEn} (${trend.category ?? 'sem categoria'})`)

  const trendBlock = `TREND (the only archive material you may ground on this turn):
Period: ${period}
Title: ${titleEn}
Category: ${trend.category ?? 'n/a'}
TAIME Score: ${trend.taime_score}/100
THEN: ${tnnEn.then ?? 'n/a'}
NOW: ${tnnEn.now ?? 'n/a'}
NEXT: ${tnnEn.next ?? 'n/a'}
Recommended move: ${trend.recommended_move_en ?? trend.recommended_move_pt_br ?? 'n/a'}
Framework snapshot: ${fwEn.executive_snapshot ?? [fwEn.type, fwEn.act, fwEn.impact, fwEn.move, fwEn.exit].filter(Boolean).join(' | ') ?? 'n/a'}`

  // ── PASSO A: pergunta C-level (PT + EN), no angulo desta execucao ──────────
  const angleInstruction = angle === 'read'
    ? 'ANGLE: the strategic READ and BUSINESS IMPLICATION of this trend for a C-level leader (what it means for the decision they own, not a technical summary).'
    : 'ANGLE: the TEMPORAL TRAJECTORY of this trend in THEN / NOW / NEXT terms (how it evolved and where it is heading), from a C-level decision standpoint.'
  const qRaw = await callModel({
    model: HAIKU_MODEL, maxTokens: 400, step: 'question', trendId: trend.id, period,
    system: `You craft ONE sharp strategic question a C-level executive would ask the TAIME Executive Advisor about a technology trend. Return PURE JSON only: {"question_pt":"...","question_en":"..."}. One question in each language, natural and native (not a translation of the other), 12 to 24 words, ending with a question mark. ${angleInstruction} No em dash, no monetary value, no firm name.`,
    user: `${trendBlock}`,
  })
  const q = parseJson<{ question_pt: string; question_en: string }>(qRaw)
  if (!q?.question_pt || !q?.question_en) { console.error('Falha ao gerar a pergunta.', qRaw.slice(0, 200)); process.exit(1) }
  const questionPt = stripEmDash(q.question_pt.trim())
  const questionEn = stripEmDash(q.question_en.trim())
  console.log('\nPergunta (PT):', questionPt)

  // ── PASSO B: Advisor via interna responde (audit) ─────────────────────────
  const advisorSystem = `You are the TAIME Executive Advisor, a senior strategic technology intelligence advisor speaking to a C-level reader. Answer the question grounded ONLY in the TREND material provided this turn. Deliver the strategic read and the recommended move, business implication before technical detail, make the cost of inaction explicit and name a decision window. 200 to 320 words, flowing executive prose.

${HARD_RULES}`
  const advisorResponse = stripEmDash((await callModel({
    model: ADVISOR_MODEL, maxTokens: 5120, step: 'advisor', trendId: trend.id, period,
    system: advisorSystem, user: `${trendBlock}\n\nQUESTION:\n${questionEn}`,
  })).trim())
  if (!advisorResponse) { console.error('Advisor nao respondeu.'); process.exit(1) }

  // ── PASSO C: dois corpos de post, PT nativo e EN nativo ────────────────────
  const composeSystem = `You turn a strategic advisor answer into the BODY of a LinkedIn post, written NATIVELY in two languages (the EN body is NOT a translation of the PT body). For EACH language: 3 to 5 SHORT paragraphs (one to two sentences each), condensing the advisor read for a busy C-level reader, business implication first, cost of inaction explicit, decision window named. Do NOT include the intro line, the closing line, hashtags or the question: only the body paragraphs, separated by a blank line.

Return EXACTLY this structure and nothing else (no preamble, no code fences):
<<<PT>>>
[the Portuguese body paragraphs]
<<<EN>>>
[the English body paragraphs]
<<<END>>>

${HARD_RULES}`
  const composeRaw = await callModel({
    model: ADVISOR_MODEL, maxTokens: 3072, step: 'compose', trendId: trend.id, period,
    system: composeSystem,
    user: `TREND THEME: ${titleEn} (${trend.category ?? 'technology'})\n\nADVISOR ANSWER TO CONDENSE:\n${advisorResponse}`,
  })
  const between = (raw: string, a: string, b: string): string => {
    const i = raw.indexOf(a); const j = raw.indexOf(b, i + a.length)
    return (i < 0 || j < 0) ? '' : raw.slice(i + a.length, j).trim()
  }
  const bodies = {
    body_pt: between(composeRaw, '<<<PT>>>', '<<<EN>>>'),
    body_en: between(composeRaw, '<<<EN>>>', '<<<END>>>'),
  }
  if (!bodies.body_pt || !bodies.body_en) { console.error('Falha ao compor os corpos.', composeRaw.slice(0, 200)); process.exit(1) }

  // ── Montagem final (partes fixas deterministicas) + stripEmDash ───────────
  const tag = themeHashtag(trend.category, trend.theme_slug)
  const hashtags = `#ITLeadership #StrategicForesight #TAIME ${tag}`
  const bodyPt = stripEmDash(bodies.body_pt.trim())
  const bodyEn = stripEmDash(bodies.body_en.trim())

  const postPt = stripEmDash(
`Perguntamos ao Executive Advisor do TAIME:

"${questionPt}"

${bodyPt}

Você pode fazer a sua pergunta, grátis e sem cadastro: ${SITE}

${hashtags}`)

  const postEn = stripEmDash(
`We asked the TAIME Executive Advisor:

"${questionEn}"

${bodyEn}

You can ask your own, free and no sign up: ${SITE}

${hashtags}`)

  // ── Grava em marketing_posts (draft) ──────────────────────────────────────
  const record = {
    period, trend_id: trend.id, trend_title: titlePt,
    question: questionPt, advisor_response: advisorResponse,
    post_pt: postPt, post_en: postEn, status: 'draft',
  }
  const ins = await rest('marketing_posts', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) })
  if (ins.status >= 200 && ins.status < 300) {
    console.log('\nGravado em marketing_posts (draft). id:', (ins.data as Array<{ id: string }>)?.[0]?.id)
  } else {
    console.error(`\n[!] Falha ao gravar em marketing_posts (status ${ins.status}).`)
    console.error('    Se a tabela nao existe, rode taime-web/add-marketing-posts.sql no SQL editor do Supabase.')
    console.error('    Resposta:', JSON.stringify(ins.data).slice(0, 300))
  }

  // ── Saida para inspecao ────────────────────────────────────────────────────
  console.log('\n================= POST PT =================\n' + postPt)
  console.log('\n================= POST EN =================\n' + postEn)

  // Validacao das regras (relatorio)
  const both = postPt + '\n' + postEn
  const emDash = /\u2014/.test(both)
  const money = /(R\$|US\$|\$|€|£|\bBRL\b|\bUSD\b|\bEUR\b)\s?\d|\d+\s?(reais|d[oó]lares|euros)/i.test(both)
  const FIRMS = ['gartner','mckinsey','forrester','idc','deloitte','accenture','bcg','kpmg','pwc','\\bey\\b','bain','cb insights','pitchbook','omdia','bloomberg','reuters','statista','morningstar','morgan stanley','goldman']
  const firm = new RegExp(FIRMS.join('|'), 'i').test(both)
  console.log('\n================= VALIDACAO =================')
  console.log('  travessao (U+2014):', emDash ? 'FALHOU' : 'ok (zero)')
  console.log('  valor monetario   :', money ? 'FALHOU' : 'ok (zero)')
  console.log('  nome de firma     :', firm ? 'FALHOU' : 'ok (zero)')
  if (emDash || money || firm) { console.error('\nRegras violadas.'); process.exit(1) }
  console.log('\nOK: rascunho gerado dentro das regras.')
}

main().catch(e => { console.error(e); process.exit(1) })
