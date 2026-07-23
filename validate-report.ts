import 'dotenv/config';
import { parsePeriod } from './period-utils';
import { deepStripLoneSurrogates } from './sanitize';

/**
 * TAIME — Report Validator (LLM-as-judge + checks determinísticos)
 *
 * Roda APÓS o generate-report.ts. Para cada relatório do período:
 *   1. Checks determinísticos (sem LLM): scores PT=EN, nomes de fonte,
 *      em dash, valores monetários. Baratos e 100% confiáveis — rodam primeiro.
 *   2. Grounding / anti-alucinação (LLM): cada claim factual é classificado
 *      contra os sinais reais do período (supported / partial / unsupported).
 *   3. Boundary temporal (LLM): nada posterior a PERIOD_END_DATE, sem hindsight.
 *
 * Veredito:
 *   - pass          → nenhuma flag → AUTO-PUBLICA (status = 'published')
 *   - needs_review  → só warnings  → status = 'pending_review'
 *   - fail          → blocking     → status = 'pending_review'
 *
 * O validador NUNCA recusa nem arquiva. Ele só separa o que vai direto ao ar
 * do que precisa dos seus olhos. A decisão final é sua, no /admin/reports.
 *
 * Usage:  PERIOD=2025-06-01 npx ts-node validate-report.ts
 *         (sem PERIOD → mês atual, mesmo default do generate-report.ts)
 * Env:    ANTHROPIC_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 */

// ─── Config (espelha generate-report.ts) ──────────────────────────────────────

const cfg = {
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  supabaseUrl:  (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:  process.env.SUPABASE_SERVICE_KEY ?? '',
  model:        'claude-sonnet-4-6',
  maxTokens:    4096,
};

const now    = new Date();
const PERIOD = process.env.PERIOD
  ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

// Opt-in: revalidações em lote (ex.: backfill após mudar a regra do judge)
// pedem para NUNCA auto-publicar. Default false preserva o fluxo do pipeline.
const NO_AUTO_PUBLISH = process.env.NO_AUTO_PUBLISH === '1';

const _pi             = parsePeriod(PERIOD);
const PERIOD_END_DATE = `${_pi.end.getFullYear()}-${String(_pi.end.getMonth() + 1).padStart(2, '0')}-${String(_pi.end.getDate()).padStart(2, '0')}`;

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type Severity = 'blocking' | 'warning' | 'info';
type Category = 'deterministic' | 'grounding' | 'temporal' | 'source';
type Verdict  = 'pass' | 'needs_review' | 'fail';

interface Flag {
  id: string;
  severity: Severity;
  category: Category;
  trend_rank: number | null;
  field: string;
  claim: string;
  detail: string;
  lang: 'pt-BR' | 'en' | null;
  // Sugestão do copiloto corretor (subtrativo). null quando não há correção
  // subtrativa honesta possível (requer reescrita manual).
  suggestion_pt?: string | null;
  suggestion_en?: string | null;
  suggestion_reason?: string | null;
  // Sinais do cluster da trend deste flag, anexados na validação para o
  // curador ver evidência sem nova consulta. Title + snippet curto (~300 ch).
  signals?: { id: string; title: string; snippet: string }[];
}

interface ScoreDimension { score: number; label: string }

interface ReportRow {
  id: string;
  period: string;
  report_number: number;
  status: string;
  title_pt_br: string | null;
  title_en: string | null;
  executive_summary_pt_br: string | null;
  executive_summary_en: string | null;
}

interface TrendRow {
  id: string;
  report_id: string;
  rank: number;
  signal_cluster_id: string | null;
  title_pt_br: string;
  title_en: string;
  taime_score: number;
  taime_score_rationale_pt_br: string;
  taime_score_rationale_en: string;
  taime_framework_pt_br: Record<string, unknown> & {
    score_dimensions?: Record<string, ScoreDimension>;
  };
  taime_framework_en: Record<string, unknown> & {
    score_dimensions?: Record<string, ScoreDimension>;
  };
  then_now_next_pt_br: { then?: string; now?: string; next?: string };
  then_now_next_en: { then?: string; now?: string; next?: string };
  org_implications_pt_br: Record<string, string>;
  org_implications_en: Record<string, string>;
  recommended_move_pt_br: string | null;
  recommended_move_en: string | null;
}

interface ClusterRow { id: string; signal_ids: string[] }
interface SignalRow { id: string; title: string; content: string | null; metadata: { snippet?: string } }

interface AnthropicUsage { input_tokens: number; output_tokens: number }

// ─── Supabase REST (idêntico ao generate-report.ts) ───────────────────────────

function dbHeaders(returnData = false) {
  return {
    apikey:         cfg.supabaseKey,
    Authorization:  `Bearer ${cfg.supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer:         returnData ? 'return=representation' : 'return=minimal',
  };
}

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, { headers: dbHeaders(true) });
  if (!res.ok) throw new Error(`DB GET /${path}: ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

async function dbPatch(table: string, id: string, data: unknown): Promise<void> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH', headers: dbHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB PATCH ${table}/${id}: ${await res.text()}`);
}

// ─── Anthropic API ──────────────────────────────────────────────────────────

// PILOT instrumentation: accumulate token usage across all calls in a run.
const _USAGE_TOTAL = { calls: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 };

// Status transitorios da API Anthropic. 529 = Overloaded (o caso que motivou este
// retry): a API esta sobrecarregada e o pedido deve ser repetido depois. Os demais
// (429 rate limit, 5xx de gateway) tambem sao seguros para repetir.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);
// Backoff exponencial: espera generosa antes de cada retry (30s, 60s, 120s). Sao 3
// retries (ate 4 tentativas no total) antes de reportar falha definitiva.
const RETRY_BACKOFF_MS = [30_000, 60_000, 120_000];
const _sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function anthropicPost(body: unknown): Promise<{ text: string; usage: AnthropicUsage }> {
  // Rede final: remove surrogates orfaos de todo o body (todos os prompts do
  // validador passam por aqui) antes de serializar.
  const payload = JSON.stringify(deepStripLoneSurrogates(body));

  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         cfg.anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'prompt-caching-2024-07-31',
      },
      body: payload,
    });

    if (res.ok) {
      const data = await res.json() as { content: Array<{ type: string; text: string }>; usage: AnthropicUsage & { cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
      const text = data.content.find(b => b.type === 'text')?.text ?? '';
      _USAGE_TOTAL.calls++;
      _USAGE_TOTAL.input      += data.usage.input_tokens ?? 0;
      _USAGE_TOTAL.output     += data.usage.output_tokens ?? 0;
      _USAGE_TOTAL.cache_read += data.usage.cache_read_input_tokens ?? 0;
      _USAGE_TOTAL.cache_write += data.usage.cache_creation_input_tokens ?? 0;
      return { text, usage: data.usage };
    }

    const errText = await res.text();
    // Retry so em status transitorios (529 Overloaded incluido) e enquanto houver
    // backoff restante. Erros permanentes (400, 401, 404...) falham na hora.
    if (RETRYABLE_STATUS.has(res.status) && attempt < RETRY_BACKOFF_MS.length) {
      const wait = RETRY_BACKOFF_MS[attempt];
      console.warn(`  ⏳ Anthropic ${res.status} (overload/transitorio). Retry ${attempt + 1}/${RETRY_BACKOFF_MS.length} em ${wait / 1000}s...`);
      await _sleep(wait);
      continue;
    }
    throw new Error(`Anthropic API (${res.status}): ${errText}`);
  }
}

