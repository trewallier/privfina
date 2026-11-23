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

/** Compact table dates as printed in MÁPP kamatteljesítés tables: 2027.02.27 */
const DOTTED_DATE = /(\d{4})\.(\d{2})\.(\d{2})/g

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
  /**
   * Parallel to `paymentDates` when a MAK date±rate table was parsed.
   * `null` entries mean the PDF published no rate for that date (FLOAT / omitted) —
   * never invent coupon rates (ADR 0044).
   */
  paymentRates?: Array<number | null>
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

function parseDottedDate(raw: string): string | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(raw.trim())
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function firstDateInWindow(window: string): string | null {
  const hu = new RegExp(HU_DATE.source, 'i').exec(window)
  if (hu) return parseHungarianDate(hu[0])
  const dotted = /(\d{4})\.(\d{2})\.(\d{2})/.exec(window)
  if (dotted) return parseDottedDate(dotted[0])
  return null
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
  const label = /Lejárat\s+napja\s*:/i.exec(text) || /Lejárat\s*:/i.exec(text)
  if (!label || label.index == null) return null
  const after = text.slice(label.index + label[0].length, label.index + label[0].length + 160)
  return firstDateInWindow(after)
}

/** Issue / original issue / interest-start date when printed near labels. */
export function extractIssueDate(text: string): string | null {
  const labels = [
    /Kamatozás\s+kezdő\s+napja\s*:/i,
    /Az\s+eredeti\s+kibocsátás\s+napja\s*:/i,
    /Kibocsátás\s+napja\s*:/i
  ]
  for (const re of labels) {
    const label = re.exec(text)
    if (!label || label.index == null) continue
    const after = text.slice(label.index + label[0].length, label.index + label[0].length + 160)
    const iso = firstDateInWindow(after)
    if (iso) return iso
  }
  return null
}

const HU_MONTH_NAME =
  '(január|február|március|április|május|június|július|augusztus|szeptember|október|november|december|januar|februar|marcius|aprilis|majus|junius|julius|oktober)'

/**
 * FLOAT MÁK rábocsátás layout: period turns named as
 * "minden év február 26., május 26., augusztus 26. és november 26. napja"
 * (under kamatperiódus fordulónapja / Kamatfizetési napok) — expand through maturity.
 * Rates stay unpublished (Aktuális kamatláb is current-auction only; ADR 0044 / 0047).
 */
export function extractMakRecurringPeriodTurns(text: string): {
  paymentDates: string[]
  paymentRates: Array<number | null>
} | null {
  const monthDayRe = new RegExp(`${HU_MONTH_NAME}\\s+(\\d{1,2})\\.?`, 'gi')
  const turnBlock =
    /kamatperiódus\s+fordulónapja[\s\S]{0,220}?minden\s+év\s+([\s\S]{0,220}?napja)/i.exec(text) ||
    /Kamatfizetési\s+napok\s*:[\s\S]{0,220}?minden\s+év\s+([\s\S]{0,220}?napja)/i.exec(text)
  if (!turnBlock) return null
  const listBlock = turnBlock[1] ?? ''
  const mds: Array<{ month: number; day: number }> = []
  const seen = new Set<string>()
  for (const m of listBlock.matchAll(monthDayRe)) {
    const month = HU_MONTHS[m[1].toLowerCase()]
    const day = Number(m[2])
    if (!month || !day) continue
    const key = `${month}-${day}`
    if (seen.has(key)) continue
    seen.add(key)
    mds.push({ month, day })
  }
  if (mds.length < 2) return null

  const issue = extractIssueDate(text)
  const maturity = extractMaturity(text)
  if (!issue || !maturity) return null

  const dates: string[] = []
  const startY = Number(issue.slice(0, 4))
  const endY = Number(maturity.slice(0, 4))
  for (let y = startY; y <= endY + 1; y += 1) {
    for (const { month, day } of mds) {
      const iso = `${y}-${pad2(month)}-${pad2(day)}`
      if (iso > issue && iso <= maturity) {
        dates.push(iso)
      }
    }
  }
  const uniq = [...new Set(dates)].sort()
  if (uniq.length === 0) return null
  return {
    paymentDates: uniq,
    paymentRates: uniq.map(() => null)
  }
}

function isDiscountTreasuryBill(text: string): boolean {
  return /Diszkont\s+Kincstárjegy/i.test(text)
}

/** MAK auction schedule label; pdftotext -layout may interleave date rows between “következő” and “napokon”. */
const MAK_ANNUAL_SCHEDULE_MARKER =
  /A\s+kamatfizetés[\s\S]{0,80}?évente\s+a\s+következő[\s\S]{0,500}?napokon\s+és\s+mértékkel\s+történik\s*:/i

