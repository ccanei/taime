#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * TAIME — Signal Collector
 * Coleta sinais das fontes tier-1 via Serper API.
 * Suporta períodos históricos (filtro de data Serper) e o período atual.
 *
 * Usage:  npx ts-node collect-signals.ts
 * Env:    SERPER_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 *         PERIOD (opcional — default: início do período semanal atual)
 */

import { parsePeriod, isHistorical, toSerperDate } from './period-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Source {
  id: string;
  name: string;
  url: string;
  tier: number;
  category: string;
}

interface SerperOrganic {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  position: number;
}

interface SignalRow {
  source_id: string;
  period:    string;
  title:     string;
  url:       string;
  content:   string;
  summary:   null;
  metadata:  Record<string, unknown>;
}

interface SourceResult {
  collected:  number;
  duplicates: number;
  errors:     number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  serperApi:       'https://google.serper.dev/search',
  serperKey:       process.env.SERPER_API_KEY ?? '',
  supabaseUrl:     (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:     process.env.SUPABASE_SERVICE_KEY ?? '',
  resultsPerSource: 10,
  serperDelayMs:   700,
  fetchTimeoutMs:  12_000,
  contentMaxChars: 8_000,
};

// ─── Period ───────────────────────────────────────────────────────────────────

// Default: first day of the current weekly/biweekly/monthly period
function defaultPeriodKey(): string {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const day   = now.getDate();

  let startDay: number;
  if (year <= 2014)      startDay = 1;
  else startDay = day <= 15 ? 1 : 16;
  return `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
}

const PERIOD_KEY = process.env.PERIOD ?? defaultPeriodKey();
const periodInfo = parsePeriod(PERIOD_KEY);

// ─── Supabase REST ────────────────────────────────────────────────────────────

function dbHeaders(returnRepresentation = false) {
  return {
    apikey:          cfg.supabaseKey,
    Authorization:   `Bearer ${cfg.supabaseKey}`,
    'Content-Type':  'application/json',
    Prefer:          returnRepresentation ? 'return=representation' : 'return=minimal',
  };
}

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    headers: dbHeaders(true),
  });
  if (!res.ok) throw new Error(`DB GET /${path}: ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

async function dbPost(table: string, row: unknown): Promise<void> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: dbHeaders(),
    body:   JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`DB POST ${table}: ${await res.text()}`);
}

// ─── Serper ───────────────────────────────────────────────────────────────────

const TOPIC_BY_CATEGORY: Record<string, string> = {
  research:   'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR blockchain OR quantum OR semiconductor',
  consulting: 'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR blockchain OR quantum OR semiconductor',
  vc:         'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR blockchain OR quantum OR semiconductor',
  media:      'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR blockchain OR quantum OR semiconductor',
  academic:   'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR blockchain OR quantum OR semiconductor',
  think_tank: 'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR blockchain OR quantum OR semiconductor',
  vendor:     'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR blockchain OR quantum OR semiconductor',
  security:   'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR blockchain OR quantum OR semiconductor',
};

function buildQuery(source: Source): string {
  const domain = new URL(source.url).hostname.replace(/^www\./, '');
  const year   = periodInfo.start.getFullYear();
  const topic  = TOPIC_BY_CATEGORY[source.category] ?? 'technology AI trends innovation';
  return `site:${domain} ${topic} ${year}`;
}

async function searchSerper(query: string): Promise<SerperOrganic[]> {
  // Historical periods use date-range filter; recent periods use last-month filter
  const tbsParam = isHistorical(periodInfo)
    ? `cdr:1,cd_min:${toSerperDate(periodInfo.start)},cd_max:${toSerperDate(periodInfo.end)}`
    : 'qdr:w';

  const res = await fetch(cfg.serperApi, {
    method: 'POST',
    headers: {
      'X-API-KEY':    cfg.serperKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q:   query,
      num: cfg.resultsPerSource,
      tbs: tbsParam,
    }),
  });
  if (!res.ok) throw new Error(`Serper API: ${await res.text()}`);
  const data = await res.json() as { organic?: SerperOrganic[] };
  return data.organic ?? [];
}

// ─── Content extraction ───────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(cfg.fetchTimeoutMs),
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; TAIMEBot/1.0; +https://taime.tech)',
        Accept:            'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) return '';
    if (!(res.headers.get('content-type') ?? '').includes('html')) return '';
    const text = stripHtml(await res.text());
    return text.length < 200 ? '' : text.slice(0, cfg.contentMaxChars);
  } catch {
    return '';
  }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

