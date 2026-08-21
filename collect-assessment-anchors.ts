#!/usr/bin/env npx ts-node
/*
 * ============================================================================
 * collect-assessment-anchors.ts  -  Insumo curavel da Parte B do Assessment
 * ============================================================================
 * COLETA (nao decide) as ancoras temporais: para cada ESTAGIO (niveis 2, 3 e 4 das
 * 20 perguntas do modelo; o nivel 1 e sempre o estagio atrasado, sem ancora), busca as
 * trends mais proximas no arquivo TAIME (report_trend_embeddings, reports publicados,
 * idioma pt) e pede a um Sonnet (prompt restrito) o ANO em que aquele estagio deixou de
 * ser diferencial competitivo e virou linha de base no mercado. A DECISAO final e
 * humana: as propostas saem para revisao em JSON + CSV.
 *
 * NAO altera nada em producao: so LE o banco e ESCREVE arquivos locais. Nao grava no
 * banco, nao toca em rotas, no Advisor, no prompt.
 *
 * Total esperado: 20 perguntas x 3 niveis = 60 ancoras.
 *
 * FLAGS:
 *   --domain <id>     roda so um dominio (data|cloud|ai|security|governance)
 *   --dry-run         imprime o que faria, NAO escreve os arquivos
 *   --limit N         processa no maximo N ancoras (para teste)
 *   --only-missing    reprocessa SO as ancoras vazias / sem_lastro (nao curadas)
 *   --force           sobrescreve ate as linhas curadas (curated: true) [use com cuidado]
 *
 * SAIDA (em taime-web/data/): assessment-anchors.json (fonte de verdade, editavel e que a
 * Parte B vai LER, importavel via @/data/... dentro do taime-web) + assessment-anchors.csv
 * (para revisao em planilha) + README-assessment-anchors.md (como editar / marcar curated).
 *
 * Env (.env.local): SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY.
 *
 * Uso:  npx ts-node collect-assessment-anchors.ts --domain data --dry-run
 * ============================================================================
 */
import dotenv from 'dotenv'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { QUESTIONS, DOMAINS, domainById, type DomainId } from './taime-web/lib/assessment-model'
dotenv.config({ path: '.env.local' })

// ── Config ───────────────────────────────────────────────────────────────────
const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const SKEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const OPENAI = process.env.OPENAI_API_KEY ?? ''
const ANTHROPIC = process.env.ANTHROPIC_API_KEY ?? ''
const MODEL = 'claude-sonnet-4-6'                 // Sonnet, mesma familia do pipeline
const EMBED_MODEL = 'text-embedding-3-small'      // 1536 dims, igual ao Advisor
const OUT_DIR = 'taime-web/data'
const JSON_PATH = `${OUT_DIR}/assessment-anchors.json`
const CSV_PATH = `${OUT_DIR}/assessment-anchors.csv`
const README_PATH = `${OUT_DIR}/README-assessment-anchors.md`
const CANDIDATE_COUNT = 12
const MIN_SIMILARITY = 0.30
const EXCERPT_CHARS = 600
// Precos (USD / 1M tokens), Sonnet + embeddings, para a estimativa de custo.
const PRICE_IN = 3.0, PRICE_OUT = 15.0, PRICE_EMBED = 0.02

// ── Flags ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const getFlag = (name: string): string | undefined => { const i = argv.indexOf(`--${name}`); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined }
const DRY_RUN = argv.includes('--dry-run')
const ONLY_MISSING = argv.includes('--only-missing')
const FORCE = argv.includes('--force')
const DOMAIN = getFlag('domain') as DomainId | undefined
const LIMIT = getFlag('limit') ? parseInt(getFlag('limit')!, 10) : Infinity

// ── Tipos da ancora ──────────────────────────────────────────────────────────
type Confidence = 'alta' | 'media' | 'sem_lastro'
interface Anchor {
  ano:          number | null
  trend_id:     string | null
  trend_period: string | null
  evidencia:    string
  confianca:    Confidence
  curated:      boolean       // marcado por mim apos revisar; o script NUNCA sobrescreve (sem --force)
  nota:         string        // texto livre meu
}
type Anchors = Record<string, Record<string, Anchor>>   // question_id -> nivel("2"|"3"|"4") -> ancora

interface TrendMatch { trend_id: string; report_id: string; period: string; rank: number; theme_slug: string | null; category: string | null; content: string; similarity: number }

