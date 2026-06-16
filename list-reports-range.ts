import 'dotenv/config';

// Lista relatórios cujo período (start) cai entre FROM e TO. Não altera nada.
// O range FROM=2024-07-01 TO=2024-11-01 cobre todos os períodos quinzenais
// cujo INÍCIO ocorre entre 01/07 e 01/11/2024 (inclusive nas duas pontas).
// Uso: FROM=2024-07-01 TO=2024-11-01 npx ts-node list-reports-range.ts

const cfg = {
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY ?? '',
};

const FROM = process.env.FROM ?? '2024-07-01';
const TO   = process.env.TO   ?? '2024-11-01';

interface ReportRow {
  id:                 string;
  period:             string;
  period_start:       string | null;
  period_end:         string | null;
  period_label:       string | null;
  report_number:      number | null;
  status:             string;
  validation_verdict: string | null;
  validated_at:       string | null;
  published_at:       string | null;
}

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey:        cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

const PENDING = new Set(['generating', 'pending_review', 'draft']);

async function main() {
  console.log(`\nReports com period entre ${FROM} e ${TO}\n`);

  const rows = await dbGet<ReportRow>(
    `reports?period=gte.${FROM}&period=lte.${TO}` +
    `&select=id,period,period_start,period_end,period_label,report_number,status,validation_verdict,validated_at,published_at` +
    `&order=period.asc,report_number.asc`,
  );

  if (rows.length === 0) {
    console.log('Nenhum relatório no range.');
    return;
  }

  const inScope: ReportRow[] = [];
  const skipped: ReportRow[] = [];

  for (const r of rows) {
    if (PENDING.has(r.status)) inScope.push(r);
    else skipped.push(r);
  }

  console.log(`Total no range: ${rows.length}`);
  console.log(`Pendentes (entram no escopo): ${inScope.length}`);
  console.log(`Já aprovados / fora de escopo: ${skipped.length}\n`);

  console.log('─── ESCOPO DE REVALIDAÇÃO (pendentes) ───');
  for (const r of inScope) {
    console.log(
      `  REVALIDAR | period=${r.period} | end=${r.period_end ?? '-'} | #${r.report_number ?? '?'} | status=${r.status} | verdict=${r.validation_verdict ?? '-'} | ${r.period_label ?? ''}`,
    );
  }

  console.log('\n─── PULADOS (não tocar) ───');
  for (const r of skipped) {
    console.log(
      `  PULAR     | period=${r.period} | end=${r.period_end ?? '-'} | #${r.report_number ?? '?'} | status=${r.status} | verdict=${r.validation_verdict ?? '-'} | ${r.period_label ?? ''}`,
    );
  }

  console.log(`\nPeríodos únicos pendentes: ${[...new Set(inScope.map(r => r.period))].sort().join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
