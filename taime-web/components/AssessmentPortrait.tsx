'use client'

import { DOMAINS, type DomainScore } from '@/lib/assessment-model'

// Retrato por dominio (TAREFA 4): barras 0-100, incompletos claramente marcados como
// incompletos (NUNCA pontuam). Barra cheia (taime) = nota; barra cinza parcial =
// progresso de respostas sem nota ainda. Usado na pagina e no dashboard.
export default function AssessmentPortrait({ domains, isPt, compact }: { domains: DomainScore[]; isPt: boolean; compact?: boolean }) {
  return (
    <div className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      {domains.map(d => {
        const label = DOMAINS.find(x => x.id === d.domain)?.[compact ? 'short' : 'label'][isPt ? 'pt' : 'en'] ?? d.domain
        return (
          <div key={d.domain}>
            <div className="flex items-baseline justify-between mb-1 gap-2">
              <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-medium text-zinc-700 truncate`}>{label}</span>
              <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} shrink-0 tabular-nums font-semibold ${d.scored ? 'text-taime-700' : 'text-zinc-400'}`}>
                {d.scored ? `${d.score}/100` : (isPt ? `incompleto ${d.answered}/4` : `incomplete ${d.answered}/4`)}
              </span>
            </div>
            <div className={`${compact ? 'h-1.5' : 'h-2'} w-full rounded-full bg-zinc-100 overflow-hidden`}
              role="progressbar" aria-valuenow={d.scored ? d.score ?? 0 : 0} aria-valuemin={0} aria-valuemax={100}>
              {d.scored
                ? <div className="h-full rounded-full bg-taime-500 transition-all duration-300" style={{ width: `${d.score}%` }} />
                : <div className="h-full rounded-full bg-zinc-300 transition-all duration-300" style={{ width: `${(d.answered / d.total) * 100}%` }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
