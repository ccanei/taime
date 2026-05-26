import 'dotenv/config';
import { execSync } from 'child_process';
import * as path from 'path';

const PERIODS = [
  '2026-01-01', '2026-01-16',
  '2026-02-01', '2026-02-16',
  '2026-03-01', '2026-03-16',
  '2026-04-01', '2026-04-16',
];

const BASE = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const KEY  = process.env.SUPABASE_SERVICE_KEY ?? '';
const DIR  = __dirname;

const headers = {
  apikey:         KEY,
  Authorization:  `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer:         'return=minimal',
};

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function del(endpoint: string): Promise<void> {
  const res = await fetch(`${BASE}/rest/v1/${endpoint}`, { method: 'DELETE', headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DELETE ${endpoint}: ${res.status} ${body}`);
  }
}

async function getReportId(period: string): Promise<string | null> {
  const res = await fetch(`${BASE}/rest/v1/reports?period=eq.${period}&select=id&limit=1`, { headers });
  const rows = await res.json() as { id: string }[];
  return rows[0]?.id ?? null;
}

async function signalCount(period: string): Promise<number> {
  const res = await fetch(`${BASE}/rest/v1/signals?period=eq.${period}&select=id`, {
    headers: { ...headers, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' },
  });
  const raw = res.headers.get('content-range') ?? '0/0';
  return parseInt(raw.split('/')[1] ?? '0', 10);
}

async function getFirstThenPeriodLabel(period: string): Promise<string | null> {
  const rId = await getReportId(period);
  if (!rId) return null;
  const res = await fetch(
    `${BASE}/rest/v1/report_trends?report_id=eq.${rId}&select=then_now_next_pt_br&order=rank.asc&limit=1`,
    { headers }
  );
  const rows = await res.json() as { then_now_next_pt_br: { then: string } }[];
  const then = rows[0]?.then_now_next_pt_br?.then ?? '';
  const firstLine = then.split('\n')[0].trim();
  return firstLine.startsWith('PERIOD_LABEL:') ? firstLine : null;
}

async function getScore(period: string): Promise<number | null> {
  const rId = await getReportId(period);
  if (!rId) return null;
  const res = await fetch(
    `${BASE}/rest/v1/report_trends?report_id=eq.${rId}&select=taime_score`,
    { headers }
  );
  const rows = await res.json() as { taime_score: number }[];
  if (!rows.length) return null;
  return Math.round(rows.reduce((s, r) => s + r.taime_score, 0) / rows.length);
}

function run(script: string, period: string): void {
  execSync(`npx ts-node ${script}`, {
    env:   { ...process.env, PERIOD: period },
    stdio: 'inherit',
    cwd:   DIR,
  });
}

interface Summary {
  period:      string;
  score:       number | null;
  periodLabel: string | null;
  ok:          boolean;
}

async function main(): Promise<void> {
  const results: Summary[] = [];

  for (let i = 0; i < PERIODS.length; i++) {
    const period = PERIODS[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${i + 1}/${PERIODS.length}] ${period}`);

    try {
      // PASSO 1 — Delete existing data
      const rId = await getReportId(period);
      if (rId) {
        console.log(`  ∘ Deletando report_trends de ${rId}...`);
        await del(`report_trends?report_id=eq.${rId}`);
        console.log(`  ∘ Deletando report ${rId}...`);
        await del(`reports?id=eq.${rId}`);
      }
      console.log(`  ∘ Deletando signal_clusters...`);
      await del(`signal_clusters?period=eq.${period}`);

      // PASSO 2 — Verify signals exist
      const count = await signalCount(period);
      console.log(`  ∘ Sinais encontrados: ${count}`);
      if (count === 0) {
        console.warn(`  ⚠ Nenhum sinal — pulando ${period}`);
        results.push({ period, score: null, periodLabel: null, ok: false });
        continue;
      }

      // PASSO 3 — Analyze + Generate
      console.log(`  ∘ analyze-signals.ts...`);
      run('analyze-signals.ts', period);

      console.log(`  ∘ generate-report.ts...`);
      run('generate-report.ts', period);

      // PASSO 4 — Verify PERIOD_LABEL
      const pl    = await getFirstThenPeriodLabel(period);
      const score = await getScore(period);
      const ok    = pl !== null;
      console.log(`  ✓ Score médio: ${score ?? '?'} | PERIOD_LABEL: ${pl ?? '✗ ausente'}`);
      results.push({ period, score, periodLabel: pl, ok });

    } catch (err) {
      console.error(`  ✗ Erro em ${period}: ${err}`);
      results.push({ period, score: null, periodLabel: null, ok: false });
    }

    if (i < PERIODS.length - 1) {
      console.log(`  ⏳ Aguardando 15s...`);
      await sleep(15_000);
    }
  }

  // ── Resumo final ──────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('RESUMO FINAL');
  console.log('═'.repeat(60));
  let successCount = 0;
  for (const r of results) {
    const status = r.ok ? '✓' : '✗';
    const label  = r.periodLabel ? r.periodLabel.replace('PERIOD_LABEL:', '').trim() : 'AUSENTE';
    console.log(`${status} ${r.period}  score=${r.score ?? '?'}  label="${label}"`);
    if (r.ok) successCount++;
  }
  console.log(`\n${successCount}/${results.length} períodos regenerados com sucesso.`);

  // Write machine-readable results for LOG
  const fs = await import('fs');
  fs.writeFileSync(
    path.join(DIR, 'regen-jan-apr-results.json'),
    JSON.stringify(results, null, 2),
  );
}

main().catch(e => { console.error(e); process.exit(1); });
