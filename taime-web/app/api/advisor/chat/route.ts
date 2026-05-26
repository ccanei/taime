import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'

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
  id:                     string
  period:                 string
  title_en:               string
  executive_summary_en:   string
  report_trends:          ReportTrendRow[]
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL         = 'claude-sonnet-4-6'

function buildSystemPrompt(profile: AdvisorProfile | null, recentReports: ReportRow[]): string {
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

  const reportsSection = recentReports.length > 0
    ? recentReports.map(r => {
        const trendsText = r.report_trends.slice(0, 3).map(t => {
          const fw = t.taime_framework_en
          const tn = t.then_now_next_en
          return [
            `  Trend: ${t.title_en} (Score: ${t.taime_score}/100)`,
            fw ? `  Framework — Type: ${fw.type} | Act: ${fw.act} | Move: ${fw.move}` : '',
            tn ? `  Now: ${tn.now}` : '',
            tn ? `  Next: ${tn.next}` : '',
          ].filter(Boolean).join('\n')
        }).join('\n\n')
        return `Report: ${r.title_en} (${r.period})\nSummary: ${r.executive_summary_en}\n\nTop Trends:\n${trendsText}`
      }).join('\n\n---\n\n')
    : 'No published reports yet.'

  return `You are the TAIME Executive Advisor — a strategic technology intelligence consultant with access to 25 years of market history and the client's organizational context.

${profileSection}

RECENT TAIME INTELLIGENCE (last 3 reports):
${reportsSection}

YOUR ROLE:
- Act as a senior strategic advisor who knows this client's history and context
- When relevant, reference patterns from market history: "Companies with your profile that tried X in 2019–2021 faced Y challenge. Here is what worked."
- Apply the TAIME framework: structure recommendations with TYPE, ACT, IMPACT, MOVE, EXIT logic when relevant
- Be direct, executive, and action-oriented — not generic
- If the client describes a plan, evaluate it based on historical patterns and flag risks proactively
- Always end responses with a concrete next action or question

COMMUNICATION STYLE:
- Language: detect from client message and respond in the same language (PT or EN)
- Tone: senior consultant, not chatbot — direct, confident, specific
- Length: concise but complete — no filler, no bullet-point padding
- Never say "As an AI" or "I cannot" — you are an advisor with context and opinions
- Use the client's company name and sector when making specific recommendations`
}

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // TODO: Restrict to paid subscribers when Stripe is active.
  // For now, any authenticated user has access to the advisor.

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

  // ── Load last 3 published reports ─────────────────────────────────────────
  const { data: reportsData } = await service
    .from('reports')
    .select(`id, period, title_en, executive_summary_en,
             report_trends(title_en, taime_score, taime_framework_en, then_now_next_en)`)
    .eq('status', 'published')
    .order('period', { ascending: false })
    .limit(3)

  const reports = (reportsData ?? []) as ReportRow[]

  // ── Build messages for Claude ─────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(profile, reports)

  const conversationMessages = [
    ...history.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message.trim() },
  ]

  // ── Call Claude ───────────────────────────────────────────────────────────
  const anthropicRes = await fetch(ANTHROPIC_API, {
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
      messages:   conversationMessages,
    }),
  })

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text()
    console.error('Anthropic API error:', errText)
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }

  const anthropicData = await anthropicRes.json() as {
    content: Array<{ type: string; text: string }>
  }
  const reply = anthropicData.content.find(b => b.type === 'text')?.text ?? ''

  // ── Persist both messages to advisory_memory ──────────────────────────────
  const usedReportIds = reports.map(r => r.id)
  const contextMeta   = {
    report_ids_used:  usedReportIds,
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
