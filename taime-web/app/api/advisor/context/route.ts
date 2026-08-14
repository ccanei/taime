import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'
import { getArchiveNumbers } from '@/lib/archive-stats'

type Lang = 'pt' | 'en'

// Card da tela de chegada (aba Inicio). action.kind: 'prompt' dispara a conversa
// com a pergunta; 'session' abre a conversa existente pelo id.
interface HomeCard {
  iconKey:     string
  title:       string
  description: string
  action:      { kind: 'prompt' | 'session'; value: string }
}

// 4 cards calibrados ao interesse declarado (fallback do usuario novo e tambem
// preenchimento quando falta dado nos cards do recorrente). Deterministico, sem LLM.
function calibratedCards(theme: string, lang: Lang): HomeCard[] {
  if (lang === 'en') return [
    { iconKey: 'map',        title: `Where ${theme} stands now`, description: 'The current state and what needs a decision', action: { kind: 'prompt', value: `What is the current state of ${theme} and what changes for my company?` } },
    { iconKey: 'trajectory', title: `Trajectory of ${theme}`,    description: 'How it evolved and where it points',          action: { kind: 'prompt', value: `How has ${theme} evolved over time and what is the NEXT?` } },
    { iconKey: 'focus',      title: `Where to focus on ${theme}`, description: 'Investment priority right now',                action: { kind: 'prompt', value: `Where should I focus my investment in ${theme} now?` } },
    { iconKey: 'risk',       title: `Risks in ${theme}`,          description: 'What most companies overlook',                 action: { kind: 'prompt', value: `Which risks in ${theme} do most companies overlook?` } },
  ]
  return [
    { iconKey: 'map',        title: `Onde ${theme} está agora`,  description: 'O estado atual e o que exige decisão',   action: { kind: 'prompt', value: `Qual o estado atual de ${theme} e o que muda para a minha empresa?` } },
    { iconKey: 'trajectory', title: `Trajetória de ${theme}`,    description: 'Como evoluiu e para onde aponta',        action: { kind: 'prompt', value: `Como ${theme} evoluiu ao longo do tempo e qual o NEXT?` } },
    { iconKey: 'focus',      title: `Onde focar em ${theme}`,    description: 'Prioridade de investimento agora',       action: { kind: 'prompt', value: `Onde devo focar meu investimento em ${theme} agora?` } },
    { iconKey: 'risk',       title: `Riscos em ${theme}`,        description: 'O que a maioria das empresas ignora',    action: { kind: 'prompt', value: `Quais riscos de ${theme} a maioria das empresas ignora?` } },
  ]
}

// ── Contexto FIXO do painel do workspace (Advisor logado) ───────────────────
// Alimenta a seccao de baixo do painel direito: "Sua empresa" (advisor_profiles,
// so campos preenchidos) e "Temas que voce acompanha" (theme_slugs mais recorrentes
// nas conversas do usuario, com a faixa temporal coberta pelo arquivo). Carregado
// UMA vez no mount do Advisor. Fail-safe: qualquer falha degrada para vazio, nunca
// derruba o chat. Nao expoe nada no /ask (rota separada, so logado).

export const dynamic = 'force-dynamic'

interface ProfileRow {
  company_name:           string | null
  sector:                 string | null
  company_size:           string | null
  strategic_objective:    string | null
  maturity_level:         string | null
  current_infrastructure: string | null
}

