/**
 * TAIME — Period Utilities
 * Shared logic for determining period types, date ranges and labels.
 *
 * Frequency by era:
 *   2000–2014  → monthly   (one report per month)
 *   2015–2021  → biweekly  (two per month: days 1-15 and 16-end)
 *   2022+      → biweekly  (two per month: days 1-15 and 16-end)
 */

export type PeriodType = 'weekly' | 'biweekly' | 'monthly'

export interface PeriodInfo {
  key:      string      // YYYY-MM-DD (start date — DB period key)
  start:    Date
  end:      Date
  type:     PeriodType
  labelPt:  string
  labelEn:  string
}

// ─── Month names ──────────────────────────────────────────────────────────────

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]
const MONTHS_EN = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPeriodType(year: number): PeriodType {
  if (year <= 2014) return 'monthly'
  return 'biweekly'
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate() // month is 1-based here
}

function toKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Convert a JS Date to Serper date string MM/DD/YYYY */
export function toSerperDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${m}/${day}/${d.getFullYear()}`
}

// ─── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Given a PERIOD string (YYYY-MM-DD), returns the complete PeriodInfo.
 * The day component determines which sub-period within the month:
 *   monthly:   day is always 01
 *   biweekly:  day 01 → first half; day 16 → second half
 *   weekly:    day 01→W1, 08→W2, 16→W3, 24→W4
 */
export function parsePeriod(periodStr: string): PeriodInfo {
  const [yearStr, monthStr, dayStr] = periodStr.split('-')
  const year  = parseInt(yearStr,  10)
  const month = parseInt(monthStr, 10)  // 1-based
  const day   = parseInt(dayStr,   10)
  const last  = lastDayOfMonth(year, month)
  const type  = getPeriodType(year)
  const mPt   = MONTHS_PT[month - 1]
  const mEn   = MONTHS_EN[month - 1]

  let startDay: number = 1
  let endDay:   number = lastDayOfMonth(year, month)
  let labelPt:  string = `${mPt} de ${year}`
  let labelEn:  string = `${mEn} ${year}`

  if (type === 'monthly') {
    startDay = 1; endDay = last
    labelPt  = `${mPt} de ${year}`
    labelEn  = `${mEn} ${year}`
  } else if (type === 'biweekly') {
    if (day <= 15) {
      startDay = 1; endDay = 15
      labelPt  = `1ª Quinzena de ${mPt} de ${year}`
      labelEn  = `First Half of ${mEn} ${year}`
    } else {
      startDay = 16; endDay = last
      labelPt  = `2ª Quinzena de ${mPt} de ${year}`
      labelEn  = `Second Half of ${mEn} ${year}`
    }
  }

  return {
    key:     toKey(year, month, startDay),
    start:   new Date(year, month - 1, startDay),
    end:     new Date(year, month - 1, endDay),
    type,
    labelPt,
    labelEn,
  }
}

// ─── Period list generator ─────────────────────────────────────────────────────

/**
 * Generate all period keys between fromStr and toStr (inclusive), YYYY-MM-DD.
 * Returns them in chronological order.
 */
export function generatePeriods(fromStr: string, toStr: string): PeriodInfo[] {
  const fromDate = new Date(fromStr + 'T12:00:00Z')
  const toDate   = new Date(toStr   + 'T12:00:00Z')

  const periods: PeriodInfo[] = []
  const seen = new Set<string>()

  // Walk month by month (max from year/month to to year/month)
  let cursor = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1))
  const toMonth = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1))

  while (cursor <= toMonth) {
    const year  = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth() + 1
    const type  = getPeriodType(year)
    const last  = lastDayOfMonth(year, month)

    let startDays: number[]
    if (type === 'monthly') startDays = [1]
    else                    startDays = [1, 16]

    for (const sd of startDays) {
      const pKey = toKey(year, month, sd)
      // String compare on YYYY-MM-DD avoids timezone pitfalls
      if (pKey < fromStr || pKey > toStr) continue
      if (seen.has(pKey)) continue
      seen.add(pKey)
      periods.push(parsePeriod(pKey))
    }

    cursor = new Date(Date.UTC(year, month, 1)) // advance one month
  }

  return periods
}

/** Is a period more than 45 days in the past? (use historical Serper filter) */
export function isHistorical(info: PeriodInfo): boolean {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 45)
  return info.end < cutoff
}
