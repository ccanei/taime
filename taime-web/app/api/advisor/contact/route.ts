import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan } from '@/lib/plan'

export const dynamic = 'force-dynamic'

// Pedido de contato humano feito de dentro do Advisor LOGADO. Grava em
// contact_requests com o conversation_id (session_id do Advisor) e notifica o admin
// por email (Resend, mesmo destino do formulario de contato existente). NUNCA
// inclui a transcricao no email. Fail-silent no email: o pedido fica gravado.

const SUBJECTS = ['Comercial', 'Suporte', 'Feedback', 'Outro'] as const
const MAX_MSG = 4000
const UUID_RE = /^[0-9a-f-]{36}$/i

export async function POST(req: Request) {
  let body: { subject?: string; message?: string; conversationId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Sessao (nunca confiar no client para identidade) ───────────────────────
  const authed = await createSupabaseServer()
  const { data: { user } } = await authed.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const subject = SUBJECTS.includes(body.subject as typeof SUBJECTS[number]) ? body.subject! : 'Outro'
  const message = (body.message ?? '').trim().slice(0, MAX_MSG)
  if (!message) {
    return NextResponse.json({ error: 'message_required' }, { status: 400 })
  }
  const conversationId = typeof body.conversationId === 'string' && UUID_RE.test(body.conversationId)
    ? body.conversationId
    : null

  const service = createSupabaseService()

  // Dados do usuario (para o email e o admin): nome, email, plano.
  const email = user.email ?? null
  let plan: string | null = null
  let fullName: string | null = null
  try {
    plan = await getUserPlan(user.id)
    const { data: userRow } = await service.from('users').select('full_name').eq('id', user.id).maybeSingle()
    fullName = (userRow as { full_name: string | null } | null)?.full_name ?? null
  } catch { /* segue com o que tem */ }

  // ── 1. Grava o pedido (garantido) ──────────────────────────────────────────
  try {
    const { error } = await service.from('contact_requests').insert({
      user_id:         user.id,
      conversation_id: conversationId,
      subject,
      message,
      status:          'new',
    })
    if (error) {
      console.error('[advisor-contact] insert:', error)
      return NextResponse.json({ error: 'Erro ao registrar o pedido' }, { status: 500 })
    }
  } catch (e) {
    console.error('[advisor-contact] insert exception:', e)
    return NextResponse.json({ error: 'Erro ao registrar o pedido' }, { status: 500 })
  }

  // ── 2. Notifica o admin por email (fail-silent; sem transcricao) ───────────
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:     'TAIME | John <johnb@taime.tech>',
          reply_to: email ?? 'johnb@taime.tech',
          to:       ['claudineicanei1@gmail.com'],
          subject:  `Pedido de contato (Advisor): ${subject}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="color:#1a1a2e;margin-bottom:4px">Novo pedido de contato pelo Advisor</h2>
              <p style="color:#888;font-size:13px;margin-top:0">TAIME · contact@taime.tech</p>
              <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
              <p><strong>Nome:</strong> ${esc(fullName ?? '(sem nome)')}</p>
              <p><strong>Email:</strong> <a href="mailto:${esc(email ?? '')}">${esc(email ?? '')}</a></p>
              <p><strong>Plano:</strong> ${esc(plan ?? 'free')}</p>
              <p><strong>Assunto:</strong> ${esc(subject)}</p>
              <p><strong>Mensagem:</strong></p>
              <blockquote style="border-left:3px solid #6366f1;margin:0;padding:12px 16px;
                                 background:#f8f8ff;border-radius:4px;color:#333">
                ${esc(message).replace(/\n/g, '<br/>')}
              </blockquote>
              <p style="margin-top:24px;color:#aaa;font-size:12px">
                A conversa associada esta no /admin/engagement (nao incluida aqui).
              </p>
            </div>
          `,
        }),
      })
    } catch (e) {
      console.error('[advisor-contact] email failed (ignored):', e)
    }
  }

  return NextResponse.json({ success: true })
}
