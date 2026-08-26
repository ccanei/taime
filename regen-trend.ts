#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * Regen cirurgica de UMA trend (PT+EN) reutilizando o gerador real de
 * generate-report.ts (mesmo prompt, inclui prevencao). PATCH so na trend alvo:
 * preserva rank, report_id, signal_cluster_id, as trends irmas e o report vivo.
 * NAO publica nada (nao mexe no status; validate decide depois).
 *
 * Uso: PERIOD=2019-05-01 REPORT_ID=<uuid> RANK=5 npx ts-node regen-trend.ts
 */
import {
  callClaudeTrend, formatGlobalContext, loadExistingThemes, sanitizeTrend,
  type Cluster, type Signal, type TrendAnalysis,
} from './generate-report';

const PERIOD = process.env.PERIOD ?? '';
const REPORT_ID = process.env.REPORT_ID ?? '';
const RANK = Number(process.env.RANK ?? '0');
if (!PERIOD || !REPORT_ID || !RANK) { console.error('faltam PERIOD/REPORT_ID/RANK'); process.exit(1); }

const url = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_KEY ?? '';
const H = { apikey: key, Authorization: `Bearer ${key}` };
const g = async <T,>(p: string): Promise<T[]> => {
  const r = await fetch(`${url}/rest/v1/${p}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${p}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T[]>;
};
const patch = async (p: string, body: unknown): Promise<void> => {
  const r = await fetch(`${url}/rest/v1/${p}`, {
    method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${p}: ${r.status} ${await r.text()}`);
};

async function main() {
  // 1. Trend alvo (id + cluster) e estado ANTES.
  const trendRows = await g<Record<string, unknown>>(
    `report_trends?report_id=eq.${REPORT_ID}&rank=eq.${RANK}&select=id,signal_cluster_id,title_pt_br,title_en,taime_score`);
  if (!trendRows.length) { console.error('trend alvo nao encontrada'); process.exit(1); }
  const target = trendRows[0];
  const trendId = target.id as string;
  const clusterId = target.signal_cluster_id as string;
  console.log(`\nRegen ${PERIOD} report ${REPORT_ID.slice(0, 8)} rank ${RANK} (trend ${trendId.slice(0, 8)}, cluster ${clusterId?.slice(0, 8)})`);
  console.log(`ANTES: "${target.title_pt_br}" / "${target.title_en}" score=${target.taime_score}`);

  // 2. Clusters e signals do periodo (para globalContext + o cluster alvo).
  const clusters = await g<Cluster>(`signal_clusters?period=eq.${PERIOD}&order=created_at.asc&select=id,name,description,signal_ids`);
  const cluster = clusters.find(c => c.id === clusterId);
  if (!cluster) { console.error('cluster alvo nao esta nos clusters do periodo'); process.exit(1); }
  const allIds = [...new Set(clusters.flatMap(c => c.signal_ids))];
  const signalMap = new Map<string, Signal>();
  for (let i = 0; i < allIds.length; i += 100) {
    const ids = allIds.slice(i, i + 100).map(id => `"${id}"`).join(',');
    const rows = await g<Signal>(`signals?id=in.(${ids})&select=id,title,content,metadata,sources(name,category)`);
    for (const s of rows) signalMap.set(s.id, s);
  }
  const globalContext = formatGlobalContext(clusters, signalMap);
  const existingThemes = await loadExistingThemes();

  // 3. Gera PT (scores canonicos) e EN (herda scores do PT).
  let pt = await callClaudeTrend(globalContext, cluster, signalMap, 'pt-BR', undefined, existingThemes);
  let en = await callClaudeTrend(globalContext, cluster, signalMap, 'en', pt, existingThemes);
  pt = sanitizeTrend(pt); en = sanitizeTrend(en);

  // 4. Mapeia PT+EN -> colunas (identico a persistReport) e PATCH so nesta trend.
  const patchBody = {
    title_pt_br: pt.title, title_en: en.title,
    category: pt.category, theme_slug: pt.theme_slug,
    taime_score: pt.taime_score,
    taime_score_rationale_pt_br: pt.taime_score_rationale, taime_score_rationale_en: en.taime_score_rationale,
    taime_framework_pt_br: { ...pt.taime_framework, executive_snapshot: pt.executive_snapshot, score_dimensions: pt.score_dimensions, confidence_basis: pt.confidence_basis, limitations: pt.limitations },
    taime_framework_en: { ...en.taime_framework, executive_snapshot: en.executive_snapshot, score_dimensions: en.score_dimensions, confidence_basis: en.confidence_basis, limitations: en.limitations },
    then_now_next_pt_br: pt.then_now_next, then_now_next_en: en.then_now_next,
    org_implications_pt_br: pt.org_implications, org_implications_en: en.org_implications,
    decision_triggers_pt_br: pt.decision_triggers, decision_triggers_en: en.decision_triggers,
    recommended_move_pt_br: pt.recommended_move, recommended_move_en: en.recommended_move,
  };
  await patch(`report_trends?id=eq.${trendId}`, patchBody);
  console.log(`DEPOIS: "${pt.title}" / "${en.title}" score=${pt.taime_score}`);
  console.log(`REGEN_OK ${PERIOD} r${RANK}`);
}
main().catch(e => { console.error('regen fatal:', e); process.exit(1); });
