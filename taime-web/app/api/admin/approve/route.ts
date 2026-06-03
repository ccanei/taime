import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdmin } from '@/lib/isAdmin'

const FROM = 'TAIME | John <johnb@taime.tech>'

const APPROVAL_EMAIL_HTML = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
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
                Your access is ready.
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <p style="margin:0;font-size:15px;line-height:1.7;
                color:rgba(255,255,255,0.7);font-family:Georgia,serif;">
                Your TAIME account has been approved.
                You can now access strategic technology intelligence
                reports, scoring and decision frameworks.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 40px 40px;">
              <a href="https://www.taime.tech/login"
                style="display:inline-block;background-color:#2563EB;
                color:#ffffff;padding:14px 28px;border-radius:8px;
                text-decoration:none;font-weight:bold;
                font-family:Georgia,serif;font-size:15px;
                letter-spacing:1px;">
                Access TAIME &rarr;
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 40px 40px;
              border-top:1px solid rgba(255,255,255,0.1);">
              <p style="margin:0;font-size:12px;
                color:rgba(255,255,255,0.4);font-family:Georgia,serif;">
                TAIME &middot; Strategic Technology Intelligence<br/>
                contact@taime.tech &middot; taime.tech
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

async function sendApprovalEmail(to: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.error('approve: missing RESEND_API_KEY')
    return
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:     FROM,
      reply_to: 'johnb@taime.tech',
      to,
      subject:  'Your TAIME access is ready',
      html:     APPROVAL_EMAIL_HTML,
    }),
  }).catch((e) => console.error('Resend approval error:', e))
}

export async function POST(request: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !await isAdmin(user.email ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // ── Payload ───────────────────────────────────────────────────────────────
  let body: {
    id?: string; email: string; name?: string; plan?: string;
    company?: string | null; job_title?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, name } = body
  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }
  // Plano final escolhido pelo admin. Default 'free' se ausente/inválido.
  const plan = (['free', 'essential', 'strategic'].includes(body.plan ?? '')
    ? body.plan
    : 'free') as 'free' | 'essential' | 'strategic'

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY!

  // ── 1. Cria OU recupera o usuário no Supabase Auth ───────────────────────
  //    Idempotência forte: se já existe, busca o id por email (GoTrue admin).
  const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method:  'POST',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { full_name: name ?? '' },
    }),
  })

  let userId: string | null = null
  if (authRes.ok) {
    const created = await authRes.json().catch(() => null) as { id?: string } | null
    userId = created?.id ?? null
  } else {
    const authErr = await authRes.json().catch(() => ({})) as { msg?: string; message?: string }
    const msg = (authErr.msg ?? authErr.message ?? '').toString()
    if (msg.toLowerCase().includes('already')) {
      // Usuário já existe — recupera o id pelo email via GoTrue admin API
      const findRes = await fetch(
        `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
        {
          headers: {
            'apikey':        serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
        },
      )
      if (findRes.ok) {
        const data = await findRes.json().catch(() => ({})) as { users?: Array<{ id?: string }> }
        userId = data.users?.[0]?.id ?? null
      } else {
        console.error('approve: busca de user existente falhou', findRes.status, await findRes.text())
      }
    } else {
      return NextResponse.json({ error: msg || 'Erro ao criar usuário' }, { status: 500 })
    }
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Não foi possível criar nem recuperar o usuário no Auth.' },
      { status: 500 },
    )
  }

  // ── 2. Popula public.users (upsert) — preenche company/job_title com  ────
  //    o que veio no body, ou cai no fallback da waitlist (mesmo registro).
  let wlCompany: string | null = null
  let wlRole:    string | null = null
  try {
    const wlRes = await fetch(
      `${supabaseUrl}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}&select=company,role`,
      {
        headers: {
          'apikey':        serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      },
    )
    if (wlRes.ok) {
      const rows = await wlRes.json().catch(() => []) as Array<{ company: string | null; role: string | null }>
      if (rows.length > 0) {
        wlCompany = rows[0].company ?? null
        wlRole    = rows[0].role    ?? null
      }
    }
  } catch (e) {
    console.error('approve: leitura da waitlist para fallback falhou', e)
  }

  const company  = body.company   ?? wlCompany
  const jobTitle = body.job_title ?? wlRole

  // OBRIGATÓRIO: subscriptions.user_id tem FK para public.users — se este
  // upsert falhar, a subscription falha em cascata. Bloqueia e retorna 500.
  const usersRes = await fetch(
    `${supabaseUrl}/rest/v1/users?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id:                 userId,
        email,
        full_name:          name ?? '',
        company,
        job_title:          jobTitle,
        preferred_language: 'pt-BR',
      }),
    },
  )
  if (!usersRes.ok) {
    const dbErr = await usersRes.text()
    console.error('approve: upsert public.users falhou', usersRes.status, dbErr)
    return NextResponse.json(
      { error: dbErr || 'Erro ao salvar perfil do usuário' },
      { status: 500 },
    )
  }

  // ── 3. Cria/atualiza subscription (crítico — define o acesso por plano) ──
  const subRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?on_conflict=user_id`,
    {
      method: 'POST',
      headers: {
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: userId, plan, status: 'active' }),
    },
  )
  if (!subRes.ok) {
    const dbErr = await subRes.text()
    console.error('approve: upsert subscription falhou', subRes.status, dbErr)
    return NextResponse.json(
      { error: dbErr || 'Erro ao criar assinatura' },
      { status: 500 },
    )
  }

  // ── 4. Marca waitlist como aprovada (contacted=true + status='approved') ─
  const updateRes = await fetch(
    `${supabaseUrl}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}`,
    {
      method:  'PATCH',
      headers: {
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ contacted: true, status: 'approved' }),
    },
  )

  if (!updateRes.ok) {
    const dbErr = await updateRes.text()
    return NextResponse.json({ error: dbErr || 'Erro ao atualizar waitlist' }, { status: 500 })
  }

  // ── 5. Email de aprovação (best-effort) ──────────────────────────────────
  await sendApprovalEmail(email)

  // ── 6. Resposta ──────────────────────────────────────────────────────────
  return NextResponse.json({ success: true, message: 'Acesso liberado', plan })
}
