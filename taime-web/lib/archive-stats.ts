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
