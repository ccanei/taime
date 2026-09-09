import { NextResponse } from 'next/server'
import { createSupabaseService } from '@/lib/supabase-server'
import { clientIp, hashIp, verifyTurnstile } from '@/lib/anti-abuse'
import { logLlmCall } from '@/lib/llm-telemetry'
import { THEMES, ORG_SIZES, OBJECTIVES, HORIZONS, buildComboSlug, type Combo } from '@/lib/decision-check'
import { getDecisionResult } from '@/lib/decision-check-core'

// POST /api/decision-check
// Recebe {theme,size,objective,horizon,turnstileToken?}. Faz rate limit por IP
// (10/hora, contados na decision_checks), Turnstile apos 3/hora (se configurado),
// computa o resultado (cache 24h por combinacao), grava a submissao e devolve {slug}.

const RATE_MAX = 10   // submissoes/hora por IP (hard)
const SOFT     = 3    // apos 3/hora, exige Turnstile (se configurado)

const okKey = (list: Array<{ key: string }>, k: unknown): k is string =>
  typeof k === 'string' && list.some(x => x.key === k)

export async function POST(req: Request) {
  let body: { theme?: string; size?: string; objective?: string; horizon?: string; turnstileToken?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  const theme = body.theme
  if (!theme || !THEMES[theme] || !okKey(ORG_SIZES, body.size) || !okKey(OBJECTIVES, body.objective) || !okKey(HORIZONS, body.horizon)) {
    return NextResponse.json({ error: 'invalid_selection' }, { status: 400 })
  }
  const combo: Combo = { theme, size: body.size, objective: body.objective, horizon: body.horizon }
  const slug = buildComboSlug(combo)

  const ip     = clientIp(req)
  const ipHash = hashIp(ip, 'decision_check:')
  const service = createSupabaseService()

  // ── Rate limit: conta submissoes deste IP na ultima hora (fail-open se a tabela
  //    ainda nao existe / erro de infra: nao bloqueia o funil publico). ──────────
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  let recent = 0
  try {
    const { count, error } = await service
      .from('decision_checks')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', sinceIso)
    if (!error && typeof count === 'number') recent = count
  } catch { /* fail-open */ }

  if (recent >= RATE_MAX) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  if (recent >= SOFT && process.env.TURNSTILE_SECRET_KEY) {
    const okHuman = !!body.turnstileToken && await verifyTurnstile(body.turnstileToken, ip)
    if (!okHuman) return NextResponse.json({ error: 'turnstile_required' }, { status: 428 })
  }

  // ── Computa (cache 24h por combinacao: 2a chamada nao chama Haiku). ───────────
  const result = await getDecisionResult(slug, combo)

  // ── Grava a submissao (fail-safe) + evento de analytics no llm_calls. ─────────
  try {
    await service.from('decision_checks').insert({
      theme_slug: theme, org_size: combo.size, objective: combo.objective, horizon: combo.horizon,
      result_snapshot: result, ip_hash: ipHash,
    })
  } catch { /* tabela ausente / infra: nao quebra o funil */ }

  logLlmCall({
    caller: 'decision_check', model: 'none', success: true,
    meta: { step: 'submission', theme, size: combo.size, objective: combo.objective, horizon: combo.horizon, ok: result.ok },
  })

  return NextResponse.json({ slug })
}
