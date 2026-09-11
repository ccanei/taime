import Link from 'next/link'

// Card do Executive Advisor na home: preview do TOM real, como bolhas de chat (pergunta
// curta + inicio de resposta). Server component, estatico, sem imagem generica. Estilo
// escuro premium coerente com o hero. Conteudo representativo, nao um dado real de cliente.

export default function AdvisorPreviewCard({ isEn }: { isEn: boolean }) {
  const t = {
    kicker:   'EXECUTIVE ADVISOR',
    title:    isEn ? 'Want to discuss a specific challenge?' : 'Quer conversar sobre um desafio específico?',
    subtitle: isEn ? 'We analyze your company\'s context before responding.' : 'Analisamos o contexto da sua empresa antes de responder.',
    cta:      isEn ? 'Ask the Advisor →' : 'Perguntar ao Advisor →',
    q:        isEn
      ? 'We run agents in production without an inventory. Where do we start?'
      : 'Rodamos agentes em produção sem inventário. Por onde começar?',
    a:        isEn
      ? 'Before scaling, the priority is an auditable inventory: one agent per line, with owner, access scope and human checkpoint. The archive shows this is what turns diffuse risk into...'
      : 'Antes de escalar, a prioridade é um inventário auditável: um agente por linha, com dono, escopo de acesso e checkpoint humano. O arquivo mostra que é isso que transforma risco difuso em...',
  }

  return (
    <div className="flex flex-col rounded-2xl bg-zinc-900/70 border border-white/10 ring-1 ring-white/5 shadow-2xl p-6 sm:p-7 backdrop-blur-sm">
      <p className="text-[10px] font-bold tracking-widest uppercase text-taime-300 mb-2">{t.kicker}</p>
      <h3 className="text-xl font-bold text-white leading-snug mb-1.5">{t.title}</h3>
      <p className="text-sm text-white/60 leading-relaxed mb-5">{t.subtitle}</p>

      <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-6 flex flex-col gap-3">
        {/* Pergunta do cliente (bolha a direita) */}
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-taime-500/90 text-white text-[13px] leading-relaxed px-3.5 py-2.5">
            {t.q}
          </div>
        </div>
        {/* Resposta do Advisor (bolha a esquerda, com avatar) */}
        <div className="flex items-start gap-2">
          <span className="shrink-0 w-6 h-6 rounded-full bg-taime-600 flex items-center justify-center text-[11px] font-bold text-white">T</span>
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/[0.06] text-white/85 text-[13px] leading-relaxed px-3.5 py-2.5">
            {t.a}
            <span className="inline-block w-[3px] h-3.5 ml-0.5 align-[-2px] bg-taime-400 rounded-sm" aria-hidden="true" />
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
    </div>
  )
}
