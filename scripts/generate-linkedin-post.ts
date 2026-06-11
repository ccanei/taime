#!/usr/bin/env npx ts-node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback para .env

import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * TAIME — LinkedIn post generator
 *
 * Usa dados reais do pipeline (reports + report_trends + radar_signals)
 * para gerar drafts de posts LinkedIn em 4 formatos. Grava em
 * output/linkedin/ para revisão humana. NÃO publica.
 *
 * Argumentos:
 *   --format trend-spotlight | then-now-next | radar-pulse | score-breakdown
 *   --trend-id  <uuid>     (opcional, força uma trend específica)
 *   --report-id <uuid>     (opcional, força um relatório específico)
 *   --lang en | pt-BR      (opcional, default: en)
 *
 * Env: ANTHROPIC_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Format = 'trend-spotlight' | 'then-now-next' | 'radar-pulse' | 'score-breakdown';
type Lang   = 'en' | 'pt-BR';

interface ReportRow {
  id:                       string;
  period:                   string;
  period_label:             string | null;
  title_pt_br:              string;
  title_en:                 string;
  executive_summary_pt_br:  string | null;
  executive_summary_en:     string | null;
  signal_count:             number | null;
}

interface ScoreDimensions {
  market_maturity:      { score: number; label?: string };
  competitive_pressure: { score: number; label?: string };
  strategic_impact:     { score: number; label?: string };
  execution_complexity: { score: number; label?: string };
  competitive_lag_risk: { score: number; label?: string };
}

interface TrendFramework {
  type?:   string;
  act?:    string;
  impact?: string;
  move?:   string;
  exit?:   string;
  executive_snapshot?: string;
  score_dimensions?:   ScoreDimensions;
}

interface ThenNowNext {
  then?: string;
  now?:  string;
  next?: string;
}

interface TrendRow {
  id:                          string;
  report_id:                   string;
  rank:                        number;
  title_pt_br:                 string;
  title_en:                    string;
  taime_score:                 number;
  category:                    string | null;
  taime_framework_pt_br:       TrendFramework | null;
  taime_framework_en:          TrendFramework | null;
  then_now_next_pt_br:         ThenNowNext | null;
  then_now_next_en:            ThenNowNext | null;
  recommended_move_pt_br:      string | null;
  recommended_move_en:         string | null;
  reports?:                    { id: string; period: string; is_public?: boolean } | null;
}

interface RadarSignalRow {
  id:              string;
  title_pt:        string;
  title_en:        string;
  summary_pt:      string;
  summary_en:      string;
  category:        string;
  relevance:       string;
  source_category: string;
  url:             string;
  collected_at:    string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage:   { input_tokens: number; output_tokens: number };
}

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  supabaseUrl: (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  model:        'claude-sonnet-4-6',
  maxTokens:    1200,
  publicSampleReportId: '48c29bb6-6dee-46a1-987b-bb08bd775ab0',
};

