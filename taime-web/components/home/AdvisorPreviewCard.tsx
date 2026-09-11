import Link from 'next/link'

// Card do Executive Advisor na home. Server component, estilo escuro premium coerente
// com o card do Decision Check ao lado. Sem snippet de conversa simulada: uma frase
// direta sobre o valor (contexto da empresa + clareza de decisao).

export default function AdvisorPreviewCard({ isEn }: { isEn: boolean }) {
  const t = {
    kicker:   'EXECUTIVE ADVISOR',
    title:    isEn ? 'Want to discuss a specific challenge?' : 'Quer conversar sobre um desafio específico?',
    subtitle: isEn ? 'We analyze your company\'s context before responding.' : 'Analisamos o contexto da sua empresa antes de responder.',
    body:     isEn
      ? 'Knows your company\'s context and helps you decide with more clarity.'
      : 'Conhece o contexto da sua empresa e te ajuda a decidir com mais clareza.',
    cta:      isEn ? 'Ask the Advisor →' : 'Perguntar ao Advisor →',
  }

  return (
    <div className="flex flex-col rounded-2xl bg-zinc-900/70 border border-white/10 ring-1 ring-white/5 shadow-2xl p-6 sm:p-7 backdrop-blur-sm">
      <p className="text-[10px] font-bold tracking-widest uppercase text-taime-300 mb-2">{t.kicker}</p>
      <h3 className="text-xl font-bold text-white leading-snug mb-1.5">{t.title}</h3>
      <p className="text-sm text-white/60 leading-relaxed mb-5">{t.subtitle}</p>

      <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-6 mb-6 flex items-center gap-4">
        <span className="shrink-0 w-11 h-11 rounded-full bg-taime-600 flex items-center justify-center text-base font-bold text-white">T</span>
        <p className="text-[15px] text-white/85 leading-relaxed">{t.body}</p>
      </div>

      <Link
        href="/advisor"
        className="mt-auto inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg
                   bg-taime-500 text-white text-sm font-semibold hover:bg-taime-400 transition-colors"
      >
        {t.cta}
      </Link>
    </div>
  )
}
