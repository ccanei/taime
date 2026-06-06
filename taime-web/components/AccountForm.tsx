'use client'

import { useState } from 'react'
import { useLocale } from '@/lib/useLocale'

type Status = 'idle' | 'saving' | 'saved' | 'error'

interface InitialData {
  full_name:          string | null
  email:              string | null
  company:            string | null
  job_title:          string | null
  preferred_language: 'pt-BR' | 'en'
}

export default function AccountForm({ initial }: { initial: InitialData }) {
  const { t, locale } = useLocale()
  const isPt = t.nav.howItWorks === 'Como funciona'

  const [company,  setCompany]  = useState(initial.company  ?? '')
  const [jobTitle, setJobTitle] = useState(initial.job_title ?? '')
  const [language, setLanguage] = useState<'pt-BR' | 'en'>(initial.preferred_language)
  const [status,   setStatus]   = useState<Status>('idle')
  const [errMsg,   setErrMsg]   = useState('')

  const L = isPt
    ? {
        profile:     'Perfil',
        name:        'Nome',
        email:       'Email',
        company:     'Empresa',
        companyPh:   'Sua empresa',
        role:        'Cargo',
        rolePh:      'Seu cargo',
        language:    'Idioma preferido',
        portuguese:  'Português',
        english:     'English',
        notEditable: 'não editável',
        save:        'Salvar alterações',
        saving:      'Salvando...',
        saved:       'Alterações salvas.',
        err:         'Não foi possível salvar. Tente novamente.',
        helpLocked:  'Para alterar nome ou email, fale com o suporte.',
      }
    : {
        profile:     'Profile',
        name:        'Name',
        email:       'Email',
        company:     'Company',
        companyPh:   'Your company',
        role:        'Job title',
        rolePh:      'Your role',
        language:    'Preferred language',
        portuguese:  'Português',
        english:     'English',
        notEditable: 'not editable',
        save:        'Save changes',
        saving:      'Saving...',
        saved:       'Changes saved.',
        err:         "Couldn't save. Try again.",
        helpLocked:  'To change name or email, contact support.',
      }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving'); setErrMsg('')

    try {
      const res = await fetch('/api/account/update', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          company:            company.trim() || null,
          job_title:          jobTitle.trim() || null,
          preferred_language: language,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setErrMsg(data.error ?? L.err); setStatus('error')
        return
      }

      const prevLocale = locale
      const wantLocale: 'pt' | 'en' = language === 'en' ? 'en' : 'pt'

      // Se o idioma mudou, sincroniza o cookie de navegação e recarrega
      // (mesmo padrão do LanguageSelector — o reload aplica o idioma novo
      // a todo o site, não só esta página).
      if (wantLocale !== prevLocale) {
        const maxAge = 60 * 60 * 24 * 365
        document.cookie = `taime-locale=${wantLocale}; path=/; max-age=${maxAge}; SameSite=Lax`
        setStatus('saved')
        setTimeout(() => window.location.reload(), 600)
        return
      }

      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setErrMsg(L.err); setStatus('error')
    }
  }

  const busy = status === 'saving'

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      <header className="px-6 py-4 border-b border-zinc-100">
        <h2 className="text-sm font-bold text-zinc-900">{L.profile}</h2>
      </header>

      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
        {/* Nome — locked */}
        <LockedField
          label={L.name}
          value={initial.full_name ?? ''}
          notEditable={L.notEditable}
        />

        {/* Email — locked */}
        <LockedField
          label={L.email}
          value={initial.email ?? ''}
          notEditable={L.notEditable}
        />

        {/* Empresa */}
        <div>
          <label htmlFor="company" className="block text-xs font-semibold text-zinc-700 mb-1.5">
            {L.company}
          </label>
          <input
            id="company"
            type="text"
            value={company}
            onChange={e => setCompany(e.target.value)}
            placeholder={L.companyPh}
            maxLength={200}
            disabled={busy}
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200
                       bg-white text-zinc-900 placeholder:text-zinc-400
                       focus:outline-none focus:ring-2 focus:ring-taime-600
                       focus:border-transparent disabled:opacity-60"
          />
        </div>

        {/* Cargo */}
        <div>
          <label htmlFor="job_title" className="block text-xs font-semibold text-zinc-700 mb-1.5">
            {L.role}
          </label>
          <input
            id="job_title"
            type="text"
            value={jobTitle}
            onChange={e => setJobTitle(e.target.value)}
            placeholder={L.rolePh}
            maxLength={200}
            disabled={busy}
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200
                       bg-white text-zinc-900 placeholder:text-zinc-400
                       focus:outline-none focus:ring-2 focus:ring-taime-600
                       focus:border-transparent disabled:opacity-60"
          />
        </div>

        {/* Idioma */}
        <div>
          <label htmlFor="language" className="block text-xs font-semibold text-zinc-700 mb-1.5">
            {L.language}
          </label>
          <select
            id="language"
            value={language}
            onChange={e => setLanguage(e.target.value as 'pt-BR' | 'en')}
            disabled={busy}
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200
                       bg-white text-zinc-900 focus:outline-none focus:ring-2
                       focus:ring-taime-600 focus:border-transparent disabled:opacity-60"
          >
            <option value="pt-BR">{L.portuguese}</option>
            <option value="en">{L.english}</option>
          </select>
        </div>

        <p className="text-xs text-zinc-400">
          {L.helpLocked}
        </p>

        {status === 'error' && errMsg && (
          <p className="text-xs text-red-600">{errMsg}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold
                       bg-taime-600 text-white hover:bg-taime-700
                       disabled:opacity-60 disabled:cursor-not-allowed
                       transition-colors"
          >
            {busy ? L.saving : L.save}
          </button>

          {status === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
              {L.saved}
            </span>
          )}
        </div>
      </form>
    </section>
  )
}

function LockedField({
  label, value, notEditable,
}: {
  label: string; value: string; notEditable: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
        {label}
        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {notEditable}
        </span>
      </label>
      <input
        type="text"
        value={value}
        disabled
        readOnly
        className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200
                   bg-zinc-50 text-zinc-500 cursor-not-allowed"
      />
    </div>
  )
}
