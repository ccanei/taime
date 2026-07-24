#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * TAIME, Signal Collector
 * Coleta sinais via Serper API a partir de TODAS as fontes ativas
 * (`sources.active = true`), processadas em ordem `tier asc, name asc`.
 * Hoje a base inclui tier-1 e tier-2; o script não filtra por tier.
 * Suporta períodos históricos (filtro de data Serper) e o período atual.
 *
 * Usage:  npx ts-node collect-signals.ts
 * Env:    SERPER_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 *         PERIOD (opcional, default: início do período semanal atual)
 */

import { parsePeriod, isHistorical, toSerperDate } from './period-utils';
import { isSignalWithinPeriod } from './date-check';
import { processSignalContent, type ContentSource } from './content-extract';

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
  outOfPeriod: number;
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

// Chave de armazenamento do periodo. Os demais passos do pipeline (filter,
// analyze, generate, validate) consultam/gravam por process.env.PERIOD CRU,
// nunca pela chave normalizada de parsePeriod. So o collect usava periodInfo.key
// (que parsePeriod normaliza para o limite quinzenal 01/16). Para periodos
// padrao (01/16, os unicos usados em producao) PERIOD_KEY === periodInfo.key,
// entao isto e identico ao comportamento de hoje. Para periodos-sombra
// (ex.: 2023-06-08), preserva a chave crua, mantendo a coleta isolada e
// coerente com o resto do pipeline. A JANELA de data (start/end, cd_min/cd_max)
// e o label continuam vindo de periodInfo (a quinzena correspondente).
const STORE_KEY = PERIOD_KEY;

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
  research:   'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR "business model" OR "operating model" OR "platform business" OR "business transformation" OR blockchain OR quantum OR semiconductor OR "agentic AI" OR "AI agents" OR "multiagent systems" OR "AI governance" OR "AI TRiSM" OR "responsible AI" OR "data sovereignty" OR "sovereign cloud" OR geopatriation OR "confidential computing" OR "hybrid computing" OR "physical AI" OR robotics OR humanoid OR "AI infrastructure cost" OR "compute capacity" OR "domain-specific models" OR "small language models" OR "post-quantum" OR "quantum security" OR "preemptive security" OR "AI security" OR "spatial computing" OR "mixed reality" OR "network infrastructure" OR 5G OR "private networks" OR connectivity OR "data center"',
  consulting: 'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR "business model" OR "operating model" OR "platform business" OR "business transformation" OR blockchain OR quantum OR semiconductor OR "agentic AI" OR "AI agents" OR "multiagent systems" OR "AI governance" OR "AI TRiSM" OR "responsible AI" OR "data sovereignty" OR "sovereign cloud" OR geopatriation OR "confidential computing" OR "hybrid computing" OR "physical AI" OR robotics OR humanoid OR "AI infrastructure cost" OR "compute capacity" OR "domain-specific models" OR "small language models" OR "post-quantum" OR "quantum security" OR "preemptive security" OR "AI security" OR "spatial computing" OR "mixed reality" OR "network infrastructure" OR 5G OR "private networks" OR connectivity OR "data center"',
  vc:         'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR "business model" OR "operating model" OR "platform business" OR "business transformation" OR blockchain OR quantum OR semiconductor OR "agentic AI" OR "AI agents" OR "multiagent systems" OR "AI governance" OR "AI TRiSM" OR "responsible AI" OR "data sovereignty" OR "sovereign cloud" OR geopatriation OR "confidential computing" OR "hybrid computing" OR "physical AI" OR robotics OR humanoid OR "AI infrastructure cost" OR "compute capacity" OR "domain-specific models" OR "small language models" OR "post-quantum" OR "quantum security" OR "preemptive security" OR "AI security" OR "spatial computing" OR "mixed reality" OR "network infrastructure" OR 5G OR "private networks" OR connectivity OR "data center"',
  media:      'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR "business model" OR "operating model" OR "platform business" OR "business transformation" OR blockchain OR quantum OR semiconductor OR "agentic AI" OR "AI agents" OR "multiagent systems" OR "AI governance" OR "AI TRiSM" OR "responsible AI" OR "data sovereignty" OR "sovereign cloud" OR geopatriation OR "confidential computing" OR "hybrid computing" OR "physical AI" OR robotics OR humanoid OR "AI infrastructure cost" OR "compute capacity" OR "domain-specific models" OR "small language models" OR "post-quantum" OR "quantum security" OR "preemptive security" OR "AI security" OR "spatial computing" OR "mixed reality" OR "network infrastructure" OR 5G OR "private networks" OR connectivity OR "data center"',
  academic:   'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR "business model" OR "operating model" OR "platform business" OR "business transformation" OR blockchain OR quantum OR semiconductor OR "agentic AI" OR "AI agents" OR "multiagent systems" OR "AI governance" OR "AI TRiSM" OR "responsible AI" OR "data sovereignty" OR "sovereign cloud" OR geopatriation OR "confidential computing" OR "hybrid computing" OR "physical AI" OR robotics OR humanoid OR "AI infrastructure cost" OR "compute capacity" OR "domain-specific models" OR "small language models" OR "post-quantum" OR "quantum security" OR "preemptive security" OR "AI security" OR "spatial computing" OR "mixed reality" OR "network infrastructure" OR 5G OR "private networks" OR connectivity OR "data center"',
  think_tank: 'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR "business model" OR "operating model" OR "platform business" OR "business transformation" OR blockchain OR quantum OR semiconductor OR "agentic AI" OR "AI agents" OR "multiagent systems" OR "AI governance" OR "AI TRiSM" OR "responsible AI" OR "data sovereignty" OR "sovereign cloud" OR geopatriation OR "confidential computing" OR "hybrid computing" OR "physical AI" OR robotics OR humanoid OR "AI infrastructure cost" OR "compute capacity" OR "domain-specific models" OR "small language models" OR "post-quantum" OR "quantum security" OR "preemptive security" OR "AI security" OR "spatial computing" OR "mixed reality" OR "network infrastructure" OR 5G OR "private networks" OR connectivity OR "data center"',
  vendor:     'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR "business model" OR "operating model" OR "platform business" OR "business transformation" OR blockchain OR quantum OR semiconductor OR "agentic AI" OR "AI agents" OR "multiagent systems" OR "AI governance" OR "AI TRiSM" OR "responsible AI" OR "data sovereignty" OR "sovereign cloud" OR geopatriation OR "confidential computing" OR "hybrid computing" OR "physical AI" OR robotics OR humanoid OR "AI infrastructure cost" OR "compute capacity" OR "domain-specific models" OR "small language models" OR "post-quantum" OR "quantum security" OR "preemptive security" OR "AI security" OR "spatial computing" OR "mixed reality" OR "network infrastructure" OR 5G OR "private networks" OR connectivity OR "data center"',
  security:   'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR "business model" OR "operating model" OR "platform business" OR "business transformation" OR blockchain OR quantum OR semiconductor OR "agentic AI" OR "AI agents" OR "multiagent systems" OR "AI governance" OR "AI TRiSM" OR "responsible AI" OR "data sovereignty" OR "sovereign cloud" OR geopatriation OR "confidential computing" OR "hybrid computing" OR "physical AI" OR robotics OR humanoid OR "AI infrastructure cost" OR "compute capacity" OR "domain-specific models" OR "small language models" OR "post-quantum" OR "quantum security" OR "preemptive security" OR "AI security" OR "spatial computing" OR "mixed reality" OR "network infrastructure" OR 5G OR "private networks" OR connectivity OR "data center"',
  financial:  'AI OR cloud OR cybersecurity OR enterprise OR data OR regulation OR fintech OR infrastructure OR automation OR "machine learning" OR "digital transformation" OR "business model" OR "operating model" OR "platform business" OR "business transformation" OR blockchain OR quantum OR semiconductor OR "agentic AI" OR "AI agents" OR "multiagent systems" OR "AI governance" OR "AI TRiSM" OR "responsible AI" OR "data sovereignty" OR "sovereign cloud" OR geopatriation OR "confidential computing" OR "hybrid computing" OR "physical AI" OR robotics OR humanoid OR "AI infrastructure cost" OR "compute capacity" OR "domain-specific models" OR "small language models" OR "post-quantum" OR "quantum security" OR "preemptive security" OR "AI security" OR "spatial computing" OR "mixed reality" OR "network infrastructure" OR 5G OR "private networks" OR connectivity OR "data center"',
  data:       'data platform OR data governance OR data sovereignty OR "data mesh" OR "data lakehouse" OR privacy OR "data protection" OR GDPR OR LGPD OR "data management" OR analytics OR "data strategy" OR "master data" OR "data quality"',
  automation: '"business process" OR "process automation" OR RPA OR "robotic process automation" OR "intelligent automation" OR "process mining" OR "workflow automation" OR "hyperautomation" OR "low-code" OR "no-code" OR "process optimization"',
  observability: '"LLM observability" OR "AI monitoring" OR "model drift" OR "LLMOps" OR "ML monitoring" OR "AI explainability" OR "model audit" OR "AI accountability" OR "production AI" OR "AI reliability" OR OpenTelemetry OR tracing OR "distributed tracing" OR "AI governance" OR "model performance"',
  engineering:   '"software engineering" OR "developer productivity" OR "AI coding" OR "code generation" OR "developer tools" OR DevOps OR platform OR "internal developer platform" OR "software delivery" OR "engineering culture" OR "technical debt" OR "software architecture" OR "API design"',
  edge:          '"edge computing" OR "edge AI" OR IoT OR "internet of things" OR "on-device AI" OR "edge inference" OR "industrial IoT" OR "embedded AI" OR "edge cloud" OR "fog computing" OR "connected devices" OR "smart manufacturing"',
  healthtech:    '"digital health" OR "health AI" OR "clinical AI" OR "drug discovery" OR "medical imaging" OR "health data" OR "electronic health records" OR EHR OR "health interoperability" OR "precision medicine" OR "AI diagnostics" OR biotech OR genomics',
  sustainability: '"green tech" OR "sustainable technology" OR "carbon footprint" OR "energy efficiency" OR "data center energy" OR "AI energy consumption" OR "green cloud" OR ESG OR "climate tech" OR "renewable energy" OR "sustainable AI" OR "carbon neutral"',
};

