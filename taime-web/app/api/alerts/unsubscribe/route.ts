import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Opt-out de alertas do Advisor em UM CLIQUE, sem login (Fase 3.1). Rota publica:
// o token (users.alert_optout_token) e a prova de posse. Muta TODOS os alertas
// (alerts_muted=true) por ser a acao honesta de "faca parar"; o usuario refina
// depois em /conta. Espelha o padrao de newsletter/unsubscribe.

function page(title: string, message: string, extra = ''): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${title}</title></head>
<body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:480px;margin:64px auto;background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:32px 28px;text-align:center;">
  <div style="font-size:20px;font-weight:800;color:#1D4ED8;letter-spacing:-0.02em;">TAIME</div>
  <h1 style="font-size:18px;color:#18181b;margin:18px 0 8px;">${title}</h1>
  <p style="font-size:14px;line-height:1.6;color:#71717a;margin:0;">${message}</p>
  ${extra}
</div></body></html>`
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get('token') ?? '').trim()
  // Bilingue simples (o email ja e no idioma do usuario; aqui cobrimos os dois).
  const tOk    = 'Alertas desativados. Alerts turned off.'
  const mOk    = 'Você não vai mais receber alertas por email do Advisor. You will no longer receive Advisor email alerts.'
  const tErr   = 'Link inválido. Invalid link.'
  const mErr   = 'Este link de cancelamento não é válido ou expirou. This unsubscribe link is not valid or has expired.'
  const settings = `<p style="margin:18px 0 0;font-size:13px;"><a href="https://www.taime.tech/conta" style="color:#1D4ED8;">Ajustar preferências / Manage preferences</a></p>`

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return page(tErr, mErr)
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/users?alert_optout_token=eq.${encodeURIComponent(token)}`, {
      method:  'PATCH',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body:    JSON.stringify({ alerts_muted: true, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) { console.error('[alerts/unsubscribe] PATCH falhou', res.status); return page(tErr, mErr) }
    const rows = await res.json() as unknown[]
    if (!Array.isArray(rows) || rows.length === 0) return page(tErr, mErr)   // token nao encontrado
    return page(tOk, mOk, settings)
  } catch (e) {
    console.error('[alerts/unsubscribe] excecao', e instanceof Error ? e.message : e)
    return page(tErr, mErr)
  }
}
