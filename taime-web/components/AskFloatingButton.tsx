'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'

// Pill flutuante que leva o visitante nao autenticado ao /ask. A logica de exibicao
// (rota + sessao) fica no wrapper AskFloatingGate; aqui e so a apresentacao. O idioma
// vem do mesmo mecanismo de locale do site (useLocale: cookie taime-locale, default EN).
export default function AskFloatingButton() {
  const { locale } = useLocale()
  const label = locale === 'pt' ? 'Pergunte ao Advisor' : 'Ask the Advisor'

  return (
    <Link
      href="/ask"
      aria-label={label}
      className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full
                 bg-[#2563EB] hover:bg-[#1D4ED8] text-white
                 px-4 py-3 sm:px-5 shadow-lg shadow-blue-900/15
                 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
    >
      {/* Icone de chat (SVG inline, sem dependencia nova). */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
      {/* Texto: oculto no mobile (< sm) para nao poluir a tela. */}
      <span className="hidden sm:inline text-sm font-semibold whitespace-nowrap">{label}</span>
    </Link>
  )
}
