/**
 * Map published market series + quote into commercial investment form fields.
 * Never returns amount fields (principal / faceValue) or purchase/settlement dates.
 */

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

export function deriveRemainingDays(settlementDate, maturityDate) {
  const start = parseIsoDateUtc(settlementDate)
  const end = parseIsoDateUtc(maturityDate)
  if (!start || !end || end <= start) {
    return null
  }
  return Math.round((end.getTime() - start.getTime()) / 86400000)
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

/** Prefer ask yield, else bid yield (temporary BMÁP/PMÁP effective interest). */
export function pickEffectiveInterestPct(quote) {
  if (!quote) {
    return null
  }
  if (quote.ay != null && Number.isFinite(Number(quote.ay))) {
    return Number(quote.ay)
  }
  if (quote.by != null && Number.isFinite(Number(quote.by))) {
    return Number(quote.by)
  }
  return null
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
 * Match published retail-interest rows to a market series (name preferred; id fallback).
 * Prefers offered=true periods, else the latest `from`.
 * @param {{ rows?: Array<object> }|null|undefined} retailInterest
 * @param {{ name?: string, id?: string }|null|undefined} series
 */
export function findRetailInterestForSeries(retailInterest, series) {
  const rows = retailInterest?.rows
  if (!Array.isArray(rows) || !series) {
    return null
  }
  const name = String(series.name || '').trim()
  const id = String(series.id || '').trim()
  const candidates = rows.filter((row) => {
    if (!row) return false
    if (name && row.series === name) return true
    if (id && (row.id === id || row.series === id)) return true
    return false
  })
  if (candidates.length === 0) {
    return null
  }
  const offered = candidates.filter((row) => row.offered === true)
  const pool = offered.length > 0 ? offered : candidates
  return pool.reduce((best, row) => {
    if (!best) return row
    return String(row.from || '') > String(best.from || '') ? row : best
  }, null)
}

/**
 * @returns {boolean|null} true/false from treasury offered; null when refs missing/unmatched
 */
export function isSeriesOfferedInRetailInterest(series, retailInterest) {
  const row = findRetailInterestForSeries(retailInterest, series)
  if (!row) {
    return null
  }
  return row.offered === true
}

/**
 * Period kamat mértéke from retail interest (combined coupon — not interest premium).
 * @returns {number|null}
 */
export function pickRetailPeriodRate(series, retailInterest) {
  const row = findRetailInterestForSeries(retailInterest, series)
  if (!row || row.rate == null || !Number.isFinite(Number(row.rate))) {
    return null
  }
  return Number(row.rate)
}

/**
 * @param {{ name?: string, issue?: string|null }|null|undefined} series
 * @param {string} todayIso Europe/Budapest calendar day
 * @param {{ rows?: Array<object> }|null|undefined} [retailInterest]
 */
export function isSeriesAvailableOn(series, todayIso, retailInterest = null) {
  const offered = isSeriesOfferedInRetailInterest(series, retailInterest)
  if (offered != null) {
    return offered
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
 * @param {{ name?: string, id?: string, issue?: string|null }|null|undefined} series
 * @param {string} [todayIso]
 * @param {{ rows?: Array<object> }|null|undefined} [retailInterest]
 */
export function formatSeriesAvailabilityLabel(
  series,
  todayIso = budapestTodayIso(),
  retailInterest = null
) {
  const name = String(series?.name || series?.id || '').trim() || 'Series'
  const available = isSeriesAvailableOn(series, todayIso, retailInterest)
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
    'interestPremiumPct',
    'previousYearAverageInflationPct',
    'startDate',
    'issueDate',
    'firstCouponDate'
  ]),
  bmap: Object.freeze([
    'dkjBaseYieldPct',
    'interestPremiumPct',
    'startDate',
    'issueDate',
    'firstCouponDate'
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
 *
 * @param {{
 *   family: 'dkj'|'pmap'|'bmap',
 *   series: object|null|undefined,
 *   quote: object|null|undefined,
 *   current?: Record<string, string|number|null|undefined>
 * }} args
 * @returns {{ fields: Record<string, string|number>, sourced: string[] }}
 */
export function buildMarketAutofillPatch({
  family,
  series,
  quote,
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
    // Temporary: when quote yield exists, fill 0 + effective interest into base+premium
    // until refs/inflation.json and refs/dkj-base.json land.
    const effective = pickEffectiveInterestPct(quote)
    if (effective != null) {
      if (family === 'bmap') {
        setField('dkjBaseYieldPct', 0)
      } else {
        setField('previousYearAverageInflationPct', 0)
      }
      setField('interestPremiumPct', effective)
    } else if (series?.prem != null && Number.isFinite(Number(series.prem))) {
      setField('interestPremiumPct', Number(series.prem))
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
