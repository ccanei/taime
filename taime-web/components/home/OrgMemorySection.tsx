import Link from 'next/link'
import { Cpu, Rocket, Target, CheckCircle2, ShieldAlert } from 'lucide-react'

// Seccao de memoria da empresa (org_memory) na home. Substitui a demo antiga do chat:
// o conceito de "parceiro que conhece seu contexto" agora vive no card do Advisor
// (dois-cards), e aqui reforcamos a MEMORIA acumulada entre sessoes. Estilo escuro
// premium. As categorias espelham as reais do schema advisor_company_facts (technology,
// project, priority, decision, constraint), simplificadas para 5 na exibicao.

export default function OrgMemorySection({ isEn }: { isEn: boolean }) {
  const t = {
    kicker:   isEn ? 'COMPANY MEMORY' : 'MEMÓRIA DA EMPRESA',
    title:    isEn ? 'The Advisor remembers your company' : 'O Advisor lembra da sua empresa',
    subtitle: isEn
      ? 'With every conversation, it accumulates real context: technologies in use, ongoing projects, priorities and constraints. Nothing gets lost between sessions.'
      : 'A cada conversa, ele acumula contexto real: tecnologias em uso, projetos em andamento, prioridades e restrições. Nada se perde entre sessões.',
    cta:      isEn ? 'Try the Advisor →' : 'Experimente o Advisor →',
  }

  // 5 categorias principais (schema: technology / project / priority / decision / constraint).
  const cats: Array<{ icon: typeof Cpu; label: string }> = [
    { icon: Cpu,          label: isEn ? 'Technologies' : 'Tecnologias' },
    { icon: Rocket,       label: isEn ? 'Projects'     : 'Projetos' },
    { icon: Target,       label: isEn ? 'Priorities'   : 'Prioridades' },
    { icon: CheckCircle2, label: isEn ? 'Decisions'    : 'Decisões' },
    { icon: ShieldAlert,  label: isEn ? 'Constraints'  : 'Restrições' },
  ]

  return (
    <section className="relative bg-taime-900 border-t border-white/10 overflow-hidden">
      {/* Textura sutil de pontos, coerente com o hero */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}
      />
      <div className="relative max-w-5xl mx-auto px-6 py-24 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-taime-300 mb-4">{t.kicker}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white leading-snug mb-4">{t.title}</h2>
        <p className="text-base text-white/70 leading-relaxed max-w-2xl mx-auto mb-12">{t.subtitle}</p>

        {/* Diagrama: conversas alimentam a memoria, que se divide em categorias */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {cats.map(({ icon: Icon, label }, i) => (
            <div key={label} className="flex items-center gap-3 sm:gap-4">
              <div className="flex flex-col items-center gap-2 w-24">
                <span className="w-12 h-12 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 text-taime-300 flex items-center justify-center">
                  <Icon size={22} />
                </span>
                <span className="text-xs font-semibold text-white/80 leading-tight text-center">{label}</span>
              </div>
              {i < cats.length - 1 && (
                <span aria-hidden="true" className="hidden sm:block w-6 h-px bg-gradient-to-r from-taime-500/60 to-taime-400/30" />
              )}
            </div>
          ))}
        </div>

        <Link
          href="/advisor"
          className="mt-12 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg
                     bg-taime-500 text-white text-sm font-semibold hover:bg-taime-400 transition-colors
                     shadow-lg shadow-taime-500/30"
        >
          {t.cta}
        </Link>
      </div>
    </section>
  )
}
