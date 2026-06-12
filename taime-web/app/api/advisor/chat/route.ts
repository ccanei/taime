import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import { detectAttribution } from '@/lib/advisor-grounding'

interface AdvisorProfile {
  company_name:           string | null
  sector:                 string | null
  company_size:           string | null
  annual_revenue:         string | null
  current_infrastructure: string | null
  strategic_objective:    string | null
  maturity_level:         string | null
}

interface MemoryRow {
  role:    string
  content: string
}

interface ReportTrendRow {
  rank:               number
  title_en:           string
  taime_score:        number
  taime_framework_en: { type: string; act: string; impact: string; move: string; exit: string } | null
  then_now_next_en:   { then: string; now: string; next: string } | null
}

interface ReportRow {
  id:                   string
  period:               string
  period_label:         string | null
  title_en:             string
  executive_summary_en: string
  report_trends:        ReportTrendRow[]
}

// Metadados enxutos usados pelo roteador (sem conteúdo completo)
interface CandidateTrend {
  title_en:   string
  category:   string | null
  theme_slug: string | null
}
interface CandidateReport {
  id:            string
  period:        string
  period_label:  string | null
  title_en:      string
  title_pt_br:   string
  report_trends: CandidateTrend[]
}

interface RouterResult {
  report_ids:     string[]
  temporal_scope: 'recent' | 'historical' | 'specific_period'
  language:       'pt' | 'en'
}

interface Usage {
  input_tokens:                number
  output_tokens:               number
  cache_read_input_tokens:     number
  cache_creation_input_tokens: number
}

type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
type Lang = 'pt' | 'en'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL         = 'claude-sonnet-4-6'
const ROUTER_MODEL  = 'claude-haiku-4-5'

function reportLabel(r: { period: string; period_label: string | null }): string {
  return r.period_label?.trim() || r.period
}

function normalizeUsage(u: Partial<Usage> | undefined): Usage {
  return {
    input_tokens:                u?.input_tokens ?? 0,
    output_tokens:               u?.output_tokens ?? 0,
    cache_read_input_tokens:     u?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u?.cache_creation_input_tokens ?? 0,
  }
}

// Heurística leve de idioma (fallback quando o router falha).
function detectLanguage(text: string): Lang {
  const t = text.toLowerCase()
  if (/[ãõçáàâéêíóôúäü]/.test(t)) return 'pt'
  const ptHits = (t.match(/\b(você|voce|não|nao|está|esta|que|qual|como|para|com|empresa|estratégia|relatório|posso|quero|fazer|sobre|isso|porque)\b/g) ?? []).length
  const enHits = (t.match(/\b(the|what|how|should|company|strategy|report|can|want|please|which|with|about|this|why|do|does)\b/g) ?? []).length
  return ptHits > enHits ? 'pt' : 'en'
}

// Heurística leve de max_tokens: respostas curtas por padrão, teto alto só
// quando a mensagem pede plano/detalhe/aprofundamento.
function pickMaxTokens(message: string): number {
  const m = message.toLowerCase()
  const heavy = /(plano|plan\b|roadmap|detalh|detail|completo|complete|aprofund|deep dive|passo a passo|step by step|estrat[ée]gia detalhada|breakdown)/.test(m)
  return heavy ? 4096 : 1536
}

function languageInstruction(lang: Lang): string {
  return lang === 'pt'
    ? 'CRÍTICO: Responda SEMPRE em português, independentemente do idioma das mensagens anteriores desta conversa. Use português mesmo que turnos anteriores tenham sido em inglês.'
    : 'CRITICAL: ALWAYS respond in English, regardless of the language used in previous messages in this conversation. Respond in English even if earlier turns were in Portuguese.'
}

