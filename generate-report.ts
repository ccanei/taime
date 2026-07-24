import 'dotenv/config';
import { parsePeriod } from './period-utils';
import { validatePersistedReport } from './validate-report';
import { stripLoneSurrogates, deepStripLoneSurrogates } from './sanitize';
/**
 * TAIME — Report Generator
 * Gera relatório executivo em pt-BR e en via Claude Sonnet 4.6
 *
 * FIXES:
 * - BUG 1: Scores idênticos PT = EN. PT gera os valores numéricos;
 *          EN recebe constraints absolutos e os valores são sobrescritos programaticamente.
 * - BUG 2: confidence_basis não revela nomes de fontes — apenas categorias.
 *
 * Usage:  npx ts-node generate-report.ts
 * Env:    ANTHROPIC_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 *         PERIOD (opcional — default: primeiro dia do mês atual)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface Cluster {
  id: string;
  name: string;
  description: string;
  signal_ids: string[];
}

interface Signal {
  id: string;
  title: string;
  content: string;
  metadata: { snippet?: string; published_date?: string };
  sources: { name: string; category: string } | null;
}

interface ScoreDimension { score: number; label: string }

interface TrendAnalysis {
  title: string;
  category: string;
  theme_slug: string;
  executive_snapshot: string;
  taime_score: number;
  taime_score_rationale: string;
  score_dimensions: {
    market_maturity:      ScoreDimension;
    competitive_pressure: ScoreDimension;
    strategic_impact:     ScoreDimension;
    execution_complexity: ScoreDimension;
    competitive_lag_risk: ScoreDimension;
  };
  taime_framework: { type: string; act: string; impact: string; move: string; exit: string; counter_thesis?: string | null; contra_tese?: string | null };
  then_now_next:   { then: string; now: string; next: string };
  org_implications: { leadership: string; technology: string; operations: string; finance: string; people: string };
  decision_triggers: string[];
  recommended_move: string;
  confidence_basis: string;
  limitations: string;
}

interface ReportMetadata { report_title: string; executive_summary: string }

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

// PILOT 2026-06-15: Opus on generation only (revert to claude-sonnet-4-6 to undo).
// 2026-07-01: trocado temporariamente para Sonnet so para gerar o periodo PRESENTE
// 2026-06-16; REVERTIDO para Opus em 2026-07-02 (o batch historico depende de Opus
// para evitar hindsight). Para gerar periodos presentes, usar Sonnet pontualmente.
const GENERATION_MODEL = 'claude-opus-4-8';

const cfg = {
  anthropicKey:        process.env.ANTHROPIC_API_KEY ?? '',
  supabaseUrl:         (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:         process.env.SUPABASE_SERVICE_KEY ?? '',
  model:               GENERATION_MODEL,
  maxTokens:           16000,
  contentPreviewChars: 600,
};

const now    = new Date();
const PERIOD = process.env.PERIOD
  ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

const _pi             = parsePeriod(PERIOD);
const PERIOD_END_DATE = `${_pi.end.getFullYear()}-${String(_pi.end.getMonth() + 1).padStart(2, '0')}-${String(_pi.end.getDate()).padStart(2, '0')}`;
const PERIOD_LABEL_PT = _pi.labelPt;
const PERIOD_LABEL_EN = _pi.labelEn;

// ─── Supabase REST ────────────────────────────────────────────────────────────

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

async function dbPost<T>(table: string, row: unknown, returnData: true): Promise<T[]>;
async function dbPost(table: string, row: unknown, returnData?: false): Promise<void>;
async function dbPost<T>(table: string, row: unknown, returnData = false): Promise<T[] | void> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${table}`, {
    method: 'POST', headers: dbHeaders(returnData), body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`DB POST ${table}: ${await res.text()}`);
  if (returnData) return res.json() as Promise<T[]>;
}

async function dbPatch(table: string, id: string, data: unknown): Promise<void> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH', headers: dbHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB PATCH ${table}/${id}: ${await res.text()}`);
}

// ─── JSON repair ─────────────────────────────────────────────────────────────

// Remove cercas de código e posiciona no primeiro objeto JSON da resposta.
function stripToObject(raw: string): string {
  const text = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Nenhum objeto JSON encontrado na resposta');
  return text.slice(start);
}

function repairJson(raw: string): string {
  let text = stripToObject(raw);
  try { JSON.parse(text); return text; } catch { /* precisa de repair */ }

  let inString = false;
  let escaped  = false;
  const stack: Array<'{' | '['> = [];

  for (const c of text) {
    if (escaped)  { escaped = false; continue; }
    if (inString) {
      if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"')  { inString = true; continue; }
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') { if (stack.length) stack.pop(); }
  }

  let repaired = text.trimEnd().replace(/,\s*$/, '');
  if (inString) repaired += '"';
  const closing: Record<string, string> = { '{': '}', '[': ']' };
  for (let i = stack.length - 1; i >= 0; i--) repaired += closing[stack[i]];
  return repaired;
}

/**
 * Sanitização determinística de strings JSON geradas pelo modelo. Percorre o
 * texto rastreando o estado de string e corrige, DENTRO das strings, as duas
 * classes de defeito que o Opus produz e que quebram o parse (forçando --resume):
 *
 *  1) Caracteres de controle crus (U+0000-U+001F): newline, tab e CR literais no
 *     meio de um texto longo → viram \\n, \\t, \\r ou \\uXXXX. ("Bad control
 *     character in string literal".)
 *  2) Aspas duplas de CONTEÚDO não escapadas dentro de um valor (ex.: o resumo
 *     executivo cita o "meta-enredo" do período). Uma aspa interna crua
 *     dessincroniza o rastreio de string e produz "Expected ',' or '}'..." ou
 *     "Expected double-quoted property name". Distinguimos aspa ESTRUTURAL (que
 *     de fato fecha a string) de aspa de conteúdo por lookahead: é fechamento sse,
 *     ignorando espaços, o próximo caractere for ':' (fim de chave), '}' ou ']'
 *     (fim de valor/container), fim do texto, ou ',' imediatamente seguido de '"'
 *     (fim de valor antes da próxima chave/elemento). Caso contrário é aspa de
 *     conteúdo e é escapada para \\". Assim, JSON já válido passa intacto e o
 *     defeito some sem retry.
 */
export function sanitizeJsonStrings(text: string): string {
  const n = text.length;
  let out = '';
  let inString = false;
  let escaped  = false;

  const isWs = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const skipWs = (from: number): number => {
    let k = from;
    while (k < n && isWs(text[k])) k++;
    return k;
  };
  const charAt = (k: number): string | undefined => (k < n ? text[k] : undefined);

  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }
    // Dentro de string
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r') { out += '\\r'; continue; }
    if (ch === '\t') { out += '\\t'; continue; }
    const code = ch.charCodeAt(0);
    if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue; }
    if (ch === '"') {
      const idx1 = skipWs(i + 1);
      const c1   = charAt(idx1);
      let closing = false;
      if (c1 === undefined || c1 === ':' || c1 === '}' || c1 === ']') {
        closing = true;
      } else if (c1 === ',') {
        const c2 = charAt(skipWs(idx1 + 1));
        if (c2 === '"' || c2 === undefined) closing = true;
      }
      if (closing) { out += '"'; inString = false; }
      else out += '\\"';
      continue;
    }
    out += ch;
  }
  return out;
}

