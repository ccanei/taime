import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import AskChat from '@/components/AskChat'
import { createSupabaseServer } from '@/lib/supabase-server'

export const metadata: Metadata = {
  title: 'Executive Advisor · TAIME',
  alternates: { canonical: 'https://www.taime.tech/ask' },
}

// Pagina publica do Advisor de demonstracao (3 perguntas sem login). A chave
// publica do Turnstile e passada ao cliente; se estiver ausente, o AskChat mostra
// estado indisponivel e o endpoint /api/ask fica travado (503). Assim o captcha
// nunca fica opcional em producao.
//
// Usuario LOGADO cai direto no Advisor completo do plano dele: o /ask e exclusivo
// de anonimos. Redirect server-side antes de renderizar a experiencia anonima.
export default async function AskPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/advisor')

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
