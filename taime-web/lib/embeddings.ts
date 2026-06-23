/**
 * Helper minimo de embedding para o lado web (taime-web).
 *
 * Replica o padrao canonico do pipeline (text-embedding-3-small, 1536 dims):
 * mesmo modelo, mesma URL, mesma forma de request usada em app/api/search.
 * Existe porque o modulo embeddings-shared do root (taime-CLEAN) nao e
 * importavel daqui (pacote / tsconfig separados).
 *
 * Retorna um resultado discriminado: nunca lanca para o chamador, para que o
 * Advisor possa cair no fallback do router sem try/catch espalhado.
 */

const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings'
const EMBED_MODEL      = 'text-embedding-3-small'
const EMBED_DIMS       = 1536

export type EmbedResult =
  | { ok: true;  vector: number[] }
  | { ok: false; error: string }

export async function embedQuery(
  text: string,
  opts?: { timeoutMs?: number },
): Promise<EmbedResult> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return { ok: false, error: 'OPENAI_API_KEY missing' }

  const ctrl = new AbortController()
  const id   = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 15_000)
  try {
    const r = await fetch(OPENAI_EMBED_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body:   JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: ctrl.signal,
    })
    if (!r.ok) {
      const body = await r.text()
      return { ok: false, error: `openai ${r.status}: ${body.slice(0, 200)}` }
    }
    const json = await r.json() as { data?: Array<{ embedding: number[] }> }
    const vec  = json.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
      return { ok: false, error: `invalid embedding shape: ${vec?.length ?? 'n/a'}` }
    }
    return { ok: true, vector: vec }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'embed exception' }
  } finally {
    clearTimeout(id)
  }
}
