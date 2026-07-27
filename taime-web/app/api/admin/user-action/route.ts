import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdmin } from '@/lib/isAdmin'

/**
 * POST /api/admin/user-action
 * Body: { id: string, action: 'suspend' | 'reactivate' }
 *
 * Controle manual de conta (decisao sempre humana, nunca automatica):
 *  - suspend:     bane o login via Admin API do Supabase (ban_duration longo) e
 *                 marca a subscription como 'canceled' (perde o plano).
 *  - reactivate:  remove o ban (ban_duration='none') e volta a subscription
 *                 'canceled' para 'active'.
 *
 * Mecanismo do bloqueio: GoTrue Admin API PUT /auth/v1/admin/users/{id} com
 * ban_duration. Um usuario banido nao consegue autenticar (nem magic link).
 * Sem delecao de conta nem de dados.
 */
const BAN_DURATION = '87600h' // ~10 anos (efetivamente permanente ate reativar)

export async function POST(request: NextRequest) {
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

  let body: { id?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { id, action } = body
  if (!id || (action !== 'suspend' && action !== 'reactivate')) {
    return NextResponse.json({ error: 'Missing or invalid id/action' }, { status: 400 })
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Missing Supabase env' }, { status: 500 })
  }
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }

  // 1. Ban / unban via Admin API (bloqueia o login).
  const authRes = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ban_duration: action === 'suspend' ? BAN_DURATION : 'none' }),
  })
  if (!authRes.ok) {
    const err = await authRes.text()
    console.error('[user-action] admin ban update failed:', authRes.status, err)
    return NextResponse.json({ error: err || 'Erro ao atualizar login' }, { status: 500 })
  }

  // 2. Subscription: cancela ao suspender, reativa ao reativar. Best-effort: o
  //    bloqueio de login (acima) e o efeito principal; se a subscription falhar,
  //    reportamos mas o ban ja valeu.
  const subStatus = action === 'suspend' ? 'canceled' : 'active'
  const subFilter = action === 'suspend'
    ? `user_id=eq.${encodeURIComponent(id)}`
    : `user_id=eq.${encodeURIComponent(id)}&status=eq.canceled`
  try {
    await fetch(`${url}/rest/v1/subscriptions?${subFilter}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ status: subStatus }),
    })
  } catch (e) {
    console.error('[user-action] subscription update failed (ban ja aplicado):', e)
  }

  return NextResponse.json({ success: true, banned: action === 'suspend' })
}
