// Utilitário de field-path para edição de campos flagueados.
// Os flags do validador apontam campos em dois formatos:
//   - coluna direta:  "title_en", "taime_score_rationale_pt_br", "recommended_move_en"
//   - chave em JSONB:  "taime_framework_en.executive_snapshot", "then_now_next_pt_br.now",
//                      "org_implications_en.finance"
// Este módulo entende os dois, sabe achar o campo equivalente no outro idioma,
// e produz o patch correto para gravar de volta na linha de report_trends.

export type Lang = 'pt-BR' | 'en'

export interface ParsedField {
  base: string          // ex: "taime_framework", "title", "then_now_next"
  lang: Lang            // idioma deste campo
  column: string        // coluna real na tabela: ex "taime_framework_en", "title_en"
  jsonKey: string | null // chave dentro do JSONB, ou null se for coluna de texto direta
}

const SUFFIX: Record<Lang, string> = { 'pt-BR': '_pt_br', en: '_en' }

/** Bases que são colunas JSONB (têm subchave). As demais são colunas de texto direto. */
const JSONB_BASES = new Set(['taime_framework', 'then_now_next', 'org_implications'])

/**
 * Normaliza um field cru vindo do flag antes de parsear.
 * Os flags do judge às vezes chegam "sujos":
 *   - "then_now_next_en.next (32)"                     → sufixo " (NN)" (contador)
 *   - "then_now_next_pt_br.then / then_now_next_en.then" → label dupla (PT / EN)
 *   - "...then (11) / ...then (30)"                     → ambos os problemas juntos
 * Esta função remove o " (NN)" e, em label dupla, escolhe o lado pedido
 * (default: o lado EN; cai para o primeiro lado se não houver EN).
 */
export function normalizeField(field: string, prefer: Lang = 'en'): string {
  // remove qualquer " (123)" / "(123)" em qualquer parte da string
  const stripped = field.replace(/\s*\(\d+\)/g, '').trim()
  if (!stripped.includes('/')) return stripped
  // label dupla: separa os lados e escolhe pelo idioma preferido
  const parts = stripped.split('/').map(s => s.trim()).filter(Boolean)
  const wantSuffix = SUFFIX[prefer]
  const picked =
    parts.find(p => p.split('.')[0].endsWith(wantSuffix)) ?? parts[0]
  return picked
}

/** Parseia "taime_framework_en.executive_snapshot" → estrutura navegável.
 *  Aceita fields "sujos" (com " (NN)" ou label dupla "PT / EN"): normaliza antes. */
export function parseField(field: string, prefer: Lang = 'en'): ParsedField | null {
  const clean = normalizeField(field, prefer)
  const [columnPartRaw, jsonKeyRaw = null] = clean.split('.')
  const columnPart = columnPartRaw.trim()
  const jsonKey = jsonKeyRaw != null ? jsonKeyRaw.trim() : null
  // columnPart termina em _pt_br ou _en
  let lang: Lang
  let base: string
  if (columnPart.endsWith('_pt_br')) {
    lang = 'pt-BR'
    base = columnPart.slice(0, -'_pt_br'.length)
  } else if (columnPart.endsWith('_en')) {
    lang = 'en'
    base = columnPart.slice(0, -'_en'.length)
  } else {
    return null
  }
  return {
    base,
    lang,
    column: columnPart,
    jsonKey: JSONB_BASES.has(base) ? jsonKey : null,
  }
}

/** Dado um ParsedField, devolve o campo equivalente no outro idioma. */
export function twin(p: ParsedField): ParsedField {
  const otherLang: Lang = p.lang === 'pt-BR' ? 'en' : 'pt-BR'
  return {
    base: p.base,
    lang: otherLang,
    column: `${p.base}${SUFFIX[otherLang]}`,
    jsonKey: p.jsonKey,
  }
}

/** Lê o valor textual de um campo a partir da linha de report_trends. */
export function readValue(trend: Record<string, unknown>, p: ParsedField): string {
  const col = trend[p.column]
  if (p.jsonKey) {
    const obj = (col ?? {}) as Record<string, unknown>
    const v = obj[p.jsonKey]
    return typeof v === 'string' ? v : ''
  }
  return typeof col === 'string' ? col : ''
}

/**
 * Produz o objeto de patch (parcial) para gravar um novo valor num campo.
 * Para JSONB, precisa do valor ATUAL da coluna para preservar as outras chaves.
 * Retorna { [coluna]: novoValor } ou { [coluna]: {...objetoAtual, [chave]: novoValor} }.
 */
export function buildPatch(
  trend: Record<string, unknown>,
  p: ParsedField,
  newValue: string,
): Record<string, unknown> {
  if (p.jsonKey) {
    const current = (trend[p.column] ?? {}) as Record<string, unknown>
    return { [p.column]: { ...current, [p.jsonKey]: newValue } }
  }
  return { [p.column]: newValue }
}

/** Rótulo legível do campo, para exibir na UI. */
export function fieldLabel(p: ParsedField): string {
  const baseLabels: Record<string, string> = {
    title: 'Título',
    taime_score_rationale: 'Justificativa do Score',
    taime_framework: 'Framework',
    then_now_next: 'Then / Now / Next',
    org_implications: 'Implicações Organizacionais',
    recommended_move: 'Movimento Recomendado',
  }
  const keyLabels: Record<string, string> = {
    type: 'TYPE', act: 'ACT', impact: 'IMPACT', move: 'MOVE', exit: 'EXIT',
    counter_thesis: 'Contra-tese', executive_snapshot: 'Executive Snapshot',
    confidence_basis: 'Base de Confiança', limitations: 'Limitações',
    then: 'THEN', now: 'NOW', next: 'NEXT',
    leadership: 'Liderança', technology: 'Tecnologia', operations: 'Operações',
    finance: 'Finanças', people: 'Pessoas',
  }
  const b = baseLabels[p.base] ?? p.base
  return p.jsonKey ? `${b} · ${keyLabels[p.jsonKey] ?? p.jsonKey}` : b
}
