/**
 * Pure text parser for ÁKK nyilvános ajánlattétel PDFs (ADR 0041).
 * Operates on `pdftotext -layout` / equivalent extracted text — reusable by §6m.
 */

const HU_MONTHS: Record<string, number> = {
  januar: 1,
  január: 1,
  februar: 2,
  február: 2,
  marcius: 3,
  március: 3,
  aprilis: 4,
  április: 4,
  majus: 5,
  május: 5,
  junius: 6,
  június: 6,
  julius: 7,
  július: 7,
  augusztus: 8,
  szeptember: 9,
  oktober: 10,
  október: 10,
  november: 11,
  december: 12
}

const HU_DATE =
  /(\d{4})\.\s*(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december|januar|februar|marcius|aprilis|majus|junius|julius|oktober)\s+(\d{1,2})\.?/gi

export class OfferingPdfParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfferingPdfParseError'
  }
}

export interface ParsedOfferingPdf {
  paymentDates: string[]
  dayCount: string | null
  maturity: string | null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function parseHungarianDate(raw: string): string | null {
  const m = new RegExp(HU_DATE.source, 'i').exec(raw.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = HU_MONTHS[m[2].toLowerCase()]
  const day = Number(m[3])
  if (!month || !year || !day) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function mapOfferingDayCount(text: string): string | null {
  const algo = /Kamatszámítás\s+algoritmusa\s*:\s*([^\n\r]+)/i.exec(text)
  const phrase = (algo?.[1] ?? text).toLowerCase()
  if (/tényleges\s*\/\s*tényleges|tenyleges\s*\/\s*tenyleges|actual\s*\/\s*actual/.test(phrase)) {
    return 'ACT/ACT'
  }
  if (/act\s*\/\s*act/.test(phrase)) return 'ACT/ACT'
  if (/act\s*\/\s*360|tényleges\s*\/\s*360|tenyleges\s*\/\s*360/.test(phrase)) {
    return 'ACT/360'
  }
  if (/act\s*\/\s*365/.test(phrase)) return 'ACT/365F'
  if (/30e\s*\/\s*360|30\/360/.test(phrase)) return '30E/360'
  return null
}

function extractMaturity(text: string): string | null {
  const m =
    /Lejárat\s+napja\s*:\s*([^\n\r]+)/i.exec(text) ||
    /Lejárat\s*:\s*([^\n\r]+)/i.exec(text)
  if (!m) return null
  return parseHungarianDate(m[1])
}

/**
 * Explicit list after "A kamat fizetése az alábbi napokon történik".
 */
function extractExplicitPaymentDates(text: string): string[] {
  const marker = /A\s+kamat\s+fizetése\s+az\s+alábbi\s+napokon\s+történik\s*:/i.exec(text)
  if (!marker || marker.index == null) return []
  const after = text.slice(marker.index + marker[0].length)
  const stop = /Kamatszámítás\s+algoritmusa|Törlesztés\s*:/i.exec(after)
  const block = stop ? after.slice(0, stop.index) : after.slice(0, 2500)
  const dates: string[] = []
  const seen = new Set<string>()
  for (const m of block.matchAll(new RegExp(HU_DATE.source, 'gi'))) {
    const iso = parseHungarianDate(m[0])
    if (!iso || seen.has(iso)) continue
    seen.add(iso)
    dates.push(iso)
  }
  return dates.sort()
}

/**
 * Recurring annual pattern: "minden év <month> <day>" + first period end + maturity.
 */
function extractRecurringPaymentDates(text: string): string[] {
  const recur =
    /A\s+kamat\s+fizetése\s+a\s+futamidő\s+alatt\s+minden\s+év\s+(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december)\s+(\d{1,2})\.?/i.exec(
      text
    )
  if (!recur) return []
  const month = HU_MONTHS[recur[1].toLowerCase()]
  const day = Number(recur[2])
  if (!month || !day) return []

  // First kamatperiódus end date is the first payment (… napjáig …).
  let first: string | null = null
  const periodEnd =
    /kamatperiódus[\s\S]{0,400}?napjától[\s\S]{0,120}?(\d{4})\.\s*(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december)\s+(\d{1,2})\.?\s*[\s\S]{0,40}?napjáig/i.exec(
      text
    )
  if (periodEnd) {
    first = parseHungarianDate(`${periodEnd[1]}. ${periodEnd[2]} ${periodEnd[3]}`)
  }
  if (!first) {
    // Fallback: anniversary of month/day in the year after issue start.
    const issue =
      /kibocsátásának\s+kezdő\s+időpontja\s*:\s*([^\n\r]+)/i.exec(text) ||
      /kezdő\s+időpontja\s*:\s*([^\n\r]+)/i.exec(text)
    const issueIso = issue ? parseHungarianDate(issue[1]) : null
    if (issueIso) {
      const y = Number(issueIso.slice(0, 4)) + 1
      first = `${y}-${pad2(month)}-${pad2(day)}`
    }
  }
  const maturity = extractMaturity(text)
  if (!first || !maturity) return []

  const dates: string[] = []
  let y = Number(first.slice(0, 4))
  const endY = Number(maturity.slice(0, 4))
  const firstMd = first.slice(5)
  const matMd = maturity.slice(5)
  // Start at first payment year; include maturity anniversary when it matches coupon md.
  while (y <= endY) {
    const iso = `${y}-${pad2(month)}-${pad2(day)}`
    if (iso >= first && iso <= maturity) {
      dates.push(iso)
    }
    y += 1
  }
  // Ensure maturity date is included when it is a coupon anniversary.
  if (matMd === firstMd && !dates.includes(maturity)) {
    dates.push(maturity)
  }
  return [...new Set(dates)].sort()
}

/**
 * Parse offering PDF text into payment dates + day-count (ADR 0041).
 * Throws OfferingPdfParseError when neither dates nor dayCount can be recovered.
 */
export function parseOfferingPdfText(text: string): ParsedOfferingPdf {
  const normalized = text.replace(/\u00a0/g, ' ')
  const dayCount = mapOfferingDayCount(normalized)
  const maturity = extractMaturity(normalized)
  let paymentDates = extractExplicitPaymentDates(normalized)
  if (paymentDates.length === 0) {
    paymentDates = extractRecurringPaymentDates(normalized)
  }
  if (paymentDates.length === 0 && !dayCount) {
    throw new OfferingPdfParseError('No paymentDates or dayCount found in offering PDF text')
  }
  return { paymentDates, dayCount, maturity }
}
