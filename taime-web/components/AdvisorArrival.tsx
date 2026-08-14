'use client'

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
  subtitle, stats, cards, isPt,
}: {
  subtitle: string
  stats:    ArrivalStats | null
  cards:    ArrivalCard[]
  isPt:     boolean
}) {
  const locale = isPt ? 'pt-BR' : 'en-US'
  const n = (v: number) => v.toLocaleString(locale)

  return (
    <div className="max-w-2xl mx-auto px-2 py-8 sm:py-12">
      {/* Cabecalho de apresentacao */}
      <div className="text-center mb-8">
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

      {/* Grade de 4 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c, i) => {
          const Icon = ICONS[c.iconKey] ?? MessageSquareText
          return (
            <button
              key={i}
              onClick={c.onClick}
              className="group flex items-start gap-3 text-left rounded-xl border border-zinc-200 bg-white p-4
                         shadow-sm hover:border-taime-300 hover:shadow transition-all"
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
    </div>
  )
}
