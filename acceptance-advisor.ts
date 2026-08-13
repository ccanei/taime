#!/usr/bin/env npx ts-node
/*
 * ============================================================================
 * acceptance-advisor.ts  -  Suite de aceitacao do Executive Advisor (producao)
 * ============================================================================
 *
 * O QUE VALIDA
 *   Chama a rota REAL de producao (https://www.taime.tech/api/advisor/chat),
 *   autenticada como um usuario de teste, e verifica programaticamente as cenas
 *   canonicas que quebraram nas ultimas semanas: TRAJETORIA, PROSPECTIVA, TATICA,
 *   FACTUAL e ROI (calculo financeiro estruturado). Cada caso tem asserts sobre a
 *   resposta JSON e/ou sobre o registro em advisory_memory (context_metadata).
 *
 * REGRA (o porque desta suite existir)
 *   Nenhuma entrega futura do Advisor se declara PRONTA sem esta suite VERDE.
 *   Qualquer vermelho = investigar antes de commitar como pronto. Exit code != 0
 *   quando algum caso falha, para uso em CI.
 *
 * COMO RODAR
 *   Na raiz de taime-CLEAN:
 *     npx ts-node acceptance-advisor.ts
 *   Alvo padrao: producao. Para apontar a outro host (ex: preview): definir
 *   ACCEPTANCE_ADVISOR_URL.
 *
 * VARIAVEIS DE AMBIENTE (.env.local na raiz; NUNCA hardcoded)
 *   Existentes (reutilizadas):
 *     SUPABASE_URL           - projeto Supabase (aceita a forma .../rest/v1).
 *     SUPABASE_ANON_KEY      - chave anon (publica), usada no verify da sessao.
 *     SUPABASE_SERVICE_KEY   - service key: mint da sessao (admin) + leitura do
 *                              advisory_memory. Server-side only, nunca no browser.
 *   Novas (documentadas):
 *     ACCEPTANCE_ADVISOR_EMAIL     - e-mail da conta de teste. Default:
 *                                    advisor-acceptance@taime.tech
 *     ACCEPTANCE_ADVISOR_URL       - base do alvo. Default: https://www.taime.tech
 *     ACCEPTANCE_ADVISOR_PASSWORD  - OPCIONAL. Se presente, tenta password grant
 *                                    primeiro; se ausente ou se o projeto tiver o
 *                                    password auth desativado, cai no metodo admin
 *                                    (generate_link + verify) via service key.
 *
 * NOTA DE AUTENTICACAO (arquitetura real)
 *   O projeto usa magic link (OTP), com o password auth DESATIVADO. Entao o
 *   caminho robusto e compativel com PRODUCAO e mintar a sessao pelo admin
 *   generate_link + verify (service key), montar o cookie no formato exato do
 *   @supabase/ssr (sb-<ref>-auth-token = base64-<base64url(session)>) e enviar a
 *   rota real. Nao e preciso subir a app localmente. O password grant fica como
 *   caminho preferido SE o projeto reativar senhas.
 *
 * CONSUMO E CUSTO
 *   A suite consome tokens e mensagens REAIS do Advisor: 5 geracoes Sonnet 5 (uma
 *   por caso) mais chamadas de roteador Haiku (classificacao, refino, titulo). A
 *   conta de teste esta no plano Strategic (mensagens ilimitadas), entao rodar de
 *   novo nao esbarra em cota. Estimativa por execucao: da ordem de US$0,40 a
 *   US$0,70 (2 casos pesados ate 12k tokens de saida, 3 leves). Cada execucao
 *   grava 5 pares de mensagens em advisory_memory sob a conta de teste.
 * ============================================================================
 */

import dotenv from 'dotenv'
import { randomUUID } from 'crypto'
dotenv.config({ path: '.env.local' })
dotenv.config()

