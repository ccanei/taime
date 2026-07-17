import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createSupabaseService } from '@/lib/supabase-server'
import { getAdvisorPeriodFloor, ADVISOR_PERMISSIVE_CEILING } from '@/lib/plan'
import { embedQuery } from '@/lib/embeddings'

// ── Advisor ANONIMO (/ask): 3 perguntas sem login, mesmo modelo do produto ──
// Caminho SEPARADO do /api/advisor/chat: sem user_id, sem memoria de sessao, sem
// advisor_usage. Protecao: cookie assinado (3 perguntas/visitante) + teto horario
// por IP (ip_hash) + captcha Turnstile na 1a pergunta. O anonimo recebe CONSELHO
// sintetizado, NUNCA conteudo bruto do arquivo (titulos, links, trechos citaveis,
// periodos). Isso protege o conteudo pago contra scraping.

export const maxDuration = 60

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
// Mesmo modelo do Advisor logado, para o anonimo experimentar a qualidade real.
const ADVISOR_MODEL = 'claude-sonnet-5'
const ROUTER_MODEL  = 'claude-haiku-4-5'

// Limites
const ANON_QUESTION_LIMIT = 3       // por visitante (cookie assinado, persistente 1 ano)
const IP_HOURLY_CAP        = 8       // por ip_hash, janela deslizante de 1h (anti-rajada)
const IP_MONTHLY_CAP       = 12      // por ip_hash, janela de 30 dias (teto acumulado).
                                     // Alto de proposito: CGNAT das operadoras moveis BR
                                     // poe muitos usuarios legitimos atras do mesmo IP.
const COOKIE_NAME          = 'taime_ask'
const VECTOR_MATCH_COUNT   = 16

type Lang = 'pt' | 'en'
type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

interface TrendChunk {
  trend_id:   string
  report_id:  string
  period:     string
  rank:       number
  lang:       'pt' | 'en'
  theme_slug: string | null
  category:   string | null
  content:    string
  similarity: number
}

// ── System prompt ANONIMO ────────────────────────────────────────────────────
// Deriva do DNA v5.1 (postura de partner, disciplina editorial, grounding) MAS:
// - sem regras de linking e sem citar periodo/titulo de report;
// - proibicao explicita de expor o arquivo (o anonimo recebe conselho, nao fonte).
// max_tokens cobre thinking + texto no Sonnet 5, entao mantemos os mesmos valores
// do Advisor logado (5120/8192) para nao truncar.
const ANON_RULES_BLOCK = `You are the TAIME Executive Advisor, a senior strategic technology intelligence partner, answering a visitor who is trying the advisor without an account.

WHAT YOU DELIVER: strategic ADVICE synthesized from TAIME's intelligence, in your own voice. The visitor gets your read and your recommended move, not the underlying archive.

SOURCE PROTECTION (non-negotiable, this surface is public):
- NEVER reveal, name, quote, or link any specific TAIME report, period, title, trend name, score, or passage. Do not say "the report from [period]", do not cite dates of origin, do not reproduce archive text, do not output any URL or markdown link. The archive itself is exclusive to subscribers.
- Use the intelligence provided this turn ONLY as your own knowledge to reason with. Synthesize; never expose it. If asked for the raw report, the sources, or a citation, say plainly that the full archive with sources is available to subscribers, and give the strategic read instead.

EDITORIAL RULES (no exception):
- Never attribute any data or conclusion to a named research firm, consultancy, analyst house, outlet or vendor. Refer to sources by category only.
- No monetary values, prices, subscription tiers, or invented percentages and timelines. Speak qualitatively when you lack backing.
- Never use the em dash character. Use a comma, a colon, or a period.
- Refer to tools and vendors by CATEGORY and selection criteria, not by product name, unless it is a plain market fact.

POSTURE (what makes you an advisor, not a summarizer):
- Take an owned position in the first person, deliver a clear verdict, and land on what it means for the visitor's decision.
- Cross the tension when two forces pull apart (adoption speed versus governance, consolidation versus resilience). Surface the risk or opportunity the question did not touch. Challenge a weak premise with respect and invite disagreement.
- Partner mode: state your thesis with conviction, then press one or two sharp questions that make the visitor test it. Treat the visitor as a capable peer, never professorial, never condescending.
- Two layers woven together: where they are now and the concrete next move, plus the short, medium and long horizon it sets up.

VOICE AND FORMAT:
- Brevity by default: 200 to 400 words, dense not verbose. Flowing partner prose, not a report with a bold header over every line. A table only to compare 3 or more items, never decoratively. Minimal emojis.
- Depth is tight sentences, not extra paragraphs.
- Your reply renders as markdown. Use light structure in moderation: bold the one or two key concepts, a short list only when you genuinely enumerate, small emphasis where it helps the eye. Never turn the answer into a formatted report; flowing prose is the default. Structure is seasoning, not the dish.

MARKET MOVEMENTS (how players are moving):
When the question touches the impact on the visitor's business or sector, and the intelligence provided this turn supports it, weave in how market players are moving on the theme: companies as ACTORS of documented facts ("X launched", "Y went to production"). Inviolable limits, no exception: (a) never invent a movement not supported by the intelligence this turn; (b) a company may appear only as the SUBJECT of a market fact, never as a SOURCE or authority ("according to X" stays forbidden); (c) keep SOURCE PROTECTION intact, present the movement as a market fact in your own voice, never as "the report from [period] says", never revealing a report, period or trend name; (d) you do NOT know the visitor's specific competitors and never claim to. If they ask about "my competitors", clarify you bring documented market movements, not intelligence about their specific company, then give what you have.

HUMAN HANDOFF:
If the visitor asks to talk to a person, a human, the team, a founder, sales or support, acknowledge it naturally and directly. Be upfront that you are an AI assistant, not a person, and point them to the TAIME team at contact@taime.tech for direct contact. Do not pretend to be human, do not deflect the request, do not push to keep the conversation going. Keep it brief, a single reply. If they then continue with a normal question, carry on as usual.

CONTEXT: You have no profile and no prior conversation with this visitor. Do not manufacture continuity, never say "as we discussed" or "last time". Read whatever context the visitor reveals in their message and put it to work immediately. Never ask for revenue, budget or financials. Answer with the value you can give even when context is thin.

NEVER say "As an AI" or "I cannot". You are an advisor with context and opinions.`

