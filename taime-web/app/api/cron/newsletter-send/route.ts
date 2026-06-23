import { NextResponse } from 'next/server'
import { sendDailyNewsletter } from '@/lib/newsletter/send-daily'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Gatilho manual da newsletter diária do Radar. Acionável via:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://www.taime.tech/api/cron/newsletter-send
//
// Não está mais agendado como cron (ver vercel.json). O envio agendado
// passou a ocorrer encadeado ao /api/cron/radar-briefing, dentro do mesmo
// disparo, porque o plano Hobby da Vercel garante apenas precisão per-hour
// (±59 min) e não permite ordenar dois crons na mesma janela. Esta rota
// continua existindo para teste e reenvio manual.

export async function GET(request: Request) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await sendDailyNewsletter()
  const status = result.ok ? 200 : 500
  // Espelha o shape antigo (success boolean) pra não quebrar callers do curl.
  return NextResponse.json({ success: result.ok, ...result }, { status })
}
