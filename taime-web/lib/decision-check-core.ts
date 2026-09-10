import 'server-only'
import { unstable_cache } from 'next/cache'
import { stripEmDash } from '@/lib/strip-markdown'
import { logLlmCall, usageTokens } from '@/lib/llm-telemetry'
import type { TaimeFramework, ThenNowNext } from '@/lib/types'
import {
  type Combo, type DecisionResult, type Move, isMove, moveFromScore, FALLBACK_MSG, themeLabel, SIZE_FRAMING,
  computeAlignment, ALIGNMENT_FALLBACK,
} from '@/lib/decision-check'

// Nucleo do /decision-check: consolida as trends do tema num snapshot (score/move/
// then-now-next/risco) via Haiku, com regras editoriais TAIME. Cache 24h por combinacao
// (unstable_cache) -> 2a chamada sub-segundo, sem Haiku. Fail-safe em tudo.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5'

function supa(): { url: string; key: string } | null {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  return url && key ? { url, key } : null
}

interface TrendRow {
  taime_score:           number
  title_pt_br:           string
  title_en:              string
  taime_framework_pt_br: TaimeFramework | null
  taime_framework_en:    TaimeFramework | null
  then_now_next_pt_br:   ThenNowNext | null
  then_now_next_en:      ThenNowNext | null
  report_id:             string
  reports:               { period: string; status: string; is_public: boolean | null } | null
}

async function fetchThemeTrends(theme: string): Promise<TrendRow[]> {
  const c = supa(); if (!c) return []
  const h = { apikey: c.key, Authorization: `Bearer ${c.key}` }
  const fields = 'taime_score,title_pt_br,title_en,taime_framework_pt_br,taime_framework_en,' +
    'then_now_next_pt_br,then_now_next_en,report_id,reports!inner(period,status,is_public)'
  // Arquivo COMPLETO (desde 2015), sem janela temporal: as 5 trends de MAIOR
  // taime_score do tema em todo o publicado. Assim o rodape reflete a profundidade
  // real do tema (pode remontar a 2015 para temas antigos) e o diferencial do arquivo
  // nao e desperdicado. A recencia nao exclui trends antigas: ela entra so como peso
  // no score agregado (weightedScore) e como ancora do NOW no prompt do Haiku.
  const url = `${c.url}/rest/v1/report_trends?theme_slug=eq.${theme}` +
    `&reports.status=eq.published` +
    `&order=taime_score.desc&limit=5&select=${fields}`
  try {
    const r = await fetch(url, { headers: h, cache: 'no-store' })
    if (!r.ok) return []
    return await r.json() as TrendRow[]
  } catch { return [] }
}

async function findPublicReportId(theme: string, trends: TrendRow[]): Promise<string | null> {
  const inline = trends.find(t => t.reports?.is_public)?.report_id
  if (inline) return inline
  const c = supa(); if (!c) return null
  const h = { apikey: c.key, Authorization: `Bearer ${c.key}` }
  try {
    const r = await fetch(
      `${c.url}/rest/v1/report_trends?theme_slug=eq.${theme}&reports.status=eq.published&reports.is_public=eq.true` +
      `&limit=1&select=report_id,reports!inner(is_public,status)`,
      { headers: h, cache: 'no-store' },
    )
    if (!r.ok) return null
    const rows = await r.json() as Array<{ report_id: string }>
    return rows[0]?.report_id ?? null
  } catch { return null }
}

// Media ponderada por recencia: mais recente pesa mais (pesos lineares 1..n).
function weightedScore(trends: TrendRow[]): number {
  const asc = [...trends].sort((a, b) => (a.reports?.period ?? '').localeCompare(b.reports?.period ?? ''))
  let num = 0, den = 0
  asc.forEach((t, i) => { const w = i + 1; num += t.taime_score * w; den += w })
  return den ? Math.round(num / den) : 0
}

