// Distingue interrupcao de rede/aba (fetch abortado quando o usuario troca de
// app/aba durante a geracao) de erro real do servidor. Assinaturas comuns no
// WebKit/Safari: TypeError "Load failed", SyntaxError "The string did not match
// the expected pattern" (body truncado no res.json()), AbortError.
export function isNetworkInterruption(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') return true
  // fetch() rejeita com TypeError em falha de rede ("Load failed"/"Failed to fetch").
  if (err instanceof TypeError) return true
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()
  return /load failed|failed to fetch|networkerror|network error|the string did not match|unexpected end of (?:json|input)|aborted|the operation was aborted|connection/.test(msg)
}
