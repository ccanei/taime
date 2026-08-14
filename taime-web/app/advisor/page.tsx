import type { Metadata } from 'next'
import PublicAdvisorGate from '@/components/PublicAdvisorGate'

export const metadata: Metadata = {
  title: 'Executive Advisor · TAIME',
  alternates: { canonical: 'https://www.taime.tech/advisor' },
}

// Segunda porta publica do Advisor, equivalente ao /ask (MESMO componente, MESMA
// regra, MESMA cota compartilhada). Logado -> Advisor completo; anonimo -> as 3
// perguntas com Turnstile. Sem redirect entre /advisor e /ask: sao duas URLs validas.
export default function AdvisorPage() {
  return <PublicAdvisorGate />
}
