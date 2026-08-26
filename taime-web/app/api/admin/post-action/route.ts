import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'

// POST /api/admin/post-action
// Acoes:
//   set-status     { id, status }                 muda status (published preenche published_at)
//   delete         { id }                         exclui o registro
//   save-published { id, published_pt, published_en, trend_title?, question? }
//                                                 grava a versao publicada (e, em posts manuais,
//                                                 titulo/pergunta), sempre com updated_at = now()
//   create-manual  {}                             cria registro manual (source='manual', draft)
// Mesma protecao dupla das demais rotas /api/admin/*.

const STATUSES = ['draft', 'approved', 'published'] as const
type Status = typeof STATUSES[number]

// Colunas devolvidas ao criar um post manual: espelham o MarketingPost do client.
const ROW_SELECT =
  'id, created_at, period, trend_id, trend_title, question, advisor_response, post_pt, post_en, status, published_at, published_pt, published_en, source'

interface Body {
  id?:           string
  action?:       string
  status?:       string
  published_pt?: string | null
  published_en?: string | null
  trend_title?:  string | null
  question?:     string | null
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!await isAdmin(user.email ?? '')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: Body
  try { body = await req.json() as Body }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { id, action, status } = body
  const service = createSupabaseService()

  // create-manual nao exige id (o registro ainda nao existe).
  if (action === 'create-manual') {
    const record = {
      source:           'manual',
      status:           'draft',
      period:           null,
      trend_id:         null,
      trend_title:      null,
      question:         null,
      advisor_response: null,
      post_pt:          null,
      post_en:          null,
      published_pt:     null,
      published_en:     null,
    }
    const { data, error } = await service
      .from('marketing_posts')
      .insert(record)
      .select(ROW_SELECT)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, row: data })
  }

  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  if (action === 'delete') {
    const { error } = await service.from('marketing_posts').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'set-status') {
    if (!status || !(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'status inválido' }, { status: 400 })
    }
    const s = status as Status
    const patch: Record<string, unknown> = {
      status: s,
      updated_at: new Date().toISOString(),
      // ao marcar published preenche published_at; ao sair de published, limpa.
      published_at: s === 'published' ? new Date().toISOString() : null,
    }
    const { error } = await service.from('marketing_posts').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'save-published') {
    // So persiste os campos enviados; sempre carimba updated_at.
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('published_pt' in body) patch.published_pt = body.published_pt ?? null
    if ('published_en' in body) patch.published_en = body.published_en ?? null
    if ('trend_title'  in body) patch.trend_title  = body.trend_title  ?? null
    if ('question'     in body) patch.question      = body.question      ?? null
    const { error } = await service.from('marketing_posts').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
}
