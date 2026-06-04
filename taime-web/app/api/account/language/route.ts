import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * POST /api/account/language
 * Body: { language: 'pt-BR' | 'en' }
 *
 * Persiste a escolha explícita do usuário em `public.users`:
 *   - preferred_language     = language
 *   - language_set_by_user   = true
 *   - updated_at             = now()
 *
 * Esta é a camada "C" da hierarquia (escolha explícita do usuário). Marcar
 * `language_set_by_user=true` blinda o registro contra a detecção automática
 * do callback de login, que só promove 'pt-BR' → 'en' quando essa flag é false.
 */
export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
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
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Payload ───────────────────────────────────────────────────────────────
  let body: { language?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const language = body.language
  if (language !== 'pt-BR' && language !== 'en') {
    return NextResponse.json({ error: 'language must be "pt-BR" or "en"' }, { status: 400 })
  }

  // ── UPDATE em public.users (service key) ─────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY!

  const res = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}`, {
    method:  'PATCH',
    headers: {
      apikey:         serviceKey,
      Authorization:  `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer:         'return=minimal',
    },
    body: JSON.stringify({
      preferred_language:   language,
      language_set_by_user: true,
      updated_at:           new Date().toISOString(),
    }),
  })

  if (!res.ok) {
    const dbErr = await res.text()
    console.error('account/language: PATCH falhou', res.status, dbErr)
    return NextResponse.json(
      { error: dbErr || 'Erro ao salvar idioma' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, language })
}
