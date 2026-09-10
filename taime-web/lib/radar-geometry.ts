import type { Lang, Move } from '@/lib/decision-check'

// Geometria e paleta compartilhadas do radar de 5 dimensoes. Fonte unica reusada
// pelos Report Cards do OG (lib/og-card via <img> SVG) e pelo radar inline da home
// (components/home/TrendRadar via <svg> no DOM). Pura e client-safe.

// Ordem canonica das 5 dimensoes (igual a ScoreDimensions em lib/types) e rotulos
// PT/EN. Os valores chegam SEMPRE nesta ordem.
export const DIM_ORDER = [
  'market_maturity', 'competitive_pressure', 'strategic_impact', 'execution_complexity', 'competitive_lag_risk',
] as const
export type DimKey = typeof DIM_ORDER[number]

export const DIM_LABELS: Record<Lang, string[]> = {
  pt: ['Maturidade', 'Pressão Competitiva', 'Impacto Estratégico', 'Complexidade', 'Risco de Atraso'],
  en: ['Maturity', 'Competitive Pressure', 'Strategic Impact', 'Execution Complexity', 'Lag Risk'],
}

// Cor semantica por MOVE (mesma leitura de cor do /decision-check e do OG card).
export const MOVE_HEX: Record<Move, { color: string; fill: string; border: string }> = {
  act:     { color: '#34d399', fill: 'rgba(52,211,153,0.14)',  border: 'rgba(52,211,153,0.45)' },
  prepare: { color: '#5479ff', fill: 'rgba(84,121,255,0.16)',  border: 'rgba(84,121,255,0.50)' },
  monitor: { color: '#fbbf24', fill: 'rgba(251,191,36,0.14)',  border: 'rgba(251,191,36,0.45)' },
  avoid:   { color: '#f87171', fill: 'rgba(248,113,113,0.14)', border: 'rgba(248,113,113,0.45)' },
}

// Pentagono: ponta ao topo (-90 graus), sentido horario. Parametrico em centro/raio
// para servir tamanhos diferentes (460 no OG, menor no hero inline).
export function radarPoint(cx: number, cy: number, r: number, i: number, count = 5): [number, number] {
  const a = (-90 + i * (360 / count)) * Math.PI / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

// String "x,y x,y ..." dos vertices de um poligono de raio r (para <polygon points>).
export function radarPolygonPoints(cx: number, cy: number, r: number, count = 5): string {
  return Array.from({ length: count }, (_, i) =>
    radarPoint(cx, cy, r, i, count).map(n => n.toFixed(1)).join(','),
  ).join(' ')
}

// Poligono de dados a partir dos valores 0-100 (cada vertice no raio r * v/100).
export function radarDataPoints(cx: number, cy: number, r: number, values: number[]): [number, number][] {
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  return values.map((v, i) => radarPoint(cx, cy, r * clamp(v) / 100, i, values.length))
}
