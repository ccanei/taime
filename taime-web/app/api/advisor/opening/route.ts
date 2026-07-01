import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import {
  getUserPlan,
  hasAdvisorAccess,
  getAdvisorPeriodFloor,
} from '@/lib/plan'

// ── Abertura proativa do Advisor ────────────────────────────────────────────
// Ao abrir uma conversa nova, a tela em branco paralisa e desperdiça as
// primeiras mensagens (críticas no trial de 10). Este endpoint gera uma
// SUGESTÃO DE PARTIDA personalizada pelo interesse (sempre presente no cadastro)
// e cargo (opcional), ancorada em trends REAIS e recentes do arquivo, mais 3-4
// chips de tópicos clicáveis.
//
// GROUNDING: a sugestão e os chips vêm SEMPRE de trends reais recuperados do
// arquivo. Nunca de tema genérico inventado. Se a busca não retorna nada
// relevante, a abertura cai para uma versão neutra (sem inventar tema).
//
// COTA: esta é uma INICIATIVA do Advisor, não uma mensagem do usuário. Não
// grava nada em advisory_memory e não passa por /api/advisor/chat. Por
// construção, não conta contra o limite de mensagens (trial de 10, ou o teto do
// Essential): o futuro contador (frente do Stripe) só vê os turnos que o
// usuário de fato envia. Só conta quando o usuário clica num chip ou digita uma
// pergunta de verdade (aí sim passa pelo /chat).

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL         = 'claude-sonnet-4-6'

type Lang = 'pt' | 'en'

interface UserRow {
  full_name: string | null
  company:   string | null
  job_title: string | null
}
interface AdvisorProfileRow {
  company_name: string | null
  sector:       string | null
}
interface TrendRow {
  rank:               number
  title_en:           string | null
  title_pt_br:        string | null
  taime_score:        number | null
  category:           string | null
  theme_slug:         string | null
  then_now_next_en:   { then: string; now: string; next: string } | null
  then_now_next_pt_br:{ then: string; now: string; next: string } | null
}
interface ReportRow {
  id:            string
  period:        string
  period_label:  string | null
  report_trends: TrendRow[]
}

// Trend achatada e pronta para o grounding.
interface FlatTrend {
  period:   string
  label:    string   // period_label || period
  title_en: string
  title_pt: string
  score:    number
  category: string | null
  now_en:   string
  now_pt:   string
}

// ── Mapeamento interesse → categoria de trend ───────────────────────────────
// Os interesses que casam com uma categoria real do arquivo filtram a busca.
// Os transversais (Estratégia de Tecnologia, Planejamento / Roadmap) não
// filtram: usam os trends recentes de maior TAIME Score em geral.
// As 19 categorias reais do arquivo hoje: IA, Cloud, Cybersecurity,
// Infrastructure, Automation, Edge, Data, Engineering, Observability, Market,
// Regulation, Healthtech, Fintech, Sustainability, Quantum, Robotics,
// AI Governance, Spatial Computing, Networks. includes() só usa cada categoria
// quando ela de fato existir em relatórios; o fallback transversal cobre filtro
// vazio na janela.
function mapInterestToCategories(interest: string | null): string[] | null {
  const norm = (interest ?? '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (!norm) return null
  if (/cyber|ciberseg|seguranca|security/.test(norm)) return ['Cybersecurity']
  if (/cloud|infra/.test(norm))                       return ['Cloud', 'Infrastructure', 'Edge', 'Networks', 'Quantum']
  if (/\b(ia|ai)\b|agent/.test(norm))                 return ['IA', 'Automation', 'AI Governance', 'Robotics', 'Spatial Computing']
  if (/mercado|market/.test(norm))                    return ['Market', 'Fintech']
  // transversais restantes (estratégia, planejamento, roadmap) → sem filtro
  return null
}

function pickLang(raw: string | null): Lang {
  return raw === 'en' ? 'en' : 'pt'
}

// Snapshot enxuto do "now" de uma trend, para dar substância à sugestão.
function snippet(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 220)
}

// Remove travessão (regra editorial TAIME: sem travessão) sem destruir hífens.
function stripEmDash(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ', ')
}

function buildTrendContext(trends: FlatTrend[], lang: Lang): string {
  return trends.map((t, i) => {
    const title = lang === 'pt' ? (t.title_pt || t.title_en) : (t.title_en || t.title_pt)
    const now   = lang === 'pt' ? (t.now_pt || t.now_en) : (t.now_en || t.now_pt)
    const cat   = t.category ? ` | category: ${t.category}` : ''
    return `[${i + 1}] period: ${t.label} | score: ${t.score}/100${cat}\n    title: ${title}${now ? `\n    now: ${now}` : ''}`
  }).join('\n')
}

