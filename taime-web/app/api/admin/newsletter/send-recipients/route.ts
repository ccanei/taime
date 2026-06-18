import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // ── Gate de admin ───────────────────────────────────────────────────────────
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(user.email ?? ''))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const url    = new URL(req.url)
  const sendId = (url.searchParams.get('send_id') ?? '').trim()
  if (!sendId) {
    return NextResponse.json({ error: 'Missing send_id' }, { status: 400 })
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_send_recipients` +
        `?send_id=eq.${encodeURIComponent(sendId)}` +
        `&select=id,subscriber_id,email,locale,delivered,error,created_at` +
        `&order=email.asc`,
      {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    )
    if (!res.ok) {
      const err = await res.text()
      console.error('send-recipients fetch:', res.status, err)
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
    }
    const rows = await res.json() as unknown[]
    return NextResponse.json({ recipients: rows })
  } catch (e) {
    console.error('send-recipients exception:', e)
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
  }
}
