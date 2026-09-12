'use client'

import Link from 'next/link'
import { scoreColor, scoreRing } from '@/lib/types'
import { type PlanRecord } from '@/lib/advisor-plan'
import ActivePlansPanel from '@/components/ActivePlansPanel'
import CompanyFactsSummary from '@/components/CompanyFactsSummary'
import { DOMAINS, TOTAL_QUESTIONS, type DomainScore } from '@/lib/assessment-model'

export interface AssessmentSummary { available: boolean; answered: number; domains: DomainScore[] }

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
function Section({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-zinc-600 mb-2.5">
        {title}{badge}
      </h3>
      {children}
    </section>
  )
}

// Selo discreto "Em evolução": tom de "construindo com você", nunca de erro. Reusado
// no resumo do painel e no bloco expandido da aba unificada.
function InProgressBadge({ isPt }: { isPt: boolean }) {
  return (
    <span className="inline-flex items-center rounded-full bg-taime-50 text-taime-600 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide normal-case">
      {isPt ? 'Em evolução' : 'In progress'}
    </span>
  )
}

// Bloco "Maturidade": progresso do assessment + link para a aba unificada. Sem
// assessment iniciado, convite discreto; dormente (available=false) nao aparece.
function AssessmentBlock({ a, isPt }: { a: AssessmentSummary; isPt: boolean }) {
  if (!a.available) return null
  const completed = a.domains.filter(d => d.complete).map(d => DOMAINS.find(x => x.id === d.domain)?.short[isPt ? 'pt' : 'en'] ?? d.domain)
  return (
    <Section title={isPt ? 'Maturidade' : 'Maturity'} badge={<InProgressBadge isPt={isPt} />}>
      {a.answered === 0 ? (
        <>
          <p className="text-[11px] text-zinc-500 leading-snug mb-1.5">{isPt ? 'Mapeie seu estágio por domínio.' : 'Map your stage by domain.'}</p>
          <Link href="/dashboard/empresa?b=maturity" className="text-[11px] font-semibold text-taime-600 hover:text-taime-800">
            {isPt ? 'Mapear maturidade →' : 'Map maturity →'}
          </Link>
        </>
      ) : (
        <>
          <p className="text-[11px] text-zinc-500 leading-snug tabular-nums">
            {a.answered} {isPt ? `de ${TOTAL_QUESTIONS} respondidas` : `of ${TOTAL_QUESTIONS} answered`}
            {completed.length > 0 && <> · {completed.join(', ')} {isPt ? (completed.length === 1 ? 'completo' : 'completos') : 'complete'}</>}
          </p>
          <Link href="/dashboard/empresa?b=maturity" className="mt-1.5 inline-block text-[11px] font-semibold text-taime-600 hover:text-taime-800">
            {isPt ? 'Ver maturidade →' : 'View maturity →'}
          </Link>
        </>
      )}
    </Section>
  )
}

