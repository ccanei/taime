import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { getUserPlan, hasAdvisorAccess } from '@/lib/plan'

// Regra de 90 dias: aplicada em tempo de leitura, sem preencher archived_at.
// archived_at preenchido = arquivamento explícito (uso futuro).
const ARCHIVE_DAYS = 90

interface AdvisorSessionRow {
  session_id:       string
  title:            string | null
  last_activity_at: string
  message_count:    number
  archived_at:      string | null
  created_at:       string
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const plan = await getUserPlan(user.id)
  if (!hasAdvisorAccess(plan)) {
    return NextResponse.json({ error: 'Advisor available on Strategic plan only' }, { status: 403 })
  }

  const archived = req.nextUrl.searchParams.get('archived') === '1'
  const cutoff   = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const service  = createSupabaseService()
  let query = service
    .from('advisor_sessions')
    .select('session_id, title, last_activity_at, message_count, archived_at, created_at')
    .eq('user_id', user.id)

  if (archived) {
    // arquivadas: explícitas OU 90+ dias sem atividade
    query = query.or(`archived_at.not.is.null,last_activity_at.lt.${cutoff}`)
    query = query.order('last_activity_at', { ascending: false })
  } else {
    // ativas: archived_at NULL E last_activity_at >= cutoff
    query = query.is('archived_at', null).gte('last_activity_at', cutoff)
    query = query.order('last_activity_at', { ascending: false })
  }

  const { data, error } = await query.limit(100)
  if (error) {
    // Tabela ainda pode não existir (migração não rodada). Retornamos vazio
    // em vez de 500 para não quebrar a UI; o chat segue funcionando.
    if (error.message?.includes('relation') || error.code === '42P01') {
      return NextResponse.json({ sessions: [], migration_pending: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sessions: (data ?? []) as AdvisorSessionRow[] })
}
