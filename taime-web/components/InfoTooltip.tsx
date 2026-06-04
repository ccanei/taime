'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  text:     string
  position?: 'top' | 'bottom'
  width?:    number
  ariaLabel?: string
}

/**
 * Ícone de informação (ⓘ) com tooltip que aparece em hover (desktop)
 * e em tap (mobile). Fecha ao clicar fora.
 */
export default function InfoTooltip({
  text,
  position  = 'top',
  width     = 260,
  ariaLabel = 'Mais informações',
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const positionCls = position === 'top'
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
    : 'top-full left-1/2 -translate-x-1/2 mt-2'

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full
                   text-zinc-400 hover:text-taime-600 transition-colors
                   focus:outline-none focus:ring-2 focus:ring-taime-200 focus:ring-offset-1"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && (
        <div
          role="tooltip"
          className={`absolute z-50 ${positionCls} pointer-events-none`}
          style={{ width }}
        >
          <div className="px-3 py-2 rounded-lg bg-taime-900 text-white text-xs leading-relaxed shadow-lg">
            {text}
          </div>
        </div>
      )}
    </div>
  )
}