// ── Rede (raw fetch, padrao do pipeline) ─────────────────────────────────────
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json' }
let embedTokens = 0, inTokens = 0, outTokens = 0

async function embed(text: string): Promise<number[] | null> {
  const r = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: EMBED_MODEL, input: text }) })
  if (!r.ok) { console.error('  [embed] falhou', r.status, (await r.text()).slice(0, 120)); return null }
  const j = await r.json() as { data?: Array<{ embedding: number[] }>; usage?: { total_tokens?: number } }
  embedTokens += j.usage?.total_tokens ?? 0
  return j.data?.[0]?.embedding ?? null
}
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) })
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status} ${(await r.text()).slice(0, 160)}`)
  return r.json() as Promise<T[]>
}
async function anthropic(system: string, user: string): Promise<string | null> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, system, messages: [{ role: 'user', content: user }] }),
  })
  if (!r.ok) { console.error('  [anthropic] falhou', r.status, (await r.text()).slice(0, 160)); return null }
  const j = await r.json() as { content?: Array<{ type: string; text: string }>; usage?: { input_tokens?: number; output_tokens?: number } }
  inTokens += j.usage?.input_tokens ?? 0
  outTokens += j.usage?.output_tokens ?? 0
  return (j.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('').trim()
}

// ── Prompt do Sonnet (restrito, honestidade em 1o lugar) ─────────────────────
const SYS = `You identify the YEAR a given maturity STAGE stopped being a competitive DIFFERENTIATOR and became a market BASELINE (a prerequisite that the market now expects everyone to have), using ONLY the provided TAIME trend excerpts as evidence.

You receive: a domain, a diagnostic question, the specific STAGE text (a maturity level), and a CHRONOLOGICAL list of trend excerpts (period + trend_id + text) retrieved as the closest matches.

Return STRICT JSON only, nothing else:
{ "ano": <YYYY number or null>, "trend_id": "<uuid of the supporting trend or null>", "trend_period": "<YYYY-MM-DD or null>", "evidencia": "<a LITERAL verbatim snippet copied from ONE excerpt that supports the year, or empty string>", "confianca": "alta" | "media" | "sem_lastro" }