export function parseJsonSafe<T>(raw: string, label: string): T {
  const cleaned = stripToObject(raw);

  // 1) Caminho feliz: já é válido.
  try { return JSON.parse(cleaned) as T; } catch { /* segue p/ sanitização */ }

  // 2) Sanitização determinística de strings (control chars + aspas internas).
  //    Cobre o defeito recorrente do metadata SEM retry.
  const sanitized = sanitizeJsonStrings(cleaned);
  try { return JSON.parse(sanitized) as T; } catch { /* pode estar truncado */ }

  // 3) Reparo estrutural (fecha objetos/arrays/strings truncados) sobre o texto
  //    já sanitizado — assim o rastreio de strings do repair não dessincroniza.
  try { return JSON.parse(repairJson(sanitized)) as T; } catch { /* última tentativa */ }

  // 4) Ordem inversa como rede final: repara primeiro, depois sanitiza.
  try {
    return JSON.parse(sanitizeJsonStrings(repairJson(cleaned))) as T;
  } catch (e) {
    throw new Error(`JSON inválido mesmo após repair [${label}]: ${e}\n${sanitized.slice(0, 400)}`);
  }
}

// ─── Score enforcement ────────────────────────────────────────────────────────

const SCORE_DIMS = [
  'market_maturity', 'competitive_pressure', 'strategic_impact',
  'execution_complexity', 'competitive_lag_risk',
] as const;

type ScoreDimKey = typeof SCORE_DIMS[number];

// ─── Theme identity (ENTREGA 2) ────────────────────────────────────────────────

const VALID_CATEGORIES = [
  'IA', 'Cloud', 'Cybersecurity', 'Regulation', 'Infrastructure', 'Data',
  'Market', 'Fintech', 'Automation', 'Observability', 'Engineering',
  'Edge', 'Healthtech', 'Sustainability',
  'Quantum', 'Robotics', 'AI Governance', 'Spatial Computing', 'Networks',
] as const;

/** Normaliza um slug para kebab-case ASCII estável. Retorna null se vazio. */
function normalizeSlug(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || null;
}

/** Valida a categoria contra o conjunto permitido; fallback para null. */
function normalizeCategory(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const found = VALID_CATEGORIES.find(c => c.toLowerCase() === raw.trim().toLowerCase());
  return found ?? null;
}

/** Carrega os theme_slug distintos já existentes (relatórios recentes) para reuso. */
async function loadExistingThemes(): Promise<string[]> {
  const rows = await dbGet<{ theme_slug: string | null }>(
    `report_trends?select=theme_slug&theme_slug=not.is.null&order=created_at.desc&limit=120`,
  );
  const seen = new Set<string>();
  for (const r of rows) if (r.theme_slug) seen.add(r.theme_slug);
  return [...seen];
}

/**
 * Overwrites all numeric score values in `en` with the canonical PT values.
 * Labels remain in English (generated by LLM). This is belt-and-suspenders
 * enforcement — the prompt already constrains the numbers, but LLMs can drift.
 */
function enforceScoresFromPt(en: TrendAnalysis, pt: TrendAnalysis): void {
  en.taime_score = pt.taime_score;
  for (const dim of SCORE_DIMS) {
    if (!en.score_dimensions[dim]) {
      en.score_dimensions[dim] = { score: pt.score_dimensions[dim].score, label: dim.toUpperCase() };
    } else {
      en.score_dimensions[dim].score = pt.score_dimensions[dim].score;
    }
  }
}