// Bloco de inteligencia interna: SO o texto da trend, sem period/report_id/url.
// Rotulado como conhecimento interno que nao pode ser exposto.
function buildAnonContextBlock(chunks: TrendChunk[]): string {
  if (chunks.length === 0) {
    return 'INTERNAL INTELLIGENCE FOR THIS TURN: none. Answer from general strategic principles, flagged as such, and offer that a subscriber account unlocks the full archive.'
  }
  const body = chunks.map(c => `- ${c.content.replace(/\s+/g, ' ').trim()}`).join('\n')
  return `INTERNAL INTELLIGENCE FOR THIS TURN (your own knowledge to reason with; NEVER quote it, name a period, reveal a report exists, or output a link):\n${body}`
}

function detectLanguage(text: string): Lang {
  const t = text.toLowerCase()
  if (/[ãõçáàâéêíóôúäü]/.test(t)) return 'pt'
  const ptHits = (t.match(/\b(voce|nao|esta|que|qual|como|para|com|empresa|estrategia|posso|quero|fazer|sobre|isso|porque)\b/g) ?? []).length
  const enHits = (t.match(/\b(the|what|how|should|company|strategy|can|want|please|which|with|about|this|why|do|does)\b/g) ?? []).length
  return ptHits > enHits ? 'pt' : 'en'
}

function pickMaxTokens(message: string): number {
  const m = message.toLowerCase()
  const heavy = /(plano|plan\b|roadmap|detalh|detail|completo|complete|aprofund|deep dive|passo a passo|step by step|estrat[ée]gia detalhada|breakdown)/.test(m)
  return heavy ? 8192 : 5120
}

function languageInstruction(lang: Lang): string {
  return lang === 'pt'
    ? 'CRITICO: Responda SEMPRE em portugues.'
    : 'CRITICAL: ALWAYS respond in English.'
}

// ── Cookie assinado (HMAC): conta perguntas do visitante ─────────────────────
function cookieSecret(): string {
  return process.env.ANON_ASK_COOKIE_SECRET
    ?? process.env.CRON_SECRET
    ?? process.env.SUPABASE_SERVICE_KEY
    ?? 'taime-ask-fallback'
}
function signCount(count: number): string {
  const payload = String(count)
  const sig = crypto.createHmac('sha256', cookieSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}
function readCount(raw: string | undefined): number {
  if (!raw) return 0
  const dot = raw.lastIndexOf('.')
  if (dot < 0) return 0
  const payload = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expected = crypto.createHmac('sha256', cookieSecret()).update(payload).digest('base64url')
  if (sig.length !== expected.length) return 0
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  if (!ok) return 0
  const n = parseInt(payload, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// ── IP: hash (nunca o IP cru) ────────────────────────────────────────────────
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  const first = fwd.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}
function hashIp(ip: string): string {
  return crypto.createHmac('sha256', cookieSecret()).update(ip).digest('hex')
}

// ── Turnstile (server-side) ──────────────────────────────────────────────────
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return false
  try {
    const body = new URLSearchParams()
    body.set('secret', secret)
    body.set('response', token)
    if (ip && ip !== 'unknown') body.set('remoteip', ip)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body,
    })
    if (!res.ok) return false
    const json = await res.json() as { success?: boolean }
    return json.success === true
  } catch {
    return false
  }
}

