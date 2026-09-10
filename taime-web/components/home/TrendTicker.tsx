'use client'

import Link from 'next/link'

// Faixa horizontal (marquee) com as trends publicadas mais recentes: titulo + score,
// scroll automatico suave via CSS, pausa no hover. Os dados sao renderizados no
// server e passados como props (sem fetch no cliente). A lista e duplicada para o
// loop continuo. prefers-reduced-motion: sem animacao (fica estatica, com scroll
// horizontal manual disponivel).

export interface TickerItem {
  title: string
  score: number
  href:  string
}

function tone(score: number): string {
  return score >= 80 ? 'text-emerald-300' : score >= 60 ? 'text-amber-300' : 'text-orange-300'
}

export default function TrendTicker({ items, label }: { items: TickerItem[]; label: string }) {
  if (items.length === 0) return null
  const loop = [...items, ...items] // duplica para o loop sem emenda
  const dur = Math.max(28, items.length * 5) // velocidade constante independente da quantidade

  return (
    <section aria-label={label} className="bg-taime-900 border-t border-white/10 overflow-hidden">
      <style>{`
        @keyframes taime-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .taime-ticker-track { animation: taime-ticker var(--dur, 40s) linear infinite; will-change: transform }
        .taime-ticker-root:hover .taime-ticker-track { animation-play-state: paused }
        @media (prefers-reduced-motion: reduce) { .taime-ticker-track { animation: none } }
      `}</style>
      <div className="relative">
        {/* fades laterais para suavizar as bordas */}
        <div aria-hidden className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none
                                    bg-gradient-to-r from-taime-900 to-transparent" />
        <div aria-hidden className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none
                                    bg-gradient-to-l from-taime-900 to-transparent" />
        <div className="taime-ticker-root overflow-x-auto sm:overflow-hidden py-3
                        [scrollbar-width:none] [-ms-overflow-style:none]">
          <div className="taime-ticker-track flex items-center gap-3 w-max"
               style={{ ['--dur' as string]: `${dur}s` }}>
            {loop.map((it, i) => (
              <Link
                key={i}
                href={it.href}
                aria-hidden={i >= items.length ? true : undefined}
                tabIndex={i >= items.length ? -1 : undefined}
                className="group inline-flex items-center gap-2.5 shrink-0 rounded-full
                           border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]
                           hover:border-white/20 transition-colors pl-2 pr-4 py-1.5"
              >
                <span className={`inline-flex items-center justify-center min-w-[30px] h-[26px] rounded-full
                                  bg-white/[0.06] text-xs font-bold tabular-nums ${tone(it.score)}`}>
                  {it.score}
                </span>
                <span className="text-xs font-medium text-white/75 group-hover:text-white
                                 whitespace-nowrap max-w-[280px] truncate">
                  {it.title}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
