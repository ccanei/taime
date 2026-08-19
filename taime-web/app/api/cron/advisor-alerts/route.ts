import { NextResponse } from 'next/server'
import { runDetection, type AlertConfig } from '@/lib/advisor-alerts-core'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

// Cron dos alertas por evento do Advisor (Fase 3.1). Roda a MESMA logica do script de
// raiz (nucleo compartilhado @/lib/advisor-alerts-core). Agendado diariamente em
// vercel.json; o teto de 1 email por usuario a cada 7 dias controla a frequencia real.
//
// Acionavel manualmente (mesmo segredo do cron):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://www.taime.tech/api/cron/advisor-alerts
// DRY-RUN pela rota (nao grava, nao envia), para auditar:
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://www.taime.tech/api/cron/advisor-alerts?dry=1"
export async function GET(request: Request) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = new URL(request.url).searchParams.get('dry') === '1'
  const cfg: AlertConfig = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    serviceKey:  process.env.SUPABASE_SERVICE_KEY ?? '',
    openaiKey:   process.env.OPENAI_API_KEY ?? '',
    resendKey:   process.env.RESEND_API_KEY ?? '',
    siteUrl:     (process.env.SITE_URL ?? 'https://www.taime.tech').replace(/\/$/, ''),
  }
  if (!cfg.supabaseUrl || !cfg.serviceKey) {
    return NextResponse.json({ success: false, error: 'Missing env vars' }, { status: 500 })
  }

  try {
    // onLog -> console.log: os contadores e decisoes ficam visiveis no log da funcao.
    const result = await runDetection(cfg, { dryRun, onLog: s => console.log('[advisor-alerts]', s) })
    return NextResponse.json({ success: true, dryRun: result.dryRun, stats: result.stats, events: result.events }, { status: 200 })
  } catch (e) {
    console.error('[advisor-alerts] erro', e instanceof Error ? e.message : e)
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
