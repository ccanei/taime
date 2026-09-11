'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// Card do Executive Advisor: simulacao de conversa REAL acontecendo (typewriter). A
// pergunta do usuario aparece caractere a caractere, o Advisor "pensa" (dots pulsando)
// e a resposta tambem sai caractere a caractere. As mensagens se acumulam num container
// de altura fixa com auto-scroll para a mais recente; apos os 8 pares a conversa reinicia
// (fade + reset). prefers-reduced-motion: conversa completa direto, sem digitacao nem loop.
//
// Timers: um unico driver recursivo (wait via setTimeout) com flag `alive` e id guardado
// em ref; o cleanup do useEffect zera a flag e limpa o timer pendente (sem vazamento).

interface Line { role: 'user' | 'advisor'; text: string }

const PAIRS: Array<{ q: { pt: string; en: string }; a: { pt: string; en: string } }> = [
  { q: { pt: 'Rodamos agentes em produção sem inventário formal. Por onde começar?',
         en: 'We run agents in production without a formal inventory. Where do we start?' },
    a: { pt: 'Mapeie um agente por vez: dono, escopo de acesso e checkpoint humano definidos antes de escalar.',
         en: 'Map one agent at a time: owner, access scope and a defined human checkpoint before scaling.' } },
  { q: { pt: 'Vale migrar nosso CRM agora ou esperar mais um ciclo?',
         en: 'Is it worth migrating our CRM now or waiting another cycle?' },
    a: { pt: 'Depende do custo de troca versus o risco de ficar preso a um fornecedor perdendo relevância no mercado.',
         en: 'It depends on the switching cost versus the risk of being locked into a vendor losing market relevance.' } },
  { q: { pt: 'Como sabemos se estamos atrasados em governança de IA?',
         en: 'How do we know if we are behind on AI governance?' },
    a: { pt: 'Comparamos sua maturidade atual com o que já é padrão de mercado para empresas do seu porte.',
         en: 'We compare your current maturity with what is already market standard for companies of your size.' } },
  { q: { pt: 'Nosso time de dados está sobrecarregado. IA resolve isso?',
         en: 'Our data team is overloaded. Does AI solve that?' },
    a: { pt: 'IA reduz trabalho repetitivo, mas não substitui decisão sobre arquitetura e qualidade de dados.',
         en: 'AI reduces repetitive work, but it does not replace decisions on data architecture and quality.' } },
  { q: { pt: 'Quando faz sentido considerar computação quântica comercial?',
         en: 'When does it make sense to consider commercial quantum computing?' },
    a: { pt: 'Para a maioria das empresas, ainda é cedo. O sinal certo é monitorar, não agir.',
         en: 'For most companies, it is still early. The right signal is to monitor, not to act.' } },
  { q: { pt: 'Como priorizamos entre segurança e velocidade de entrega?',
         en: 'How do we prioritize between security and delivery speed?' },
    a: { pt: 'Não são opostos quando a governança é desenhada como parte do processo, não como barreira depois.',
         en: 'They are not opposites when governance is designed as part of the process, not a barrier afterward.' } },
  { q: { pt: 'Vale terceirizar IA generativa ou construir internamente?',
         en: 'Is it worth outsourcing generative AI or building in-house?' },
    a: { pt: 'Depende de quão central essa capacidade é para sua vantagem competitiva de longo prazo.',
         en: 'It depends on how central that capability is to your long term competitive advantage.' } },
  { q: { pt: 'Nossos concorrentes já anunciaram agentes autônomos. Devemos correr?',
         en: 'Our competitors already announced autonomous agents. Should we rush?' },
    a: { pt: 'Corrida por anúncio raramente vence. Corrida por execução consistente, sim.',
         en: 'A race for announcements rarely wins. A race for consistent execution does.' } },
]

const CHAR_MS = 22       // velocidade da digitacao
const THINK_MS = 800     // pausa "pensando"
const AFTER_MSG_MS = 500 // pausa apos cada mensagem completa
const HOLD_MS = 2600     // segura a conversa completa antes de reiniciar
const FADE_MS = 600      // fade out no reset