/** Verifies all numeric values match PT. Returns list of mismatches. */
function verifyScores(en: TrendAnalysis, pt: TrendAnalysis): string[] {
  const issues: string[] = [];
  if (en.taime_score !== pt.taime_score) {
    issues.push(`taime_score: PT=${pt.taime_score} EN=${en.taime_score}`);
  }
  for (const dim of SCORE_DIMS) {
    const ptS = pt.score_dimensions[dim]?.score;
    const enS = en.score_dimensions[dim]?.score;
    if (ptS !== enS) issues.push(`${dim}: PT=${ptS} EN=${enS}`);
  }
  return issues;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are the Chief Intelligence Analyst at TAIME — a strategic technology intelligence platform \
delivering Gartner-caliber analysis to leaders, managers, consultants and decision-makers.

Your analysis differs fundamentally from technology journalism:
• You reveal what signals MEAN for business survival — not merely describe what is happening
• You name the rational move given accumulated evidence — not list possibilities
• You assess with conviction and cite your confidence basis honestly

═══════════════════════════════════════
TAIME SCORE (0–100): Semantic Urgency
═══════════════════════════════════════
Expert judgment across 5 dimensions (NOT a formula):

MARKET MATURITY        0–30 Lab | 31–60 Early production | 61–85 Scaling | 86–100 Table stakes
COMPETITIVE PRESSURE   0–30 None | 31–60 Positioning | 61–85 Visible separation | 86–100 Gap compounding
STRATEGIC IMPACT       0–30 Efficiency | 31–60 Process | 61–85 Business model | 86–100 Structural break
EXECUTION COMPLEXITY   0–30 Accessible | 31–60 New capability | 61–85 Org change | 86–100 Multi-year
COMPETITIVE LAG RISK   0–30 Window open | 31–60 Gaps forming | 61–85 Costs 2x–3x | 86–100 Lock-in

Each dimension: { "score": 0–100, "label": "EVOCATIVE INTERPRETIVE LABEL IN CAPS" }
Overall score = weighted expert judgment — NOT arithmetic mean.

SCORING SCOPE: Score all dimensions relative to the GLOBAL market by default. When the underlying signals are predominantly regional or sector-specific, score within that scope AND state the scope explicitly in taime_score_rationale (e.g. "maturity assessed within the Brazilian market").

═══════════════════════════════════════
TYPE → ACT → IMPACT → MOVE → EXIT
═══════════════════════════════════════
TYPE:   Signal (early indicator) | Shift (change underway) | Rupture (structural break)
ACT:    Observe | Prepare | Accelerate | Commit
IMPACT: Specific business dimensions structurally affected
MOVE:   Concrete first move — not "explore AI" but "appoint PM with 90-day mandate and budget"
EXIT:   Observable condition signaling opportunity captured OR window passed

COUNTER-THESIS (optional — include ONLY if a genuine specific condition exists):
A specific condition under which the recommended action would be wrong or premature.
Valid examples: regulatory constraints making adoption impossible, organizational
prerequisites not yet met, market timing that genuinely favors waiting.
Do NOT include if the counter-thesis would be generic, obvious, or a truism.
If no genuine counter-thesis exists, omit this field entirely from the JSON.
PT label: "contra_tese" / EN label: "counter_thesis"

═══════════════════════════════════════
THEN / NOW / NEXT
═══════════════════════════════════════
THEN: Strategic inflection point — see THEN RULE below for date and format requirements
NOW:  Current reality gap — what the evidence shows that executives are still missing
NEXT: Trajectory the signals pointed toward, written from the vantage of ${PERIOD}

═══════════════════════════════════════
ORG IMPLICATIONS (specific, not generic)
═══════════════════════════════════════
leadership: C-suite decision or priority shift this demands
technology: Architectural or capability implication for tech team
operations: Process change with material cost/efficiency impact
finance:    Capex/opex shift or investment timing implication
people:     Talent acquisition, reskilling, or org design change

═══════════════════════════════════════
OUTPUT QUALITY STANDARDS
═══════════════════════════════════════
• executive_snapshot: the insight that makes a CEO stop scrolling — true AND surprising
• Name dynamics specifically: "operators deploying while incumbents debate governance"
• decision_triggers: observable conditions, not generic advice
• confidence_basis: cite signal count and convergence quality — NEVER specific source names (see below)
• limitations: honest blind spots — what this analysis CANNOT see

═══════════════════════════════════════
CONFIDENCE_BASIS — SOURCE CONFIDENTIALITY
═══════════════════════════════════════
IMPORTANT: In the confidence_basis field, NEVER mention specific source names.
Do NOT write: "Gartner, McKinsey, Forrester, IDC, HBR, MIT, WEF, Stanford, a16z" or any firm name.
Always describe sources by CATEGORY ONLY:
  - "global research institutes"
  - "strategic consulting firms"
  - "academic research centers"
  - "technology industry publications"
  - "venture capital and investment firms"
  - "regulatory and policy bodies"

Correct format:
  "18 signals from global research institutes and strategic consulting firms. TAIME Score 87, high convergence across research and consulting categories, corroborated by industry publications."

Wrong format:
  "14 signals, 5 sources (Gartner, HBR, IDC, WEF, Stanford), score 87"

Source names are confidential. Category descriptions maintain analytical credibility.

═══════════════════════════════════════
CRITICAL ANTI-HALLUCINATION RULES
═══════════════════════════════════════
1. Every factual claim (company names, product names, numbers,
   statistics, announcements) MUST be directly traceable to
   the signals provided in this prompt.
2. If a fact is not explicitly present in the signals,
   DO NOT include it — not even as context or background.
3. You are an analyst interpreting evidence, not a journalist
   creating content. Only analyze what exists in the signals.
4. If signals are insufficient to support a claim, say the
   evidence is limited — do not fill gaps with assumptions.
5. Never invent trends, companies, products or events.

═══════════════════════════════════════
FRAMEWORK FIELD QUALITY REQUIREMENT
═══════════════════════════════════════
IMPORTANT: For the TYPE→ACT→IMPACT→MOVE→EXIT framework, each field must contain
a full explanatory sentence in context, NOT just a single word or label.

Wrong:  type: "Rupture"
Right:  type: "Structural rupture — AI is transitioning from optional tool to core
        operational infrastructure, forcing organizations to redesign governance
        and operating models."

Wrong:  act: "Commit"
Right:  act: "Commit now — organizations that delay past Q3 2026 will face 2x–3x
        higher integration costs as vendor lock-in accelerates and talent pools
        shrink."

Wrong:  move: "Evaluate vendors"
Right:  move: "Appoint a dedicated AI infrastructure lead with a 90-day mandate,
        dedicated budget authority, and a board-level reporting line
        by end of quarter."

Every field must explain WHY, not just WHAT. Minimum 20 words per field.

═══════════════════════════════════════
STYLE REQUIREMENT
═══════════════════════════════════════
Avoid using em dashes (—) in the middle of sentences in any output field.
Use periods or commas instead.
Em dashes are only acceptable in date ranges like 2022–2026.

Wrong:  "Organizations that delay — especially in regulated sectors — face compounding risk."
Right:  "Organizations that delay, especially in regulated sectors, face compounding risk."
Right:  "Organizations that delay face compounding risk. This is especially true in regulated sectors."

═══════════════════════════════════════
AUDIENCE RULE
═══════════════════════════════════════
This intelligence serves leaders, managers, consultants and entrepreneurs across ALL organization
sizes and sectors, from individual professionals to large global enterprises.
Never frame analysis exclusively for SMEs or any specific company size.
Use inclusive language: "organizations", "leaders", "decision-makers", "businesses",
"teams", "executives".
The analysis must be relevant and actionable for any organization that uses technology to compete.

═══════════════════════════════════════
MONETARY VALUES RULE
═══════════════════════════════════════
Never suggest specific budget amounts, salary figures, investment ranges or cost estimates
in any currency (no BRL, USD, EUR, or any other currency amounts).
The TAIME framework provides strategic direction, not financial planning.

Wrong: "allocate R$200-500k for this initiative"
Wrong: "hire a leader at R$300k annual compensation"
Right: "allocate dedicated budget with executive mandate"
Right: "bring in or designate a senior leader with full-time mandate and appropriate resources"

Financial sizing is the client's responsibility. TAIME provides the strategic rationale
and direction.

═══════════════════════════════════════
NON-TRACEABLE QUANTIFICATION RULE
═══════════════════════════════════════
Do NOT invent specific quantified claims that are not present in the signals.
This includes multipliers (2x, 3x), percentages (20% efficiency gain, 40% reduction),
time thresholds (within hours, by Q3), and any precise statistic.
If the signals do not provide a specific number, describe the direction or magnitude
qualitatively instead.
Wrong: "organizations that delay beyond Q3 2026 face 2x to 3x higher integration costs"
Wrong: "competitors publishing 20% or greater efficiency gains"
Right: "organizations that delay face materially higher integration costs as lock-in accelerates"
Right: "competitors demonstrating significant operational efficiency gains"
A specific number is acceptable ONLY when it appears in a signal. When in doubt, stay qualitative.

═══════════════════════════════════════
TEMPORAL INTEGRITY PROTOCOL
═══════════════════════════════════════
You are analyzing signals from ${PERIOD} (${PERIOD_LABEL_EN}). Write as if you are an analyst on ${PERIOD_END_DATE} — you only know what was publicly available then.

TEMPORAL BOUNDARY — HARD RULE:
Your analysis must be based EXCLUSIVELY on information publicly available on or before ${PERIOD_END_DATE}.
You have knowledge beyond this date but are FORBIDDEN from using it. Test every claim: "Would an analyst in ${PERIOD} have had access to this?" If no — remove it.

NOW must reflect the state of the market AT ${PERIOD}, present tense anchored to that date.

NEXT must describe what was likely to come AFTER ${PERIOD} from the perspective of that moment. Use language like: "signals pointed toward...", "the trajectory suggested...", "if patterns held...", "the data indicated..."
NEVER use hindsight. Never say what actually happened after ${PERIOD_END_DATE}.

═══════════════════════════════════════
THEN — STRATEGIC INFLECTION POINT RULE
═══════════════════════════════════════
Do not use a fixed time window for THEN.
Instead, identify the most strategically relevant PRIOR moment for THIS specific trend: the point when the dominant consensus was clearly incomplete or wrong compared to NOW.

This could be 6 months before the report period or 10 years before — whatever provides the sharpest strategic contrast.

Always use ABSOLUTE dates. Never use relative language.
Wrong: "Há 12 a 18 meses..." / "Eighteen months ago..."
Wrong: "Entre 12-18 meses atrás..."
Right PT: "Em 2021..." / "Entre 2018 e 2020..." / "Antes de 2008..." / "No período 2022-2023..."
Right EN: "In 2021..." / "Between 2018 and 2020..."

Ask yourself: "When did most organizations last hold a fundamentally different mental model about this topic?" That is your THEN.

THEN must start with a PERIOD_LABEL line (3-6 words) as subtitle:
PT examples: "PERIOD_LABEL: Contexto de 2021-2023" / "PERIOD_LABEL: O modelo mental pré-2008" / "PERIOD_LABEL: Antes da virada de 2020"
EN examples: "PERIOD_LABEL: The pre-2022 consensus" / "PERIOD_LABEL: Before the 2020 shift"
Then continue with the content on the next line.

═══════════════════════════════════════
VARIATION RULE — THEN/NOW/NEXT
═══════════════════════════════════════
Each trend's THEN, NOW, and NEXT must open with a DIFFERENT sentence structure. Across all 5 trends in a report, these openings are FORBIDDEN more than once:
PT: "Há X a Y meses...", "O que a maioria dos executivos ainda não...", "A maioria das organizações ainda...", "O próximo ponto de inflexão será...", "A próxima inflexão será..."
EN: "What most executives have not yet...", "The next inflection point will be...", "Most organizations still..."
Each trend must feel analytically distinct from the others.

═══════════════════════════════════════
MOVE VOICE RULE
═══════════════════════════════════════
Write MOVE in action-oriented language focused on WHAT needs to happen, not WHO should be designated or hired. The organization reading this may be a solo professional, a micro-business, or a large enterprise — the action must be relevant to all of them.
Wrong: "Designar um líder sênior com mandato de 90 dias"
Wrong: "Nomear um Chief AI Officer com autoridade..."
Wrong: "Designate a senior leader with 90-day mandate"
Right PT: "Mapear o portfólio atual de fornecedores, identificar dependências críticas e avaliar exposição..."
Right PT: "Estabelecer responsabilidade clara pela agenda de IA com autoridade para decidir e recursos dedicados..."
Right EN: "Map the current vendor portfolio, identify critical dependencies, and evaluate exposure to..."
Focus on the WHAT and WHY, not the org chart.

═══════════════════════════════════════
EM DASH PROHIBITION
═══════════════════════════════════════
Never use the em dash character (—) anywhere in generated text.
This applies to ALL fields: titles, type, act, impact, move, exit,
counter_thesis, then, now, next, executive_snapshot, org_implications,
decision_triggers, recommended_move, confidence_basis, limitations.
Use alternative punctuation instead:
- Replace " — " with ": " or ". " or a new sentence
- Replace "X — Y" with "X: Y" or "X. Y"
This rule is absolute and applies to PT-BR and EN equally.`;

// ─── Context formatting ───────────────────────────────────────────────────────

function formatGlobalContext(clusters: Cluster[], signalMap: Map<string, Signal>): string {
  const sections = clusters.map((cluster, i) => {
    const signals = cluster.signal_ids
      .map(id => signalMap.get(id))
      .filter((s): s is Signal => s !== undefined);

    const signalLines = signals.map((s, j) => {
      const source  = s.sources?.name ?? 'Unknown';
      // stripLoneSurrogates apos o .slice(): a fatia por code unit pode cortar um
      // emoji ao meio e orfanar o high surrogate no fim do preview.
      const preview = stripLoneSurrogates((s.content || s.metadata.snippet || '').slice(0, cfg.contentPreviewChars));
      const title   = stripLoneSurrogates(s.title ?? '');
      return `  [${j + 1}] ${source} — ${title}\n      ${preview || '(unavailable)'}`;
    }).join('\n\n');

    return `CLUSTER ${i + 1}: "${cluster.name}"\n${cluster.description}\nSignals (${signals.length}):\n${signalLines}`;
  });

  return (
    `PERIOD: ${PERIOD} | CLUSTERS: ${clusters.length}\n\n` +
    '═'.repeat(60) + '\n\n' +
    sections.join('\n\n' + '─'.repeat(60) + '\n\n')
  );
}

function formatClusterContext(cluster: Cluster, signalMap: Map<string, Signal>): string {
  const signals = cluster.signal_ids
    .map(id => signalMap.get(id))
    .filter((s): s is Signal => s !== undefined);

  const signalLines = signals.map((s, j) => {
    const source  = s.sources?.name ?? 'Unknown';
    // stripLoneSurrogates apos o .slice(): a fatia por code unit pode orfanar um
    // high surrogate no fim do preview (emoji cortado ao meio).
    const preview = stripLoneSurrogates((s.content || s.metadata.snippet || '').slice(0, cfg.contentPreviewChars));
    const title   = stripLoneSurrogates(s.title ?? '');
    return (
      `[${j + 1}] Source: ${source}\n` +
      `    Title: ${title}\n` +
      `    Context: ${preview || '(unavailable)'}`
    );
  }).join('\n\n');

  return (
    `CLUSTER: "${cluster.name}"\nDescription: ${cluster.description}\n` +
    `Total signals: ${signals.length}\n\n${signalLines}`
  );
}

// ─── Anthropic API helpers ────────────────────────────────────────────────────

function logUsage(label: string, u: AnthropicUsage): void {
  process.stdout.write(
    `    ${label}: ${u.input_tokens}in/${u.output_tokens}out` +
    (u.cache_creation_input_tokens ? ` +${u.cache_creation_input_tokens}written` : '') +
    (u.cache_read_input_tokens     ? ` +${u.cache_read_input_tokens}cached`      : '') +
    '\n',
  );
}

// HTTP status que vale re-tentar (transitórios). 4xx de cliente (400/401/403) não.
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function anthropicPost(
  body: unknown,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<{ text: string; usage: AnthropicUsage }> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelay   = opts.baseDelayMs ?? 2000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         cfg.anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta':    'prompt-caching-2024-07-31',
        },
        // Rede final antes da serializacao: remove qualquer surrogate orfao de
        // TODO o corpo (system, messages, etc.), venha de onde vier. Sem isso, um
        // emoji cortado ao meio quebra o JSON e a API rejeita com 400.
        body: JSON.stringify(deepStripLoneSurrogates(body)),
      });

      if (!res.ok) {
        const errText = await res.text();
        // Erro de cliente (não 429): re-tentar não resolve. Falha imediata.
        if (!RETRYABLE_STATUS.has(res.status)) {
          throw new Error(`Anthropic API (${res.status}): ${errText}`);
        }
        // Status transitório: trata como erro re-tentável.
        throw Object.assign(new Error(`Anthropic API (${res.status}): ${errText}`), { _retryable: true });
      }

      const data = await res.json() as {
        content: Array<{ type: string; text: string }>;
        usage: AnthropicUsage;
      };
      const text = data.content.find(b => b.type === 'text')?.text ?? '';
      return { text, usage: data.usage };
    } catch (err) {
      lastErr = err;

      // Erro de cliente não-re-tentável (lançado acima sem _retryable): propaga já.
      const msg = err instanceof Error ? err.message : String(err);
      const isHttpClientError = msg.startsWith('Anthropic API (') && !(err as { _retryable?: boolean })._retryable;
      if (isHttpClientError) throw err;

      // Erros de rede (ECONNRESET, fetch failed, timeout) e status transitórios: re-tenta.
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // 2s, 4s, 8s...
        console.warn(`  ⚠ Falha de rede/API (tentativa ${attempt}/${maxAttempts}): ${msg.slice(0, 120)}`);
        console.warn(`    aguardando ${delay / 1000}s antes de re-tentar...`);
        await sleep(delay);
        continue;
      }
    }
  }
  throw new Error(`anthropicPost falhou após ${maxAttempts} tentativas: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

// ─── Synergy ordering + report splitting ──────────────────────────────────────

/**
 * Pede ao modelo para REORDENAR os clusters por afinidade temática — clusters
 * que conversam ficam adjacentes (IA-research perto de IA-commercial, devops
 * perto de tooling, cloud perto de infra). NÃO agrupa nem corta; só ordena.
 * O corte em relatórios é feito por código (splitIntoReports), garantindo os
 * limites de tamanho. Separação julgamento (LLM) × aritmética (código).
 *
 * Retorna uma permutação de índices [0..n-1]. Em qualquer falha, retorna a
 * ordem identidade (fallback): o pipeline nunca trava por causa disto.
 */
async function orderClustersBySynergy(clusters: Cluster[]): Promise<number[]> {
  const identity = clusters.map((_, i) => i);
  if (clusters.length <= 2) return identity; // nada a ordenar

  const list = clusters
    .map((c, i) => `[${i}] ${c.name} — ${c.description}`)
    .join('\n');

  const sys = `You order a list of technology trend clusters so that thematically related ones \
are adjacent. You do NOT group, cut, merge, rename, or judge importance. You only return a \
reordering of the given indices so that clusters that share a theme (e.g. AI research and AI \
applications; devops and developer tooling; cloud and infrastructure; privacy and security) sit \
next to each other, producing a coherent reading sequence.

Return VALID JSON ONLY: {"order": [<all indices, each exactly once>]}
The "order" array MUST be a permutation of 0..${clusters.length - 1} — every index exactly once, \
none added, none missing.`;

  try {
    const { text } = await anthropicPost({
      model:      cfg.model,
      max_tokens: 1024,
      system:     [{ type: 'text', text: sys }],
      messages:   [{ role: 'user', content: `Clusters:\n${list}\n\nReturn valid JSON only.` }],
    });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return identity;
    const parsed = parseJsonSafe<{ order: number[] }>(match[0], 'synergy-order');
    const order  = parsed.order ?? [];

    // Valida que é uma permutação exata de 0..n-1. Se não for, fallback.
    if (order.length !== clusters.length) return identity;
    const seen = new Set<number>();
    for (const idx of order) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= clusters.length || seen.has(idx)) {
        return identity;
      }
      seen.add(idx);
    }
    return order;
  } catch {
    return identity; // qualquer erro → ordem original
  }
}

