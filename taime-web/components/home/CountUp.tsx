'use client'

import { useEffect, useRef, useState } from 'react'

// Contador que anima de 0 ate `to` quando entra no viewport. CSS/JS puro, sem lib.
// Respeita prefers-reduced-motion (mostra o valor final sem animar).
export default function CountUp({
  to, prefix = '', suffix = '', separator = false, durationMs = 1400, className,
}: {
  to: number
  prefix?: string
  suffix?: string
  separator?: boolean   // milhar com separador local
  durationMs?: number
  className?: string
}) {
  const [val, setVal] = useState(0)
  const ref  = useRef<HTMLSpanElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setVal(to); return }

    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting && !done.current) {
          done.current = true
          const start = performance.now()
          const step = (now: number) => {
            const p = Math.min(1, (now - start) / durationMs)
            const eased = 1 - Math.pow(1 - p, 3) // ease-out cubico
            setVal(Math.round(to * eased))
            if (p < 1) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }
      }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [to, durationMs])

  const shown = separator ? val.toLocaleString() : String(val)
  return <span ref={ref} className={className}>{prefix}{shown}{suffix}</span>
}
