'use client'

import { useEffect, useRef, useState } from 'react'

export interface TimelineItem {
  name:  string
  start: number   // ano de inicio da barra
}

// Grafico de linha do tempo (Gantt editorial): eixo comum de anos (2015 -> hoje)
// e 8 temas como barras horizontais, cada uma comecando no seu ano e correndo ate
// "hoje". Barras posicionadas por porcentagem no eixo (viz propria, sem libs),
// com desenho da esquerda para a direita ao entrar no viewport. Responsivo: no
// desktop o nome fica a esquerda; no mobile o nome sobe acima da barra (grid que
// colapsa para 1 coluna). prefers-reduced-motion respeitado.
const AXIS_START = 2015
const AXIS_END   = 2026 // escala; a ponta direita e rotulada "hoje"/"today"
const TICKS = [2015, 2018, 2021, 2024]

// Tonalidades da familia taime (variacao sutil por tema, mantendo sobriedade).
const TONES = ['#1D4ED8', '#2f5cf5', '#3a63f0', '#2f5cf5', '#1D4ED8', '#3a63f0', '#2f5cf5', '#1D4ED8']

function pos(year: number): number {
  return Math.max(0, Math.min(100, ((year - AXIS_START) / (AXIS_END - AXIS_START)) * 100))
}

export default function ThemeTimeline({
  title, subtitle, todayLabel, sinceLabel, items,
}: {
  title:      string
  subtitle:   string
  todayLabel: string
  sinceLabel: string
  items:      TimelineItem[]
}) {
  const [drawn, setDrawn] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDrawn(true); return }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { setDrawn(true); io.disconnect(); break }
    }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Gridlines verticais tenues nas trilhas, nos anos de referencia.
  const gridBg = [
    ...TICKS.map(y => `linear-gradient(90deg, transparent calc(${pos(y)}% - 1px), rgba(84,121,255,0.10) ${pos(y)}%, transparent calc(${pos(y)}% + 1px))`),
    `linear-gradient(90deg, transparent calc(100% - 1px), rgba(84,121,255,0.10) 100%, transparent 100%)`,
  ].join(',')

  const NAME_COL = 'sm:grid-cols-[minmax(0,15rem)_1fr]'

  return (
    <div ref={ref}>
      <h3 className="text-2xl sm:text-3xl font-bold text-zinc-900 leading-snug">{title}</h3>
      <p className="text-sm text-zinc-500 leading-relaxed mt-2 mb-8">{subtitle}</p>

      {/* Eixo de anos (comum), alinhado a coluna das barras */}
      <div className={`grid ${NAME_COL} gap-x-5`}>
        <div className="hidden sm:block" />
        <div className="relative h-5 mb-1">
          {TICKS.map(y => (
            <span key={y} className="absolute -translate-x-1/2 text-[10px] font-medium text-zinc-400 tabular-nums"
                  style={{ left: `${pos(y)}%` }}>{y}</span>
          ))}
          <span className="absolute right-0 translate-x-0 text-[10px] font-bold text-taime-600 uppercase tracking-wide">
            {todayLabel}
          </span>
        </div>
      </div>

      {/* Linhas do Gantt */}
      <div className="space-y-3 sm:space-y-2">
        {items.map((it, i) => {
          const left = pos(it.start)
          return (
            <div key={it.name} className={`grid ${NAME_COL} gap-x-5 gap-y-1 sm:items-center`}>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-sm font-medium text-zinc-800 leading-snug">{it.name}</span>
                <span className="sm:hidden shrink-0 text-[11px] text-zinc-400 tabular-nums">{sinceLabel} {it.start}</span>
              </div>
              <div className="relative h-7 rounded-md bg-zinc-100/70" style={{ backgroundImage: gridBg }}>
                <div
                  className="absolute inset-y-1 rounded flex items-center"
                  style={{
                    left:  `${left}%`,
                    right: '0%',
                    background: `linear-gradient(90deg, ${TONES[i % TONES.length]}, #93b0ff)`,
                    transformOrigin: 'left',
                    transform: drawn ? 'scaleX(1)' : 'scaleX(0)',
                    transition: `transform 0.9s cubic-bezier(0.22,1,0.36,1) ${i * 90}ms`,
                  }}
                >
                  <span
                    className="pl-2 text-[10px] font-bold text-white/90 tabular-nums"
                    style={{ opacity: drawn ? 1 : 0, transition: `opacity 0.5s ease ${i * 90 + 500}ms` }}
                  >
                    {it.start}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
