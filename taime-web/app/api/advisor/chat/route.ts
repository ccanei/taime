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

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL         = 'claude-sonnet-4-6'
const ROUTER_MODEL  = 'claude-haiku-4-5'

function reportLabel(r: { period: string; period_label: string | null }): string {
  return r.period_label?.trim() || r.period
}

function buildSystemPrompt(profile: AdvisorProfile | null, reports: ReportRow[]): string {
  const profileSection = profile ? `
CLIENT PROFILE:
Company: ${profile.company_name ?? 'Not specified'}
Sector: ${profile.sector ?? 'Not specified'}
Size: ${profile.company_size ?? 'Not specified'}
Annual revenue: ${profile.annual_revenue ?? 'Not specified'}
Infrastructure: ${profile.current_infrastructure ?? 'Not described'}
Strategic objective: ${profile.strategic_objective ?? 'Not specified'}
Technology maturity: ${profile.maturity_level ?? 'Not specified'}
` : '\nCLIENT PROFILE: Not configured yet.\n'

  const reportsSection = reports.length > 0
    ? reports.map(r => {
        const label = reportLabel(r)
        const trendsText = r.report_trends.slice(0, 3).map(t => {
          const fw = t.taime_framework_en
          const tn = t.then_now_next_en
          return [
            `  Trend: ${t.title_en} (Score: ${t.taime_score}/100)`,
            fw ? `  Framework: Type ${fw.type} | Act ${fw.act} | Move ${fw.move}` : '',
            tn ? `  Now: ${tn.now}` : '',
            tn ? `  Next: ${tn.next}` : '',
          ].filter(Boolean).join('\n')
        }).join('\n\n')
        return `Report [${label}]: ${r.title_en}\nSummary: ${r.executive_summary_en}\n\nTop Trends:\n${trendsText}`
      }).join('\n\n---\n\n')
    : 'No published reports loaded for this turn.'

  const periods = reports.map(reportLabel)
  const loadedPeriods = periods.length > 0 ? periods.join(', ') : 'none'

  return `You are the TAIME Executive Advisor, a senior strategic technology intelligence consultant with access to the client's organizational context and to TAIME's published intelligence reports.

${profileSection}

TAIME INTELLIGENCE LOADED FOR THIS TURN (periods: ${loadedPeriods}):
${reportsSection}

GROUNDING RULES (non-negotiable):

1. NATURE OF CLAIMS. Separate two kinds of statements:
   - From the loaded reports: anything you present as a TAIME finding, pattern, score or datum MUST come from the reports above, and you MUST name the period of origin in the sentence (e.g. "the ${periods[0] ?? 'latest'} report documents..."). If it is not in the loaded reports, it is not a TAIME finding.
   - General knowledge: you MAY use general concepts, frameworks and best practices, but flag them as such ("as a general principle...") and NEVER present them as a TAIME finding, archive pattern or report datum.

2. NO INVENTED HISTORICAL PATTERNS. Do not assert what "companies did in [period]" or cite data from periods whose reports are NOT loaded above. The archive spans 25 years, but only the periods listed above are in front of you right now. If the question needs history you do not have loaded, say you can pull it from the archive and ask the client to reframe specifying the period of interest. Never fabricate a trajectory to sound authoritative.

3. SOURCES BY CATEGORY, NEVER BY NAME. Never attribute any data or conclusion to a named research firm, consultancy, outlet or vendor ("according to X", "X documented", "a study by X"). Refer to sources only by category ("market research", "observability vendor documentation", "industry analysts"). Recommending a product or tool by name is allowed, because that is prescription, not attribution.

4. NUMBERS NEED BACKING. State percentages or monetary figures only when they appear in the loaded reports, and reference the period. Without backing, speak qualitatively ("a meaningful reduction") rather than inventing a precise figure.

YOUR ROLE:
- Act as a senior strategic advisor who knows this client's context and the loaded TAIME intelligence.
- Apply the TAIME framework (TYPE, ACT, IMPACT, MOVE, EXIT) when structuring recommendations.
- Be direct, executive and action-oriented, not generic.
- If the client describes a plan, evaluate it against the loaded reports and flag risks proactively.
- Always end with a concrete next action or question.

COMMUNICATION STYLE:
- Language: detect from the client message and respond in the same language (PT or EN).
- Tone: senior consultant, not chatbot. Direct, confident, specific.
- Format: use markdown (headings, bold, lists, tables) when it improves clarity.
- Length: concise but complete. No filler.
- Never say "As an AI" or "I cannot". You are an advisor with context and opinions.
- Use the client's company name and sector when making specific recommendations.`
}