// Rotulo legivel a partir do slug (tokens de marca em caixa alta).
function prettyTheme(slug: string): string {
  return slug.split('-').map(w => {
    if (w === 'ia' || w === 'ai') return w.toUpperCase()
    if (w === 'iot') return 'IoT'
    if (w === 'esg') return 'ESG'
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) return NextResponse.json({ error: 'not available' }, { status: 403 })

  const lang: Lang = new URL(req.url).searchParams.get('lang') === 'en' ? 'en' : 'pt'
  const service = createSupabaseService()

  // 1) Perfil: so os campos preenchidos (o cliente nunca ve placeholders vazios).
  let profile: Record<string, string> = {}
  try {
    const { data } = await service
      .from('advisor_profiles')
      .select('company_name, sector, company_size, strategic_objective, maturity_level, current_infrastructure')
      .eq('user_id', user.id)
      .maybeSingle()
    const row = (data ?? null) as ProfileRow | null
    if (row) {
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'string' && v.trim()) profile[k] = v.trim()
      }
    }
  } catch (e) {
    console.error('[advisor-context] profile falhou (ignorado):', e instanceof Error ? e.message : e)
    profile = {}
  }

  // 2) Temas mais recorrentes nas conversas: agrega spine_theme_slugs do historico.
  let themes: Array<{ slug: string; label: string; startYear: string | null; endYear: string | null }> = []
  try {
    const { data: mem } = await service
      .from('advisory_memory')
      .select('context_metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60)
    const freq = new Map<string, number>()
    for (const r of (mem ?? []) as Array<{ context_metadata?: { spine_theme_slugs?: unknown } | null }>) {
      const slugs = r.context_metadata?.spine_theme_slugs
      if (Array.isArray(slugs)) {
        for (const s of slugs) {
          if (typeof s === 'string' && s.trim()) freq.set(s, (freq.get(s) ?? 0) + 1)
        }
      }
    }
    const topSlugs = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s)

    if (topSlugs.length > 0) {
      // Faixa temporal por tema: min/max periodo dos reports published que contem
      // uma trend do slug. Dois selects bounded (periodos do arquivo sao poucos).
      const [{ data: pub }, { data: trendRows }] = await Promise.all([
        service.from('reports').select('id, period').eq('status', 'published').limit(2000),
        service.from('report_trends').select('theme_slug, report_id').in('theme_slug', topSlugs).limit(4000),
      ])
      const periodById = new Map((pub ?? []).map(r => [r.id as string, (r.period as string).slice(0, 4)]))
      const yearsBySlug = new Map<string, string[]>()
      for (const t of (trendRows ?? []) as Array<{ theme_slug: string | null; report_id: string }>) {
        const y = t.theme_slug ? periodById.get(t.report_id) : undefined
        if (t.theme_slug && y) {
          const arr = yearsBySlug.get(t.theme_slug); if (arr) arr.push(y); else yearsBySlug.set(t.theme_slug, [y])
        }
      }
      themes = topSlugs.map(slug => {
        const ys = (yearsBySlug.get(slug) ?? []).sort()
        return { slug, label: prettyTheme(slug), startYear: ys[0] ?? null, endYear: ys[ys.length - 1] ?? null }
      })
    }
  } catch (e) {
    console.error('[advisor-context] themes falhou (ignorado):', e instanceof Error ? e.message : e)
    themes = []
  }

  // 3) Numeros do arquivo (linha de credibilidade). Fail-safe: null esconde a linha.
  const archive = await getArchiveNumbers()

  // 4) Cards da tela de chegada (aba Inicio). Recorrente = tem tema/sessao; senao,
  //    novo. Sempre 4 cards, nunca vazio: o que faltar cai no calibrado por interesse.
  let home: { isReturning: boolean; cards: HomeCard[] } = { isReturning: false, cards: [] }
  try {
    // Interesse declarado (waitlist) para calibrar os cards do usuario novo.
    const email = user.email ?? ''
    const { data: waitRow } = email
      ? await service.from('waitlist').select('interest').eq('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : { data: null }
    const interestRaw = ((waitRow as { interest?: string | null } | null)?.interest ?? '').trim()
    const themeLabel = interestRaw || (lang === 'en' ? 'strategic technology' : 'tecnologia estratégica')
    const fallback = calibratedCards(themeLabel, lang)

    const topTheme = themes[0] ?? null
    const returning = themes.length > 0

    const cards: HomeCard[] = []

    // (a) Continuar: ultima conversa (advisor_sessions ativas, mais recente).
    try {
      const { data: sess } = await service
        .from('advisor_sessions')
        .select('session_id, title, last_activity_at, archived_at')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('last_activity_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const s = sess as { session_id: string; title: string | null } | null
      if (s?.session_id && s.title) {
        cards.push({
          iconKey: 'continue',
          title:   lang === 'en' ? 'Continue' : 'Continuar',
          description: s.title,
          action:  { kind: 'session', value: s.session_id },
        })
      }
    } catch { /* sem continuar */ }

    // (b) Novidade no seu tema: analise mais recente que toca os temas seguidos.
    if (topTheme) {
      try {
        const slugs = themes.map(t => t.slug)
        const { data: tr } = await service
          .from('report_trends')
          .select('theme_slug, reports!inner(period, status)')
          .in('theme_slug', slugs)
          .eq('reports.status', 'published')
          .limit(1000)
        // Max periodo em JS (sem depender de ordenacao por tabela embarcada).
        let best: { period: string; slug: string | null } | null = null
        for (const r of (tr ?? []) as Array<{ theme_slug: string | null; reports?: { period?: string } }>) {
          const p = r.reports?.period
          if (p && (!best || p > best.period)) best = { period: p, slug: r.theme_slug }
        }
        const period = best?.period ?? null
        const slugLabel = best?.slug ? prettyTheme(best.slug) : topTheme.label
        if (period) {
          const mmm = shortPeriodLabel(period, lang)
          cards.push({
            iconKey: 'new',
            title:   lang === 'en' ? 'New in your theme' : 'Novidade no seu tema',
            description: lang === 'en' ? `${slugLabel}, latest analysis ${mmm}` : `${slugLabel}, análise mais recente de ${mmm}`,
            action:  { kind: 'prompt', value: lang === 'en' ? `What is the most recent development on ${slugLabel} in the archive?` : `O que há de mais recente sobre ${slugLabel} no arquivo?` },
          })
        }
      } catch { /* sem novidade */ }
    }

    // (c) Sua trajetoria no tema principal.
    if (topTheme) {
      cards.push({
        iconKey: 'trajectory',
        title:   lang === 'en' ? `Your trajectory in ${topTheme.label}` : `Sua trajetória em ${topTheme.label}`,
        description: topTheme.startYear ? (lang === 'en' ? `Arc from ${topTheme.startYear} to today` : `Arco de ${topTheme.startYear} até hoje`) : (lang === 'en' ? 'The temporal arc' : 'O arco temporal'),
        action:  { kind: 'prompt', value: lang === 'en' ? `How has ${topTheme.label} evolved over time and what is the NEXT?` : `Como ${topTheme.label} evoluiu ao longo do tempo e qual o NEXT?` },
      })
    }

    // (d) Calibrado ao objetivo declarado no perfil.
    if (profile.strategic_objective) {
      const obj = profile.strategic_objective
      cards.push({
        iconKey: 'objective',
        title:   lang === 'en' ? 'Toward your objective' : 'Rumo ao seu objetivo',
        description: obj.length > 90 ? obj.slice(0, 88).replace(/\s+\S*$/, '') + '...' : obj,
        action:  { kind: 'prompt', value: lang === 'en' ? `How does the TAIME archive connect to my objective: ${obj}?` : `Como o arquivo TAIME se conecta ao meu objetivo: ${obj}?` },
      })
    }

    // Preenche ate 4 com os calibrados, sem repetir titulo.
    const seen = new Set(cards.map(c => c.title))
    for (const c of fallback) {
      if (cards.length >= 4) break
      if (!seen.has(c.title)) { cards.push(c); seen.add(c.title) }
    }
    home = { isReturning: returning, cards: cards.slice(0, 4) }
  } catch (e) {
    console.error('[advisor-context] home falhou (ignorado):', e instanceof Error ? e.message : e)
    home = { isReturning: false, cards: calibratedCards(lang === 'en' ? 'strategic technology' : 'tecnologia estratégica', lang) }
  }

  return NextResponse.json({ profile, themes, archive, home })
}

// mmm/aaaa curto para a descricao do card de novidade.
function shortPeriodLabel(period: string, lang: Lang): string {
  const MPT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const MEN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = Number.parseInt(period.slice(5, 7), 10) - 1
  const y = period.slice(0, 4)
  const mm = (lang === 'en' ? MEN : MPT)[m] ?? ''
  return lang === 'en' ? `${mm} ${y}` : `${mm}/${y}`
}
