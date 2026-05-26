import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!

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
  const data = await res.json()
  return NextResponse.json(data)
}
