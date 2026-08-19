import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Preferencias de alertas do Advisor (Fase 3.1, TAREFA 4). Salva os 3 booleans em
// public.users via service key (mesmo padrao de /api/account/update). Whitelist estrita.
interface Body { alert_new_signal?: boolean; alert_stalled_action?: boolean; alerts_muted?: boolean }

export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Body
  try { body = await req.json() as Body } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.alert_new_signal === 'boolean')     patch.alert_new_signal = body.alert_new_signal
  if (typeof body.alert_stalled_action === 'boolean') patch.alert_stalled_action = body.alert_stalled_action
  if (typeof body.alerts_muted === 'boolean')         patch.alerts_muted = body.alerts_muted
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY!
  const res = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}`, {
    method: 'PATCH',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    console.error('account/notifications: PATCH falhou', res.status, (await res.text()).slice(0, 200))
    return NextResponse.json({ error: 'Erro ao salvar preferências' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