// ── Refinador de chunks (Haiku), igual ao Advisor logado ────────────────────
const CHUNK_REFINER_INSTRUCTIONS = `You are a context refiner for a strategic advisor. You receive a user message and a list of candidate intelligence chunks retrieved by semantic search. Select and order up to 8 chunks that best answer the message. Prefer sharp relevance over volume. Respond with PURE JSON only: {"selected":[<indexes>]}. Indexes must exist in the candidate list.`

async function refineChunks(message: string, chunks: TrendChunk[]): Promise<TrendChunk[]> {
  try {
    const list = chunks.map((c, i) => `[${i}] ${c.content.replace(/\s+/g, ' ').slice(0, 320)}`).join('\n---\n')
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      ROUTER_MODEL,
        max_tokens: 256,
        system:     [{ type: 'text', text: CHUNK_REFINER_INSTRUCTIONS }],
        messages:   [{ role: 'user', content: `USER MESSAGE:\n${message}\n\nCANDIDATE CHUNKS:\n${list}` }],
      }),
    })
    if (!res.ok) return chunks.slice(0, 8)
    const data = await res.json() as { content?: Array<{ text?: string }> }
    const raw  = data.content?.[0]?.text ?? ''
    const json = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(json) as { selected?: unknown }
    if (!Array.isArray(parsed.selected)) return chunks.slice(0, 8)
    const seen = new Set<number>()
    const out: TrendChunk[] = []
    for (const idx of parsed.selected) {
      if (typeof idx === 'number' && idx >= 0 && idx < chunks.length && !seen.has(idx)) {
        seen.add(idx); out.push(chunks[idx])
      }
      if (out.length >= 8) break
    }
    return out.length > 0 ? out : chunks.slice(0, 8)
  } catch {
    return chunks.slice(0, 8)
  }
}

// Dedup: mesma trend volta como pt e en; mantem uma, preferindo o idioma da pergunta.
function dedupeChunks(chunks: TrendChunk[], preferLang: Lang): TrendChunk[] {
  const byTrend = new Map<string, TrendChunk>()
  for (const c of chunks) {
    const cur = byTrend.get(c.trend_id)
    if (!cur) { byTrend.set(c.trend_id, c); continue }
    const curPref = cur.lang === preferLang
    const newPref = c.lang === preferLang
    if (newPref && !curPref) byTrend.set(c.trend_id, c)
    else if (newPref === curPref && c.similarity > cur.similarity) byTrend.set(c.trend_id, c)
  }
  return [...byTrend.values()].sort((a, b) => b.similarity - a.similarity)
}

