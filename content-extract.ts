/**
 * TAIME — Extração de conteúdo principal + guarda de contaminação (Mitigação B)
 *
 * PROBLEMA: fetchContent() em collect-signals.ts faz fetch AO VIVO de qualquer
 * URL, inclusive ao coletar períodos históricos. Sites institucionais (CrowdStrike,
 * UiPath, Fortinet, IBM, TheRegister, etc.) retornam o HTML ATUAL, com navegação,
 * rodapé e feed de "artigos relacionados" poluindo o campo `content` do sinal com
 * datas e chamadas de 2026 mesmo quando o período coletado é 2016 ou 2019.
 *
 * ESTE MÓDULO (barato, sem re-arquitetura):
 *   1. extractMainContent(): extrai só o CORPO do artigo via @mozilla/readability,
 *      descartando nav/header/footer/sidebar/feed. Fallback gracioso para stripHtml
 *      quando o Readability não consegue parsear (SPA, página não-artigo, etc.).
 *   2. processSignalContent(): varre o corpo extraído por sinais de contaminação
 *      (anos > period_end, termos de nav/feed) e, para períodos históricos, cai
 *      para metadata.snippet do Serper (correto para a época) quando o corpo ainda
 *      parece contaminado — sem descartar o sinal.
 *   3. scanFutureYears(): guarda de data no nível do sinal — sinaliza datas
 *      explicitamente posteriores ao period_end (estende ao collect a mesma ideia
 *      do boundary temporal do validate-report.ts), só para visibilidade/auditoria.
 *
 * PURO / SEM REDE: recebe o HTML já baixado e o ano corrente injetado, para ser
 * testável sem tocar Supabase nem a rede.
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// ─── Limpeza básica de HTML (fallback quando Readability não parseia) ──────────

export function stripHtml(html: string): string {
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

// ─── Extração do corpo do artigo (readability) ─────────────────────────────────

// Guarda de tamanho: acima disto o parse do jsdom fica caro em memória/CPU sem
// ganho — cai direto para stripHtml. Coleta é sequencial, mas evita picos.
const MAX_HTML_BYTES = 3_000_000;
const MIN_BODY_CHARS = 200;

// Quantas vezes o ano corrente precisa aparecer no corpo (já extraído) para
// disparar o fallback de snippet. >=2 evita punir uma projeção pontual legítima
// ("by 2026" num artigo de 2016) e ainda pega o feed vivo (carimbos repetidos).
// Suba para 1 se quiser fallback mais agressivo em coletas históricas antigas.
const CURRENT_YEAR_SUSPICION_THRESHOLD = 2;

/**
 * Extrai o corpo do artigo. `ok=false` quando o Readability falha ou devolve
 * conteúdo curto demais para ser confiável — o chamador então usa stripHtml.
 */
export function extractMainContent(html: string, url: string): { text: string; ok: boolean } {
  if (!html || html.length > MAX_HTML_BYTES) return { text: '', ok: false };
  let dom: JSDOM | null = null;
  try {
    dom = new JSDOM(html, { url });
    // charThreshold espelha o mínimo aceitável; Readability muta o document,
    // por isso um DOM recém-parseado por chamada.
    const reader = new Readability(dom.window.document as unknown as Document, { charThreshold: MIN_BODY_CHARS });
    const article = reader.parse();
    const raw = article?.textContent ?? '';
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text.length < MIN_BODY_CHARS) return { text: '', ok: false };
    return { text, ok: true };
  } catch {
    return { text: '', ok: false };
  } finally {
    try { dom?.window.close(); } catch { /* noop */ }
  }
}

// ─── Detecção de contaminação ──────────────────────────────────────────────────

const MONTHS =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|' +
  'aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

// Termos de navegação/feed que denunciam HTML ao vivo vazando no corpo. Mapeados
// na auditoria de contaminação (CrowdStrike/UiPath/Fortinet fetch ao vivo 2026).
export const SYMPTOM_PATTERNS: { re: RegExp; name: string }[] = [
  { re: /patch tuesday/i,                                           name: 'Patch Tuesday' },
  { re: /FUSION is coming/i,                                        name: 'FUSION is coming' },
  { re: /\bregister now\b/i,                                        name: 'Register now' },
  { re: /\bwatch now\b/i,                                           name: 'Watch Now' },
  { re: /\bwatch on demand\b/i,                                     name: 'Watch on demand' },
  { re: new RegExp(`featured[^.]{0,40}(?:${MONTHS})\\s+20\\d\\d`, 'i'), name: 'Featured + mês/ano' },
];

