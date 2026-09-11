'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Card do Executive Advisor na home. Client component: rotaciona entre pares
// pergunta/resposta COMPLETOS (nunca truncados) com fade suave a cada ~5s e um cursor
// piscando ao fim da resposta, dando sensacao de conversa viva sem simular digitacao
// caractere a caractere. prefers-reduced-motion: mostra so o 1o par, sem rotacao.

const PAIRS: Array<{ q: { pt: string; en: string }; a: { pt: string; en: string } }> = [
  {
    q: { pt: 'Rodamos agentes em produção sem inventário formal. Por onde começar?',
         en: 'We run agents in production without a formal inventory. Where do we start?' },
    a: { pt: 'Antes de escalar, mapeie um agente por vez: dono, escopo de acesso e checkpoint humano definidos.',
         en: 'Before scaling, map one agent at a time: owner, access scope and a defined human checkpoint.' },
  },
  {
    q: { pt: 'Vale migrar nosso CRM agora ou esperar mais um ciclo?',
         en: 'Is it worth migrating our CRM now or waiting another cycle?' },
    a: { pt: 'Depende do custo de troca versus o risco de ficar preso a um fornecedor que está perdendo relevância.',
         en: 'It depends on the switching cost versus the risk of being locked into a vendor that is losing relevance.' },
  },
  {
    q: { pt: 'Como sabemos se estamos atrasados em governança de IA?',
         en: 'How do we know if we are behind on AI governance?' },
    a: { pt: 'Comparamos sua maturidade atual com o que já é padrão de mercado para empresas do seu porte.',
         en: 'We compare your current maturity with what is already market standard for companies of your size.' },
  },
]

export default function AdvisorPreviewCard({ isEn }: { isEn: boolean }) {
  const lang: 'pt' | 'en' = isEn ? 'en' : 'pt'
  const t = {
    kicker:   'EXECUTIVE ADVISOR',
    title:    isEn ? 'Want to discuss a specific challenge?' : 'Quer conversar sobre um desafio específico?',
    subtitle: isEn ? 'We analyze your company\'s context before responding.' : 'Analisamos o contexto da sua empresa antes de responder.',
    cta:      isEn ? 'Ask the Advisor →' : 'Perguntar ao Advisor →',
  }

  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Ciclo: mostra ~4.4s, faz fade-out (0.6s), troca o par, fade-in.
    const hold = setInterval(() => {
      setVisible(false)
      const swap = setTimeout(() => {
        setIdx(i => (i + 1) % PAIRS.length)
        setVisible(true)
      }, 600)
      return () => clearTimeout(swap)
    }, 5000)
    return () => clearInterval(hold)
  }, [])

  const pair = PAIRS[idx]

  return (
    <div className="flex flex-col rounded-2xl bg-zinc-900/70 border border-white/10 ring-1 ring-white/5 shadow-2xl p-6 sm:p-7 backdrop-blur-sm">
      <p className="text-[10px] font-bold tracking-widest uppercase text-taime-300 mb-2">{t.kicker}</p>
      <h3 className="text-xl font-bold text-white leading-snug mb-1.5">{t.title}</h3>
      <p className="text-sm text-white/60 leading-relaxed mb-5">{t.subtitle}</p>

      <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-6 flex flex-col gap-3 justify-center min-h-[170px]">
        <div className={`flex flex-col gap-3 transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
          {/* Pergunta do cliente (bolha a direita) */}
          <div className="flex justify-end">
            <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-taime-500/90 text-white text-[13px] leading-relaxed px-3.5 py-2.5">
              {pair.q[lang]}
            </div>
          </div>
          {/* Resposta do Advisor (bolha a esquerda, com avatar + cursor piscando) */}
          <div className="flex items-start gap-2">
            <span className="shrink-0 w-6 h-6 rounded-full bg-taime-600 flex items-center justify-center text-[11px] font-bold text-white">T</span>
            <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white/[0.06] text-white/85 text-[13px] leading-relaxed px-3.5 py-2.5">
              {pair.a[lang]}
              <span className="taime-cursor inline-block w-[3px] h-3.5 ml-0.5 align-[-2px] bg-taime-400 rounded-sm" aria-hidden="true" />
            </div>
          </div>
        </div>
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
        @media (prefers-reduced-motion: reduce) { .taime-cursor { animation: none } }
      `}</style>
    </div>
  )
}
