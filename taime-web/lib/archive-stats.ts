import { createSupabaseService } from '@/lib/supabase-server'

// Numeros agregados do arquivo (edicoes, trends, cobertura temporal), a mesma
// fonte factual que a home/dashboard ja usam. So contagens e faixa de anos, nunca
// conteudo de relatorio: seguro para expor tambem no /ask (anti-scraping preservado).
export interface ArchiveNumbers {
  editions:  number                 // periodos publicados distintos
  trends:    number                 // trends em relatorios publicados
  startYear: string | null
  endYear:   string | null
  byYear:    Record<string, number> // tendencias analisadas por ano (para a timeline)
}

interface ReportCountRow {
  period:        string
  report_trends: Array<{ count: number }> | null
}

// Contagem agregada de trends por CATEGORIA (temas cobertos), so de reports
// publicados. Apenas category + contagem: nunca titulo, periodo, score ou link,
// entao e seguro para a coluna "o acervo" do /ask anonimo (anti-scraping preservado).
export interface CategoryCount { category: string; count: number }

export async function getArchiveByCategory(): Promise<CategoryCount[] | null> {
  try {
    const service = createSupabaseService()
    const counts = new Map<string, number>()
    const PAGE = 1000
    // Paginado: report_trends de reports publicados, so a coluna category.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await service
        .from('report_trends')
        .select('category, reports!inner(status)')
        .eq('reports.status', 'published')
        .range(from, from + PAGE - 1)
      if (error) return null
      const rows = (data ?? []) as Array<{ category: string | null }>
      for (const r of rows) {
        const c = (r.category ?? '').trim()
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
      }
      if (rows.length < PAGE) break
    }
    if (counts.size === 0) return null
    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
  } catch (e) {
    console.error('[archive-stats] agregacao por categoria falhou (ignorado):', e instanceof Error ? e.message : e)
    return null
  }
}

export async function getArchiveNumbers(): Promise<ArchiveNumbers | null> {
  try {
    const service = createSupabaseService()
    // Uma consulta: cada relatorio publicado com a CONTAGEM de suas trends (embed
    // count do PostgREST). Da edicoes, total de trends E a distribuicao por ano sem
    // trazer as ~2114 trends cruas. ~378 linhas.
    const { data } = await service
      .from('reports')
      .select('period, report_trends(count)')
      .eq('status', 'published')
      .limit(5000)
    const rows = (data ?? []) as ReportCountRow[]
    if (rows.length === 0) return null

    const periods = new Set<string>()
    const byYear: Record<string, number> = {}
    let trends = 0
    for (const r of rows) {
      periods.add(r.period)
      const y = r.period.slice(0, 4)
      const c = Array.isArray(r.report_trends) ? (r.report_trends[0]?.count ?? 0) : 0
      byYear[y] = (byYear[y] ?? 0) + c
      trends += c
    }
    const years = [...new Set(rows.map(r => r.period.slice(0, 4)))].sort()
    return {
      editions:  periods.size,
      trends,
      startYear: years[0] ?? null,
      endYear:   years[years.length - 1] ?? null,
      byYear,
    }
  } catch (e) {
    console.error('[archive-stats] falhou (ignorado):', e instanceof Error ? e.message : e)
    return null
  }
}