function contextAround(text: string, idx: number, pad = 50): string {
  return text.slice(Math.max(0, idx - pad), idx + pad).replace(/\s+/g, ' ').trim();
}

/**
 * Datas com ano explicitamente > periodEndYear no texto. Uma amostra por ano
 * distinto. Só visibilidade/auditoria — não bloqueia coleta.
 */
export function scanFutureYears(text: string, periodEndYear: number): { year: number; context: string }[] {
  const out: { year: number; context: string }[] = [];
  const seen = new Set<number>();
  for (const m of text.matchAll(/\b(20[0-4]\d)\b/g)) {
    const y = Number(m[1]);
    if (y <= periodEndYear || seen.has(y)) continue;
    seen.add(y);
    out.push({ year: y, context: contextAround(text, m.index ?? 0) });
  }
  return out;
}

/** Termos de nav/feed presentes no texto. */
export function scanSymptoms(text: string): string[] {
  return SYMPTOM_PATTERNS.filter(p => p.re.test(text)).map(p => p.name);
}

// ─── Pipeline de processamento do conteúdo de um sinal ─────────────────────────

export type ContentSource = 'readability' | 'stripHtml' | 'snippet';

export interface ProcessInput {
  rawHtml:       string;
  url:           string;
  periodEndYear: number;
  snippet:       string | null;
  isHistorical:  boolean;
  maxChars:      number;
  currentYear:   number;   // injetado (mantém a função pura/testável)
}

export interface ProcessResult {
  content:       string;
  contentSource: ContentSource;
  flags:         string[];              // resumo p/ metadata/auditoria
  futureYears:   number[];              // anos distintos > period_end no corpo
  futureSamples: { year: number; context: string }[];
  symptoms:      string[];
  suspicious:    boolean;
}

/**
 * Recebe o HTML bruto e devolve o `content` limpo + proveniência + flags de
 * contaminação. Não faz rede.
 */
export function processSignalContent(inp: ProcessInput): ProcessResult {
  const { rawHtml, url, periodEndYear, snippet, isHistorical, maxChars, currentYear } = inp;

  // 1. Readability → fallback stripHtml.
  const extracted = extractMainContent(rawHtml, url);
  let contentSource: ContentSource = extracted.ok ? 'readability' : 'stripHtml';
  const body = (extracted.ok ? extracted.text : stripHtml(rawHtml)).slice(0, maxChars);

  // 2. Varredura de contaminação sobre o corpo já extraído (pós-readability).
  const futureSamples = scanFutureYears(body, periodEndYear);
  const futureYears = futureSamples.map(s => s.year);
  const symptoms = scanSymptoms(body);

  // Suspeita p/ fallback de snippet: termo de nav/feed, OU o carimbo do ano
  // corrente da própria página viva repetido (>=2). Uma projeção pontual
  // legítima ("by 2027" num artigo de 2016) NÃO deve disparar.
  const currentYearCount = (body.match(new RegExp(`\\b${currentYear}\\b`, 'g')) ?? []).length;
  const suspicious = symptoms.length > 0 || currentYearCount >= CURRENT_YEAR_SUSPICION_THRESHOLD;

  const flags: string[] = [];
  if (symptoms.length)    flags.push(`symptoms:${symptoms.join('|')}`);
  if (futureYears.length) flags.push(`future_years:${futureYears.join(',')}`);

  // 3. Fallback p/ snippet do Serper (correto para a época) em período histórico
  //    quando o corpo ainda parece contaminado. Não descarta o sinal.
  let content = body;
  if (isHistorical && suspicious && snippet && snippet.trim().length >= 40) {
    content = snippet.trim().slice(0, maxChars);
    contentSource = 'snippet';
    flags.push('fallback:snippet');
  }

  return { content, contentSource, flags, futureYears, futureSamples, symptoms, suspicious };
}
