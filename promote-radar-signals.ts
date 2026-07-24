#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * TAIME, Radar to Signals bridge (enriquecimento opcional)
 *
 * Promove sinais do Radar (radar_signals) para a tabela signals do pipeline de
 * relatorios, como ENRIQUECIMENTO ADICIONAL a coleta normal do collect-signals,
 * NUNCA como substituta. E um passo opcional que roda ANTES do analyze.
 *
 * GROUNDING (inviolavel): o Radar e usado apenas como LISTA DE URLs CANDIDATAS.
 * O conteudo factual vem SEMPRE do fetch do artigo original de cada URL. O resumo
 * ja gerado por LLM no Radar (summary_pt / summary_en) NUNCA vira base factual;
 * serviu so para a triagem de relevancia. O title_pt / title_en do Radar so pode
 * ser usado como ROTULO de fallback, nunca como fato.
 *
 * Fluxo:
 *   1. Seleciona candidatos do Radar cuja data efetiva (published_at quando
 *      presente, senao collected_at) cai na janela quinzenal do periodo.
 *   2. Deduplica por URL contra signals ja existentes no mesmo periodo.
 *   3. Resolve source_id pelo dominio da URL contra a tabela sources. Sem match,
 *      o sinal e PULADO (skipped_no_source). Sem fonte inventada, sem fallback.
 *   4. Busca o conteudo ORIGINAL da URL (fetch). Falha/vazio/paywall e PULADO
 *      (skipped_fetch_failed).
 *   5. Insere em signals os sobreviventes com metadata.origin = 'radar_bridge'.
 *
 * Idempotente: rodar duas vezes nao duplica (dedup por URL cobre isso).
 *
 * Usage:  npx ts-node promote-radar-signals.ts 2026-07-01 [--dry-run]
 *         --dry-run  faz tudo (inclusive o fetch, para medir o rendimento real),
 *                    mas NAO insere em signals. Use para ver o rendimento antes.
 * Env:    SUPABASE_URL  SUPABASE_SERVICE_KEY
 */

import { parsePeriod, isHistorical } from './period-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Source {
  id:   string;
  name: string;
  url:  string;
}

interface RadarRow {
  id:              string;
  title_pt:        string | null;
  title_en:        string | null;
  category:        string | null;
  relevance:       string | null;
  source_category: string | null;
  url:             string;
  published_at:    string | null;
  collected_at:    string | null;
}

interface Article {
  content: string;   // texto original extraido; '' = falhou/vazio
  title:   string;   // <title> do HTML; '' quando ausente
}

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  supabaseUrl:     (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:     process.env.SUPABASE_SERVICE_KEY ?? '',
  fetchTimeoutMs:  12_000,
  contentMaxChars: 8_000,
  snippetChars:    300,
  fetchDelayMs:    400,
};

const RELEVANCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run') || process.env.DRY_RUN === '1';
const PERIOD   = (args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? '').trim();

// ─── Supabase REST ────────────────────────────────────────────────────────────

