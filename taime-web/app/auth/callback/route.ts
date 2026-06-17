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
      // ── Enriquecimento do perfil (best-effort, jamais bloqueia o login).
      //    Trigger handle_new_user já inseriu a row em public.users com
      //    (id, email, full_name). Aqui complementamos company / job_title /
      //    preferred_language a partir do user_metadata que foi gravado pelo
      //    free-signup no /login (signInWithOtp options.data).
      //
      //    Regras COALESCE: só preenchemos campos onde o perfil atual está
      //    vazio. Nunca rebaixamos quem foi aprovado manualmente nem
      //    sobrescrevemos uma escolha consciente do usuário.
      //
      //    Idioma mantém a hierarquia anterior: language_set_by_user=true
      //    é intocável; com false, metadata vence detecção de cookie, que
      //    vence default 'pt-BR'.
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const sessionDetected = detectLocale(cookieStore.get('taime-locale')?.value)
          const sessionLocale: 'pt-BR' | 'en' = sessionDetected === 'en' ? 'en' : 'pt-BR'

          const meta = (user.user_metadata ?? {}) as Record<string, unknown>
          const pickStr = (v: unknown): string | null =>
            typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
          const metaCompany  = pickStr(meta.company)
          const metaJobTitle = pickStr(meta.job_title)
          const rawMetaLang  = typeof meta.preferred_language === 'string' ? meta.preferred_language : ''
          const metaLang: 'pt-BR' | 'en' | null =
            rawMetaLang === 'pt-BR' || rawMetaLang === 'en' ? rawMetaLang : null

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
          const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''
          if (supabaseUrl && serviceKey) {
            const headers = {
              apikey:        serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            }
            const lookupRes = await fetch(
              `${supabaseUrl}/rest/v1/users?id=eq.${user.id}&select=company,job_title,preferred_language,language_set_by_user&limit=1`,
              { headers },
            )
            if (lookupRes.ok) {
              const rows = await lookupRes.json() as Array<{
                company:              string | null
                job_title:            string | null
                preferred_language:   string | null
                language_set_by_user: boolean | null
              }>
              const profile = rows[0]
              if (profile) {
                const patch: Record<string, string> = {}

                // COALESCE: só preenche se metadata trouxe valor E o perfil
                // atual está vazio. Quem aprovou manualmente fica preservado.
                if (metaCompany  && !profile.company)   patch.company   = metaCompany
                if (metaJobTitle && !profile.job_title) patch.job_title = metaJobTitle

                // Idioma: nunca toca em language_set_by_user=true.
                if (profile.language_set_by_user === false) {
                  const target: 'pt-BR' | 'en' | null =
                    metaLang ??
                    (profile.preferred_language === 'pt-BR' && sessionLocale === 'en' ? 'en' : null)
                  if (target && target !== profile.preferred_language) {
                    patch.preferred_language = target
                  }
                }

                if (Object.keys(patch).length > 0) {
                  await fetch(
                    `${supabaseUrl}/rest/v1/users?id=eq.${user.id}`,
                    {
                      method: 'PATCH',
                      headers: { ...headers, Prefer: 'return=minimal' },
                      body:    JSON.stringify(patch),
                    },
                  )
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('Auth callback: profile enrichment failed (non-blocking):', e)
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
    console.error('Auth callback error:', error)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
