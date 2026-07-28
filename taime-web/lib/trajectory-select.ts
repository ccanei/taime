// ── Selecao de chunks para perguntas de trajetoria (v4.9) ───────────────────
// Modulo PURO (zero dependencias), testavel e compartilhado entre o Advisor
// logado (app/api/advisor/chat) e o /ask anonimo. A busca vetorial e semantica e
// o indice e desigual (anos com muito mais chunks dominam a similaridade). Para
// perguntas de trajetoria/evolucao isso enviesa o contexto para os anos densos e
// afoga o ano corrente. Estas funcoes garantem espectro temporal, recencia,
// desempate por TAIME Score na fronteira e continuidade (espinha) do tema.

export interface Periodized {
  period:     string   // 'YYYY-MM-01'
  similarity: number
}

// Primeiro dia do mes 'monthsBack' meses atras de `now`, em UTC. 'YYYY-MM-01'.
export function firstOfMonthUTC(now: Date, monthsBack: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1))
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

// Distribuicao ano -> contagem (ordenada por ano). Usada pelo termometro e testes.
export function yearDistribution<T extends { period: string }>(chunks: T[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const c of chunks) {
    const y = c.period.slice(0, 4)
    m[y] = (m[y] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))
}

// Desempate por TAIME Score na FRONTEIRA (Part B, v4.9). Similaridade continua
// primaria: chunks sao agrupados em faixas de largura `delta`; DENTRO da mesma
// faixa (similaridade praticamente empatada) o de maior TAIME Score vem primeiro.
// Comparador transitivo (bucket, score, similaridade), seguro para sort.
export function scoreTieBreakSort<T extends { similarity: number; score?: number | null }>(
  chunks: T[], delta: number,
): T[] {
  const d = delta > 0 ? delta : 0.04
  return [...chunks].sort((a, b) => {
    // Indice de faixa por floor: [k*d, (k+1)*d) e uma faixa. Duas similaridades na
    // mesma faixa (praticamente empatadas) sao desempatadas pelo score.
    const ba = Math.floor(a.similarity / d), bb = Math.floor(b.similarity / d)
    if (ba !== bb) return bb - ba                     // faixa de maior similaridade primeiro
    const sa = a.score ?? -1, sb = b.score ?? -1
    if (sa !== sb) return sb - sa                      // desempate: maior TAIME Score
    return b.similarity - a.similarity                 // ultimo criterio: similaridade exata
  })
}

