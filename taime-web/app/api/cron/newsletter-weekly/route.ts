import { NextResponse } from 'next/server'
import { sendWeeklyNewsletter, sendWeeklyPreview } from '@/lib/newsletter/send-weekly'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Newsletter SEMANAL do Radar TAIME. Agendada para segunda 12h UTC (09h BRT) em
// vercel.json. Sintetiza por tema os briefings da semana coberta (segunda a domingo
// anterior), ja gravados pelo cron diario. Tambem acionavel manualmente:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://www.taime.tech/api/cron/newsletter-weekly
//
// PREVIEW (nao toca na lista de ativos, no historico, nem na idempotencia): envia
// so para um endereco para conferir o layout antes do deploy:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://www.taime.tech/api/cron/newsletter-weekly?preview=voce@dominio.com&lang=pt"
export async function GET(request: Request) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url     = new URL(request.url)
  const preview = url.searchParams.get('preview')
  if (preview) {
    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'pt'
    const result = await sendWeeklyPreview(preview, lang)
    return NextResponse.json({ success: result.ok, preview: true, ...result }, { status: result.ok ? 200 : 500 })
  }

  const result = await sendWeeklyNewsletter()
  const status = result.ok ? 200 : 500
  return NextResponse.json({ success: result.ok, ...result }, { status })
}
