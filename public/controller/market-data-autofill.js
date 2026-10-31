/**
 * Map published market series + quote into commercial investment form fields.
 * Never returns amount fields (principal / faceValue) or purchaseDate.
 */

const TERM_BUCKETS = [3, 6, 12]

function isBlank(value) {
  return value == null || String(value).trim() === ''
}

function parseIsoDateUtc(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return null
  }
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
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
 * Build a patch of form field values from market data.
 *
 * @param {{
 *   family: 'dkj'|'pmap'|'bmap',
 *   series: object|null|undefined,
 *   quote: object|null|undefined,
 *   current?: Record<string, string|number|null|undefined>,
 *   mode?: 'fill-empty'|'force-quote'
 * }} args
 * @returns {{ fields: Record<string, string|number>, sourced: string[] }}
 */
export function buildMarketAutofillPatch({
  family,
  series,
  quote,
  current = {},
  mode = 'fill-empty'
} = {}) {
  const fields = {}
  const sourced = []
  const forceQuote = mode === 'force-quote'
  // Series-driven fields always refresh on series pick: HTML <select> defaults
  // (e.g. termMonths=3) are never blank, so fill-empty alone would skip them.
  const seriesDriven = new Set([
    'maturityDate',
    'termMonths',
    'interestPremiumPct',
    'issueDate',
    'startDate'
  ])

  function setIfAllowed(name, value, { quoteField = false } = {}) {
    if (value == null || value === '') {
      return
    }
    const existing = current[name]
    if (forceQuote) {
      if (!quoteField && !isBlank(existing)) {
        return
      }
    } else if (!seriesDriven.has(name) && !isBlank(existing)) {
      return
    }
    fields[name] = value
    sourced.push(name)
  }

  if (family === 'dkj') {
    if (series?.mat) {
      setIfAllowed('maturityDate', series.mat)
    }
    const termMonths = deriveTermMonths(series?.issue, series?.mat)
    if (termMonths != null) {
      setIfAllowed('termMonths', termMonths)
    }
    if (quote?.d) {
      setIfAllowed('settlementDate', quote.d, { quoteField: true })
    }
    const price = pickPurchasePricePct(quote)
    if (price != null) {
      setIfAllowed('purchasePricePct', price, { quoteField: true })
    }
    const settlement = fields.settlementDate ?? current.settlementDate
    const maturity = fields.maturityDate ?? current.maturityDate
    const remaining = deriveRemainingDays(settlement, maturity)
    if (remaining != null) {
      setIfAllowed('remainingDays', remaining, { quoteField: true })
    }
  } else if (family === 'pmap' || family === 'bmap') {
    if (series?.prem != null && Number.isFinite(Number(series.prem))) {
      setIfAllowed('interestPremiumPct', Number(series.prem))
    }
    if (series?.issue) {
      setIfAllowed('issueDate', series.issue)
      setIfAllowed('startDate', series.issue)
    }
  }

  return { fields, sourced }
}

/** Fields that must never be overwritten by market autofill. */
export const MARKET_AUTOFILL_PROTECTED_FIELDS = Object.freeze([
  'principal',
  'faceValue',
  'purchaseDate'
])
