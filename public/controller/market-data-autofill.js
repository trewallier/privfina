/**
 * Map published market series + quote into commercial investment form fields.
 * Never returns amount fields (principal / faceValue) or purchase/settlement dates.
 */

import { deriveDkjRemainingDays } from '@finance_engine/instruments/day_count'

const TERM_BUCKETS = [3, 6, 12]

function parseIsoDateUtc(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return null
  }
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatIsoDateUtc(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addMonthsUtc(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

export function deriveTermMonths(issue, mat) {
  const start = parseIsoDateUtc(issue)
  const end = parseIsoDateUtc(mat)
  if (!start || !end || end <= start) {
    return null
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86400000)
  const months = days / 30.4375
  return TERM_BUCKETS.reduce((best, bucket) =>
    Math.abs(bucket - months) < Math.abs(best - months) ? bucket : best
  )
}

/** Calendar days settlement→maturity (ACT); finance_engine day-count. */
export function deriveRemainingDays(settlementDate, maturityDate) {
  return deriveDkjRemainingDays(settlementDate, maturityDate)
}

/**
 * First coupon on the maturity month/day schedule at/after issue.
 * @param {string|null|undefined} issue
 * @param {string|null|undefined} mat
 * @param {number} frequencyMonths 12 = annual (PMÁP), 3 = quarterly (BMÁP)
 */
export function deriveFirstCouponDate(issue, mat, frequencyMonths) {
  const issueDate = parseIsoDateUtc(issue)
  const matDate = parseIsoDateUtc(mat)
  const step = Number(frequencyMonths)
  if (!issueDate || !matDate || !Number.isFinite(step) || step <= 0) {
    return null
  }

  let candidate = new Date(
    Date.UTC(issueDate.getUTCFullYear(), matDate.getUTCMonth(), matDate.getUTCDate())
  )
  let guard = 0
  while (candidate.getTime() < issueDate.getTime() && guard < 48) {
    candidate = addMonthsUtc(candidate, step)
    guard += 1
  }
  if (candidate.getTime() < issueDate.getTime()) {
    return null
  }
  return formatIsoDateUtc(candidate)
}

export function pickPurchasePricePct(quote) {
  if (!quote) {
    return null
  }
  if (quote.ask != null && Number.isFinite(Number(quote.ask))) {
    return Number(quote.ask)
  }
  if (quote.bid != null && Number.isFinite(Number(quote.bid))) {
    return Number(quote.bid)
  }
  return null
}

/**
 * Convert published coupons/<id>.json columnar rows into engine couponSchedule objects.
 * @param {{ cols?: string[], rows?: Array<Array<string|number|null>> }|null|undefined} coupons
 * @returns {Array<{ from: string, to: string|null, rate: number|null }>|null}
 */
export function couponsFileToCouponSchedule(coupons) {
  const rows = Array.isArray(coupons?.rows) ? coupons.rows : []
  if (!rows.length) {
    return null
  }
  const schedule = []
  for (const row of rows) {
    const from = String(row?.[0] || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) continue
    const rawTo = row?.[1]
    const to =
      rawTo == null || rawTo === ''
        ? null
        : /^\d{4}-\d{2}-\d{2}$/.test(String(rawTo))
          ? String(rawTo)
          : null
    const rawRate = row?.[2]
    const rate =
      rawRate == null || rawRate === ''
        ? null
        : Number.isFinite(Number(rawRate))
          ? Number(rawRate)
          : null
    schedule.push({ from, to, rate })
  }
  return schedule.length > 0 ? schedule : null
}

/**
 * Pick effective annual coupon % from a coupons/<id>.json file for onIso.
 * Prefer a covering period with a defined rate; else latest prior defined rate.
 * @param {{ cols?: string[], rows?: Array<Array<string|number|null>> }|null|undefined} coupons
 * @param {string} onIso
 * @returns {number|null}
 */
export function pickCouponRatePct(coupons, onIso) {
  const rows = Array.isArray(coupons?.rows) ? coupons.rows : []
  if (!rows.length || !/^\d{4}-\d{2}-\d{2}$/.test(String(onIso || ''))) {
    return null
  }
  const day = String(onIso)
  const covering = rows.find((row) => {
    const from = row?.[0]
    const to = row?.[1]
    const rate = row?.[2]
    if (!from || from > day) return false
    if (to != null && to !== '' && String(to) < day) return false
    return rate != null && Number.isFinite(Number(rate))
  })
  if (covering) return Number(covering[2])
  const prior = rows
    .filter(
      (row) =>
        row?.[0] &&
        String(row[0]) <= day &&
        row[2] != null &&
        Number.isFinite(Number(row[2]))
    )
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))[0]
  return prior ? Number(prior[2]) : null
}

/**
 * Maturity year from paper display name: `2027/I` or DKJ `D261223` → 2026.
 * @param {string|null|undefined} name
 */
export function parseSeriesNameYear(name) {
  const text = String(name || '').trim()
  const yearMatch = text.match(/^(\d{4})\b/)
  if (yearMatch) {
    return Number(yearMatch[1])
  }
  const dkjMatch = text.match(/^D(\d{2})(\d{2})(\d{2})$/i)
  if (dkjMatch) {
    return 2000 + Number(dkjMatch[1])
  }
  return null
}

/**
 * Last-available date heuristic: year from name + issue month/day.
 * @param {{ name?: string, issue?: string|null }|null|undefined} series
 */
