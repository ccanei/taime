import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdmin } from '@/lib/isAdmin'

/**
 * POST /api/admin/change-plan
 * Body: { email: string, plan: 'free' | 'essential' | 'strategic' }
 *
 * Permite ao admin alterar o plano de um usuário JÁ APROVADO (upgrade ou
 * downgrade). Busca o usuário em public.users pelo email para resolver o
 * id e faz upsert na subscriptions com merge-duplicates.
 *
 * Auth: mesmo padrão do /api/admin/approve (cookies do Next + isAdmin).
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
  if (!user || !await isAdmin(user.email ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // ── Payload ───────────────────────────────────────────────────────────────
  let body: { email?: string; plan?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  const planInput = body.plan ?? ''
  if (!['free', 'essential', 'strategic'].includes(planInput)) {
    return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
  }
  const plan = planInput as 'free' | 'essential' | 'strategic'

  // ── Resolve user_id via public.users (precisa do usuário aprovado) ───────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY!

  let userId: string | null = null
  try {
    const userRes = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
      {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    )
    if (userRes.ok) {
      const rows = await userRes.json() as Array<{ id?: string }>
      userId = rows[0]?.id ?? null
    } else {
      console.error('change-plan: busca em public.users falhou', userRes.status, await userRes.text())
    }
  } catch (e) {
    console.error('change-plan: exceção ao buscar usuário', e)
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Usuário ainda não aprovado ou sem conta criada.' },
      { status: 404 },
    )
  }

  // ── Upsert subscription com o novo plano ─────────────────────────────────
  const subRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id`,
    {
      method: 'POST',
      headers: {
        apikey:         serviceKey,
        Authorization:  `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer:         'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: userId, plan, status: 'active' }),
    },
  )

  if (!subRes.ok) {
    const dbErr = await subRes.text()
    console.error('change-plan: upsert subscription falhou', subRes.status, dbErr)
    return NextResponse.json(
      { error: dbErr || 'Erro ao atualizar plano' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, plan })
}