/**
 * Dado o total de trends, devolve os TAMANHOS dos relatórios, cada um entre
 * `min` e `max` trends, o mais balanceado possível. Determinístico.
 *   ≤ max          → [total]                  (1 relatório)
 *   > max          → ceil(total/max) grupos, tamanhos equilibrados
 * Ex.: 16,(3,7) → [6,5,5] · 11 → [6,5] · 8 → [4,4] · 7 → [7] · 4 → [4] · 3 → [3]
 *
 * Caso de borda: total < min (ex. 2 clusters) → [total]. Não inventamos trends;
 * um período só com 2 temas vira 1 relatório de 2, abaixo do alvo mas honesto.
 */
function splitIntoReports(total: number, min = 3, max = 7): number[] {
  if (total <= max) return [total];

  const groups = Math.ceil(total / max);          // nº mínimo de relatórios p/ respeitar o teto
  const base   = Math.floor(total / groups);
  let   extra  = total % groups;                  // distribui o resto +1 nos primeiros grupos

  const sizes: number[] = [];
  for (let g = 0; g < groups; g++) {
    sizes.push(base + (extra > 0 ? 1 : 0));
    if (extra > 0) extra--;
  }
  // base >= min é garantido aqui: groups = ceil(total/max) implica base = floor(total/groups) >= min
  // para min<=max e total>max (ex.: total=8,max=7 → groups=2,base=4). Mantemos a verificação defensiva.
  return sizes;
}

