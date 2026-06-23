/**
 * TAIME - Helpers compartilhados de embedding.
 *
 * Centraliza o cliente OpenAI (text-embedding-3-small, 1536 dims) e o acesso
 * PostgREST usados pelos scripts de embedding (relatorio e trend), para que
 * exista UM unico padrao de embedding no projeto.
 *
 * Sem dependencias alem de fetch nativo. Importavel por scripts ts-node.
 */

export const OPENAI_EMBEDDING_ENDPOINT = 'https://api.openai.com/v1/embeddings';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

interface OpenAIEmbeddingResponse {
  data:  Array<{ embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs: number },
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), init.timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export interface EmbedResult {
  vector: number[];
  totalTokens: number;
}

/**
 * Gera o embedding de `text`. Retorna o vetor e os tokens consumidos (para
 * calculo de custo). Lanca erro se a dimensao nao bater com EMBEDDING_DIMS.
 */
export async function embed(
  text: string,
  opts: { openaiKey: string; model?: string; endpoint?: string; timeoutMs?: number },
): Promise<EmbedResult> {
  const r = await fetchWithTimeout(opts.endpoint ?? OPENAI_EMBEDDING_ENDPOINT, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${opts.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: opts.model ?? EMBEDDING_MODEL, input: text }),
    timeoutMs: opts.timeoutMs ?? 30_000,
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`OpenAI ${r.status}: ${body.slice(0, 200)}`);
  }

  const json = await r.json() as OpenAIEmbeddingResponse;
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) {
    throw new Error(`Embedding invalido: length=${vec?.length ?? 'n/a'}`);
  }
  return { vector: vec, totalTokens: json.usage?.total_tokens ?? 0 };
}

/** pgvector via PostgREST aceita string no formato '[v1,v2,v3,...]'. */
export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/** Cria um cliente REST (PostgREST) amarrado a uma URL/chave de service. */
export function makeRest(supabaseUrl: string, supabaseKey: string) {
  const base = supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  return async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      apikey:        supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      ...((init.headers ?? {}) as Record<string, string>),
    };
    const r = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`PostgREST ${r.status}: ${body}`);
    }
    // 204 (no content) e 201/200 com body vazio (POST/PATCH com return=minimal)
    // nao tem JSON para parsear. Le como texto e so faz parse se houver corpo.
    const text = await r.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  };
}