function hasCouponScheduleMarkers(text: string): boolean {
  return (
    /A\s+kamat\s+fizetése\s+az\s+alábbi\s+napokon\s+történik/i.test(text) ||
    /A\s+kamatfizetés[\s\S]{0,200}?az\s+alábbi\s+napokon\s+történik/i.test(text) ||
    MAK_ANNUAL_SCHEDULE_MARKER.test(text) ||
    /Kamatteljesítési\s+napok/i.test(text) ||
    /Kamatfizetési\s+napok\s*:/i.test(text) ||
    /kamatperiódus\s+fordulónapja/i.test(text) ||
    /A\s+kamat\s+fizetése\s+a\s+futamidő\s+alatt\s+minden\s+év/i.test(text) ||
    /Kamatszámítás\s+algoritmusa/i.test(text)
  )
}

function isKozlemenyWithoutSchedule(text: string): boolean {
  const head = text.slice(0, 1200)
  const looksLikeKozlemeny =
    /^\s*KÖZLEMÉNY\b/im.test(head) ||
    /\bKÖZLEMÉNY\b[\s\S]{0,200}MÓDOSÍTÁS/i.test(head)
  if (!looksLikeKozlemeny) return false
  return !hasCouponScheduleMarkers(text) && !isDiscountTreasuryBill(text)
}

function looksLikePublicOffering(text: string): boolean {
  const head = text.slice(0, 800)
  return (
    /NYILVÁNOS\s+AJÁNLATTÉTEL/i.test(head) ||
    /N\s*Y\s*I\s*L\s*V\s*[ÁA]\s*N\s*O\s*S[\s\S]{0,40}A\s*J\s*[ÁA]\s*N\s*L\s*A\s*T\s*T\s*[ÉE]\s*T\s*E\s*L/i.test(
      head
    )
  )
}

/** Whether extracted PDF text should be parsed or archived as no-schedule skip. */
export type OfferingPdfContentClass = 'parse' | 'skip_no_schedule'

/**
 * Content gate before transcription: ÁKK sometimes labels amendment KÖZLEMÉNY
 * PDFs as resourceType ISSUE. Those have no coupon schedule — skip permanently.
 */
export function classifyOfferingPdfText(text: string): OfferingPdfContentClass {
  const normalized = text.replace(/\u00a0/g, ' ')
  if (isDiscountTreasuryBill(normalized) || hasCouponScheduleMarkers(normalized)) {
    return 'parse'
  }
  if (isKozlemenyWithoutSchedule(normalized)) {
    return 'skip_no_schedule'
  }
  if (looksLikePublicOffering(normalized)) {
    return 'parse'
  }
  return 'parse'
}

/**
 * Explicit list after PMÁP-style or FixMAP-style "kamat … napokon történik" markers.
 * FixMAP often splits "A kamatfizetés … az alábbi napokon történik:" across lines.
 */
function extractExplicitPaymentDates(text: string): string[] {
  const marker =
    /A\s+kamat\s+fizetése\s+az\s+alábbi\s+napokon\s+történik\s*:/i.exec(text) ||
    /A\s+kamatfizetés[\s\S]{0,200}?az\s+alábbi\s+napokon\s+történik\s*:/i.exec(text)
  if (!marker || marker.index == null) return []
  const after = text.slice(marker.index + marker[0].length)
  const stop = /Kamatszámítás\s+algoritmusa|Törlesztés\s*:/i.exec(after)
  const block = stop ? after.slice(0, stop.index) : after.slice(0, 2500)
  return collectHungarianDatesInBlock(block)
}

function parseHuPercent(raw: string): number | null {
  const m = /(\d+),(\d+)\s*%/.exec(raw)
  if (!m) return null
  return Number(`${m[1]}.${m[2]}`)
}

/**
 * Magyar Államkötvény (MÁK / KTV) auction offerings: annual table
 * "A kamatfizetés évente a következő napokon és mértékkel történik"
 * with rows like `2027. szeptember 23. 6,25%` (ADR 0044).
 * `pdftotext -layout` often places date/rate columns beside the label, so the first
 * dates can appear *inside* the marker span — collect from marker start through
 * törlesztés. When a date row has no `%` (FLOAT / omitted), the parallel rate is `null`.
 */
function extractMakAnnualSchedule(text: string): {
  paymentDates: string[]
  paymentRates: Array<number | null>
} | null {
  const marker = MAK_ANNUAL_SCHEDULE_MARKER.exec(text)
  if (!marker || marker.index == null) return null
  const fromMarker = text.slice(marker.index)
  const stop =
    /Törlesztés\s*,\s*visszaváltás\s*:|Törlesztés\s*:|4\.\s+A(?:z\s+Államkötvény|\s+Zöld)/i.exec(
      fromMarker
    )
  // Long tenors (e.g. 2051/G) need a generous window; still stop at törlesztés.
  const block = stop ? fromMarker.slice(0, stop.index) : fromMarker.slice(0, 8000)

  const paymentDates: string[] = []
  const paymentRates: Array<number | null> = []
  const seen = new Set<string>()
  for (const line of block.split(/\r?\n/)) {
    const dateMatch = new RegExp(HU_DATE.source, 'i').exec(line)
    if (!dateMatch) continue
    const iso = parseHungarianDate(dateMatch[0])
    if (!iso || seen.has(iso)) continue
    seen.add(iso)
    const afterDate = line.slice((dateMatch.index ?? 0) + dateMatch[0].length)
    paymentDates.push(iso)
    // Only rates printed on the same row as the date — never invent / backfill from
    // nearby orphan `%` lines (FLOAT / split-layout FIX first period stays null).
    paymentRates.push(parseHuPercent(afterDate))
  }
  if (paymentDates.length === 0) return null
  // Keep date order chronological (stable with parallel rates).
  const indexed = paymentDates.map((d, i) => ({ d, r: paymentRates[i]! }))
  indexed.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  return {
    paymentDates: indexed.map((x) => x.d),
    paymentRates: indexed.map((x) => x.r)
  }
}