// ─── Per-trend LLM call ───────────────────────────────────────────────────────

const TREND_SCHEMA = `{
  "title": "executive-grade trend title (10–15 words)",
  "category": "ONE broad label, EXACTLY one of: IA, Cloud, Cybersecurity, Regulation, Infrastructure, Data, Market, Fintech, Automation, Observability, Engineering, Edge, Healthtech, Sustainability, Quantum, Robotics, AI Governance, Spatial Computing, Networks",
  "theme_slug": "stable kebab-case ASCII key for this theme ACROSS cycles (e.g. ia-agentes-autonomos, governanca-ia, repatriacao-cloud). REUSE an existing slug from the list if this trend continues that theme; only create a new slug for a genuinely new theme. Language-neutral: identical in PT and EN.",
  "executive_snapshot": "2–3 sentences — the non-obvious insight that defines this trend's significance",
  "taime_score": 88,
  "taime_score_rationale": "2–3 sentences naming the dominant dimensions and competitive dynamic",
  "score_dimensions": {
    "market_maturity":      { "score": 85, "label": "INTERPRETIVE LABEL IN CAPS" },
    "competitive_pressure": { "score": 92, "label": "INTERPRETIVE LABEL IN CAPS" },
    "strategic_impact":     { "score": 78, "label": "INTERPRETIVE LABEL IN CAPS" },
    "execution_complexity": { "score": 55, "label": "INTERPRETIVE LABEL IN CAPS" },
    "competitive_lag_risk": { "score": 88, "label": "INTERPRETIVE LABEL IN CAPS" }
  },
  "taime_framework": {
    "type":   "full sentence explaining signal/shift/rupture type and WHY",
    "act":    "full sentence: observe/prepare/accelerate/commit and WHY now",
    "impact": "full sentence: specific business dimensions structurally affected",
    "move":   "full sentence: concrete first move — specific, executable, time-bound",
    "exit":   "full sentence: observable success or failure condition",
    "counter_thesis": "OPTIONAL — string | null. PT label: contra_tese / EN label: counter_thesis. Include ONLY when a genuine specific condition would invalidate the recommendation; omit otherwise (do not include the field at all)."
  },
  "then_now_next": {
    "then": "PERIOD_LABEL: [3-6 word subtitle for the THEN period]\\n[2-3 sentences using ABSOLUTE dates only — never relative time]",
    "now":  "current reality gap — what most miss (2–3 sentences)",
    "next": "next inflection the pattern points to (2–3 sentences)"
  },
  "org_implications": {
    "leadership": "specific C-suite implication",
    "technology": "specific tech team implication",
    "operations": "specific ops implication",
    "finance":    "specific finance implication",
    "people":     "specific talent/org implication"
  },
  "decision_triggers": [
    "observable condition 1",
    "observable condition 2",
    "observable condition 3",
    "observable condition 4"
  ],
  "recommended_move": "2–3 sentence strategic recommendation — specific and committed",
  "confidence_basis": "e.g.: '18 signals from global research institutes and strategic consulting firms. TAIME Score 88, high convergence across research and consulting categories.'",
  "limitations": "1–2 sentences: specific analytical blind spots"
}`;