function buildClientBlock(
  interest: string | null,
  jobTitle: string | null,
  company: string | null,
  sector:  string | null,
): string {
  const lines: string[] = []
  lines.push(`Main interest (always present): ${interest ?? 'unknown'}`)
  lines.push(`Role / job title: ${jobTitle ?? 'not provided'}`)
  lines.push(`Company: ${company ?? 'not provided'}`)
  lines.push(`Sector: ${sector ?? 'not provided'}`)
  return lines.join('\n')
}

const GEN_INSTRUCTIONS = `You are the TAIME Executive Advisor, a senior strategic technology intelligence partner. You are opening a BRAND-NEW conversation PROACTIVELY: the client has not typed anything yet. Your job is to break the blank screen with a sharp, personalized starting suggestion, so the client does not waste their first messages figuring out what to ask.

You will receive: (1) the CLIENT block with their main interest (always present), and optionally their role, company and sector; (2) a list of REAL, recent TAIME trends retrieved from the archive.

Write a proactive opening message and a set of starter chips. Return PURE JSON only, no markdown, no code fences, in exactly this shape:
{"opening":"...","chips":["...","...","..."]}

OPENING (40 to 70 words):
- Greet briefly and connect to the client's interest. If a role is provided, you may anchor to it ("as a [role]..."). If no role is provided, use only the interest. NEVER invent a role, company or sector that is not in the CLIENT block.
- Anchor the suggestion in ONE concrete, provocative theme taken from the REAL trends provided. Name the theme naturally and tie it to what the client likely faces ("the recent signals on [interest] point to [real theme]; does that connect with what you are dealing with?").
- Partner tone: confident, concise, a peer who makes the client think. Invite them to reveal their context conversationally, never as a form. End with one light question.
- GROUNDING: the theme MUST come from the provided trends. Never invent a trend, a score, a company or a datum. Do not cite scores or periods explicitly; just use the theme substance.

CHIPS (3 to 4 items, 2 to 5 words each):
- Short, clickable topic starters derived from the provided trends, phrased as things the client might ask. Concrete, not generic. Each must trace back to a provided trend.

HARD RULES:
- Write everything in the requested LANGUAGE.
- No em dash anywhere. No markdown headings. Plain prose for the opening.
- Use ONLY the provided trends. If some detail is not there, do not invent it.`

async function generateOpening(
  clientBlock: string,
  trendContext: string,
  lang: Lang,
): Promise<{ opening: string; chips: string[] } | null> {
  const langName = lang === 'pt' ? 'Portuguese (pt-BR)' : 'English'
  const userContent =
    `LANGUAGE: ${langName}\n\nCLIENT:\n${clientBlock}\n\nREAL TAIME TRENDS (recent, from the archive):\n${trendContext}`

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
        model:      MODEL,
        max_tokens: 512,
        system:     [{ type: 'text', text: GEN_INSTRUCTIONS, cache_control: { type: 'ephemeral' } }],
        messages:   [{ role: 'user', content: userContent }],
      }),
    })
    if (!res.ok) {
      console.error('[advisor-opening] non-ok:', await res.text())
      return null
    }
    const data = await res.json() as { content?: Array<{ type: string; text: string }> }
    const raw  = data.content?.find(b => b.type === 'text')?.text?.trim() ?? ''
    const json = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(json) as { opening?: unknown; chips?: unknown }

    const opening = typeof parsed.opening === 'string' ? stripEmDash(parsed.opening.trim()) : ''
    const chips = Array.isArray(parsed.chips)
      ? parsed.chips
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map(c => stripEmDash(c.trim()))
          .slice(0, 4)
      : []
    if (!opening) return null
    return { opening, chips }
  } catch (e) {
    console.error('[advisor-opening] error:', e)
    return null
  }
}