// ── Bloco 1: regras fixas (estável, cacheável) ──────────────────────────────
const RULES_BLOCK = `You are the TAIME Executive Advisor, a senior strategic technology intelligence consultant with access to the client's organizational context and to TAIME's published intelligence reports.

GROUNDING RULES (non-negotiable):

1. NATURE OF CLAIMS. Separate two kinds of statements:
   - From the loaded reports: anything you present as a TAIME finding, pattern, score or datum MUST come from the reports provided in this turn, and you MUST name the period of origin in the sentence (e.g. "the report from [period] documents..."). If it is not in the loaded reports, it is not a TAIME finding.
   - General knowledge: you MAY use general concepts, frameworks and best practices, but flag them as such ("as a general principle...") and NEVER present them as a TAIME finding, archive pattern or report datum.

2. NO INVENTED HISTORICAL PATTERNS. Do not assert what "companies did in [period]" or cite data from periods whose reports are NOT loaded in this turn. The archive spans 25 years, but only the periods provided this turn are in front of you. If the question needs history you do not have loaded, say you can pull it from the archive and ask the client to reframe specifying the period of interest. Never fabricate a trajectory to sound authoritative.

3. SOURCES BY CATEGORY, NEVER BY NAME. Never attribute any data or conclusion to a named research firm, consultancy, outlet or vendor ("according to X", "X documented", "a study by X"). Refer to sources only by category ("market research", "observability vendor documentation", "industry analysts"). Recommending a product or tool by name is allowed, because that is prescription, not attribution.

4. NUMBERS NEED BACKING. State percentages or monetary figures only when they appear in the loaded reports, and reference the period. Without backing, speak qualitatively ("a meaningful reduction") rather than inventing a precise figure.

CONVERSATION RULES:

5. ANSWER ONLY THE LATEST MESSAGE. The conversation history is context, not a queue of pending tasks. Respond exclusively to the user's most recent message. Do not resurrect or re-answer earlier questions that were already addressed.

6. BREVITY BY DEFAULT. Default length is 200 to 400 words: a direct synthesis with the implication for the client's company. Give the full detail of a report only when explicitly asked. When you synthesize, offer to go deeper using the provided links (e.g. "want me to open the [period] report?"). Keep blockquotes and emojis to a minimum. Use a table only when comparing 3 or more items; never decoratively.

LINKING RULES:

7. LINK WHAT YOU CITE. Whenever you mention a report, include a markdown link to it. Whenever you mention a specific trend, link to that trend's anchor. Use ONLY the URLs provided in the intelligence block for this turn. NEVER construct, guess or invent a URL.

YOUR ROLE:
- Act as a senior strategic advisor who knows this client's context and the loaded TAIME intelligence.
- Apply the TAIME framework (TYPE, ACT, IMPACT, MOVE, EXIT) when structuring recommendations.
- Be direct, executive and action-oriented, not generic.
- If the client describes a plan, evaluate it against the loaded reports and flag risks proactively.
- Always end with a concrete next action or question.

COMMUNICATION STYLE:
- Tone: senior consultant, not chatbot. Direct, confident, specific.
- Format: use markdown (headings, bold, lists) when it improves clarity.
- Never say "As an AI" or "I cannot". You are an advisor with context and opinions.
- Use the client's company name and sector when making specific recommendations.`

function buildProfileBlock(profile: AdvisorProfile | null): string {
  if (!profile) return 'CLIENT PROFILE: Not configured yet.'
  return `CLIENT PROFILE:
Company: ${profile.company_name ?? 'Not specified'}
Sector: ${profile.sector ?? 'Not specified'}
Size: ${profile.company_size ?? 'Not specified'}
Annual revenue: ${profile.annual_revenue ?? 'Not specified'}
Infrastructure: ${profile.current_infrastructure ?? 'Not described'}
Strategic objective: ${profile.strategic_objective ?? 'Not specified'}
Technology maturity: ${profile.maturity_level ?? 'Not specified'}`
}