async function callClaudeTrend(
  globalContextBlock: string,
  cluster: Cluster,
  signalMap: Map<string, Signal>,
  language: 'pt-BR' | 'en',
  ptReference?: TrendAnalysis,
  existingThemes: string[] = [],
): Promise<TrendAnalysis> {
  const lang       = language === 'pt-BR' ? 'Brazilian Portuguese' : 'English';
  const clusterCtx = formatClusterContext(cluster, signalMap);

  let instruction =
    `Analyze the following cluster and generate a complete TrendAnalysis in ${lang}.\n\n` +
    `${clusterCtx}\n\n` +
    `Return VALID JSON ONLY — a single object (not an array, not wrapped).\n\n` +
    TREND_SCHEMA;

  // ENTREGA 2: lista de slugs existentes para reuso entre ciclos
  const themesList = existingThemes.length
    ? existingThemes.join(', ')
    : '(none yet — create the first slug for this theme)';
  instruction +=
    `\n\n${'═'.repeat(50)}\n` +
    `EXISTING THEME SLUGS — REUSE WHEN APPLICABLE:\n` +
    `${'═'.repeat(50)}\n` +
    `${themesList}\n` +
    `If this trend continues one of the themes above, REUSE its exact slug.\n` +
    `Only invent a NEW kebab-case slug for a genuinely new theme.\n` +
    `category and theme_slug must be identical in PT and EN.`;

  if (ptReference !== undefined) {
    // BUG 1 FIX: pass ALL numeric constraints, not just the top-level score.
    // The LLM must copy these exact integers — text/labels are in English.
    const d = ptReference.score_dimensions;
    instruction +=
      `\n\n${'═'.repeat(50)}\n` +
      `MANDATORY SCORE CONSTRAINTS — DO NOT DEVIATE:\n` +
      `${'═'.repeat(50)}\n` +
      `Overall TAIME Score: ${ptReference.taime_score} (EXACT — copy this integer verbatim)\n\n` +
      `score_dimensions scores are FIXED integers (copy them exactly):\n` +
      `  market_maturity:      score = ${d.market_maturity.score}\n` +
      `  competitive_pressure: score = ${d.competitive_pressure.score}\n` +
      `  strategic_impact:     score = ${d.strategic_impact.score}\n` +
      `  execution_complexity: score = ${d.execution_complexity.score}\n` +
      `  competitive_lag_risk: score = ${d.competitive_lag_risk.score}\n\n` +
      `These numbers were determined by the canonical pt-BR analysis and are IMMUTABLE.\n` +
      `Your ONLY task is to write the narrative analysis in English.\n` +
      `Generate ENGLISH labels for each dimension that interpret the FIXED scores above.\n` +
      `DO NOT recalculate, reinterpret, or deviate from any of the scores above.\n` +
      `Copy the integers as-is into the JSON output.\n\n` +
      `category and theme_slug are language-neutral. Use EXACTLY:\n` +
      `  category   = "${ptReference.category}"\n` +
      `  theme_slug = "${ptReference.theme_slug}"`;
  }

  const { text, usage } = await anthropicPost({
    model:       cfg.model,
    max_tokens:  cfg.maxTokens,
    // temperature: 0.1, // PILOT: claude-opus-4-8 deprecated `temperature`. Restore when reverting to Sonnet.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: globalContextBlock, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: instruction },
      ],
    }],
  });

  logUsage(`[${language}] "${cluster.name}"`, usage);

  const trend = parseJsonSafe<TrendAnalysis>(text, `${language}:${cluster.name}`);

  // Sanitização básica
  if (typeof trend.taime_score !== 'number') trend.taime_score = ptReference?.taime_score ?? 70;
  trend.taime_score = Math.max(0, Math.min(100, Math.round(trend.taime_score)));
  if (!Array.isArray(trend.decision_triggers)) trend.decision_triggers = [];

  // ENTREGA 2: normaliza category + theme_slug. EN herda do PT (idioma-neutros).
  if (ptReference !== undefined) {
    trend.category   = ptReference.category;
    trend.theme_slug = ptReference.theme_slug;
  } else {
    trend.category   = normalizeCategory(trend.category) ?? 'Market';
    trend.theme_slug = normalizeSlug(trend.theme_slug) ?? normalizeSlug(trend.title) ?? 'tema-sem-slug';
  }

  // BUG 1 FIX: belt-and-suspenders — overwrite all numeric values with PT canonical values.
  // Even if the LLM drifted despite the constraints, this guarantees PT = EN scores.
  if (ptReference !== undefined) {
    enforceScoresFromPt(trend, ptReference);
  }

  return trend;
}

// ─── Report metadata LLM call ─────────────────────────────────────────────────

async function callClaudeMetadata(
  trends: TrendAnalysis[],
  language: 'pt-BR' | 'en',
): Promise<ReportMetadata> {
  const lang       = language === 'pt-BR' ? 'Brazilian Portuguese' : 'English';
  const periodLabel = language === 'pt-BR' ? PERIOD_LABEL_PT : PERIOD_LABEL_EN;
  const trendsList = trends.map((t, i) =>
    `${i + 1}. "${t.title}" (TAIME Score: ${t.taime_score})\n   ${t.executive_snapshot}`,
  ).join('\n\n');

  const prompt =
    `Generate report metadata for a TAIME strategic intelligence report in ${lang}.\n\n` +
    `PERIOD: this report covers "${periodLabel}" (period type: ${_pi.type}). This is a SINGLE ` +
    `${_pi.type === 'monthly' ? 'month' : 'two-week window'}, not a quarter, semester, or year. ` +
    `NEVER describe the timeframe as a "semester", "semestre", "quarter", "trimestre", "year", ` +
    `or "ano" — refer to it as this period / this fortnight / "${periodLabel}" if a timeframe is named.\n\n` +
    `TEMPORAL DISCIPLINE — the title and summary must read as written DURING ${periodLabel}, by an ` +
    `analyst who does NOT know how the story ends. Describe the STAGE these trends were actually at ` +
    `in this period (emerging, early, gaining traction), not a finished outcome. Avoid categorical ` +
    `"crossed the line / has arrived / is now standard" framing for trends that were only beginning. ` +
    `Prefer "is beginning to", "is moving toward", "signals an early shift" over "has crossed", "now defines".\n\n` +
    `The report contains ${trends.length} strategic trends:\n\n${trendsList}\n\n` +
    `The title must reflect the SHARED thread across ALL ${trends.length} trends above, not only a few of them.\n\n` +
    `EDITORIAL: no monetary values (no "$26.2B", "US$ X bilhões") in the title or summary — TAIME gives ` +
    `direction, not financial sizing. No source attribution by name. No em dash.\n\n` +
    `Return VALID JSON ONLY (escape every newline inside strings as \\n; no literal line breaks inside string values):\n` +
    `{\n` +
    `  "report_title": "impactful, specific title true to ${periodLabel}",\n` +
    `  "executive_summary": "3–4 paragraphs synthesizing the dominant narrative across all trends — the meta-story"\n` +
    `}`;

  const { text, usage } = await anthropicPost({
    model:       cfg.model,
    max_tokens:  2048,
    // temperature: 0.1, // PILOT: claude-opus-4-8 deprecated `temperature`. Restore when reverting to Sonnet.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
  });

  logUsage(`[${language}] metadata`, usage);
  return parseJsonSafe<ReportMetadata>(text, `${language}:metadata`);
}

// ─── DB operations ────────────────────────────────────────────────────────────

interface ReportRecord { id: string }

/**
 * Remove em dash (—, U+2014) do texto, SEM tocar em hífens (-, U+002D).
 * São caracteres Unicode distintos, então "self-guided" e "AI-powered" ficam intactos.
 *
 * O prompt já proíbe em dash, mas o modelo às vezes ignora. Esta é a rede determinística.
 * Substituição contextual conservadora:
 *   "2022—2026"  → "2022-2026"  (faixa numérica: vira hífen, mantém a faixa)
 *   "X — Y"      → "X, Y"        (separador de oração com espaços: vira vírgula)
 *   "X—Y"        → "X, Y"        (colado, não-numérico: vírgula com espaço)
 * NUNCA altera hífens existentes.
 *
 * Para desligar (modo "só detectar, validador flagueia, você corrige à mão"),
 * troque o corpo por `return s;`.
 */
