'use client'

import Link from 'next/link'
import { scoreColor, scoreRing } from '@/lib/types'
import { computeProgress, type PlanRecord } from '@/lib/advisor-plan'

// Painel de contexto do workspace do Advisor. Duas seccoes:
//  - VIVA ("Nesta resposta"): as analises que o turno atual consultou (cards
//    clicaveis para a ancora da trend). Atualiza a cada resposta.
//  - FIXA: "Sua empresa" (advisor_profiles preenchidos) e "Temas que voce
//    acompanha" (theme_slugs recorrentes, com faixa temporal do arquivo).
// So aparece no Advisor logado (o /ask nao renderiza este componente, anti-scraping).

export interface PanelCard {
  reportId: string
  rank:     number
  title:    string
  period:   string
  score:    number | null
  category: string | null
}
export interface PanelTurn {
  trends:   PanelCard[]
  count:    number
  yearFrom: string | null
  yearTo:   string | null
}
export interface HomeCardData {
  iconKey:     string
  title:       string
  description: string
  action:      { kind: 'prompt' | 'session'; value: string }
}
export interface FixedContext {
  profile: Record<string, string>
  themes:  Array<{ slug: string; label: string; startYear: string | null; endYear: string | null }>
  archive?: { editions: number; trends: number; startYear: string | null; endYear: string | null; byYear?: Record<string, number> } | null
  home?:    { isReturning: boolean; cards: HomeCardData[] } | null
}

const MONTHS = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}
function shortPeriod(period: string, isPt: boolean): string {
  const m = Number.parseInt(period.slice(5, 7), 10) - 1
  const y = period.slice(0, 4)
  const mm = (isPt ? MONTHS.pt : MONTHS.en)[m] ?? ''
  return isPt ? `${mm}/${y}` : `${mm} ${y}`
}

// Rotulos dos campos de perfil (so os presentes sao renderizados).
const PROFILE_LABELS: Record<string, { pt: string; en: string }> = {
  sector:                 { pt: 'Setor',          en: 'Sector' },
  company_size:           { pt: 'Porte',          en: 'Size' },
  maturity_level:         { pt: 'Maturidade',     en: 'Maturity' },
  strategic_objective:    { pt: 'Objetivo',       en: 'Objective' },
  current_infrastructure: { pt: 'Infraestrutura', en: 'Infrastructure' },
}
const PROFILE_ORDER = ['sector', 'company_size', 'maturity_level', 'strategic_objective', 'current_infrastructure']

// Cada bloco do painel e um CARD proprio (superficie branca sobre o fundo tonal),
// mesmos tokens de borda/raio/sombra dos cards da aba Inicio e do dashboard. O
// titulo de seccao tem peso e cor mais fortes que o corpo (hierarquia clara).
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-600 mb-2.5">{title}</h3>
      {children}
    </section>
  )
}