function buildReportsBlock(reports: ReportRow[]): string {
  if (reports.length === 0) {
    return 'TAIME INTELLIGENCE LOADED FOR THIS TURN: none.'
  }

  const periods = reports.map(reportLabel)
  const body = reports.map(r => {
    const label  = reportLabel(r)
    const url    = `/reports/${r.id}`
    const trends = [...r.report_trends]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3)
      .map(t => {
        const fw = t.taime_framework_en
        const tn = t.then_now_next_en
        const trendUrl = `${url}#trend-${t.rank}`
        return [
          `  Trend: ${t.title_en} (Score: ${t.taime_score}/100) [URL: ${trendUrl}]`,
          fw ? `  Framework: Type ${fw.type} | Act ${fw.act} | Move ${fw.move}` : '',
          tn ? `  Now: ${tn.now}` : '',
          tn ? `  Next: ${tn.next}` : '',
        ].filter(Boolean).join('\n')
      }).join('\n\n')
    return `Report [${label}] [URL: ${url}]: ${r.title_en}\nSummary: ${r.executive_summary_en}\n\nTop Trends:\n${trends}`
  }).join('\n\n---\n\n')

  return `TAIME INTELLIGENCE LOADED FOR THIS TURN (periods: ${periods.join(', ')}):
Use only the URLs below when linking. Do not invent URLs.

${body}`
}

// ── Roteador de contexto (Haiku) ────────────────────────────────────────────
// Seleciona até 3 relatórios relevantes a partir de metadados enxutos.
// Retorna result=null em qualquer falha (parse, rede, vazio) para acionar fallback.
const ROUTER_INSTRUCTIONS = `You are a context router for a strategic advisor. Given a user message and a catalog of available intelligence reports (metadata only), select up to 3 reports whose content is most relevant to answer the message. Prefer fewer, sharper selections over many loose ones.

Respond with PURE JSON only, no markdown, no prose, in exactly this shape:
{"report_ids":["..."],"temporal_scope":"recent|historical|specific_period","language":"pt|en"}

Rules:
- report_ids must be ids that exist in the catalog. Up to 3. Use [] if none clearly apply.
- temporal_scope: "recent" if the message is about the current moment; "historical" if it asks about the past or trajectory; "specific_period" if it names a period.
- language: detect from the user message.`

function buildCatalog(candidates: CandidateReport[]): string {
  return candidates.map(c => {
    const trends = c.report_trends.slice(0, 6)
    const titles = trends.map(t => t.title_en).filter(Boolean).join('; ')
    const cats   = [...new Set(trends.map(t => t.category).filter(Boolean))].join(', ')
    const themes = [...new Set(trends.map(t => t.theme_slug).filter(Boolean))].join(', ')
    return `id: ${c.id}\nperiod: ${reportLabel(c)}\ntitle: ${c.title_en} / ${c.title_pt_br}\ntrends: ${titles}\ncategories: ${cats}\nthemes: ${themes}`
  }).join('\n---\n')
}

async function routeContext(
  message: string,
  candidates: CandidateReport[],
): Promise<{ result: RouterResult | null; usage: Usage | null }> {
  if (candidates.length === 0) return { result: null, usage: null }

  const routerSystem: SystemBlock[] = [
    { type: 'text', text: ROUTER_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `AVAILABLE REPORTS (metadata):\n${buildCatalog(candidates)}`, cache_control: { type: 'ephemeral' } },
  ]

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version':    '2023-06-01',
        'anthropic-beta':       'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model:      ROUTER_MODEL,
        max_tokens: 256,
        system:     routerSystem,
        messages:   [{ role: 'user', content: `USER MESSAGE:\n${message}` }],
      }),
    })

    if (!res.ok) {
      console.error('[advisor-router] non-ok:', await res.text())
      return { result: null, usage: null }
    }

    const data = await res.json() as {
      content: Array<{ type: string; text: string }>
      usage?: Partial<Usage>
    }
    const usage = normalizeUsage(data.usage)
    const raw   = data.content.find(b => b.type === 'text')?.text?.trim() ?? ''

    // Tolerante a cercas de código acidentais
    const jsonStr = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed  = JSON.parse(jsonStr) as Partial<RouterResult>

    if (!Array.isArray(parsed.report_ids)) return { result: null, usage }
    return {
      result: {
        report_ids:     parsed.report_ids.filter(x => typeof x === 'string'),
        temporal_scope: parsed.temporal_scope ?? 'recent',
        language:       parsed.language === 'pt' || parsed.language === 'en' ? parsed.language : 'en',
      },
      usage,
    }
  } catch (e) {
    console.error('[advisor-router] error:', e)
    return { result: null, usage: null }
  }
}

