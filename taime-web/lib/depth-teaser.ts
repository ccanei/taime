import { createSupabaseService } from '@/lib/supabase-server'

// ── Teaser de profundidade (consciencia total, acesso parcial) ───────────────
// Injeta METADADOS de temas que existem no arquivo ANTES da janela do plano:
// apenas nome do tema e ano da primeira aparicao. Nunca conteudo, titulos ou
// periodos especificos. So dispara em perguntas de trajetoria/timing/evolucao.

type Service = ReturnType<typeof createSupabaseService>

export interface PreWindowTheme {
  theme_slug: string
  category:   string | null
  firstYear:  number
}

// A classificacao de intencao vive em '@/lib/question-intent' (modulo puro, ponto
// unico de verdade). Re-exportado aqui para nao quebrar imports existentes.
export { isTrajectoryQuestion } from '@/lib/question-intent'

// Para os theme_slugs dados, retorna os que tem PRIMEIRA aparicao no arquivo
// ANTES do piso da janela, com o ANO de inicio. Uma query MIN(period) por slug
// (report_trend_embeddings e indexado em theme_slug). So metadados.
export async function preWindowThemes(
  service: Service,
  slugs: (string | null)[],
  windowFloor: string,        // 'YYYY-MM-DD'
  maxThemes = 4,
): Promise<PreWindowTheme[]> {
  const uniq = [...new Set(slugs.filter((s): s is string => !!s))].slice(0, 6)
  const out: PreWindowTheme[] = []
  for (const slug of uniq) {
    if (out.length >= maxThemes) break
    try {
      const { data } = await service
        .from('report_trend_embeddings')
        .select('period, category')
        .eq('theme_slug', slug)
        .order('period', { ascending: true })
        .limit(1)
      const row = (Array.isArray(data) ? data[0] : null) as { period?: string; category?: string | null } | null
      const first = row?.period
      if (!first || first >= windowFloor) continue   // nasce dentro da janela: sem pre-janela
      out.push({ theme_slug: slug, category: row?.category ?? null, firstYear: Number(first.slice(0, 4)) })
    } catch { /* ignora slug problematico */ }
  }
  return out
}

// Bloco de METADADOS pre-janela para o system prompt. So nome do tema + ano de
// inicio. Sem conteudo, sem titulos, sem periodos especificos. `dest` define o
// destino da nota (Strategic para logado; assinatura para o anonimo).
export function buildDepthMetadataBlock(themes: PreWindowTheme[], dest: 'strategic' | 'subscribers'): string {
  const lines = themes
    .map(t => `- theme "${t.category ?? t.theme_slug}"${t.category && t.theme_slug ? ` (${t.theme_slug})` : ''}: archive coverage begins ${t.firstYear}`)
    .join('\n')
  const where = dest === 'strategic'
    ? 'the full earlier trajectory is available on the Strategic plan'
    : 'the full earlier trajectory is available to subscribers'
  return `PRE-WINDOW THEME METADATA (metadata ONLY, zero content):
For the themes below, the archive's coverage begins BEFORE the recent window you can draw on this turn. You are given ONLY the theme name and the year tracking began. You have NOT been given any content, conclusion, title, score, or specific period from before the window, and you must not invent any.
${lines}

Apply strictly under DEPTH AWARENESS: only for a trajectory, timing, or evolution question, close with at most ONE sober note. State since which year the archive tracks the theme, add one sentence on why the earlier trajectory would sharpen this specific decision, and mention that ${where}. Never reveal or invent pre-window content, titles, scores, or specific periods: only the theme name and the start year.`
}
