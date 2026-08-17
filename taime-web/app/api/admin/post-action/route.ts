import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'

// POST /api/admin/post-action
// Body: { id, action: 'set-status' | 'delete', status?: 'draft'|'approved'|'published' }
// Muda o status de um marketing_post (ao marcar 'published' preenche published_at)
// ou exclui. Mesma protecao dupla das demais rotas /api/admin/*.

const STATUSES = ['draft', 'approved', 'published'] as const
type Status = typeof STATUSES[number]

export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!await isAdmin(user.email ?? '')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: { id?: string; action?: string; status?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { id, action, status } = body
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  const service = createSupabaseService()

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

  return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
}
