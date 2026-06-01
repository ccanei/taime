import type { Metadata } from 'next'

// page.tsx é client component ('use client') e não pode exportar metadata.
// Este layout server fornece a canonical correta para a rota /planos.
export const metadata: Metadata = {
  alternates: {
    canonical: 'https://www.taime.tech/planos',
  },
}

export default function PlanosLayout({ children }: { children: React.ReactNode }) {
  return children
}