export function deriveLastAvailabilityDate(series) {
  if (!series) {
    return null
  }
  const year = parseSeriesNameYear(series.name)
  const issue = parseIsoDateUtc(series.issue)
  if (year == null || !issue) {
    return null
  }
  const month = String(issue.getUTCMonth() + 1).padStart(2, '0')
  const day = String(issue.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * @param {{ name?: string, issue?: string|null, offered?: boolean|null }|null|undefined} series
 * @param {string} todayIso Europe/Budapest calendar day
 */
export function isSeriesAvailableOn(series, todayIso) {
  // Schema v2: prefer series.offered from kamatok join (ADR 0038).
  if (series && typeof series.offered === 'boolean') {
    return series.offered === true
  }
  const last = deriveLastAvailabilityDate(series)
  if (!last || !/^\d{4}-\d{2}-\d{2}$/.test(String(todayIso || ''))) {
    return false
  }
  return String(todayIso) <= last
}

/** Europe/Budapest calendar YYYY-MM-DD. */
export function budapestTodayIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) {
    return null
  }
  return `${year}-${month}-${day}`
}

/**
 * @param {{ name?: string, id?: string, issue?: string|null, offered?: boolean|null }|null|undefined} series
 * @param {string} [todayIso]
 */
export function formatSeriesAvailabilityLabel(series, todayIso = budapestTodayIso()) {
  const name = String(series?.name || series?.id || '').trim() || 'Series'
  const available = isSeriesAvailableOn(series, todayIso)
  return available ? `${name} — available` : `${name} — past`
}

/** Fields that must never be overwritten / marked auto by market autofill. */
export const MARKET_AUTOFILL_PROTECTED_FIELDS = Object.freeze([
  'principal',
  'faceValue',
  'purchaseDate',
  'settlementDate'
])

/** Required marketable inputs (excludes protected amount / purchase/settlement date). */
export const MARKET_MARKETABLE_REQUIRED_FIELDS = Object.freeze({
  dkj: Object.freeze(['purchasePricePct', 'termMonths', 'maturityDate', 'remainingDays']),
  pmap: Object.freeze([
    'annualCouponRatePct',
    'maturityDate',
    'startDate',
    'issueDate',
    'firstCouponDate',
    'couponSchedule'
  ]),
  bmap: Object.freeze([
    'annualCouponRatePct',
    'maturityDate',
    'startDate',
    'issueDate',
    'firstCouponDate',
    'couponSchedule'
  ])
})

/**
 * Marketable field names that should be cleared before applying a new patch
 * so series switches cannot leave stale rates looking user-entered.
 *
 * @param {'dkj'|'pmap'|'bmap'} family
 * @param {Iterable<string>} sourcedNames
 * @returns {string[]}
 */
export function marketableFieldsMissingFromPatch(family, sourcedNames = []) {
  const sourced = sourcedNames instanceof Set ? sourcedNames : new Set(sourcedNames || [])
  const marketable = MARKET_MARKETABLE_REQUIRED_FIELDS[family] || []
  return marketable.filter((name) => !sourced.has(name))
}

/**
 * Build a patch of form field values from market data.
 * Always overwrites sourced (auto) fields when values are available.
 * Never returns amount or purchase/settlement date fields.
 * For PMÁP/BMÁP, includes `couponSchedule` (array) from coupons/<id>.json when present.
 *
 * @returns {{ fields: Record<string, string|number|Array>, sourced: string[] }}
 */
export function buildMarketAutofillPatch({
  family,
  series,
  quote,
  coupons = null,
  current = {}
} = {}) {
  const fields = {}
  const sourced = []
  const protectedNames = new Set(MARKET_AUTOFILL_PROTECTED_FIELDS)

  function setField(name, value) {
    if (value == null || value === '') {
      return
    }
    if (protectedNames.has(name)) {
      return
    }
    fields[name] = value
    sourced.push(name)
  }

  if (family === 'dkj') {
    if (series?.mat) {
      setField('maturityDate', series.mat)
    }
    const termMonths = deriveTermMonths(series?.issue, series?.mat)
    if (termMonths != null) {
      setField('termMonths', termMonths)
    }
    const price = pickPurchasePricePct(quote)
    if (price != null) {
      setField('purchasePricePct', price)
    }
    const settlement = current.settlementDate
    const maturity = fields.maturityDate ?? current.maturityDate
    const remaining = deriveRemainingDays(settlement, maturity)
    if (remaining != null) {
      setField('remainingDays', remaining)
    }
  } else if (family === 'pmap' || family === 'bmap') {
    // ADR 0038: effective rate + full schedule from coupons/<id>.json — not quote ay/by.
    const onIso = String(current.purchaseDate || series?.issue || '').trim()
    const couponRate = pickCouponRatePct(coupons, onIso)
    if (couponRate != null) {
      setField('annualCouponRatePct', couponRate)
    }
    const schedule = couponsFileToCouponSchedule(coupons)
    if (schedule) {
      setField('couponSchedule', schedule)
    }
    if (series?.mat) {
      setField('maturityDate', series.mat)
    }
    if (series?.issue) {
      setField('issueDate', series.issue)
      setField('startDate', series.issue)
    }
    const firstCoupon = deriveFirstCouponDate(
      series?.issue,
      series?.mat,
      family === 'bmap' ? 3 : 12
    )
    if (firstCoupon) {
      setField('firstCouponDate', firstCoupon)
    }
  }

  return { fields, sourced }
}