// Bloco "Seu plano" (Fase 2.2, TAREFA 3): plano ativo mais recente, fase atual e as
// proximas 2-3 acoes pendentes, com link para a pagina de planos. Discreto, mesma
// familia visual dos outros blocos. Nao renderiza sem plano.
function PlanBlock({ plan, isPt }: { plan: PlanRecord; isPt: boolean }) {
  const progress = computeProgress(plan.phases)
  const current  = plan.phases[progress.currentPhaseIndex]
  const pending  = (current?.actions ?? []).filter(a => a.status !== 'done').slice(0, 3)
  return (
    <Section title={isPt ? 'Seu plano' : 'Your plan'}>
      <Link href="/dashboard/advisor/plans" className="group block">
        <p className="text-[13px] font-semibold text-zinc-800 group-hover:text-taime-700 leading-snug line-clamp-2">
          {plan.title ?? (isPt ? 'Plano estratégico' : 'Strategic plan')}
        </p>
      </Link>
      <p className="mt-1 text-[11px] text-zinc-400 tabular-nums">
        {(isPt ? `Fase ${progress.currentPhaseIndex + 1} de ${progress.phaseCount}` : `Phase ${progress.currentPhaseIndex + 1} of ${progress.phaseCount}`)}
        {` · ${progress.doneActions}/${progress.totalActions} ${isPt ? 'ações' : 'actions'}`}
      </p>
      {pending.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {pending.map((a, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-600 leading-snug">
              <span className="mt-1 shrink-0 w-3 h-3 rounded-full border border-zinc-300" />{a.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-taime-700 font-medium">{isPt ? 'Fase concluída.' : 'Phase complete.'}</p>
      )}
      <Link href="/dashboard/advisor/plans" className="mt-2 inline-block text-[11px] font-semibold text-taime-600 hover:text-taime-800">
        {isPt ? 'Ver o plano →' : 'Open the plan →'}
      </Link>
    </Section>
  )
}

export default function AdvisorContextPanel({
  turn, loading, isPt, fixed, activePlan, onOpenProfile, onPickTheme,
}: {
  turn:          PanelTurn | null
  loading:       boolean
  isPt:          boolean
  fixed:         FixedContext | null
  activePlan?:   PlanRecord | null
  onOpenProfile?: () => void
  onPickTheme:   (label: string) => void
}) {
  const profileEntries = fixed ? PROFILE_ORDER.filter(k => fixed.profile[k]) : []
  const companyName = fixed?.profile.company_name
  const hasCompanyBlock = !!companyName || profileEntries.length > 0
  const themes = fixed?.themes ?? []

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">

      {/* ── Seu plano (Fase 2.2) ─────────────────────────────────────── */}
      {activePlan && activePlan.phases.length > 0 && <PlanBlock plan={activePlan} isPt={isPt} />}


      {/* ── VIVA: Nesta resposta ─────────────────────────────────────── */}
      <Section title={isPt ? 'Nesta resposta' : 'In this answer'}>
        {loading ? (
          <div className="space-y-2" aria-live="polite">
            <p className="flex items-center gap-2 text-xs text-zinc-400">
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {isPt ? 'Consultando o arquivo...' : 'Searching the archive...'}
            </p>
            {[0, 1, 2].map(i => <div key={i} className="h-11 rounded-lg bg-zinc-100 animate-pulse" />)}
          </div>
        ) : turn && turn.trends.length > 0 ? (
          <>
            <p className="text-[11px] text-zinc-400 mb-1 tabular-nums">
              {isPt
                ? `${turn.count} ${turn.count === 1 ? 'tendência' : 'tendências'}`
                : `${turn.count} ${turn.count === 1 ? 'trend' : 'trends'}`}
              {turn.yearFrom && turn.yearTo && (
                <span> · {turn.yearFrom === turn.yearTo ? turn.yearFrom : `${turn.yearFrom} ${isPt ? 'a' : 'to'} ${turn.yearTo}`}</span>
              )}
            </p>
            {/* Linhas (sem borda propria) para nao aninhar card dentro de card. */}
            <div className="divide-y divide-zinc-100">
              {turn.trends.map((c, i) => (
                <a
                  key={`${c.reportId}-${c.rank}-${i}`}
                  href={`/reports/${c.reportId}#trend-${c.rank}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c.title || undefined}
                  style={{ animationDelay: `${i * 100}ms` }}
                  className="advisor-panel-item group flex items-start gap-2.5 py-2 -mx-1.5 px-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  {c.score !== null && (
                    <span className={`shrink-0 w-8 h-8 rounded-md ring-1 ${scoreRing(c.score)} flex items-center justify-center`}>
                      <span className={`text-[11px] font-bold tabular-nums ${scoreColor(c.score)}`}>{c.score}</span>
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-zinc-800 group-hover:text-taime-700 transition-colors line-clamp-2 leading-snug">
                      {c.title || (isPt ? 'Tendência' : 'Trend')}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-400 tabular-nums">
                      <span>{shortPeriod(c.period, isPt)}</span>
                      {c.category && <span className="text-zinc-300">·</span>}
                      {c.category && <span className="truncate">{c.category}</span>}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-zinc-400 leading-relaxed">
            {isPt
              ? 'As tendências que eu consultar aparecem aqui a cada resposta.'
              : 'The trends I consult appear here with each answer.'}
          </p>
        )}
      </Section>

      {/* ── FIXA: Sua empresa ────────────────────────────────────────── */}
      {hasCompanyBlock ? (
        <Section title={isPt ? 'Sua empresa' : 'Your company'}>
          {companyName && <p className="text-sm font-bold text-zinc-900 mb-2.5 leading-snug">{companyName}</p>}
          {profileEntries.length > 0 && (
            <dl className="flex flex-col gap-2">
              {profileEntries.map(k => (
                <div key={k} className="flex flex-col gap-0.5">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{isPt ? PROFILE_LABELS[k].pt : PROFILE_LABELS[k].en}</dt>
                  <dd className="text-[13px] text-zinc-800 leading-relaxed">{fixed!.profile[k]}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>
      ) : fixed && onOpenProfile ? (
        <Section title={isPt ? 'Sua empresa' : 'Your company'}>
          <button onClick={onOpenProfile} className="text-xs font-medium text-taime-600 hover:text-taime-800 text-left">
            {isPt ? 'Completar meu perfil →' : 'Complete my profile →'}
          </button>
        </Section>
      ) : null}

      {/* ── FIXA: Temas que voce acompanha ───────────────────────────── */}
      {themes.length > 0 && (
        <Section title={isPt ? 'Temas que você acompanha' : 'Themes you follow'}>
          <div className="flex flex-col gap-0.5 -mx-1.5">
            {themes.map(t => (
              <button
                key={t.slug}
                onClick={() => onPickTheme(t.label)}
                className="group flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-zinc-50 transition-colors"
              >
                <span className="text-[13px] font-medium text-zinc-800 group-hover:text-taime-700 truncate">{t.label}</span>
                {t.startYear && (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] tabular-nums text-zinc-400">
                    <span>{t.startYear}</span>
                    <span className="w-3 h-px bg-gradient-to-r from-taime-300 to-taime-500" />
                    <span className="font-semibold text-taime-600 uppercase">{isPt ? 'hoje' : 'today'}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Acesso permanente aos planos salvos (mesmo sem plano ativo): garante que a
          pagina de planos nunca fica inacessivel. No mobile, o painel abre pelo botao
          "Contexto" do header. */}
      {!(activePlan && activePlan.phases.length > 0) && (
        <Link href="/dashboard/advisor/plans"
          className="px-1 text-[11px] font-semibold text-taime-600 hover:text-taime-800">
          {isPt ? 'Meus planos →' : 'My plans →'}
        </Link>
      )}
    </div>
  )
}