function stripEmDash(s: string): string {
  if (typeof s !== 'string' || !s.includes('\u2014')) return s;
  return s
    .replace(/(\d)\s*\u2014\s*(\d)/g, '$1-$2')   // faixa numérica → hífen
    .replace(/\s*\u2014\s*/g, ', ');              // qualquer outro em dash → vírgula
}

// stripLoneSurrogates e deepStripLoneSurrogates agora vivem em ./sanitize (fonte
// unica compartilhada por todo o pipeline). Importados no topo deste arquivo.

/** Aplica stripEmDash recursivamente a todos os campos string de um TrendAnalysis. */
function sanitizeTrend(t: TrendAnalysis): TrendAnalysis {
  const fw = t.taime_framework;
  return {
    ...t,
    title:                 stripEmDash(t.title),
    executive_snapshot:    stripEmDash(t.executive_snapshot),
    taime_score_rationale: stripEmDash(t.taime_score_rationale),
    taime_framework: {
      ...fw,
      type:   stripEmDash(fw.type),
      act:    stripEmDash(fw.act),
      impact: stripEmDash(fw.impact),
      move:   stripEmDash(fw.move),
      exit:   stripEmDash(fw.exit),
      counter_thesis: fw.counter_thesis != null ? stripEmDash(fw.counter_thesis) : fw.counter_thesis,
      contra_tese:    fw.contra_tese    != null ? stripEmDash(fw.contra_tese)    : fw.contra_tese,
    },
    then_now_next: {
      then: stripEmDash(t.then_now_next.then),
      now:  stripEmDash(t.then_now_next.now),
      next: stripEmDash(t.then_now_next.next),
    },
    org_implications: {
      leadership: stripEmDash(t.org_implications.leadership),
      technology: stripEmDash(t.org_implications.technology),
      operations: stripEmDash(t.org_implications.operations),
      finance:    stripEmDash(t.org_implications.finance),
      people:     stripEmDash(t.org_implications.people),
    },
    decision_triggers: (t.decision_triggers ?? []).map(stripEmDash),
    recommended_move:  stripEmDash(t.recommended_move),
    confidence_basis:  stripEmDash(t.confidence_basis),
    limitations:       stripEmDash(t.limitations),
  };
}

