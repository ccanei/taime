#!/usr/bin/env npx ts-node
/**
 * Validacao do Passo 4: filtro de plano (period_floor por plano) e deteccao de
 * material fora da janela. Espelha a logica de lib/plan.ts + route.ts sem precisar
 * de sessao autenticada.
 *
 *  - Confirma getAdvisorPeriodFloor: strategic -> 2000-01-01; essential -> hoje-36m.
 *  - Para uma query, chama match_trend_chunks com piso Essential (janela) e com
 *    piso permissivo (arquivo inteiro), e roda collectOutOfWindow para provar a
 *    recusa construtiva (existem trends antes da janela, sem trazer conteudo).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { embed, makeRest } from './embeddings-shared';

const rest = makeRest(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_KEY ?? '');
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? '';
const PERMISSIVE = '2000-01-01';

// ── replica de lib/plan.ts ──────────────────────────────────────────────────
type Plan = 'free' | 'essential' | 'strategic';
function getAdvisorWindowMonths(plan: Plan | null): number | null {
  if (plan === 'strategic') return null;
  return 36;
}
function getAdvisorPeriodFloor(plan: Plan | null, now: Date): string {
  const months = getAdvisorWindowMonths(plan);
  if (months === null) return PERMISSIVE;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// ── replica de collectOutOfWindow (route.ts) ────────────────────────────────
interface Chunk { period: string; theme_slug: string | null; content: string }
interface OOW { period: string; theme_slug: string | null; title: string }
function collectOutOfWindow(chunks: Chunk[], floor: string): OOW[] {
  const items: OOW[] = []; const seen = new Set<string>();
  for (const c of chunks) {
    if (c.period >= floor) continue;
    const key = `${c.period}|${c.theme_slug ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ period: c.period, theme_slug: c.theme_slug, title: c.content.split('\n')[0].slice(0, 100) });
    if (items.length >= 4) break;
  }
  return items;
}

async function match(vector: number[], floor: string): Promise<Chunk[]> {
  return rest<Chunk[]>('rpc/match_trend_chunks', {
    method: 'POST',
    body: JSON.stringify({ query_embedding: vector, period_floor: floor, match_count: 16 }),
  });
}

async function main(): Promise<void> {
  const now = new Date('2026-06-23T00:00:00Z');
  const stratFloor = getAdvisorPeriodFloor('strategic', now);
  const essFloor   = getAdvisorPeriodFloor('essential', now);
  console.log('── period_floor por plano (hoje = 2026-06-23) ──');
  console.log('  strategic :', stratFloor, stratFloor === PERMISSIVE ? 'OK (permissivo)' : 'FALHOU');
  console.log('  essential :', essFloor, essFloor === '2023-06-01' ? 'OK (hoje-36m)' : 'FALHOU');

  // Query que sabidamente tem analise antiga (quantum/cyber vai a 2023-09).
  const q = 'cybersecurity quantum risk over the years';
  console.log(`\n── Query: "${q}" ──`);
  const { vector } = await embed(q, { openaiKey: OPENAI_KEY });

  const wide = await match(vector, PERMISSIVE);
  const ess  = await match(vector, essFloor);
  const widePeriods = [...new Set(wide.map(c => c.period))].sort();
  const essPeriods  = [...new Set(ess.map(c => c.period))].sort();

  console.log('\nStrategic (piso permissivo):');
  console.log('  chunks:', wide.length, '| periodos:', widePeriods.join(', '));

  console.log('\nEssential (piso', essFloor + '):');
  console.log('  chunks:', ess.length, '| periodos:', essPeriods.join(', '));
  const leak = essPeriods.filter(p => p < essFloor);
  console.log('  vazou algo antes do piso?', leak.length ? `FALHOU -> ${leak.join(', ')}` : 'NAO (janela respeitada)');

  const oow = collectOutOfWindow(wide, essFloor);
  console.log('\nDeteccao fora da janela (Essential):');
  console.log('  out_of_window_hit:', oow.length > 0);
  for (const i of oow) console.log(`  - ${i.period} (${i.theme_slug ?? '-'}): ${i.title}`);

  console.log('\nStrategic NAO dispara deteccao (windowMonths === null): out_of_window_hit sempre false.');

  // O arquivo comeca ~2023-08, entao com janela de 36 meses (piso 2023-06) quase
  // tudo cai dentro e nada fica fora HOJE. Para provar que o mecanismo de recusa
  // construtiva DISPARA quando ha material antigo, simulo um piso mais apertado
  // (como se a janela fosse menor ou a data, futura): piso 2025-06-01.
  const tightFloor = '2025-06-01';
  console.log(`\n── Demonstracao do disparo (piso apertado ${tightFloor}) ──`);
  const tight = await match(vector, tightFloor);
  const tightPeriods = [...new Set(tight.map(c => c.period))].sort();
  console.log('  chunks na janela:', tight.length, '| periodos:', tightPeriods.join(', '));
  const tightLeak = tightPeriods.filter(p => p < tightFloor);
  console.log('  vazou antes do piso?', tightLeak.length ? `FALHOU -> ${tightLeak.join(', ')}` : 'NAO (janela respeitada)');
  const oowTight = collectOutOfWindow(wide, tightFloor);
  console.log('  out_of_window_hit:', oowTight.length > 0);
  for (const i of oowTight) console.log(`  - ${i.period} (${i.theme_slug ?? '-'}): ${i.title}`);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
