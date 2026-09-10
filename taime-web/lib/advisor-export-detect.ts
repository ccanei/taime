// Deteccao e extracao PURA de conteudo exportavel numa resposta do Advisor (ROI e
// checklist). Client-safe, sem dependencias: roda no browser (nos botoes) e num probe
// Node (teste). Conservador: so sinaliza quando ha sinal claro. Nunca inventa dado
// ausente (campos que nao aparecem no texto voltam null / vazios).

export interface RoiInputs {
  hoursPerMonth: number | null
  costPerHour:   number | null
  // Como as horas foram informadas (semana/mes), para rotular a celula de input.
  hoursPeriod:   'week' | 'month' | null
}
export interface RoiScenario { label: string; pct: number | null } // pct como fracao 0..1
export interface RoiData {
  inputs:      RoiInputs
  scenarios:   RoiScenario[]
  exit:        string | null
  baseMonthly: number | null // horas/mes x custo-hora, quando ambos existem
}
export interface ChecklistItem { text: string; section: string | null }
export interface ChecklistData { items: ChecklistItem[] }

// ── Regex compartilhados ─────────────────────────────────────────────────────
const MONEY       = /(?:R\$|US\$|\$|€|£)\s?\d[\d.,]*/g
const SCEN_LABEL  = /\b(conservador|conservadora|otimista|pessimista|conservative|optimistic|pessimistic|base case|caso base)\b/i
const SCEN_WORD   = /\b(cen[aá]rios?|scenarios?)\b/i
const PERCENT     = /\d{1,3}\s?%/
const ROI_TERM    = /\b(roi|captura|capturar|investimento|custo|economia|payback|retorno|saving|savings|invest|cost)\b/i

// ── ROI ──────────────────────────────────────────────────────────────────────
export function detectRoi(md: string): boolean {
  if (!md) return false
  const moneyCount = (md.match(MONEY) ?? []).length
  if (moneyCount < 2) return false
  if (!ROI_TERM.test(md)) return false
  if (!PERCENT.test(md)) return false
  // Cenarios: dois rotulos distintos, OU um rotulo + a palavra "cenario".
  const labels = new Set<string>()
  const re = new RegExp(SCEN_LABEL.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) labels.add(m[1].toLowerCase())
  const hasScenarios = labels.size >= 2 || (labels.size >= 1 && SCEN_WORD.test(md))
  return hasScenarios
}

// Custo por hora: "R$80/h", "R$ 80 / hora", "US$ 40/hour".
function extractCostPerHour(md: string): number | null {
  const m = md.match(/(?:R\$|US\$|\$|€|£)\s?(\d[\d.,]*)\s*\/\s*(?:h|hora|hour)\b/i)
  return m ? parseNumber(m[1]) : null
}

// Horas: exige a unidade de periodo logo apos ("20h/semana", "20 horas por mes").
// Isso evita confundir com o "/h" do custo (que nao traz periodo).
function extractHours(md: string): { value: number | null; period: 'week' | 'month' | null } {
  const m = md.match(/(\d+(?:[.,]\d+)?)\s*(?:h|horas?|hrs?|hours?)\s*(?:\/|por|per)\s*(semanas?|m[eê]s(?:es)?|weeks?|months?)/i)
  if (!m) return { value: null, period: null }
  const value = parseNumber(m[1])
  const unit  = m[2].toLowerCase()
  const period: 'week' | 'month' = /semana|week/.test(unit) ? 'week' : 'month'
  return { value, period }
}

