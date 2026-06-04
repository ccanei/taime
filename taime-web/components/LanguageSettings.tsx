'use client'

import { useState } from 'react'
import { useLocale } from '@/lib/useLocale'

type Language = 'pt-BR' | 'en'

/**
 * Seletor de idioma do PERFIL (persistido em public.users.preferred_language).
 *
 * Distinto do cookie `taime-locale` (idioma da sessão de navegação).
 * Aqui marcamos a coluna `language_set_by_user=true` no backend, blindando
 * o registro contra a detecção automática do callback de login.
 *
 * Salva on-change. Feedback "Saved" visual breve por ~2s.
 */
export default function LanguageSettings({ initialLanguage }: { initialLanguage: Language }) {
  const { t } = useLocale()
  const isPt = t.nav.howItWorks === 'Como funciona'

  const [language, setLanguage] = useState<Language>(initialLanguage)
  const [saving,   setSaving]   = useState(false)
  const [savedAt,  setSavedAt]  = useState<number | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  const labels = isPt
    ? { heading: 'Idioma do perfil', sub: 'Define o idioma padrão do seu perfil. Pode ser diferente do idioma da sessão atual.', saving: 'Salvando...', saved: 'Salvo' }
    : { heading: 'Profile language',  sub: 'Sets the default language of your profile. Can differ from your current session language.', saving: 'Saving...', saved: 'Saved' }

  async function save(next: Language) {
    if (next === language) return
    setSaving(true); setError(null); setSavedAt(null)
    const prev = language
    setLanguage(next)
    try {
      const res = await fetch('/api/account/language', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ language: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(data.error ?? (isPt ? 'Não foi possível salvar.' : 'Could not save.'))
        setLanguage(prev) // reverte UI
        return
      }
      setSavedAt(Date.now())
      // limpa o "saved" depois de 2s
      setTimeout(() => setSavedAt(t0 => (t0 && Date.now() - t0 >= 1900 ? null : t0)), 2000)
    } catch {
      setError(isPt ? 'Não foi possível salvar.' : 'Could not save.')
      setLanguage(prev)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{labels.heading}</p>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed max-w-md">{labels.sub}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div role="group" aria-label={labels.heading} className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            {(['pt-BR', 'en'] as const).map(opt => {
              const active = language === opt
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => save(opt)}
                  disabled={saving}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                    ${active
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-700'}
                    disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {opt === 'pt-BR' ? 'PT-BR' : 'EN'}
                </button>
              )
            })}
          </div>

          {saving && (
            <span className="text-xs text-zinc-400">{labels.saving}</span>
          )}
          {!saving && savedAt && (
            <span className="text-xs text-emerald-600 font-medium">✓ {labels.saved}</span>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
