import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TAIME — Inteligência Estratégica em Tecnologia',
  description: 'O TAIME transforma sinais tecnológicos globais em inteligência executiva estruturada — com scoring, análise temporal e orientação de movimento para líderes, gestores, consultores e empreendedores.',
  openGraph: {
    title: 'TAIME — Do sinal à decisão',
    description: 'Inteligência estratégica em tecnologia com scoring, framework decisório e memória de 25 anos.',
    type: 'website',
  },
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
