import { NextResponse } from 'next/server'
import { revalidateReportSurfaces } from '@/lib/revalidate-reports'

/*
 * POST /api/admin/revalidate-reports
 *
 * Gatilho de revalidacao das superficies publicas de report para processos que
 * rodam FORA do runtime do Next (ex: switch-2026-reanalysis.ts, jobs de dados).
 * revalidateReportSurfaces() so roda dentro do Next, entao esta rota expoe o
 * gatilho de forma protegida por segredo (bearer). Sem o segredo configurado no
 * ambiente, responde 503 (desabilitada). Bearer errado -> 401.
 *
 * Uso:
 *   curl -X POST "$SITE/api/admin/revalidate-reports" \
 *     -H "authorization: Bearer $REVALIDATE_SECRET" \
 *     -H "content-type: application/json" -d '{"reportId":"<uuid opcional>"}'
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'REVALIDATE_SECRET nao configurado; rota desabilitada' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let reportId: string | undefined
  try {
    const body = await req.json() as { reportId?: unknown }
    if (typeof body?.reportId === 'string' && body.reportId.trim()) reportId = body.reportId.trim()
  } catch { /* corpo vazio ou invalido: revalida todas as superficies */ }

  revalidateReportSurfaces(reportId)
  return NextResponse.json({ ok: true, revalidated: reportId ?? 'all-report-surfaces' })
}
