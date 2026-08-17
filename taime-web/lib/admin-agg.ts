// Agregacoes server-side reutilizaveis pelo cockpit admin. As paginas passam so
// timestamps (ou ja contam no SQL) e recebem series compactas para os SVGs. Nunca
// enviar tabela crua ao client para agregar la.

export interface Point { label: string; value: number }

const DAY = 86_400_000

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}
function shortDay(iso: string): string {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) // DD/MM
}

// Serie diaria (contagem por dia) nos ultimos `days` dias, incluindo dias zerados.
export function seriesByDay(isoTimestamps: string[], days: number, nowMs = Date.now()): Point[] {
  const counts = new Map<string, number>()
  for (const iso of isoTimestamps) {
    const t = Date.parse(iso)
    if (Number.isNaN(t)) continue
    counts.set(dayKey(t), (counts.get(dayKey(t)) ?? 0) + 1)
  }
  const out: Point[] = []
  const start = nowMs - (days - 1) * DAY
  for (let i = 0; i < days; i++) {
    const k = dayKey(start + i * DAY)
    out.push({ label: shortDay(k), value: counts.get(k) ?? 0 })
  }
  return out
}

// Serie acumulada (soma corrente) a partir de uma serie diaria + base inicial.
export function cumulative(series: Point[], base = 0): Point[] {
  let run = base
  return series.map(p => ({ label: p.label, value: (run += p.value) }))
}

// Contagem de timestamps dentro dos ultimos `days` dias.
export function countInWindow(isoTimestamps: string[], days: number, nowMs = Date.now()): number {
  const cutoff = nowMs - days * DAY
  let n = 0
  for (const iso of isoTimestamps) { const t = Date.parse(iso); if (!Number.isNaN(t) && t >= cutoff) n++ }
  return n
}

// Contagem na JANELA ANTERIOR (de -2d..-d) para o delta vs periodo anterior.
export function countInPrevWindow(isoTimestamps: string[], days: number, nowMs = Date.now()): number {
  const hi = nowMs - days * DAY, lo = nowMs - 2 * days * DAY
  let n = 0
  for (const iso of isoTimestamps) { const t = Date.parse(iso); if (!Number.isNaN(t) && t >= lo && t < hi) n++ }
  return n
}

// Variacao percentual atual vs anterior (0 anterior => 0 para nao explodir).
export function deltaPct(current: number, previous: number): number {
  if (!previous) return 0
  return ((current - previous) / previous) * 100
}

// Conveniencia: delta de uma metrica de janela (ultimos `days` vs os `days` anteriores).
export function windowDelta(isoTimestamps: string[], days: number, nowMs = Date.now()): number {
  return deltaPct(countInWindow(isoTimestamps, days, nowMs), countInPrevWindow(isoTimestamps, days, nowMs))
}