function collectHungarianDatesInBlock(block: string): string[] {
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
 * MÁPP table: "Kamatteljesítési napok…" rows like
 * `2026.01.06 - 2027.02.27 2027.02.27 6,50% 7,43%` — take the payment column date.
 */
function extractMappTablePaymentDates(text: string): string[] {
  const marker = /Kamatteljesítési\s+napok/i.exec(text)
  if (!marker || marker.index == null) return []
  const after = text.slice(marker.index)
  const stop = /Kamatszámítás\s+algoritmusa|Kamatteljesítés\s*:|Másodlagos\s+piac/i.exec(
    after.slice(marker[0].length)
  )
  const block = stop
    ? after.slice(0, marker[0].length + stop.index)
    : after.slice(0, 2500)

  const dates: string[] = []
  const seen = new Set<string>()
  for (const line of block.split(/\r?\n/)) {
    // Prefer "periodStart - periodEnd paymentDate rate..." shape.
    const ranged =
      /(\d{4})\.(\d{2})\.(\d{2})\s*[-–]\s*(\d{4})\.(\d{2})\.(\d{2})\s+(\d{4})\.(\d{2})\.(\d{2})/.exec(
        line
      )
    if (ranged) {
      const iso = `${ranged[7]}-${ranged[8]}-${ranged[9]}`
      if (!seen.has(iso)) {
        seen.add(iso)
        dates.push(iso)
      }
      continue
    }
  }

  // Fallback: "Kamatjuttatás napja" follow-on table (often omits final maturity coupon).
  if (dates.length === 0) {
    for (const m of block.matchAll(new RegExp(DOTTED_DATE.source, 'g'))) {
      const iso = parseDottedDate(m[0])
      if (!iso || seen.has(iso)) continue
      seen.add(iso)
      dates.push(iso)
    }
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
    const issueLabel =
      /kibocsátásának\s+kezdő\s+időpontja\s*:/i.exec(text) ||
      /kezdő\s+időpontja\s*:/i.exec(text)
    if (issueLabel && issueLabel.index != null) {
      const after = text.slice(
        issueLabel.index + issueLabel[0].length,
        issueLabel.index + issueLabel[0].length + 120
      )
      const issueIso = firstDateInWindow(after)
      if (issueIso) {
        const y = Number(issueIso.slice(0, 4)) + 1
        first = `${y}-${pad2(month)}-${pad2(day)}`
      }
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
 * Parse offering PDF text into payment dates + day-count (ADR 0041 / 0044).
 * Throws OfferingPdfParseError when neither dates nor dayCount can be recovered
 * (except DKJ zero-coupon offerings, which succeed with empty paymentDates + ACT/360).
 * MÁK/KTV auction tables may omit Kamatszámítás — dayCount stays null when absent.
 */
export function parseOfferingPdfText(text: string): ParsedOfferingPdf {
  const normalized = text.replace(/\u00a0/g, ' ')
  const dayCount = mapOfferingDayCount(normalized)
  const maturity = extractMaturity(normalized)
  let paymentDates = extractExplicitPaymentDates(normalized)
  let paymentRates: Array<number | null> | undefined
  if (paymentDates.length === 0) {
    const mak = extractMakAnnualSchedule(normalized)
    if (mak) {
      paymentDates = mak.paymentDates
      paymentRates = mak.paymentRates
    }
  }
  if (paymentDates.length === 0) {
    const makTurns = extractMakRecurringPeriodTurns(normalized)
    if (makTurns) {
      paymentDates = makTurns.paymentDates
      paymentRates = makTurns.paymentRates
    }
  }
  if (paymentDates.length === 0) {
    paymentDates = extractMappTablePaymentDates(normalized)
  }
  if (paymentDates.length === 0) {
    paymentDates = extractRecurringPaymentDates(normalized)
  }

  if (paymentDates.length === 0 && !dayCount && isDiscountTreasuryBill(normalized) && maturity) {
    return { paymentDates: [], dayCount: 'ACT/360', maturity }
  }

  if (paymentDates.length === 0 && !dayCount) {
    throw new OfferingPdfParseError('No paymentDates or dayCount found in offering PDF text')
  }
  const result: ParsedOfferingPdf = { paymentDates, dayCount, maturity }
  if (paymentRates) {
    result.paymentRates = paymentRates
  }
  return result
}
