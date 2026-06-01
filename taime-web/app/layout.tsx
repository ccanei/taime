import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.taime.tech'),
  title: {
    default: 'TAIME — Inteligência Estratégica em Tecnologia | Strategic Technology Intelligence',
    template: '%s | TAIME',
  },
  description: 'Relatórios quinzenais que transformam sinais globais de tecnologia em inteligência executiva. Framework de decisão, scoring e memória temporal. Biweekly reports turning global tech signals into executive intelligence.',
  keywords: [
    'inteligência estratégica em tecnologia',
    'relatório de tendências tecnológicas',
    'framework de decisão tecnológica',
    'inteligência executiva tecnologia',
    'tendências tech',
    'strategic technology intelligence',
    'tech trends report',
    'technology decision framework',
    'executive technology intelligence',
    'biweekly tech intelligence',
    'TAIME',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    alternateLocale: ['en_US'],
    url: 'https://www.taime.tech',
    siteName: 'TAIME',
    title: 'TAIME — Inteligência Estratégica em Tecnologia',
    description: 'Sinais globais de tecnologia transformados em inteligência executiva de decisão.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'TAIME' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TAIME — Inteligência Estratégica em Tecnologia',
    description: 'Sinais globais de tecnologia transformados em inteligência executiva.',
    images: ['/og-image.png'],
  },
  // Canonical é definida por página (cada rota tem sua URL própria).
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/taime-icon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
