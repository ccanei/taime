import type { Metadata } from 'next'

// page.tsx é client component ('use client') e não pode exportar metadata.
// Este layout server fornece a canonical correta para a rota /contato.
export const metadata: Metadata = {
  alternates: {
    canonical: 'https://www.taime.tech/contato',
  },
}

export default function ContatoLayout({ children }: { children: React.ReactNode }) {
  return children
}
