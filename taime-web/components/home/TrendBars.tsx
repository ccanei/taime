import type { Lang } from '@/lib/decision-check'

// Grafico de barras verticais das 5 dimensoes do score, extraido do estilo da seccao
// Framework TAIME (as 5 barras azuis). Reutilizavel: fundo escuro (Framework, sem
// rotulos) ou claro (cards de tendencia, com rotulos abreviados). Server component,
// zero JS. Ordem das dimensoes = DIM_ORDER (Maturidade, Pressão Competitiva, Impacto
// Estratégico, Complexidade, Risco de Atraso).

const SHORT_LABELS: Record<Lang, string[]> = {
  pt: ['Mat.', 'Pres.', 'Imp.', 'Cpx.', 'Risco'],
  en: ['Mat.', 'Pres.', 'Imp.', 'Cpx.', 'Risk'],
}

type Tone = 'dark' | 'light'

export default function TrendBars({
  values, lang = 'en', tone = 'light', showLabels = true, className,
}: {
  values: number[]
  lang?: Lang
  tone?: Tone
  showLabels?: boolean
  className?: string
}) {
  const names = SHORT_LABELS[lang]
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  // dark = mesmo gradiente translucido da secao Framework; light = gradiente solido
  // para contraste sobre card branco.
  const barCls = tone === 'dark'
    ? 'bg-gradient-to-t from-taime-600/40 to-taime-400'
    : 'bg-gradient-to-t from-taime-600 to-taime-400'
  const labelCls = tone === 'dark' ? 'text-white/50' : 'text-zinc-400'

  return (
    <div className={className}>
      <div className="flex items-end gap-1.5 h-20">
        {values.map((v, i) => (
          <div key={i} className="flex-1 flex items-end h-full">
            <div className={`w-full rounded-t ${barCls}`} style={{ height: `${Math.max(6, clamp(v))}%` }} />
          </div>
        ))}
      </div>
      {showLabels && (
        <div className="flex gap-1.5 mt-1.5">
          {names.map((n, i) => (
            <span key={i} className={`flex-1 text-center text-[9px] font-semibold leading-none ${labelCls}`}>{n}</span>
          ))}
        </div>
      )}
    </div>
  )
}