function cookieHeader(count: number): string {
  const val = signCount(count)
  // 1 ano; httpOnly; SameSite Lax; Secure em producao.
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE_NAME}=${val}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`
}

export async function POST(req: NextRequest) {
  // ── TRAVA DE PRODUCAO: sem Turnstile configurado, o endpoint NAO abre ───────
  if (!process.env.TURNSTILE_SECRET_KEY) {
    return NextResponse.json({ error: 'ask_unavailable' }, { status: 503 })
  }

  let body: { message?: string; token?: string }
  try {
    body = await req.json() as { message?: string; token?: string }
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const message = (body.message ?? '').trim()
  if (!message) {
    return NextResponse.json({ error: 'message_required' }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: 'message_too_long' }, { status: 400 })
  }

  // ── Limite por visitante (cookie assinado) ─────────────────────────────────
  const used = readCount(req.cookies.get(COOKIE_NAME)?.value)
  if (used >= ANON_QUESTION_LIMIT) {
    return NextResponse.json(
      { error: 'limit_reached', used, limit: ANON_QUESTION_LIMIT },
      { status: 403 },
    )
  }

  const ip = clientIp(req)
  const ipHash = hashIp(ip)

  // ── Captcha na 1a pergunta (cookie novo = used 0) ──────────────────────────
  if (used === 0) {
    const token = (body.token ?? '').trim()
    if (!token) {
      return NextResponse.json({ error: 'captcha_required' }, { status: 403 })
    }
    const okCaptcha = await verifyTurnstile(token, ip)
    if (!okCaptcha) {
      return NextResponse.json({ error: 'captcha_failed' }, { status: 403 })
    }
  }

  // ── Teto por IP (atomico): 8/h anti-rajada + 12/30d acumulado ──────────────
  // Duas janelas na mesma funcao SQL (SELECT ... FOR UPDATE). O teto de 30 dias e
  // o que impede o reset infinito quando o visitante limpa o cookie ou usa aba
  // anonima: o cookie some, mas o ip_hash continua contando ate 12 no mes.
  const service = createSupabaseService()
  try {
    const { data, error } = await service.rpc('anon_advisor_consume', {
      p_ip_hash:     ipHash,
      p_hourly_cap:  IP_HOURLY_CAP,
      p_monthly_cap: IP_MONTHLY_CAP,
    })
    if (!error) {
      const row = (Array.isArray(data) ? data[0] : data) as
        { allowed?: boolean; month_used?: number; month_cap?: number } | undefined
      if (row && row.allowed === false) {
        // Distingue o teto de 30 dias (bloqueio persistente, CTA de cadastro) do
        // teto horario (transitorio, "aguarde alguns minutos").
        const monthly = (row.month_used ?? 0) >= (row.month_cap ?? IP_MONTHLY_CAP)
        return NextResponse.json(
          { error: monthly ? 'ip_month_limit' : 'ip_limit' },
          { status: 429 },
        )
      }
    }
    // Se a RPC nao existir ainda (migration nao aplicada), o error do PostgREST e
    // ignorado e o cookie continua limitando a 3. Os tetos de IP so entram quando
    // a migration (colunas month_* + funcao de 3 args) estiver aplicada.
  } catch {
    // fail-open no teto de IP: o cookie ainda limita a 3.
  }

  // ── Geracao: vector search (60 meses) + refino + Sonnet 5, SEM fontes ───────
  const lang = detectLanguage(message)
  const periodFloor = getAdvisorPeriodFloor('free') // janela de 60 meses (5 anos)

  let chunks: TrendChunk[] = []
  const emb = await embedQuery(message)
  if (emb.ok) {
    try {
      const { data } = await service.rpc('match_trend_chunks', {
        query_embedding: emb.vector,
        period_floor:    periodFloor,
        match_count:     VECTOR_MATCH_COUNT,
        period_ceiling:  ADVISOR_PERMISSIVE_CEILING,
      })
      chunks = (data ?? []) as TrendChunk[]
    } catch { /* sem chunks: cai no fallback de principios gerais */ }
  }

  const deduped  = chunks.length > 0 ? dedupeChunks(chunks, lang) : []
  const selected = deduped.length > 0 ? await refineChunks(message, deduped) : []

  const system: SystemBlock[] = [
    { type: 'text', text: ANON_RULES_BLOCK,               cache_control: { type: 'ephemeral' } },
    { type: 'text', text: buildAnonContextBlock(selected) },
    { type: 'text', text: languageInstruction(lang) },
  ]

  let reply = ''
  let inputTokens = 0
  let outputTokens = 0
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model:      ADVISOR_MODEL,
        max_tokens: pickMaxTokens(message),
        system,
        messages:   [{ role: 'user', content: message }],
      }),
    })
    if (!res.ok) {
      console.error('[ask] anthropic error:', res.status, await res.text())
      return NextResponse.json({ error: 'ai_error' }, { status: 502 })
    }
    const data = await res.json() as {
      content?: Array<{ type: string; text: string }>
      usage?:   { input_tokens?: number; output_tokens?: number }
    }
    reply = data.content?.find(b => b.type === 'text')?.text ?? ''
    inputTokens  = data.usage?.input_tokens  ?? 0
    outputTokens = data.usage?.output_tokens ?? 0
  } catch (e) {
    console.error('[ask] anthropic exception:', e)
    return NextResponse.json({ error: 'ai_error' }, { status: 502 })
  }

  if (!reply.trim()) {
    return NextResponse.json({ error: 'ai_error' }, { status: 502 })
  }

  // ── Telemetria de usage por resposta (fail-silent) ─────────────────────────
  // Grava SO ip_hash + tokens + modelo (nunca IP cru nem conteudo). Alimenta o
  // painel /admin/engagement. Se a tabela ainda nao existir (migration nao
  // aplicada) ou a gravacao falhar, NAO quebra a resposta ao visitante.
  try {
    await service.from('anon_advisor_log').insert({
      ip_hash:       ipHash,
      model:         ADVISOR_MODEL,
      input_tokens:  inputTokens,
      output_tokens: outputTokens,
    })
  } catch (e) {
    console.error('[ask] usage log failed (ignored):', e)
  }

  // ── Sucesso: incrementa o cookie do visitante ──────────────────────────────
  const nowUsed = used + 1
  return NextResponse.json(
    { reply, used: nowUsed, limit: ANON_QUESTION_LIMIT },
    { status: 200, headers: { 'Set-Cookie': cookieHeader(nowUsed) } },
  )
}
