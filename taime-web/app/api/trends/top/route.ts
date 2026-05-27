import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!

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
  const data = await res.json()
  return NextResponse.json(data)
}
