import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
/**
 * TAREFA 4 — Relatorio comparativo A vs B (agosto/2026).
 *   A (producao, full):   2026-08-01
 *   B (sombra, hybrid):   2026-08-08  (mesma janela 1-15)
 * Somente leitura. Nao altera nada no banco.
 */

const ROOT = '/Users/claudineicanei/Documents/Site/taime.tech/taime-CLEAN';
dotenv.config({ path: '.env.local' });
dotenv.config();

const LOGDIR = '/private/tmp/claude-501/-Users-claudineicanei-Documents-Site-taime-tech-taime-CLEAN/be93fdad-5048-4aaf-94f4-279dc7ecb173/scratchpad/exp-logs';

const cfg = {
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY ?? '',
};

interface Flag { id: string; severity?: string; category?: string; detail?: string }
interface ReportRow {
  id: string; period: string; report_number: number | null; status: string;
  signal_count: number | null; validation_verdict: string | null;
  published_at: string | null; validation_flags: Flag[] | null;
}
interface TrendRow { rank: number; taime_score: number; title_en: string; category: string | null; theme_slug: string | null }
interface ClusterRow { id: string; signal_ids: string[] | null }
interface SignalMeta { id: string; is_noise: boolean; metadata: { pass?: string; passes?: string[] } | null }
interface LlmRow {
  caller: string; model: string;
  input_tokens: number | null; output_tokens: number | null;
  cache_read_tokens: number | null; cache_write_tokens: number | null;
}

