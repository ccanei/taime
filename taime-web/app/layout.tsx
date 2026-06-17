import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.taime.tech'),
  title: {
    default: 'TAIME — Strategic Technology Intelligence Reports',
    template: '%s | TAIME',
  },
  description: 'TAIME turns global technology signals into executive decision intelligence: biweekly reports with scoring, a decision framework, and temporal memory.',
  keywords: [
    'strategic technology intelligence',
    'tech trends report',
    'technology decision framework',
    'executive technology intelligence',
    'biweekly tech intelligence',
    'inteligência estratégica em tecnologia',
    'relatório de tendências tecnológicas',
    'framework de decisão tecnológica',
    'inteligência executiva tecnologia',
    'tendências tech',
    'TAIME',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['pt_BR'],
    url: 'https://www.taime.tech',
    siteName: 'TAIME',
    title: 'TAIME — Strategic Technology Intelligence',
    description: 'Global technology signals turned into executive decision intelligence. Biweekly reports with scoring, decision framework, and temporal memory.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'TAIME' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TAIME — Strategic Technology Intelligence',
    description: 'Global tech signals turned into executive decision intelligence, with scoring and a decision framework for technology leaders.',
    images: ['/og-image.png'],
  },
  // Canonical é definida por página (cada rota tem sua URL própria).
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/taime-icon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
