import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const LOCALE_COOKIE = 'taime-locale'
const LOCALE_MAX_AGE = 60 * 60 * 24 * 365 // 1 ano

const PROTECTED_PATHS = ['/dashboard', '/reports', '/admin'] as const

function detectFromAcceptLanguage(header: string | null): 'pt' | 'en' {
  if (!header) return 'en'
  // O Accept-Language do navegador vem como "pt-BR,pt;q=0.9,en-US;q=0.8".
  // Pegamos a primeira preferência — se for português em qualquer variante,
  // entrega 'pt'; caso contrário, 'en' (padrão internacional).
  const primary = header.split(',')[0]?.trim().toLowerCase() ?? ''
  return primary.startsWith('pt') ? 'pt' : 'en'
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // ─── Locale auto-detection ─────────────────────────────────────────────
  // Roda em TODAS as rotas cobertas pelo matcher. Se o cookie já existe,
  // respeita a escolha do usuário e não toca em nada. Se não existe,
  // detecta pelo Accept-Language e grava — primeira visita só.
  const existingLocale = request.cookies.get(LOCALE_COOKIE)?.value
  if (existingLocale !== 'pt' && existingLocale !== 'en') {
    const detected = detectFromAcceptLanguage(request.headers.get('accept-language'))
    response.cookies.set(LOCALE_COOKIE, detected, {
      path:     '/',
      maxAge:   LOCALE_MAX_AGE,
      sameSite: 'lax',
    })
  }

  // ─── Auth gate (só nas rotas protegidas) ───────────────────────────────
  // Evita supabase.auth.getUser() em todo request público (custo de rede).
  const { pathname } = request.nextUrl
  const isProtected  = PROTECTED_PATHS.some(p => pathname.startsWith(p))
  if (!isProtected) return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value))
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as any))
        },
      },
    }
  )

  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    try {
      const { data } = await supabase.auth.getSession()
      user = data.session?.user ?? null
    } catch { user = null }
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  // Roda em todas as páginas e endpoints, EXCETO:
  //   /api/*        — endpoints próprios (cada um faz sua auth/locale)
  //   /_next/*      — assets internos do Next
  //   favicon, og-image, robots, sitemap e qualquer arquivo com extensão
  // Isso garante locale-detection nas rotas públicas (landing, sobre,
  // planos, login, etc.) sem custo de auth em todas elas.
  matcher: ['/((?!api/|_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)'],
}