const PAGE = 1000;
async function dbGetAll<T>(p: string): Promise<T[]> {
  const all: T[] = [];
  for (let off = 0; ; off += PAGE) {
    const sep = p.includes('?') ? '&' : '?';
    const r = await fetch(`${cfg.supabaseUrl}/rest/v1/${p}${sep}limit=${PAGE}&offset=${off}`, {
      headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` },
    });
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json() as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// ── Custo Anthropic (llm_calls) por periodo, via PRICING por 1M ──────────────
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 5, out: 25 }, 'claude-opus-4-7': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 }, 'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};
const DEF = { in: 3, out: 15 };
function priceFor(m: string) { for (const k of Object.keys(PRICING)) if (m.startsWith(k)) return PRICING[k]; return DEF; }
function costOf(r: LlmRow): number {
  const p = priceFor(r.model);
  return (r.input_tokens ?? 0) / 1e6 * p.in
    + (r.cache_read_tokens ?? 0) / 1e6 * p.in * 0.10
    + (r.cache_write_tokens ?? 0) / 1e6 * p.in * 1.25
    + (r.output_tokens ?? 0) / 1e6 * p.out;
}

interface Stats {
  period: string;
  signalsTotal: number; signalsNoise: number; noisePct: number;
  clustersDb: number; clustersFormed: number;
  clusterSizes: number[];
  reports: ReportRow[]; trends: TrendRow[];
  categories: string[]; themes: string[];
  temporalBreach: number; verdicts: string[];
  // hybrid only
  pass?: { onlyTopic: number; onlyOpen: number; both: number;
           noiseTopic: number; totTopic: number; noiseOpen: number; totOpen: number };
  llmByCaller: Record<string, { calls: number; usd: number }>;
  llmUsd: number;
  serperCalls: number;
}

function clustersFormedFromLog(tag: string, dbCount: number): number {
  const f = path.join(LOGDIR, `${tag}__analyze.log`);
  if (!fs.existsSync(f)) return dbCount;
  const log = fs.readFileSync(f, 'utf8');
  const m = log.match(/LLM retornou (\d+) clusters/);
  return m ? parseInt(m[1], 10) : dbCount;
}

async function collect(period: string, tag: string, mode: 'full' | 'hybrid', serperCalls: number): Promise<Stats> {
  const sigs = await dbGetAll<SignalMeta>(`signals?period=eq.${period}&select=id,is_noise,metadata`);
  const clusters = await dbGetAll<ClusterRow>(`signal_clusters?period=eq.${period}&select=id,signal_ids`);
  const reports = await dbGetAll<ReportRow>(
    `reports?period=eq.${period}&select=id,period,report_number,status,signal_count,validation_verdict,published_at,validation_flags&order=report_number.asc`,
  );

  const trends: TrendRow[] = [];
  let temporalBreach = 0; const verdicts: string[] = [];
  for (const r of reports) {
    const t = await dbGetAll<TrendRow>(
      `report_trends?report_id=eq.${r.id}&select=rank,taime_score,title_en,category,theme_slug&order=rank.asc`,
    );
    trends.push(...t);
    verdicts.push(r.validation_verdict ?? '-');
    for (const f of (r.validation_flags ?? [])) if (f.id === 'temporal_breach' || f.category === 'temporal') temporalBreach++;
  }

  const noise = sigs.filter(s => s.is_noise).length;
  const clusterSizes = clusters.map(c => (c.signal_ids ?? []).length).sort((a, b) => b - a);

  let pass: Stats['pass'];
  if (mode === 'hybrid') {
    let onlyTopic = 0, onlyOpen = 0, both = 0, noiseTopic = 0, totTopic = 0, noiseOpen = 0, totOpen = 0;
    for (const s of sigs) {
      const ps: string[] = s.metadata?.passes ?? (s.metadata?.pass ? [s.metadata.pass] : []);
      const hasT = ps.includes('topic'), hasO = ps.includes('open');
      if (hasT && hasO) both++; else if (hasT) onlyTopic++; else if (hasO) onlyOpen++;
      if (hasT) { totTopic++; if (s.is_noise) noiseTopic++; }
      if (hasO) { totOpen++; if (s.is_noise) noiseOpen++; }
    }
    pass = { onlyTopic, onlyOpen, both, noiseTopic, totTopic, noiseOpen, totOpen };
  }

  // Custo Anthropic do periodo
  const llm = await dbGetAll<LlmRow>(`llm_calls?period=eq.${period}&select=caller,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens`);
  const llmByCaller: Record<string, { calls: number; usd: number }> = {};
  let llmUsd = 0;
  for (const r of llm) {
    const c = llmByCaller[r.caller] ?? { calls: 0, usd: 0 };
    c.calls++; c.usd += costOf(r); llmByCaller[r.caller] = c; llmUsd += costOf(r);
  }

  return {
    period, signalsTotal: sigs.length, signalsNoise: noise,
    noisePct: sigs.length ? noise / sigs.length * 100 : 0,
    clustersDb: clusters.length, clustersFormed: clustersFormedFromLog(tag, clusters.length),
    clusterSizes, reports, trends,
    categories: [...new Set(trends.map(t => t.category).filter((c): c is string => !!c))].sort(),
    themes: [...new Set(trends.map(t => t.theme_slug).filter((c): c is string => !!c))].sort(),
    temporalBreach, verdicts, pass, llmByCaller, llmUsd, serperCalls,
  };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function diff(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b);
  return { onlyA: a.filter(x => !B.has(x)), onlyB: b.filter(x => !A.has(x)), both: a.filter(x => B.has(x)) };
}
const pct = (n: number) => `${n.toFixed(1)}%`;

async function main() {
  const A = await collect('2026-08-01', '2026-08-01', 'full', 175);
  const B = await collect('2026-08-08', '2026-08-08_hybrid', 'hybrid', 350);

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  RELATORIO COMPARATIVO A/B — agosto/2026 (janela 1-15)            ║');
  console.log('║  A = producao full (2026-08-01)  vs  B = sombra hybrid (2026-08-08)║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  console.log('\n████ 1) SINAIS COLETADOS ████');
  console.log(`  A: total(pos-dedup)=${A.signalsTotal}  ruido=${A.signalsNoise} (${pct(A.noisePct)})  uteis=${A.signalsTotal - A.signalsNoise}`);
  console.log(`  B: total(pos-dedup)=${B.signalsTotal}  ruido=${B.signalsNoise} (${pct(B.noisePct)})  uteis=${B.signalsTotal - B.signalsNoise}`);
  if (B.pass) {
    console.log('\n  B — quebra por passada (pos-dedup):');
    console.log(`     so topic: ${B.pass.onlyTopic}   so open: ${B.pass.onlyOpen}   nas duas: ${B.pass.both}`);
    console.log(`     ruido topic: ${B.pass.noiseTopic}/${B.pass.totTopic} (${B.pass.totTopic ? pct(B.pass.noiseTopic / B.pass.totTopic * 100) : '-'})`);
    console.log(`     ruido open:  ${B.pass.noiseOpen}/${B.pass.totOpen} (${B.pass.totOpen ? pct(B.pass.noiseOpen / B.pass.totOpen * 100) : '-'})`);
  }

  console.log('\n████ 2) TAXA DE RUIDO ████');
  console.log(`  A: ${pct(A.noisePct)}   B: ${pct(B.noisePct)}`);

  console.log('\n████ 3) CLUSTERS (formados vs sobreviventes ao corte de 18) ████');
  console.log(`  A: formados=${A.clustersFormed}  sobreviveram=${A.clustersDb}`);
  console.log(`  B: formados=${B.clustersFormed}  sobreviveram=${B.clustersDb}`);

  console.log('\n████ 4) DISTRIBUICAO DE DENSIDADE DOS CLUSTERS (sinais por cluster) ████');
  for (const s of [A, B]) {
    const mx = s.clusterSizes[0] ?? 0, mn = s.clusterSizes[s.clusterSizes.length - 1] ?? 0;
    console.log(`  ${s.period}: mais denso=${mx}  mediana=${median(s.clusterSizes)}  menos denso(sobrev.)=${mn}`);
    console.log(`     tamanhos desc: [${s.clusterSizes.join(', ')}]`);
  }

  console.log('\n████ 5) CATEGORIAS DE TREND ████');
  const cat = diff(A.categories, B.categories);
  console.log(`  A: ${A.categories.join(', ') || '(nenhuma)'}`);
  console.log(`  B: ${B.categories.join(', ') || '(nenhuma)'}`);
  console.log(`  >> B trouxe que A NAO tem: ${cat.onlyB.join(', ') || '(nenhuma)'}`);
  console.log(`  >> A tem que B perdeu:     ${cat.onlyA.join(', ') || '(nenhuma)'}`);

  console.log('\n████ 6) THEME_SLUG ████');
  const th = diff(A.themes, B.themes);
  console.log(`  A: ${A.themes.join(', ') || '(nenhum)'}`);
  console.log(`  B: ${B.themes.join(', ') || '(nenhum)'}`);
  console.log(`  >> B trouxe que A NAO tem: ${th.onlyB.join(', ') || '(nenhum)'}`);
  console.log(`  >> A tem que B perdeu:     ${th.onlyA.join(', ') || '(nenhum)'}`);

  console.log('\n████ 7) VALIDACAO ████');
  console.log(`  A verdicts: [${A.verdicts.join(', ')}]  temporal_breach=${A.temporalBreach}`);
  console.log(`  B verdicts: [${B.verdicts.join(', ')}]  temporal_breach=${B.temporalBreach}`);

  console.log('\n████ 8) CUSTO ████');
  console.log(`  Serper (chamadas): A=${A.serperCalls}  B=${B.serperCalls}`);
  const fmtCaller = (s: Stats) => Object.entries(s.llmByCaller).map(([k, v]) => `${k}:${v.calls}ch/$${v.usd.toFixed(3)}`).join('  ');
  console.log(`  Anthropic A ($${A.llmUsd.toFixed(3)}): ${fmtCaller(A)}`);
  console.log(`  Anthropic B ($${B.llmUsd.toFixed(3)}): ${fmtCaller(B)}`);

  console.log('\n████ 9) ESTADO DE PUBLICACAO (ambos devem ser pending_review / published_at=null) ████');
  for (const s of [A, B]) {
    if (!s.reports.length) { console.log(`  ${s.period}: (nenhum relatorio)`); continue; }
    for (const r of s.reports) console.log(`  ${s.period} #${r.report_number} status=${r.status} published_at=${r.published_at ?? 'null'} verdict=${r.validation_verdict ?? '-'} signal_count=${r.signal_count}`);
  }
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
