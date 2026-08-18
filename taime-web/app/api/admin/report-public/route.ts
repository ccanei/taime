import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { revalidateReportSurfaces } from '@/lib/revalidate-reports'

// POST /api/admin/report-public
// Body: { id: string, isPublic: boolean }
// Marca/desmarca um report como AMOSTRA PÚBLICA (reports.is_public), que governa a
// rota /r/[id] e o showcase da home. Exclusividade: marcar um desmarca o anterior.
// Só um report PUBLISHED pode virar amostra. Mesma proteção dupla das demais rotas.
export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!await isAdmin(user.email ?? '')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: { id?: string; isPublic?: boolean }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { id, isPublic } = body
  if (!id || typeof isPublic !== 'boolean') {
    return NextResponse.json({ error: 'id e isPublic (boolean) são obrigatórios' }, { status: 400 })
  }

  const service = createSupabaseService()

  if (isPublic) {
    const { data: rep } = await service.from('reports').select('status').eq('id', id).maybeSingle()
    if (!rep) return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 })
    if (rep.status !== 'published') {
      return NextResponse.json({ error: 'Só um relatório publicado pode ser amostra pública' }, { status: 400 })
    }
    // Exclusividade: desmarca qualquer outra amostra antes de marcar esta.
    const { error: clearErr } = await service
      .from('reports').update({ is_public: false }).eq('is_public', true).neq('id', id)
    if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 })
  }

  const { error } = await service.from('reports').update({ is_public: isPublic }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateReportSurfaces(id)
  return NextResponse.json({ success: true, isPublic })
}
