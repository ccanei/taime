import 'dotenv/config';
import * as fs from 'fs';
/**
 * Relatorio comparativo do experimento A/B de coleta (junho/2023).
 *   A (full):    2023-06-01 (janela 1-15)  e 2023-06-16 (janela 16-30)
 *   B (minimal): 2023-06-08 (pareia 06-01) e 2023-06-23 (pareia 06-16)
 * So leitura. Nao altera nada no banco.
 */

const cfg = {
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY ?? '',
};

interface Flag { id: string; severity: string; category: string; detail?: string }
interface ReportRow {
  id: string; period: string; report_number: number | null; status: string;
  signal_count: number | null; validation_verdict: string | null;
  published_at: string | null; validation_flags: Flag[] | null;
}
interface TrendRow { rank: number; taime_score: number; title_en: string; category: string | null; theme_slug: string | null }

async function dbGet<T>(p: string): Promise<T[]> {
  const r = await fetch(`${cfg.supabaseUrl}/rest/v1/${p}`, {
    headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T[]>;
}

interface PeriodStats {
  period: string;
  signalsTotal: number;
  signalsNoise: number;
  noisePct: number;
  clusters: number;
  reports: ReportRow[];
  trends: TrendRow[];
  categories: string[];     // distinct report_trends.category
  themes: string[];         // distinct report_trends.theme_slug
  temporalBreach: number;
  verdicts: string[];
}

async function collectStats(period: string): Promise<PeriodStats> {
  const total = await dbGet<{ id: string }>(`signals?period=eq.${period}&select=id`);
  const noise = await dbGet<{ id: string }>(`signals?period=eq.${period}&is_noise=eq.true&select=id`);
  const clusters = await dbGet<{ id: string }>(`signal_clusters?period=eq.${period}&select=id`);
  const reports = await dbGet<ReportRow>(
    `reports?period=eq.${period}&select=id,period,report_number,status,signal_count,validation_verdict,published_at,validation_flags&order=report_number.asc`,
  );

  const trends: TrendRow[] = [];
  let temporalBreach = 0;
  const verdicts: string[] = [];
  for (const r of reports) {
    const t = await dbGet<TrendRow>(
      `report_trends?report_id=eq.${r.id}&select=rank,taime_score,title_en,category,theme_slug&order=rank.asc`,
    );
    trends.push(...t);
    verdicts.push(r.validation_verdict ?? '-');
    for (const f of (r.validation_flags ?? [])) {
      if (f.id === 'temporal_breach' || f.category === 'temporal') temporalBreach++;
    }
  }

  const categories = [...new Set(trends.map(t => t.category).filter((c): c is string => !!c))].sort();
  const themes     = [...new Set(trends.map(t => t.theme_slug).filter((c): c is string => !!c))].sort();

  return {
    period,
    signalsTotal: total.length,
    signalsNoise: noise.length,
    noisePct: total.length ? (noise.length / total.length) * 100 : 0,
    clusters: clusters.length,
    reports,
    trends,
    categories,
    themes,
    temporalBreach,
    verdicts,
  };
}

function fmtPct(n: number): string { return `${n.toFixed(1)}%`; }

function line(s: PeriodStats): string {
  return `  sinais=${s.signalsTotal} | ruido=${s.signalsNoise} (${fmtPct(s.noisePct)}) | uteis=${s.signalsTotal - s.signalsNoise} | clusters=${s.clusters} | relatorios=${s.reports.length} | trends=${s.trends.length}`;
}

function diff(aList: string[], bList: string[]): { onlyA: string[]; onlyB: string[]; both: string[] } {
  const A = new Set(aList), B = new Set(bList);
  return {
    onlyA: aList.filter(x => !B.has(x)),
    onlyB: bList.filter(x => !A.has(x)),
    both:  aList.filter(x => B.has(x)),
  };
}

// ── Custo Opus de B a partir dos logs do experimento ─────────────────────────
// Soma os dois logs-sombra. O regex so casa as linhas do generate (Opus):
// "Xin/Yout +Zwritten|cached" sem espaco. Filter (Haiku) e analyze (Sonnet)
// usam "Tokens: Xin / Yout" (com espacos) e nao entram na conta.
function opusCostFromLogs(logPaths: string[]): { i: number; o: number; w: number; r: number; usd: number } | null {
  const existing = logPaths.filter(p => fs.existsSync(p));
  if (existing.length === 0) return null;
  const I = 15, O = 75, W = 18.75, R = 1.50; // USD por 1M tokens (Opus)
  const re = /(\d+)in\/(\d+)out\s+\+(\d+)(written|cached)/g;
  let i = 0, o = 0, w = 0, r = 0;
  for (const p of existing) {
    const log = fs.readFileSync(p, 'utf8');
    for (const m of log.matchAll(re)) {
      i += +m[1]; o += +m[2];
      if (m[4] === 'written') w += +m[3]; else r += +m[3];
    }
  }
  const usd = (i / 1e6) * I + (o / 1e6) * O + (w / 1e6) * W + (r / 1e6) * R;
  return { i, o, w, r, usd };
}

function pairBlock(label: string, a: PeriodStats, b: PeriodStats): void {
  console.log(`\n████ ${label} ████`);
  console.log(`A  ${a.period} (full):`);
  console.log(line(a));
  console.log(`B  ${b.period} (minimal):`);
  console.log(line(b));

  const cat = diff(a.categories, b.categories);
  console.log(`\n  CATEGORIAS DE TREND`);
  console.log(`   A (${a.period}): ${a.categories.join(', ') || '(nenhuma)'}`);
  console.log(`   B (${b.period}): ${b.categories.join(', ') || '(nenhuma)'}`);
  console.log(`   >> B trouxe que A NAO tinha: ${cat.onlyB.join(', ') || '(nenhuma)'}`);
  console.log(`   >> A tinha que B perdeu:     ${cat.onlyA.join(', ') || '(nenhuma)'}`);
  console.log(`   >> em ambos:                 ${cat.both.join(', ') || '(nenhuma)'}`);

  const th = diff(a.themes, b.themes);
  console.log(`\n  THEME_SLUG (granularidade fina)`);
  console.log(`   >> B trouxe que A NAO tinha: ${th.onlyB.join(', ') || '(nenhum)'}`);
  console.log(`   >> A tinha que B perdeu:     ${th.onlyA.join(', ') || '(nenhum)'}`);

  console.log(`\n  VALIDACAO`);
  console.log(`   A verdicts: [${a.verdicts.join(', ')}] | temporal_breach=${a.temporalBreach}`);
  console.log(`   B verdicts: [${b.verdicts.join(', ')}] | temporal_breach=${b.temporalBreach}`);
}

async function main() {
  const A1 = await collectStats('2023-06-01');
  const B1 = await collectStats('2023-06-08');
  const A2 = await collectStats('2023-06-16');
  const B2 = await collectStats('2023-06-23');

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  EXPERIMENTO A/B DE COLETA — junho/2023                     ║');
  console.log('║  A = full (TOPIC_BY_CATEGORY)  vs  B = minimal (site:only)  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  pairBlock('PAR 1 — janela 1-15  (A 06-01  vs  B 06-08)', A1, B1);
  pairBlock('PAR 2 — janela 16-30 (A 06-16  vs  B 06-23)', A2, B2);

  // Agregado A vs B
  const aCats = [...new Set([...A1.categories, ...A2.categories])].sort();
  const bCats = [...new Set([...B1.categories, ...B2.categories])].sort();
  const aggCat = diff(aCats, bCats);
  console.log(`\n████ AGREGADO A vs B (categorias de trend) ████`);
  console.log(`   A total: ${aCats.join(', ') || '(nenhuma)'}`);
  console.log(`   B total: ${bCats.join(', ') || '(nenhuma)'}`);
  console.log(`   >> SO em B (ganho do metodo minimal): ${aggCat.onlyB.join(', ') || '(nenhuma)'}`);
  console.log(`   >> SO em A (perda do metodo minimal): ${aggCat.onlyA.join(', ') || '(nenhuma)'}`);

  // Totais
  const sumA = A1.signalsTotal + A2.signalsTotal;
  const sumB = B1.signalsTotal + B2.signalsTotal;
  const trA  = A1.trends.length + A2.trends.length;
  const trB  = B1.trends.length + B2.trends.length;
  const clA  = A1.clusters + A2.clusters;
  const clB  = B1.clusters + B2.clusters;
  console.log(`\n████ TOTAIS ████`);
  console.log(`   Sinais:   A=${sumA}  B=${sumB}  (B/A = ${sumA ? (100 * sumB / sumA).toFixed(0) : '-'}%)`);
  console.log(`   Clusters: A=${clA}   B=${clB}`);
  console.log(`   Trends:   A=${trA}   B=${trB}`);
  console.log(`   temporal_breach total: A=${A1.temporalBreach + A2.temporalBreach}  B=${B1.temporalBreach + B2.temporalBreach}`);

  // Custo Opus de B
  const cost = opusCostFromLogs(['experiment-2023-06-08.log', 'experiment-2023-06-23.log']);
  console.log(`\n████ CUSTO OPUS (B) ████`);
  if (cost) {
    console.log(`   input=${cost.i} output=${cost.o} cache_write=${cost.w} cache_read=${cost.r}`);
    console.log(`   USD estimado (generate Opus dos 2 periodos B): $${cost.usd.toFixed(2)}`);
  } else {
    console.log(`   (logs do experimento ausentes — custo nao calculado)`);
  }

  // Publicacao
  console.log(`\n████ ESTADO DE PUBLICACAO (B deve ser pending_review / published_at=null) ████`);
  for (const s of [B1, B2]) {
    for (const r of s.reports) {
      console.log(`   ${s.period} #${r.report_number} status=${r.status} published_at=${r.published_at ?? 'null'} verdict=${r.validation_verdict ?? '-'}`);
    }
    if (s.reports.length === 0) console.log(`   ${s.period}: (nenhum relatorio ainda)`);
  }
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