function dbHeaders(returnRepresentation = false) {
  return {
    apikey:         cfg.supabaseKey,
    Authorization:  `Bearer ${cfg.supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer:         returnRepresentation ? 'return=representation' : 'return=minimal',
  };
}

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, { headers: dbHeaders(true) });
  if (!res.ok) throw new Error(`DB GET /${path}: ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

async function dbPost(table: string, row: unknown): Promise<void> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${table}`, {
    method: 'POST', headers: dbHeaders(), body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`DB POST ${table}: ${await res.text()}`);
}

// ─── URL / dominio ─────────────────────────────────────────────────────────────

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// Casa o dominio do candidato com uma fonte curada. Match exato do host (sem www)
// ou subdominio de uma fonte (candidato termina em '.<host da fonte>'). Sem match,
// devolve null e o sinal e pulado (nunca inventa fonte).
function resolveSourceId(url: string, sources: Source[]): string | null {
  const h = hostOf(url);
  if (!h) return null;
  for (const s of sources) {
    const sh = hostOf(s.url);
    if (!sh) continue;
    if (h === sh || h.endsWith(`.${sh}`) || sh.endsWith(`.${h}`)) return s.id;
  }
  return null;
}

// ─── Extracao de conteudo ORIGINAL ─────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  );
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')) : '';
}

// Busca o artigo original. content vazio ('') sinaliza falha (erro, timeout,
// paywall, nao-HTML ou corpo curto demais para ser conteudo real).
async function fetchArticle(url: string): Promise<Article> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(cfg.fetchTimeoutMs),
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; TAIMEBot/1.0; +https://taime.tech)',
        Accept:            'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) return { content: '', title: '' };
    if (!(res.headers.get('content-type') ?? '').includes('html')) return { content: '', title: '' };
    const raw     = await res.text();
    const title   = extractTitle(raw);
    const content = stripHtml(raw);
    if (content.length < 200) return { content: '', title };
    return { content: content.slice(0, cfg.contentMaxChars), title };
  } catch {
    return { content: '', title: '' };
  }
}

// ─── Janela do periodo ──────────────────────────────────────────────────────────

function pad(n: number): string { return String(n).padStart(2, '0'); }

// Data efetiva do candidato = published_at quando presente, senao collected_at.
function effectiveDate(r: RadarRow): string | null {
  const raw = r.published_at ?? r.collected_at;
  return raw ? raw.slice(0, 10) : null; // YYYY-MM-DD
}

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const missing = (['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const).filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n✗ Variaveis faltando: ${missing.join(', ')}\n`);
    process.exit(1);
  }
  if (!PERIOD) {
    console.error('\n✗ Informe o periodo. Ex: npx ts-node promote-radar-signals.ts 2026-07-01 [--dry-run]\n');
    process.exit(1);
  }

  const info = parsePeriod(PERIOD);
  // Chaves de janela (comparacao por string YYYY-MM-DD, sem armadilha de fuso).
  const startKey = `${info.start.getFullYear()}-${pad(info.start.getMonth() + 1)}-${pad(info.start.getDate())}`;
  const endKey   = `${info.end.getFullYear()}-${pad(info.end.getMonth() + 1)}-${pad(info.end.getDate())}`;

  // Limites generosos para o fetch do Radar (superset); o filtro autoritativo e
  // por effectiveDate no codigo, abaixo.
  const startISO       = `${startKey}T00:00:00Z`;
  const endNext        = new Date(Date.UTC(info.end.getFullYear(), info.end.getMonth(), info.end.getDate() + 1));
  const endExclusiveISO = `${endNext.toISOString().slice(0, 10)}T00:00:00Z`;

  console.log('\n╔══════════════════════════════════╗');
  console.log('║   TAIME, Radar to Signals bridge ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Periodo:   ${PERIOD} (${info.labelPt})`);
  console.log(`Janela:    ${startKey} a ${endKey}`);
  console.log(`Modo:      ${DRY_RUN ? 'DRY-RUN (simulacao, NAO insere em signals)' : 'GRAVACAO (insere em signals)'}`);
  console.log('─'.repeat(52));

  // Fontes curadas (todas, ativas ou nao: qualquer fonte curada da um source_id valido).
  const sources = await dbGet<Source>('sources?select=id,name,url');

  // URLs ja presentes em signals no periodo, para dedup O(1).
  const existing = await dbGet<{ url: string }>(`signals?period=eq.${encodeURIComponent(PERIOD)}&select=url`);
  const seenUrls = new Set(existing.map(r => r.url));

  // Candidatos do Radar: collected_at OU published_at dentro da janela (superset).
  const enc = encodeURIComponent;
  const orFilter =
    `or=(and(collected_at.gte.${enc(startISO)},collected_at.lt.${enc(endExclusiveISO)}),` +
    `and(published_at.gte.${enc(startISO)},published_at.lt.${enc(endExclusiveISO)}))`;
  const radarRaw = await dbGet<RadarRow>(
    `radar_signals?select=id,title_pt,title_en,category,relevance,source_category,url,published_at,collected_at&${orFilter}&limit=2000`,
  );

  // Filtro autoritativo por data efetiva + ordena por relevancia (high>medium>low).
  const candidates = radarRaw
    .filter(r => {
      const d = effectiveDate(r);
      return d !== null && d >= startKey && d <= endKey;
    })
    .sort((a, b) => (RELEVANCE_RANK[a.relevance ?? 'low'] ?? 3) - (RELEVANCE_RANK[b.relevance ?? 'low'] ?? 3));

  console.log(`Candidatos no periodo:  ${candidates.length}`);
  console.log(`Fontes curadas:         ${sources.length}`);
  console.log(`Signals ja no periodo:  ${seenUrls.size}`);
  console.log('─'.repeat(52));

  let skippedDedup = 0, skippedNoSource = 0, skippedFetchFailed = 0, inserted = 0;

  for (const r of candidates) {
    const url = (r.url ?? '').trim();
    if (!url) { continue; }

    // 2. Dedup por URL contra a coleta normal / execucoes anteriores.
    if (seenUrls.has(url)) { skippedDedup++; continue; }

    // 3. Resolve source_id pelo dominio. Sem match, pula (sem inventar fonte).
    const sourceId = resolveSourceId(url, sources);
    if (!sourceId) { skippedNoSource++; continue; }

    // 4. Busca o CONTEUDO ORIGINAL. Falha/vazio, pula.
    const article = await fetchArticle(url);
    await sleep(cfg.fetchDelayMs);
    if (!article.content) { skippedFetchFailed++; continue; }

    // Title: do artigo original; fallback para o rotulo do Radar (nunca como fato).
    const title = (article.title || r.title_pt || r.title_en || url).slice(0, 300);

    const row = {
      source_id: sourceId,
      period:    PERIOD,
      title,
      url,
      content:   article.content,     // texto ORIGINAL, nunca o summary do Radar
      summary:   null,                // nao copia o resumo do Radar
      is_noise:  false,               // o filter-signals (Haiku) decide depois
      metadata: {
        origin:               'radar_bridge',
        radar_id:             r.id,
        radar_relevance:      r.relevance ?? null,
        radar_category:       r.category ?? null,
        radar_source_category: r.source_category ?? null,
        radar_title:          r.title_pt ?? r.title_en ?? null, // rotulo, nao fato
        published_date:       r.published_at ?? r.collected_at ?? null,
        snippet:              article.content.slice(0, cfg.snippetChars), // do original
        period_label:         info.labelPt,
        period_type:          info.type,
        period_start:         startKey,
        period_end:           endKey,
        is_historical:        isHistorical(info),
      },
    };

    if (DRY_RUN) {
      inserted++;
    } else {
      await dbPost('signals', row);
      seenUrls.add(url);
      inserted++;
    }
  }

  // ─── Relatorio de execucao (rendimento real da ponte) ──────────────────────
  console.log('\n' + '═'.repeat(52));
  console.log('RELATORIO DE EXECUCAO' + (DRY_RUN ? ' (DRY-RUN, nada inserido)' : ''));
  console.log('═'.repeat(52));
  console.log(`Candidatos no periodo:        ${candidates.length}`);
  console.log(`Pulados por dedup (URL):      ${skippedDedup}`);
  console.log(`Pulados sem fonte curada:     ${skippedNoSource}`);
  console.log(`Pulados por fetch falho:      ${skippedFetchFailed}`);
  console.log(`${DRY_RUN ? 'Inseriria em signals:        ' : 'Inseridos em signals:        '} ${inserted}`);
  console.log('═'.repeat(52));
  const reached = skippedDedup + skippedNoSource + skippedFetchFailed + inserted;
  if (reached !== candidates.length) {
    console.log(`(nota: ${candidates.length - reached} candidato(s) sem URL, ignorados)`);
  }
  if (DRY_RUN) {
    console.log('\nDry-run: rode sem --dry-run para gravar. O filter/analyze rodam depois normalmente.');
  } else {
    console.log('\nProximo passo: npx ts-node filter-signals.ts  (depois analyze-signals.ts)');
  }
  console.log('');
}

main().catch(err => {
  console.error('\n✗ Erro fatal:', err);
  process.exit(1);
});
