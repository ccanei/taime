/**
 * TAIME — Sanitizacao de texto antes de serializar para a API Anthropic.
 *
 * Centraliza a remocao de surrogates UTF-16 ORFAOS. Usado por todo o pipeline
 * (collect, filter, analyze, generate, validate e utilitarios) para que NENHUM
 * arquivo volte a falhar com "The request body is not valid JSON: no low
 * surrogate in string" em nenhum batch futuro.
 *
 * Antes ficava duplicado em generate-report.ts; agora ha uma unica fonte para
 * nao divergir.
 */

// Remove surrogates UTF-16 ORFAOS (U+D800-U+DFFF sem par valido). Um high sem low
// seguinte, ou um low sem high anterior, quebra o JSON do corpo da requisicao: a
// API da Anthropic rejeita com "no low surrogate in string". Causa tipica: um
// .slice() por code unit corta um emoji (par de surrogates) ao meio, deixando o
// high orfao no fim. Pares validos (emojis, caracteres multi-byte) ficam INTACTOS;
// so os orfaos sao removidos.
export function stripLoneSurrogates(s: string): string {
  if (typeof s !== 'string') return s;
  return s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')                 // high orfao
    .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, '$1');           // low orfao
}

// Rede final: aplica stripLoneSurrogates a todos os valores string de um objeto
// (arrays e objetos aninhados), para que NENHUM caminho de prompt vaze um
// surrogate orfao para a API, hoje e em qualquer batch futuro. Envolver o body
// com esta funcao imediatamente antes do JSON.stringify garante a protecao
// independentemente de onde o texto foi montado ou fatiado.
export function deepStripLoneSurrogates<T>(value: T): T {
  if (typeof value === 'string') return stripLoneSurrogates(value) as unknown as T;
  if (Array.isArray(value)) return value.map(v => deepStripLoneSurrogates(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepStripLoneSurrogates(v);
    }
    return out as unknown as T;
  }
  return value;
}
