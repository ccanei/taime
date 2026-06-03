import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const VALID_TYPES = ['suggestion', 'problem', 'praise'] as const
type FeedbackType = typeof VALID_TYPES[number]

export async function POST(req: Request) {
  let body: { type?: string; message?: string; website?: string; locale?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Honeypot: campo "website" só é preenchido por bots ───────────────────
  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json({ success: true })
  }

  const message = (body.message ?? '').trim()
  if (!message) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  const type: FeedbackType = VALID_TYPES.includes(body.type as FeedbackType)
    ? (body.type as FeedbackType)
    : 'suggestion'

  const locale = body.locale === 'en' ? 'en' : 'pt-BR'

  // ── Identifica usuário logado (best-effort) ──────────────────────────────
  let userId:    string | null = null
  let userEmail: string | null = null
  try {
    const authed = await createSupabaseServer()
    const { data: { user } } = await authed.auth.getUser()
    if (user) {
      userId    = user.id
      userEmail = user.email ?? null
    }
  } catch {
    /* sem sessão — segue sem user */
  }

  try {
    const service = createSupabaseService()
    const { error } = await service.from('feedback').insert({
      user_id:    userId,
      user_email: userEmail,
      type,
      message,
      locale,
      status:     'new',
    })

    if (error) {
      console.error('feedback insert:', error)
      return NextResponse.json({ error: 'Erro ao gravar feedback' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('feedback exception:', e)
    return NextResponse.json({ error: 'Erro ao gravar feedback' }, { status: 500 })
  }
}