function parseNumber(raw: string): number | null {
  // Normaliza "6.400" / "6,400" / "1.234,56" / "1,234.56" para Number.
  let s = raw.trim()
  const hasDot = s.includes('.'), hasComma = s.includes(',')
  if (hasDot && hasComma) {
    // O ULTIMO separador e o decimal.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  } else if (hasComma) {
    // Virgula sozinha: decimal se 1-2 casas apos, senao milhar.
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (hasDot) {
    s = /\.\d{3}(\D|$)/.test(s + ' ') && !/\.\d{1,2}$/.test(s) ? s.replace(/\./g, '') : s
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function extractRoi(md: string): RoiData {
  const cost = extractCostPerHour(md)
  const { value: hoursVal, period } = extractHours(md)
  const hoursPerMonth = hoursVal === null ? null : (period === 'week' ? hoursVal * 4 : hoursVal)
  const baseMonthly = hoursPerMonth !== null && cost !== null ? hoursPerMonth * cost : null

  // Cenarios rotulados com percentual proximo (nas duas ordens: "conservador 40%" e "40% ... conservador").
  const scenarios: RoiScenario[] = []
  const seen = new Set<string>()
  const push = (labelRaw: string, pctRaw: string | undefined) => {
    const label = normalizeScenarioLabel(labelRaw)
    if (seen.has(label)) return
    const pctNum = pctRaw ? parseNumber(pctRaw) : null
    scenarios.push({ label, pct: pctNum !== null ? pctNum / 100 : null })
    seen.add(label)
  }
  const reA = /\b(conservador|conservadora|otimista|pessimista|conservative|optimistic|pessimistic)\b[^%\n]{0,60}?(\d{1,3})\s?%/gi
  let a: RegExpExecArray | null
  while ((a = reA.exec(md)) !== null) push(a[1], a[2])
  const reB = /(\d{1,3})\s?%[^%\n]{0,40}?\b(conservador|conservadora|otimista|pessimista|conservative|optimistic|pessimistic)\b/gi
  let b: RegExpExecArray | null
  while ((b = reB.exec(md)) !== null) push(b[2], b[1])
  // Rotulos sem percentual proximo: registra ainda assim (pct null, celula editavel).
  const reC = new RegExp(SCEN_LABEL.source, 'gi')
  let c: RegExpExecArray | null
  while ((c = reC.exec(md)) !== null) push(c[1], undefined)

  return { inputs: { hoursPerMonth, costPerHour: cost, hoursPeriod: period }, scenarios, exit: extractExit(md), baseMonthly }
}

function normalizeScenarioLabel(raw: string): string {
  const l = raw.toLowerCase()
  if (/conservad|conservative/.test(l)) return 'conservador'
  if (/otimista|optimistic/.test(l))    return 'otimista'
  if (/pessimista|pessimistic/.test(l)) return 'pessimista'
  if (/base/.test(l))                    return 'base'
  return l
}

// Criterio de EXIT / parada do piloto: a frase que carrega o gatilho.
function extractExit(md: string): string | null {
  const sentences = md.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/)
  const trigger = /\b(exit|gatilho|abandon\w*|encerr\w*|interromp\w*|abaixo de|below|se .*(cair|ficar)|abandon(?:ar|o)?|stop the invest|parar? o investimento|parar? o piloto)\b/i
  const hit = sentences.find(s => trigger.test(s) && s.trim().length > 12)
  return hit ? hit.trim().slice(0, 400) : null
}

// ── Checklist ────────────────────────────────────────────────────────────────
const LIST_ITEM  = /^\s{0,8}(?:[-*+]\s+|\d{1,3}[.)]\s+)/
const CHECKBOX   = /\[[ xX]\]/
const HEADING    = /^\s{0,3}#{1,6}\s+(.+?)\s*#*$/
const BOLD_ONLY  = /^\s*\*\*(.+?)\*\*\s*:?\s*$/
const ACTION_COL = /\b(a[çc][aã]o|tarefa|action|task|passo|step|item|atividade|etapa)\b/i

function stripItem(line: string): string {
  return line
    .replace(LIST_ITEM, '')
    .replace(/^\s*\[[ xX]\]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
}

// Localiza tabelas markdown e, quando ha coluna de acao/tarefa, extrai as celulas
// dessa coluna. Retorna as linhas-de-acao (texto) na ordem.
function tableActionItems(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i]
    const sep = lines[i + 1]
    if (!/\|/.test(header) || !/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(sep) || !sep.includes('-')) continue
    const cells = header.split('|').map(s => s.trim())
    // indice da coluna de acao
    const colIdx = cells.findIndex(c => ACTION_COL.test(c))
    if (colIdx === -1) continue
    // percorre o corpo
    let r = i + 2
    for (; r < lines.length; r++) {
      const row = lines[r]
      if (!/\|/.test(row) || row.trim() === '') break
      const rc = row.split('|').map(s => s.trim())
      const val = (rc[colIdx] ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim()
      if (val) out.push(val)
    }
    i = r - 1
  }
  return out
}

export function extractChecklist(md: string): ChecklistData {
  const lines = md.split('\n')
  const items: ChecklistItem[] = []
  let section: string | null = null
  for (const line of lines) {
    const h = line.match(HEADING) || line.match(BOLD_ONLY)
    if (h) { section = h[1].trim().replace(/`/g, ''); continue }
    if (LIST_ITEM.test(line) || CHECKBOX.test(line)) {
      const text = stripItem(line)
      if (text.length >= 2) items.push({ text: text.slice(0, 400), section })
    }
  }
  // Itens vindos de tabela de acao (quando houver), sem secao.
  for (const t of tableActionItems(lines)) {
    if (t.length >= 2 && !ACTION_COL.test(t)) items.push({ text: t.slice(0, 400), section: null })
  }
  return { items }
}

export function detectChecklist(md: string): boolean {
  if (!md) return false
  return extractChecklist(md).items.length >= 5
}

// ── CSV inline ────────────────────────────────────────────────────────────────
// Bloco de texto claramente tabular (o Advisor entrega templates como "bloco CSV
// copiavel"). Deteccao conservadora: >=3 linhas com virgula, >=3 colunas CONSISTENTES,
// primeira linha parecendo cabecalho (descritivo, sem valores puramente numericos), e
// pelo menos 2 linhas de dados alem do cabecalho.
export interface CsvData { header: string[]; rows: string[][] }

// Parser de UMA linha CSV com suporte a campos entre aspas (virgula interna, aspas
// escapadas como "").
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += ch
    } else if (ch === '"') { inQ = true }
    else if (ch === ',') { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

function isCsvLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (t.includes('|')) return false          // tabela markdown, nao CSV
  if (/^```/.test(t)) return false            // cerca de codigo
  if (LIST_ITEM.test(line)) return false      // item de lista
  if (/^#{1,6}\s/.test(t)) return false       // heading
  return (t.match(/,/g)?.length ?? 0) >= 2    // pelo menos 3 campos
}

function looksLikeHeader(fields: string[]): boolean {
  if (fields.length < 3) return false
  let withLetter = 0
  for (const f of fields) {
    if (f === '') return false
    if (/^-?\d[\d.,]*%?$/.test(f)) return false           // campo puramente numerico no cabecalho
    if (/[a-zA-ZÀ-ÿ]/.test(f)) withLetter++
  }
  return withLetter >= Math.ceil(fields.length * 0.6)
}

// Cabecalho FORTE: campos curtos, tipo nome de coluna (identificadores), nao frases de
// prosa. Usado para aceitar um CSV com UMA UNICA linha de dados (o Advisor entrega
// planilhas com so uma linha de exemplo) sem abrir a porta a prosa com virgulas, cujos
// "campos" sao frases longas.
function looksLikeStrongHeader(fields: string[]): boolean {
  if (fields.length < 4) return false
  for (const f of fields) {
    if (f.length > 40) return false
    if (f.split(/\s+/).filter(Boolean).length > 4) return false
  }
  return looksLikeHeader(fields)
}

export function extractCsv(md: string): CsvData | null {
  const lines = md.split('\n')
  let best: { start: number; count: number; cols: number } | null = null
  let i = 0
  while (i < lines.length) {
    if (!isCsvLine(lines[i])) { i++; continue }
    const cols = parseCsvLine(lines[i]).length
    let j = i + 1
    while (j < lines.length && isCsvLine(lines[j]) && parseCsvLine(lines[j]).length === cols) j++
    const count = j - i
    if (cols >= 3 && count >= 2 && (!best || count > best.count)) best = { start: i, count, cols }
    i = j
  }
  if (!best) return null
  const block = lines.slice(best.start, best.start + best.count).map(parseCsvLine)
  const header = block[0]
  const rows = block.slice(1)
  if (rows.length < 1) return null
  // >=2 linhas de dados: cabecalho comum basta. Exatamente 1 linha de dados (planilha
  // com uma linha de exemplo, caso real do checklist de agentes): exige cabecalho FORTE
  // para nao casar prosa com virgulas.
  if (rows.length === 1) { if (!looksLikeStrongHeader(header)) return null }
  else if (!looksLikeHeader(header)) return null
  return { header, rows }
}

export function detectCsv(md: string): boolean {
  if (!md) return false
  return extractCsv(md) !== null
}
