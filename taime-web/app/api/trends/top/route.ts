import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Antes, este endpoint retornava as 3 trends de maior taime_score de toda a base,
// sem filtrar por status. Resultado: uma trend antiga de score 89 vivia cravada
// no topo da home e relatórios novos nunca apareciam. Pior: nada bloqueava trends
// de relatórios em 'generating' / 'pending_review' / 'draft' chegarem ao público.
//
// Agora: trends do PERÍODO PUBLICADO MAIS RECENTE, cobrindo R1 e R2 quando o
// período tem auto-split, ordenadas por taime_score desc. O shape do JSON é
// idêntico ao anterior (mesmos campos), então app/page.tsx e HomeSearch seguem
// sem alteração.
const TREND_FIELDS =
  'id,report_id,rank,title_pt_br,title_en,taime_score,' +
  'taime_framework_pt_br,taime_framework_en,' +
  'then_now_next_pt_br,then_now_next_en,' +
  'reports!inner(period)'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY!
  const headers = {
    apikey:        serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  }

  // 1) Período publicado mais recente. Sem nenhum publicado, devolve array vazio.
  const periodRes = await fetch(
    `${supabaseUrl}/rest/v1/reports?status=eq.published&order=period.desc&limit=1&select=period`,
    { headers, cache: 'no-store' },
  )
  if (!periodRes.ok) return NextResponse.json([])
  const periodRows = await periodRes.json() as Array<{ period: string }>
  const latest = periodRows[0]?.period
  if (!latest) return NextResponse.json([])

  // 2) Trends desse período, restritas a reports publicados via inner join.
  //    O !inner permite que o filtro reports.status=eq.published efetivamente
  //    descarte trends cuja parent row não bata; com left join o filtro do
  //    lado FK é ignorado silenciosamente.
  //    limit=8 cobre 1 ou 2 relatórios por período (auto-split = 4+4 trends).
  const trendsRes = await fetch(
    `${supabaseUrl}/rest/v1/report_trends` +
      `?reports.status=eq.published` +
      `&reports.period=eq.${encodeURIComponent(latest)}` +
      `&order=taime_score.desc` +
      `&limit=8` +
      `&select=${TREND_FIELDS}`,
    { headers, cache: 'no-store' },
  )
  if (!trendsRes.ok) return NextResponse.json([])
  const data = await trendsRes.json()
  return NextResponse.json(data)
}
