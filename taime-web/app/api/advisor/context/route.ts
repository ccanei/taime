import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'

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

export async function GET() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) return NextResponse.json({ error: 'not available' }, { status: 403 })

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

  return NextResponse.json({ profile, themes })
}
