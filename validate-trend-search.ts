#!/usr/bin/env npx ts-node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
/**
 * TAIME - Validacao da busca fina por trend (match_trend_chunks).
 *
 * Gera o embedding de 3 perguntas-teste (mesmo modelo do pipeline) e chama a
 * RPC match_trend_chunks, imprimindo os top resultados. Prova que a busca fina
 * traz trends de periodos distintos (incl. as antigas que o router top-6 nao
 * pegava) e que funciona de forma bilingue (query PT achando chunks EN).
 *
 * Pre-requisitos: report_trend_embeddings populada + funcao match_trend_chunks
 * criada no banco.
 *
 * Usage: npx ts-node validate-trend-search.ts
 */

import { EMBEDDING_MODEL, embed, makeRest } from './embeddings-shared';

const cfg = {
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseKey: process.env.SUPABASE_SERVICE_KEY ?? '',
  openaiKey:   process.env.OPENAI_API_KEY ?? '',
  matchCount:  8,
  // Strategic: piso muito antigo libera todo o acervo.
  periodFloor: '0001-01-01',
};

const rest = makeRest(cfg.supabaseUrl, cfg.supabaseKey);

interface ChunkResult {
  trend_id:   string;
  report_id:  string;
  period:     string;
  rank:       number;
  lang:       string;
  theme_slug: string | null;
  category:   string | null;
  content:    string;
  similarity: number;
}

const QUERIES: Array<{ q: string; note: string }> = [
  { q: 'AI coding evolution over time', note: 'AI coding em periodos distintos' },
  { q: 'cybersecurity quantum risk',    note: 'cyber/quantum' },
  { q: 'governanca de IA',              note: 'query PT achando chunks (prova bilingue)' },
];

async function runQuery(q: string): Promise<ChunkResult[]> {
  const { vector } = await embed(q, { openaiKey: cfg.openaiKey, model: EMBEDDING_MODEL });
  return rest<ChunkResult[]>('rpc/match_trend_chunks', {
    method: 'POST',
    body: JSON.stringify({
      query_embedding: vector,
      period_floor:    cfg.periodFloor,
      match_count:     cfg.matchCount,
    }),
  });
}

async function main(): Promise<void> {
  const missing = (['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const)
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Faltam variaveis de ambiente: ${missing.join(', ')}`);
    process.exit(1);
  }

  for (const { q, note } of QUERIES) {
    console.log(`\n══ Query: "${q}"  (${note})`);
    console.log('────────────────────────────────────────────────────────────');
    let rows: ChunkResult[];
    try {
      rows = await runQuery(q);
    } catch (e) {
      console.error(`  ERRO: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (rows.length === 0) {
      console.log('  (sem resultados)');
      continue;
    }
    for (const r of rows) {
      const sim = r.similarity.toFixed(4);
      const title = r.content.split('\n')[0].slice(0, 64);
      console.log(
        `  sim=${sim}  period=${r.period}  rank=${r.rank}  lang=${r.lang}` +
        `  theme=${r.theme_slug ?? '-'}  cat=${r.category ?? '-'}`,
      );
      console.log(`     ${title}`);
    }
  }
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
