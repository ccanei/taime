import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdmin } from '@/lib/isAdmin'

export async function POST(request: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const cookieStore = cookies()
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
  if (!user || !await isAdmin(user.email ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // ── Payload ───────────────────────────────────────────────────────────────
  let body: { id?: string; email: string; name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, name } = body
  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY!

  // ── Cria usuário no Supabase Auth via REST admin API ──────────────────────
  const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method:  'POST',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { full_name: name ?? '' },
    }),
  })

  if (!authRes.ok) {
    const authErr = await authRes.json().catch(() => ({})) as { msg?: string; message?: string }
    const msg = authErr.msg ?? authErr.message ?? ''
    // "already exists" é ok — usuário pode ter sido criado antes
    if (!msg.toLowerCase().includes('already')) {
      return NextResponse.json({ error: msg || 'Erro ao criar usuário' }, { status: 500 })
    }
  }

  // ── Marca contacted = true na waitlist (pelo email) ───────────────────────
  const updateRes = await fetch(
    `${supabaseUrl}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}`,
    {
      method:  'PATCH',
      headers: {
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ contacted: true }),
    },
  )

  if (!updateRes.ok) {
    const dbErr = await updateRes.text()
    return NextResponse.json({ error: dbErr || 'Erro ao atualizar waitlist' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Acesso liberado' })
}
