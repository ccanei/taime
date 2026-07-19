'use client'

import { useEffect, useRef, useState } from 'react'

// Grafico-assinatura do TAIME: a trajetoria THEN -> NOW -> NEXT como curva
// ascendente com tres pontos marcados, sobre um grid sutil. E a metodologia
// virando identidade visual (o equivalente do Hype Cycle como arte). SVG puro,
// desenha ao entrar no viewport, respeita prefers-reduced-motion.
export default function SignatureGraphic({
  labels, className,
}: {
  labels: { then: string; now: string; next: string }
  className?: string
}) {
  const [drawn, setDrawn] = useState(false)
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDrawn(true); return }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { setDrawn(true); io.disconnect(); break }
    }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Pontos da trajetoria (viewBox 0 0 400 240).
  const THEN = { x: 60,  y: 176 }
  const NOW  = { x: 208, y: 120 }
  const NEXT = { x: 344, y: 52  }
  // Curva suave passando pelos tres pontos.
  const path = `M ${THEN.x} ${THEN.y} C 120 178, 150 150, ${NOW.x} ${NOW.y} S 300 74, ${NEXT.x} ${NEXT.y}`

  const point = (p: { x: number; y: number }, tone: string, glow: boolean, delay: number) => (
    <g style={{ opacity: drawn ? 1 : 0, transform: drawn ? 'scale(1)' : 'scale(0.4)', transformOrigin: `${p.x}px ${p.y}px`, transition: `opacity 0.5s ease-out ${delay}ms, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}ms` }}>
      {glow && <circle cx={p.x} cy={p.y} r="14" fill={tone} opacity="0.18" />}
      <circle cx={p.x} cy={p.y} r="6" fill="#0b1220" stroke={tone} strokeWidth="3" />
    </g>
  )

  const label = (p: { x: number; y: number }, text: string, tone: string) => (
    <text x={p.x} y={p.y + 30} textAnchor="middle" fontSize="11" fontWeight="700"
          letterSpacing="2" fill={tone} style={{ opacity: drawn ? 0.9 : 0, transition: 'opacity 0.6s ease-out 500ms' }}>
      {text.toUpperCase()}
    </text>
  )

  return (
    <svg ref={ref} viewBox="0 0 400 240" className={className} role="img" aria-label="THEN NOW NEXT">
      {/* Grid sutil */}
      <g stroke="rgba(255,255,255,0.06)" strokeWidth="1">
        {[40, 100, 160, 220].map(y => <line key={y} x1="20" y1={y} x2="380" y2={y} />)}
        {[100, 200, 300].map(x => <line key={x} x1={x} y1="24" x2={x} y2="220" />)}
      </g>

      {/* Area sob a curva (preenchimento tenue) */}
      <path
        d={`${path} L ${NEXT.x} 220 L ${THEN.x} 220 Z`}
        fill="url(#sigFill)"
        style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.9s ease-out 300ms' }}
      />
      {/* A curva, desenhando */}
      <path
        d={path}
        fill="none"
        stroke="url(#sigLine)"
        strokeWidth="3"
        strokeLinecap="round"
        pathLength={1}
        style={{ strokeDasharray: 1, strokeDashoffset: drawn ? 0 : 1, transition: 'stroke-dashoffset 1.3s cubic-bezier(0.65,0,0.35,1)' }}
      />

      {point(THEN, '#a1a1aa', false, 700)}
      {point(NOW,  '#34d399', false, 950)}
      {point(NEXT, '#5479ff', true,  1200)}

      {label(THEN, labels.then, '#a1a1aa')}
      {label(NOW,  labels.now,  '#6ee7b7')}
      {label(NEXT, labels.next, '#93b0ff')}

      <defs>
        <linearGradient id="sigLine" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%"   stopColor="#a1a1aa" />
          <stop offset="55%"  stopColor="#34d399" />
          <stop offset="100%" stopColor="#5479ff" />
        </linearGradient>
        <linearGradient id="sigFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#5479ff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#5479ff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