// ── Roteador de contexto (Haiku) ────────────────────────────────────────────
// Seleciona até 3 relatórios relevantes a partir de metadados enxutos.
// Retorna null em qualquer falha (parse, rede, vazio) para acionar fallback.
async function routeContext(
  message: string,
  candidates: CandidateReport[],
): Promise<RouterResult | null> {
  if (candidates.length === 0) return null

  const catalog = candidates.map(c => {
    const trends = c.report_trends.slice(0, 6)
    const titles = trends.map(t => t.title_en).filter(Boolean).join('; ')
    const cats   = [...new Set(trends.map(t => t.category).filter(Boolean))].join(', ')
    const themes = [...new Set(trends.map(t => t.theme_slug).filter(Boolean))].join(', ')
    return `id: ${c.id}\nperiod: ${reportLabel(c)}\ntitle: ${c.title_en} / ${c.title_pt_br}\ntrends: ${titles}\ncategories: ${cats}\nthemes: ${themes}`
  }).join('\n---\n')

  const routerSystem = `You are a context router for a strategic advisor. Given a user message and a catalog of available intelligence reports (metadata only), select up to 3 reports whose content is most relevant to answer the message. Prefer fewer, sharper selections over many loose ones.

Respond with PURE JSON only, no markdown, no prose, in exactly this shape:
{"report_ids":["..."],"temporal_scope":"recent|historical|specific_period","language":"pt|en"}

Rules:
- report_ids must be ids that exist in the catalog. Up to 3. Use [] if none clearly apply.
- temporal_scope: "recent" if the message is about the current moment; "historical" if it asks about the past/trajectory; "specific_period" if it names a period.
- language: detect from the user message.`

  const routerUser = `USER MESSAGE:\n${message}\n\nAVAILABLE REPORTS (metadata):\n${catalog}`

  try {
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
        system:     routerSystem,
        messages:   [{ role: 'user', content: routerUser }],
      }),
    })

    if (!res.ok) {
      console.error('[advisor-router] non-ok:', await res.text())
      return null
    }

    const data = await res.json() as { content: Array<{ type: string; text: string }> }
    const raw  = data.content.find(b => b.type === 'text')?.text?.trim() ?? ''

    // Tolerante a cercas de código acidentais
    const jsonStr = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed  = JSON.parse(jsonStr) as Partial<RouterResult>

    if (!Array.isArray(parsed.report_ids)) return null
    return {
      report_ids:     parsed.report_ids.filter(x => typeof x === 'string'),
      temporal_scope: parsed.temporal_scope ?? 'recent',
      language:       parsed.language ?? 'en',
    }
  } catch (e) {
    console.error('[advisor-router] error:', e)
    return null
  }
}

// ── Chamada principal (Sonnet) ──────────────────────────────────────────────
async function callMain(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<{ ok: boolean; reply: string; errText?: string }> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      system:     systemPrompt,
      messages,
    }),
  })

  if (!res.ok) {
    return { ok: false, reply: '', errText: await res.text() }
  }

  const data  = await res.json() as { content: Array<{ type: string; text: string }> }
  const reply = data.content.find(b => b.type === 'text')?.text ?? ''
  return { ok: true, reply }
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

  const service = createSupabaseService()

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

  const candidates = (candidateData ?? []) as CandidateReport[]
  const candidateIds = new Set(candidates.map(c => c.id))
  const mostRecentId = candidates[0]?.id

  // ── Roteamento: Haiku escolhe; fallback = 3 mais recentes ──────────────────
  const routed = await routeContext(message.trim(), candidates)
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
               report_trends(title_en, taime_score, taime_framework_en, then_now_next_en)`)
      .in('id', selectedIds)
      .order('period', { ascending: false })
    reports = (reportsData ?? []) as ReportRow[]
  }

  // ── Build messages for Claude ─────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(profile, reports)

  const conversationMessages = [
    ...history.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message.trim() },
  ]

  // ── Chamada principal ──────────────────────────────────────────────────────
  const first = await callMain(systemPrompt, conversationMessages)
  if (!first.ok) {
    console.error('Anthropic API error:', first.errText)
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }

  let reply = first.reply

  // ── Verificação leve pós-resposta (rede de segurança, não o mecanismo
  //    principal: o grounding real está no system prompt). Regex heurística:
  //    se detectar atribuição a fonte nomeada, UMA retentativa corretiva.
  let attributionFlag = false
  const check = detectAttribution(reply)
  if (check.flagged) {
    const corrective = `Your previous response attributed information to one or more named sources (${check.matches.join(', ')}). This violates the source-confidentiality rule. Rewrite your previous answer keeping the same substance and recommendations, but NEVER name research firms, consultancies, vendors or outlets as the source of any data or claim. Refer to sources only by category (for example "market research" or "observability vendor documentation"). Recommending products by name remains allowed. Return only the rewritten answer.`

    const retry = await callMain(systemPrompt, [
      ...conversationMessages,
      { role: 'assistant', content: reply },
      { role: 'user', content: corrective },
    ])

    if (retry.ok && retry.reply.trim()) {
      reply = retry.reply
      // Se persistir após a correção, responde mesmo assim e apenas sinaliza.
      attributionFlag = detectAttribution(reply).flagged
    } else {
      attributionFlag = true
    }
  }

  // ── Persist both messages to advisory_memory ──────────────────────────────
  const contextMeta = {
    report_ids_used:  selectedIds,
    selection_source: selectionSource,
    attribution_flag: attributionFlag,
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
      content:          message.trim(),
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
