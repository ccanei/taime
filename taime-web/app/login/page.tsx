'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useLocale } from '@/lib/useLocale'

// `useLocale` retorna 'pt' | 'en'. O banco (public.users.preferred_language)
// aceita só 'pt-BR' | 'en' (CHECK). Mapeamos no signup para alimentar o
// metadata do OTP, que o callback consome ao enriquecer o perfil.
type DbLocale = 'pt-BR' | 'en'
function toDbLocale(uiLocale: 'pt' | 'en'): DbLocale {
  return uiLocale === 'en' ? 'en' : 'pt-BR'
}

type Mode   = 'waitlist' | 'magic-link' | 'free-signup'
type Status = 'idle' | 'loading' | 'sent' | 'error'
type Plan   = 'free' | 'essential' | 'strategic'

const ALLOWED_PLANS: readonly Plan[] = ['free', 'essential', 'strategic']

const INPUT_CLS = `w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm text-zinc-900
                   placeholder:text-zinc-400 bg-white
                   focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent
                   disabled:opacity-60`

// useSearchParams() exige Suspense boundary no App Router. Mantemos a leitura
// do query param e toda a UI dentro do filho; o Suspense fica no default export.
function LoginPageInner() {
  const { locale, t } = useLocale()
  const searchParams = useSearchParams()

  // ?plan=free|essential|strategic. Fora da whitelist cai em 'free'.
  const planParam = searchParams.get('plan') as Plan | null
  const initialPlan: Plan = planParam && ALLOWED_PLANS.includes(planParam) ? planParam : 'free'

  // Free e Essential: self-signup direto (magic link com shouldCreateUser=true) e
  // ativacao imediata da subscription no /auth/callback. Strategic: continua
  // waitlist manual (nao esta a venda agora). O cadastro nunca ativa strategic.
  const signupPlan: 'free' | 'essential' = initialPlan === 'essential' ? 'essential' : 'free'
  const [mode, setMode]     = useState<Mode>(initialPlan === 'strategic' ? 'waitlist' : 'free-signup')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Waitlist fields
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [company, setCompany]   = useState('')
  const [userRole, setUserRole] = useState('')
  const [interest, setInterest] = useState('')
  const [requestedPlan, setRequestedPlan] = useState<Plan>(initialPlan)
  // Honeypot anti-bot, escondido para humanos, atrai preenchimento automático de bots.
  const [website, setWebsite] = useState('')

  // Magic link / free-signup field (separate email so it doesn't collide with waitlist)
  const [mlEmail, setMlEmail] = useState('')

  // Special flag: email not found in Supabase Auth (apenas no modo magic-link de login)
  const [notFound, setNotFound] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setStatus('idle')
    setErrorMsg('')
    setNotFound(false)
  }

  // ── Waitlist (essential / strategic; fluxo manual histórico) ────────────────

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !email || !interest) return
    setStatus('loading')

    try {
      const res = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:           name.trim(),
          email:          email.trim().toLowerCase(),
          company:        company.trim() || null,
          role:           userRole.trim() || null,
          interest,
          requested_plan: requestedPlan,
          website,
        }),
      })

      if (!res.ok) {
        const msg = res.status === 409 ? t.login.errDuplicate : t.login.errGeneric
        setErrorMsg(msg)
        setStatus('error')
        return
      }

      setStatus('sent')
    } catch {
      setErrorMsg(t.login.errGeneric)
      setStatus('error')
    }
  }

  // ── Magic link (login de quem já tem conta) ─────────────────────────────────

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!mlEmail) return
    setStatus('loading')
    setNotFound(false)

    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithOtp({
      email: mlEmail.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    })

    if (error) {
      if (error.status === 422 || error.status === 400) {
        setNotFound(true)
        setStatus('error')
      } else {
        setErrorMsg(error.message)
        setStatus('error')
      }
    } else {
      setStatus('sent')
    }
  }

  // ── Free self-signup (plan=free) ────────────────────────────────────────────
  // Ordem é importante:
  //   1) POST waitlist PRIMEIRO. Lead garantido mesmo se a pessoa nunca
  //      clicar no link. Endpoint grava status=approved + contacted=true
  //      para o plano free. 409 (email já existe) é tratado como sucesso para
  //      seguir adiante; outros erros >= 400 abortam (o magic link NÃO é
  //      disparado e a UX mostra o motivo).
  //   2) signInWithOtp com perfil completo no `data` (user_metadata).
  //      O trigger handle_new_user consome `full_name` ao criar a row em
  //      public.users. O callback (auth/callback/route.ts) consome
  //      company/job_title/preferred_language e enriquece public.users.

  async function handleFreeSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !email || !interest) return
    setStatus('loading')
    setErrorMsg('')

    const normalizedName    = name.trim()
    const normalizedEmail   = email.trim().toLowerCase()
    const normalizedCompany = company.trim() || null
    const normalizedRole    = userRole.trim() || null
    const dbLocale          = toDbLocale(locale)

    // (1) Waitlist primeiro.
    try {
      const wl = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:           normalizedName,
          email:          normalizedEmail,
          company:        normalizedCompany,
          role:           normalizedRole,
          interest,
          requested_plan: signupPlan,
          website,
        }),
      })
      if (!wl.ok && wl.status !== 409) {
        setErrorMsg(t.login.errGeneric)
        setStatus('error')
        return
      }
    } catch {
      setErrorMsg(t.login.errGeneric)
      setStatus('error')
      return
    }

    // (2) Magic link com perfil no metadata.
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        // Passa pelo /auth/callback (e não direto ao /dashboard) para que o
        // code seja trocado por sessão, o perfil seja enriquecido e o email de
        // boas-vindas do free seja disparado na primeira sessão. O callback
        // redireciona ao /dashboard ao final.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name:          normalizedName,    // consumido por handle_new_user
          company:            normalizedCompany, // consumidos pelo callback
          job_title:          normalizedRole,
          preferred_language: dbLocale,
          signup_plan:        signupPlan,         // callback ativa a subscription na hora
        },
      },
    })

    if (error) {
      setErrorMsg(error.message || t.login.errGeneric)
      setStatus('error')
      return
    }

    setStatus('sent')
  }

  const isWaitlist   = mode === 'waitlist'
  const isFreeSignup = mode === 'free-signup'

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">

      {/* Nav */}
      <nav className="px-6 py-4 border-b border-zinc-100 bg-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-xl tracking-tight text-zinc-900">TAIME</Link>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
            ← {t.nav.howItWorks === 'Como funciona' ? 'Voltar' : 'Back'}
          </Link>
        </div>
      </nav>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm">

            {/* ── FREE SIGNUP: confirmação ─────────────────────────────── */}
            {isFreeSignup && status === 'sent' ? (
              <div className="text-center py-2">
                <div className="text-4xl mb-4">✉️</div>
                <h2 className="text-xl font-bold text-zinc-900 mb-2">{t.login.freeSentTitle}</h2>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {t.login.freeSentBody(email)}
                </p>
                <button
                  onClick={() => { setStatus('idle'); setEmail(''); setName(''); setCompany(''); setUserRole(''); setInterest('') }}
                  className="mt-6 text-sm text-taime-600 hover:underline"
                >
                  {t.login.changeEmail}
                </button>
              </div>

            /* ── WAITLIST: confirmação ─────────────────────────────────── */
            ) : isWaitlist && status === 'sent' ? (
              <div className="text-center py-2">
                <div className="w-14 h-14 rounded-full bg-emerald-50 ring-2 ring-emerald-200
                               flex items-center justify-center mx-auto mb-5">
                  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                       strokeWidth={2} className="text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-zinc-900 mb-2">
                  {t.login.successTitle(name.trim().split(' ')[0])}
                </h2>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {t.login.successBody(email)}
                </p>
                <button
                  onClick={() => { setStatus('idle'); setEmail(''); setName(''); setCompany(''); setUserRole(''); setInterest('') }}
                  className="mt-6 text-sm text-taime-600 hover:underline"
                >
                  {t.login.changeEmail}
                </button>
              </div>

            /* ── MAGIC LINK: confirmação ──────────────────────────────── */
            ) : !isWaitlist && !isFreeSignup && status === 'sent' ? (
              <div className="text-center py-2">
                <div className="text-4xl mb-4">✉️</div>
                <h2 className="text-xl font-bold text-zinc-900 mb-2">{t.login.sentTitle}</h2>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {t.login.sentBody(mlEmail)}
                </p>
                <button
                  onClick={() => { setStatus('idle'); setMlEmail('') }}
                  className="mt-6 text-sm text-taime-600 hover:underline"
                >
                  {t.login.changeEmail}
                </button>
              </div>

            /* ── FREE SIGNUP: formulário (mesmos campos da waitlist) ── */
            ) : isFreeSignup ? (
              <>
                <h1 className="text-2xl font-bold text-zinc-900 mb-1">
                  {signupPlan === 'essential' ? t.login.essentialTitle : t.login.freeTitle}
                </h1>
                <p className="text-sm text-zinc-500 mb-7 leading-relaxed">
                  {signupPlan === 'essential' ? t.login.essentialBody : t.login.freeBody}
                </p>

                <form onSubmit={handleFreeSignup} className="space-y-4">
                  {/* Honeypot anti-bot */}
                  <div
                    aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
                  >
                    <label htmlFor="fs-website">Website</label>
                    <input
                      id="fs-website"
                      type="text"
                      name="website"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label htmlFor="fs-name" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      {t.login.nameLabel} <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="fs-name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t.login.namePlaceholder}
                      required
                      disabled={status === 'loading'}
                      className={INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label htmlFor="fs-email" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      {t.login.emailLabel} <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="fs-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={t.login.emailPlaceholder}
                      required
                      disabled={status === 'loading'}
                      className={INPUT_CLS}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="fs-company" className="block text-sm font-medium text-zinc-700 mb-1.5">
                        {t.login.companyLabel}
                      </label>
                      <input
                        id="fs-company"
                        type="text"
                        value={company}
                        onChange={e => setCompany(e.target.value)}
                        placeholder={t.login.companyPlaceholder}
                        disabled={status === 'loading'}
                        className={INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label htmlFor="fs-role" className="block text-sm font-medium text-zinc-700 mb-1.5">
                        {t.login.roleLabel}
                      </label>
                      <input
                        id="fs-role"
                        type="text"
                        value={userRole}
                        onChange={e => setUserRole(e.target.value)}
                        placeholder={t.login.rolePlaceholder}
                        disabled={status === 'loading'}
                        className={INPUT_CLS}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="fs-interest" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      {t.login.interestLabel} <span className="text-red-400">*</span>
                    </label>
                    <select
                      id="fs-interest"
                      value={interest}
                      onChange={e => setInterest(e.target.value)}
                      required
                      disabled={status === 'loading'}
                      className={INPUT_CLS}
                    >
                      <option value="" disabled>{t.login.interestPlaceholder}</option>
                      {(t.login.interests as readonly string[]).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                      {t.login.interestNote}
                    </p>
                  </div>

                  {status === 'error' && (
                    <p className="text-sm text-red-600">{errorMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'loading' || !name || !email || !interest}
                    className="w-full btn-primary justify-center py-3 disabled:opacity-60 mt-2"
                  >
                    {status === 'loading'
                      ? t.login.freeSubmitting
                      : (signupPlan === 'essential' ? t.login.essentialSubmit : t.login.freeSubmit)}
                  </button>
                </form>

                <div className="mt-6 flex items-center justify-between text-sm">
                  <button
                    onClick={() => { setRequestedPlan('strategic'); switchMode('waitlist') }}
                    className="text-taime-600 hover:underline"
                  >
                    {t.nav.howItWorks === 'Como funciona' ? 'Solicitar o Strategic →' : 'Request Strategic →'}
                  </button>
                  <button
                    onClick={() => switchMode('magic-link')}
                    className="text-zinc-400 hover:text-zinc-600 hover:underline"
                  >
                    {t.login.switchToLogin}
                  </button>
                </div>
              </>

            /* ── WAITLIST: formulário (essential / strategic) ────────── */
            ) : isWaitlist ? (
              <>
                <h1 className="text-2xl font-bold text-zinc-900 mb-1">
                  {t.login.waitlistTitle}
                </h1>
                <p className="text-sm text-zinc-500 mb-7 leading-relaxed">
                  {t.login.waitlistBody}
                </p>

                <form onSubmit={handleWaitlist} className="space-y-4">
                  {/* Honeypot anti-bot */}
                  <div
                    aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
                  >
                    <label htmlFor="wl-website">Website</label>
                    <input
                      id="wl-website"
                      type="text"
                      name="website"
                      value={website}
                      onChange={e => setWebsite(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label htmlFor="wl-name" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      {t.login.nameLabel} <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="wl-name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t.login.namePlaceholder}
                      required
                      disabled={status === 'loading'}
                      className={INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label htmlFor="wl-email" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      {t.login.emailLabel} <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="wl-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={t.login.emailPlaceholder}
                      required
                      disabled={status === 'loading'}
                      className={INPUT_CLS}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="wl-company" className="block text-sm font-medium text-zinc-700 mb-1.5">
                        {t.login.companyLabel}
                      </label>
                      <input
                        id="wl-company"
                        type="text"
                        value={company}
                        onChange={e => setCompany(e.target.value)}
                        placeholder={t.login.companyPlaceholder}
                        disabled={status === 'loading'}
                        className={INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label htmlFor="wl-role" className="block text-sm font-medium text-zinc-700 mb-1.5">
                        {t.login.roleLabel}
                      </label>
                      <input
                        id="wl-role"
                        type="text"
                        value={userRole}
                        onChange={e => setUserRole(e.target.value)}
                        placeholder={t.login.rolePlaceholder}
                        disabled={status === 'loading'}
                        className={INPUT_CLS}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="wl-interest" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      {t.login.interestLabel} <span className="text-red-400">*</span>
                    </label>
                    <select
                      id="wl-interest"
                      value={interest}
                      onChange={e => setInterest(e.target.value)}
                      required
                      disabled={status === 'loading'}
                      className={INPUT_CLS}
                    >
                      <option value="" disabled>{t.login.interestPlaceholder}</option>
                      {(t.login.interests as readonly string[]).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                      {t.login.interestNote}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="wl-plan" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      {t.nav.howItWorks === 'Como funciona' ? 'Plano de interesse' : 'Plan of interest'}
                    </label>
                    <select
                      id="wl-plan"
                      value={requestedPlan}
                      onChange={e => {
                        const next = e.target.value as Plan
                        setRequestedPlan(next)
                        // Se o usuário volta para free no select, leva ele para o fluxo de self-signup.
                        if (next === 'free') switchMode('free-signup')
                      }}
                      disabled={status === 'loading'}
                      className={INPUT_CLS}
                    >
                      <option value="free">{t.nav.howItWorks === 'Como funciona' ? 'Gratuito, preview público' : 'Free, public preview'}</option>
                      <option value="essential">{t.nav.howItWorks === 'Como funciona' ? 'Essencial, histórico de 3 anos' : 'Essential, 3-year history'}</option>
                      <option value="strategic">{t.nav.howItWorks === 'Como funciona' ? 'Estratégico, histórico completo' : 'Strategic, full archive'}</option>
                    </select>
                  </div>

                  {status === 'error' && (
                    <p className="text-sm text-red-600">{errorMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'loading' || !name || !email || !interest}
                    className="w-full btn-primary justify-center py-3 disabled:opacity-60 mt-2"
                  >
                    {status === 'loading' ? t.login.submittingWaitlist : t.login.submitWaitlist}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    onClick={() => switchMode('magic-link')}
                    className="text-sm text-taime-600 hover:underline"
                  >
                    {t.login.switchToLogin}
                  </button>
                </div>
              </>

            /* ── MAGIC LINK: formulário ───────────────────────────────── */
            ) : (
              <>
                <h1 className="text-2xl font-bold text-zinc-900 mb-1">
                  {t.login.loginTitle}
                </h1>
                <p className="text-sm text-zinc-500 mb-8 leading-relaxed">
                  {t.login.loginBody}
                </p>

                <form onSubmit={handleMagicLink} className="space-y-4">
                  <div>
                    <label htmlFor="ml-email" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      {t.login.emailLabel}
                    </label>
                    <input
                      id="ml-email"
                      type="email"
                      value={mlEmail}
                      onChange={e => { setMlEmail(e.target.value); setNotFound(false) }}
                      placeholder={t.login.emailPlaceholder}
                      required
                      disabled={status === 'loading'}
                      className={INPUT_CLS}
                    />
                  </div>

                  {notFound ? (
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                      <p className="text-sm font-medium text-amber-800 mb-2">
                        {t.login.notFoundTitle}
                      </p>
                      <p className="text-xs text-amber-700 mb-3">
                        {t.login.notFoundBody}
                      </p>
                      <button
                        type="button"
                        onClick={() => switchMode('free-signup')}
                        className="text-xs font-semibold text-taime-600 hover:underline"
                      >
                        {t.login.notFoundCta}
                      </button>
                    </div>
                  ) : status === 'error' ? (
                    <p className="text-sm text-red-600">{errorMsg}</p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={status === 'loading' || !mlEmail}
                    className="w-full btn-primary justify-center py-3 disabled:opacity-60"
                  >
                    {status === 'loading' ? t.login.sending : t.login.sendLink}
                  </button>
                </form>

                <div className="mt-6 flex items-center justify-between text-sm">
                  <button
                    onClick={() => switchMode('free-signup')}
                    className="text-zinc-400 hover:text-zinc-600 hover:underline"
                  >
                    {t.login.switchToWaitlist}
                  </button>
                  <span className="text-xs text-zinc-400">{t.login.linkExpiry}</span>
                </div>
              </>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-zinc-400">
            <Link href="/" className="hover:text-zinc-600">← {t.nav.howItWorks === 'Como funciona' ? 'Voltar ao início' : 'Back to home'}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" />}>
      <LoginPageInner />
    </Suspense>
  )
}
