#!/usr/bin/env npx ts-node
import 'dotenv/config';
/**
 * TAIME — Signal Filter (relevance triage)
 * Roda ENTRE collect-signals.ts e analyze-signals.ts.
 *
 * O que faz: usa Claude Haiku como FILTRO DE LIXO estrutural. Ele NÃO julga
 * relevância de assunto — só reconhece ~7 padrões de artefato de scraping
 * (login, perfil de pessoa, job listing, stub de banco de dados, erro/fórum,
 * medicina/pharma pura, página vazia/duplicada). Tudo que não casa = KEEP.
 * Marca `signals.is_noise` no banco. O analyze ignora os marcados.
 *
 * A pauta continua emergindo no clustering (Sonnet). O Haiku só limpa o chão;
 * quem julga relevância e tema é o Sonnet. Quanto menos o Haiku "pensa" sobre
 * assunto, mais intacta a pauta chega ao Sonnet. Papers de CS/ML/IA = sempre KEEP.
 *
 * Conservador por design: na dúvida, MANTÉM (keep). Falso negativo (deixar um
 * lixo passar) é barato — o Sonnet descarta depois. Falso positivo (cortar um
 * sinal bom) é caro — perdido. Então erra para o lado de manter.
 *
 * Usage:
 *   PERIOD=2016-06-01 npx ts-node filter-signals.ts            # marca no banco
 *   PERIOD=2016-06-01 npx ts-node filter-signals.ts --dry-run  # só imprime, não grava
 *
 * Env: ANTHROPIC_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 *      PERIOD (opcional — default: primeiro dia do mês atual)
 *
 * Pré-requisito: coluna is_noise em signals.
 *   alter table public.signals add column if not exists is_noise boolean not null default false;
 */

import { parsePeriod } from './period-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SignalRow {
  id: string;
  title: string;
  metadata: { snippet?: string } | null;
  sources: { name: string; category: string } | null;
}

interface Verdict {
  index: number;      // 1-based, igual ao enviado ao LLM
  keep: boolean;
  reason: string;     // motivo curto (só para ruído; vazio para keep)
}

