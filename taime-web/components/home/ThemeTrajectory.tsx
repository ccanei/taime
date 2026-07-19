'use client'

import { useEffect, useRef, useState } from 'react'

export interface TrajectoryMoment {
  period: string
  label:  string
  text:   string
}

// Linha do tempo de um tema (IA agentica) atraves dos anos. Horizontal no desktop,
// vertical no mobile. Conteudo curado (i18n estatico), destilado do arquivo real.
// Prova estatica, sem link. Reveal suave ao entrar no viewport (reduced-motion ok).
export default function ThemeTrajectory({
  label, title, subtitle, moments,
}: {
  label:    string
  title:    string
  subtitle: string
  moments:  TrajectoryMoment[]
}) {
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(true); return }
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { setShown(true); io.disconnect(); break }
    }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section className="relative border-t border-zinc-100 bg-white py-24 overflow-hidden">
      {/* Textura sutil de grid fino, para ritmo visual */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.5] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(84,121,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(84,121,255,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)',
        }}
      />

      <div ref={ref} className="relative max-w-6xl mx-auto px-6">
        <p className="section-label mb-3">{label}</p>
        <h2 className="text-3xl font-bold text-zinc-900 mb-3 max-w-3xl leading-snug">{title}</h2>
        <p className="text-sm text-zinc-500 max-w-2xl mb-14 leading-relaxed">{subtitle}</p>

        <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-6">
          {/* Trilho horizontal (desktop): passado -> futuro (zinc -> taime) */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-4 left-[12.5%] right-[12.5%] h-0.5 z-0"
            style={{ background: 'linear-gradient(to right, rgba(161,161,170,0.5) 0%, rgba(84,121,255,0.35) 70%, rgba(84,121,255,0.7) 100%)' }}
          />
          {/* Trilho vertical (mobile) */}
          <div
            aria-hidden="true"
            className="lg:hidden absolute top-4 bottom-4 left-[7px] w-0.5 z-0"
            style={{ background: 'linear-gradient(to bottom, rgba(161,161,170,0.5) 0%, rgba(84,121,255,0.7) 100%)' }}
          />

          {moments.map((m, i) => {
            const isNext = i === moments.length - 1
            return (
              <div
                key={m.period}
                className="relative z-10 flex lg:flex-col gap-4 lg:gap-0"
                style={{
                  opacity: shown ? 1 : 0,
                  transform: shown ? 'none' : 'translateY(14px)',
                  transition: 'opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.22,1,0.36,1)',
                  transitionDelay: `${i * 130}ms`,
                }}
              >
                {/* No do trilho */}
                <div className="shrink-0 lg:mb-5">
                  <span
                    className={`block w-4 h-4 rounded-full ring-4 ring-white
                      ${isNext ? 'bg-taime-500 shadow-md shadow-taime-500/40' : 'bg-zinc-300'}`}
                  />
                </div>

                <div className="flex-1 min-w-0 lg:pr-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-sm font-bold tabular-nums ${isNext ? 'text-taime-700' : 'text-zinc-900'}`}>
                      {m.period}
                    </span>
                    <span
                      className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full
                        ${isNext ? 'bg-taime-50 text-taime-700 ring-1 ring-taime-100' : 'bg-zinc-100 text-zinc-500'}`}
                    >
                      {m.label}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 leading-relaxed">{m.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
