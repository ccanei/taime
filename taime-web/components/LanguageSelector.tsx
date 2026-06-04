'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { detectLocale } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'

export default function LanguageSelector() {
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>('pt')

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)taime-locale=([^;]+)/)
    setLocale(detectLocale(match?.[1]))
  }, [])

  function switchLang(lang: Locale) {
    const maxAge = 60 * 60 * 24 * 365
    document.cookie = `taime-locale=${lang}; path=/; max-age=${maxAge}; SameSite=Lax`
    setLocale(lang)

    // Best-effort: persiste a escolha no perfil (public.users.preferred_language).
    // sendBeacon sobrevive ao window.location.reload() abaixo — um fetch normal
    // seria abortado. Anônimo recebe 401 e é ignorado: só o cookie vale.
    const dbLang = lang === 'pt' ? 'pt-BR' : 'en'
    try {
      const blob = new Blob([JSON.stringify({ language: dbLang })], { type: 'application/json' })
      navigator.sendBeacon('/api/account/language', blob)
    } catch { /* best-effort: nunca bloqueia a troca de idioma */ }

    router.refresh()
    setTimeout(() => window.location.reload(), 100)
  }

  return (
    <div className="flex items-center gap-1 text-xs font-semibold">
      <button
        onClick={() => switchLang('pt')}
        className={`px-1.5 py-0.5 rounded transition-colors
          ${locale === 'pt'
            ? 'text-zinc-900 bg-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600'
          }`}
        aria-label="Português"
      >
        PT
      </button>
      <span className="text-zinc-200 select-none">|</span>
      <button
        onClick={() => switchLang('en')}
        className={`px-1.5 py-0.5 rounded transition-colors
          ${locale === 'en'
            ? 'text-zinc-900 bg-zinc-100'
            : 'text-zinc-400 hover:text-zinc-600'
          }`}
        aria-label="English"
      >
        EN
      </button>
    </div>
  )
}
