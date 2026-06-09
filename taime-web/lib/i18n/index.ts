import { pt } from './pt'
import { en } from './en'

export type Locale = 'pt' | 'en'

// Strip as-const narrowness: make all string literals → string, all readonly → mutable.
// Keeps function signatures and recursive object structure intact.
type DeepMutable<T> =
  T extends (...args: infer A) => infer R ? (...args: A) => R :
  T extends ReadonlyArray<infer U>        ? Array<DeepMutable<U>> :
  T extends object                         ? { -readonly [K in keyof T]: DeepMutable<T[K]> } :
  T extends string                         ? string :
  T

export type Translations = DeepMutable<typeof pt>

export function getTranslations(locale: Locale): Translations {
  return (locale === 'en' ? en : pt) as Translations
}

export function detectLocale(cookieValue: string | undefined): Locale {
  // EN é o padrão internacional. O proxy.ts decide PT vs EN na primeira
  // visita (via Accept-Language) e grava o cookie; quando aqui chegamos,
  // o cookie já existe. O fallback EN só pega se o cookie sumiu ou veio
  // com valor inválido.
  return cookieValue === 'pt' ? 'pt' : 'en'
}
