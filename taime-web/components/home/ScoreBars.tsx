'use client'

import { useEffect, useRef, useState } from 'react'

// Mini-cards das dimensoes de score com barra que cresce (0 -> score) ao entrar
// no viewport. Usado no mockup do hero e no showcase (ambos fundo escuro).
// prefers-reduced-motion: mostra a barra ja cheia, sem animar.
function color(score: number): string {
  return score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-orange-400'
}
function barColor(score: number): string {
  return score >= 80 ? 'bg-emerald-400' : score >= 60 ? 'bg-amber-400' : 'bg-orange-400'
}

export default function ScoreBars({
  dims, variant,
}: {
  dims: [string, number][]
  variant: 'hero' | 'showcase'
}) {
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(true); return }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { setShown(true); io.disconnect(); break }
    }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const cardCls  = variant === 'hero' ? 'bg-zinc-800/60 border-zinc-700/50' : 'bg-white/[0.04] border-white/10'
  const trackCls = variant === 'hero' ? 'bg-zinc-700' : 'bg-white/10'
  const gridCls  = variant === 'hero' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-5'

  return (
    <div ref={ref} className={`grid ${gridCls} gap-2`}>
      {dims.map(([label, score], i) => (
        <div key={label + i} className={`rounded-lg border p-2.5 ${cardCls}`}>
          <p className="text-[8px] text-zinc-400 tracking-wide uppercase leading-tight mb-1.5 line-clamp-1">
            {label}
          </p>
          <div className="flex items-baseline gap-2">
            <span className={`text-lg font-bold tabular-nums leading-none ${color(score)}`}>{score}</span>
            <div className={`flex-1 h-1 rounded-full overflow-hidden ${trackCls}`}>
              <div
                className={`h-full rounded-full ${barColor(score)}`}
                style={{
                  width: shown ? `${score}%` : '0%',
                  transition: 'width 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
                  transitionDelay: `${i * 90}ms`,
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
