import { createSupabaseService } from '@/lib/supabase-server'

// Numeros agregados do arquivo (edicoes, trends, cobertura temporal), a mesma
// fonte factual que a home/dashboard ja usam. So contagens e faixa de anos, nunca
// conteudo de relatorio: seguro para expor tambem no /ask (anti-scraping preservado).
export interface ArchiveNumbers {
  editions:  number       // periodos publicados distintos
  trends:    number       // trends em relatorios publicados
  startYear: string | null
  endYear:   string | null
}

export async function getArchiveNumbers(): Promise<ArchiveNumbers | null> {
  try {
    const service = createSupabaseService()
    const [{ data: periods }, trendCount] = await Promise.all([
      service.from('reports').select('period').eq('status', 'published').limit(5000),
      countPublishedTrends(service),
    ])
    const rows = (periods ?? []) as Array<{ period: string }>
    if (rows.length === 0) return null
    const distinct = new Set(rows.map(r => r.period))
    const years = [...new Set(rows.map(r => r.period.slice(0, 4)))].sort()
    return {
      editions:  distinct.size,
      trends:    trendCount,
      startYear: years[0] ?? null,
      endYear:   years[years.length - 1] ?? null,
    }
  } catch (e) {
    console.error('[archive-stats] falhou (ignorado):', e instanceof Error ? e.message : e)
    return null
  }
}

// Contagem de trends em relatorios publicados via head count do PostgREST.
async function countPublishedTrends(service: ReturnType<typeof createSupabaseService>): Promise<number> {
  try {
    const { count } = await service
      .from('report_trends')
      .select('id, reports!inner(status)', { count: 'exact', head: true })
      .eq('reports.status', 'published')
    return count ?? 0
  } catch {
    return 0
  }
}