RULES (honesty is the priority, NOT estimating is preferable to estimating):
- Answer "sem_lastro" with ano=null WHENEVER the excerpts do NOT clearly support a turning point where THIS stage becomes a baseline/prerequisite. Never infer a plausible year without a literal snippet that supports it.
- "evidencia" MUST be copied verbatim from ONE provided excerpt. If you cannot copy a supporting snippet, you MUST answer "sem_lastro".
- "alta": an excerpt explicitly frames this stage as already-expected / standard / table-stakes / baseline around a period. "media": the excerpts suggest the shift but less explicitly. "sem_lastro": no support.
- Use ONLY the provided excerpts. No outside knowledge. Never use the em dash character.
- Output the JSON object and nothing else.`

function buildUser(domainName: string, question: string, stage: string, cands: TrendMatch[]): string {
  const list = cands.map((c, i) => `[${i + 1}] period=${c.period} trend_id=${c.trend_id}\n${c.content.replace(/\s+/g, ' ').slice(0, EXCERPT_CHARS)}`).join('\n\n')
  return `DOMAIN: ${domainName}\nQUESTION: ${question}\nSTAGE (the maturity level to locate as it becomes baseline): "${stage}"\n\nCANDIDATE TREND EXCERPTS (chronological):\n${list}`
}

function parseAnchor(raw: string | null): Pick<Anchor, 'ano' | 'trend_id' | 'trend_period' | 'evidencia' | 'confianca'> | null {
  if (!raw) return null
  const s = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let p: any
  try { p = JSON.parse(s) } catch { return null }
  const conf: Confidence = p.confianca === 'alta' || p.confianca === 'media' ? p.confianca : 'sem_lastro'
  const ano = typeof p.ano === 'number' && p.ano > 1990 && p.ano < 2100 ? p.ano : null
  return {
    ano: conf === 'sem_lastro' ? null : ano,
    trend_id: typeof p.trend_id === 'string' && /^[0-9a-f-]{36}$/i.test(p.trend_id) ? p.trend_id : null,
    trend_period: typeof p.trend_period === 'string' ? p.trend_period : null,
    evidencia: typeof p.evidencia === 'string' ? p.evidencia.slice(0, 600) : '',
    confianca: conf,
  }
}

// ── Merge / persistencia ─────────────────────────────────────────────────────
function loadExisting(): Anchors {
  if (!existsSync(JSON_PATH)) return {}
  try {
    const parsed = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as Record<string, unknown>
    const { _meta: _drop, ...rest } = parsed
    void _drop
    return rest as Anchors
  } catch { return {} }
}
function csvEsc(v: unknown): string { return `"${String(v ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"` }

function metaBlock(now: string) {
  return {
    _generated_at: now,
    _model: MODEL,
    _how_to_edit: 'Cada ancora vive em anchors[question_id][nivel] (niveis "2","3","4"). Para curar: ajuste `ano`, `evidencia`, `trend_id`/`trend_period` conforme sua revisao, escreva sua `nota`, e marque `curated: true`. O script NUNCA sobrescreve linhas com curated:true (a menos que voce rode --force). Rerodando, ele mescla: preserva o curado e atualiza o resto. --only-missing reprocessa so as vazias/sem_lastro nao curadas.',
    _confianca: 'alta = trecho explicito de virada; media = indicio menos explicito; sem_lastro = sem trecho que sustente (ano vazio, correto quando o arquivo nao mostra a virada).',
    _part_b: 'A Parte B (veredito de atraso) LE este arquivo. So use ano quando confianca != sem_lastro e, idealmente, apos curated:true.',
  }
}

async function main() {
  const missingEnv = (['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'] as const).filter(k => !process.env[k])
  if (missingEnv.length) { console.error('Env faltando:', missingEnv.join(', ')); process.exit(1) }

  const existing = loadExisting()
  const questions = QUESTIONS.filter(q => !DOMAIN || q.domain === DOMAIN)
  const dist = { alta: 0, media: 0, sem_lastro: 0 }
  let processed = 0, preserved = 0, skippedMissing = 0
  const rows: string[] = ['question_id,domain,level,stage_pt,ano,confianca,curated,trend_id,trend_period,evidencia,nota']

  console.log(`\nColeta de ancoras ${DRY_RUN ? '(DRY-RUN)' : ''} | dominio=${DOMAIN ?? 'todos'} | modelo=${MODEL}`)
  console.log(`flags: only-missing=${ONLY_MISSING} force=${FORCE} limit=${LIMIT === Infinity ? 'sem' : LIMIT}\n`)

  for (const q of questions) {
    const domainName = domainById(q.domain)?.label.pt ?? q.domain
    for (const level of [2, 3, 4] as const) {
      const key = String(level)
      const prev = existing[q.id]?.[key]
      const stage = q.options.find(o => o.level === level)?.pt ?? ''

      // Protecao do curado + only-missing
      let anchor: Anchor
      if (prev?.curated && !FORCE) {
        anchor = prev; preserved++
        console.log(`- ${q.id} L${level}: PRESERVADO (curated:true)`)
      } else if (ONLY_MISSING && prev && prev.confianca !== 'sem_lastro' && prev.ano) {
        anchor = prev; skippedMissing++
        // nao imprime para nao poluir
      } else if (processed >= LIMIT) {
        anchor = prev ?? { ano: null, trend_id: null, trend_period: null, evidencia: '', confianca: 'sem_lastro', curated: false, nota: '' }
      } else {
        // Processa: embedding do estagio (com contexto) -> candidatos -> Sonnet
        processed++
        const emb = await embed(`${domainName}. ${q.prompt.pt} ${stage}`)
        let cands: TrendMatch[] = []
        if (emb) {
          try {
            const raw = await rpc<TrendMatch>('match_trend_chunks_since', { query_embedding: emb, since_ts: '1970-01-01', match_lang: 'pt', min_similarity: MIN_SIMILARITY, match_count: CANDIDATE_COUNT })
            cands = raw.slice().sort((a, b) => a.period.localeCompare(b.period))   // cronologico p/ o Sonnet
          } catch (e) { console.error(`  rpc erro ${q.id} L${level}:`, e instanceof Error ? e.message : e) }
        }
        let got: ReturnType<typeof parseAnchor> = null
        if (cands.length > 0) got = parseAnchor(await anthropic(SYS, buildUser(domainName, q.prompt.pt, stage, cands)))
        const base = got ?? { ano: null, trend_id: null, trend_period: null, evidencia: '', confianca: 'sem_lastro' as Confidence }
        anchor = { ...base, curated: prev?.curated ?? false, nota: prev?.nota ?? '' }
        console.log(`* ${q.id} L${level} [${stage.slice(0, 40)}] -> ${anchor.confianca}${anchor.ano ? ' ' + anchor.ano : ''} (${cands.length} cands)`)
      }

      dist[anchor.confianca]++
      if (!existing[q.id]) existing[q.id] = {}
      existing[q.id][key] = anchor
      rows.push([q.id, q.domain, level, stage, anchor.ano ?? '', anchor.confianca, anchor.curated, anchor.trend_id ?? '', anchor.trend_period ?? '', anchor.evidencia, anchor.nota].map(csvEsc).join(','))
    }
  }

  // ── Escrita ────────────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const out: Record<string, unknown> = { _meta: metaBlock(now), ...existing }
  if (!DRY_RUN) {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(JSON_PATH, JSON.stringify(out, null, 2))
    writeFileSync(CSV_PATH, rows.join('\n'))
    writeFileSync(README_PATH, readme())
    console.log(`\nEscrito: ${JSON_PATH}, ${CSV_PATH}, ${README_PATH}`)
  } else {
    console.log('\n(DRY-RUN: nada escrito)')
  }

  // ── Relatorio ────────────────────────────────────────────────────────────────
  const embCost = (embedTokens / 1e6) * PRICE_EMBED
  const genCost = (inTokens / 1e6) * PRICE_IN + (outTokens / 1e6) * PRICE_OUT
  console.log(`\nConfianca: alta=${dist.alta} media=${dist.media} sem_lastro=${dist.sem_lastro}`)
  console.log(`Processadas=${processed} preservadas(curated)=${preserved} puladas(only-missing)=${skippedMissing}`)
  console.log(`Tokens: embed=${embedTokens} in=${inTokens} out=${outTokens}`)
  console.log(`Custo estimado: US$ ${(embCost + genCost).toFixed(4)} (embeddings ${embCost.toFixed(4)} + Sonnet ${genCost.toFixed(4)})`)
}

function readme(): string {
  return `# Ancoras temporais do Assessment (insumo curavel da Parte B)