// ── Config ──────────────────────────────────────────────────────────────────
const SUPA_URL = (process.env.ACCEPTANCE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
  .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const ANON_KEY    = process.env.ACCEPTANCE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.ACCEPTANCE_SUPABASE_SERVICE_KEY ?? ''
const SITE        = (process.env.ACCEPTANCE_ADVISOR_URL ?? 'https://www.taime.tech').replace(/\/$/, '')
const EMAIL       = process.env.ACCEPTANCE_ADVISOR_EMAIL ?? 'advisor-acceptance@taime.tech'
const PASSWORD    = process.env.ACCEPTANCE_ADVISOR_PASSWORD ?? ''

const REQUEST_TIMEOUT_MS = 150_000

// ── Cores ANSI ──────────────────────────────────────────────────────────────
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const red   = (s: string) => `\x1b[31m${s}\x1b[0m`
const gray  = (s: string) => `\x1b[90m${s}\x1b[0m`
const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`

// ── Tipos ───────────────────────────────────────────────────────────────────
interface ChatMeta {
  is_strategic?:                boolean
  is_trajectory?:               boolean
  is_prospective?:              boolean
  truncated?:                   boolean
  spine_theme_slugs?:           string[]
  delivered_year_distribution?: Record<string, number>
}
interface CaseResult {
  json:      Record<string, unknown>
  status:    number
  elapsedMs: number
  reply:     string
  meta:      ChatMeta | null
}
interface Check { desc: string; pass: boolean }

// ── Auth: monta o cookie ssr a partir de uma sessao ─────────────────────────
type Session = Record<string, unknown> & { access_token?: string; user?: { id?: string; email?: string } }

async function mintSessionViaAdmin(): Promise<Session> {
  // 1) admin gera um magic link e devolve o hashed_token (nao envia e-mail util aqui).
  const gr = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
  })
  if (!gr.ok) throw new Error(`admin generate_link ${gr.status}: ${await gr.text()}`)
  const link = await gr.json() as { hashed_token?: string; properties?: { hashed_token?: string } }
  const hashed = link.hashed_token ?? link.properties?.hashed_token
  if (!hashed) throw new Error('admin generate_link nao retornou hashed_token')
  // 2) verify troca o token por uma sessao completa.
  const vr = await fetch(`${SUPA_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
  })
  const vj = await vr.json() as Session & { error_description?: string; msg?: string }
  if (!vj.access_token) throw new Error(`verify falhou: ${vj.error_description ?? vj.msg ?? JSON.stringify(vj).slice(0, 200)}`)
  return vj
}

async function mintSessionViaPassword(): Promise<Session | null> {
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!r.ok) return null
  const j = await r.json() as Session
  return j.access_token ? j : null
}

// Constroi o cookie no formato exato do @supabase/ssr v0.5.x:
//   nome  = sb-<projectRef>-auth-token   (projectRef = subdominio da URL Supabase)
//   valor = "base64-" + base64url(JSON.stringify(session))
//   chunk = fatias de 3180 chars (.0, .1, ...) quando o valor excede o limite.
// O valor e base64url puro (ASCII, sem % de encodeURIComponent), entao o corte por
// tamanho e fiel ao createChunks do ssr sem a logica de fronteira unicode.
function buildAuthCookie(session: Session): { header: string; userId: string } {
  const ref = new URL(SUPA_URL).hostname.split('.')[0]
  const key = `sb-${ref}-auth-token`
  const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const MAX = 3180
  const parts: Array<[string, string]> = []
  if (encoded.length <= MAX) {
    parts.push([key, encoded])
  } else {
    for (let i = 0, n = 0; i < encoded.length; i += MAX, n++) parts.push([`${key}.${n}`, encoded.slice(i, i + MAX)])
  }
  const header = parts.map(([n, v]) => `${n}=${v}`).join('; ')
  return { header, userId: session.user?.id ?? '' }
}

async function authenticate(): Promise<{ cookie: string; userId: string; method: string }> {
  if (PASSWORD) {
    const s = await mintSessionViaPassword()
    if (s) { const b = buildAuthCookie(s); return { cookie: b.header, userId: b.userId, method: 'password grant' } }
    console.log(gray('  password grant indisponivel (auth por senha desativado no projeto), usando admin generate_link'))
  }
  const s = await mintSessionViaAdmin()
  const b = buildAuthCookie(s)
  return { cookie: b.header, userId: b.userId, method: 'admin generate_link + verify' }
}

