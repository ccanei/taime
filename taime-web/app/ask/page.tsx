import type { Metadata } from 'next'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import AskChat from '@/components/AskChat'

export const metadata: Metadata = {
  title: 'Executive Advisor · TAIME',
  alternates: { canonical: 'https://www.taime.tech/ask' },
}

// Pagina publica do Advisor de demonstracao (3 perguntas sem login). A chave
// publica do Turnstile e passada ao cliente; se estiver ausente, o AskChat mostra
// estado indisponivel e o endpoint /api/ask fica travado (503). Assim o captcha
// nunca fica opcional em producao.
export default function AskPage() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
        <AskChat siteKey={siteKey} />
      </main>
      <Footer />
    </div>
  )
}
