'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import { useLocale } from '@/lib/useLocale'

type Mode   = 'waitlist' | 'magic-link'
type Status = 'idle' | 'loading' | 'sent' | 'error'

const INPUT_CLS = `w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-sm text-zinc-900
                   placeholder:text-zinc-400 bg-white
                   focus:outline-none focus:ring-2 focus:ring-taime-600 focus:border-transparent
                   disabled:opacity-60`

export default function LoginPage() {
  const { t } = useLocale()

  const [mode, setMode]     = useState<Mode>('waitlist')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Waitlist fields
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [company, setCompany]   = useState('')
  const [userRole, setUserRole] = useState('')
  const [interest, setInterest] = useState('')

  // Magic link field (separate email so it doesn't collide with waitlist)
  const [mlEmail, setMlEmail] = useState('')

  // Special flag: email not found in Supabase Auth
  const [notFound, setNotFound] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setStatus('idle')
    setErrorMsg('')
    setNotFound(false)
  }

  // ── Waitlist ────────────────────────────────────────────────────────────────

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !email || !interest) return
    setStatus('loading')

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:    name.trim(),
          email:   email.trim().toLowerCase(),
          company: company.trim() || null,
          role:    userRole.trim() || null,
          interest,
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

  // ── Magic link ──────────────────────────────────────────────────────────────

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

  const isWaitlist = mode === 'waitlist'

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

            {/* ── WAITLIST: confirmação ─────────────────────────────────── */}
            {isWaitlist && status === 'sent' ? (
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
            ) : !isWaitlist && status === 'sent' ? (
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

            /* ── WAITLIST: formulário ────────────────────────────────── */
            ) : isWaitlist ? (
              <>
                <h1 className="text-2xl font-bold text-zinc-900 mb-1">
                  {t.login.waitlistTitle}
                </h1>
                <p className="text-sm text-zinc-500 mb-7 leading-relaxed">
                  {t.login.waitlistBody}
                </p>

                <form onSubmit={handleWaitlist} className="space-y-4">
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
                        onClick={() => switchMode('waitlist')}
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
                    onClick={() => switchMode('waitlist')}
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
