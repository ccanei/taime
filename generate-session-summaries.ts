#!/usr/bin/env npx ts-node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback para .env
/**
 * TAIME - Gerador de resumos de sessao do Advisor (memoria de cliente)
 *
 * Seleciona sessoes FECHADAS (sem atividade recente) que ainda nao tem resumo em
 * advisor_session_summaries. Para cada uma, le as mensagens de advisory_memory na
 * ordem cronologica, pede um resumo estruturado ao Haiku (campos fixos), embeda o
 * resumo (text-embedding-3-small, 1536 dims via embeddings-shared) e grava.
 *
 * Estruturado em: Temas tocados, Decisoes tomadas, Pendencias / proximos passos,
 * Contexto da empresa revelado. Tom profissional e factual; nunca divagacao
 * pessoal ou emocional; nunca inventar.
 *
 * Idempotente por session_id (pula sessoes que ja tem resumo; --force regrava).
 *
 * Usage:
 *   npx ts-node generate-session-summaries.ts            # sessoes paradas ha >= STALE_HOURS
 *   npx ts-node generate-session-summaries.ts --all      # ignora recencia (backfill)
 *   npx ts-node generate-session-summaries.ts --force    # regrava resumos existentes
 *   npx ts-node generate-session-summaries.ts --all --dry-run  # so gera e imprime, NAO grava
 * Env: OPENAI_API_KEY  SUPABASE_URL  SUPABASE_SERVICE_KEY  ANTHROPIC_API_KEY
 *      STALE_HOURS (default 3)
 *
 * --dry-run: util antes de aplicar a migracao. Le sessoes, gera resumos via Haiku
 * e imprime para inspecao, SEM embeddar nem gravar (nao toca advisor_session_summaries).
 */

import { EMBEDDING_MODEL, embed, vectorLiteral, makeRest, sleep } from './embeddings-shared';
import { deepStripLoneSurrogates } from './sanitize';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionRow {
  session_id:       string;
  user_id:          string;
  title:            string | null;
  message_count:    number;
  last_activity_at: string;
}
interface MemoryRow { role: string; content: string }

// ─── Config ──────────────────────────────────────────────────────────────────

const cfg = {
  supabaseUrl:    process.env.SUPABASE_URL ?? '',
  supabaseKey:    process.env.SUPABASE_SERVICE_KEY ?? '',
  openaiKey:      process.env.OPENAI_API_KEY ?? '',
  anthropicKey:   process.env.ANTHROPIC_API_KEY ?? '',
  model:          EMBEDDING_MODEL,
  haikuModel:     'claude-haiku-4-5',
  staleHours:     Number(process.env.STALE_HOURS ?? 3),
  maxRetries:     2,
  retryDelayMs:   2_000,
  interItemDelay: 200,
  fetchTimeoutMs: 30_000,
};

const ALL   = process.argv.includes('--all');
const FORCE = process.argv.includes('--force');
const DRY   = process.argv.includes('--dry-run');

