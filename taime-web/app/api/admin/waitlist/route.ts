import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL ?? 'claudineicanei1@gmail.com'
const FROM        = 'TAIME <noreply@taime.tech>'
const ADMIN_URL   = 'https://taime-xi.vercel.app/admin/waitlist'

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function userEmailHtml(name: string): string {
  const firstNameRaw = (name || '').trim().split(/\s+/)[0] || 'there'
  const firstName    = escapeHtml(firstNameRaw)
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#0F172A;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%"
    style="background-color:#0F172A;">
    <tr>
      <td align="center" style="padding:40px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="600"
          style="background-color:#0F172A;max-width:600px;">
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <span style="font-size:22px;font-weight:bold;
                color:#ffffff;letter-spacing:4px;
                font-family:Georgia,serif;">TAIME</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 16px 40px;">
              <h1 style="margin:0;font-size:24px;color:#ffffff;
                font-family:Georgia,serif;font-weight:bold;">
                You are on the list, ${firstName}.
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 16px 40px;">
              <p style="margin:0;font-size:15px;line-height:1.7;
                color:rgba(255,255,255,0.7);font-family:Georgia,serif;">
                Thank you for your interest in TAIME — strategic
                technology intelligence for leaders, managers,
                consultants and entrepreneurs.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 40px 40px;">
              <p style="margin:0;font-size:15px;line-height:1.7;
                color:rgba(255,255,255,0.7);font-family:Georgia,serif;">
                We are in early access. You will receive an invitation
                as soon as your access is approved.
                We will be in touch shortly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 40px 40px;
              border-top:1px solid rgba(255,255,255,0.1);">
              <p style="margin:0;font-size:12px;
                color:rgba(255,255,255,0.4);font-family:Georgia,serif;">
                TAIME · Strategic Technology Intelligence<br/>
                contact@taime.tech · taime.tech
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function adminEmailHtml(p: {
  name:           string
  email:          string
  company:        string | null
  role:           string | null
  interest:       string
  requested_plan: string
}): string {
  const dataStr = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const empty = '<em style="color:#a1a1aa;">não informado</em>'
  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f6f6;padding:32px;max-width:600px;margin:0 auto;color:#18181b;">
  <h2 style="margin:0 0 16px;font-size:18px;">New TAIME waitlist signup</h2>
  <table cellspacing="0" cellpadding="10" style="width:100%;background:white;border-collapse:collapse;border:1px solid #e4e4e7;border-radius:8px;font-size:14px;">
    <tr><td style="border-bottom:1px solid #f4f4f5;color:#71717a;width:110px;">Nome</td><td style="border-bottom:1px solid #f4f4f5;"><strong>${escapeHtml(p.name)}</strong></td></tr>
    <tr><td style="border-bottom:1px solid #f4f4f5;color:#71717a;">Email</td><td style="border-bottom:1px solid #f4f4f5;">${escapeHtml(p.email)}</td></tr>
    <tr><td style="border-bottom:1px solid #f4f4f5;color:#71717a;">Empresa</td><td style="border-bottom:1px solid #f4f4f5;">${escapeHtml(p.company) || empty}</td></tr>
    <tr><td style="border-bottom:1px solid #f4f4f5;color:#71717a;">Cargo</td><td style="border-bottom:1px solid #f4f4f5;">${escapeHtml(p.role) || empty}</td></tr>
    <tr><td style="border-bottom:1px solid #f4f4f5;color:#71717a;">Interesse</td><td style="border-bottom:1px solid #f4f4f5;">${escapeHtml(p.interest)}</td></tr>
    <tr><td style="border-bottom:1px solid #f4f4f5;color:#71717a;">Plano solicitado</td><td style="border-bottom:1px solid #f4f4f5;"><strong>${escapeHtml(p.requested_plan)}</strong></td></tr>
    <tr><td style="color:#71717a;">Data</td><td>${escapeHtml(dataStr)}</td></tr>
  </table>
  <p style="margin-top:24px;">
    <a href="${ADMIN_URL}" style="background:#2563EB;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Ver waitlist completa →</a>
  </p>
</body>
</html>`
}

const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
  if (!process.env.RESEND_API_KEY) {
    console.error('admin/waitlist: missing RESEND_API_KEY')
    return
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to,
      subject,
      html,
    }),
  }).catch((e) => console.error('Resend error:', e))
}

export async function POST(req: Request) {
  const body = await req.json() as {
    name?: string; email?: string; company?: string | null;
    role?: string | null; interest?: string; requested_plan?: string;
    website?: string
  }

  // ── Honeypot: campo "website" só é preenchido por bots (oculto para humanos).
  //    Retorna sucesso falso para não despertar tentativa de retry; NÃO grava.
  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json({ success: true })
  }

  const { name = '', email = '', company = null, role = null, interest = '' } = body
  // Normaliza plano (apenas 'free' | 'essential' | 'strategic'; fallback 'free')
  const requested_plan = ['free', 'essential', 'strategic'].includes(body.requested_plan ?? '')
    ? body.requested_plan as string
    : 'free'

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    console.error('admin/waitlist: missing Supabase env vars')
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/waitlist`,
      {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ name, email, company, role, interest, requested_plan }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('admin/waitlist insert:', res.status, err)
      if (res.status === 409) {
        return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
    }

    // Envio paralelo. Falhas individuais silenciadas dentro de sendEmail
    // via .catch — Promise.all nunca rejeita, não bloqueia o cadastro.
    await Promise.all([
      sendEmail(email, 'You are on the TAIME waitlist', userEmailHtml(name)),
      sendEmail(ADMIN_EMAIL, 'New TAIME waitlist signup', adminEmailHtml({ name, email, company, role, interest, requested_plan })),
    ])

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('admin/waitlist exception:', e)
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }
}