function requireEnv(): void {
  const missing: string[] = [];
  if (!cfg.supabaseUrl)  missing.push('SUPABASE_URL');
  if (!cfg.supabaseKey)  missing.push('SUPABASE_SERVICE_KEY');
  if (!cfg.anthropicKey) missing.push('ANTHROPIC_API_KEY');
  if (missing.length) {
    console.error(`Faltam variáveis de ambiente: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(): { format: Format; trendId?: string; reportId?: string; lang: Lang } {
  const args = process.argv.slice(2);
  function get(name: string): string | undefined {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
  }
  const formatRaw = get('format') ?? 'trend-spotlight';
  const validFormats: Format[] = ['trend-spotlight', 'then-now-next', 'radar-pulse', 'score-breakdown'];
  if (!validFormats.includes(formatRaw as Format)) {
    console.error(`Formato inválido: ${formatRaw}. Use um de: ${validFormats.join(', ')}`);
    process.exit(1);
  }
  const langRaw = get('lang') ?? 'en';
  const lang: Lang = langRaw === 'pt-BR' ? 'pt-BR' : 'en';
  return { format: formatRaw as Format, trendId: get('trend-id'), reportId: get('report-id'), lang };
}

// ─── Supabase REST ───────────────────────────────────────────────────────────

async function rest<T>(query: string): Promise<T> {
  // CLI one-shot, sem caching de fetch (a opção `cache` é extensão Next/web,
  // alguns lib.dom não reconhecem em ts-node CLI; HTTP direto ao Supabase basta).
  const r = await fetch(`${cfg.supabaseUrl}/rest/v1/${query}`, {
    headers: {
      apikey:        cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

// ─── Data fetchers ───────────────────────────────────────────────────────────

async function fetchReport(reportId?: string): Promise<ReportRow | null> {
  if (reportId) {
    const rows = await rest<ReportRow[]>(
      `reports?id=eq.${reportId}&select=id,period,period_label,title_pt_br,title_en,executive_summary_pt_br,executive_summary_en,signal_count&limit=1`,
    );
    return rows[0] ?? null;
  }
  const rows = await rest<ReportRow[]>(
    `reports?status=eq.published&order=published_at.desc&select=id,period,period_label,title_pt_br,title_en,executive_summary_pt_br,executive_summary_en,signal_count&limit=1`,
  );
  return rows[0] ?? null;
}

async function fetchTopTrend(reportId: string): Promise<TrendRow | null> {
  const rows = await rest<TrendRow[]>(
    `report_trends?report_id=eq.${reportId}&order=taime_score.desc&limit=1` +
      `&select=id,report_id,rank,title_pt_br,title_en,taime_score,category,taime_framework_pt_br,taime_framework_en,then_now_next_pt_br,then_now_next_en,recommended_move_pt_br,recommended_move_en,reports(id,period,is_public)`,
  );
  return rows[0] ?? null;
}

async function fetchTrendById(trendId: string): Promise<TrendRow | null> {
  const rows = await rest<TrendRow[]>(
    `report_trends?id=eq.${trendId}&limit=1` +
      `&select=id,report_id,rank,title_pt_br,title_en,taime_score,category,taime_framework_pt_br,taime_framework_en,then_now_next_pt_br,then_now_next_en,recommended_move_pt_br,recommended_move_en,reports(id,period,is_public)`,
  );
  return rows[0] ?? null;
}

async function fetchRadarSignals48h(limit = 6): Promise<RadarSignalRow[]> {
  // Últimas 48h, ordenadas por relevance + recente.
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  return rest<RadarSignalRow[]>(
    `radar_signals?collected_at=gte.${encodeURIComponent(since)}` +
      `&order=collected_at.desc&limit=${limit}` +
      `&select=id,title_pt,title_en,summary_pt,summary_en,category,relevance,source_category,url,collected_at`,
  );
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

async function callClaude(system: string, user: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:       cfg.model,
      max_tokens:  cfg.maxTokens,
      temperature: 0.7, // criatividade controlada para variar hooks
      system:      [{ type: 'text', text: system }],
      messages:    [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const json = await r.json() as AnthropicResponse;
  return json.content.find(b => b.type === 'text')?.text ?? '';
}

// ─── Em dash enforcement (rede de segurança) ─────────────────────────────────

/**
 * Remove em dash (U+2014) preservando hifens (U+002D). Mesma lógica do
 * generate-report.ts. Faixa numérica → hífen; outro contexto → vírgula.
 */
function stripEmDash(s: string): string {
  if (!s.includes('—')) return s;
  return s
    .replace(/(\d)\s*—\s*(\d)/g, '$1-$2')
    .replace(/\s*—\s*/g, ', ');
}

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the LinkedIn editorial voice of TAIME, a strategic technology intelligence platform.

EDITORIAL RULES (inviolable):

1. NEVER cite research firms or consultancies by NAME (Gartner, McKinsey, Forrester, EY, Accenture, Deloitte, BCG, KPMG, CB Insights, PitchBook, IDC, Omdia, etc).
   - Allowed: "global consultancies", "market reports", "tier-1 research", "leading research firms".
   - Allowed: a company as the SUBJECT of a fact ("Microsoft launched X", "Anthropic released Y"). What's forbidden is attributing analysis to a named source.

2. NEVER use the em dash character (—, U+2014). It is banned everywhere. Use commas, colons, or periods instead.

3. Use ONLY facts present in the data provided below. Zero hallucination. If a number is not in the data, do not invent it. No fake "ROI of 3.5x", no fake market sizes.

4. NO hindsight. Speak from the perspective of the date of the data. For a 2025 trend, do not invoke events or vocabulary from 2026+.

5. Tone: executive, direct, mobile-readable. No growth-hacker jargon ("hot take", "let's gooo", "this changes everything"). No empty clickbait. Maximum 1-2 emojis in the entire post; zero emojis is fine.

6. Structure (mandatory):
   - Hook on the very first line, max 12 words, no clickbait.
   - Body: 60 to 150 words total, paragraphs of 1-2 lines (mobile-first).
   - At least 1 concrete data point (score, signal count, date window, trend count).
   - CTA at the end with the link provided.
   - 3 to 5 hashtags on the last line, starting with #TechIntelligence #AI #StrategicForesight plus 1-2 topic-specific.

OUTPUT FORMAT:
Return PURE MARKDOWN with this exact structure, nothing else:

## Main post

[Hook on line 1]

[Body in short paragraphs separated by blank lines]

[CTA paragraph with the link]

[Hashtags on a single line]

## Alternative hook

[A second, distinctly different hook for the same post. Max 12 words. No body.]

Do NOT add commentary, explanation, or anything outside these two sections.`;

// ─── User prompts per format ─────────────────────────────────────────────────

function pickLang<T>(lang: Lang, pt: T | null | undefined, en: T | null | undefined): T | null {
  return (lang === 'pt-BR' ? pt : en) ?? null;
}

function pickTrendTitle(trend: TrendRow, lang: Lang): string {
  return lang === 'pt-BR' ? trend.title_pt_br : trend.title_en;
}

function reportPublicUrl(reportId: string, isPublic: boolean | undefined): string {
  // Se o report é público, usa /r/<id>; senão, redireciona para a amostra pública canônica.
  if (isPublic) return `https://www.taime.tech/r/${reportId}`;
  return `https://www.taime.tech/r/${cfg.publicSampleReportId}`;
}

function buildUserPrompt(
  format:   Format,
  lang:     Lang,
  data: {
    report?: ReportRow;
    trend?:  TrendRow;
    radar?:  RadarSignalRow[];
  },
): string {
  const langLabel = lang === 'pt-BR' ? 'Portuguese (Brazil)' : 'English';
  const langInstr = `Generate the post in ${langLabel}. The hashtags themselves stay in English regardless of post language (international audience).`;

  if (format === 'trend-spotlight' && data.trend && data.report) {
    const t  = data.trend;
    const fw = pickLang(lang, t.taime_framework_pt_br, t.taime_framework_en);
    const url = reportPublicUrl(t.report_id, t.reports?.is_public);
    return [
      langInstr,
      '',
      `FORMAT: trend-spotlight`,
      `Period: ${data.report.period} (${data.report.period_label ?? ''})`,
      `Trend title: ${pickTrendTitle(t, lang)}`,
      `TAIME Score: ${t.taime_score} / 100`,
      `Category: ${t.category ?? '(not set)'}`,
      `Executive snapshot: ${fw?.executive_snapshot ?? '(not present)'}`,
      `Score dimensions:`,
      fw?.score_dimensions
        ? `  - Market Maturity: ${fw.score_dimensions.market_maturity.score}\n  - Competitive Pressure: ${fw.score_dimensions.competitive_pressure.score}\n  - Strategic Impact: ${fw.score_dimensions.strategic_impact.score}\n  - Execution Complexity: ${fw.score_dimensions.execution_complexity.score}\n  - Competitive Lag Risk: ${fw.score_dimensions.competitive_lag_risk.score}`
        : '  (not present)',
      `Recommended move: ${fw?.move ?? pickLang(lang, t.recommended_move_pt_br, t.recommended_move_en) ?? '(not present)'}`,
      ``,
      `CTA link: ${url}`,
      `Suggested topic hashtag(s) (pick 1-2 that match the trend): #${(t.category ?? 'Technology').replace(/[^A-Za-z]/g, '')} or specific to the trend theme.`,
      ``,
      `Build a TRENDS SPOTLIGHT post: lead with a strong hook, 2 dense insights about why this trend matters NOW, mention the TAIME Score explicitly, and the CTA. 60-150 words body.`,
    ].join('\n');
  }

  if (format === 'then-now-next' && data.trend && data.report) {
    const t   = data.trend;
    const tnn = pickLang(lang, t.then_now_next_pt_br, t.then_now_next_en);
    const url = reportPublicUrl(t.report_id, t.reports?.is_public);
    return [
      langInstr,
      '',
      `FORMAT: then-now-next`,
      `Period: ${data.report.period}`,
      `Trend title: ${pickTrendTitle(t, lang)}`,
      `TAIME Score: ${t.taime_score}`,
      `Category: ${t.category ?? '(not set)'}`,
      `THEN: ${tnn?.then ?? '(not present)'}`,
      `NOW:  ${tnn?.now ?? '(not present)'}`,
      `NEXT: ${tnn?.next ?? '(not present)'}`,
      ``,
      `CTA link: ${url}`,
      ``,
      `Build a THEN/NOW/NEXT post: 1 hook line, then 3 lines structured as "THEN: ...", "NOW: ...", "NEXT: ...", each one sentence (max 15 words). Then 1 closing line with the TAIME Score and CTA. Hashtags last. 60-110 words body.`,
    ].join('\n');
  }

  if (format === 'radar-pulse' && data.radar && data.radar.length > 0) {
    const sigs = data.radar.slice(0, 3);
    const url  = 'https://www.taime.tech/radar';
    const lines = sigs.map((s, i) => {
      const title   = lang === 'pt-BR' ? s.title_pt   : s.title_en;
      const summary = lang === 'pt-BR' ? s.summary_pt : s.summary_en;
      return `  [${i + 1}] ${title}\n      Category: ${s.category} | Source category: ${s.source_category} | Relevance: ${s.relevance}\n      Summary: ${summary}`;
    }).join('\n');
    return [
      langInstr,
      '',
      `FORMAT: radar-pulse`,
      `Signals from the last 48 hours (${data.radar.length} signals available, pick the 3 strongest):`,
      lines,
      ``,
      `CTA link: ${url}`,
      ``,
      `Build a RADAR PULSE post: 1 hook line about the last 48 hours of tech signals, then 3 bullets of one line each, each with the title of a signal and a tight one-clause insight. Close with 1 line of TAIME reading (the synthesis across the 3), then CTA + hashtags. 80-130 words body.`,
    ].join('\n');
  }

  if (format === 'score-breakdown' && data.trend && data.report) {
    const t  = data.trend;
    const fw = pickLang(lang, t.taime_framework_pt_br, t.taime_framework_en);
    const dims = fw?.score_dimensions;
    if (!dims) {
      throw new Error(`Trend ${t.id} has no score_dimensions in language ${lang}; cannot build score-breakdown post.`);
    }
    const url = reportPublicUrl(t.report_id, t.reports?.is_public);
    return [
      langInstr,
      '',
      `FORMAT: score-breakdown`,
      `Period: ${data.report.period}`,
      `Trend title: ${pickTrendTitle(t, lang)}`,
      `TAIME Score: ${t.taime_score} / 100`,
      `5 dimensions (each 0-100, with interpretive label when available):`,
      `  - Market Maturity:      ${dims.market_maturity.score}      ${dims.market_maturity.label      ?? ''}`,
      `  - Competitive Pressure: ${dims.competitive_pressure.score} ${dims.competitive_pressure.label ?? ''}`,
      `  - Strategic Impact:     ${dims.strategic_impact.score}     ${dims.strategic_impact.label     ?? ''}`,
      `  - Execution Complexity: ${dims.execution_complexity.score} ${dims.execution_complexity.label ?? ''}`,
      `  - Competitive Lag Risk: ${dims.competitive_lag_risk.score} ${dims.competitive_lag_risk.label ?? ''}`,
      ``,
      `CTA link: ${url}`,
      ``,
      `Build a SCORE BREAKDOWN post: hook line referring to the trend, then 5 short lines (one per dimension) in plain executive language, each translating the score into a strategic implication (e.g. "Competitive pressure 92: gap is compounding fast"). End with the overall TAIME Score, then CTA + hashtags. 90-140 words body.`,
    ].join('\n');
  }

  throw new Error(`Unsupported format or missing data for format=${format}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  requireEnv();
  const { format, trendId, reportId, lang } = parseArgs();

  console.log('╔══════════════════════════════════════╗');
  console.log('║  TAIME — LinkedIn post generator     ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Format:    ${format}`);
  console.log(`Language:  ${lang}`);
  if (trendId)  console.log(`Trend ID:  ${trendId}`);
  if (reportId) console.log(`Report ID: ${reportId}`);
  console.log();

  // ── Data load ──
  let report: ReportRow | undefined;
  let trend:  TrendRow  | undefined;
  let radar:  RadarSignalRow[] | undefined;

  if (format === 'radar-pulse') {
    radar = await fetchRadarSignals48h();
    if (!radar || radar.length === 0) {
      console.error('Nenhum sinal de radar nas últimas 48h — abortar.');
      process.exit(1);
    }
    console.log(`Loaded: ${radar.length} radar signals from last 48h.`);
  } else {
    // Precisa de trend (e o report associado)
    if (trendId) {
      const t = await fetchTrendById(trendId);
      if (!t) { console.error(`Trend ${trendId} não encontrada.`); process.exit(1); }
      trend  = t;
    }
    const r = await fetchReport(reportId ?? trend?.report_id);
    if (!r) { console.error('Nenhum relatório publicado encontrado.'); process.exit(1); }
    report = r;
    if (!trend) {
      const top = await fetchTopTrend(r.id);
      if (!top) { console.error(`Relatório ${r.id} não tem trends.`); process.exit(1); }
      trend = top;
    }
    console.log(`Loaded: report ${report.id} (${report.period}), trend rank=${trend.rank} score=${trend.taime_score}`);
    console.log(`Title:  "${pickTrendTitle(trend, lang).slice(0, 80)}"`);
  }
  console.log();

  // ── Build prompt + call Claude ──
  const userPrompt = buildUserPrompt(format, lang, { report, trend, radar });
  console.log('Calling Claude...');
  const raw = await callClaude(SYSTEM_PROMPT, userPrompt);
  const sanitized = stripEmDash(raw);

  // ── Persist ──
  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve(process.cwd(), 'output', 'linkedin');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `post-${today}-${format}.md`);

  const metadataBlock = [
    '',
    '## Metadata',
    '',
    `- Format: ${format}`,
    `- Language: ${lang}`,
    report ? `- Source report: ${report.id} (period ${report.period})` : null,
    trend  ? `- Source trend:  ${trend.id} (rank ${trend.rank}, score ${trend.taime_score})` : null,
    radar  ? `- Radar signals window: last 48h (${radar.length} loaded)` : null,
    `- Generated: ${new Date().toISOString()}`,
    `- Model: ${cfg.model}`,
    '',
  ].filter(Boolean).join('\n');

  const header = `# LinkedIn post, ${format}, ${today}\n\n`;
  const body = `${header}${sanitized.trim()}\n${metadataBlock}`;
  await fs.writeFile(outPath, body, 'utf-8');

  console.log(`\n✓ Draft salvo em: ${outPath}\n`);
  console.log('────────────────────────── PREVIEW ──────────────────────────');
  console.log(sanitized.trim());
  console.log('─────────────────────────────────────────────────────────────');
}

main().catch(err => {
  console.error('\n✗ Erro fatal:', err);
  process.exit(1);
});