function neutralOpening(lang: Lang): { opening: string; chips: string[] } {
  return {
    opening: lang === 'pt'
      ? 'Olá! Sou o TAIME Executive Advisor. Me conta rapidamente o contexto que você está enfrentando agora e eu acho o ângulo certo nos sinais recentes do arquivo. Por onde começamos?'
      : 'Hello! I am the TAIME Executive Advisor. Tell me briefly the context you are dealing with right now and I will find the right angle in the recent signals from the archive. Where do we start?',
    chips: [],
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Mesmo gate do chat: só Essential e Strategic têm o Advisor.
  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) {
    return NextResponse.json({ error: 'Advisor not available on this plan' }, { status: 403 })
  }

  let lang: Lang = 'pt'
  try {
    const body = await req.json() as { lang?: string }
    lang = pickLang(body?.lang ?? null)
  } catch { /* body opcional; default pt */ }

  const service = createSupabaseService()

  // ── Perfil / cadastro: interest (waitlist), cargo + empresa (users), setor
  //    (advisor_profiles). interest é sempre presente no cadastro; buscamos o
  //    registro mais recente do waitlist pelo email autenticado. ─────────────
  const email = user.email ?? ''
  const [{ data: userRow }, { data: waitRow }, { data: advProfile }] = await Promise.all([
    service.from('users')
      .select('full_name, company, job_title')
      .eq('id', user.id).maybeSingle(),
    email
      ? service.from('waitlist')
          .select('interest, company, role')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    service.from('advisor_profiles')
      .select('company_name, sector')
      .eq('user_id', user.id).maybeSingle(),
  ])

  const u   = (userRow as UserRow | null)
  const w   = (waitRow as { interest: string | null; company: string | null; role: string | null } | null)
  const adv = (advProfile as AdvisorProfileRow | null)

  const interest = (w?.interest ?? '').trim() || null
  const jobTitle = (u?.job_title ?? '').trim() || null
  const company  = (u?.company ?? '').trim() || (adv?.company_name ?? '').trim() || (w?.company ?? '').trim() || null
  const sector   = (adv?.sector ?? '').trim() || null

  // ── Busca dos temas quentes recentes dentro do interesse ──────────────────
  // Recente + maior TAIME Score, respeitando a janela do plano (period_floor).
  // Interesse mapeado a categoria → filtra por categoria. Transversal → sem
  // filtro (maior score em geral). Fallback: se o filtro por categoria vier
  // vazio na janela, cai para sem filtro para ainda ancorar em algo real.
  const periodFloor = getAdvisorPeriodFloor(plan)
  const categories  = mapInterestToCategories(interest)

  const { data: reportData } = await service
    .from('reports')
    .select(`id, period, period_label,
             report_trends(rank, title_en, title_pt_br, taime_score, category, theme_slug, then_now_next_en, then_now_next_pt_br)`)
    .eq('status', 'published')
    .gte('period', periodFloor)
    .order('period', { ascending: false })
    .limit(10)

  const reports = (reportData ?? []) as ReportRow[]

  function flatten(filterByCategory: boolean): FlatTrend[] {
    const out: FlatTrend[] = []
    const seen = new Set<string>()
    for (const r of reports) {
      for (const t of r.report_trends ?? []) {
        if (filterByCategory && categories && !categories.includes(t.category ?? '')) continue
        const titleKey = (t.title_en || t.title_pt_br || '').toLowerCase().trim()
        if (!titleKey || seen.has(titleKey)) continue
        seen.add(titleKey)
        out.push({
          period:   r.period,
          label:    r.period_label?.trim() || r.period,
          title_en: t.title_en ?? '',
          title_pt: t.title_pt_br ?? '',
          score:    typeof t.taime_score === 'number' ? t.taime_score : 0,
          category: t.category,
          now_en:   snippet(t.then_now_next_en?.now),
          now_pt:   snippet(t.then_now_next_pt_br?.now),
        })
      }
    }
    // Recente já vem primeiro (reports desc); dentro disso, ordena por score.
    return out.sort((a, b) => b.score - a.score).slice(0, 6)
  }

  let selected = flatten(categories !== null)
  if (selected.length === 0) selected = flatten(false) // fallback transversal

  // ── Geração ancorada (ou neutra se não há nada real para ancorar) ─────────
  let result: { opening: string; chips: string[] } | null = null
  let grounded = false
  if (selected.length > 0) {
    const clientBlock  = buildClientBlock(interest, jobTitle, company, sector)
    const trendContext = buildTrendContext(selected, lang)
    result = await generateOpening(clientBlock, trendContext, lang)
    grounded = result !== null
  }
  if (!result) result = neutralOpening(lang)

  // NÃO persiste nada. Iniciativa do Advisor, fora da cota de mensagens.
  return NextResponse.json({
    opening:  result.opening,
    chips:    result.chips,
    grounded,
    interest,
  })
}
