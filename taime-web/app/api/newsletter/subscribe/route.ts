import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  let body: { email?: string; website?: string; locale?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Honeypot: campo "website" só é preenchido por bots ───────────────────
  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json({ success: true })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const locale = body.locale === 'en' ? 'en' : 'pt-BR'

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    console.error('newsletter/subscribe: missing Supabase env vars')
    return NextResponse.json({ error: 'Erro ao inscrever' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_subscribers?on_conflict=email`,
      {
        method: 'POST',
        headers: {
          apikey:         serviceKey,
          Authorization:  `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer:         'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          email,
          locale,
          status: 'active',
          source: 'radar',
        }),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('newsletter/subscribe insert:', res.status, err)
      return NextResponse.json({ error: 'Erro ao inscrever' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('newsletter/subscribe exception:', e)
    return NextResponse.json({ error: 'Erro ao inscrever' }, { status: 500 })
  }
}
