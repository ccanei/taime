import 'dotenv/config';
import { parsePeriod } from './period-utils';
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
  taime_framework: { type: string; act: string; impact: string; move: string; exit: string };
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

const cfg = {
  anthropicKey:        process.env.ANTHROPIC_API_KEY ?? '',
  supabaseUrl:         (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:         process.env.SUPABASE_SERVICE_KEY ?? '',
  model:               'claude-sonnet-4-6',
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

function repairJson(raw: string): string {
  let text = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Nenhum objeto JSON encontrado na resposta');
  text = text.slice(start);
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

function parseJsonSafe<T>(raw: string, label: string): T {
  const repaired = repairJson(raw);
  try {
    return JSON.parse(repaired) as T;
  } catch (e) {
    throw new Error(`JSON inválido mesmo após repair [${label}]: ${e}\n${repaired.slice(0, 400)}`);
  }
}

// ─── Score enforcement ────────────────────────────────────────────────────────

const SCORE_DIMS = [
  'market_maturity', 'competitive_pressure', 'strategic_impact',
  'execution_complexity', 'competitive_lag_risk',
] as const;

type ScoreDimKey = typeof SCORE_DIMS[number];

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

═══════════════════════════════════════
TYPE → ACT → IMPACT → MOVE → EXIT
═══════════════════════════════════════
TYPE:   Signal (early indicator) | Shift (change underway) | Rupture (structural break)
ACT:    Observe | Prepare | Accelerate | Commit
IMPACT: Specific business dimensions structurally affected
MOVE:   Concrete first move — not "explore AI" but "appoint PM with 90-day mandate and budget"
EXIT:   Observable condition signaling opportunity captured OR window passed

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
Focus on the WHAT and WHY — not the org chart.`;

// ─── Context formatting ───────────────────────────────────────────────────────

function formatGlobalContext(clusters: Cluster[], signalMap: Map<string, Signal>): string {
  const sections = clusters.map((cluster, i) => {
    const signals = cluster.signal_ids
      .map(id => signalMap.get(id))
      .filter((s): s is Signal => s !== undefined);

    const signalLines = signals.map((s, j) => {
      const source  = s.sources?.name ?? 'Unknown';
      const preview = (s.content || s.metadata.snippet || '').slice(0, cfg.contentPreviewChars);
      return `  [${j + 1}] ${source} — ${s.title}\n      ${preview || '(unavailable)'}`;
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
    const preview = (s.content || s.metadata.snippet || '').slice(0, cfg.contentPreviewChars);
    return (
      `[${j + 1}] Source: ${source}\n` +
      `    Title: ${s.title}\n` +
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

async function anthropicPost(body: unknown): Promise<{ text: string; usage: AnthropicUsage }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'prompt-caching-2024-07-31',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic API (${res.status}): ${await res.text()}`);

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
    usage: AnthropicUsage;
  };
  const text = data.content.find(b => b.type === 'text')?.text ?? '';
  return { text, usage: data.usage };
}

// ─── Per-trend LLM call ───────────────────────────────────────────────────────

const TREND_SCHEMA = `{
  "title": "executive-grade trend title (10–15 words)",
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
    "exit":   "full sentence: observable success or failure condition"
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
): Promise<TrendAnalysis> {
  const lang       = language === 'pt-BR' ? 'Brazilian Portuguese' : 'English';
  const clusterCtx = formatClusterContext(cluster, signalMap);

  let instruction =
    `Analyze the following cluster and generate a complete TrendAnalysis in ${lang}.\n\n` +
    `${clusterCtx}\n\n` +
    `Return VALID JSON ONLY — a single object (not an array, not wrapped).\n\n` +
    TREND_SCHEMA;

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
      `Copy the integers as-is into the JSON output.`;
  }

  const { text, usage } = await anthropicPost({
    model:      cfg.model,
    max_tokens: cfg.maxTokens,
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
  const trendsList = trends.map((t, i) =>
    `${i + 1}. "${t.title}" (TAIME Score: ${t.taime_score})\n   ${t.executive_snapshot}`,
  ).join('\n\n');

  const prompt =
    `Generate report metadata for the TAIME ${PERIOD} strategic intelligence report in ${lang}.\n\n` +
    `The report contains ${trends.length} strategic trends:\n\n${trendsList}\n\n` +
    `Return VALID JSON ONLY:\n` +
    `{\n` +
    `  "report_title": "impactful, specific report title for ${PERIOD}",\n` +
    `  "executive_summary": "3–4 paragraphs synthesizing the dominant narrative across all trends — the meta-story"\n` +
    `}`;

  const { text, usage } = await anthropicPost({
    model:      cfg.model,
    max_tokens: 2048,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
  });

  logUsage(`[${language}] metadata`, usage);
  return parseJsonSafe<ReportMetadata>(text, `${language}:metadata`);
}

// ─── DB operations ────────────────────────────────────────────────────────────

interface ReportRecord { id: string }

async function persistReport(
  clusters: Cluster[],
  ptBrMeta: ReportMetadata,
  enMeta: ReportMetadata,
  ptBrTrends: TrendAnalysis[],
  enTrends: TrendAnalysis[],
): Promise<string> {
  const [report] = await dbPost<ReportRecord>('reports', {
    period:                  PERIOD,
    period_label:            PERIOD_LABEL_PT,
    period_type:             _pi.type,
    status:                  'generating',
    title_pt_br:             ptBrMeta.report_title,
    title_en:                enMeta.report_title,
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

  await dbPatch('reports', report.id, { status: 'published', published_at: new Date().toISOString() });
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

  // Idempotência
  const existing = await dbGet<{ id: string }>(`reports?period=eq.${PERIOD}&select=id`);
  if (existing.length > 0) {
    console.log(`⚠ Relatório já existe (id: ${existing[0].id}). Delete-o e re-execute.\n`);
    process.exit(0);
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

  // ── STEP 1: PT-BR — gera scores canônicos ────────────────────────────────
  console.log(`Gerando trends pt-BR (${clusters.length} chamadas) — scores canônicos...`);
  const ptBrTrends: TrendAnalysis[] = [];
  for (const cluster of clusters) {
    const trend = await callClaudeTrend(globalContext, cluster, signalMap, 'pt-BR');
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

  // ── Metadata ──────────────────────────────────────────────────────────────
  console.log('\nGerando metadados do relatório...');
  const [ptBrMeta, enMeta] = await Promise.all([
    callClaudeMetadata(ptBrTrends, 'pt-BR'),
    callClaudeMetadata(enTrends, 'en'),
  ]);

  // ── Persiste ──────────────────────────────────────────────────────────────
  console.log('\nSalvando relatório...');
  const reportId = await persistReport(clusters, ptBrMeta, enMeta, ptBrTrends, enTrends);

  // ── Resumo ────────────────────────────────────────────────────────────────
  const scores   = ptBrTrends.map(t => t.taime_score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  console.log('\n' + '═'.repeat(52));
  console.log(`✓ Relatório publicado`);
  console.log(`  ID:           ${reportId}`);
  console.log(`  Período:      ${PERIOD}`);
  console.log(`  Trends:       ${ptBrTrends.length}`);
  console.log(`  TAIME Scores: ${scores.join(', ')} (média: ${avgScore})`);
  console.log(`  Título pt-BR: ${ptBrMeta.report_title}`);
  console.log(`  Título en:    ${enMeta.report_title}`);
  console.log('═'.repeat(52) + '\n');
}

main().catch(err => { console.error('\n✗ Erro fatal:', err); process.exit(1); });
