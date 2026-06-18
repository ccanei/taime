import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Página de retorno simples, bilíngue, sem dependência de cliente React. O
// template é dark e segue o visual dos e-mails (consistência com o que o
// usuário acabou de ler). Não vaza se o e-mail existe: token inválido cai no
// mesmo aviso genérico.

function pageHtml(args: {
  ok:       boolean
  titlePt:  string
  titleEn:  string
  bodyPt:   string
  bodyEn:   string
}): string {
  const { ok, titlePt, titleEn, bodyPt, bodyEn } = args
  const accent = ok ? '#10B981' : '#F97316'
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>TAIME Radar</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0F172A; font-family: Georgia, serif; }
    .wrap { max-width: 560px; margin: 0 auto; padding: 80px 24px 24px 24px; }
    .brand { color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: 4px; }
    .badge { color: rgba(255,255,255,0.5); font-size: 12px; letter-spacing: 2px; margin-left: 10px; }
    h1 { color: #ffffff; font-size: 24px; font-weight: bold; margin: 32px 0 16px 0; line-height: 1.35; border-left: 3px solid ${accent}; padding-left: 14px; }
    p { color: rgba(255,255,255,0.78); font-size: 15px; line-height: 1.7; margin: 0 0 16px 0; }
    .small { color: rgba(255,255,255,0.4); font-size: 12px; margin-top: 40px; }
    a { color: rgba(255,255,255,0.85); text-decoration: underline; }
    .lang { color: rgba(255,255,255,0.45); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin-top: 32px; margin-bottom: 8px; }
    .divider { height: 1px; background-color: rgba(255,255,255,0.1); margin: 32px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <span class="brand">TAIME</span><span class="badge">RADAR</span>

    <div class="lang">PT-BR</div>
    <h1>${titlePt}</h1>
    <p>${bodyPt}</p>

    <div class="divider"></div>

    <div class="lang">EN</div>
    <h1>${titleEn}</h1>
    <p>${bodyEn}</p>

    <p class="small">
      TAIME &middot; Strategic Technology Intelligence<br/>
      <a href="https://www.taime.tech">taime.tech</a>
    </p>
  </div>
</body>
</html>`
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(req: Request) {
  const url   = new URL(req.url)
  const token = (url.searchParams.get('token') ?? '').trim()

  // Página única de "link inválido". Não diferencia "token vazio" de "token
  // inexistente": isso evitaria enumeração de tokens válidos por sondagem.
  const invalid = pageHtml({
    ok:      false,
    titlePt: 'Link inválido ou expirado',
    titleEn: 'Invalid or expired link',
    bodyPt:  'Esse link de cancelamento não é válido. Se você ainda recebe a newsletter, abra um e-mail recente do Radar e clique no link de cancelar inscrição no rodapé.',
    bodyEn:  'This unsubscribe link is not valid. If you are still receiving the newsletter, open a recent Radar email and click the unsubscribe link in the footer.',
  })

  if (!token) {
    return htmlResponse(invalid, 200)
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY ?? ''
  if (!supabaseUrl || !serviceKey) {
    console.error('newsletter/unsubscribe: missing Supabase env vars')
    return htmlResponse(invalid, 200)
  }

  try {
    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_subscribers` +
        `?unsubscribe_token=eq.${encodeURIComponent(token)}`,
      {
        method:  'PATCH',
        headers: {
          apikey:         serviceKey,
          Authorization:  `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer:         'return=representation',
        },
        body: JSON.stringify({
          status:             'unsubscribed',
          status_changed_at:  new Date().toISOString(),
          status_changed_by:  'self',
        }),
      },
    )

    if (!patchRes.ok) {
      console.error('newsletter/unsubscribe patch non-ok:', patchRes.status)
      return htmlResponse(invalid, 200)
    }

    const rows = await patchRes.json() as Array<{ id: string }>
    if (rows.length === 0) {
      // Token não casou com nenhum inscrito. Mesma página neutra.
      return htmlResponse(invalid, 200)
    }

    // Sucesso (idempotente: re-clicar mantém o status já marcado).
    return htmlResponse(
      pageHtml({
        ok:      true,
        titlePt: 'Inscrição cancelada',
        titleEn: 'Subscription cancelled',
        bodyPt:  'Pronto. Você não receberá mais a newsletter do Radar. Se quiser voltar no futuro, basta inscrever novamente em taime.tech/radar.',
        bodyEn:  'Done. You will no longer receive the Radar newsletter. If you want to come back in the future, just subscribe again at taime.tech/radar.',
      }),
      200,
    )
  } catch (e) {
    console.error('newsletter/unsubscribe exception:', e)
    return htmlResponse(invalid, 200)
  }
}