export default function AdvisorContextPanel({
  turn, loading, isPt, fixed, plans, currentSessionId, assessment, onOpenProfile, onPickTheme,
}: {
  turn:            PanelTurn | null
  loading:         boolean
  isPt:            boolean
  fixed:           FixedContext | null
  plans?:          PlanRecord[]
  currentSessionId?: string | null
  assessment?:     AssessmentSummary | null
  onOpenProfile?:  () => void
  onPickTheme:     (label: string) => void
}) {
  const activePlans = plans ?? []
  const profileEntries = fixed ? PROFILE_ORDER.filter(k => fixed.profile[k]) : []
  const companyName = fixed?.profile.company_name
  const hasCompanyBlock = !!companyName || profileEntries.length > 0
  const themes = fixed?.themes ?? []

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">

      {/* ── Seu plano (Fase 3.x, TAREFA 4): plano da conversa atual em destaque,
             demais colapsados; sem conversa vinculada, todos compactos. ─────── */}
      {activePlans.length > 0 && (
        <ActivePlansPanel
          plans={activePlans}
          isPt={isPt}
          title={isPt ? 'Seu plano' : 'Your plan'}
          currentSessionId={currentSessionId}
        />
      )}

      {/* ── Diagnóstico de maturidade (Assessment Parte A) ─────────────── */}
      {assessment && <AssessmentBlock a={assessment} isPt={isPt} />}


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
            {/* Mini-cards (score + periodo + categoria), clicaveis, com entrada em
                stagger (advisor-panel-item). Score colorido pela regua do produto. */}
            <div className="flex flex-col gap-2">
              {turn.trends.map((c, i) => (
                <a
                  key={`${c.reportId}-${c.rank}-${i}`}
                  href={`/reports/${c.reportId}#trend-${c.rank}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c.title || undefined}
                  style={{ animationDelay: `${i * 100}ms` }}
                  className="advisor-panel-item group flex items-start gap-2.5 rounded-lg border border-zinc-200 bg-white p-2.5 hover:border-taime-200 hover:shadow-sm transition-all"
                >
                  {c.score !== null && (
                    <span className={`shrink-0 w-9 h-9 rounded-lg ring-1 ${scoreRing(c.score)} flex items-center justify-center`}>
                      <span className={`text-xs font-bold tabular-nums ${scoreColor(c.score)}`}>{c.score}</span>
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-zinc-800 group-hover:text-taime-700 transition-colors line-clamp-2 leading-snug">
                      {c.title || (isPt ? 'Tendência' : 'Trend')}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-400 tabular-nums">
                      <span className="font-medium">{shortPeriod(c.period, isPt)}</span>
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
      {/* Perfil "preenchido" = empresa + setor + porte (mesmos campos da saudacao
          personalizada). Governa o texto: Editar vs Completar perfil. */}
      {(() => {
        const p = fixed?.profile ?? {}
        const profileFilled = !!(p.company_name && p.sector && p.company_size)
        const cta = profileFilled
          ? (isPt ? 'Editar perfil →' : 'Edit profile →')
          : (isPt ? 'Completar perfil →' : 'Complete profile →')
        if (hasCompanyBlock) {
          return (
            <Section title={isPt ? 'Sua empresa' : 'Your company'}>
              {companyName && <p className="text-sm font-bold text-zinc-900 mb-2.5 leading-snug">{companyName}</p>}
              {profileEntries.length > 0 && (
                <dl className="flex flex-col gap-2 mb-3">
                  {profileEntries.map(k => (
                    <div key={k} className="flex flex-col gap-0.5">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{isPt ? PROFILE_LABELS[k].pt : PROFILE_LABELS[k].en}</dt>
                      <dd className="text-[13px] text-zinc-800 leading-relaxed">{fixed!.profile[k]}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <Link href="/dashboard/empresa?b=profile" className="text-[11px] font-semibold text-taime-600 hover:text-taime-800">{cta}</Link>
            </Section>
          )
        }
        return fixed ? (
          <Section title={isPt ? 'Sua empresa' : 'Your company'}>
            <Link href="/dashboard/empresa?b=profile" className="text-xs font-medium text-taime-600 hover:text-taime-800">{cta}</Link>
          </Section>
        ) : null
      })()}

      {/* ── Fatos da empresa: RESUMO (linha + 2 recentes), lista completa na aba
             unificada /dashboard/empresa. Some quando nao ha fatos. ─────────── */}
      <CompanyFactsSummary isPt={isPt} />

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

      {/* Acesso permanente a aba unificada (mesmo sem plano ativo): garante que os
          planos nunca ficam inacessiveis. No mobile, o painel abre pelo botao
          "Contexto" do header. */}
      {activePlans.length === 0 && (
        <Link href="/dashboard/empresa?b=plans"
          className="px-1 text-[11px] font-semibold text-taime-600 hover:text-taime-800">
          {isPt ? 'Minha Empresa →' : 'My Company →'}
        </Link>
      )}
    </div>
  )
}
