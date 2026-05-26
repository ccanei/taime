import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    console.error('reports/latest: missing env vars')
    return NextResponse.json([])
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/reports?status=eq.published&order=period.desc&limit=3&select=id,period,period_label,period_type,title_pt_br,title_en,executive_summary_pt_br,executive_summary_en,published_at`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        cache: 'no-store',
      }
    )
    if (!res.ok) {
      console.error('reports/latest:', res.status, await res.text())
      return NextResponse.json([])
    }
    return NextResponse.json(await res.json())
  } catch (e) {
    console.error('reports/latest exception:', e)
    return NextResponse.json([])
  }
}