function _printUsageTotal(): void {
  console.log('\n[USAGE TOTAL] calls=' + _USAGE_TOTAL.calls +
    ' input=' + _USAGE_TOTAL.input +
    ' output=' + _USAGE_TOTAL.output +
    ' cache_read=' + _USAGE_TOTAL.cache_read +
    ' cache_write=' + _USAGE_TOTAL.cache_write);
}

// Sanitiza caracteres de controle (U+0000..U+001F) que aparecem LITERAIS dentro
// de valores string do JSON. Caso comum: o judge cita um trecho do relatório
// que contém '\n' literal no meio do valor da chave "claim" ou "detail", o que
// quebra JSON.parse estrito. Faz toggle de "in string" rastreando aspas não
// escapadas; só substitui dentro de strings, sem corromper a estrutura.
function sanitizeControlChars(text: string): string {
  let out      = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\' && i + 1 < text.length) {
        // sequência de escape: copia o par como está
        out += c + text[i + 1];
        i++;
        continue;
      }
      if (c === '"') {
        out += c;
        inString = false;
        continue;
      }
      const code = c.charCodeAt(0);
      if (code < 0x20) {
        switch (c) {
          case '\n': out += '\\n'; break;
          case '\r': out += '\\r'; break;
          case '\t': out += '\\t'; break;
          case '\b': out += '\\b'; break;
          case '\f': out += '\\f'; break;
          default:   out += '\\u' + code.toString(16).padStart(4, '0'); break;
        }
        continue;
      }
      out += c;
    } else {
      if (c === '"') {
        out += c;
        inString = true;
        continue;
      }
      out += c;
    }
  }
  return out;
}

function parseJsonSafe<T>(raw: string, label: string): T {
  let text = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const start    = text.indexOf('{');
  const startArr = text.indexOf('[');
  const cut      = startArr !== -1 && (startArr < start || start === -1) ? startArr : start;
  if (cut > 0) text = text.slice(cut);

  // Tentativa 1: parse direto (caminho rápido, caso o judge tenha cumprido).
  try { return JSON.parse(text) as T; } catch {}

  // Tentativa 2 (Camada 1): sanitiza control chars literais dentro de strings
  // e tenta de novo. Cobre o "Bad control character in string literal" que
  // aparece quando o judge cita texto do relatório com quebras de linha cruas.
  const sanitized = sanitizeControlChars(text);
  try { return JSON.parse(sanitized) as T; }
  catch (e) {
    throw new Error(`JSON inválido [${label}]: ${e}\n${sanitized.slice(0, 300)}`);
  }
}

// ─── Helpers de coleta de texto da trend ──────────────────────────────────────

const SCORE_DIMS = [
  'market_maturity', 'competitive_pressure', 'strategic_impact',
  'execution_complexity', 'competitive_lag_risk',
] as const;

/** Todos os campos textuais de uma trend, num idioma, com o caminho do campo. */
function trendTextFields(t: TrendRow, lang: 'pt-BR' | 'en'): Array<{ field: string; text: string }> {
  const fw  = lang === 'pt-BR' ? t.taime_framework_pt_br : t.taime_framework_en;
  const tnn = lang === 'pt-BR' ? t.then_now_next_pt_br    : t.then_now_next_en;
  const org = lang === 'pt-BR' ? t.org_implications_pt_br : t.org_implications_en;
  const sfx = lang === 'pt-BR' ? '_pt_br' : '_en';

  const out: Array<{ field: string; text: string }> = [];
  const push = (field: string, v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push({ field, text: v });
  };

  push(`title${sfx}`, lang === 'pt-BR' ? t.title_pt_br : t.title_en);
  push(`taime_score_rationale${sfx}`, lang === 'pt-BR' ? t.taime_score_rationale_pt_br : t.taime_score_rationale_en);
  for (const k of ['type', 'act', 'impact', 'move', 'exit', 'counter_thesis', 'contra_tese', 'executive_snapshot', 'confidence_basis', 'limitations']) {
    push(`taime_framework${sfx}.${k}`, fw?.[k]);
  }
  for (const k of ['then', 'now', 'next'] as const) push(`then_now_next${sfx}.${k}`, tnn?.[k]);
  for (const k of Object.keys(org ?? {})) push(`org_implications${sfx}.${k}`, org[k]);
  push(`recommended_move${sfx}`, lang === 'pt-BR' ? t.recommended_move_pt_br : t.recommended_move_en);
  return out;
}

