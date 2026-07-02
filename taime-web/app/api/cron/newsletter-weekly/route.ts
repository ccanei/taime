import { NextResponse } from 'next/server'
import { sendWeeklyNewsletter } from '@/lib/newsletter/send-weekly'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Newsletter SEMANAL do Radar TAIME. Agendada para segunda 12h UTC (09h BRT) em
// vercel.json. Sintetiza por tema os briefings dos ultimos 7 dias (ja gravados
// pelo cron diario), entao nao depende do briefing de segunda nem corre risco de
// corrida de horario. Tambem acionavel manualmente:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://www.taime.tech/api/cron/newsletter-weekly
export async function GET(request: Request) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sendWeeklyNewsletter()
  const status = result.ok ? 200 : 500
  return NextResponse.json({ success: result.ok, ...result }, { status })
}
