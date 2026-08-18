'use client'

import { useState } from 'react'
import {
  Compass, LineChart, Target, Crosshair, ShieldAlert, Sparkles,
  Play, MessageSquareText, type LucideIcon,
} from 'lucide-react'

// Tela de chegada do Advisor (aba Inicio) e do /ask. Presentacional: cabecalho de
// apresentacao, linha de credibilidade com numeros do arquivo, e grade de 4 cards.
// Estetica clara e sobria (sem dark mode, sem gradiente, sem emoji/mascote); mesmos
// tokens dos cards do dashboard.

export interface ArrivalStats {
  editions:  number
  trends:    number
  startYear: string | null
  endYear:   string | null
  byYear?:   Record<string, number>   // tendencias por ano, para a timeline de densidade
}

// Timeline do acervo: soma ACUMULADA de tendencias analisadas ate cada ano (curva
// ascendente = acervo em construcao continua, nao densidade que "cai"). Area+linha na
// cor da marca. Titulo com N anos calculado do primeiro ano do acervo. Valor final
// marcado na ponta direita. Hover mostra o acumulado do ano. Fail-safe: sem dados
// suficientes, nao renderiza.
export function ArchiveDensity({ byYear, isPt }: { byYear: Record<string, number>; isPt: boolean }) {
  const years = Object.keys(byYear).map(Number).filter(y => y >= 2000 && y <= 2100).sort((a, b) => a - b)
  if (years.length < 2) return null
  const start = years[0]
  const end = years[years.length - 1]
  const locale = isPt ? 'pt-BR' : 'en-US'

  // Acumulado por ano (anos sem dado carregam o total anterior).
  const span: Array<{ y: number; cum: number }> = []
  let run = 0
  for (let y = start; y <= end; y++) { run += byYear[String(y)] ?? 0; span.push({ y, cum: run }) }
  const total = run || 1
  const N = end - start + 1

  const W = 300, H = 60, PAD = 4
  const x = (i: number) => PAD + (i / (span.length - 1)) * (W - 2 * PAD)
  const yc = (cum: number) => (H - PAD) - (cum / total) * (H - 2 * PAD)
  const line = span.map((p, i) => `${x(i).toFixed(1)},${yc(p.cum).toFixed(1)}`).join(' ')
  const area = `${x(0).toFixed(1)},${H - PAD} ${line} ${x(span.length - 1).toFixed(1)},${H - PAD}`
  const lastI = span.length - 1

  return (
    <div className="mt-8 max-w-xl mx-auto">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400 mb-2 text-center">
        {isPt ? `${N} anos de sinais acumulados` : `${N} years of accumulated signals`}
      </p>
      <div className="relative h-[60px]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full block" aria-hidden>
          <polygon points={area} className="fill-taime-500" opacity="0.13" />
          <polyline points={line} fill="none" className="stroke-taime-500" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <circle cx={x(lastI)} cy={yc(span[lastI].cum)} r="2.6" className="fill-taime-600" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Valor final na ponta direita, no ponto onde a linha termina (topo). */}
        <span className="absolute right-0 -top-1 text-[10px] font-bold text-taime-700 tabular-nums bg-white/70 rounded px-1">
          {run.toLocaleString(locale)}
        </span>
        {/* Colunas transparentes por ano para o tooltip de acumulado no hover. */}
        <div className="absolute inset-0 flex">
          {span.map(p => (
            <div key={p.y} className="group relative flex-1" title={`${p.y}: ${p.cum.toLocaleString(locale)}`}>
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity tabular-nums z-10">
                {p.y} · {p.cum.toLocaleString(locale)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* Anos nas extremidades e no meio, sem poluir */}
      <div className="mt-1.5 flex justify-between text-[10px] text-zinc-400 tabular-nums">
        <span>{start}</span>
        {end - start >= 6 && <span>{Math.round((start + end) / 2)}</span>}
        <span>{end}</span>
      </div>
    </div>
  )
}
export interface ArrivalCard {
  iconKey:     string
  title:       string
  description: string
  onClick:     () => void
}

const ICONS: Record<string, LucideIcon> = {
  continue:   Play,
  new:        Sparkles,
  trajectory: LineChart,
  objective:  Target,
  map:        Compass,
  focus:      Crosshair,
  risk:       ShieldAlert,
  question:   MessageSquareText,
}

export default function AdvisorArrival({
  subtitle, stats, cards, isPt, onSubmit, placeholder, wide = false, hideTimeline = false,
}: {
  subtitle:    string
  stats:       ArrivalStats | null
  cards:       ArrivalCard[]
  isPt:        boolean
  onSubmit?:   (text: string) => void   // enviar dali inicia a conversa
  placeholder?: string
  wide?:       boolean                  // Advisor desktop full-width: bloco respira mais
  hideTimeline?: boolean                // /ask 3-colunas: a curva migra para a coluna esquerda
}) {
  const locale = isPt ? 'pt-BR' : 'en-US'
  const n = (v: number) => v.toLocaleString(locale)
  const [text, setText] = useState('')

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const t = text.trim()
    if (!t || !onSubmit) return
    onSubmit(t)
    setText('')
  }

  return (
    <div className={`max-w-3xl mx-auto px-2 py-8 sm:py-10 ${wide ? 'lg:max-w-4xl' : ''}`}>
      {/* Cabecalho de apresentacao */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-lg bg-taime-600 text-white flex items-center justify-center text-sm font-bold shrink-0">T</span>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">TAIME Executive Advisor</h1>
        </div>
        <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">{subtitle}</p>

        {/* Linha de credibilidade (some se os numeros falharem). Sem "edições":
            fala de tendências analisadas e cobertura temporal. */}
        {stats && stats.trends > 0 && (
          <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-zinc-400 tabular-nums">
            <span>{n(stats.trends)} {isPt ? 'tendências analisadas' : 'trends analyzed'}</span>
            {stats.startYear && stats.endYear && (
              <>
                <span className="text-zinc-300">·</span>
                <span>{stats.startYear} {isPt ? 'a' : 'to'} {stats.endYear}</span>
              </>
            )}
          </p>
        )}
      </div>

      {/* Campo de pergunta: enviar dali inicia a conversa. Acima dos cards. */}
      {onSubmit && (
        <form onSubmit={submit} className="max-w-2xl mx-auto mb-5 flex items-end gap-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder={placeholder}
            rows={2}
            className="flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm
                       text-zinc-900 placeholder:text-zinc-400 outline-none shadow-sm
                       focus:ring-2 focus:ring-taime-600 focus:border-transparent leading-relaxed"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label={isPt ? 'Enviar' : 'Send'}
            className="btn-primary px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      )}

      {/* Grade de 4 cards (sugestões, abaixo do campo) */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${wide ? 'lg:gap-4' : ''}`}>
        {cards.map((c, i) => {
          const Icon = ICONS[c.iconKey] ?? MessageSquareText
          return (
            <button
              key={i}
              onClick={c.onClick}
              className="group flex items-start gap-3 text-left rounded-xl border border-zinc-200 border-t-2 border-t-taime-400 bg-white p-4
                         shadow-sm hover:border-taime-300 hover:border-t-taime-500 hover:shadow-md transition-all"
            >
              <span className="shrink-0 w-9 h-9 rounded-lg bg-taime-50 ring-1 ring-taime-100 flex items-center justify-center text-taime-600 group-hover:bg-taime-100 transition-colors">
                <Icon size={17} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-900 group-hover:text-taime-700 transition-colors leading-snug line-clamp-2">
                  {c.title}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500 leading-snug line-clamp-2">{c.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Timeline de densidade do acervo (dado agregado, publico). Fail-safe.
          hideTimeline: no /ask desktop a curva vive na coluna esquerda ("o acervo"),
          entao some SO no desktop (lg+); no mobile continua aqui, como hoje. */}
      {stats?.byYear && (
        <div className={hideTimeline ? 'lg:hidden' : ''}>
          <ArchiveDensity byYear={stats.byYear} isPt={isPt} />
        </div>
      )}
    </div>
  )
}
