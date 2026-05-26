import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { name, email, company, role, interest } = await req.json()

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    console.error('waitlist: missing env vars')
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/waitlist`,
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ name, email, company, role, interest }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('waitlist insert:', res.status, err)
      if (res.status === 409) {
        return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('waitlist exception:', e)
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }
}
