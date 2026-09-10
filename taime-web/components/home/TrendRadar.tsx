import type { Lang, Move } from '@/lib/decision-check'
import { MOVE_HEX, radarPoint, radarPolygonPoints, radarDataPoints } from '@/lib/radar-geometry'

// Radar inline (SVG no DOM) das 5 dimensoes reais de uma trend. Mesma geometria e
// paleta dos Report Cards do OG (lib/radar-geometry), aqui como <svg> nativo para
// render normal do Next (nao imagem). Server component: zero JS no cliente.
// Fundo escuro (card do hero): aneis/eixos claros translucidos, poligono na cor do MOVE.

// Rotulos curtos (cabem no viewBox sem quebra de linha do SVG). Consistentes com os
// mini-cards de score ja usados na home (Maturidade / Pressão / Impacto / ...).
const SHORT_LABELS: Record<Lang, string[]> = {
  pt: ['Maturidade', 'Pressão', 'Impacto', 'Complexidade', 'Risco'],
  en: ['Maturity', 'Pressure', 'Impact', 'Complexity', 'Risk'],
}

const CX = 175, CY = 140, R = 95, LABEL_R = 120

function anchor(cx: number): 'start' | 'middle' | 'end' {
  const dx = cx - CX
  if (dx > 12) return 'start'
  if (dx < -12) return 'end'
  return 'middle'
}

export default function TrendRadar({
  values, move, lang, className,
}: {
  values: number[]
  move: Move
  lang: Lang
  className?: string
}) {
  const m = MOVE_HEX[move]
  const names = SHORT_LABELS[lang]
  const dataPts = radarDataPoints(CX, CY, R, values)

  return (
    <svg viewBox="0 0 350 300" className={className} role="img"
         aria-label={lang === 'pt' ? 'Radar das 5 dimensões do score' : 'Radar of the 5 score dimensions'}>
      {/* Aneis concentricos (25/50/75/100%) */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f} points={radarPolygonPoints(CX, CY, R * f)} fill="none"
                 stroke={`rgba(255,255,255,${f === 1 ? 0.20 : 0.09})`} strokeWidth={1} />
      ))}
      {/* Eixos */}
      {[0, 1, 2, 3, 4].map(i => {
        const [x, y] = radarPoint(CX, CY, R, i)
        return <line key={i} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)}
                     stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      })}
      {/* Poligono de dados (cor do MOVE) */}
      <polygon points={dataPts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}
               fill={m.fill} stroke={m.color} strokeWidth={2.5} strokeLinejoin="round" />
      {dataPts.map(([x, y], i) => (
        <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3.5} fill={m.color} />
      ))}
      {/* Rotulos: valor (bold, branco) + nome (menor, tenue) */}
      {names.map((name, i) => {
        const [lx, ly] = radarPoint(CX, CY, LABEL_R, i)
        const a = anchor(lx)
        return (
          <g key={i}>
            <text x={lx.toFixed(1)} y={(ly - 1).toFixed(1)} textAnchor={a}
                  fontSize={15} fontWeight={700} fill="#ffffff">{Math.round(values[i])}</text>
            <text x={lx.toFixed(1)} y={(ly + 12).toFixed(1)} textAnchor={a}
                  fontSize={10} fontWeight={600} fill="rgba(255,255,255,0.55)">{name}</text>
          </g>
        )
      })}
    </svg>
  )
}
