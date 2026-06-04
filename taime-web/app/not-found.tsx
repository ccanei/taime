import Link from 'next/link'
import { cookies } from 'next/headers'

export default async function NotFound() {
  const localeCookie = (await cookies()).get('taime-locale')?.value
  const isEn = localeCookie === 'en'

  const t = isEn
    ? {
        message:  "Page not found. The content you're looking for doesn't exist or was moved.",
        back:     'Back home',
        secondary: 'Browse the latest reports',
      }
    : {
        message:  'Página não encontrada. O conteúdo que você procura não existe ou foi movido.',
        back:     'Voltar ao início',
        secondary: 'Ver os últimos relatórios',
      }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <Link href="/" className="font-bold text-xl tracking-tight text-zinc-900">
            TAIME
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-xl w-full text-center">
          <p className="text-xs font-bold tracking-[0.25em] text-taime-600 uppercase mb-6">
            Error
          </p>

          {/* Big 404 */}
          <h1 className="text-[120px] sm:text-[160px] font-extrabold leading-none tracking-tight
                         bg-gradient-to-br from-taime-600 to-taime-900 bg-clip-text text-transparent
                         select-none">
            404
          </h1>

          <p className="mt-6 text-base sm:text-lg text-zinc-600 leading-relaxed max-w-md mx-auto">
            {t.message}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/" className="btn-primary text-sm">
              {t.back}
            </Link>
            <Link
              href="/#reports"
              className="text-sm font-medium text-zinc-500 hover:text-taime-700 transition-colors px-3 py-2"
            >
              {t.secondary} →
            </Link>
          </div>
        </div>
      </main>

      {/* Footer minimal */}
      <footer className="px-6 py-6 text-center">
        <p className="text-xs text-zinc-400">
          TAIME — {isEn ? 'Strategic Technology Intelligence' : 'Inteligência Estratégica em Tecnologia'}
        </p>
      </footer>
    </div>
  )
}