export default function AdvisorPreviewCard({ isEn }: { isEn: boolean }) {
  const lang: 'pt' | 'en' = isEn ? 'en' : 'pt'
  const t = {
    kicker:   'EXECUTIVE ADVISOR',
    title:    isEn ? 'Want to discuss a specific challenge?' : 'Quer conversar sobre um desafio específico?',
    subtitle: isEn ? 'We analyze your company\'s context before responding.' : 'Analisamos o contexto da sua empresa antes de responder.',
    cta:      isEn ? 'Ask the Advisor →' : 'Perguntar ao Advisor →',
  }

  const [lines, setLines]       = useState<Line[]>([])
  const [thinking, setThinking] = useState(false)
  const [fading, setFading]     = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll para a mensagem mais recente a cada atualizacao.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [lines, thinking])

  useEffect(() => {
    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Sem animacao: conversa completa, estatica.
    if (reduced) {
      setLines(PAIRS.flatMap(p => [
        { role: 'user' as const, text: p.q[lang] },
        { role: 'advisor' as const, text: p.a[lang] },
      ]))
      return
    }

    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const wait = (ms: number) => new Promise<void>(res => { timer = setTimeout(res, ms) })

    async function typeMessage(role: 'user' | 'advisor', full: string) {
      setLines(prev => [...prev, { role, text: '' }])
      for (let i = 1; i <= full.length; i++) {
        await wait(CHAR_MS)
        if (!alive) return
        setLines(prev => {
          const cp = prev.slice()
          cp[cp.length - 1] = { role, text: full.slice(0, i) }
          return cp
        })
      }
    }

    async function run() {
      while (alive) {
        setFading(false)
        setLines([])
        for (const p of PAIRS) {
          if (!alive) return
          await typeMessage('user', p.q[lang]); if (!alive) return
          setThinking(true)
          await wait(THINK_MS); if (!alive) return
          setThinking(false)
          await typeMessage('advisor', p.a[lang]); if (!alive) return
          await wait(AFTER_MSG_MS); if (!alive) return
        }
        await wait(HOLD_MS); if (!alive) return
        setFading(true)
        await wait(FADE_MS); if (!alive) return
      }
    }

    run()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [lang])

  return (
    <div className="flex flex-col rounded-2xl bg-zinc-900/70 border border-white/10 ring-1 ring-white/5 shadow-2xl p-6 sm:p-7 backdrop-blur-sm">
      <p className="text-[10px] font-bold tracking-widest uppercase text-taime-300 mb-2">{t.kicker}</p>
      <h3 className="text-xl font-bold text-white leading-snug mb-1.5">{t.title}</h3>
      <p className="text-sm text-white/60 leading-relaxed mb-5">{t.subtitle}</p>

      {/* Wrapper de ALTURA FIXA: o scroll acontece DENTRO deste bloco (nao na pagina);
          o card nunca cresce com novas mensagens. O fade no topo suaviza as que saem. */}
      <div className="relative h-[300px] mb-6">
      <div
        ref={scrollRef}
        className={`h-full overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-4
                    flex flex-col gap-3 transition-opacity [scrollbar-width:none] [-ms-overflow-style:none]
                    ${fading ? 'opacity-0' : 'opacity-100'}`}
        style={{ transitionDuration: `${FADE_MS}ms` }}
        aria-live="polite"
      >
        {lines.map((l, i) => (
          l.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-taime-500/90 text-white text-[13px] leading-relaxed px-3.5 py-2.5">
                {l.text}
                {i === lines.length - 1 && !thinking && <span className="taime-cursor inline-block w-[3px] h-3.5 ml-0.5 align-[-2px] bg-white/70 rounded-sm" aria-hidden="true" />}
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-taime-600 flex items-center justify-center text-[11px] font-bold text-white">T</span>
              <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white/[0.06] text-white/85 text-[13px] leading-relaxed px-3.5 py-2.5">
                {l.text}
                {i === lines.length - 1 && <span className="taime-cursor inline-block w-[3px] h-3.5 ml-0.5 align-[-2px] bg-taime-400 rounded-sm" aria-hidden="true" />}
              </div>
            </div>
          )
        ))}
        {/* Indicador de "pensando" (tres pontos pulsando) */}
        {thinking && (
          <div className="flex items-start gap-2">
            <span className="shrink-0 w-6 h-6 rounded-full bg-taime-600 flex items-center justify-center text-[11px] font-bold text-white">T</span>
            <div className="rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-3 flex items-center gap-1">
              <span className="taime-dot w-1.5 h-1.5 rounded-full bg-white/50" />
              <span className="taime-dot w-1.5 h-1.5 rounded-full bg-white/50" style={{ animationDelay: '0.2s' }} />
              <span className="taime-dot w-1.5 h-1.5 rounded-full bg-white/50" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
      </div>
        {/* Fade no topo: mensagens saindo por cima somem suavemente sob o gradiente. */}
        <div aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-t-xl bg-gradient-to-b from-zinc-900 to-transparent" />
      </div>

      <Link
        href="/advisor"
        className="mt-auto inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg
                   bg-taime-500 text-white text-sm font-semibold hover:bg-taime-400 transition-colors"
      >
        {t.cta}
      </Link>

      <style>{`
        @keyframes taime-blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
        .taime-cursor { animation: taime-blink 1.1s step-end infinite }
        @keyframes taime-dot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.5 } 30% { transform: translateY(-3px); opacity: 1 } }
        .taime-dot { animation: taime-dot 1.1s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .taime-cursor, .taime-dot { animation: none } }
      `}</style>
    </div>
  )
}
