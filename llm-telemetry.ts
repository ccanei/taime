/**
 * TAIME - Telemetria minima de chamadas LLM (pipeline / raiz).
 *
 * FILOSOFIA: minimo viavel, FIRE-AND-FORGET. Jamais quebrar nem atrasar o caminho
 * principal. O insert dispara numa promise separada com .catch(console.error); o
 * caminho principal NUNCA da await nele e NUNCA re-tenta. Sem env ou com falha de
 * rede: loga no console e a vida segue.
 *
 * Escreve via Supabase REST com a service key (mesmo padrao dos scripts do
 * pipeline). RLS on / sem policy garante que so a service key toca a tabela.
 *
 * Em scripts curtos (ts-node que terminam), chame flushLlmCalls() no fim do main
 * para garantir que os ultimos inserts foram entregues antes do processo sair.
 * Isso NAO viola o fire-and-forget do caminho principal: o flush roda no
 * encerramento, nunca no meio da geracao.
 */

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

export interface LlmCallRecord {
  caller:              string;   // 'collect'|'filter'|'analyze'|'generate'|'validate'|'regen'|...
  model:               string;
  input_tokens?:       number | null;
  output_tokens?:      number | null;
  cache_read_tokens?:  number | null;
  cache_write_tokens?: number | null;
  latency_ms?:         number | null;
  success:             boolean;
  error_code?:         string | null;
  period?:             string | null;
  report_id?:          string | null;
  user_id?:            string | null;
  request_id?:         string | null;
  meta?:               Record<string, unknown> | null;
}

// Formato do `usage` da Anthropic (nomes das chaves de cache variam do nosso schema).
interface AnthropicUsageLike {
  input_tokens?:                number;
  output_tokens?:               number;
  cache_read_input_tokens?:     number;
  cache_creation_input_tokens?: number;
}

/** Normaliza o `usage` da resposta Anthropic para as colunas de llm_calls. */
export function usageTokens(usage: AnthropicUsageLike | null | undefined): Pick<
  LlmCallRecord, 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_write_tokens'
> {
  return {
    input_tokens:       usage?.input_tokens ?? null,
    output_tokens:      usage?.output_tokens ?? null,
    cache_read_tokens:  usage?.cache_read_input_tokens ?? null,
    cache_write_tokens: usage?.cache_creation_input_tokens ?? null,
  };
}

const _pending: Promise<unknown>[] = [];

/**
 * Grava uma chamada LLM. FIRE-AND-FORGET: retorna imediatamente (void). O insert
 * roda em background; qualquer erro vira console.error e nada mais.
 */
export function logLlmCall(rec: LlmCallRecord): void {
  if (!SUPABASE_URL || !SUPABASE_KEY) return; // sem credenciais: no-op silencioso

  const p = fetch(`${SUPABASE_URL}/rest/v1/llm_calls`, {
    method: 'POST',
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'return=minimal',
    },
    body: JSON.stringify(rec),
  })
    .then(async res => {
      if (!res.ok) {
        console.error(`[llm-telemetry] insert ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
    })
    .catch(e => console.error('[llm-telemetry] insert failed:', e instanceof Error ? e.message : e));

  _pending.push(p);
  // Evita crescimento ilimitado do array em processos longos: poda os ja resolvidos.
  if (_pending.length > 256) _pending.splice(0, _pending.length - 256);
}

/**
 * Aguarda os inserts pendentes. Chamar no FIM de scripts curtos para garantir a
 * entrega antes do processo sair. Nunca lanca.
 */
export async function flushLlmCalls(): Promise<void> {
  await Promise.allSettled(_pending.splice(0));
}

/** Extrai um error_code curto e estavel de um erro qualquer (para agrupar). */
export function errorCodeOf(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const http = msg.match(/Anthropic API \((\d{3})\)/);
  if (http) return `http_${http[1]}`;
  if (/timeout|ETIMEDOUT/i.test(msg)) return 'timeout';
  if (/ECONNRESET|fetch failed|ENOTFOUND|network/i.test(msg)) return 'network';
  return msg.slice(0, 60);
}
