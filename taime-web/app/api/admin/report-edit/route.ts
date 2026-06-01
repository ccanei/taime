import { NextResponse } from 'next/server'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { parseField, twin, buildPatch, type ParsedField } from '@/lib/reportFieldPath'

/**
 * POST /api/admin/report-edit
 * Body: {
 *   reportId: string,
 *   trendId: string | null,      // null para campos de nível de relatório (title/executive_summary)
 *   field: string,               // field path do flag, ex "taime_framework_en.executive_snapshot"
 *   valuePt: string,             // novo texto PT
 *   valueEn: string,             // novo texto EN
 * }
 *
 * Grava os dois idiomas, remove em dash (determinístico), remove os flags do campo
 * editado de validation_flags, e marca o relatório para revalidação no terminal
 * (validation_verdict = 'stale'). NÃO chama o LLM — revalidação completa roda via
 * `npx ts-node validate-report.ts`. Custo desta operação: zero tokens.
 */

// Remove em dash (U+2014) sem tocar em hífens. Espelha o stripEmDash do pipeline.
function stripEmDash(s: string): string {
  if (typeof s !== 'string' || !s.includes('\u2014')) return s
  return s
    .replace(/(\d)\s*\u2014\s*(\d)/g, '$1-$2')
    .replace(/\s*\u2014\s*/g, ', ')
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!await isAdmin(user.email ?? '')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: { reportId?: string; trendId?: string | null; field?: string; valuePt?: string; valueEn?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { reportId, trendId, field } = body
  const valuePt = stripEmDash(body.valuePt ?? '')
  const valueEn = stripEmDash(body.valueEn ?? '')

  if (!reportId || !field) {
    return NextResponse.json({ error: 'reportId e field são obrigatórios' }, { status: 400 })
  }

  const parsed = parseField(field)
  if (!parsed) {
    return NextResponse.json({ error: `Field path não reconhecido: ${field}` }, { status: 400 })
  }
  // ptField / enField: o campo no idioma PT e no EN (sempre gravamos os dois)
  const ptField: ParsedField = parsed.lang === 'pt-BR' ? parsed : twin(parsed)
  const enField: ParsedField = parsed.lang === 'en' ? parsed : twin(parsed)

  const service = createSupabaseService()

  // ── Campos de nível de relatório (title / executive_summary) ────────────────
  const isReportLevel = parsed.base === 'title' || parsed.base === 'executive_summary'

  if (isReportLevel) {
    const patch: Record<string, unknown> = {}
    patch[ptField.column] = valuePt
    patch[enField.column] = valueEn
    const { error } = await service.from('reports').update(patch).eq('id', reportId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // ── Campos de trend (coluna direta ou JSONB) ──────────────────────────────
    if (!trendId) {
      return NextResponse.json({ error: 'trendId é obrigatório para campos de trend' }, { status: 400 })
    }
    // Lê a trend atual para preservar as outras chaves do JSONB
    const { data: trend, error: readErr } = await service
      .from('report_trends').select('*').eq('id', trendId).maybeSingle()
    if (readErr || !trend) {
      return NextResponse.json({ error: 'Trend não encontrada' }, { status: 404 })
    }
    const patch = {
      ...buildPatch(trend as Record<string, unknown>, ptField, valuePt),
      ...buildPatch(trend as Record<string, unknown>, enField, valueEn),
    }
    const { error } = await service.from('report_trends').update(patch).eq('id', trendId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Remove os flags do campo editado e marca para revalidação ───────────────
  const { data: report } = await service
    .from('reports').select('validation_flags, status').eq('id', reportId).maybeSingle()

  const flags = (report?.validation_flags ?? []) as Array<{ field?: string }>
  // remove qualquer flag cujo field aponte para o mesmo campo (em qualquer idioma)
  const remaining = flags.filter(f => {
    const fp = f.field ? parseField(f.field) : null
    if (!fp) return true // mantém flags sem field parseável (ex: erros de judge)
    // mesmo base + mesma jsonKey = mesmo campo conceitual (PT ou EN) → remove
    const sameField = fp.base === parsed.base && fp.jsonKey === parsed.jsonKey
    return !sameField
  })

  await service.from('reports').update({
    validation_flags:   remaining,
    validation_verdict: 'stale',   // sinaliza: editado, requer revalidação no terminal
    status:             'pending_review',
    updated_at:         new Date().toISOString(),
  }).eq('id', reportId)

  return NextResponse.json({ success: true, remainingFlags: remaining.length })
}
