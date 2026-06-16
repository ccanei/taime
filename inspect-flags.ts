import 'dotenv/config';

// Agregador pós-revalidação:
//  - Tabela por relatório (período, #, verdict, totais por severity, e por
//    category com temporal_breach destacado).
//  - Taxa agregada de judge_parse_error (trends com falha / total de trends).
// Uso: FROM=2024-07-01 TO=2024-11-01 npx ts-node inspect-flags.ts

const cfg = {
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY ?? '',
};

const FROM = process.env.FROM ?? '2024-07-01';
const TO   = process.env.TO   ?? '2024-11-01';

interface Flag {
  id:                string;
  severity:          string;
  category:          string;
  trend_rank:        number | null;
  field:             string;
  detail:            string;
}

interface ReportRow {
  id:                 string;
  period:             string;
  period_label:       string | null;
  report_number:      number | null;
  status:             string;
  validation_verdict: string | null;
  validated_at:       string | null;
  validation_flags:   Flag[] | null;
  signal_count:       number | null;
}

interface TrendRow { id: string; report_id: string }

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

const SCOPE = new Set(['generating', 'pending_review', 'draft']);

interface Row {
  period:        string;
  num:           number | null;
  label:         string;
  status:        string;
  verdict:       string;
  validated_at:  string;
  signal_count:  number | null;
  trendsTotal:   number;
  totalFlags:    number;
  blocking:      number;
  warning:       number;
  info:          number;
  catDet:        number;
  catGround:     number;
  catTemporal:   number;
  catSource:     number;
  judgeParseErrors: number;  // trends afetados por parse error
  inScope:       boolean;    // foi revalidado nesta rodada
}

async function main() {
  const reports = await dbGet<ReportRow>(
    `reports?period=gte.${FROM}&period=lte.${TO}` +
    `&select=id,period,period_label,report_number,status,validation_verdict,validated_at,validation_flags,signal_count` +
    `&order=period.asc,report_number.asc`,
  );

  // Contar trends por relatório (PostgREST: pode-se usar count, mas é mais simples
  // buscar id de cada e contar localmente).
  const trendsByReport = new Map<string, number>();
  for (const r of reports) {
    const trends = await dbGet<TrendRow>(`report_trends?report_id=eq.${r.id}&select=id`);
    trendsByReport.set(r.id, trends.length);
  }

  const rows: Row[] = reports.map(r => {
    const fs = r.validation_flags ?? [];
    const judgeTrendRanks = new Set<number>();
    let blocking = 0, warning = 0, info = 0;
    let catDet = 0, catGround = 0, catTemporal = 0, catSource = 0;
    for (const f of fs) {
      if      (f.severity === 'blocking') blocking++;
      else if (f.severity === 'warning')  warning++;
      else if (f.severity === 'info')     info++;
      if      (f.category === 'deterministic') catDet++;
      else if (f.category === 'grounding')     catGround++;
      else if (f.category === 'temporal')      catTemporal++;
      else if (f.category === 'source')        catSource++;
      if (f.id === 'judge_parse_error' && f.trend_rank != null) {
        judgeTrendRanks.add(f.trend_rank);
      }
    }
    return {
      period:           r.period,
      num:              r.report_number,
      label:            r.period_label ?? '',
      status:           r.status,
      verdict:          r.validation_verdict ?? '-',
      validated_at:     r.validated_at ?? '-',
      signal_count:     r.signal_count,
      trendsTotal:      trendsByReport.get(r.id) ?? 0,
      totalFlags:       fs.length,
      blocking, warning, info,
      catDet, catGround, catTemporal, catSource,
      judgeParseErrors: judgeTrendRanks.size,
      inScope:          SCOPE.has(r.status),
    };
  });

  // ── Tabela markdown ────────────────────────────────────────────────────────
  console.log('| Period | # | Label | Status | Verdict | Sig | Trends | Flags | Block | Warn | Det | Grnd | Temporal_breach | Source | Judge_parse_errors |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const mark = r.inScope ? '' : ' *(pulado)*';
    console.log(
      `| ${r.period} | ${r.num ?? '-'} | ${r.label}${mark} | ${r.status} | ${r.verdict} | ${r.signal_count ?? '-'} | ${r.trendsTotal} | ${r.totalFlags} | ${r.blocking} | ${r.warning} | ${r.catDet} | ${r.catGround} | **${r.catTemporal}** | ${r.catSource} | ${r.judgeParseErrors}/${r.trendsTotal} |`,
    );
  }

  // ── Agregados (só do escopo revalidado) ────────────────────────────────────
  const scope = rows.filter(r => r.inScope);
  const trendsTotal       = scope.reduce((s, r) => s + r.trendsTotal, 0);
  const judgeParseTotal   = scope.reduce((s, r) => s + r.judgeParseErrors, 0);
  const temporalBreachTot = scope.reduce((s, r) => s + r.catTemporal, 0);
  const passCount    = scope.filter(r => r.verdict === 'pass').length;
  const failCount    = scope.filter(r => r.verdict === 'fail').length;
  const needsCount   = scope.filter(r => r.verdict === 'needs_review').length;

  console.log('\n## Agregados (só escopo revalidado)');
  console.log(`- Relatórios revalidados: **${scope.length}**`);
  console.log(`- Verdict pass: ${passCount} · needs_review: ${needsCount} · fail: ${failCount}`);
  console.log(`- temporal_breach agregado: **${temporalBreachTot}** (deve ser 0)`);
  console.log(`- judge_parse_error: **${judgeParseTotal} trends** afetados em **${trendsTotal} trends totais** → taxa **${trendsTotal > 0 ? ((judgeParseTotal / trendsTotal) * 100).toFixed(1) : '0.0'}%**`);

  // ── Pulados ────────────────────────────────────────────────────────────────
  const skipped = rows.filter(r => !r.inScope);
  console.log(`\n## Pulados (não tocados): ${skipped.length}`);
  for (const r of skipped) {
    console.log(`- ${r.period} #${r.num} status=${r.status} verdict=${r.verdict} (último validated_at: ${r.validated_at})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
