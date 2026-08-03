/**
 * Telemetria minima de chamadas LLM no taime-web (Advisor + /ask).
 *
 * FILOSOFIA identica a da raiz (lib llm-telemetry na raiz): FIRE-AND-FORGET, jamais
 * quebrar nem ATRASAR a resposta ao usuario. Chame logLlmCall() DEPOIS de computar a
 * resposta (em paralelo ao envio ou logo antes do return), NUNCA com await no caminho
 * quente. Falha de insert vira console.error e nada mais.
 *
 * Usa a service key server-side (createSupabaseService). A tabela llm_calls tem RLS
 * on / sem policy, entao so a service key escreve. NAO substitui o anon_advisor_log
 * existente: e uma camada nova e mais geral; sobreposicao no /ask e aceitavel.
 */
import { createSupabaseService } from '@/lib/supabase-server'

export interface LlmCallRecord {
  caller:              string   // 'advisor' | 'ask' | ...
  model:               string
  input_tokens?:       number | null
  output_tokens?:      number | null
  cache_read_tokens?:  number | null
  cache_write_tokens?: number | null
  latency_ms?:         number | null
  success:             boolean
  error_code?:         string | null
  period?:             string | null
  report_id?:          string | null
  user_id?:            string | null
  request_id?:         string | null
  meta?:               Record<string, unknown> | null
}

interface AnthropicUsageLike {
  input_tokens?:                number
  output_tokens?:               number
  cache_read_input_tokens?:     number
  cache_creation_input_tokens?: number
}

/** Normaliza o `usage` da Anthropic para as colunas de llm_calls. */
export function usageTokens(usage: AnthropicUsageLike | null | undefined): Pick<
  LlmCallRecord, 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_write_tokens'
> {
  return {
    input_tokens:       usage?.input_tokens ?? null,
    output_tokens:      usage?.output_tokens ?? null,
    cache_read_tokens:  usage?.cache_read_input_tokens ?? null,
    cache_write_tokens: usage?.cache_creation_input_tokens ?? null,
  }
}

/**
 * Grava uma chamada LLM. FIRE-AND-FORGET: dispara o insert e retorna na hora (void).
 * Erro de insert = console.error, sem propagar. NUNCA da await no caminho do usuario.
 */
export function logLlmCall(rec: LlmCallRecord): void {
  try {
    const service = createSupabaseService()
    void service
      .from('llm_calls')
      .insert(rec)
      .then(({ error }) => {
        if (error) console.error('[llm-telemetry] insert failed:', error.message)
      })
  } catch (e) {
    // createSupabaseService pode lancar se faltar env; nunca deixa isso subir.
    console.error('[llm-telemetry] skipped:', e instanceof Error ? e.message : e)
  }
}
