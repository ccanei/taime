import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  let body: { name: string; email: string; message: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, email, message } = body
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Preencha todos os campos.' }, { status: 400 })
  }

  const n = name.trim()
  const e = email.trim().toLowerCase()
  const m = message.trim()

  // ── 1. Envia email via Resend (garantido — não depende de tabela) ──────────
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'Serviço de email não configurado.' }, { status: 500 })
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    'TAIME Contato <onboarding@resend.dev>',
      to:      ['claudineicanei1@gmail.com'],
      subject: `Nova mensagem de contato — TAIME`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1a1a2e;margin-bottom:4px">Nova mensagem via formulário</h2>
          <p style="color:#888;font-size:13px;margin-top:0">TAIME · contact@taime.tech</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
          <p><strong>Nome:</strong> ${n}</p>
          <p><strong>Email:</strong> <a href="mailto:${e}">${e}</a></p>
          <p><strong>Mensagem:</strong></p>
          <blockquote style="border-left:3px solid #6366f1;margin:0;padding:12px 16px;
                             background:#f8f8ff;border-radius:4px;color:#333">
            ${m.replace(/\n/g, '<br/>')}
          </blockquote>
          <p style="margin-top:24px;color:#aaa;font-size:12px">
            Enviado em ${new Date().toLocaleString('pt-BR')}
          </p>
        </div>
      `,
    }),
  })

  if (!emailRes.ok) {
    const errJson = await emailRes.json().catch(() => ({}))
    console.error('Resend error:', errJson)
    return NextResponse.json(
      { error: 'Falha ao enviar mensagem. Tente novamente ou escreva para contact@taime.tech.' },
      { status: 500 },
    )
  }

  // ── 2. Tenta salvar no Supabase (best-effort — não falha se tabela ausente) ─
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY
  if (supabaseUrl && serviceKey) {
    await fetch(`${supabaseUrl}/rest/v1/contacts`, {
      method:  'POST',
      headers: {
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ name: n, email: e, message: m }),
    }).catch(() => { /* tabela pode não existir — ok */ })
  }

  return NextResponse.json({ ok: true })
}
