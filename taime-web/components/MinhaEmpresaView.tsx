'use client'

import { useState } from 'react'
import { Building2, Gauge, ListChecks, Map, ChevronDown } from 'lucide-react'
import AdvisorOnboarding from '@/components/AdvisorOnboarding'
import AssessmentView from '@/components/AssessmentView'
import CompanyFactsSection from '@/components/CompanyFactsSection'
import PlansManager from '@/components/PlansManager'

// Aba unificada "Minha Empresa": UMA fonte para os 4 blocos (Perfil, Maturidade,
// Fatos, Planos), com dois pontos de entrada (dashboard e Advisor). Cada bloco e uma
// seccao colapsavel com resumo visivel e expansao para o detalhe. Nada de dado e
// duplicado: cada componente filho faz o proprio fetch (um por tipo de informacao).

export interface ProfileSummary {
  company_name:           string | null
  sector:                 string | null
  company_size:           string | null
  strategic_objective:    string | null
  current_infrastructure: string | null
}

type SectionKey = 'profile' | 'maturity' | 'facts' | 'plans'

// Perfil "preenchido" = empresa + setor + porte (os mesmos campos que disparam a
// saudacao personalizada). Governa o texto do botao (Completar vs Editar).
function isProfileFilled(p: ProfileSummary | null): boolean {
  return !!(p && p.company_name && p.sector && p.company_size)
}

function Section({
  icon, title, summary, open, onToggle, children,
}: {
  icon: React.ReactNode
  title: string
  summary: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-zinc-50/60 transition-colors"
      >
        <span className="shrink-0 w-9 h-9 rounded-xl bg-taime-50 text-taime-600 flex items-center justify-center">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-zinc-900">{title}</span>
          <span className="block text-xs text-zinc-500 truncate">{summary}</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-6 pt-1 border-t border-zinc-100">{children}</div>}
    </section>
  )
}

export default function MinhaEmpresaView({
  userId, isPt, profile,
}: {
  userId: string
  isPt: boolean
  profile: ProfileSummary | null
}) {
  const [open, setOpen] = useState<SectionKey>('profile')
  const toggle = (k: SectionKey) => setOpen(prev => (prev === k ? ('' as SectionKey) : k))
  const filled = isProfileFilled(profile)

  const profileSummary = filled
    ? [profile!.company_name, profile!.sector, profile!.company_size].filter(Boolean).join(' · ')
    : (isPt ? 'Empresa, setor e porte ainda não preenchidos' : 'Company, sector and size not filled yet')

  const t = {
    profile:  isPt ? 'Perfil da empresa' : 'Company profile',
    maturity: isPt ? 'Maturidade' : 'Maturity',
    facts:    isPt ? 'Fatos da empresa' : 'Company facts',
    plans:    isPt ? 'Planos de ação' : 'Action plans',
    matSummary:   isPt ? 'Seu retrato de maturidade por domínio' : 'Your maturity portrait by domain',
    factsSummary: isPt ? 'O que o Advisor aprendeu nas conversas, com edição' : 'What the Advisor learned in conversations, editable',
    plansSummary: isPt ? 'Roadmaps salvos, ativos e arquivados' : 'Saved roadmaps, active and archived',
    editProfile:  isPt ? 'Editar perfil' : 'Edit profile',
    fillProfile:  isPt ? 'Completar perfil' : 'Complete profile',
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        icon={<Building2 size={18} />}
        title={t.profile}
        summary={profileSummary}
        open={open === 'profile'}
        onToggle={() => toggle('profile')}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold
            ${filled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {filled ? t.editProfile : t.fillProfile}
          </span>
        </div>
        <AdvisorOnboarding userId={userId} onComplete={() => window.location.reload()} />
      </Section>

      <Section
        icon={<Gauge size={18} />}
        title={t.maturity}
        summary={t.matSummary}
        open={open === 'maturity'}
        onToggle={() => toggle('maturity')}
      >
        <AssessmentView />
      </Section>

      <Section
        icon={<ListChecks size={18} />}
        title={t.facts}
        summary={t.factsSummary}
        open={open === 'facts'}
        onToggle={() => toggle('facts')}
      >
        <CompanyFactsSection isPt={isPt} variant="full" />
      </Section>

      <Section
        icon={<Map size={18} />}
        title={t.plans}
        summary={t.plansSummary}
        open={open === 'plans'}
        onToggle={() => toggle('plans')}
      >
        <PlansManager />
      </Section>
    </div>
  )
}
