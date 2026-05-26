import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL || ''
  ).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')

  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    console.error('Radar: missing Supabase env vars')
    return NextResponse.json([])
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/radar_signals` +
      `?order=collected_at.desc&limit=10`,
      {
        headers: {
          apikey:          supabaseKey,
          Authorization:   `Bearer ${supabaseKey}`,
          'Content-Type':  'application/json',
        },
        cache: 'no-store',
      }
    )
    if (!res.ok) {
      const err = await res.text()
      console.error('Radar REST error:', res.status, err)
      return NextResponse.json([])
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('Radar fatal:', err)
    return NextResponse.json([])
  }
}
