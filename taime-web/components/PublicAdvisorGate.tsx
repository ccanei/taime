import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import AskChat from '@/components/AskChat'
import { createSupabaseServer } from '@/lib/supabase-server'

// Porta publica do Advisor, compartilhada por /ask e /advisor (duas URLs, MESMA
// regra, ZERO duplicacao de logica). Servidor:
//  - AUTENTICADO -> Advisor completo do plano (mesmo destino do redirect de /ask).
//  - ANONIMO      -> experiencia anonima (AskChat + Turnstile + cota de 3 + chips +
//                    captura de e-mail), identica nas duas portas.
// A cota do anonimo e COMPARTILHADA entre as duas URLs porque vive no endpoint
// /api/ask via cookie assinado (Path=/) + teto por IP; alternar de porta nao
// dobra as 3 perguntas. Turnstile, anti-scraping e classificador meta ficam todos
// no /api/ask, entao sao identicos aqui.
export default async function PublicAdvisorGate() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/advisor')

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Navbar />
      {/* Desktop (lg+): libera a largura para as tres colunas do /ask anonimo. O
          AskChat controla a largura interna (centro em leitura; laterais so na home).
          Mobile e tablet ficam inalterados (max-w-5xl so tem efeito acima de 1024px). */}
      <main className="flex-1 max-w-5xl lg:max-w-[1480px] w-full mx-auto px-6 py-10">
        <AskChat siteKey={siteKey} />
      </main>
      <Footer />
    </div>
  )
}
