'use client'

import { useEffect, useRef, useState } from 'react'

// Diagrama do fluxo TYPE -> ACT -> IMPACT -> MOVE -> EXIT: 5 estagios conectados
// numa progressao horizontal, com a linha desenhando da esquerda para a direita e
// os nos revelando em sequencia ao entrar no viewport. SVG proprio, mesma paleta
// do resto (zinc -> emerald -> taime). Distinto da curva de trajetoria do hero.
// prefers-reduced-motion: mostra tudo estatico.
const STEPS = ['TYPE', 'ACT', 'IMPACT', 'MOVE', 'EXIT']

export default function FrameworkFlow({ className }: { className?: string }) {
  const [drawn, setDrawn] = useState(false)
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDrawn(true); return }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { setDrawn(true); io.disconnect(); break }
    }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const W = 520, cy = 52
  const x0 = 46, x1 = 474
  const xs = STEPS.map((_, i) => x0 + ((x1 - x0) * i) / (STEPS.length - 1))

  return (
    <svg ref={ref} viewBox={`0 0 ${W} 118`} className={className} role="img" aria-label="TYPE ACT IMPACT MOVE EXIT">
      {/* Trilho base (faint) */}
      <line x1={x0} y1={cy} x2={x1} y2={cy} stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeLinecap="round" />
      {/* Linha de progressao, desenhando */}
      <line
        x1={x0} y1={cy} x2={x1} y2={cy}
        stroke="url(#flowLine)" strokeWidth="2.5" strokeLinecap="round"
        pathLength={1}
        style={{ strokeDasharray: 1, strokeDashoffset: drawn ? 0 : 1, transition: 'stroke-dashoffset 1.4s cubic-bezier(0.65,0,0.35,1)' }}
      />

      {STEPS.map((step, i) => {
        const x = xs[i]
        const delay = 300 + i * 200
        // progressao de cor: zinc -> emerald -> taime
        const tone = i === 0 ? '#a1a1aa' : i === STEPS.length - 1 ? '#5479ff' : i < 2 ? '#7dd3a8' : '#6ee7b7'
        return (
          <g key={step}
             style={{ opacity: drawn ? 1 : 0, transform: drawn ? 'scale(1)' : 'scale(0.4)', transformOrigin: `${x}px ${cy}px`, transition: `opacity 0.45s ease-out ${delay}ms, transform 0.45s cubic-bezier(0.22,1,0.36,1) ${delay}ms` }}>
            {i === STEPS.length - 1 && <circle cx={x} cy={cy} r="14" fill={tone} opacity="0.18" />}
            <circle cx={x} cy={cy} r="9" fill="#0b1220" stroke={tone} strokeWidth="3" />
            <text x={x} y={cy + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill={tone}>{i + 1}</text>
            <text x={x} y={cy + 34} textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="1.5"
                  fill="rgba(255,255,255,0.82)">{step}</text>
          </g>
        )
      })}

      <defs>
        <linearGradient id="flowLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#a1a1aa" />
          <stop offset="55%"  stopColor="#34d399" />
          <stop offset="100%" stopColor="#5479ff" />
        </linearGradient>
      </defs>
    </svg>
  )
}