// ── Chamada da rota + leitura do metadata ────────────────────────────────────
async function askAdvisor(cookie: string, message: string): Promise<CaseResult> {
  const sessionId = randomUUID()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  const t0 = Date.now()
  let status = 0
  let json: Record<string, unknown> = {}
  try {
    const r = await fetch(`${SITE}/api/advisor/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body:    JSON.stringify({ message, sessionId }),
      signal:  ctrl.signal,
    })
    status = r.status
    json = await r.json() as Record<string, unknown>
  } finally {
    clearTimeout(timer)
  }
  const elapsedMs = Date.now() - t0
  const reply = typeof json.reply === 'string' ? json.reply : ''
  const meta = await readMeta(sessionId)
  return { json, status, elapsedMs, reply, meta }
}

async function readMeta(sessionId: string): Promise<ChatMeta | null> {
  // O route persiste antes de responder; ainda assim poll curto por seguranca.
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/advisory_memory?session_id=eq.${sessionId}&role=eq.assistant&select=context_metadata&order=created_at.desc&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    )
    if (r.ok) {
      const rows = await r.json() as Array<{ context_metadata?: ChatMeta }>
      if (rows[0]?.context_metadata) return rows[0].context_metadata
    }
    await new Promise(res => setTimeout(res, 800))
  }
  return null
}

// ── Helpers de assert ────────────────────────────────────────────────────────
const httpOk = (r: CaseResult) => r.status === 200 && !r.json.error && r.reply.trim().length > 0
function distinctYears(text: string): number[] {
  const hits = text.match(/\b20(?:1[5-9]|2[0-6])\b/g) ?? []
  return [...new Set(hits)].map(Number).sort()
}
const hasReportLink = (t: string) => /\[[^\]]+\]\(\/reports\/[^)]+#trend-\d+\)/.test(t)
const BENCHMARK_RE = /empresas como a (sua|tua)|companies like yours|m[eé]dia (de|do) mercado|market average|benchmark|ROI m[eé]dio|payback|industry average/i
const hasCalc = (t: string) => /\d[\d.,]*\s*[x×*]\s*\d/.test(t) || /R\$\s*\d[\d.,]{2,}/.test(t)
const hasScenario = (t: string) => /cen[aá]rios?\b/i.test(t) || /\bscenarios?\b/i.test(t)

// ── Definicao dos casos canonicos ────────────────────────────────────────────
interface Canon { name: string; message: string; assert: (r: CaseResult) => Check[] }

const CASES: Canon[] = [
  {
    name:    'TRAJETORIA',
    message: 'qual o historico de evolucao de cybersecurity, desde 2016 ate hoje?',
    assert: (r) => {
      const years = distinctYears(r.reply)
      const ydKeys = Object.keys(r.meta?.delivered_year_distribution ?? {})
      return [
        { desc: 'sem erro (HTTP 200, reply presente)',            pass: httpOk(r) },
        { desc: 'texto > 800 chars',                              pass: r.reply.length > 800 },
        { desc: 'cita o ano corrente (2026)',                     pass: r.reply.includes('2026') },
        { desc: 'cita ao menos 4 anos distintos',                 pass: years.length >= 4 },
        { desc: 'contem link markdown de report',                 pass: hasReportLink(r.reply) },
        { desc: 'delivered_year_distribution com >= 4 anos',      pass: ydKeys.length >= 4 },
        { desc: 'espinha (spine_theme_slugs) nao-vazia',          pass: (r.meta?.spine_theme_slugs?.length ?? 0) >= 1 },
      ]
    },
  },
  {
    name:    'PROSPECTIVA',
    message: 'com base no framework THEN NOW NEXT, qual o NEXT de cybersecurity e onde focar meu investimento?',
    assert: (r) => {
      const truncatedBad = r.meta?.truncated === true && r.reply.trim().length < 200
      const years = distinctYears(r.reply)
      return [
        { desc: 'sem erro (HTTP 200, reply presente)',            pass: httpOk(r) },
        { desc: 'sem truncamento (nao max_tokens com texto <200)', pass: !truncatedBad },
        { desc: 'texto > 800 chars',                              pass: r.reply.length > 800 },
        { desc: 'cita ao menos um ano >= 2025',                   pass: years.some(y => y >= 2025) },
      ]
    },
  },
  {
    name:    'TATICA',
    message: 'quais criterios para escolher uma ferramenta de observabilidade?',
    assert: (r) => [
      { desc: 'sem erro (HTTP 200, reply presente)',              pass: httpOk(r) },
      { desc: 'responde em < 60s',                                pass: r.elapsedMs < 60_000 },
      { desc: 'sem espinha no metadata (nao-estrategica)',        pass: (r.meta?.spine_theme_slugs?.length ?? 0) === 0 },
      { desc: 'texto > 400 chars',                                pass: r.reply.length > 400 },
    ],
  },
  {
    name:    'FACTUAL',
    message: 'o que o arquivo tem de 2016?',
    assert: (r) => {
      const years = distinctYears(r.reply)
      // "nao inventa anos ausentes": nenhum ano fora da faixa plausivel do arquivo
      // (2015..2026). Um ano impossivel no texto e sinal de invencao.
      const futureYears = (r.reply.match(/\b20\d{2}\b/g) ?? []).map(Number).filter(y => y > 2026 || (y < 2015 && y >= 2000))
      return [
        { desc: 'sem erro (HTTP 200, reply presente)',            pass: httpOk(r) },
        { desc: 'cita 2016',                                      pass: r.reply.includes('2016') },
        { desc: 'nao inventa anos ausentes (sem ano fora de 2015..2026)', pass: futureYears.length === 0 && years.length > 0 },
      ]
    },
  },
  {
    name:    'ROI',
    message: 'gasto 20h/semana num processo manual, hora custa R$80, vale automatizar?',
    assert: (r) => [
      { desc: 'sem erro (HTTP 200, reply presente)',              pass: httpOk(r) },
      { desc: 'contem calculo (multiplicacao ou valor R$)',       pass: hasCalc(r.reply) },
      { desc: 'contem a palavra cenario/cenarios',                pass: hasScenario(r.reply) },
      { desc: 'sem benchmark de mercado',                         pass: !BENCHMARK_RE.test(r.reply) },
    ],
  },
]

// ── Runner ───────────────────────────────────────────────────────────────────
function requireEnv(): void {
  const missing: string[] = []
  if (!SUPA_URL)    missing.push('SUPABASE_URL')
  if (!ANON_KEY)    missing.push('SUPABASE_ANON_KEY')
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY')
  if (missing.length) {
    console.error(red(`Faltam variaveis de ambiente: ${missing.join(', ')}`))
    console.error(gray('Defina-as em .env.local na raiz. Veja o cabecalho deste arquivo.'))
    process.exit(2)
  }
}

async function main(): Promise<void> {
  requireEnv()
  console.log(bold('\nTAIME Advisor  -  suite de aceitacao'))
  console.log(gray(`alvo: ${SITE}/api/advisor/chat`))
  console.log(gray(`conta de teste: ${EMAIL}`))

  let auth: { cookie: string; userId: string; method: string }
  try {
    auth = await authenticate()
  } catch (e) {
    console.error(red(`\nFalha na autenticacao: ${e instanceof Error ? e.message : String(e)}`))
    process.exit(2)
    return
  }
  console.log(gray(`auth: ${auth.method}  (user ${auth.userId.slice(0, 8)}...)\n`))

  const rows: Array<{ name: string; ok: boolean; checks: Check[]; ms: number; note?: string }> = []
  for (const c of CASES) {
    process.stdout.write(gray(`  rodando ${c.name.padEnd(12)} `))
    try {
      const res = await askAdvisor(auth.cookie, c.message)
      const checks = c.assert(res)
      const metaWarn = res.meta ? '' : ' (advisory_memory nao lido)'
      const ok = checks.every(k => k.pass)
      rows.push({ name: c.name, ok, checks, ms: res.elapsedMs, note: metaWarn })
      console.log((ok ? green('ok') : red('FALHOU')) + gray(`  ${(res.elapsedMs / 1000).toFixed(1)}s${metaWarn}`))
    } catch (e) {
      rows.push({ name: c.name, ok: false, checks: [{ desc: `excecao: ${e instanceof Error ? e.message : String(e)}`, pass: false }], ms: 0 })
      console.log(red('ERRO') + gray(`  ${e instanceof Error ? e.message : String(e)}`))
    }
  }

  // Tabela final
  console.log(bold('\n  Resultado\n  ---------'))
  for (const r of rows) {
    console.log(`  ${r.ok ? green('PASS') : red('FAIL')}  ${r.name.padEnd(12)} ${gray(`${(r.ms / 1000).toFixed(1)}s`)}`)
    if (!r.ok) {
      for (const k of r.checks.filter(x => !x.pass)) console.log(red(`         x ${k.desc}`))
    }
  }

  const failed = rows.filter(r => !r.ok)
  console.log('')
  if (failed.length === 0) {
    console.log(green(bold(`  Todos verdes (${rows.length}/${rows.length}). Entrega pode se declarar pronta.`)))
    process.exit(0)
  } else {
    console.log(red(bold(`  ${failed.length} vermelho(s) de ${rows.length}. Investigar antes de declarar pronto.`)))
    process.exit(1)
  }
}

main().catch(e => { console.error(red(String(e))); process.exit(1) })