// COLLECT_MODE controla a montagem da query da coleta.
//   'full'    (default): site:dominio + termos do TOPIC_BY_CATEGORY (metodo A atual).
//   'minimal' (experimento B): apenas site:dominio, sem os termos de topico. O
//             filtro de data (cd_min/cd_max em searchSerper) e o isSignalWithinPeriod
//             continuam intactos; muda SO a query textual.
// Sem a env (ou com qualquer valor != 'minimal') o comportamento e identico ao de hoje.
const COLLECT_MODE = (process.env.COLLECT_MODE ?? 'full').toLowerCase();
const COLLECT_MINIMAL = COLLECT_MODE === 'minimal';

// Extrai o dominio de forma tolerante: aceita url sem esquema (ex.: "fortune.com",
// como alguns registros novos da tabela sources) prefixando https:// antes de
// parsear. Se ainda assim for invalida, cai no proprio valor limpo em vez de
// crashar a coleta inteira.
function sourceDomain(rawUrl: string): string {
  const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0];
  }
}

function buildQuery(source: Source): string {
  const domain = sourceDomain(source.url);
  if (COLLECT_MINIMAL) return `site:${domain}`;
  const topic  = TOPIC_BY_CATEGORY[source.category] ?? 'technology AI trends innovation';
  return `site:${domain} ${topic}`;
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

// stripHtml, extração de corpo (readability), varredura de contaminação e
// fallback de snippet vivem em content-extract.ts (puro/testável). fetchContent
// só faz a rede e delega o processamento.

interface FetchResult {
  content:       string;
  contentSource: ContentSource | 'empty';
  flags:         string[];
  futureYears:   number[];
}

const EMPTY_FETCH: FetchResult = { content: '', contentSource: 'empty', flags: [], futureYears: [] };

async function fetchContent(url: string, snippet: string | null): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(cfg.fetchTimeoutMs),
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; TAIMEBot/1.0; +https://taime.tech)',
        Accept:            'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) return EMPTY_FETCH;
    if (!(res.headers.get('content-type') ?? '').includes('html')) return EMPTY_FETCH;

    const rawHtml = await res.text();
    const r = processSignalContent({
      rawHtml,
      url,
      periodEndYear: periodInfo.end.getFullYear(),
      snippet,
      isHistorical:  isHistorical(periodInfo),
      maxChars:      cfg.contentMaxChars,
      currentYear:   new Date().getFullYear(),
    });

    // Mantém o comportamento antigo (corpo curto demais → vazio), EXCETO quando
    // caímos para o snippet do Serper: ele é curto mas period-correto e válido.
    if (r.contentSource !== 'snippet' && r.content.length < 200) return EMPTY_FETCH;

    return { content: r.content, contentSource: r.contentSource, flags: r.flags, futureYears: r.futureYears };
  } catch {
    return EMPTY_FETCH;
  }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

