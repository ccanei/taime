import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import LogoutButton from '@/components/LogoutButton'
import LanguageSelector from '@/components/LanguageSelector'

type Locale = 'pt' | 'en'

interface UserRow {
  full_name:          string | null
  email:              string | null
  company:            string | null
  job_title:          string | null
  preferred_language: string | null
}

interface SubscriptionRow {
  plan:   string | null
  status: string | null
}

const PLAN_LABELS: Record<Locale, Record<string, string>> = {
  pt: { free: 'Gratuito', essential: 'Essencial', strategic: 'Estratégico' },
  en: { free: 'Free',     essential: 'Essential', strategic: 'Strategic'   },
}

const STATUS_LABELS: Record<Locale, Record<string, string>> = {
  pt: { active: 'Ativo', pending: 'Pendente', canceled: 'Cancelado', expired: 'Expirado' },
  en: { active: 'Active', pending: 'Pending', canceled: 'Canceled', expired: 'Expired'   },
}

function emptyOr(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '—'
}

export default async function AccountPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const localeCookie = (await cookies()).get('taime-locale')?.value
  const locale: Locale = localeCookie === 'en' ? 'en' : 'pt'
  const isEn = locale === 'en'

  const service = createSupabaseService()

  const [{ data: profile }, { data: sub }] = await Promise.all([
    service
      .from('users')
      .select('full_name, email, company, job_title, preferred_language')
      .eq('id', user.id)
      .maybeSingle(),
    service
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const profileRow: UserRow = (profile as UserRow) ?? {
    full_name: null, email: user.email ?? null, company: null,
    job_title: null, preferred_language: null,
  }
  const subRow: SubscriptionRow = (sub as SubscriptionRow) ?? { plan: 'free', status: null }

  const planKey   = (subRow.plan ?? 'free').toLowerCase()
  const planLabel = PLAN_LABELS[locale][planKey] ?? planKey
  const statusKey = (subRow.status ?? '').toLowerCase()
  const statusLabel = STATUS_LABELS[locale][statusKey] ?? null

  const t = isEn
    ? {
        title:       'My Account',
        subtitle:    'Your profile and subscription details.',
        back:        '← Dashboard',
        profileLbl:  'Profile',
        nameLbl:     'Name',
        emailLbl:    'Email',
        companyLbl:  'Company',
        roleLbl:     'Job title',
        planLbl:     'Plan',
        currentPlan: 'Current plan',
        statusLbl:   'Status',
        langLbl:     'Preferred language',
        langValue:   profileRow.preferred_language === 'en' ? 'English' : 'Português',
        upgrade:     'Manage plan',
      }
    : {
        title:       'Minha Conta',
        subtitle:    'Seu perfil e detalhes da assinatura.',
        back:        '← Dashboard',
        profileLbl:  'Perfil',
        nameLbl:     'Nome',
        emailLbl:    'Email',
        companyLbl:  'Empresa',
        roleLbl:     'Cargo',
        planLbl:     'Plano',
        currentPlan: 'Plano atual',
        statusLbl:   'Status',
        langLbl:     'Idioma preferido',
        langValue:   profileRow.preferred_language === 'en' ? 'English' : 'Português',
        upgrade:     'Gerenciar plano',
      }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-bold text-xl tracking-tight text-zinc-900">
              TAIME
            </Link>
            <span className="text-zinc-200">/</span>
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
              {t.back}
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSelector />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{t.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        </div>

        {/* Profile card */}
        <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <header className="px-6 py-4 border-b border-zinc-100">
            <h2 className="text-sm font-bold text-zinc-900">{t.profileLbl}</h2>
          </header>
          <dl className="divide-y divide-zinc-100">
            <ProfileRow label={t.nameLbl}    value={emptyOr(profileRow.full_name)} />
            <ProfileRow label={t.emailLbl}   value={emptyOr(profileRow.email ?? user.email ?? null)} />
            <ProfileRow label={t.companyLbl} value={emptyOr(profileRow.company)} />
            <ProfileRow label={t.roleLbl}    value={emptyOr(profileRow.job_title)} />
            <ProfileRow label={t.langLbl}    value={t.langValue} />
          </dl>
        </section>

        {/* Plan card */}
        <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <header className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900">{t.planLbl}</h2>
            <Link href="/planos" className="text-xs text-taime-600 hover:text-taime-700 font-medium transition-colors">
              {t.upgrade} →
            </Link>
          </header>
          <div className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold mb-1">
                {t.currentPlan}
              </p>
              <p className="text-lg font-bold text-zinc-900">{planLabel}</p>
            </div>
            {statusLabel && (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold
                ${statusKey === 'active'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-zinc-100 text-zinc-600'}`}>
                {t.statusLbl}: {statusLabel}
              </span>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-3.5 flex items-baseline justify-between gap-4">
      <dt className="text-xs text-zinc-500 font-medium tracking-wide uppercase shrink-0">
        {label}
      </dt>
      <dd className={`text-sm text-right ${value === '—' ? 'text-zinc-300' : 'text-zinc-900 font-medium'}`}>
        {value}
      </dd>
    </div>
  )
}
