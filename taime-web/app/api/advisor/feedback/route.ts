import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Feedback in-chat do Executive Advisor (logado E anonimo /ask). Grava na MESMA
// tabela public.feedback usada pelo dashboard, com type='advisor'. Nunca expoe a
// service key: o insert roda server-side. Feedback e opcional e nao bloqueia nada.

const MAX_QA      = 8000   // pergunta/resposta avaliadas
const MAX_COMMENT = 2000   // comentario opcional do usuario

export async function POST(req: Request) {
  let body: {
    id?: string; rating?: string; question?: string; answer?: string
    comment?: string; source?: string; locale?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Follow-up: adiciona o comentario opcional a um voto ja gravado ──────────
  // Mantem UMA linha por avaliacao (o voto foi gravado no clique; o comentario
  // chega depois). So preenche message quando ainda esta vazio (nao sobrescreve).
  if (typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id)) {
    const comment = (body.comment ?? '').trim().slice(0, MAX_COMMENT)
    if (!comment) return NextResponse.json({ success: true })
    try {
      const service = createSupabaseService()
      await service
        .from('feedback')
        .update({ message: comment })
        .eq('id', body.id)
        .eq('type', 'advisor')
        .or('message.is.null,message.eq.')
      return NextResponse.json({ success: true })
    } catch (e) {
      console.error('advisor feedback comment update:', e)
      return NextResponse.json({ error: 'Erro ao gravar comentario' }, { status: 500 })
    }
  }

  const rating = body.rating === 'up' || body.rating === 'down' ? body.rating : null
  if (!rating) {
    return NextResponse.json({ error: 'rating must be up or down' }, { status: 400 })
  }
  // 'ask' = Advisor anonimo; 'advisor' = chat logado. Default conservador: 'advisor'.
  const source = body.source === 'ask' ? 'ask' : 'advisor'

  const question = (body.question ?? '').slice(0, MAX_QA)
  const answer   = (body.answer ?? '').slice(0, MAX_QA)
  const comment  = (body.comment ?? '').trim().slice(0, MAX_COMMENT)
  const locale   = body.locale === 'en' ? 'en' : 'pt-BR'

  // ── Usuario logado (best-effort). Anonimo (/ask) fica com user_id NULL. ──────
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
    /* sem sessao: segue anonimo */
  }

  // Coerencia minima: 'advisor' pressupoe sessao logada. Se veio 'advisor' sem
  // usuario, rebaixa para 'ask' (nao confia no client para afirmar que e logado).
  const finalSource = source === 'advisor' && !userId ? 'ask' : source

  try {
    const service = createSupabaseService()
    const { data, error } = await service.from('feedback').insert({
      user_id:    userId,
      user_email: userEmail,
      type:       'advisor',
      rating,
      question:   question || null,
      answer:     answer || null,
      source:     finalSource,
      message:    comment,     // message e NOT NULL; comentario vazio vira ''
      locale,
      status:     'new',
    }).select('id').single()
    if (error) {
      console.error('advisor feedback insert:', error)
      return NextResponse.json({ error: 'Erro ao gravar feedback' }, { status: 500 })
    }
    return NextResponse.json({ success: true, id: data?.id ?? null })
  } catch (e) {
    console.error('advisor feedback exception:', e)
    return NextResponse.json({ error: 'Erro ao gravar feedback' }, { status: 500 })
  }
}
