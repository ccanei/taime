import 'dotenv/config';

/**
 * backfill-trend-theme.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Preenche `category` e `theme_slug` nas trends que JÁ existem no banco,
 * SEM regenerar relatórios, scores ou textos.
 *
 * Pré-requisito: rodar `add-trend-theme.sql` antes (cria as colunas).
 *
 * Uso:
 *   npx ts-node backfill-trend-theme.ts --dry-run   # só mostra, não grava
 *   npx ts-node backfill-trend-theme.ts             # grava de verdade
 *   npx ts-node backfill-trend-theme.ts --force     # reclassifica até quem já tem
 *
 * Env: ANTHROPIC_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 */

// ─── Config (mesmo padrão do generate-report.ts) ───────────────────────────────
const cfg = {
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  supabaseUrl:  (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:  process.env.SUPABASE_SERVICE_KEY ?? '',
  model:        'claude-sonnet-4-6',
  batchSize:    12,            // trends por chamada LLM
};

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

const VALID_CATEGORIES = [
  'IA', 'Cloud', 'Cybersecurity', 'Regulation', 'Infrastructure', 'Data',
  'Market', 'Fintech', 'Automation', 'Observability', 'Engineering',
  'Edge', 'Healthtech', 'Sustainability',
] as const;

// ─── Supabase REST ─────────────────────────────────────────────────────────────
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

// ─── Helpers ───────────────────────────────────────────────────────────────────
function normalizeSlug(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || null;
}

function normalizeCategory(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const found = VALID_CATEGORIES.find(c => c.toLowerCase() === raw.trim().toLowerCase());
  return found ?? null;
}

function repairJson(raw: string): string {
  const text = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('Sem array JSON na resposta');
  return text.slice(start, end + 1);
}

// ─── LLM ────────────────────────────────────────────────────────────────────────
interface TrendRow {
  id: string;
  title_pt_br: string;
  title_en: string | null;
  category: string | null;
  theme_slug: string | null;
}

interface Classification { id: string; category: string; theme_slug: string }

async function classifyBatch(
  trends: TrendRow[],
  existingSlugs: string[],
): Promise<Classification[]> {
  const list = trends.map(t => `- id: ${t.id}\n  título: ${t.title_pt_br}`).join('\n');
  const slugsHint = existingSlugs.length ? existingSlugs.join(', ') : '(nenhum ainda)';

  const prompt =
    `Você classifica trends de inteligência tecnológica. Para CADA trend abaixo, defina:\n` +
    `- "category": EXATAMENTE uma de: ${VALID_CATEGORIES.join(', ')}\n` +
    `- "theme_slug": chave estável em kebab-case ASCII identificando o TEMA ` +
    `(ex.: ia-agentes-autonomos, governanca-ia, repatriacao-cloud). REUTILIZE um slug ` +
    `existente quando a trend for do mesmo tema; só crie novo para tema genuinamente novo.\n\n` +
    `Slugs existentes para reutilizar quando aplicável: ${slugsHint}\n\n` +
    `Trends:\n${list}\n\n` +
    `Responda APENAS um array JSON: [{"id":"...","category":"...","theme_slug":"..."}]. ` +
    `Sem texto fora do JSON.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic: ${await res.text()}`);
  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(repairJson(text)) as Classification[];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const missing = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(k => !process.env[k]);
  if (missing.length) { console.error(`Faltam envs: ${missing.join(', ')}`); process.exit(1); }

  console.log(DRY_RUN ? '🔍 DRY-RUN (não grava)\n' : '✍️  Gravando alterações\n');

  // 1) carrega todas as trends
  const all = await dbGet<TrendRow>(
    `report_trends?select=id,title_pt_br,title_en,category,theme_slug&order=created_at.asc`,
  );

  const pending = FORCE ? all : all.filter(t => !t.category || !t.theme_slug);
  console.log(`Total de trends: ${all.length} · a processar: ${pending.length}\n`);
  if (pending.length === 0) { console.log('Nada a fazer. Use --force para reclassificar.'); return; }

  // slugs já existentes (para reuso) — começa pelos que já estão no banco
  const existingSlugs = new Set<string>(all.map(t => t.theme_slug).filter(Boolean) as string[]);

  let ok = 0, fail = 0;
  for (let i = 0; i < pending.length; i += cfg.batchSize) {
    const batch = pending.slice(i, i + cfg.batchSize);
    const n = Math.floor(i / cfg.batchSize) + 1;
    const total = Math.ceil(pending.length / cfg.batchSize);
    console.log(`Lote ${n}/${total} (${batch.length} trends)...`);

    let results: Classification[];
    try {
      results = await classifyBatch(batch, [...existingSlugs]);
    } catch (e) {
      console.error(`  ✗ lote falhou: ${(e as Error).message}`);
      fail += batch.length;
      continue;
    }

    for (const r of results) {
      const cat  = normalizeCategory(r.category) ?? 'Market';
      const slug = normalizeSlug(r.theme_slug);
      if (!slug) { fail++; continue; }
      existingSlugs.add(slug);

      const trend = batch.find(t => t.id === r.id);
      const label = trend ? trend.title_pt_br.slice(0, 50) : r.id;

      if (DRY_RUN) {
        console.log(`  ${cat.padEnd(14)} ${slug.padEnd(28)} ${label}`);
        ok++;
      } else {
        try {
          await dbPatch('report_trends', r.id, { category: cat, theme_slug: slug });
          ok++;
        } catch (e) {
          console.error(`  ✗ ${r.id}: ${(e as Error).message}`);
          fail++;
        }
      }
    }
  }

  console.log(`\n✓ ${ok} classificadas${DRY_RUN ? ' (dry-run)' : ' e gravadas'} · ✗ ${fail} falhas`);
  if (DRY_RUN) console.log('Rode sem --dry-run para gravar.');
}

main().catch(e => { console.error(e); process.exit(1); });
