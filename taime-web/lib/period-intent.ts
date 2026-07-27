// ── Intencao de periodo (v4.7) ──────────────────────────────────────────────
// Modulo puro (zero dependencias) para detectar o periodo que a pergunta nomeia.
// Extraido do route do Advisor para ser testavel isoladamente e reusado pelo /ask.
//
// A busca vetorial e puramente semantica e ignora periodo citado. Aqui detectamos
// se a pergunta nomeia um periodo explicito para limitar a busca aquele intervalo.
// Tres formas:
//   - range: intervalo FECHADO [from,to] ("entre 2017 e 2020", "junho de 2026",
//     "em 2016"). Ambas as pontas presentes.
//   - floor: PISO ABERTO, sem teto ("desde 2016", "de 2016 ate hoje",
//     "since 2016", "from 2016 to today"). So o piso; o teto fica em aberto (hoje).
//   - latest: resolver para max(period) na janela ("mais recente", "ultimo").
// Atemporal -> null (busca ampla).
//
// BUG corrigido em v4.7: "desde YYYY" / "de YYYY ate hoje" / "YYYY ate hoje" caiam
// no ramo de ano isolado e viravam intervalo FECHADO no ano (so YYYY), quando a
// intencao e piso aberto ate hoje. Agora geram kind:'floor' e a busca vai de
// YYYY-01 ate o teto permissivo.

export type PeriodIntent =
  | { kind: 'range'; from: string; to: string }  // janela FECHADA [from,to] em 'YYYY-MM-01'
  | { kind: 'floor'; from: string }              // piso ABERTO: de 'from' ate hoje
  | { kind: 'latest' }                           // resolver para max(period) na janela

export const PT_MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}
export const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
}
export const ALL_MONTHS: Record<string, number> = { ...PT_MONTHS, ...EN_MONTHS }

export function monthStr(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}-01`
}

// span em meses (inclusivo) de um range ['YYYY-MM-01','YYYY-MM-01']
export function rangeSpanMonths(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty * 12 + tm) - (fy * 12 + fm) + 1
}

// Marcadores de "ate hoje" (fim em aberto) em PT e EN, sem acentos.
const OPEN_END = '(?:hoje|agora|atual|atualidade|a atualidade|o presente|presente|os dias de hoje|os dias atuais|now|today|present|the present|current|date|nowadays|these days)'

function detectFloor(t: string): number | null {
  // Piso aberto explicito: "desde/a partir de/since/as of/starting" + ano. Estas
  // palavras JA carregam a semantica de "de la para ca", entao dispensam marcador
  // de fim. NAO incluimos "de YYYY" nu nem "from YYYY" nu (ambiguos com ano unico:
  // "o relatorio de 2016", "data from 2016"): esses exigem marcador de fim aberto.
  const opener = t.match(/\b(?:desde|a partir de|apartir de|since|as of|starting (?:in|from|at)|beginning (?:in|from))\s+(?:o ano de\s+|the year\s+)?((?:19|20)\d{2})\b/)
  if (opener) return Number(opener[1])

  // "YYYY ate hoje" / "YYYY a hoje" / "YYYY to today" / "YYYY until now" / etc.
  // Cobre tambem "de 2016 ate hoje" e "from 2016 to today" (o ano + conector +
  // marcador de fim aberto). O intervalo FECHADO ja foi tentado antes deste passo,
  // entao aqui "YYYY conector YYYY" nunca chega (o segundo YYYY ja teria casado).
  const toOpen = t.match(new RegExp(`\\b((?:19|20)\\d{2})\\s*(?:-|–|a|ate|to|until|till|through|thru)\\s+${OPEN_END}\\b`))
  if (toOpen) return Number(toOpen[1])

  // "YYYY em diante" / "YYYY pra ca" / "2016 onwards" / "2016 onward" / "2016 and on"
  const onward = t.match(/\b((?:19|20)\d{2})\s+(?:em diante|pra ca|para ca|para frente|em frente|onwards?|onward|and (?:on|beyond|later|after))\b/)
  if (onward) return Number(onward[1])

  return null
}

export function detectPeriodIntent(message: string, now: Date): PeriodIntent | null {
  // Normaliza removendo acentos para que \b e os nomes de mes funcionem em ASCII
  // ("junho", "marco", "ultima", "mes"). Tudo minusculo.
  const t = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // "este mes" / "this month" -> mes corrente (UTC)
  if (/\b(neste|deste|este)\s+mes\b|\bthis month\b/.test(t)) {
    const s = monthStr(now.getUTCFullYear(), now.getUTCMonth() + 1)
    return { kind: 'range', from: s, to: s }
  }

  // "ultimo relatorio" / "mais recente" / "latest" / "most recent"
  if (/\bmais recente\b|\bmost recent\b|\blatest\b|\bultim[oa]s?\s+(relatorio|edicao)\b/.test(t)) {
    return { kind: 'latest' }
  }

  // intervalo FECHADO de anos: "entre 2023 e 2024", "between 2023 and 2024",
  // "de 2023 a 2024", "from 2023 to 2024", "2023-2024", "2023 ate 2024".
  // Corre ANTES do piso aberto: "desde 2016 ate 2020" e fechado e casa aqui.
  const interval = t.match(/\b(19|20)(\d{2})\s*(?:-|–|a|to|e|and|ate|until|till|through)\s*(19|20)(\d{2})\b/)
  if (interval) {
    const y1 = Number(interval[1] + interval[2])
    const y2 = Number(interval[3] + interval[4])
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2)
    return { kind: 'range', from: monthStr(lo, 1), to: monthStr(hi, 12) }
  }

  // PISO ABERTO: "desde 2016", "de 2016 ate hoje", "since 2016", "from 2016 to
  // today", "2016 em diante". Corre DEPOIS do intervalo fechado (para que uma
  // ponta final explicita vença) e ANTES do ano isolado (para que "desde 2016"
  // nao seja lido como so o ano de 2016).
  const floorYear = detectFloor(t)
  if (floorYear !== null) {
    return { kind: 'floor', from: monthStr(floorYear, 1) }
  }

  // mes + ano: "junho de 2026", "June 2026", "jun 2026", "junho 2026"
  const monthNames = Object.keys(ALL_MONTHS).sort((a, b) => b.length - a.length).join('|')
  const monthYear = t.match(new RegExp(`\\b(${monthNames})\\b(?:\\s+(?:de|of))?\\s+((?:19|20)\\d{2})`))
  if (monthYear) {
    const s = monthStr(Number(monthYear[2]), ALL_MONTHS[monthYear[1]])
    return { kind: 'range', from: s, to: s }
  }

  // numerico MM/YYYY ou YYYY-MM
  const mmYYYY = t.match(/\b(0?[1-9]|1[0-2])\/((?:19|20)\d{2})\b/)
  if (mmYYYY) {
    const s = monthStr(Number(mmYYYY[2]), Number(mmYYYY[1]))
    return { kind: 'range', from: s, to: s }
  }
  const yyyyMM = t.match(/\b((?:19|20)\d{2})-(0?[1-9]|1[0-2])\b/)
  if (yyyyMM) {
    const s = monthStr(Number(yyyyMM[1]), Number(yyyyMM[2]))
    return { kind: 'range', from: s, to: s }
  }

  // ano isolado: "em 2024", "in 2024", "2024"
  const year = t.match(/\b((?:19|20)\d{2})\b/)
  if (year) {
    const y = Number(year[1])
    return { kind: 'range', from: monthStr(y, 1), to: monthStr(y, 12) }
  }

  return null
}
