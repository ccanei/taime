import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'claudineicanei1@gmail.com'
const FROM        = 'TAIME <noreply@taime.tech>'
const SITE_URL    = 'https://taime-xi.vercel.app'

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
<body style="font-family: Georgia, serif; background: #0F172A; color: white; padding: 48px; max-width: 600px; margin: 0 auto;">
  <div style="margin-bottom: 32px;">
    <img src="${SITE_URL}/taime-icon.svg" width="40" height="40" alt="TAIME" />
    <span style="font-size: 20px; font-weight: bold; margin-left: 12px; letter-spacing: 4px;">TAIME</span>
  </div>
  <h1 style="font-size: 24px; margin-bottom: 16px;">
    You're on the list, ${safeName}.
  </h1>
  <p style="color: rgba(255,255,255,0.7); line-height: 1.7;">
    Thank you for your interest in TAIME — strategic technology intelligence for leaders, managers, consultants and entrepreneurs.
  </p>
  <p style="color: rgba(255,255,255,0.7); line-height: 1.7;">
    We're in early access. You'll receive an invitation as soon as your access is approved. We'll be in touch shortly.
  </p>
  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); font-size: 12px;">
    TAIME · Strategic Technology Intelligence<br/>
    contact@taime.tech · taime.tech
  </div>
</body>
</html>`
}

function adminEmailHtml(p: {
  name: string
  email: string
  company: string | null
  role: string | null
  interest: string
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f6f6; padding: 32px; max-width: 600px; margin: 0 auto; color: #18181b;">
  <h2 style="margin: 0 0 16px; font-size: 18px;">New TAIME waitlist signup</h2>
  <table cellspacing="0" cellpadding="8" style="width: 100%; background: white; border-collapse: collapse; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 14px;">
    <tr><td style="border-bottom: 1px solid #f4f4f5; color: #71717a; width: 100px;">Name</td><td style="border-bottom: 1px solid #f4f4f5;"><strong>${escapeHtml(p.name)}</strong></td></tr>
    <tr><td style="border-bottom: 1px solid #f4f4f5; color: #71717a;">Email</td><td style="border-bottom: 1px solid #f4f4f5;">${escapeHtml(p.email)}</td></tr>
    <tr><td style="border-bottom: 1px solid #f4f4f5; color: #71717a;">Company</td><td style="border-bottom: 1px solid #f4f4f5;">${escapeHtml(p.company) || '<em style="color:#a1a1aa;">—</em>'}</td></tr>
    <tr><td style="border-bottom: 1px solid #f4f4f5; color: #71717a;">Role</td><td style="border-bottom: 1px solid #f4f4f5;">${escapeHtml(p.role) || '<em style="color:#a1a1aa;">—</em>'}</td></tr>
    <tr><td style="color: #71717a;">Interest</td><td>${escapeHtml(p.interest)}</td></tr>
  </table>
  <p style="margin-top: 24px;">
    <a href="${SITE_URL}/admin/waitlist" style="background: #2563EB; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px;">Open admin panel →</a>
  </p>
</body>
</html>`
}

async function sendEmail(payload: { to: string; subject: string; html: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error('waitlist email: missing RESEND_API_KEY')
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM,
        to:      payload.to,
        subject: payload.subject,
        html:    payload.html,
      }),
    })
    if (!res.ok) {
      console.error('resend send failed:', res.status, await res.text())
    }
  } catch (e) {
    console.error('resend send exception:', e)
  }
}

export async function POST(req: Request) {
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

    // Disparo de emails em paralelo, falhas silenciadas — não bloqueiam o cadastro.
    Promise.all([
      sendEmail({
        to:      email,
        subject: "You're on the TAIME waitlist",
        html:    userEmailHtml(name),
      }),
      sendEmail({
        to:      ADMIN_EMAIL,
        subject: 'New TAIME waitlist signup',
        html:    adminEmailHtml({ name, email, company, role, interest }),
      }),
    ]).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('waitlist exception:', e)
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 })
  }
}
