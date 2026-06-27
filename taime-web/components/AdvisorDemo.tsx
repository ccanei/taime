'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface AdvisorMessage {
  role: string
  text: string
}

interface AdvisorDemoProps {
  label:    string
  title:    string
  subtitle: string
  messages: AdvisorMessage[]
  soonNote: string
  cta:      string
  ctaHref:  string
}

// Ritmo da animacao. O indicador de digitando precede cada resposta do
// Advisor; a pausa de leitura depois de cada mensagem escala com o tamanho
// do texto, para que respostas longas fiquem legiveis antes da proxima.
const TYPING_MS  = 1200
const START_MS   = 500
const USER_GAP   = (text: string) => 650 + Math.min(900, text.split(/\s+/).length * 20)
const READ_GAP   = (text: string) => 900 + Math.min(2400, text.split(/\s+/).length * 26)

function isAdvisor(role: string): boolean {
  return role === 'advisor'
}

export default function AdvisorDemo({
  label, title, subtitle, messages, soonNote, cta, ctaHref,
}: AdvisorDemoProps) {
  const [visible, setVisible] = useState(0)
  const [typing, setTyping]   = useState(false)
  const scroller = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mq = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null

    // prefers-reduced-motion: tudo estatico, sem animacao nem digitando.
    if (mq?.matches) {
      setTyping(false)
      setVisible(messages.length)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    const push = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)) }

    let i = 0
    const step = () => {
      if (i >= messages.length) return
      const m = messages[i]
      if (isAdvisor(m.role)) {
        setTyping(true)
        push(() => {
          setTyping(false)
          setVisible(v => v + 1)
          i += 1
          push(step, READ_GAP(m.text))
        }, TYPING_MS)
      } else {
        setVisible(v => v + 1)
        i += 1
        push(step, USER_GAP(m.text))
      }
    }
    push(step, START_MS)

    return () => { timers.forEach(clearTimeout) }
  }, [messages])

  // Mantem a ultima bolha visivel conforme a conversa cresce.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [visible, typing])

  return (
    <section className="relative bg-taime-900 overflow-hidden border-t border-white/5">
      {/* Textura sutil de pontos */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Glow azul */}
      <div
        aria-hidden="true"
        className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full
                   bg-taime-600/30 blur-3xl pointer-events-none"
      />

      <div className="relative max-w-3xl mx-auto px-6 py-24">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold
                           bg-taime-700/40 text-taime-200 ring-1 ring-taime-700 backdrop-blur-sm mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-taime-300" />
            {label}
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-snug mb-4">
            {title}
          </h2>
          <p className="text-base text-white/70 leading-relaxed max-w-xl mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Janela de chat */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-2xl overflow-hidden ring-1 ring-white/5">
          {/* Chrome de janela */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700/80 bg-zinc-900">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
            </div>
            <p className="ml-auto text-[10px] text-zinc-500 font-mono">taime.tech/advisor</p>
          </div>

          {/* Conversa */}
          <div
            ref={scroller}
            className="p-5 sm:p-6 space-y-4 max-h-[28rem] overflow-y-auto"
          >
            {messages.slice(0, visible).map((m, idx) => {
              const advisor = isAdvisor(m.role)
              return (
                <div
                  key={idx}
                  className={`advisor-bubble-in flex ${advisor ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[85%] ${advisor ? 'order-2' : ''}`}>
                    {advisor && (
                      <p className="text-[10px] font-bold tracking-widest text-taime-300 mb-1.5 pl-1">
                        ADVISOR
                      </p>
                    )}
                    <div
                      className={
                        advisor
                          ? 'rounded-2xl rounded-tl-sm bg-zinc-800 border border-zinc-700/60 px-4 py-3 ' +
                            'text-sm text-white/90 leading-relaxed'
                          : 'rounded-2xl rounded-tr-sm bg-taime-500 px-4 py-3 ' +
                            'text-sm text-white leading-relaxed shadow-lg shadow-taime-500/20'
                      }
                    >
                      {m.text}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Indicador de digitando antes da resposta do Advisor */}
            {typing && (
              <div className="advisor-bubble-in flex justify-start">
                <div className="max-w-[85%]">
                  <p className="text-[10px] font-bold tracking-widest text-taime-300 mb-1.5 pl-1">
                    ADVISOR
                  </p>
                  <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-sm
                                  bg-zinc-800 border border-zinc-700/60 px-4 py-3.5">
                    <span className="advisor-dot w-1.5 h-1.5 rounded-full bg-taime-300" style={{ animationDelay: '0ms' }} />
                    <span className="advisor-dot w-1.5 h-1.5 rounded-full bg-taime-300" style={{ animationDelay: '150ms' }} />
                    <span className="advisor-dot w-1.5 h-1.5 rounded-full bg-taime-300" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nota + CTA de acesso antecipado */}
        <div className="mt-8 text-center">
          <p className="text-xs text-white/50 font-medium mb-5">{soonNote}</p>
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-lg
                       bg-taime-500 text-white text-sm font-semibold
                       hover:bg-taime-400 transition-colors shadow-lg shadow-taime-500/30"
          >
            {cta}
          </Link>
        </div>
      </div>
    </section>
  )
}
