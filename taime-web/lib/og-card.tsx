import type { ReactElement } from 'react'
import { type Lang, type Move, MOVE_LABEL } from '@/lib/decision-check'
import { DIM_ORDER, DIM_LABELS, MOVE_HEX, radarPoint, radarPolygonPoints, radarDataPoints } from '@/lib/radar-geometry'

export { DIM_ORDER }

// Report Card compartilhavel (1200x630, padrao OG): fundo azul-marinho da marca,
// TAIME Score grande, MOVE com cor semantica, radar SVG de 5 dimensoes (gerado a
// partir dos valores reais), titulo e rodape. Renderizado por next/og (Satori):
// so flexbox + estilos inline. O radar vai como <img> de SVG (shapes puros, sem
// texto no SVG); os rotulos das dimensoes sao posicionados por cima via Satori,
// para nao depender de fontes dentro do SVG rasterizado.

export const OG_W = 1200
export const OG_H = 630

// Paleta TAIME (mesma do tailwind.config): consistencia visual com o site.
const NAVY = '#0f1a3d'
const NAVY_DEEP = '#0a1330'
const TAIME_300 = '#93b0ff'
const TAIME_400 = '#5479ff'

// ── Geometria do radar (compartilhada em lib/radar-geometry) ─────────────────
const RC = 230            // centro x/y (viewBox 460x460)
const RR = 140            // raio 100%
const LABEL_R = RR + 30   // raio dos rotulos
const ptAt = (i: number, radius: number): [number, number] => radarPoint(RC, RC, radius, i)

function radarDataUri(values: number[], move: Move): string {
  const m = MOVE_HEX[move]
  const dataPts = radarDataPoints(RC, RC, RR, values)
  const rings = [0.25, 0.5, 0.75, 1].map(f =>
    `<polygon points="${radarPolygonPoints(RC, RC, RR * f)}" fill="none" stroke="rgba(255,255,255,${f === 1 ? 0.22 : 0.10})" stroke-width="1"/>`).join('')
  const axes = [0, 1, 2, 3, 4].map(i => {
    const [x, y] = ptAt(i, RR)
    return `<line x1="${RC}" y1="${RC}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`
  }).join('')
  const dataPoly = `<polygon points="${dataPts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="${m.fill}" stroke="${m.color}" stroke-width="3" stroke-linejoin="round"/>`
  const dots = dataPts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${m.color}"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="460" viewBox="0 0 460 460">${rings}${axes}${dataPoly}${dots}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export interface CardProps {
  kicker: string           // linha superior (ex.: "DECISION CHECK" ou "TAIME REPORT")
  title: string            // titulo da trend/tema
  score: number            // 0-100
  move: Move
  values: number[]         // 5 dimensoes 0-100, ordem DIM_ORDER
  lang: Lang
}

// Rotulo posicionado por cima do radar, centrado no vertice (via Satori).
function dimLabel(i: number, name: string, value: number): ReactElement {
  const [x, y] = ptAt(i, LABEL_R)
  const BW = 130
  return (
    <div
      key={i}
      style={{
        position: 'absolute', left: x - BW / 2, top: y - 22, width: BW,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', fontSize: 22, fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{value}</div>
      <div style={{ display: 'flex', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{name}</div>
    </div>
  )
}

export function reportCard(props: CardProps): ReactElement {
  const { kicker, title, score, move, values, lang } = props
  const m = MOVE_HEX[move]
  const names = DIM_LABELS[lang]
  const moveLabel = MOVE_LABEL[move][lang]
  const scoreLabel = lang === 'pt' ? 'TAIME SCORE' : 'TAIME SCORE'
  const footer = 'TAIME Tech · Strategic Technology Intelligence · Since 2015'
  const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t)

  return (
    <div
      style={{
        width: OG_W, height: OG_H, display: 'flex', flexDirection: 'column',
        backgroundColor: NAVY,
        backgroundImage: `radial-gradient(900px 500px at 78% 18%, rgba(84,121,255,0.18), rgba(15,26,61,0) 60%), linear-gradient(135deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
        color: '#ffffff', padding: '52px 60px',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Header: kicker + wordmark */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: TAIME_300 }}>
          {clip(kicker, 46)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: TAIME_400, marginRight: 12 }} />
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>TAIME</div>
        </div>
      </div>

      {/* Corpo: coluna esquerda (score/move/titulo) + radar */}
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', marginTop: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 610, paddingRight: 24 }}>
          {/* MOVE em destaque */}
          <div style={{
            display: 'flex', alignSelf: 'flex-start', alignItems: 'center',
            backgroundColor: m.fill, border: `2px solid ${m.border}`, borderRadius: 14,
            padding: '10px 22px', marginBottom: 26,
          }}>
            <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, letterSpacing: 2, color: m.color }}>{moveLabel}</div>
          </div>

          {/* Score grande */}
          <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, letterSpacing: 3, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{scoreLabel}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', fontSize: 168, fontWeight: 800, lineHeight: 0.92, color: '#ffffff' }}>{score}</div>
            <div style={{ display: 'flex', fontSize: 46, fontWeight: 700, color: 'rgba(255,255,255,0.35)', paddingBottom: 22, marginLeft: 6 }}>/100</div>
          </div>

          {/* Titulo (max 2 linhas) */}
          <div style={{
            display: 'flex', fontSize: 32, fontWeight: 700, lineHeight: 1.2, color: 'rgba(255,255,255,0.92)',
            marginTop: 22, maxHeight: 156, overflow: 'hidden',
          }}>
            {clip(title, 96)}
          </div>
        </div>

        {/* Radar 460x460 com rotulos por cima */}
        <div style={{ display: 'flex', position: 'relative', width: 460, height: 460 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={radarDataUri(values, move)} width={460} height={460} alt="" />
          {names.map((name, i) => dimLabel(i, name, Math.round(values[i])))}
        </div>
      </div>

      {/* Rodape */}
      <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 20 }}>
        <div style={{ display: 'flex', fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5 }}>{footer}</div>
      </div>
    </div>
  )
}

// Cache agressivo: a imagem de um combo/report especifico nao muda. 7 dias no CDN,
// com stale-while-revalidate. Reaproveitado pelos dois endpoints.
export const OG_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, no-transform, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
}
