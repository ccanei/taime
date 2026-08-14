import type { Metadata } from 'next'
import PublicAdvisorGate from '@/components/PublicAdvisorGate'

export const metadata: Metadata = {
  title: 'Executive Advisor · TAIME',
  alternates: { canonical: 'https://www.taime.tech/ask' },
}

// Pagina publica do Advisor de demonstracao (3 perguntas sem login). Corpo e regra
// vivem em PublicAdvisorGate, compartilhado com /advisor (duas portas equivalentes,
// mesma cota). O /ask nao muda em nada: mesmo destino de logado, mesma experiencia
// anonima. A chave publica do Turnstile e resolvida no gate; ausente = /api/ask 503.
export default function AskPage() {
  return <PublicAdvisorGate />
}