function trendContext(trends: TrendRow[]): string {
  return trends.map((t, i) => {
    const fw = t.taime_framework_pt_br
    const tnn = t.then_now_next_pt_br
    const period = (t.reports?.period ?? '').slice(0, 7) // YYYY-MM: marca a recencia de cada trend
    const parts = [
      `TREND ${i + 1} (score ${t.taime_score}${period ? `, period ${period}` : ''}): ${t.title_pt_br}`,
      fw?.act ? `  ACT: ${fw.act}` : '',
      fw?.move ? `  MOVE: ${fw.move}` : '',
      tnn?.then ? `  THEN: ${tnn.then}` : '',
      tnn?.now ? `  NOW: ${tnn.now}` : '',
      tnn?.next ? `  NEXT: ${tnn.next}` : '',
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n')
}

const SYS = `You consolidate several TAIME strategic technology trend analyses into ONE compact decision snapshot for a public, free lead magnet. Return STRICT JSON only, no markdown.

INVIOLABLE RULES:
- Ground everything ONLY in the trends provided. Never invent facts, numbers, dates or vendors.
- Cite sources by CATEGORY only, never by name.
- NEVER use the em dash character. Use a comma, a colon or a period.
- No monetary values in any currency.
- Write BOTH Portuguese (pt) and English (en), each native, not a translation of the other.
- Executive register, concise.
- The trends may span several years of the archive (each is tagged with its period). Anchor NOW on the MOST RECENT trend by period; use older trends to build THEN and the trajectory, never to describe the present. NEXT is a projection forward from the most recent state.

The user ALSO picked an OBJECTIVE for this technology (in the CLIENT LENS below):
adotar (adopt, go now) maps to move act; preparar to prepare; monitorar to monitor;
evitar (avoid) to avoid. Compare that objective with the dominant MOVE you read from the
trends and judge the fit:
- alignment_status = "aligned" when the objective points the SAME way as the move; "tension" when they diverge.
- alignment_pt / alignment_en = 1 to 2 lines explaining WHY the archive supports the objective (aligned) or WHY it pulls against it (tension), grounded ONLY in the trends. This is the part that must change with the objective.

Return this shape and nothing else:
{
  "move": "act | prepare | monitor | avoid (the dominant strategic posture across the trends)",
  "alignment_status": "aligned | tension",
  "alignment_pt": "1 to 2 lines", "alignment_en": "1 to 2 lines",
  "risk_pt": "1 to 2 lines, the single main risk", "risk_en": "1 to 2 lines",
  "then_pt": "2 to 3 lines", "then_en": "2 to 3 lines",
  "now_pt": "2 to 3 lines", "now_en": "2 to 3 lines",
  "next_pt": "2 to 3 lines (projection, never certainty)", "next_en": "2 to 3 lines"
}`

async function callHaiku(theme: string, c: Combo, trends: TrendRow[]): Promise<Record<string, unknown> | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const t0 = Date.now()
  const porteFraming = SIZE_FRAMING[c.size] ?? c.size
  const user = `THEME: ${themeLabel(theme, 'pt')}\nCLIENT LENS: objetivo=${c.objective}, horizonte=${c.horizon}, porte=${porteFraming}\n\nTRENDS (highest TAIME Score across the full archive, each tagged with its period):\n${trendContext(trends)}`
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYS, messages: [{ role: 'user', content: user }] }),
    })
    const data = await res.json() as { content?: Array<{ type: string; text: string }>; usage?: Record<string, number> }
    logLlmCall({ caller: 'decision_check', model: MODEL, ...usageTokens(data?.usage ?? null), latency_ms: Date.now() - t0, success: res.ok, error_code: res.ok ? null : 'api_error', meta: { step: 'generate', theme, size: c.size, objective: c.objective, horizon: c.horizon } })
    if (!res.ok) return null
    const raw = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
    const jsonStr = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    return JSON.parse(jsonStr) as Record<string, unknown>
  } catch (e) {
    console.error('[decision-check] Haiku falhou (fallback deterministico):', e instanceof Error ? e.message : e)
    return null
  }
}

const s = (v: unknown): string => (typeof v === 'string' ? stripEmDash(v.trim()) : '')

async function computeResult(slug: string, c: Combo): Promise<DecisionResult> {
  const trends = await fetchThemeTrends(c.theme)
  const reportId = await findPublicReportId(c.theme, trends)

  // Fallback educado: tema imaturo (menos de 3 trends).
  if (trends.length < 3) {
    return {
      ok: false, score: 0, move: 'monitor',
      risk: { pt: '', en: '' },
      tnn: { then: { pt: '', en: '' }, now: { pt: '', en: '' }, next: { pt: '', en: '' } },
      trendCount: trends.length, oldestYear: null, reportId, fallbackMsg: FALLBACK_MSG,
      alignmentStatus: 'aligned', alignment: { pt: '', en: '' },
    }
  }

  const score = weightedScore(trends)
  const years = trends.map(t => Number((t.reports?.period ?? '').slice(0, 4))).filter(y => y >= 2000)
  const oldestYear = years.length ? Math.min(...years) : null

  const gen = await callHaiku(c.theme, c, trends)
  const move: Move = gen && isMove(gen.move) ? gen.move : moveFromScore(score)

  // Fallback determinístico por campo quando o Haiku nao retornou (usa a trend top).
  const top = trends[0]
  const topTnnPt = top.then_now_next_pt_br, topTnnEn = top.then_now_next_en
  const risk = {
    pt: (gen && s(gen.risk_pt)) || s(top.taime_framework_pt_br?.limitations) || '',
    en: (gen && s(gen.risk_en)) || s(top.taime_framework_en?.limitations) || '',
  }
  const tnn = {
    then: { pt: (gen && s(gen.then_pt)) || s(topTnnPt?.then), en: (gen && s(gen.then_en)) || s(topTnnEn?.then) },
    now:  { pt: (gen && s(gen.now_pt))  || s(topTnnPt?.now),  en: (gen && s(gen.now_en))  || s(topTnnEn?.now) },
    next: { pt: (gen && s(gen.next_pt)) || s(topTnnPt?.next), en: (gen && s(gen.next_en)) || s(topTnnEn?.next) },
  }

  // Alinhamento objetivo x leitura do TAIME: STATUS deterministico (objetivo↔move),
  // TEXTO do Haiku (grounded) com fallback generico seguro. O status governa cor/icone.
  const alignmentStatus = computeAlignment(c.objective, move)
  const alignment = {
    pt: (gen && s(gen.alignment_pt)) || ALIGNMENT_FALLBACK[alignmentStatus].pt,
    en: (gen && s(gen.alignment_en)) || ALIGNMENT_FALLBACK[alignmentStatus].en,
  }

  return { ok: true, score, move, risk, tnn, trendCount: trends.length, oldestYear, reportId, fallbackMsg: FALLBACK_MSG, alignmentStatus, alignment }
}

// Cache por combinacao (24h). Chave = slug. 2a chamada da mesma combinacao NAO chama
// Haiku (sub-segundo). unstable_cache serializa o DecisionResult (JSON puro).
export function getDecisionResult(slug: string, c: Combo): Promise<DecisionResult> {
  // v3: bump da chave apos remover a janela de 24 meses (busca agora cobre o arquivo
  // completo desde 2015). Invalida snapshots antigos calculados com a janela curta,
  // que traziam score/rodape/then-now-next de uma amostra mais rasa do tema.
  return unstable_cache(
    () => computeResult(slug, c),
    ['decision-check', 'v3', slug],
    { revalidate: 86400, tags: [`decision-check:v3:${slug}`] },
  )()
}
