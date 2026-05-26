'use client'

import { useState } from 'react'
import Link from 'next/link'
import { scoreColor } from '@/lib/types'
import type { TaimeFramework } from '@/lib/types'

interface HomeTrend {
  report_id: string
  title_pt_br: string
  title_en: string
  taime_score: number
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en: TaimeFramework | null
}

function scoreRingCls(score: number): string {
  if (score >= 85) return 'ring-emerald-200 bg-emerald-50'
  if (score >= 70) return 'ring-taime-200 bg-taime-50'
  if (score >= 50) return 'ring-amber-200 bg-amber-50'
  return 'ring-zinc-200 bg-zinc-50'
}

export default function HomeSearch({
  trends,
  isLoggedIn,
  locale,
  trendsCta,
  trendsEmpty,
}: {
  trends: HomeTrend[]
  isLoggedIn: boolean
  locale: 'pt' | 'en'
  trendsCta: string
  trendsEmpty: string
}) {
  const [query, setQuery] = useState('')
  const isEn = locale === 'en'

  const visible = query.trim()
    ? trends.filter(t => {
        const q = query.toLowerCase()
        return (
          t.title_pt_br.toLowerCase().includes(q) ||
          t.title_en.toLowerCase().includes(q) ||
          t.taime_framework_pt_br?.executive_snapshot?.toLowerCase().includes(q) ||
          t.taime_framework_en?.executive_snapshot?.toLowerCase().includes(q)
        )
      })
    : trends

  return (
    <div>
      <div className="mb-8">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={isEn ? 'Search trends...' : 'Buscar tendências...'}
          className="w-full max-w-md px-4 py-2.5 text-sm rounded-lg border border-zinc-200 bg-white
                     text-zinc-900 placeholder:text-zinc-400
                     focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent"
        />
      </div>

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {visible.map((trend, i) => {
            const title = isEn ? trend.title_en : trend.title_pt_br
            const fw    = isEn ? trend.taime_framework_en : trend.taime_framework_pt_br
            const snap  = fw?.executive_snapshot ?? ''
            const prev  = snap.length > 120 ? snap.slice(0, 120).trimEnd() + '...' : snap
            const href  = isLoggedIn ? `/reports/${trend.report_id}` : '/login'
            return (
              <div key={i} className="bg-white rounded-xl border border-zinc-200 p-6 flex flex-col gap-4
                                       hover:border-taime-200 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center
                                  shrink-0 ring-2 ${scoreRingCls(trend.taime_score)}`}>
                    <span className={`font-bold text-xl tabular-nums leading-none ${scoreColor(trend.taime_score)}`}>
                      {trend.taime_score}
                    </span>
                    <span className="text-[8px] text-zinc-400 font-bold tracking-wide">SCORE</span>
                  </div>
                  <p className="text-sm font-bold text-zinc-900 leading-snug">{title}</p>
                </div>
                {prev && <p className="text-xs text-zinc-500 leading-relaxed flex-1">{prev}</p>}
                <Link href={href} className="text-xs font-semibold text-taime-600 hover:text-taime-700 transition-colors">
                  {trendsCta}
                </Link>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-200 p-10 text-center text-zinc-400 text-sm">
          {query.trim() ? (isEn ? 'No trends found.' : 'Nenhuma tendência encontrada.') : trendsEmpty}
        </div>
      )}
    </div>
  )
}
