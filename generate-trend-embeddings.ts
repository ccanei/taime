#!/usr/bin/env npx ts-node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback para .env
/**
 * TAIME - Trend Embeddings Generator (camada fina)
 *
 * Para cada trend de relatorios status='published', gera DOIS embeddings
 * (lang 'pt' e 'en') com OpenAI text-embedding-3-small (1536 dims) e grava em
 * report_trend_embeddings. Espelha generate-embeddings.ts e reusa o mesmo
 * cliente/modelo via embeddings-shared.ts.
 *
 * O conteudo embeddado concatena, no idioma de `lang`, os campos SEMANTICOS da
 * trend nesta ordem: title, taime_score_rationale, taime_framework,
 * then_now_next, org_implications, recommended_move. NAO inclui scores.
 *
 * Idempotente por (trend_id, lang): pula chunks que ja existem.
 *
 * Usage: npx ts-node generate-trend-embeddings.ts
 * Env:   OPENAI_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 */

import {
  EMBEDDING_MODEL,
  embed,
  vectorLiteral,
  makeRest,
  sleep,
} from './embeddings-shared';

// ─── Types ───────────────────────────────────────────────────────────────────

type Lang = 'pt' | 'en';

interface TrendRow {
  id:                          string;
  report_id:                   string;
  rank:                        number;
  category:                    string | null;
  theme_slug:                  string | null;
  title_pt_br:                 string | null;
  title_en:                    string | null;
  taime_score_rationale_pt_br: string | null;
  taime_score_rationale_en:    string | null;
  taime_framework_pt_br:       Record<string, unknown> | null;
  taime_framework_en:          Record<string, unknown> | null;
  then_now_next_pt_br:         Record<string, unknown> | null;
  then_now_next_en:            Record<string, unknown> | null;
  org_implications_pt_br:      Record<string, unknown> | null;
  org_implications_en:         Record<string, unknown> | null;
  recommended_move_pt_br:      string | null;
  recommended_move_en:         string | null;
  reports:                     { period: string | null } | null;
}

interface ExistingChunk { trend_id: string; lang: Lang }

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  supabaseUrl:      process.env.SUPABASE_URL ?? '',
  supabaseKey:      process.env.SUPABASE_SERVICE_KEY ?? '',
  openaiKey:        process.env.OPENAI_API_KEY ?? '',
  model:            EMBEDDING_MODEL,
  maxRetries:       2,
  retryDelayMs:     2_000,
  interItemDelayMs: 120,
  fetchTimeoutMs:   30_000,
  pageSize:         1_000,
};