// ── Chamada principal (Sonnet) ──────────────────────────────────────────────
async function callMain(
  system: SystemBlock[],
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens: number,
): Promise<{ ok: boolean; reply: string; stopReason: string | null; usage: Usage | null; errText?: string }> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  })

  if (!res.ok) {
    return { ok: false, reply: '', stopReason: null, usage: null, errText: await res.text() }
  }

  const data = await res.json() as {
    content:      Array<{ type: string; text: string }>
    stop_reason?: string
    usage?:       Partial<Usage>
  }
  const reply = data.content.find(b => b.type === 'text')?.text ?? ''
  return { ok: true, reply, stopReason: data.stop_reason ?? null, usage: normalizeUsage(data.usage) }
}

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Gate de plano: hoje só Strategic. Essential entra com limite de mensagens
  // numa fase futura (ajustar em lib/plan.ts quando os limites existirem).
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) {
    return NextResponse.json(
      { error: 'Advisor available on Strategic plan only' },
      { status: 403 },
    )
  }

  let body: { message: string; sessionId: string }
  try {
    body = await req.json() as { message: string; sessionId: string }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { message, sessionId } = body
  if (!message?.trim() || !sessionId) {
    return NextResponse.json({ error: 'message and sessionId are required' }, { status: 400 })
  }

  const userMessage = message.trim()
  const service     = createSupabaseService()

  // ── Load advisor profile ──────────────────────────────────────────────────
  const { data: profileData } = await service
    .from('advisor_profiles')
    .select('company_name,sector,company_size,annual_revenue,current_infrastructure,strategic_objective,maturity_level')
    .eq('user_id', user.id)
    .maybeSingle()

  const profile = profileData as AdvisorProfile | null

  // ── Load conversation history (last 20 messages) ──────────────────────────
  const { data: historyData } = await service
    .from('advisory_memory')
    .select('role, content')
    .eq('user_id', user.id)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(20)

  const history = (historyData ?? []) as MemoryRow[]

  // ── Catálogo enxuto p/ o roteador (sem conteúdo completo) ──────────────────
  const { data: candidateData } = await service
    .from('reports')
    .select('id, period, period_label, title_en, title_pt_br, report_trends(title_en, category, theme_slug)')
    .eq('status', 'published')
    .order('period', { ascending: false })
    .limit(50)

  const candidates   = (candidateData ?? []) as CandidateReport[]
  const candidateIds = new Set(candidates.map(c => c.id))
  const mostRecentId = candidates[0]?.id

  // ── Roteamento: Haiku escolhe; fallback = 3 mais recentes ──────────────────
  const { result: routed, usage: routerUsage } = await routeContext(userMessage, candidates)
  let selectionSource: 'router' | 'fallback'
  let selectedIds: string[]

  if (routed && routed.report_ids.length > 0) {
    selectedIds = routed.report_ids.filter(id => candidateIds.has(id)).slice(0, 3)
    selectionSource = selectedIds.length > 0 ? 'router' : 'fallback'
  } else {
    selectedIds = []
    selectionSource = 'fallback'
  }

  if (selectionSource === 'fallback') {
    selectedIds = candidates.slice(0, 3).map(c => c.id)
  } else if (mostRecentId && !selectedIds.includes(mostRecentId)) {
    // O mais recente entra sempre, para o Advisor saber "onde estamos".
    selectedIds = [mostRecentId, ...selectedIds].slice(0, 3)
  }

  // ── Carrega conteúdo completo apenas dos selecionados ──────────────────────
  let reports: ReportRow[] = []
  if (selectedIds.length > 0) {
    const { data: reportsData } = await service
      .from('reports')
      .select(`id, period, period_label, title_en, executive_summary_en,
               report_trends(rank, title_en, taime_score, taime_framework_en, then_now_next_en)`)
      .in('id', selectedIds)
      .order('period', { ascending: false })
    reports = (reportsData ?? []) as ReportRow[]
  }

  // ── Idioma da resposta: router primeiro, heurística como fallback ──────────
  const lang: Lang = routed?.language ?? detectLanguage(userMessage)

  // ── System em blocos: regras + perfil + relatórios (cacheáveis) e idioma ───
  const system: SystemBlock[] = [
    { type: 'text', text: RULES_BLOCK,                    cache_control: { type: 'ephemeral' } },
    { type: 'text', text: buildProfileBlock(profile),     cache_control: { type: 'ephemeral' } },
    { type: 'text', text: buildReportsBlock(reports),     cache_control: { type: 'ephemeral' } },
    { type: 'text', text: languageInstruction(lang) }, // dinâmico, fora do cache
  ]

  const conversationMessages = [
    ...history.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ]

  const maxTokens = pickMaxTokens(userMessage)

  // ── Chamada principal ──────────────────────────────────────────────────────
  const first = await callMain(system, conversationMessages, maxTokens)
  if (!first.ok) {
    console.error('Anthropic API error:', first.errText)
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }

  let reply      = first.reply
  let stopReason = first.stopReason
  let mainUsage  = first.usage

  // ── Verificação leve pós-resposta (rede de segurança, não o mecanismo
  //    principal: o grounding real está no system prompt). Regex heurística:
  //    se detectar atribuição a fonte nomeada, UMA retentativa corretiva.
  let attributionFlag = false
  const check = detectAttribution(reply)
  if (check.flagged) {
    const corrective = `Your previous response attributed information to one or more named sources (${check.matches.join(', ')}). This violates the source-confidentiality rule. Rewrite your previous answer keeping the same substance and recommendations, but NEVER name research firms, consultancies, vendors or outlets as the source of any data or claim. Refer to sources only by category (for example "market research" or "observability vendor documentation"). Recommending products by name remains allowed. Return only the rewritten answer.`

    const retry = await callMain(system, [
      ...conversationMessages,
      { role: 'assistant', content: reply },
      { role: 'user', content: corrective },
    ], maxTokens)

    if (retry.ok && retry.reply.trim()) {
      reply      = retry.reply
      stopReason = retry.stopReason
      mainUsage  = retry.usage
      attributionFlag = detectAttribution(reply).flagged
    } else {
      attributionFlag = true
    }
  }

  // ── Anti-truncamento: se a resposta bateu no teto, sinaliza e avisa ────────
  const truncated = stopReason === 'max_tokens'
  if (truncated) {
    const note = lang === 'pt'
      ? 'Resposta resumida por limite de espaço. Quer que eu continue?'
      : 'Response shortened due to space limits. Want me to continue?'
    reply = `${reply}\n\n${note}`
  }

  // ── Persist both messages to advisory_memory ──────────────────────────────
  const contextMeta = {
    report_ids_used:  selectedIds,
    selection_source: selectionSource,
    attribution_flag: attributionFlag,
    truncated,
    language:         lang,
    usage:            mainUsage,
    router_usage:     routerUsage,
    profile_snapshot: profile ? {
      company_name: profile.company_name,
      sector:       profile.sector,
      maturity:     profile.maturity_level,
    } : null,
  }

  await service.from('advisory_memory').insert([
    {
      user_id:          user.id,
      session_id:       sessionId,
      role:             'user',
      content:          userMessage,
      context_metadata: contextMeta,
    },
    {
      user_id:          user.id,
      session_id:       sessionId,
      role:             'assistant',
      content:          reply,
      context_metadata: contextMeta,
    },
  ])

  return NextResponse.json({ reply })
}