async function persistReport(
  clusters: Cluster[],
  ptBrMeta: ReportMetadata,
  enMeta: ReportMetadata,
  ptBrTrends: TrendAnalysis[],
  enTrends: TrendAnalysis[],
  report_number: number = 1,
): Promise<string> {
  // Rede determinística contra em dash (o prompt proíbe, mas o modelo às vezes ignora).
  // Sanitiza metadados e trends antes de gravar. Hífens permanecem intactos.
  ptBrTrends = ptBrTrends.map(sanitizeTrend);
  enTrends   = enTrends.map(sanitizeTrend);
  ptBrMeta = { report_title: stripEmDash(ptBrMeta.report_title), executive_summary: stripEmDash(ptBrMeta.executive_summary) };
  enMeta   = { report_title: stripEmDash(enMeta.report_title),   executive_summary: stripEmDash(enMeta.executive_summary) };

  const titleSuffix   = '';
  const titleSuffixEn = '';
  const [report] = await dbPost<ReportRecord>('reports', {
    period:                  PERIOD,
    period_label:            PERIOD_LABEL_PT,
    period_type:             _pi.type,
    status:                  'generating',
    report_number:           report_number,
    title_pt_br:             ptBrMeta.report_title + titleSuffix,
    title_en:                enMeta.report_title + titleSuffixEn,
    executive_summary_pt_br: ptBrMeta.executive_summary,
    executive_summary_en:    enMeta.executive_summary,
  }, true);

  for (let i = 0; i < ptBrTrends.length; i++) {
    const p       = ptBrTrends[i];
    const e       = enTrends[i];
    const cluster = clusters[i];

    // BUG 1 FIX: taime_score always comes from PT canonical analysis.
    // Dimensions scores are from PT (enforced above); EN labels come from EN analysis.
    await dbPost('report_trends', {
      report_id:         report.id,
      signal_cluster_id: cluster.id,
      rank:              i + 1,

      title_pt_br: p.title,
      title_en:    e.title,

      category:   p.category,    // ENTREGA 2 — idioma-neutro
      theme_slug: p.theme_slug,  // ENTREGA 2 — idioma-neutro

      taime_score:                 p.taime_score,  // canonical PT value
      taime_score_rationale_pt_br: p.taime_score_rationale,
      taime_score_rationale_en:    e.taime_score_rationale,

      taime_framework_pt_br: {
        ...p.taime_framework,
        executive_snapshot: p.executive_snapshot,
        score_dimensions:   p.score_dimensions,
        confidence_basis:   p.confidence_basis,
        limitations:        p.limitations,
      },
      taime_framework_en: {
        ...e.taime_framework,
        executive_snapshot: e.executive_snapshot,
        // EN score_dimensions: scores=PT values, labels=EN text (enforced above)
        score_dimensions:   e.score_dimensions,
        confidence_basis:   e.confidence_basis,
        limitations:        e.limitations,
      },

      then_now_next_pt_br:     p.then_now_next,
      then_now_next_en:        e.then_now_next,
      org_implications_pt_br:  p.org_implications,
      org_implications_en:     e.org_implications,
      decision_triggers_pt_br: p.decision_triggers,
      decision_triggers_en:    e.decision_triggers,
      recommended_move_pt_br:  p.recommended_move,
      recommended_move_en:     e.recommended_move,
    });

    const dimMatch = SCORE_DIMS.every(d => e.score_dimensions[d]?.score === p.score_dimensions[d]?.score);
    const scoreTag = p.taime_score === e.taime_score && dimMatch ? '✓ PT=EN' : '⚠ mismatch';
    console.log(`  [${i + 1}/${ptBrTrends.length}] "${p.title.slice(0, 55)}" — ${p.taime_score} ${scoreTag}`);
  }

  // Nasce em 'generating'. O validador (validatePersistedReport) decide o status
  // final: 'published' (pass limpo) ou 'pending_review' (qualquer flag).
  await dbPatch('reports', report.id, { status: 'generating' });
  return report.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const missing = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(k => !process.env[k]);
  if (missing.length) { console.error(`\n✗ Variáveis faltando: ${missing.join(', ')}\n`); process.exit(1); }

  console.log('\n╔══════════════════════════════════╗');
  console.log('║   TAIME — Report Generator       ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Período: ${PERIOD}`);
  console.log(`Modelo:  ${cfg.model} | max_tokens: ${cfg.maxTokens} | por trend\n`);
  console.log('Score strategy: PT gera valores numéricos → EN herda scores do PT\n');

  // Idempotência — só bloqueia se houver relatório "vivo" no período.
  // 'rejected' e 'archived' são considerados descartados: não bloqueiam a
  // regeneração e são limpos (com suas trends) para liberar o UNIQUE(period, report_number).
  const existing = await dbGet<{ id: string; status: string }>(
    `reports?period=eq.${PERIOD}&select=id,status&order=report_number.asc`,
  );
  const live = existing.filter(r => r.status !== 'rejected' && r.status !== 'archived');
  const dead = existing.filter(r => r.status === 'rejected' || r.status === 'archived');

  if (live.length > 0) {
    console.log(`⚠ Já existe relatório vivo (id: ${live[0].id}, status: ${live[0].status}). Delete-o e re-execute.\n`);
    process.exit(0);
  }

  if (dead.length > 0) {
    console.log(`Limpando ${dead.length} relatório(s) descartado(s) (rejected/archived) do período...`);
    for (const r of dead) {
      // apaga trends primeiro (FK), depois o relatório
      await fetch(`${cfg.supabaseUrl}/rest/v1/report_trends?report_id=eq.${r.id}`, {
        method: 'DELETE', headers: dbHeaders(),
      });
      await fetch(`${cfg.supabaseUrl}/rest/v1/reports?id=eq.${r.id}`, {
        method: 'DELETE', headers: dbHeaders(),
      });
    }
    console.log('  ✓ Período liberado para regeneração.\n');
  }

  // Carrega clusters
  const clusters = await dbGet<Cluster>(`signal_clusters?period=eq.${PERIOD}&order=created_at.asc`);
  if (clusters.length === 0) {
    console.error('\n✗ Nenhum cluster. Execute analyze-signals.ts primeiro.\n'); process.exit(1);
  }
  console.log(`Clusters: ${clusters.length}`);

  // Carrega signals
  const allIds = [...new Set(clusters.flatMap(c => c.signal_ids))];
  console.log(`Carregando ${allIds.length} signals...`);
  const signalMap = new Map<string, Signal>();
  for (let i = 0; i < allIds.length; i += 100) {
    const ids  = allIds.slice(i, i + 100).map(id => `"${id}"`).join(',');
    const rows = await dbGet<Signal>(`signals?id=in.(${ids})&select=id,title,content,metadata,sources(name,category)`);
    for (const s of rows) signalMap.set(s.id, s);
  }
  console.log(`  ${signalMap.size} signals carregados.\n`);

  const globalContext = formatGlobalContext(clusters, signalMap);

  // ENTREGA 2: slugs de temas já existentes, para reuso entre ciclos
  const existingThemes = await loadExistingThemes();
  console.log(`Temas existentes para reuso: ${existingThemes.length}`);

  // ── STEP 1: PT-BR — gera scores canônicos ────────────────────────────────
  console.log(`Gerando trends pt-BR (${clusters.length} chamadas) — scores canônicos...`);
  const ptBrTrends: TrendAnalysis[] = [];
  for (const cluster of clusters) {
    const trend = await callClaudeTrend(globalContext, cluster, signalMap, 'pt-BR', undefined, existingThemes);
    ptBrTrends.push(trend);
  }

  // ── STEP 2: EN — herda scores do PT como constraints absolutos ───────────
  console.log(`\nGerando trends en (${clusters.length} chamadas) — scores herdados do PT...`);
  const enTrends: TrendAnalysis[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const trend = await callClaudeTrend(
      globalContext, clusters[i], signalMap, 'en',
      ptBrTrends[i],  // full PT reference (not just score)
    );
    enTrends.push(trend);
  }

  // ── Score verification ────────────────────────────────────────────────────
  console.log('\n  Verificação de scores (PT = EN):');
  let allMatch = true;
  for (let i = 0; i < ptBrTrends.length; i++) {
    const mismatches = verifyScores(enTrends[i], ptBrTrends[i]);
    if (mismatches.length > 0) {
      allMatch = false;
      console.log(`  ⚠ Trend ${i + 1} divergências (corrigidas): ${mismatches.join(', ')}`);
    } else {
      console.log(`  ✓ Trend ${i + 1}: PT=${ptBrTrends[i].taime_score} = EN=${enTrends[i].taime_score}`);
    }
  }
  if (allMatch) console.log('  ✓ Todos os scores idênticos PT = EN');

  // ── Divisão por sinergia + tamanho (julgamento LLM × aritmética código) ──────
  // 1) Sonnet ORDENA os clusters por afinidade temática (vizinhos conversam).
  // 2) Aplicamos a MESMA permutação aos três arrays alinhados (clusters,
  //    ptBrTrends, enTrends) — preserva o casamento índice a índice.
  // 3) Código fatia a sequência ordenada em grupos de 3..7 trends.
  // 4) Cada grupo vira 1 relatório (Parte N), com metadados próprios.
  console.log('\nOrdenando clusters por sinergia temática...');
  const order = await orderClustersBySynergy(clusters);
  const usedSynergy = order.some((idx, i) => idx !== i);
  console.log(usedSynergy
    ? '  ✓ Ordem por sinergia aplicada.'
    : '  ~ Ordem original mantida (fallback ou ≤2 clusters).');

  const oClusters   = order.map(i => clusters[i]);
  const oPtBrTrends = order.map(i => ptBrTrends[i]);
  const oEnTrends   = order.map(i => enTrends[i]);

  const sizes = splitIntoReports(oClusters.length, 3, 7);
  const reportCount = sizes.length;
  console.log(`\n${oClusters.length} trends → ${reportCount} relatório(s): grupos de [${sizes.join(', ')}].`);

  let cursor = 0;
  for (let n = 0; n < sizes.length; n++) {
    const size = sizes[n];
    const gClusters   = oClusters.slice(cursor, cursor + size);
    const gPtBrTrends = oPtBrTrends.slice(cursor, cursor + size);
    const gEnTrends   = oEnTrends.slice(cursor, cursor + size);
    cursor += size;

    const partLabel = reportCount > 1 ? ` (Parte ${n + 1}/${reportCount})` : '';
    console.log(`\nGerando metadados do Relatório ${n + 1}${partLabel} — ${size} trends...`);
    const [ptBrMeta, enMeta] = await Promise.all([
      callClaudeMetadata(gPtBrTrends, 'pt-BR'),
      callClaudeMetadata(gEnTrends, 'en'),
    ]);

    console.log(`Gerando Relatório ${n + 1}/${reportCount}${partLabel}...`);
    const reportId = await persistReport(
      gClusters, ptBrMeta, enMeta, gPtBrTrends, gEnTrends, n + 1,
    );
    console.log(`✓ Relatório ${n + 1} gerado: ${reportId}`);
    const v = await validatePersistedReport(reportId);
    console.log(`  Validação R${n + 1}: ${v.verdict} · ${v.flags.length} flag(s) · ${v.signalCount} sinais`);
  }

  // ── Resumo ────────────────────────────────────────────────────────────────
  const scores   = ptBrTrends.map(t => t.taime_score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  console.log('\n' + '═'.repeat(52));
  console.log(`✓ Período publicado`);
  console.log(`  Período:      ${PERIOD}`);
  console.log(`  Relatórios:   ${reportCount}`);
  console.log(`  Trends:       ${ptBrTrends.length}`);
  console.log(`  TAIME Scores: ${scores.join(', ')} (média: ${avgScore})`);
  console.log('═'.repeat(52) + '\n');
}

// Só executa o pipeline quando rodado diretamente (npx ts-node generate-report.ts).
// Quando importado (ex.: pelos testes de parse), não dispara a geração.
if (require.main === module) {
  main().catch(err => { console.error('\n✗ Erro fatal:', err); process.exit(1); });
}
