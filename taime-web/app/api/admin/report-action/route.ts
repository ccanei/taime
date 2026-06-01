import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'

/**
 * POST /api/admin/report-action
 * Body: { id: string, action: 'publish' | 'reject' | 'archive' | 'unpublish' | 'reopen' | 'restore' }
 *
 * Transições permitidas (validadas no servidor):
 *   publish   : pending_review | rejected | archived → published
 *   reject    : pending_review | published          → rejected
 *   archive   : qualquer                             → archived   (soft delete, recuperável)
 *   unpublish : published                            → pending_review
 *   reopen    : rejected                             → pending_review
 *   restore   : archived                             → pending_review
 *
 * Nunca apaga de verdade. "archive" é o soft delete.
 */

type Action = 'publish' | 'reject' | 'archive' | 'unpublish' | 'reopen' | 'restore'

const TARGET: Record<Action, string> = {
  publish:   'published',
  reject:    'rejected',
  archive:   'archived',
  unpublish: 'pending_review',
  reopen:    'pending_review',
  restore:   'pending_review',
}

export async function POST(req: Request) {
  // ── Auth: mesma proteção dupla do /admin/waitlist ──────────────────────────
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!await isAdmin(user.email ?? '')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: { id?: string; action?: Action }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { id, action } = body
  if (!id || !action || !(action in TARGET)) {
    return NextResponse.json({ error: 'id e action válidos são obrigatórios' }, { status: 400 })
  }

  const service = createSupabaseService()

  // Lê o status atual para validar a transição
  const { data: current, error: readErr } = await service
    .from('reports')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (readErr || !current) {
    return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 })
  }

  const newStatus = TARGET[action]

  // Monta o patch. published recebe/limpa published_at conforme o caso.
  const patch: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() }
  if (newStatus === 'published') {
    patch.published_at = new Date().toISOString()
  } else if (current.status === 'published') {
    // saindo do ar (unpublish/reject/archive de um publicado) → zera published_at
    patch.published_at = null
  }

  const { error: updErr } = await service
    .from('reports')
    .update(patch)
    .eq('id', id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, status: newStatus })
}
