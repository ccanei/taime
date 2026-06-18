import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'

export const dynamic = 'force-dynamic'

type Action = 'block' | 'reactivate' | 'remove'

// Mapa de ação -> status alvo. Aqui está toda a regra de transição em um lugar.
const STATUS_BY_ACTION: Record<Action, string> = {
  block:       'blocked',
  reactivate:  'active',
  remove:      'removed',
}

export async function POST(req: Request) {
  // ── Gate de admin ───────────────────────────────────────────────────────────
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(user.email ?? ''))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // ── Payload ─────────────────────────────────────────────────────────────────
  let body: { id?: string; action?: string; reason?: string }
  try {
    body = await req.json() as { id?: string; action?: string; reason?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const id     = (body.id ?? '').trim()
  const action = (body.action ?? '') as Action
  if (!id || !(action in STATUS_BY_ACTION)) {
    return NextResponse.json({ error: 'Missing or invalid action' }, { status: 400 })
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  // Monta patch: rastro de status sempre presente; blocked_reason só faz
  // sentido em block (limpa em reactivate; preserva em remove para histórico).
  const status = STATUS_BY_ACTION[action]
  const patch: Record<string, string | null> = {
    status,
    status_changed_at: new Date().toISOString(),
    status_changed_by: user.email ?? 'admin',
  }
  if (action === 'block') {
    patch.blocked_reason = (body.reason ?? '').trim() || null
  } else if (action === 'reactivate') {
    patch.blocked_reason = null
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_subscribers?id=eq.${encodeURIComponent(id)}`,
      {
        method:  'PATCH',
        headers: {
          apikey:         serviceKey,
          Authorization:  `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer:         'return=minimal',
        },
        body: JSON.stringify(patch),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('subscriber-action patch:', res.status, err)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, status })
  } catch (e) {
    console.error('subscriber-action exception:', e)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