// theme_slug(s) dominante(s) entre os topK candidatos por similaridade. Retorna
// ate `maxThemes` slugs com pelo menos `minCount` ocorrencias, mais frequentes
// primeiro. Vazio quando nenhum tema se repete (arco disperso).
export function dominantThemeSlugs<T extends { theme_slug?: string | null; similarity: number }>(
  chunks: T[], opts?: { topK?: number; maxThemes?: number; minCount?: number },
): string[] {
  const topK      = opts?.topK ?? 12
  const maxThemes = opts?.maxThemes ?? 2
  const minCount  = opts?.minCount ?? 2
  const top = [...chunks].sort((a, b) => b.similarity - a.similarity).slice(0, topK)
  const counts = new Map<string, number>()
  for (const c of top) {
    if (!c.theme_slug) continue
    counts.set(c.theme_slug, (counts.get(c.theme_slug) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxThemes)
    .map(([s]) => s)
}

// Espinha temporal do(s) tema(s) dominante(s): um chunk por ANO (o de maior
// similaridade naquele ano) para cada slug, ordenado cronologicamente. E o
// backbone do arco then/now/next, deterministico entre execucoes.
function themeSpine<T extends { period: string; theme_slug?: string | null; similarity: number }>(
  chunks: T[], slugs: string[],
): T[] {
  if (slugs.length === 0) return []
  const set = new Set(slugs)
  const bestByYearSlug = new Map<string, T>()
  for (const c of chunks) {
    if (!c.theme_slug || !set.has(c.theme_slug)) continue
    const key = `${c.theme_slug}:${c.period.slice(0, 4)}`
    const cur = bestByYearSlug.get(key)
    if (!cur || c.similarity > cur.similarity) bestByYearSlug.set(key, c)
  }
  return [...bestByYearSlug.values()].sort((a, b) => a.period.localeCompare(b.period))
}

// Rebalanceamento temporal: distribui os candidatos por faixa de ANO (round-robin
// cronologico). A rodada 0 pega o melhor chunk de CADA ano; a rodada 1 o segundo;
// etc, ate `totalCap`. Recebe chunks ja ordenados (dentro de cada ano a ordem e
// preservada).
export function rebalanceByYear<T extends { period: string }>(chunks: T[], totalCap: number): T[] {
  if (totalCap <= 0) return []
  const byYear = new Map<string, T[]>()
  for (const c of chunks) {
    const y = c.period.slice(0, 4)
    const arr = byYear.get(y)
    if (arr) arr.push(c)
    else byYear.set(y, [c])
  }
  if (byYear.size <= 1) return chunks.slice(0, totalCap) // um so ano: nada a espalhar
  const years = [...byYear.keys()].sort()                // cronologico crescente
  const out: T[] = []
  for (let round = 0; out.length < totalCap; round++) {
    let progressed = false
    for (const y of years) {
      const arr = byYear.get(y)!
      if (round < arr.length) {
        out.push(arr[round])
        progressed = true
        if (out.length >= totalCap) break
      }
    }
    if (!progressed) break // todos os anos esgotados
  }
  return out
}

// Selecao final de trajetoria (v5.0). Ordem de garantias (recencia PRIMEIRO):
//   1. desempate por TAIME Score na fronteira (scoreTieBreakSort);
//   2. RESERVA de recencia INEGOCIAVEL (ultimos recentMonths meses), preenchida
//      ANTES de tudo e rebalanceada por ano DENTRO da janela recente para garantir
//      que o ANO MAIS NOVO entre mesmo com similaridade baixa. Ancora NOW/NEXT no
//      presente;
//   3. ESPINHA cronologica do(s) tema(s) dominante(s) preenche o ARCO HISTORICO nas
//      vagas restantes (continuidade estrutural, a MESMA entre execucoes);
//   4. rebalanceByYear sobre o restante.
// v5.0 corrige o defeito do e13b104: a espinha preenchia primeiro e canibalizava a
// recencia (o elo mais novo do tema dominante era ago/2025 e as trends de 2026, de
// theme_slug diferente e baixa similaridade, ficavam de fora). Agora a recencia
// vem primeiro e e inegociavel; a espinha da consistencia ao PASSADO.
// Degrada com graca: sem material recente a reserva fica vazia; sem tema dominante
// a espinha fica vazia; ambos caem no rebalanceamento.
export function selectTrajectoryChunks<
  T extends Periodized & { theme_slug?: string | null; score?: number | null },
>(
  chunks: T[],
  opts: { now: Date; totalCap: number; recentMonths: number; reservePct: number; tieBreakDelta?: number },
): { selected: T[]; spineSlugs: string[] } {
  const { now, totalCap, recentMonths, reservePct } = opts
  const delta = opts.tieBreakDelta ?? 0.04
  if (chunks.length === 0 || totalCap <= 0) return { selected: [], spineSlugs: [] }

  const ranked     = scoreTieBreakSort(chunks, delta)
  const spineSlugs = dominantThemeSlugs(ranked)
  const spine      = themeSpine(ranked, spineSlugs)

  const chosen = new Set<T>()
  const out: T[] = []
  const push = (c: T) => { if (!chosen.has(c) && out.length < totalCap) { chosen.add(c); out.push(c) } }

  // 2. RESERVA DE RECENCIA primeiro e inegociavel. Rebalance por ano DENTRO da
  //    janela recente: a rodada 0 pega o melhor chunk de CADA ano recente, entao o
  //    ano mais novo (ex: 2026) entra mesmo tendo similaridade menor que os anos
  //    densos ligeiramente mais antigos (ex: 2025).
  const cutoff       = firstOfMonthUTC(now, recentMonths)
  const reserveSlots = Math.min(totalCap, Math.max(1, Math.round(totalCap * reservePct)))
  const recentPool   = ranked.filter(c => c.period >= cutoff)
  for (const c of rebalanceByYear(recentPool, reserveSlots)) push(c)

  // 3. ESPINHA do tema dominante preenche o arco historico nas vagas restantes,
  //    deixando uma folga (~15%) para o rebalance trazer diversidade.
  const spineTarget = Math.max(out.length, totalCap - Math.ceil(totalCap * 0.15))
  for (const c of spine) {
    if (out.length >= spineTarget) break
    push(c)
  }

  // 4. rebalanceamento por ano com as vagas restantes.
  const rest = ranked.filter(c => !chosen.has(c))
  for (const c of rebalanceByYear(rest, totalCap - out.length)) push(c)

  return { selected: out, spineSlugs }
}
