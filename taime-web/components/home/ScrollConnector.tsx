'use client'

import { useEffect, useState } from 'react'

// Linha de conexao vertical sutil no lado esquerdo, que se preenche conforme o
// scroll da pagina liga as secoes visualmente. Fixa, atras do conteudo, so em
// telas grandes (hidden em mobile, onde competiria com o layout estreito).
// Leve: um unico listener de scroll com throttle via requestAnimationFrame.
export default function ScrollConnector() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = document.documentElement
        const max = el.scrollHeight - el.clientHeight
        setProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const pct = `${(progress * 100).toFixed(2)}%`
  return (
    <div aria-hidden="true"
         className="hidden lg:block fixed left-[max(1.5rem,calc((100vw-80rem)/2-1.5rem))] top-24 bottom-12 w-px z-30 pointer-events-none">
      {/* trilho tenue */}
      <div className="absolute inset-0 rounded-full bg-zinc-300/40" />
      {/* preenchimento por scroll */}
      <div className="absolute inset-x-0 top-0 rounded-full bg-gradient-to-b from-taime-400 via-taime-500 to-taime-600"
           style={{ height: pct }} />
      {/* cabeca do preenchimento */}
      <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-taime-500 ring-2 ring-taime-500/25"
           style={{ top: `calc(${pct} - 4px)` }} />
    </div>
  )
}
