#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * TESTE LOCAL (Mitigação B) — NÃO persiste nada. Compara o `content` ANTES
 * (stripHtml do HTML vivo, comportamento antigo) vs DEPOIS (readability + guarda
 * de contaminação + fallback de snippet) para URLs reais dos domínios de alta
 * contaminação, simulando um período histórico (2016). Descartável.
 */
import { stripHtml, processSignalContent, scanFutureYears, scanSymptoms } from './content-extract';

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const SIM_PERIOD_END_YEAR = 2016;   // simula coleta histórica
const CURRENT_YEAR = 2026;
const MAX = 8_000;

interface SigRow { url: string; metadata: { snippet?: string } | null }

async function getUrls(domain: string, n: number): Promise<SigRow[]> {
  const url = `${SUPA}/rest/v1/signals?url=ilike.*${domain}*&select=url,metadata&limit=${n}`;
  const r = await fetch(url, { headers: H });
  if (!r.ok) { console.error('DB', domain, await r.text()); return []; }
  return r.json() as Promise<SigRow[]>;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TAIMEBot/1.0; +https://taime.tech)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return '';
  return res.text();
}

function head(s: string, n = 180): string { return s.slice(0, n).replace(/\s+/g, ' ').trim(); }

async function main() {
  const domains = ['crowdstrike.com', 'uipath.com', 'fortinet.com'];
  const rows: SigRow[] = [];
  for (const d of domains) rows.push(...await getUrls(d, 3));
  console.log(`\nURLs de teste: ${rows.length} (${domains.join(', ')}), período simulado end=${SIM_PERIOD_END_YEAR}\n`);

  let oldYearsTot = 0, newYearsTot = 0, oldSympTot = 0, newSympTot = 0, oldChars = 0, newChars = 0;

  for (const row of rows) {
    const url = row.url;
    const snippet = row.metadata?.snippet ?? null;
    const html = await fetchHtml(url).catch(() => '');
    if (!html) { console.log(`\n─── ${url}\n   (sem HTML / fetch falhou — pulado)`); continue; }

    // ANTES: comportamento antigo.
    const oldContent = stripHtml(html).slice(0, MAX);
    const oldYears = scanFutureYears(oldContent, SIM_PERIOD_END_YEAR);
    const oldSymp = scanSymptoms(oldContent);

    // DEPOIS: nova lógica.
    const r = processSignalContent({
      rawHtml: html, url,
      periodEndYear: SIM_PERIOD_END_YEAR,
      snippet, isHistorical: true, maxChars: MAX, currentYear: CURRENT_YEAR,
    });
    const newYears = scanFutureYears(r.content, SIM_PERIOD_END_YEAR);
    const newSymp = scanSymptoms(r.content);

    oldYearsTot += oldYears.length; newYearsTot += newYears.length;
    oldSympTot += oldSymp.length; newSympTot += newSymp.length;
    oldChars += oldContent.length; newChars += r.content.length;

    console.log(`\n─── ${url}`);
    console.log(`   ANTES : ${oldContent.length} chars | anos-futuros=${oldYears.map(y => y.year).join(',') || '–'} | sintomas=${oldSymp.join('|') || '–'}`);
    console.log(`   DEPOIS: ${r.content.length} chars [${r.contentSource}] | anos-futuros=${newYears.map(y => y.year).join(',') || '–'} | sintomas=${newSymp.join('|') || '–'}`);
    console.log(`   flags : ${r.flags.join(' ; ') || '–'}`);
    console.log(`   ANTES  head: «${head(oldContent)}»`);
    console.log(`   DEPOIS head: «${head(r.content)}»`);
  }

  console.log('\n══════════════ TOTAIS ══════════════');
  console.log(`Anos-futuros (>${SIM_PERIOD_END_YEAR}) no content:  ANTES=${oldYearsTot}  →  DEPOIS=${newYearsTot}`);
  console.log(`Termos nav/feed no content:            ANTES=${oldSympTot}  →  DEPOIS=${newSympTot}`);
  console.log(`Chars totais de content:               ANTES=${oldChars}  →  DEPOIS=${newChars}`);
}

main().catch(e => { console.error('fatal', e); process.exit(1); });