async function urlExists(url: string): Promise<boolean> {
  const rows = await dbGet<{ id: string }>(
    `signals?url=eq.${encodeURIComponent(url)}&period=eq.${STORE_KEY}&select=id&limit=1`,
  );
  return rows.length > 0;
}

// ─── Source collection ────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function collectSource(source: Source): Promise<SourceResult> {
  let collected = 0, duplicates = 0, errors = 0, outOfPeriod = 0;
  const query   = buildQuery(source);

  let results: SerperOrganic[];
  try {
    results = await searchSerper(query);
  } catch (err) {
    console.error(`  ✗ Serper falhou: ${err}`);
    return { collected: 0, duplicates: 0, errors: 1, outOfPeriod: 0 };
  }

  for (const item of results) {
    if (!item.link) continue;

    // Filtro cruzado de data: se conseguimos provar que o sinal está
    // claramente fora da janela do período, descarta. Conservador.
    if (!isSignalWithinPeriod(item.date, periodInfo.start, periodInfo.end)) {
      const shortTitle = (item.title ?? '').slice(0, 60);
      console.log(`    ⏭ fora do período: ${item.date} — ${shortTitle}`);
      outOfPeriod++;
      continue;
    }

    try {
      if (await urlExists(item.link)) { duplicates++; continue; }

      const fc = await fetchContent(item.link, item.snippet ?? null);

      // Visibilidade da guarda de contaminação (não bloqueia a coleta).
      if (fc.flags.length) {
        console.log(`\n      ⚠ contaminação [${fc.contentSource}] ${item.link.slice(0, 70)} :: ${fc.flags.join(' ; ')}`);
      }

      const row: SignalRow = {
        source_id: source.id,
        period:    STORE_KEY,
        title:     item.title,
        url:       item.link,
        content:   fc.content,
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
          // Mitigação B: proveniência do conteúdo + flags de contaminação p/ auditoria.
          content_source: fc.contentSource,
          content_flags:  fc.flags,
          future_years:   fc.futureYears,
        },
      };

      await dbPost('signals', row);
      collected++;
    } catch (err) {
      console.error(`    ✗ ${item.link}: ${err}`);
      errors++;
    }
  }

  return { collected, duplicates, errors, outOfPeriod };
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
  console.log(`Período:    ${STORE_KEY}${STORE_KEY !== periodInfo.key ? ` (sombra; janela ${periodInfo.key})` : ''}`);
  console.log(`Tipo:       ${periodInfo.type}`);
  console.log(`Label:      ${periodInfo.labelPt}`);
  console.log(`Intervalo:  ${periodInfo.start.toISOString().slice(0, 10)} → ${periodInfo.end.toISOString().slice(0, 10)}`);
  console.log(`Histórico:  ${isHistorical(periodInfo) ? 'sim (filtro de data Serper)' : 'não (último mês)'}`);
  console.log(`Modo query: ${COLLECT_MINIMAL ? 'minimal (site:dominio, sem TOPIC_BY_CATEGORY)' : 'full (site:dominio + topicos)'}\n`);

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

  let totalCollected = 0, totalDuplicates = 0, totalErrors = 0, totalOutOfPeriod = 0;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const label  = `[${String(i + 1).padStart(2, '0')}/${sources.length}] ${source.name}`;
    process.stdout.write(`${label.padEnd(45, '.')} `);

    const result = await collectSource(source);
    totalCollected   += result.collected;
    totalDuplicates  += result.duplicates;
    totalErrors      += result.errors;
    totalOutOfPeriod += result.outOfPeriod;

    const parts = [
      `+${result.collected} novo${result.collected !== 1 ? 's' : ''}`,
      result.duplicates  > 0 ? `${result.duplicates} dup` : null,
      result.outOfPeriod > 0 ? `${result.outOfPeriod} fora` : null,
      result.errors      > 0 ? `${result.errors} erro${result.errors !== 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' | ');

    console.log(parts);

    if (i < sources.length - 1) await sleep(cfg.serperDelayMs);
  }

  console.log('─'.repeat(50));
  console.log(`\n✓ Sinais coletados:  ${totalCollected}`);
  console.log(`~ Duplicatas:        ${totalDuplicates}`);
  console.log(`⏭ Fora do período:   ${totalOutOfPeriod}`);
  if (totalErrors > 0) console.log(`✗ Erros:             ${totalErrors}`);
  console.log(`\nPeríodo: ${STORE_KEY} (${periodInfo.labelPt})`);
  console.log('Próximo passo: npx ts-node analyze-signals.ts\n');
}

main().catch(err => {
  console.error('\n✗ Erro fatal:', err);
  process.exit(1);
});