const rest = makeRest(cfg.supabaseUrl, cfg.supabaseKey);

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const SUMMARY_INSTRUCTIONS = `Voce resume uma sessao de consultoria estrategica de tecnologia entre um cliente e o TAIME Executive Advisor. Produza um resumo PROFISSIONAL e FACTUAL, util como memoria de trabalho para a proxima conversa.

Responda em texto puro, exatamente com estas quatro secoes nesta ordem, cada uma com seu titulo seguido de bullets curtos:

Temas tocados:
- (assuntos de tecnologia/estrategia discutidos)

Decisoes tomadas:
- (o que o cliente decidiu ou definiu; "Nenhuma" se nao houve)

Pendencias / proximos passos:
- (o que ficou em aberto ou foi combinado para depois; "Nenhuma" se nao houve)

Contexto da empresa revelado:
- (fatos sobre a empresa do cliente que apareceram: setor, porte, stack, objetivo, maturidade; "Nada novo" se nao houve)

Regras:
- So conteudo de TRABALHO: temas, decisoes, contexto de negocio. NUNCA tom emocional, divagacao pessoal ou avaliacao da relacao.
- NUNCA inventar. Se a sessao nao cobre uma secao, escreva "Nenhuma" / "Nada novo". Nao deduza alem do que foi dito.
- Seja conciso. Bullets curtos, sem repetir a conversa verbatim.
- Escreva no idioma predominante da conversa.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireEnv(): void {
  // Em dry-run nao embeddamos, entao OPENAI_API_KEY nao e obrigatoria.
  const required = DRY
    ? (['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY'] as const)
    : (['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY'] as const);
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Faltam variaveis de ambiente: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function buildTranscript(rows: MemoryRow[]): string {
  return rows
    .map(m => `${m.role === 'assistant' ? 'ADVISOR' : 'CLIENTE'}: ${m.content.trim()}`)
    .join('\n\n');
}

async function summarizeWithHaiku(transcript: string): Promise<string> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    // Rede final: o transcript e conteudo de usuario e pode conter surrogates
    // orfaos; remove-os do body antes de serializar.
    body: JSON.stringify(deepStripLoneSurrogates({
      model:      cfg.haikuModel,
      max_tokens: 1100,
      system:     SUMMARY_INSTRUCTIONS,
      messages:   [{ role: 'user', content: `TRANSCRICAO DA SESSAO:\n\n${transcript}` }],
    })),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content.find(b => b.type === 'text')?.text?.trim() ?? '';
  if (!text) throw new Error('resumo vazio do Haiku');
  return text;
}

async function saveSummary(sessionId: string, userId: string, summary: string, vec: number[]): Promise<void> {
  await rest<null>(`advisor_session_summaries?on_conflict=session_id`, {
    method:  'POST',
    headers: {
      Prefer: `resolution=${FORCE ? 'merge-duplicates' : 'ignore-duplicates'},return=minimal`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      user_id:    userId,
      summary,
      embedding:  vectorLiteral(vec),
      updated_at: new Date().toISOString(),
    }),
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  requireEnv();

  console.log('╔════════════════════════════════════════════╗');
  console.log('║  TAIME - Gerador de resumos de sessao        ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`Embedding: ${cfg.model} (1536) | Resumo: ${cfg.haikuModel}`);
  console.log(`Modo: ${ALL ? 'TODAS as sessoes' : `paradas ha >= ${cfg.staleHours}h`}${FORCE ? ' | FORCE (regrava)' : ''}${DRY ? ' | DRY-RUN (nao grava)' : ''}`);

  // Sessoes candidatas.
  let sessionsPath = 'advisor_sessions?select=session_id,user_id,title,message_count,last_activity_at&order=last_activity_at.desc';
  if (!ALL) {
    const cutoff = new Date(Date.now() - cfg.staleHours * 3_600_000).toISOString();
    sessionsPath += `&last_activity_at=lt.${encodeURIComponent(cutoff)}`;
  }
  const sessions = await rest<SessionRow[]>(sessionsPath);

  // Resumos ja existentes (idempotencia por session_id). Em dry-run a tabela pode
  // nem existir ainda, entao nao consultamos.
  const have = new Set<string>();
  if (!DRY) {
    const existing = await rest<Array<{ session_id: string }>>('advisor_session_summaries?select=session_id');
    for (const e of existing) have.add(e.session_id);
  }

  const jobs = (FORCE || DRY) ? sessions : sessions.filter(s => !have.has(s.session_id));

  console.log(`Sessoes candidatas: ${sessions.length}`);
  console.log(`Ja com resumo:      ${have.size}`);
  console.log(`A processar:        ${jobs.length}`);
  console.log('──────────────────────────────────────────────────');

  if (jobs.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  let ok = 0, failed = 0, totalTokens = 0;
  const failures: Array<{ session: string; error: string }> = [];

  for (let i = 0; i < jobs.length; i++) {
    const s = jobs[i];
    const prefix = `[${i + 1}/${jobs.length}]`;
    const label  = s.title?.trim() || s.session_id;

    try {
      const msgs = await rest<MemoryRow[]>(
        `advisory_memory?select=role,content,created_at,id&session_id=eq.${s.session_id}&order=created_at.asc,id.asc`,
      );
      if (msgs.length === 0) {
        console.log(`${prefix} "${label}" sem mensagens; pulado`);
        failed++; failures.push({ session: s.session_id, error: 'sem mensagens' });
        continue;
      }

      const transcript = buildTranscript(msgs);
      const summary    = await summarizeWithHaiku(transcript);
      if (!DRY) {
        const { vector, totalTokens: tk } = await embed(summary, {
          openaiKey: cfg.openaiKey, model: cfg.model, timeoutMs: cfg.fetchTimeoutMs,
        });
        await saveSummary(s.session_id, s.user_id, summary, vector);
        totalTokens += tk;
      }
      ok++;

      console.log(`\n${prefix} ${DRY ? 'DRY' : 'OK'} - "${label}" (${msgs.length} msgs, user ${s.user_id.slice(0, 8)})`);
      console.log('────────────────────────────────────────────────');
      console.log(summary);
      console.log('────────────────────────────────────────────────');
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log(`${prefix} x "${label}" falhou: ${err.slice(0, 160)}`);
      failed++; failures.push({ session: s.session_id, error: err });
    }

    if (i < jobs.length - 1) await sleep(cfg.interItemDelay);
  }

  const usd = (totalTokens / 1_000_000) * 0.02;
  console.log('\n──────────────────────────────────────────────────');
  console.log(`✓ Resumos gerados: ${ok}`);
  console.log(`x Falharam/pulados: ${failed}`);
  console.log(`Tokens de embedding: ${totalTokens} (US$ ${usd.toFixed(5)})`);
  if (failures.length) {
    console.log('\nFalhas/pulos:');
    for (const f of failures) console.log(`  - ${f.session}: ${f.error.slice(0, 160)}`);
  }
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
