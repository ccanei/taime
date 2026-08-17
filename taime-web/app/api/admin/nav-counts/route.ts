import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'

// GET /api/admin/nav-counts
// Contadores leves para os badges do AdminNav (reports aguardando revisao,
// waitlist pendente). Apenas leitura, protecao dupla como as demais rotas.
export async function GET() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!await isAdmin(user.email ?? '')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const svc = createSupabaseService()
  const [reports, waitlist] = await Promise.all([
    svc.from('reports').select('id', { count: 'exact', head: true }).in('status', ['pending_review', 'generating']),
    svc.from('waitlist').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  return NextResponse.json({
    reports:  reports.count ?? 0,
    waitlist: waitlist.count ?? 0,
  })
}
