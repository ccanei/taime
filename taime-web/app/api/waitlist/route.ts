import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'claudineicanei1@gmail.com'
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
  const firstName = (name || '').trim().split(/\s+/)[0] || 'there'
  const safeName  = escapeHtml(firstName)
  return `<!DOCTYPE html>
<html>
<body style="font-family:Georgia,serif;background:#0F172A;color:white;padding:48px;max-width:600px;margin:0 auto;">
  <div style="margin-bottom:32px;">
    <span style="font-size:22px;font-weight:bold;letter-spacing:4px;">TAIME</span>
  </div>
  <h1 style="font-size:24px;margin-bottom:16px;">
    You are on the list, ${safeName}.
  </h1>
  <p style="color:rgba(255,255,255,0.7);line-height:1.7;">
    Thank you for your interest in TAIME — strategic technology intelligence for leaders, managers, consultants and entrepreneurs.
  </p>
  <p style="color:rgba(255,255,255,0.7);line-height:1.7;">
    We are in early access. You will receive an invitation as soon as your access is approved. We will be in touch shortly.
  </p>
  <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.4);font-size:12px;">
    TAIME · Strategic Technology Intelligence<br/>
    contact@taime.tech · taime.tech
  </div>
</body>
</html>`
}

function adminEmailHtml(p: {
  name:     string
  email:    string
  company:  string | null
  role:     string | null
  interest: string
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
    <tr><td style="color:#71717a;">Data</td><td>${escapeHtml(dataStr)}</td></tr>
  </table>
  <p style="margin-top:24px;">
    <a href="${ADMIN_URL}" style="background:#2563EB;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">Ver waitlist completa →</a>
  </p>
</body>
</html>`
}

const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
  if (!process.env.RESEND_API_KEY) return
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
  console.log('waitlist called')
  console.log('RESEND_API_KEY set:', !!process.env.RESEND_API_KEY)

  const { name, email, company, role, interest } = await req.json()

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    console.error('waitlist: missing env vars')
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
        body: JSON.stringify({ name, email, company, role, interest }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('waitlist insert:', res.status, err)
      if (res.status === 409) {
        return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
    }

    console.log('inserted:', email)

    // Envio paralelo. Falhas individuais são silenciadas dentro de sendEmail
    // via .catch, então este Promise.all nunca rejeita — não bloqueia cadastro.
    console.log('sending emails...')
    await Promise.all([
      sendEmail(email, "You're on the TAIME waitlist", userEmailHtml(name)),
      sendEmail(ADMIN_EMAIL, 'New TAIME waitlist signup', adminEmailHtml({ name, email, company, role, interest })),
    ])
    console.log('emails sent')

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('waitlist exception:', e)
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }
}