const rest = makeRest(cfg.supabaseUrl, cfg.supabaseKey);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireEnv(): void {
  const missing = (['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const)
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Faltam variaveis de ambiente: ${missing.join(', ')}`);
    process.exit(1);
  }
}

/** Busca todas as paginas de um recurso PostgREST (contorna o limite de linhas). */
async function fetchAll<T>(pathNoRange: string): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await rest<T[]>(`${pathNoRange}&limit=${cfg.pageSize}&offset=${offset}`);
    out.push(...page);
    if (page.length < cfg.pageSize) break;
    offset += cfg.pageSize;
  }
  return out;
}

/** Extrai valores de um objeto JSONB nas chaves dadas, na ordem, ignorando vazios. */
function pickJsonb(obj: Record<string, unknown> | null, keys: string[]): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const out: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length > 0) out.push(v.trim());
  }
  return out;
}

const FRAMEWORK_KEYS = ['type', 'act', 'impact', 'move', 'exit'];
const TNN_KEYS       = ['then', 'now', 'next'];
const ORG_KEYS       = ['technology', 'hr', 'finance', 'marketing', 'operations'];

/** Monta o texto a embeddar para uma trend num idioma. So conteudo semantico. */
function buildTrendContent(t: TrendRow, lang: Lang): string {
  const pt = lang === 'pt';
  const title     = pt ? t.title_pt_br                 : t.title_en;
  const rationale = pt ? t.taime_score_rationale_pt_br : t.taime_score_rationale_en;
  const framework = pt ? t.taime_framework_pt_br        : t.taime_framework_en;
  const tnn       = pt ? t.then_now_next_pt_br          : t.then_now_next_en;
  const org       = pt ? t.org_implications_pt_br       : t.org_implications_en;
  const move      = pt ? t.recommended_move_pt_br       : t.recommended_move_en;

  const parts: string[] = [];
  if (title && title.trim())         parts.push(title.trim());
  if (rationale && rationale.trim()) parts.push(rationale.trim());

  const fw = pickJsonb(framework, FRAMEWORK_KEYS);
  if (fw.length) parts.push(fw.join('\n'));

  const tn = pickJsonb(tnn, TNN_KEYS);
  if (tn.length) parts.push(tn.join('\n'));

  const og = pickJsonb(org, ORG_KEYS);
  if (og.length) parts.push(og.join('\n'));

  if (move && move.trim()) parts.push(move.trim());

  return parts.join('\n\n');
}

async function saveChunk(row: {
  trend_id: string; report_id: string; period: string; rank: number;
  lang: Lang; theme_slug: string | null; category: string | null;
  content: string; vec: number[];
}): Promise<void> {
  await rest<null>(`report_trend_embeddings?on_conflict=trend_id,lang`, {
    method:  'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      trend_id:   row.trend_id,
      report_id:  row.report_id,
      period:     row.period,
      rank:       row.rank,
      lang:       row.lang,
      theme_slug: row.theme_slug,
      category:   row.category,
      content:    row.content,
      embedding:  vectorLiteral(row.vec),
    }),
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  requireEnv();

  console.log('╔══════════════════════════════════════╗');
  console.log('║  TAIME - Trend Embeddings Generator  ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Modelo: ${cfg.model} (1536 dims)`);

  // Trends de relatorios publicados (join para herdar period).
  const select =
    'id,report_id,rank,category,theme_slug,' +
    'title_pt_br,title_en,taime_score_rationale_pt_br,taime_score_rationale_en,' +
    'taime_framework_pt_br,taime_framework_en,then_now_next_pt_br,then_now_next_en,' +
    'org_implications_pt_br,org_implications_en,recommended_move_pt_br,recommended_move_en,' +
    'reports!inner(period,status)';
  const trends = await fetchAll<TrendRow>(
    `report_trends?select=${select}&reports.status=eq.published&order=created_at.asc`,
  );

  // Chunks ja existentes (para idempotencia por trend_id+lang).
  const existing = await fetchAll<ExistingChunk>(
    `report_trend_embeddings?select=trend_id,lang&order=trend_id.asc`,
  );
  const have = new Set(existing.map(e => `${e.trend_id}:${e.lang}`));

  // Monta a lista de jobs pendentes (2 por trend, menos os que ja existem).
  const langs: Lang[] = ['pt', 'en'];
  const jobs: Array<{ trend: TrendRow; lang: Lang }> = [];
  for (const t of trends) {
    for (const lang of langs) {
      if (!have.has(`${t.id}:${lang}`)) jobs.push({ trend: t, lang });
    }
  }

  console.log(`Trends publicadas:    ${trends.length}`);
  console.log(`Chunks ja existentes: ${have.size}`);
  console.log(`Chunks pendentes:     ${jobs.length} (PT+EN)`);
  console.log('──────────────────────────────────────────────────');

  if (jobs.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  let ok = 0;
  let failed = 0;
  let totalTokens = 0;
  const failures: Array<{ id: string; lang: Lang; error: string }> = [];

  for (let i = 0; i < jobs.length; i++) {
    const { trend, lang } = jobs[i];
    const period = trend.reports?.period;
    const prefix = `[${i + 1}/${jobs.length}]`;
    const label = (lang === 'pt' ? trend.title_pt_br : trend.title_en) ?? trend.id;
    const shortLabel = label.length > 50 ? label.slice(0, 47) + '...' : label;

    if (!period) {
      console.log(`${prefix} - "${shortLabel}" [${lang}] sem period (relatorio sem data); pulado`);
      failed++;
      failures.push({ id: trend.id, lang, error: 'report sem period' });
      continue;
    }

    const content = buildTrendContent(trend, lang);
    if (!content.trim()) {
      console.log(`${prefix} - "${shortLabel}" [${lang}] conteudo vazio; pulado`);
      failed++;
      failures.push({ id: trend.id, lang, error: 'conteudo vazio (framework/campos vazios)' });
      continue;
    }

    let lastErr = '';
    let success = false;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      try {
        const { vector, totalTokens: tk } = await embed(content, {
          openaiKey: cfg.openaiKey, model: cfg.model, timeoutMs: cfg.fetchTimeoutMs,
        });
        await saveChunk({
          trend_id: trend.id, report_id: trend.report_id, period, rank: trend.rank,
          lang, theme_slug: trend.theme_slug, category: trend.category, content, vec: vector,
        });
        totalTokens += tk;
        console.log(`${prefix} "${shortLabel}" [${lang}]... OK`);
        ok++;
        success = true;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        if (attempt < cfg.maxRetries) {
          console.log(`${prefix} tentativa ${attempt + 1} falhou: ${lastErr.slice(0, 120)}; aguardando ${cfg.retryDelayMs}ms...`);
          await sleep(cfg.retryDelayMs);
        }
      }
    }

    if (!success) {
      console.log(`${prefix} x "${shortLabel}" [${lang}] falhou: ${lastErr.slice(0, 160)}`);
      failed++;
      failures.push({ id: trend.id, lang, error: lastErr });
    }

    if (i < jobs.length - 1) await sleep(cfg.interItemDelayMs);
  }

  // Custo: text-embedding-3-small = US$ 0,02 por 1M tokens.
  const usd   = (totalTokens / 1_000_000) * 0.02;
  const cents = usd * 100;

  console.log('──────────────────────────────────────────────────');
  console.log(`✓ Chunks gerados:  ${ok}`);
  console.log(`x Falharam/pulados: ${failed}`);
  console.log(`Tokens consumidos: ${totalTokens}`);
  console.log(`Custo estimado:    US$ ${usd.toFixed(5)} (${cents.toFixed(3)} centavos de dolar)`);
  if (failures.length > 0) {
    console.log('\nFalhas/pulos:');
    for (const f of failures) console.log(`  - ${f.id} [${f.lang}]: ${f.error.slice(0, 160)}`);
  }
}

main().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