Gerado por \`collect-assessment-anchors.ts\` (na raiz). O script COLETA propostas; a
DECISAO e sua. A Parte B (veredito de atraso) le \`assessment-anchors.json\`.

## O que e cada ancora
Para cada estagio (niveis 2, 3, 4 de cada pergunta; o nivel 1 e sempre o atrasado, sem
ancora), o \`ano\` em que aquele estagio deixou de ser diferencial e virou linha de base
no mercado, com o \`trecho\` (evidencia) da trend que sustenta a data.

## Estrutura (assessment-anchors.json)
\`\`\`
{
  "_meta": { ... instrucoes ... },
  "data_1": {
    "2": { "ano": 2019, "trend_id": "...", "trend_period": "2019-06-01",
           "evidencia": "trecho literal...", "confianca": "alta",
           "curated": false, "nota": "" },
    "3": { ... }, "4": { ... }
  },
  ...
}
\`\`\`

## Como curar uma ancora (o que voce faz)
1. Abra \`assessment-anchors.csv\` para revisar confortavelmente (ou o JSON direto).
2. Ajuste \`ano\`, \`evidencia\`, \`trend_id\`/\`trend_period\` conforme seu julgamento.
3. Escreva a sua \`nota\` (opcional).
4. Marque \`"curated": true\` na ancora revisada.

## Protecao do que voce curou
O script **nunca** sobrescreve uma ancora com \`"curated": true\` (a menos que voce rode
\`--force\`). Ao rerodar, ele mescla: preserva o curado e atualiza o resto.

## Flags uteis
- \`--domain data\` roda so um dominio.
- \`--dry-run\` imprime sem escrever.
- \`--only-missing\` reprocessa so as ancoras vazias/sem_lastro (nao curadas).
- \`--limit N\` limita o numero de ancoras processadas.
- \`--force\` reprocessa ate as curadas (use com cuidado).

## Confianca
- \`alta\`: trecho explicito de virada. \`media\`: indicio menos explicito.
- \`sem_lastro\`: sem trecho que sustente (ano vazio). Nesta fase, nao estimar e preferivel
  a estimar; \`sem_lastro\` e a resposta correta quando o arquivo nao mostra a virada.
`
}

main().catch(e => { console.error(e); process.exit(1) })
