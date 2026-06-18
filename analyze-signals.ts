#!/usr/bin/env npx ts-node
import 'dotenv/config';
import { parsePeriod } from './period-utils';
import { isSignalWithinPeriod } from './date-check';
/**
 * TAIME — Signal Analyzer
 * Agrupa sinais do período em 4-12 clusters temáticos via Claude Sonnet 4.6
 * Cobertura: forma cluster para todo tema coerente com >= 3 sinais (não 8).
 * Inclui temas técnicos/engenharia (DevOps, containers, tooling), não só negócio.
 *
 * BUG FIX: UUIDs nunca são enviados ao LLM.
 * O LLM trabalha com índices numéricos ("001", "042").
 * O mapeamento índice → UUID é resolvido localmente após a resposta.
 *
 * Usage:  npx ts-node analyze-signals.ts
 * Env:    ANTHROPIC_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY
 *         PERIOD (opcional — default: primeiro dia do mês atual)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface SignalWithSource {
  id: string;
  title: string;
  content: string;
  metadata: { snippet?: string; published_date?: string; query_used?: string };
  sources: { name: string; category: string } | null;
}

interface ClusterOutput {
  name: string;
  description: string;
  signal_ids: string[]; // índices "001".."NNN" — mapeados para UUIDs antes de salvar
  llm_reasoning: string;
}

interface LLMResponse {
  clusters: ClusterOutput[];
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  anthropicKey:        process.env.ANTHROPIC_API_KEY ?? '',
  supabaseUrl:         (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
  supabaseKey:         process.env.SUPABASE_SERVICE_KEY ?? '',
  model:               'claude-sonnet-4-6',
  maxTokens:           8192,
  contentPreviewChars: 400,
};

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

async function dbPost(table: string, row: unknown): Promise<void> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${table}`, {
    method: 'POST', headers: dbHeaders(), body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`DB POST ${table}: ${await res.text()}`);
}

// ─── Index map — UUID isolation ───────────────────────────────────────────────

// Mapeia índice "001" → UUID real. O LLM nunca vê os UUIDs.
type IndexMap = Map<string, string>;

function buildIndexMap(signals: SignalWithSource[]): IndexMap {
  const map = new Map<string, string>();
  signals.forEach((s, i) => map.set(String(i + 1).padStart(3, '0'), s.id));
  return map;
}

// Converte índices retornados pelo LLM de volta para UUIDs reais.
// Índices inválidos ou não reconhecidos são descartados silenciosamente.
function resolveToUUIDs(indices: string[], indexMap: IndexMap): string[] {
  const resolved: string[] = [];
  for (const token of indices) {
    // Normaliza: aceita "1", "01", "001"
    const key = String(parseInt(token, 10)).padStart(3, '0');
    const uuid = indexMap.get(key);
    if (uuid) resolved.push(uuid);
  }
  return [...new Set(resolved)]; // remove duplicatas
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior strategic technology intelligence analyst at TAIME, \
a platform that democratizes Gartner-level insights for SMEs.

Analyze technology signals from tier-1 sources and group them into thematic clusters.

A "cluster" is a group of signals sharing a common theme with implications for business \
operations, technology investment, engineering practice, or competitive positioning.

PERIOD AWARENESS — read carefully:
- These signals are from a specific historical period (given in the user message).
- Judge what was strategically or technically relevant AS OF THAT PERIOD, not by today's standards.
- A theme that looks dated or operational now (e.g. virtualization, containers, a specific \
framework, an early-stage platform) may have been a defining trend of its time. Cluster it on \
its own terms. Do NOT impose present-day themes onto an earlier period.

COVERAGE, not selection:
- Form a cluster for EVERY coherent thematic grouping supported by at least 3 signals.
- Do not pre-select only the "most strategic" themes and discard the rest. Your job is to map \
the full thematic shape of the period, not to pick a top handful.
- Aim to cover as many signals as possible. Signals left in no cluster are lost from the archive, \
so only leave a signal uncovered if it is genuine noise (navigation pages, author bios, login \
pages, off-topic content, pure duplicates).

CLUSTER SCOPE — include both kinds of theme:
- Business/strategy themes (AI adoption, cloud migration, digital transformation, regulation).
- Technical/engineering themes (DevOps, containers, developer tooling, data engineering, \
observability, infrastructure). These are valid clusters in their own right, not sub-points of a \
business theme. They are often the most temporally distinctive signal of a period.

Rules:
- Create between 4 and 12 clusters. Minimum 3 signals per cluster (not 8). More clusters covering \
more real themes is better than a few broad ones, as long as each is coherent.
- Each cluster references signals using their 3-digit INDEX (e.g., "001", "042", "117")
  — NEVER invent or modify indices — only use indices that appear in the signal list
- A signal belongs to its PRIMARY cluster only — no duplicates across clusters
- Cluster names: concise, action-oriented (4–8 words)
- Descriptions: 2–3 sentences on relevance and urgency, framed for the period
- Reasoning: explain why this cluster is meaningful THIS period specifically

Return VALID JSON ONLY — no markdown, no text outside the JSON.

Schema:
{
  "clusters": [
    {
      "name": "concise cluster name",
      "description": "2-3 sentences on business relevance for SMEs",
      "signal_ids": ["001", "007", "042"],
      "llm_reasoning": "why this cluster is strategically dominant this period"
    }
  ]
}`;

// UUIDs ocultados — LLM vê apenas o índice numérico
function formatSignalsForLLM(signals: SignalWithSource[]): string {
  return signals.map((s, i) => {
    const idx     = String(i + 1).padStart(3, '0');
    const source  = s.sources?.name ?? 'Unknown Source';
    const preview = (s.content || s.metadata?.snippet || '').slice(0, cfg.contentPreviewChars);
    return (
      `[${idx}]\n` +
      `Source: ${source}\n` +
      `Title: ${s.title}\n` +
      `Context: ${preview || '(no preview available)'}`
    );
  }).join('\n\n---\n\n');
}

// ─── Anthropic API ────────────────────────────────────────────────────────────

async function callClaude(signalsText: string, signalCount: number): Promise<LLMResponse> {
  const userPrompt =
    `Analyze ${signalCount} technology signals from the period ${PERIOD}.\n` +
    `Judge relevance AS OF ${PERIOD} — cluster themes that mattered then, even if they look ` +
    `dated or operational today (e.g. containers, a specific framework, an early platform).\n` +
    `Form a cluster for every coherent theme with at least 3 signals — business AND ` +
    `engineering themes alike. Cover as many signals as possible; leave out only genuine noise.\n` +
    `Use the 3-digit index (e.g., "001") in signal_ids — never invent new indices.\n\n` +
    `SIGNALS:\n\n${signalsText}\n\n` +
    `Return valid JSON only.`;

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
  const u    = data.usage;
  console.log(
    `  Tokens: ${u.input_tokens}in / ${u.output_tokens}out` +
    (u.cache_creation_input_tokens ? ` / ${u.cache_creation_input_tokens} cache-written` : '') +
    (u.cache_read_input_tokens     ? ` / ${u.cache_read_input_tokens} cache-read`        : ''),
  );

  const text      = data.content.find(b => b.type === 'text')?.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`LLM não retornou JSON válido:\n${text.slice(0, 400)}`);

  try {
    return JSON.parse(jsonMatch[0]) as LLMResponse;
  } catch (e) {
    throw new Error(`Falha ao parsear JSON: ${e}\n${jsonMatch[0].slice(0, 400)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const missing = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n✗ Variáveis faltando: ${missing.join(', ')}\n`); process.exit(1);
  }

  console.log('\n╔══════════════════════════════════╗');
  console.log('║   TAIME — Signal Analyzer        ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Período:  ${PERIOD}`);
  console.log(`Modelo:   ${cfg.model}\n`);

  // Idempotência
  const existing = await dbGet<{ id: string }>(`signal_clusters?period=eq.${PERIOD}&select=id`);
  if (existing.length > 0) {
    console.log(`⚠ Já existem ${existing.length} cluster(s) para ${PERIOD}.`);
    console.log('  Delete-os antes de re-executar.\n');
    process.exit(0);
  }

  // Carrega sinais — ignora os marcados como ruído pelo filter-signals.ts.
  // is_noise default=false, então períodos nunca filtrados continuam vindo inteiros.
  process.stdout.write('Carregando sinais (is_noise=false)... ');
  const signals = await dbGet<SignalWithSource>(
    `signals?period=eq.${PERIOD}&is_noise=eq.false&select=id,title,content,metadata,sources(name,category)`,
  );
  console.log(`${signals.length} encontrado(s).`);

  if (signals.length < 5) {
    console.error(`\n✗ Sinais insuficientes (${signals.length}). Execute collect-signals.ts.\n`);
    process.exit(1);
  }

  // Constrói mapeamento índice → UUID (LLM nunca verá os UUIDs)
  const indexMap   = buildIndexMap(signals);
  const signalsText = formatSignalsForLLM(signals);

  console.log(`Enviando ${signals.length} sinais para ${cfg.model} (IDs ocultados)...`);
  const llmResult = await callClaude(signalsText, signals.length);

  const clusters = llmResult.clusters ?? [];

  // Piso: menos de 4 clusters é suspeito (período pobre ou falha do modelo) — aborta.
  if (clusters.length < 4) {
    throw new Error(`LLM retornou ${clusters.length} cluster(s) — mínimo esperado 4.`);
  }

  // Teto: signal_clusters não tem constraint de rank, então pode guardar bastante.
  // O limite de publicação (12) é aplicado depois no generate-report (report_trends.rank).
  // Se vier acima do teto, MANTÉM os mais densos em vez de rejeitar tudo (não desperdiça a chamada).
  const MAX_CLUSTERS = 18;
  if (clusters.length > MAX_CLUSTERS) {
    clusters.sort((a, b) => b.signal_ids.length - a.signal_ids.length);
    const dropped = clusters.length - MAX_CLUSTERS;
    console.warn(`  ⚠ LLM retornou ${clusters.length} clusters; mantendo os ${MAX_CLUSTERS} mais densos (descartados ${dropped} menores).`);
    clusters.length = MAX_CLUSTERS;
  }

  // Resolve índices → UUIDs e descarta inválidos
  let totalInvalid = 0;
  for (const cluster of clusters) {
    const before = cluster.signal_ids.length;
    cluster.signal_ids = resolveToUUIDs(cluster.signal_ids, indexMap);
    const removed = before - cluster.signal_ids.length;
    if (removed > 0) {
      console.warn(`  ⚠ "${cluster.name}": ${removed} índice(s) inválido(s) descartado(s)`);
      totalInvalid += removed;
    }
  }

  if (totalInvalid === 0) {
    console.log('  ✓ Todos os índices resolvidos para UUIDs válidos.');
  }

  // ── Validação cruzada por data: segunda camada (a Fase 1 filtra na coleta).
  // Para cada cluster, conta sinais com data ABSOLUTA claramente fora da
  // janela. Datas null/relativas/inválidas contam como "dentro" (conservador).
  // Se >50% do cluster está fora → descarta o cluster antes de virar trend.
  const { start: periodStart, end: periodEnd } = parsePeriod(PERIOD);
  const dateById = new Map<string, string | null | undefined>(
    signals.map(s => [s.id, s.metadata?.published_date]),
  );

  const kept: ClusterOutput[] = [];
  let clustersDiscarded = 0;
  for (const cluster of clusters) {
    const total = cluster.signal_ids.length;
    if (total === 0) {
      clustersDiscarded++;
      console.log(`  ⚠ Cluster "${cluster.name}" descartado: 0 sinais resolvidos`);
      continue;
    }
    const outside = cluster.signal_ids.reduce((n, id) => {
      const date = dateById.get(id);
      return isSignalWithinPeriod(date, periodStart, periodEnd) ? n : n + 1;
    }, 0);
    if (outside * 2 > total) {                  // >50%
      clustersDiscarded++;
      console.log(`  ⚠ Cluster "${cluster.name}" descartado: ${outside}/${total} sinais fora do período`);
      continue;
    }
    kept.push(cluster);
  }

  if (kept.length === 0) {
    console.error(`\n✗ Todos os ${clusters.length} cluster(s) foram descartados por validação de data.`);
    console.error('  Verifique se a coleta trouxe sinais do período correto.\n');
    process.exit(1);
  }

  // Persiste clusters
  console.log(`\nSalvando ${kept.length} cluster(s)...`);
  for (const cluster of kept) {
    await dbPost('signal_clusters', {
      period:        PERIOD,
      name:          cluster.name,
      description:   cluster.description,
      signal_ids:    cluster.signal_ids,
      llm_reasoning: cluster.llm_reasoning,
    });
    console.log(`  ✓ "${cluster.name}" — ${cluster.signal_ids.length} sinais`);
  }

  const covered   = new Set(kept.flatMap(c => c.signal_ids));
  const uncovered = signals.length - covered.size;

  console.log('\n' + '─'.repeat(50));
  console.log(`✓ Clusters formados:   ${clusters.length}`);
  if (clustersDiscarded > 0)
    console.log(`⚠ Descartados por data: ${clustersDiscarded}`);
  console.log(`✓ Clusters salvos:     ${kept.length}`);
  console.log(`✓ Sinais cobertos:     ${covered.size} / ${signals.length}`);
  if (uncovered > 0) console.log(`~ Sem cluster:         ${uncovered} (ruído descartado)`);
  console.log(`\nPróximo: npx ts-node generate-report.ts\n`);
}

main().catch(err => { console.error('\n✗ Erro fatal:', err); process.exit(1); });
