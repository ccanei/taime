#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * TAIME — Report Embeddings Generator
 *
 * Gera embeddings (OpenAI text-embedding-3-small, 1536 dims) para todos
 * os relatórios publicados que ainda não têm vetor, e grava em
 * reports.embedding (pgvector).
 *
 * O texto embedado combina PT e EN num único blob (título + executive
 * summary + títulos/categorias das trends), para que a busca por
 * similaridade funcione nos dois idiomas.
 *
 * Usage: npx ts-node generate-embeddings.ts
 * Env:   OPENAI_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReportRow {
  id:                       string;
  title_pt_br:              string | null;
  title_en:                 string | null;
  executive_summary_pt_br:  string | null;
  executive_summary_en:     string | null;
}

interface TrendRow {
  title_pt_br: string | null;
  title_en:    string | null;
  category:    string | null;
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  supabaseUrl:    (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:    process.env.SUPABASE_SERVICE_KEY ?? '',
  openaiKey:      process.env.OPENAI_API_KEY ?? '',
  openaiEndpoint: 'https://api.openai.com/v1/embeddings',
  model:          'text-embedding-3-small',
  maxRetries:     2,
  retryDelayMs:   2_000,
  interItemDelayMs: 250,        // pequena pausa entre relatórios
  fetchTimeoutMs: 30_000,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireEnv(): void {
  const missing = (['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const)
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Faltam variáveis de ambiente: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    apikey:        cfg.supabaseKey,
    Authorization: `Bearer ${cfg.supabaseKey}`,
    'Content-Type': 'application/json',
    ...((init.headers ?? {}) as Record<string, string>),
  };
  const r = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`PostgREST ${r.status}: ${body}`);
  }
  // PATCH com Prefer: return=minimal devolve 204 sem body
  if (r.status === 204) return null as T;
  return r.json() as Promise<T>;
}

function buildEmbedText(report: ReportRow, trends: TrendRow[]): string {
  const parts: string[] = [];

  if (report.title_pt_br) parts.push(`TÍTULO PT-BR: ${report.title_pt_br}`);
  if (report.title_en)    parts.push(`TITLE EN: ${report.title_en}`);

  if (report.executive_summary_pt_br) parts.push(`RESUMO EXECUTIVO PT-BR:\n${report.executive_summary_pt_br}`);
  if (report.executive_summary_en)    parts.push(`EXECUTIVE SUMMARY EN:\n${report.executive_summary_en}`);

  if (trends.length > 0) {
    const trendBlock = trends.map((t, i) => {
      const bits: string[] = [];
      bits.push(`Trend ${i + 1}`);
      if (t.title_pt_br) bits.push(`PT: ${t.title_pt_br}`);
      if (t.title_en)    bits.push(`EN: ${t.title_en}`);
      if (t.category)    bits.push(`Categoria: ${t.category}`);
      return bits.join(' · ');
    }).join('\n');
    parts.push(`TRENDS:\n${trendBlock}`);
  }

  return parts.join('\n\n');
}

async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), init.timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function embed(text: string): Promise<number[]> {
  const r = await fetchWithTimeout(cfg.openaiEndpoint, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${cfg.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: cfg.model, input: text }),
    timeoutMs: cfg.fetchTimeoutMs,
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`OpenAI ${r.status}: ${body.slice(0, 200)}`);
  }

  const json = await r.json() as OpenAIEmbeddingResponse;
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== 1536) {
    throw new Error(`Embedding inválido: length=${vec?.length ?? 'n/a'}`);
  }
  return vec;
}

function vectorLiteral(vec: number[]): string {
  // pgvector via PostgREST aceita string no formato '[v1,v2,v3,...]'
  return `[${vec.join(',')}]`;
}

async function saveEmbedding(id: string, vec: number[]): Promise<void> {
  await rest<null>(`reports?id=eq.${id}`, {
    method:  'PATCH',
    headers: { Prefer: 'return=minimal' },
    body:    JSON.stringify({ embedding: vectorLiteral(vec) }),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  requireEnv();

  console.log('╔══════════════════════════════════╗');
  console.log('║  TAIME — Embeddings Generator    ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Modelo: ${cfg.model} (1536 dims)`);

  // Total publicado (referência: quantos já têm embedding)
  const publishedAll = await rest<Array<{ id: string }>>(
    `reports?status=eq.published&select=id`,
  );
  const total = publishedAll.length;

  // Pendentes (sem embedding)
  const pending = await rest<ReportRow[]>(
    `reports?status=eq.published&embedding=is.null` +
    `&select=id,title_pt_br,title_en,executive_summary_pt_br,executive_summary_en` +
    `&order=created_at.asc`,
  );

  const skipped = total - pending.length;
  console.log(`Publicados:           ${total}`);
  console.log(`Já com embedding:     ${skipped} (pulados)`);
  console.log(`Pendentes:            ${pending.length}`);
  console.log('──────────────────────────────────────────────────');

  if (pending.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  let ok = 0;
  let failed = 0;
  const failures: Array<{ id: string; title: string; error: string }> = [];

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    const label = r.title_pt_br ?? r.title_en ?? r.id;
    const shortLabel = label.length > 60 ? label.slice(0, 57) + '...' : label;
    const prefix = `[${i + 1}/${pending.length}]`;

    let lastErr = '';
    let success = false;

    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      try {
        const trends = await rest<TrendRow[]>(
          `report_trends?report_id=eq.${r.id}` +
          `&select=title_pt_br,title_en,category` +
          `&order=rank.asc`,
        );

        const text = buildEmbedText(r, trends);
        const vec  = await embed(text);
        await saveEmbedding(r.id, vec);

        console.log(`${prefix} Embedding "${shortLabel}"... OK (${trends.length} trends)`);
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
      console.log(`${prefix} ✗ "${shortLabel}" — falhou após ${cfg.maxRetries + 1} tentativas: ${lastErr.slice(0, 200)}`);
      failed++;
      failures.push({ id: r.id, title: label, error: lastErr });
    }

    // pequena pausa entre relatórios para não estressar rate limits
    if (i < pending.length - 1) await sleep(cfg.interItemDelayMs);
  }

  console.log('──────────────────────────────────────────────────');
  console.log(`✓ Embeddings gerados: ${ok}`);
  console.log(`~ Já existiam:        ${skipped}`);
  console.log(`✗ Falharam:           ${failed}`);
  if (failed > 0) {
    console.log('\nFalhas:');
    for (const f of failures) {
      console.log(`  - ${f.id}  "${f.title.slice(0, 60)}"`);
      console.log(`    ${f.error.slice(0, 200)}`);
    }
  }
}

main().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
