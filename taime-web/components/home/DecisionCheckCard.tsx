import Link from 'next/link'
import { createSupabaseService } from '@/lib/supabase-server'
import type { ScoreDimensions, TaimeFramework } from '@/lib/types'
import { parseComboSlug, themeLabel, MOVE_LABEL, MOVE_STYLE, type Lang } from '@/lib/decision-check'
import { getDecisionResult } from '@/lib/decision-check-core'
import { DIM_ORDER } from '@/lib/radar-geometry'
import TrendRadar from '@/components/home/TrendRadar'

// Card do Decision Check na home: preview REAL de um combo curado (score + MOVE + radar
// das 5 dimensoes). Server component: reusa getDecisionResult (score/MOVE, mesma fonte
// da pagina do combo) e faz uma leitura compacta das dimensoes do tema para o radar.
// Fail-safe: se o combo nao tiver dados, o card ainda renderiza o convite (sem radar).

interface DimRow {
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en:    TaimeFramework | null
}

// Media das 5 dimensoes (0-100) das top-5 trends do tema, mesma ordem canonica do radar.
async function themeDims(theme: string, lang: Lang, fallback: number): Promise<number[]> {
  try {
    const supabase = createSupabaseService()
    const { data } = await supabase
      .from('report_trends')
      .select('taime_framework_pt_br, taime_framework_en, reports!inner(period, status)')
      .eq('theme_slug', theme)
      .eq('reports.status', 'published')
      .order('taime_score', { ascending: false })
      .order('period', { referencedTable: 'reports', ascending: false })
      .order('id', { ascending: false })
      .limit(5)
    const rows = (data ?? []) as unknown as DimRow[]
    return DIM_ORDER.map(k => {
      const vals = rows
        .map(r => (lang === 'pt' ? r.taime_framework_pt_br : r.taime_framework_en)?.score_dimensions as ScoreDimensions | undefined)
        .map(d => d?.[k]?.score)
        .filter((v): v is number => typeof v === 'number' && v >= 0)
      return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : fallback
    })
  } catch {
    return DIM_ORDER.map(() => fallback)
  }
}

export default async function DecisionCheckCard({ slug, isEn }: { slug: string; isEn: boolean }) {
  const lang: Lang = isEn ? 'en' : 'pt'
  const combo = parseComboSlug(slug)
  const res = combo ? await getDecisionResult(slug, combo) : null
  const ok = !!(combo && res && res.ok)
  const values = ok ? await themeDims(combo!.theme, lang, res!.score) : []
  const theme = combo ? themeLabel(combo.theme, lang) : ''

  const t = {
    kicker:   'DECISION CHECK',
    title:    isEn ? 'Have a technology decision on the table?' : 'Tem uma decisão de tecnologia na mesa?',
    subtitle: isEn ? '4 questions. Answer in 20 seconds.' : '4 perguntas. Resposta em 20 segundos.',
    cta:      isEn ? 'Take the Decision Check →' : 'Fazer o Decision Check →',
    score:    'TAIME SCORE',
  }

  return (
    <div className="flex flex-col rounded-2xl bg-zinc-900/70 border border-white/10 ring-1 ring-white/5 shadow-2xl p-6 sm:p-7 backdrop-blur-sm">
      <p className="text-[10px] font-bold tracking-widest uppercase text-taime-300 mb-2">{t.kicker}</p>
      <h3 className="text-xl font-bold text-white leading-snug mb-1.5">{t.title}</h3>
      <p className="text-sm text-white/60 leading-relaxed mb-5">{t.subtitle}</p>

      {ok ? (
        <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 line-clamp-1">{theme}</p>
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black tabular-nums leading-none text-white">{res!.score}</span>
                <span className="text-sm font-bold text-white/30">/100</span>
              </div>
              <span className="text-[9px] font-bold tracking-widest text-white/40 uppercase">{t.score}</span>
              <div className={`mt-2 inline-flex items-center rounded-lg px-2.5 py-1 ring-1 ${MOVE_STYLE[res!.move].ring} ${MOVE_STYLE[res!.move].bg}`}>
                <span className={`text-sm font-black tracking-wide ${MOVE_STYLE[res!.move].text}`}>{MOVE_LABEL[res!.move][lang]}</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <TrendRadar values={values} move={res!.move} lang={lang} className="w-full h-auto" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 mb-6" />
      )}

      <Link
        href="/decision-check"
        className="mt-auto inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg
                   bg-taime-500 text-white text-sm font-semibold hover:bg-taime-400 transition-colors"
      >
        {t.cta}
      </Link>
    </div>
  )
}
