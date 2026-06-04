import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { detectLocale } from '@/lib/i18n'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any))
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // ── Detecção de idioma no primeiro login (best-effort, jamais bloqueia)
      //    Hierarquia: escolha explícita > detecção no login > default 'pt-BR'.
      //    Aqui só promovemos 'pt-BR' (default herdado da aprovação) → 'en'
      //    quando o cookie da sessão indica EN. Nunca rebaixa 'en' → 'pt-BR'.
      //    Nunca toca registro com language_set_by_user=true.
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // detectLocale retorna 'pt' | 'en'; normaliza para o schema do banco
          const sessionDetected = detectLocale(cookieStore.get('taime-locale')?.value)
          const sessionLocale: 'pt-BR' | 'en' = sessionDetected === 'en' ? 'en' : 'pt-BR'

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
          const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''
          if (supabaseUrl && serviceKey) {
            const headers = {
              apikey:        serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            }
            const lookupRes = await fetch(
              `${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=preferred_language,language_set_by_user&limit=1`,
              { headers },
            )
            if (lookupRes.ok) {
              const rows = await lookupRes.json() as Array<{ preferred_language: string | null; language_set_by_user: boolean | null }>
              const profile = rows[0]
              if (
                profile &&
                profile.language_set_by_user === false &&
                profile.preferred_language === 'pt-BR' &&
                sessionLocale === 'en'
              ) {
                await fetch(
                  `${supabaseUrl}/rest/v1/users?id=eq.${user.id}`,
                  {
                    method: 'PATCH',
                    headers: { ...headers, Prefer: 'return=minimal' },
                    body:    JSON.stringify({ preferred_language: 'en' }),
                  },
                )
              }
            }
          }
        }
      } catch (e) {
        console.error('Auth callback: language detection failed (non-blocking):', e)
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
    console.error('Auth callback error:', error)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
