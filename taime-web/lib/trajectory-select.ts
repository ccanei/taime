// ── Selecao de chunks para perguntas de trajetoria (v4.8) ───────────────────
// Modulo PURO (zero dependencias), testavel e compartilhado entre o Advisor
// logado (app/api/advisor/chat) e o /ask anonimo. A busca vetorial e semantica e
// o indice e desigual (anos com muito mais chunks dominam a similaridade). Para
// perguntas de trajetoria/evolucao isso enviesa o contexto para os anos densos e
// afoga o ano corrente. Estas funcoes garantem espectro temporal E recencia.

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

// Distribuicao ano -> contagem (ordenada por ano). Usada pelo termometro (Task 5)
// e pelos testes. Aceita qualquer objeto com `period`.
export function yearDistribution<T extends { period: string }>(chunks: T[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const c of chunks) {
    const y = c.period.slice(0, 4)
    m[y] = (m[y] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))
}

// Rebalanceamento temporal: distribui os candidatos por faixa de ANO em vez de
// puro top-por-similaridade. Round-robin cronologico: a rodada 0 pega o melhor
// chunk de CADA ano (garante que todo ano com material apareca), a rodada 1 o
// segundo de cada ano, e assim por diante, ate `totalCap`. Recebe chunks ja
// ordenados por similaridade desc (dentro de cada ano a ordem por relevancia e
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

// Selecao final de trajetoria (Task 1: reserva de recencia). Reserva ~reservePct
// das vagas para os TOP chunks (por similaridade) dos ultimos `recentMonths`
// meses, INDEPENDENTE do ranking global, garantindo que o NOW/NEXT tenham material
// recente. O restante das vagas segue o rebalanceByYear sobre os anos anteriores.
// Degrada com graca: se nao ha material recente, a reserva fica vazia e tudo cai
// no rebalanceamento (comportamento anterior). Entrada esperada: chunks ja
// deduplicados e ordenados por similaridade desc.
export function selectTrajectoryChunks<T extends Periodized>(
  chunks: T[],
  opts: { now: Date; totalCap: number; recentMonths: number; reservePct: number },
): T[] {
  const { now, totalCap, recentMonths, reservePct } = opts
  if (chunks.length === 0 || totalCap <= 0) return []
  if (chunks.length <= totalCap) {
    // Cabe tudo: nada a descartar. Ainda assim reordena para levar os recentes na
    // frente, mantendo o resto por ano, para o refinador ver recencia primeiro.
  }

  const cutoff       = firstOfMonthUTC(now, recentMonths)
  const reserveSlots = Math.min(totalCap, Math.max(1, Math.round(totalCap * reservePct)))

  // Reserva: top por similaridade entre os que caem na janela recente.
  const recentPool = chunks
    .filter(c => c.period >= cutoff)
    .sort((a, b) => b.similarity - a.similarity)
  const recent = recentPool.slice(0, reserveSlots)
  const chosen = new Set<T>(recent)

  // Resto: tudo que nao entrou na reserva (inclui recentes excedentes, que ainda
  // competem no rebalanceamento pelo bucket do ano corrente).
  const rest      = chunks.filter(c => !chosen.has(c))
  const remaining = totalCap - recent.length
  const rebalanced = rebalanceByYear(rest, remaining)

  return [...recent, ...rebalanced]
}
