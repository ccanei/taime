'use client'

import { useState, useEffect } from 'react'
import { getTranslations, detectLocale } from './i18n'
import type { Locale, Translations } from './i18n'

export function useLocale(): { locale: Locale; t: Translations } {
  const [locale, setLocale] = useState<Locale>('pt')

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)taime-locale=([^;]+)/)
    setLocale(detectLocale(match?.[1]))
  }, [])

  return { locale, t: getTranslations(locale) }
}