interface LLMResponse {
  verdicts: Verdict[];
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  supabaseUrl:  (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:  process.env.SUPABASE_SERVICE_KEY ?? '',
  model:        'claude-haiku-4-5-20251001',
  maxTokens:    8192,
  batchSize:    120,   // sinais por chamada Haiku (mantém o prompt sob controle)
};

const DRY_RUN = process.argv.includes('--dry-run');

const now = new Date();
const PERIOD = process.env.PERIOD
  ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

// ─── Supabase REST ────────────────────────────────────────────────────────────

function dbHeaders(represent = false) {
  return {
    apikey:         cfg.supabaseKey,
    Authorization:  `Bearer ${cfg.supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer:         represent ? 'return=representation' : 'return=minimal',
  };
}

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, { headers: dbHeaders(true) });
  if (!res.ok) throw new Error(`DB GET /${path}: ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

async function dbPatch(id: string, isNoise: boolean): Promise<void> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/signals?id=eq.${id}`, {
    method: 'PATCH',
    headers: dbHeaders(),
    body: JSON.stringify({ is_noise: isNoise }),
  });
  if (!res.ok) throw new Error(`DB PATCH signals/${id}: ${await res.text()}`);
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a junk filter for a scraped-search-results pipeline. Your job is \
NARROW and MECHANICAL: spot scraping artifacts. You do NOT judge whether content is interesting, \
strategic, relevant, academic, or important. You are not an analyst. A later, smarter stage does \
all of that. You only remove structural junk.

DEFAULT IS KEEP. Every signal is KEEP unless it clearly matches one of the NOISE patterns below. \
If it is a real article, paper, post, or news item on ANY subject — KEEP it. Subject matter is \
NEVER a reason to mark noise. "Too academic", "too niche", "not strategic", "just a product tip", \
"only research" are NOT valid reasons — those are all KEEP.

Mark NOISE only when the item is one of these STRUCTURAL ARTIFACTS (recognize the form, ignore the topic):

1. ACCOUNT / NAV / BOILERPLATE: login pages, "Contact Us", "Newsletter" signup, "Membership - \
Account - Help", privacy/cookie shells, "Press Releases Archives", category/pagination index \
pages ("Blogs - CIO", "Analytics | Page 141"), event/calendar listing pages.
2. PERSON PROFILE: a page that is just a person's name / staff bio / author profile with no \
article (e.g. "Brian Nadres", "Desere Edwards", "Eben Halford's InfoQ Profile"), or a bare list \
of executive names with no story.
3. JOB POSTING: careers / job-detail pages ("... Solution Architect — Job Details").
4. DATABASE/DIRECTORY STUB: company valuation/profile pages, "Competitors, Financials, Employees" \
directory entries, investment-portfolio stubs — the kind PitchBook and CB Insights emit. These \
are listing stubs with no article body.
5. SUPPORT/ERROR ARTIFACT: technical support forum Q&A stubs, "Solved: ..." community posts, \
compiler/runtime error messages, raw code-snippet help threads.
6. NON-TECH MEDICINE: pure biomedical / pharmaceutical / clinical content — drug trials, drug \
approvals, genomics of organisms, receptor/molecule biology, orphan drugs, clinical endpoints. \
(This is the medicine domain, out of scope.)
7. NEAR-EMPTY / DUPLICATE: blank pages, or an obvious exact duplicate of another signal.

DO NOT MARK NOISE — these are always KEEP, no matter how dry or narrow:
- Academic / research papers about computer science, machine learning, AI, quantum computing, \
systems, data, cryptography, networking, hardware/semiconductors. arXiv cs.*, MIT CSAIL, \
university and corporate research are CORE KEEP signals. Only MEDICINE/pharma research is noise \
(pattern 6). A CS/ML/quantum paper is ALWAYS KEEP.
- Product / feature news however minor (a Windows tip, a GitHub notification change, a cloud \
service tweak, a partnership announcement like "Microsoft and Xiaomi expand partnership").
- Energy / cleantech / renewable / EV / sustainability tied to companies or infrastructure.
- Regulation / policy with a tech or data angle (GDPR, privacy, security, AI governance).
- Anything about software, cloud, AI, data, security, infra, devops, fintech, digital business, \
or strategy — even a thin snippet.

Decision rule: does the TITLE/SNIPPET/SOURCE match one of the 7 artifact patterns? If yes → NOISE \
with the pattern name as reason. If you are not sure it matches a pattern → KEEP. Err heavily \
toward KEEP; wrongly cutting a real signal is the worst outcome.

Return VALID JSON ONLY — no markdown, no text outside the JSON:
{
  "verdicts": [
    { "index": 1, "keep": true, "reason": "" },
    { "index": 2, "keep": false, "reason": "person profile" }
  ]
}
Every signal index in the input MUST appear exactly once in verdicts.`;

function formatBatch(signals: SignalRow[], offset: number): string {
  return signals.map((s, i) => {
    const idx     = offset + i + 1;
    const source  = s.sources?.name ?? '?';
    const snippet = (s.metadata?.snippet ?? '').slice(0, 200);
    return `[${idx}] (${source}) ${s.title}\n     ${snippet || '(no snippet)'}`;
  }).join('\n\n');
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

async function classifyBatch(signals: SignalRow[], offset: number): Promise<Verdict[]> {
  const userPrompt =
    `Triage these ${signals.length} signals. Return a verdict for EACH index.\n\n` +
    `${formatBatch(signals, offset)}\n\nReturn valid JSON only.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model:      cfg.model,
      max_tokens: cfg.maxTokens,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API (${res.status}): ${await res.text()}`);

  const data = await res.json() as { content: Array<{ type: string; text: string }>; usage: AnthropicUsage };
  const u = data.usage;
  console.log(
    `  Tokens: ${u.input_tokens}in / ${u.output_tokens}out` +
    (u.cache_read_input_tokens ? ` / ${u.cache_read_input_tokens} cache-read` : ''),
  );

  const text = data.content.find(b => b.type === 'text')?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Haiku não retornou JSON:\n${text.slice(0, 300)}`);

  let parsed: LLMResponse;
  try {
    parsed = JSON.parse(match[0]) as LLMResponse;
  } catch (e) {
    throw new Error(`Falha ao parsear JSON: ${e}\n${match[0].slice(0, 300)}`);
  }
  return parsed.verdicts ?? [];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const missing = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n✗ Variáveis faltando: ${missing.join(', ')}\n`); process.exit(1);
  }
  parsePeriod(PERIOD); // valida o formato do período (lança se inválido)

  console.log('\n╔══════════════════════════════════╗');
  console.log('║   TAIME — Signal Filter (Haiku)  ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Período:  ${PERIOD}`);
  console.log(`Modelo:   ${cfg.model}`);
  console.log(`Modo:     ${DRY_RUN ? 'DRY-RUN (não grava)' : 'gravando is_noise'}\n`);

  // Carrega TODOS os sinais do período (inclusive já marcados — re-rodável).
  process.stdout.write('Carregando sinais... ');
  const signals = await dbGet<SignalRow>(
    `signals?period=eq.${PERIOD}&select=id,title,metadata,sources(name,category)&order=id.asc`,
  );
  console.log(`${signals.length} encontrado(s).`);

  if (signals.length === 0) {
    console.error('\n✗ Nenhum sinal. Rode collect-signals.ts antes.\n'); process.exit(1);
  }

  // Classifica em lotes
  const verdictById = new Map<string, Verdict>();
  for (let off = 0; off < signals.length; off += cfg.batchSize) {
    const batch = signals.slice(off, off + cfg.batchSize);
    console.log(`Classificando ${batch.length} sinais (${off + 1}-${off + batch.length})...`);
    const verdicts = await classifyBatch(batch, off);

    // Mapeia índice (1-based global) → sinal; verdicts sem par viram keep (conservador).
    for (const v of verdicts) {
      const localIdx = v.index - off - 1;
      const sig = batch[localIdx];
      if (sig) verdictById.set(sig.id, v);
    }
  }

  // Qualquer sinal sem veredito explícito = KEEP (conservador).
  let missingVerdicts = 0;
  for (const s of signals) {
    if (!verdictById.has(s.id)) {
      verdictById.set(s.id, { index: -1, keep: true, reason: '' });
      missingVerdicts++;
    }
  }
  if (missingVerdicts > 0) {
    console.warn(`  ⚠ ${missingVerdicts} sinal(is) sem veredito do LLM → mantidos (keep) por segurança.`);
  }

  // Aplica (ou simula) — e coleta os descartados para impressão.
  const sigById = new Map(signals.map(s => [s.id, s]));
  let kept = 0, noise = 0;
  const noiseList: Array<{ source: string; title: string; reason: string }> = [];

  for (const [id, v] of verdictById) {
    if (v.keep) { kept++; continue; }
    noise++;
    const s = sigById.get(id);
    noiseList.push({
      source: s?.sources?.name ?? '?',
      title:  (s?.title ?? '').slice(0, 70),
      reason: v.reason || 'noise',
    });
    if (!DRY_RUN) await dbPatch(id, true);
  }
  // Garante que os mantidos fiquem is_noise=false (caso re-rodada reclassifique algo).
  if (!DRY_RUN) {
    for (const [id, v] of verdictById) {
      if (v.keep) await dbPatch(id, false);
    }
  }

  // ── Relatório ──────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log(`RUÍDO descartado (${noise}):`);
  for (const n of noiseList) {
    console.log(`  ✗ [${n.source}] ${n.title}  — ${n.reason}`);
  }

  // Pauta que SOBRA (sinais mantidos), agrupada por fonte só para você ver o que ficou.
  const keptSignals = signals.filter(s => verdictById.get(s.id)?.keep);
  const byCategory = new Map<string, number>();
  for (const s of keptSignals) {
    const cat = s.sources?.category ?? '?';
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`MANTIDOS por categoria (${kept}):`);
  [...byCategory.entries()].sort((a, b) => b[1] - a[1]).forEach(([cat, n]) => {
    console.log(`  · ${cat.padEnd(16)} ${n}`);
  });

  console.log('\n' + '─'.repeat(70));
  console.log(`Total:    ${signals.length}`);
  console.log(`Mantidos: ${kept}  (${Math.round(kept / signals.length * 100)}%)`);
  console.log(`Ruído:    ${noise}  (${Math.round(noise / signals.length * 100)}%)`);
  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Nada gravado. Rode sem --dry-run para aplicar is_noise.\n');
  } else {
    console.log('\n✓ is_noise atualizado. Próximo: npx ts-node analyze-signals.ts\n');
  }
}

main().catch(err => { console.error('\n✗ Erro fatal:', err); process.exit(1); });
