/**
 * Cross-check de data para sinais do TAIME.
 *
 * Compartilhado entre a Fase 1 (collect-signals.ts) e a Fase 2
 * (analyze-signals.ts). Conservador por design: na dúvida, mantém.
 * Só responde `false` quando a data é absoluta e claramente fora da
 * janela do período (com tolerância).
 */

export const DATE_TOLERANCE_DAYS = 60;

// Formatos relativos do Serper ("2 days ago", "3 weeks ago", "yesterday",
// "ontem", "há 2 dias", etc.). Origem desses formatos é "agora", não o
// período-alvo, então parsear contra o período é arriscado → manter.
const RELATIVE_DATE_RE = /\b(ago|atras|atrás|há\s+\d|days?|hours?|minutes?|weeks?|months?|years?|dias?|horas?|minutos?|semanas?|meses?|anos?|yesterday|today|ontem|hoje)\b/i;

/**
 * `true` = manter o sinal; `false` = descartar (data claramente fora).
 *
 * Cobertura:
 *   - null / vazio       → true  (sem informação ≠ informação ruim)
 *   - formato relativo   → true  (ambíguo contra o período)
 *   - formato absoluto   → compara com [start − tol, end + tol]
 *   - parsing falhou     → true  (preserva conteúdo)
 */
export function isSignalWithinPeriod(
  itemDate:    string | null | undefined,
  periodStart: Date,
  periodEnd:   Date,
): boolean {
  if (!itemDate || itemDate.trim().length === 0) return true;
  if (RELATIVE_DATE_RE.test(itemDate)) return true;

  let parsed: Date | null = null;

  // "DD/MM/YYYY" ou "DD-MM-YYYY" — dia primeiro (pt-BR / EU).
  const ddmmyyyy = itemDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  } else {
    // Demais formatos ("Jan 15, 2024", "2024-01-15", etc.).
    const ms = Date.parse(itemDate);
    if (!Number.isNaN(ms)) parsed = new Date(ms);
  }

  if (!parsed || Number.isNaN(parsed.getTime())) return true;

  const tol  = DATE_TOLERANCE_DAYS * 24 * 60 * 60 * 1000;
  const lo   = periodStart.getTime() - tol;
  const hi   = periodEnd.getTime()   + tol;
  const time = parsed.getTime();

  return time >= lo && time <= hi;
}