/**
 * Lê o texto PT e EN de um campo de uma trend, a partir do field path do flag
 * (ex "taime_framework_en.executive_snapshot" → base "taime_framework", key "executive_snapshot").
 * Retorna o texto nos dois idiomas (para o corretor ter contexto completo).
 */
function readFieldBothLangs(t: TrendRow, field: string): { pt: string; en: string } {
  const [columnPart, jsonKey] = field.split('.');
  // remove o sufixo de idioma para achar a base
  const base = columnPart.replace(/_pt_br$|_en$/, '');
  const get = (lang: 'pt-BR' | 'en'): string => {
    const sfx = lang === 'pt-BR' ? '_pt_br' : '_en';
    switch (base) {
      case 'title': return (lang === 'pt-BR' ? t.title_pt_br : t.title_en) ?? '';
      case 'taime_score_rationale': return (lang === 'pt-BR' ? t.taime_score_rationale_pt_br : t.taime_score_rationale_en) ?? '';
      case 'recommended_move': return (lang === 'pt-BR' ? t.recommended_move_pt_br : t.recommended_move_en) ?? '';
      case 'taime_framework': {
        const fw = lang === 'pt-BR' ? t.taime_framework_pt_br : t.taime_framework_en;
        const v = jsonKey ? fw?.[jsonKey] : undefined;
        return typeof v === 'string' ? v : '';
      }
      case 'then_now_next': {
        const tnn = lang === 'pt-BR' ? t.then_now_next_pt_br : t.then_now_next_en;
        const v = jsonKey ? (tnn as Record<string, string>)?.[jsonKey] : undefined;
        return typeof v === 'string' ? v : '';
      }
      case 'org_implications': {
        const org = lang === 'pt-BR' ? t.org_implications_pt_br : t.org_implications_en;
        const v = jsonKey ? org?.[jsonKey] : undefined;
        return typeof v === 'string' ? v : '';
      }
      default: { void sfx; return ''; }
    }
  };
  return { pt: get('pt-BR'), en: get('en') };
}