async function urlExists(url: string): Promise<boolean> {
  const rows = await dbGet<{ id: string }>(
    `signals?url=eq.${encodeURIComponent(url)}&period=eq.${periodInfo.key}&select=id&limit=1`,
  );
  return rows.length > 0;
}

// ─── Source collection ────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function collectSource(source: Source): Promise<SourceResult> {
  let collected = 0, duplicates = 0, errors = 0;
  const query   = buildQuery(source);

  let results: SerperOrganic[];
  try {
    results = await searchSerper(query);
  } catch (err) {
    console.error(`  ✗ Serper falhou: ${err}`);
    return { collected: 0, duplicates: 0, errors: 1 };
  }

  for (const item of results) {
    if (!item.link) continue;
    try {
      if (await urlExists(item.link)) { duplicates++; continue; }

      const content = await fetchContent(item.link);

      const row: SignalRow = {
        source_id: source.id,
        period:    periodInfo.key,
        title:     item.title,
        url:       item.link,
        content,
        summary:   null,
        metadata: {
          snippet:        item.snippet,
          position:       item.position,
          published_date: item.date ?? null,
          query_used:     query,
          period_label:   periodInfo.labelPt,
          period_type:    periodInfo.type,
          period_start:   periodInfo.start.toISOString().slice(0, 10),
          period_end:     periodInfo.end.toISOString().slice(0, 10),
          is_historical:  isHistorical(periodInfo),
        },
      };

      await dbPost('signals', row);
      collected++;
    } catch (err) {
      console.error(`    ✗ ${item.link}: ${err}`);
      errors++;
    }
  }

  return { collected, duplicates, errors };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const missing = (['SERPER_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const)
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n✗ Variáveis faltando: ${missing.join(', ')}\n`);
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════╗');
  console.log('║   TAIME — Signal Collector       ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Período:    ${periodInfo.key}`);
  console.log(`Tipo:       ${periodInfo.type}`);
  console.log(`Label:      ${periodInfo.labelPt}`);
  console.log(`Intervalo:  ${periodInfo.start.toISOString().slice(0, 10)} → ${periodInfo.end.toISOString().slice(0, 10)}`);
  console.log(`Histórico:  ${isHistorical(periodInfo) ? 'sim (filtro de data Serper)' : 'não (último mês)'}\n`);

  let sources: Source[];
  try {
    sources = await dbGet<Source>('sources?active=eq.true&order=tier.asc,name.asc');
  } catch (err) {
    console.error(`✗ Falha ao carregar fontes: ${err}`);
    process.exit(1);
  }

  if (sources.length === 0) {
    console.error('✗ Nenhuma fonte ativa encontrada.');
    process.exit(1);
  }

  console.log(`Fontes ativas: ${sources.length}`);
  console.log('─'.repeat(50));

  let totalCollected = 0, totalDuplicates = 0, totalErrors = 0;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const label  = `[${String(i + 1).padStart(2, '0')}/${sources.length}] ${source.name}`;
    process.stdout.write(`${label.padEnd(45, '.')} `);

    const result = await collectSource(source);
    totalCollected  += result.collected;
    totalDuplicates += result.duplicates;
    totalErrors     += result.errors;

    const parts = [
      `+${result.collected} novo${result.collected !== 1 ? 's' : ''}`,
      result.duplicates > 0 ? `${result.duplicates} dup` : null,
      result.errors     > 0 ? `${result.errors} erro${result.errors !== 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' | ');

    console.log(parts);

    if (i < sources.length - 1) await sleep(cfg.serperDelayMs);
  }

  console.log('─'.repeat(50));
  console.log(`\n✓ Sinais coletados:  ${totalCollected}`);
  console.log(`~ Duplicatas:        ${totalDuplicates}`);
  if (totalErrors > 0) console.log(`✗ Erros:             ${totalErrors}`);
  console.log(`\nPeríodo: ${periodInfo.key} (${periodInfo.labelPt})`);
  console.log('Próximo passo: npx ts-node analyze-signals.ts\n');
}

main().catch(err => {
  console.error('\n✗ Erro fatal:', err);
  process.exit(1);
});
