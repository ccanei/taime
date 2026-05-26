import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    console.error('trends/top: missing env vars')
    return NextResponse.json([])
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/report_trends?order=taime_score.desc&limit=3&select=id,report_id,rank,title_pt_br,title_en,taime_score,taime_framework_pt_br,taime_framework_en,then_now_next_pt_br,then_now_next_en`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        cache: 'no-store',
      }
    )
    if (!res.ok) {
      console.error('trends/top:', res.status, await res.text())
      return NextResponse.json([])
    }
    return NextResponse.json(await res.json())
  } catch (e) {
    console.error('trends/top exception:', e)
    return NextResponse.json([])
  }
}