/** Um flag é "corrigível" pelo copiloto se aponta um campo de trend real. */
function isCorrectable(flag: Flag): boolean {
  if (flag.trend_rank == null) return false;          // erros de parse, nível relatório
  if (flag.field === '(judge)' || flag.field === '(unknown)') return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NÍVEL 1 — Checks determinísticos (sem LLM)
// ═══════════════════════════════════════════════════════════════════════════════

// Nota: a checagem de nomes de fonte saiu do nível determinístico (regex não
// distingue "Microsoft lançou X" — sujeito legítimo — de "segundo a Microsoft" —
// atribuição proibida). Essa regra agora vive no JUDGE_SYSTEM (nível LLM), que
// entende o papel do nome na frase. Ver REFINAMENTO 1.

// Símbolos / padrões monetários.
const MONETARY_RE = /(R\$|US\$|U\$|\bUSD\b|\bBRL\b|\bEUR\b|€|\bsalár|\bbudget of|\$\s?\d)/i;

function deterministicChecks(report: ReportRow, trends: TrendRow[]): Flag[] {
  const flags: Flag[] = [];

  for (const t of trends) {
    // ── Scores PT = EN ────────────────────────────────────────────────────────
    const ptDims = t.taime_framework_pt_br?.score_dimensions;
    const enDims = t.taime_framework_en?.score_dimensions;
    for (const dim of SCORE_DIMS) {
      const ptS = ptDims?.[dim]?.score;
      const enS = enDims?.[dim]?.score;
      if (ptS !== undefined && enS !== undefined && ptS !== enS) {
        flags.push({
          id: 'score_mismatch', severity: 'blocking', category: 'deterministic',
          trend_rank: t.rank, field: `score_dimensions.${dim}`,
          claim: `${dim}`, detail: `Score PT (${ptS}) diverge do EN (${enS}). Devem ser idênticos.`,
          lang: null,
        });
      }
    }

    // ── Em dash + valores monetários em todos os campos ───────────────────────
    // (nomes de fonte agora são auditados pelo juiz LLM — ver JUDGE_SYSTEM)
    for (const lang of ['pt-BR', 'en'] as const) {
      for (const { field, text } of trendTextFields(t, lang)) {
        if (text.includes('—')) {
          flags.push({
            id: 'em_dash', severity: 'warning', category: 'deterministic',
            trend_rank: t.rank, field,
            claim: text.slice(0, 160), detail: 'Em dash (—) no meio de frase. Usar vírgula ou ponto.',
            lang,
          });
        }
        if (MONETARY_RE.test(text)) {
          flags.push({
            id: 'monetary', severity: 'warning', category: 'deterministic',
            trend_rank: t.rank, field,
            claim: text.slice(0, 160), detail: 'Possível valor monetário. TAIME dá direção, não sizing financeiro.',
            lang,
          });
        }
      }
    }
  }

  // Checa também os campos de nível de relatório (título + resumo executivo)
  const reportFields: Array<{ field: string; text: string | null; lang: 'pt-BR' | 'en' }> = [
    { field: 'title_pt_br', text: report.title_pt_br, lang: 'pt-BR' },
    { field: 'title_en', text: report.title_en, lang: 'en' },
    { field: 'executive_summary_pt_br', text: report.executive_summary_pt_br, lang: 'pt-BR' },
    { field: 'executive_summary_en', text: report.executive_summary_en, lang: 'en' },
  ];
  for (const { field, text, lang } of reportFields) {
    if (!text) continue;
    if (text.includes('—')) {
      flags.push({
        id: 'em_dash', severity: 'warning', category: 'deterministic',
        trend_rank: null, field, claim: text.slice(0, 160),
        detail: 'Em dash (—) no meio de frase.', lang,
      });
    }
  }

  return flags;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NÍVEL 2 + 3 — Grounding + temporal (LLM-as-judge, contexto isolado)
// ═══════════════════════════════════════════════════════════════════════════════

const JUDGE_SYSTEM = `\
You are an independent fact-checker auditing a strategic intelligence report.
You did NOT write this report. Your only job is to verify, never to improve or rewrite it.

You receive: (a) the raw signals collected for a time period, and (b) factual claims
extracted from the report. For each claim, decide whether the SIGNALS support it.

GROUNDING — classify each claim:
  "supported"   : the claim's factual content (company names, products, numbers,
                  events, statistics) is directly traceable to the signals.
  "partial"     : partially grounded but adds specifics not present in the signals.
  "unsupported" : the claim asserts facts that do NOT appear in any signal.

Interpretive/analytical language ("this suggests", "leaders should") is NOT a factual
claim — judge only the factual assertions embedded in it. A claim that is purely
strategic opinion with no invented facts is "supported".

OUT OF SCOPE — do NOT audit the TAIME Score or its five dimension sub-scores
(market_maturity, competitive_pressure, strategic_impact, execution_complexity,
competitive_lag_risk). These numbers are TAIME's expert analytical judgment, not facts
to be traced to signals. Ignore them entirely. Do NOT flag a claim merely because it
states or interprets one of these scores (e.g. "competitive pressure is the dominant
driver at 89" is analytical framing, not a factual claim — do not flag it).
Still audit every OTHER factual assertion normally.

TEMPORAL — separately, flag any claim that references events, data, or outcomes that
occurred AFTER the period end date (hindsight), or that an analyst writing on that date
could not have known.

SOURCE ATTRIBUTION — flag any text that reveals a named firm AS THE SOURCE of the
report's information, which exposes TAIME's editorial method. The distinction is the
ROLE the name plays in the sentence:
  ALLOWED   — the named entity is the SUBJECT/actor of a fact: "Microsoft is testing
              quantum computing for...", "Gartner ran trials with...", "Deloitte uses
              AI to generate...". The name is part of the news itself. Do NOT flag.
  FORBIDDEN — a named research/consulting firm is cited as the SOURCE or attribution of
              a claim: "according to Gartner", "per McKinsey's data", "our source IDC
              indicates", "as reported by Forrester", "based on PwC figures". This leaks
              where TAIME got its information. FLAG it.
This applies especially to research and consulting firms (Gartner, McKinsey, Forrester,
IDC, HBR, Bain, BCG, Deloitte, KPMG, PwC, and similar). When in doubt, judge by whether
removing the firm name would destroy a fact (then it is subject, ALLOW) or merely remove
a citation (then it is attribution, FLAG).
EXEMPTION — the confidence_basis field is REQUIRED to describe sources by CATEGORY
(e.g. "global strategic consulting firms", "academic research centers", "investment
research firms"). Describing sources by category is the CORRECT, mandated format and
must NEVER be flagged as source attribution. Only flag confidence_basis if it names a
SPECIFIC firm (e.g. "Gartner", "McKinsey"). Generic category descriptions are always allowed.

Be precise and conservative. Do NOT flag a claim as unsupported just because the wording
differs from the signal — match on factual substance. Only flag genuine invention.

Return VALID JSON ONLY, an array. One object per claim you find problematic
(supported claims are omitted to keep output small). All string values must
escape internal newlines, tabs and quotes. When quoting text from the report,
paraphrase or truncate to avoid control characters:
[
  {
    "field": "<the field path given>",
    "verdict": "partial" | "unsupported" | "temporal_breach" | "source_attribution",
    "claim": "<short quote of the problematic assertion>",
    "detail": "<one sentence: what fact is missing, what is hindsight, or what source is leaked>"
  }
]
If every claim is supported, temporally sound, and free of source attribution, return [].`;

function buildSignalsBlock(signals: SignalRow[]): string {
  return signals.map((s, i) => {
    const body = (s.content || s.metadata?.snippet || '').slice(0, 500);
    return `[${i + 1}] ${s.title}\n    ${body || '(sem conteúdo)'}`;
  }).join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// COPILOTO CORRETOR — sugere correção SUBTRATIVA para um campo flagueado
// ═══════════════════════════════════════════════════════════════════════════════

const CORRECTOR_SYSTEM = `\
You are a REMOVAL EDITOR for a finished strategic intelligence report.
The report is already done. A validator (the judge) has identified one specific problem.
Your only job is to RETURN THE ORIGINAL TEXT MINUS THE PROBLEM, never the original text
PLUS anything.

YOU ARE FORBIDDEN TO:
- Introduce any content word (noun, proper name, number, date, place, statistic, percentage,
  monetary value) that does not already exist in the current text or appear literally in the
  signals provided.
- Swap a named source for another source, or for an "equivalent" invented fact.
- Improve, enrich, exemplify, or rewrite the passage.
- Reference anything after the period end date.

DECISION HIERARCHY (try in order, stop at the first that works):
(A) REMOVE the flagged span while keeping the sentence standing. Delete the problematic
    name/number/date/clause; adjust only minimal connectors so the grammar closes.
    Ex.: "...according to Gartner's research" -> remove the attribution, the sentence survives.
    Ex.: "...through tools like FraudGPT" -> remove the mention, keep the rest.
(B) If pure removal breaks the sentence, SOFTEN/DOWNGRADE the assertion using ONLY words
    already present in the original text or in the provided signals. Downgrade means asserting
    LESS, never asserting something different.
    Ex.: "competitors already run X in production" (signal does not confirm "already run") ->
         "organizations with reliable data build the foundation to run X in production".
(C) If the flagged assertion IS the core of the sentence and has no basis in the signals,
    REMOVE THE WHOLE SENTENCE (or clause). A shorter true paragraph beats a richer false one.
    The trend's context does not depend on a single sentence.

GOLDEN RULE: the set of content words in your suggestion must be a SUBSET of the content words
in the original text (plus, at most, terms that appear literally in the provided signals). If
you need a new content word to "save" the sentence, then the correct answer is option (C):
remove the sentence.

If NONE of A/B/C yields an honest, subtractive result, return null and explain why. Do not
invent a correction.

LANGUAGE SCOPE: fix ONLY the language(s) actually flagged. PT and EN may differ naturally in
phrasing, do NOT force them to mirror each other. Only align them if the flag itself is about
a factual divergence between the two languages.

NO EM DASH. Do not introduce em dash; use commas or periods.

Return VALID JSON ONLY:
{
  "suggestion_pt": "<corrected PT text, or null if PT was not flagged or has no subtractive fix>",
  "suggestion_en": "<corrected EN text, or null if EN was not flagged or has no subtractive fix>",
  "reason": "<one short sentence in Portuguese explaining what you changed and why it resolves the flag>"
}`;

// ─── Guarda determinística: rejeita sugestão que introduza conteúdo novo ────────
// Mesmo princípio do em dash: a regra crítica vive no código, não só no prompt.

/** Extrai tokens de conteúdo "perigosos": números/%/valores/anos e nomes próprios
 *  (palavra Capitalizada no meio da frase). Heurística conservadora. */
function contentTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  if (!text) return tokens;
  // números, percentuais, valores, anos, com sufixos comuns de magnitude
  const numeric = text.match(
    /\$?\s?\d[\d.,]*\s*(%|bilh[õo]es?|milh[õo]es?|billion|million|mil)?/gi,
  ) || [];
  for (const n of numeric) tokens.add(n.toLowerCase().replace(/\s+/g, ''));
  // nomes próprios: Capitalizada precedida de minúscula/vírgula+espaço (dentro da frase)
  const proper = text.match(/(?<=[a-zà-ú0-9,]\s)[A-ZÀ-Ú][A-Za-zÀ-ú]{2,}/g) || [];
  for (const p of proper) tokens.add(p.toLowerCase());
  return tokens;
}

/** Tokens de conteúdo na sugestão que NÃO estão no original nem nos sinais. */
function novelContentTokens(suggestion: string, original: string, signalsText: string): string[] {
  const allowed = new Set<string>([
    ...contentTokens(original),
    ...contentTokens(signalsText),
  ]);
  const novel: string[] = [];
  for (const t of contentTokens(suggestion)) {
    if (!allowed.has(t)) novel.push(t);
  }
  return novel;
}

/** Aplica a regra subtrativa de forma determinística. Se a sugestão introduziu
 *  conteúdo novo, descarta e tenta remoção literal do trecho flagado; se nem isso
 *  for possível com segurança, devolve null (correção manual). */
function enforceSubtractive(
  suggestion: string | null,
  original: string,
  signalsText: string,
  flaggedSpan: string,
): { value: string | null; note?: string } {
  if (!suggestion) return { value: null };
  const novel = novelContentTokens(suggestion, original, signalsText);
  if (novel.length === 0) return { value: suggestion };

  // Sugestão reprovada: tentar remoção literal do trecho flagado (opção A pura).
  if (flaggedSpan && original.includes(flaggedSpan)) {
    const stripped = original.replace(flaggedSpan, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').trim();
    if (stripped && stripped !== original) {
      return {
        value: stripped,
        note: `Sugestão do corretor introduziu termo(s) novo(s) [${novel.join(', ')}] e foi descartada; aplicada remoção literal do trecho flagado.`,
      };
    }
  }
  return {
    value: null,
    note: `Sugestão introduziu termo(s) novo(s) [${novel.join(', ')}] e o trecho não pôde ser removido automaticamente. Corrija manualmente.`,
  };
}

interface Suggestion { suggestion_pt: string | null; suggestion_en: string | null; reason: string }

/**
 * Gera uma sugestão de correção subtrativa para um flag.
 * Recebe o texto atual PT e/ou EN do campo (o que existir), o flag, os sinais e o boundary.
 * Retorna sugestão por idioma (null no idioma não flagueado ou sem correção possível).
 */
async function suggestCorrection(
  flag: Flag,
  currentPt: string,
  currentEn: string,
  signals: SignalRow[],
): Promise<Suggestion | null> {
  const signalsBlock = buildSignalsBlock(signals);
  const user =
    `PERIOD END DATE (hard temporal boundary): ${PERIOD_END_DATE}\n\n` +
    `═══ FLAG ═══\n` +
    `Category: ${flag.category}\n` +
    `Field: ${flag.field}\n` +
    `Reason it was flagged: ${flag.detail}\n` +
    `Problematic excerpt: "${flag.claim}"\n\n` +
    `═══ CURRENT TEXT ═══\n` +
    `PT (${currentPt ? 'flagged or present' : 'not present'}): ${currentPt || '(n/a)'}\n\n` +
    `EN (${currentEn ? 'flagged or present' : 'not present'}): ${currentEn || '(n/a)'}\n\n` +
    `═══ SIGNALS FOR THIS PERIOD ═══\n${signalsBlock}\n\n` +
    `Propose a subtractive correction following the strict rules. Return the JSON.`;

  try {
    const { text } = await anthropicPost({
      model:      cfg.model,
      max_tokens: 2048,
      system: [{ type: 'text', text: CORRECTOR_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    });
    const parsed = parseJsonSafe<Suggestion>(text, `corrector:${flag.field}`);
    // Garante que em dash não vaze na sugestão (defesa extra).
    const clean = (v: string | null) =>
      typeof v === 'string'
        ? v.replace(/(\d)\s*\u2014\s*(\d)/g, '$1-$2').replace(/\s*\u2014\s*/g, ', ')
        : null;
    return {
      suggestion_pt: clean(parsed.suggestion_pt),
      suggestion_en: clean(parsed.suggestion_en),
      reason: parsed.reason || '',
    };
  } catch {
    return null; // falha do corretor não quebra a validação; flag fica sem sugestão
  }
}

async function groundingCheck(
  trend: TrendRow,
  signals: SignalRow[],
): Promise<Flag[]> {
  // Junta os campos PT e EN. Como scores PT=EN é checado no nível 1, basta auditar
  // o conteúdo factual uma vez por idioma (fatos devem ser os mesmos nos dois).
  const claims = [
    ...trendTextFields(trend, 'pt-BR').map(f => ({ ...f, lang: 'pt-BR' as const })),
    ...trendTextFields(trend, 'en').map(f => ({ ...f, lang: 'en' as const })),
  ];

  const claimsBlock = claims
    .map((c, i) => `(${i + 1}) [${c.field}]: ${c.text}`)
    .join('\n\n');

  const signalsBlock = buildSignalsBlock(signals);

  const user =
    `PERIOD END DATE (hard temporal boundary): ${PERIOD_END_DATE}\n\n` +
    `═══ SIGNALS COLLECTED FOR THIS PERIOD (${signals.length} total) ═══\n\n` +
    `${signalsBlock}\n\n` +
    `═══ CLAIMS EXTRACTED FROM THE REPORT (trend rank ${trend.rank}) ═══\n\n` +
    `${claimsBlock}\n\n` +
    `Audit every claim against the signals and the temporal boundary. Return the JSON array.`;

  const { text } = await anthropicPost({
    model:      cfg.model,
    max_tokens: cfg.maxTokens,
    system: [{ type: 'text', text: JUDGE_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        // sinais cacheados — reusados entre as trends do mesmo relatório
        { type: 'text', text: `PERIOD ${PERIOD} SIGNALS`, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: user },
      ],
    }],
  });

  type JudgeItem = { field: string; verdict: string; claim: string; detail: string };
  let items: JudgeItem[] = [];
  try {
    items = parseJsonSafe<JudgeItem[]>(text, `judge:trend${trend.rank}`);
  } catch {
    // Camada 2: nem o parse direto nem a sanitização (Camada 1) salvaram.
    // UMA retentativa corretiva, com instrução explícita de escapar control
    // chars. Só dispara no caminho de erro (custo extra apenas neste caso).
    try {
      const correctiveNote =
        '\n\nYour previous response was not valid JSON. Return ONLY a valid JSON array, ' +
        'with all string values properly escaped (no literal newlines, tabs or unescaped ' +
        'quotes inside strings). No prose, no markdown.';
      const { text: retryText } = await anthropicPost({
        model:      cfg.model,
        max_tokens: cfg.maxTokens,
        system: [{ type: 'text', text: JUDGE_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `PERIOD ${PERIOD} SIGNALS`, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: user + correctiveNote },
          ],
        }],
      });
      items = parseJsonSafe<JudgeItem[]>(retryText, `judge:trend${trend.rank}:retry`);
    } catch {
      return [{
        id: 'judge_parse_error', severity: 'warning', category: 'grounding',
        trend_rank: trend.rank, field: '(judge)', claim: '',
        detail: 'Validador não retornou JSON parseável após retentativa; revisar manualmente.', lang: null,
      }];
    }
  }

  return items.map(it => {
    const isTemporal = it.verdict === 'temporal_breach';
    const isSource   = it.verdict === 'source_attribution';
    let id: string;
    let severity: Severity;
    let category: Category;
    if (isSource) {
      id = 'source_name'; severity = 'blocking'; category = 'source';
    } else if (isTemporal) {
      id = 'temporal_breach'; severity = 'blocking'; category = 'temporal';
    } else if (it.verdict === 'unsupported') {
      id = 'unsupported_claim'; severity = 'blocking'; category = 'grounding';
    } else {
      id = 'partially_supported'; severity = 'warning'; category = 'grounding';
    }
    return {
      id,
      severity,
      category,
      trend_rank: trend.rank,
      field: it.field || '(unknown)',
      claim: (it.claim || '').slice(0, 200),
      detail: it.detail || '',
      lang: null,
    } as Flag;
  });
}

// ─── Veredito + persistência ───────────────────────────────────────────────────

function computeVerdict(flags: Flag[]): Verdict {
  if (flags.some(f => f.severity === 'blocking')) return 'fail';
  if (flags.some(f => f.severity === 'warning'))  return 'needs_review';
  return 'pass';
}

/**
 * Valida UM relatório já persistido e decide seu destino.
 * Esta é a função plugável: chame-a passando o report.id logo após o persistReport.
 */
export async function validatePersistedReport(
  reportId: string,
  opts?: { onlyRanks?: number[] },
): Promise<{
  verdict: Verdict; flags: Flag[]; signalCount: number;
}> {
  // onlyRanks: revalida SOMENTE as trends destes ranks e PRESERVA os flags
  // existentes das demais trends e do nivel-relatorio. Usado para reprocessar
  // trends que falharam (ex: 529 no judge) sem tocar nas que ja validaram.
  const onlyRanks = opts?.onlyRanks && opts.onlyRanks.length ? opts.onlyRanks : null;

  const [report] = await dbGet<ReportRow>(`reports?id=eq.${reportId}&select=*`);
  if (!report) throw new Error(`Relatório ${reportId} não encontrado.`);

  const allTrends = await dbGet<TrendRow>(`report_trends?report_id=eq.${reportId}&select=*&order=rank.asc`);
  const trends = onlyRanks ? allTrends.filter(t => onlyRanks.includes(t.rank)) : allTrends;
  if (onlyRanks && trends.length !== onlyRanks.length) {
    console.warn(`  ⚠ onlyRanks=[${onlyRanks.join(',')}] mas encontrei ${trends.length} trend(s): ${trends.map(t => t.rank).join(',')}`);
  }

  // Sinais do período (para grounding e para o signal_count do painel).
  const clusters = await dbGet<ClusterRow>(`signal_clusters?period=eq.${report.period}&select=id,signal_ids`);
  const allIds = [...new Set(clusters.flatMap(c => c.signal_ids ?? []))];
  const signalMap = new Map<string, SignalRow>();
  for (let i = 0; i < allIds.length; i += 100) {
    const ids = allIds.slice(i, i + 100).map(id => `"${id}"`).join(',');
    if (!ids) continue;
    const rows = await dbGet<SignalRow>(`signals?id=in.(${ids})&select=id,title,content,metadata`);
    for (const s of rows) signalMap.set(s.id, s);
  }
  const allSignals = [...signalMap.values()];
  const signalCount = allSignals.length;

  // NÍVEL 1 (deterministico). Com onlyRanks, descarta os flags de nível-relatorio
  // deste run (sao preservados dos existentes) e mantem so os das trends alvo.
  let flags: Flag[] = deterministicChecks(report, trends);
  if (onlyRanks) flags = flags.filter(f => f.trend_rank != null && onlyRanks.includes(f.trend_rank));

  // NÍVEL 2+3 — grounding + temporal, uma chamada por trend (sinais ficam cacheados)
  for (const t of trends) {
    // sinais do cluster específico desta trend (fallback: todos do período)
    const cluster = clusters.find(c => c.id === t.signal_cluster_id);
    const trendSignals = cluster
      ? cluster.signal_ids.map(id => signalMap.get(id)).filter((s): s is SignalRow => !!s)
      : allSignals;
    try {
      const judged = await groundingCheck(t, trendSignals.length ? trendSignals : allSignals);
      flags.push(...judged);
    } catch (e) {
      flags.push({
        id: 'judge_error', severity: 'warning', category: 'grounding',
        trend_rank: t.rank, field: '(judge)', claim: '',
        detail: `Falha ao validar trend ${t.rank}: ${e}. Revisar manualmente.`, lang: null,
      });
    }
  }

  // ── COPILOTO CORRETOR + ANEXO DE SINAIS POR FLAG ────────────────────────────
  // Roda durante a validação (sinais já carregados). Anexa os sinais do cluster
  // a cada flag (para o curador ver evidência no /admin) e, se o flag for
  // corrigível, pede sugestão subtrativa ao LLM. 1 chamada LLM por flag corrigível.
  for (const flag of flags) {
    const t = flag.trend_rank != null
      ? trends.find(tr => tr.rank === flag.trend_rank)
      : undefined;

    let usedSignals: SignalRow[] = [];
    if (t) {
      const cluster = clusters.find(c => c.id === t.signal_cluster_id);
      const trendSignals = cluster
        ? cluster.signal_ids.map(id => signalMap.get(id)).filter((s): s is SignalRow => !!s)
        : allSignals;
      usedSignals = trendSignals.length ? trendSignals : allSignals;

      // Anexa sinais ao flag (deduplicado por id, snippet ~300 chars).
      const seen = new Set<string>();
      const attached: { id: string; title: string; snippet: string }[] = [];
      for (const s of usedSignals) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        const snippet = (s.content || s.metadata?.snippet || '').slice(0, 300).trim();
        attached.push({ id: s.id, title: s.title, snippet });
      }
      flag.signals = attached;
    }

    if (!isCorrectable(flag) || !t) continue;

    const { pt, en } = readFieldBothLangs(t, flag.field);
    const sug = await suggestCorrection(flag, pt, en, usedSignals);
    if (sug) {
      // Guarda determinística: a sugestão tem de ser estritamente subtrativa.
      // Se introduziu conteúdo novo, é descartada e cai para remoção literal
      // do trecho flagado (ou null + correção manual).
      const signalsText = buildSignalsBlock(usedSignals);
      const guardedPt = enforceSubtractive(sug.suggestion_pt, pt, signalsText, flag.claim);
      const guardedEn = enforceSubtractive(sug.suggestion_en, en, signalsText, flag.claim);
      flag.suggestion_pt     = guardedPt.value;
      flag.suggestion_en     = guardedEn.value;
      flag.suggestion_reason = [sug.reason, guardedPt.note, guardedEn.note]
        .filter(Boolean)
        .join(' ');
    }
  }

  // Merge: com onlyRanks, preserva os flags existentes das OUTRAS trends e do
  // nivel-relatorio (as que ja validaram), substituindo apenas os das trends alvo.
  let finalFlags = flags;
  if (onlyRanks) {
    const existing = (report as unknown as { validation_flags?: Flag[] | null }).validation_flags ?? [];
    const kept = (Array.isArray(existing) ? existing : [])
      .filter(f => f.trend_rank == null || !onlyRanks.includes(f.trend_rank));
    finalFlags = [...kept, ...flags];
  }

  const verdict = computeVerdict(finalFlags);

  // ── Destino ──────────────────────────────────────────────────────────────────
  // pass limpo → auto-publica. Qualquer flag → pending_review (você decide).
  // NO_AUTO_PUBLISH=1 desliga a auto-publicação (revalidação em lote, curadoria
  // sempre manual): mesmo um veredito pass deixa o relatório em pending_review.
  const patch: Record<string, unknown> = {
    validation_verdict: verdict,
    validation_flags:   finalFlags,
    validated_at:       new Date().toISOString(),
    signal_count:       signalCount,
  };
  if (verdict === 'pass' && !NO_AUTO_PUBLISH) {
    patch.status       = 'published';
    patch.published_at = new Date().toISOString();
  } else {
    patch.status = 'pending_review';
  }
  await dbPatch('reports', reportId, patch);

  return { verdict, flags: finalFlags, signalCount };
}

// ─── CLI: valida todos os relatórios do PERIOD ─────────────────────────────────

async function main(): Promise<void> {
  const missing = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(k => !process.env[k]);
  if (missing.length) { console.error(`\n✗ Variáveis faltando: ${missing.join(', ')}\n`); process.exit(1); }

  console.log('\n╔══════════════════════════════════╗');
  console.log('║   TAIME — Report Validator       ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Período:  ${PERIOD}`);
  console.log(`Boundary: ${PERIOD_END_DATE}\n`);

  // ── Alvo pontual: REPORT_ID (+ ONLY_RANKS opcional) ────────────────────────
  // Revalida SO um relatorio; com ONLY_RANKS, so as trends listadas, preservando
  // as demais. Usado para reprocessar trends que falharam (ex: 529 no judge).
  const TARGET_REPORT_ID = process.env.REPORT_ID?.trim();
  const ONLY_RANKS = process.env.ONLY_RANKS
    ? process.env.ONLY_RANKS.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n))
    : null;

  if (TARGET_REPORT_ID) {
    console.log(`Alvo: report_id=${TARGET_REPORT_ID}${ONLY_RANKS ? ` · ranks=${ONLY_RANKS.join(',')}` : ''}\n`);
    const { verdict, flags, signalCount } = await validatePersistedReport(
      TARGET_REPORT_ID,
      ONLY_RANKS ? { onlyRanks: ONLY_RANKS } : undefined,
    );
    const ranks = ONLY_RANKS
      ?? [...new Set(flags.map(f => f.trend_rank).filter((r): r is number => r != null))].sort((a, b) => a - b);

    console.log(`Veredito do relatório: ${verdict.toUpperCase()} · sinais no período: ${signalCount}\n`);
    console.log('Por trend revalidada:');
    for (const rank of ranks) {
      const tf = flags.filter(f => f.trend_rank === rank);
      const blocking = tf.filter(f => f.severity === 'blocking').length;
      const warning  = tf.filter(f => f.severity === 'warning').length;
      const failed   = tf.filter(f => f.id === 'judge_error');
      const status   = failed.length ? '⚠ AINDA FALHOU (judge_error)' : '✓ validou';
      console.log(`  trend ${rank}: ${blocking} bloqueante(s), ${warning} aviso(s)  ${status}`);
      for (const f of tf) {
        console.log(`       · [${f.severity}] ${f.id}${f.field ? ` ${f.field}` : ''}: ${(f.detail || '').slice(0, 140)}`);
      }
    }
    console.log('\n' + '═'.repeat(52) + '\n');
    _printUsageTotal();
    return;
  }

  // Valida relatórios que ainda não foram ao ar definitivamente.
  // Pega 'generating' (acabou de sair do pipeline) e 'pending_review' (re-validação).
  const reports = await dbGet<ReportRow>(
    `reports?period=eq.${PERIOD}&status=in.(generating,pending_review,draft)&select=id,report_number,status&order=report_number.asc`,
  );

  if (reports.length === 0) {
    console.log('Nenhum relatório aguardando validação neste período.\n');
    console.log('(O validador processa status: generating, pending_review, draft.)\n');
    return;
  }

  for (const r of reports) {
    console.log(`\n▶ Validando relatório (parte ${r.report_number}, id ${r.id.slice(0, 8)})...`);
    const { verdict, flags, signalCount } = await validatePersistedReport(r.id);

    const blocking = flags.filter(f => f.severity === 'blocking').length;
    const warning  = flags.filter(f => f.severity === 'warning').length;

    const icon = verdict === 'pass' ? '✓' : verdict === 'fail' ? '✗' : '⚠';
    console.log(`  ${icon} Veredito: ${verdict.toUpperCase()}`);
    console.log(`     Sinais no período: ${signalCount}`);
    console.log(`     Flags: ${blocking} bloqueantes, ${warning} avisos`);
    if (verdict === 'pass' && !NO_AUTO_PUBLISH) {
      console.log('     → AUTO-PUBLICADO');
    } else if (verdict === 'pass') {
      console.log('     → pass limpo (sem auto-publicar: NO_AUTO_PUBLISH=1)');
    } else {
      console.log('     → pending_review (revisar em /admin/reports)');
      for (const f of flags.slice(0, 8)) {
        console.log(`       · [${f.severity}] ${f.id} ${f.trend_rank ? `(trend ${f.trend_rank})` : ''} — ${f.detail}`);
      }
      if (flags.length > 8) console.log(`       … +${flags.length - 8} flags (ver painel)`);
    }
  }
  console.log('\n' + '═'.repeat(52) + '\n');
  _printUsageTotal();
}

// Só roda o CLI se executado diretamente (permite importar validatePersistedReport)
if (require.main === module) {
  main().catch(err => { console.error('\n✗ Erro fatal:', err); process.exit(1); });
}
