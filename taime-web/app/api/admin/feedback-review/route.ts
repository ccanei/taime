import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdmin } from '@/lib/isAdmin'

/**
 * POST /api/admin/feedback-review
 * Body: { id: string }
 *
 * Marca um feedback como `status = 'reviewed'`.
 * Auth: mesmo padrão de /api/admin/waitlist-reject.
 */
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

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id } = body
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY!

  const res = await fetch(
    `${supabaseUrl}/rest/v1/feedback?id=eq.${encodeURIComponent(id)}`,
    {
      method:  'PATCH',
      headers: {
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ status: 'reviewed' }),
    },
  )

  if (!res.ok) {
    const dbErr = await res.text()
    return NextResponse.json({ error: dbErr || 'Erro ao atualizar' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
