#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * TAIME — Radar Collector
 * Coleta as notícias mais relevantes das últimas 24h de todas as fontes via Serper.
 * Usa Claude Haiku para classificação bilíngue (PT/EN) e geração de resumo.
 * Salva as 10 mais relevantes em radar_signals.
 *
 * Usage:  npx ts-node collect-radar.ts
 * Env:    SERPER_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY  ANTHROPIC_API_KEY
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface Source {
  id:       string;
  name:     string;
  url:      string;
  category: string;
}

interface SerperOrganic {
  title:    string;
  link:     string;
  snippet:  string;
  date?:    string;
  position: number;
}

interface RadarCandidate {
  title:           string;
  url:             string;
  snippet:         string;
  date?:           string;
  source_name:     string;
  source_category: string;
}

interface RadarSignalRow {
  title_pt:        string;
  title_en:        string;
  summary_pt:      string;
  summary_en:      string;
  category:        string;
  relevance:       'high' | 'medium' | 'low';
  source_category: string;
  url:             string;
  published_at:    string | null;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  serperApi:      'https://google.serper.dev/search',
  serperKey:      process.env.SERPER_API_KEY ?? '',
  anthropicApi:   'https://api.anthropic.com/v1/messages',
  anthropicKey:   process.env.ANTHROPIC_API_KEY ?? '',
  supabaseUrl:    (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:    process.env.SUPABASE_SERVICE_KEY ?? '',
  haiku:          'claude-haiku-4-5-20251001',
  maxResults:     10,
  serperDelayMs:  500,
};

// Source category → human-readable label (for output — no firm names)
const SOURCE_CATEGORY_LABELS: Record<string, string> = {
  research:   'global research institute',
  consulting: 'strategic consulting firm',
  vc:         'venture capital firm',
  media:      'technology publication',
  academic:   'academic research center',
  think_tank: 'policy and strategy think tank',
  vendor:     'enterprise technology provider',
  security:   'cybersecurity intelligence firm',
};

const VALID_CATEGORIES = ['IA', 'Cloud', 'Cybersecurity', 'Fintech', 'Infrastructure', 'Regulation', 'Market'];

// ─── Supabase REST ────────────────────────────────────────────────────────────

function dbHeaders(returnData = false) {
  return {
    apikey:         cfg.supabaseKey,
    Authorization:  `Bearer ${cfg.supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer:         returnData ? 'return=representation' : 'return=minimal',
  };
}

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, { headers: dbHeaders(true) });
  if (!res.ok) throw new Error(`DB GET /${path}: ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

async function dbPost(table: string, row: unknown): Promise<void> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${table}`, {
    method:  'POST',
    headers: dbHeaders(),
    body:    JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`DB POST ${table}: ${await res.text()}`);
}

// ─── Serper ───────────────────────────────────────────────────────────────────

async function searchSerperRadar(domain: string): Promise<SerperOrganic[]> {
  const res = await fetch(cfg.serperApi, {
    method:  'POST',
    headers: { 'X-API-KEY': cfg.serperKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      q:   `site:${domain} technology news announcement`,
      num: 5,
      tbs: 'qdr:d',
    }),
  });
  if (!res.ok) throw new Error(`Serper: ${await res.text()}`);
  const data = await res.json() as { organic?: SerperOrganic[] };
  return data.organic ?? [];
}

function isRecentResult(result: SerperOrganic): boolean {
  if (!result.date) return true;
  const lower = result.date.toLowerCase();
  return (
    lower.includes('hour') ||
    lower.includes('hora') ||
    lower.includes('minute') ||
    lower.includes('minuto') ||
    lower.includes('just now') ||
    lower.includes('agora') ||
    lower.includes('yesterday') ||
    lower.includes('ontem') ||
    lower.includes('1 day') ||
    lower.includes('1 dia')
  );
}

// ─── Claude Haiku classification ─────────────────────────────────────────────

async function classifyWithHaiku(candidate: RadarCandidate): Promise<RadarSignalRow | null> {
  if (!candidate.url || !candidate.url.startsWith('http')) return null;

  const prompt = `You are a technology intelligence analyst. Given the following news item, generate a structured JSON classification.

SOURCE CATEGORY: ${candidate.source_category}
TITLE: ${candidate.title}
SNIPPET: ${candidate.snippet}
URL: ${candidate.url}

Generate JSON with exactly these fields:
{
  "title_pt": "título em português brasileiro (máx 100 chars)",
  "title_en": "title in English (max 100 chars)",
  "summary_pt": "resumo em português, 2-3 linhas, focado no impacto estratégico",
  "summary_en": "summary in English, 2-3 lines, focused on strategic impact",
  "category": "one of: IA | Cloud | Cybersecurity | Fintech | Infrastructure | Regulation | Market",
  "relevance": "high | medium | low (based on strategic impact for technology decision-makers)",
  "published_at": "ISO date string from URL or snippet if available, else null"
}

RULES:
- Only include facts explicitly present in the title and snippet
- Never invent information not in the source material
- category must be exactly one of the listed options
- relevance: high = immediate executive action needed; medium = monitor closely; low = informational
- Return ONLY the JSON object, no markdown`;

  try {
    const res = await fetch(cfg.anthropicApi, {
      method:  'POST',
      headers: {
        'x-api-key':         cfg.anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      cfg.haiku,
        max_tokens: 512,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error(`  Haiku error: ${await res.text()}`);
      return null;
    }

    const data = await res.json() as { content: Array<{ text: string }> };
    const raw  = data.content[0]?.text ?? '';
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      title_pt:     string;
      title_en:     string;
      summary_pt:   string;
      summary_en:   string;
      category:     string;
      relevance:    string;
      published_at: string | null;
    };

    const category  = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'Market';
    const relevance = (['high', 'medium', 'low'].includes(parsed.relevance)
      ? parsed.relevance : 'low') as 'high' | 'medium' | 'low';

    return {
      title_pt:        parsed.title_pt?.slice(0, 200) ?? candidate.title,
      title_en:        parsed.title_en?.slice(0, 200) ?? candidate.title,
      summary_pt:      parsed.summary_pt?.slice(0, 500) ?? candidate.snippet,
      summary_en:      parsed.summary_en?.slice(0, 500) ?? candidate.snippet,
      category,
      relevance,
      source_category: SOURCE_CATEGORY_LABELS[candidate.source_category] ?? candidate.source_category,
      url:             candidate.url,
      published_at:    parsed.published_at ?? null,
    };
  } catch {
    return null;
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function main(): Promise<void> {
  const missing = (['SERPER_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY'] as const)
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n✗ Variáveis faltando: ${missing.join(', ')}\n`);
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════╗');
  console.log('║   TAIME — Radar Collector        ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Coletando sinais das últimas 24h...\n`);

  let sources: Source[];
  try {
    sources = await dbGet<Source>('sources?active=eq.true&order=tier.asc,name.asc');
  } catch (err) {
    console.error(`✗ Falha ao carregar fontes: ${err}`);
    process.exit(1);
  }

  console.log(`Fontes ativas: ${sources.length}`);
  console.log('─'.repeat(50));

  const candidates: RadarCandidate[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const domain = new URL(source.url).hostname.replace(/^www\./, '');
    process.stdout.write(`[${String(i + 1).padStart(2, '0')}/${sources.length}] ${source.name.padEnd(35, '.')} `);

    try {
      const results  = await searchSerperRadar(domain);
      const recent   = results.filter(isRecentResult);
      const newItems = recent.map(r => ({
        title:           r.title,
        url:             r.link,
        snippet:         r.snippet,
        date:            r.date,
        source_name:     source.name,
        source_category: source.category,
      }));
      candidates.push(...newItems);
      console.log(`+${recent.length} resultado${recent.length !== 1 ? 's' : ''}`);
    } catch (err) {
      console.log(`✗ ${err}`);
    }

    if (i < sources.length - 1) await sleep(cfg.serperDelayMs);
  }

  console.log('─'.repeat(50));
  console.log(`\nCandidatos coletados: ${candidates.length}`);
  console.log('Classificando com Claude Haiku...\n');

  const classified: RadarSignalRow[] = [];

  for (const candidate of candidates) {
    const result = await classifyWithHaiku(candidate);
    if (result) classified.push(result);
    await sleep(100);
  }

  // Sort: high first, then medium, then low; within tier by order collected
  const ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  classified.sort((a, b) => (ORDER[a.relevance] ?? 2) - (ORDER[b.relevance] ?? 2));

  const top = classified.slice(0, cfg.maxResults);
  console.log(`Classificados: ${classified.length} | Selecionados: ${top.length}`);

  if (top.length === 0) {
    console.log('\nNenhum sinal para salvar.\n');
    return;
  }

  console.log('\nSalvando em radar_signals...');
  let saved = 0;
  for (const row of top) {
    try {
      await dbPost('radar_signals', row);
      saved++;
      console.log(`  ✓ [${row.relevance.toUpperCase()}] ${row.title_en.slice(0, 60)}`);
    } catch (err) {
      console.error(`  ✗ ${err}`);
    }
  }

  console.log(`\n✓ ${saved} sinais salvos no Radar TAIME`);
  console.log('─'.repeat(50) + '\n');
}

main().catch(err => {
  console.error('\n✗ Erro fatal:', err);
  process.exit(1);
});
