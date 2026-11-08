/**
 * Runtime loader for published government-security market JSON
 * (ADR 0034 / 0035 / 0036 / 0038 / 0039 / ROADMAP §6b–§6l).
 * Fetches same-origin Pages files under data/market/v2/ — never official market hosts.
 */

export const PRICE_CALENDAR_REF_PATH = 'refs/price-calendar.json'

export const MARKET_SCHEMA_VERSION = 2
export const MARKET_FAMILIES = Object.freeze(['dkj', 'pmap', 'bmap', 'fixmap', 'mapp'])

const sessionCache = new Map()

function resolveBaseUrl(baseUrl) {
  if (baseUrl != null && String(baseUrl).trim() !== '') {
    const trimmed = String(baseUrl).replace(/\/?$/, '/')
    return trimmed.endsWith('data/market/v2/')
      ? trimmed
      : `${trimmed}data/market/v2/`
  }
  const viteBase =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : '/'
  const normalized = viteBase.endsWith('/') ? viteBase : `${viteBase}/`
  return `${normalized}data/market/v2/`
}

function joinUrl(base, relativePath) {
  const root = String(base || '').replace(/\/?$/, '/')
  const rel = String(relativePath || '').replace(/^\//, '')
  return `${root}${rel}`
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function validateManifest(data) {
  if (!isPlainObject(data) || data.schemaVersion !== MARKET_SCHEMA_VERSION) {
    return null
  }
  if (!Array.isArray(data.families) || !isPlainObject(data.paths)) {
    return null
  }
  return data
}

function validateSeriesFile(data, family) {
  if (!isPlainObject(data) || data.schemaVersion !== MARKET_SCHEMA_VERSION) {
    return null
  }
  if (data.family !== family || !Array.isArray(data.series)) {
    return null
  }
  return data
}

function validateLatestFile(data) {
  if (!isPlainObject(data) || data.schemaVersion !== MARKET_SCHEMA_VERSION) {
    return null
  }
  if (!isPlainObject(data.quotes)) {
    return null
  }
  return data
}

function validateQuotesFile(data, id) {
  if (!isPlainObject(data) || data.schemaVersion !== MARKET_SCHEMA_VERSION) {
    return null
  }
  if (data.id !== id || !Array.isArray(data.cols) || !Array.isArray(data.rows)) {
    return null
  }
  return data
}

function validateCouponsFile(data, id) {
  if (!isPlainObject(data) || data.schemaVersion !== MARKET_SCHEMA_VERSION) {
    return null
  }
  if (data.id !== id || !Array.isArray(data.cols) || !Array.isArray(data.rows)) {
    return null
  }
  return data
}

function validatePriceCalendar(data) {
  if (!isPlainObject(data) || data.schemaVersion !== MARKET_SCHEMA_VERSION) {
    return null
  }
  if (!isPlainObject(data.source) || !Array.isArray(data.reports) || !Array.isArray(data.days)) {
    return null
  }
  return data
}

/**
 * Per-series public-offering transcription (ROADMAP §6k publish → §6l SPA).
 * Requires id + schemaVersion; saleWindow / paymentDates / dayCount / source soft-optional.
 * @param {unknown} data
 * @param {string} id
 */
function validateOfferingFile(data, id) {
  if (!isPlainObject(data) || data.schemaVersion !== MARKET_SCHEMA_VERSION) {
    return null
  }
  if (data.id !== id) {
    return null
  }
  if (data.saleWindow != null) {
    if (!isPlainObject(data.saleWindow) || typeof data.saleWindow.from !== 'string') {
      return null
    }
    if (
      data.saleWindow.to != null &&
      data.saleWindow.to !== '' &&
      typeof data.saleWindow.to !== 'string'
    ) {
      return null
    }
  }
  if (data.paymentDates != null && !Array.isArray(data.paymentDates)) {
    return null
  }
  if (data.dayCount != null && typeof data.dayCount !== 'string') {
    return null
  }
  if (data.source != null && !isPlainObject(data.source)) {
    return null
  }
  return data
}

/**
 * Aggregate calendar status for a Europe/Budapest calendar date across reports.
 * Prefer priced > fetch_failed > no_price when multiple report rows share a datum.
 * @param {{ days?: Array<{ datum?: string, status?: string }> }|null|undefined} calendar
 * @param {string} datum
 * @returns {'priced'|'no_price'|'fetch_failed'|null}
 */
export function lookupPriceCalendarStatus(calendar, datum) {
  const wanted = String(datum || '').trim()
  if (!calendar || !wanted || !Array.isArray(calendar.days)) {
    return null
  }
  let sawNoPrice = false
  let sawFetchFailed = false
  for (const row of calendar.days) {
    if (!row || String(row.datum || '') !== wanted) {
      continue
    }
    if (row.status === 'priced') {
      return 'priced'
    }
    if (row.status === 'fetch_failed') {
      sawFetchFailed = true
    } else if (row.status === 'no_price') {
      sawNoPrice = true
    }
  }
  if (sawFetchFailed) {
    return 'fetch_failed'
  }
  if (sawNoPrice) {
    return 'no_price'
  }
  return null
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { credentials: 'same-origin' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  return response.json()
}

async function cachedFetch(url, fetchImpl, validate) {
  if (sessionCache.has(url)) {
    return sessionCache.get(url)
  }
  const raw = await fetchJson(url, fetchImpl)
  const validated = validate(raw)
  if (!validated) {
    throw new Error(`Invalid published market JSON at ${url}`)
  }
  sessionCache.set(url, validated)
  return validated
}

/**
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch }} [options]
 */
export function createMarketDataLoader(options = {}) {
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const fetchImpl = options.fetchImpl || globalThis.fetch

  if (typeof fetchImpl !== 'function') {
    return {
      baseUrl,
      async loadManifest() {
        return null
      },
      async loadFamily() {
        return { series: [], latest: null, available: false }
      },
      async loadQuotes() {
        return null
      },
      async loadCoupons() {
        return null
      },
      async loadPriceCalendar() {
        return null
      },
      async loadOffering() {
        return null
      },
      /** @deprecated Schema v2 publishes coupons/; always soft-null. */
      async loadRetailInterest() {
        return null
      },
      clearCache() {
        sessionCache.clear()
      }
    }
  }

  return {
    baseUrl,

    async loadManifest() {
      try {
        return await cachedFetch(joinUrl(baseUrl, 'manifest.json'), fetchImpl, validateManifest)
      } catch {
        return null
      }
    },

    /**
     * Per-series coupon schedule (ADR 0038). Soft-null when missing.
     * @param {'dkj'|'pmap'|'bmap'} family
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    async loadCoupons(family, id) {
      if (!MARKET_FAMILIES.includes(family) || !id) {
        return null
      }
      try {
        const relative = `families/${family}/coupons/${encodeURIComponent(id)}.json`
        return await cachedFetch(joinUrl(baseUrl, relative), fetchImpl, (data) =>
          validateCouponsFile(data, id)
        )
      } catch {
        return null
      }
    },

    /**
     * @deprecated Flat refs/retail-interest.json retired in schemaVersion 2.
     * @returns {Promise<null>}
     */
    async loadRetailInterest() {
      return null
    },

    /**
     * WebKincstár priced / no_price / fetch_failed calendar (ADR 0039 / ROADMAP §6i).
     * Soft-null when missing or invalid.
     * @returns {Promise<object|null>}
     */
    async loadPriceCalendar() {
      try {
        const manifest = await this.loadManifest()
        const relative =
          (manifest && manifest.refs && manifest.refs.priceCalendar) || PRICE_CALENDAR_REF_PATH
        return await cachedFetch(joinUrl(baseUrl, relative), fetchImpl, validatePriceCalendar)
      } catch {
        return null
      }
    },

    /**
     * Per-series offering transcription (ROADMAP §6l). Soft-null when missing/invalid.
     * Preferred path: `families/{fam}/offerings/<id>.json` (schemaVersion 2).
     * Misses (404 / invalid) are session-memoized as null so pre-§6k applies do not re-fetch.
     * @param {'dkj'|'pmap'|'bmap'} family
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    async loadOffering(family, id) {
      if (!MARKET_FAMILIES.includes(family) || !id) {
        return null
      }
      const relative = `families/${family}/offerings/${encodeURIComponent(id)}.json`
      const url = joinUrl(baseUrl, relative)
      if (sessionCache.has(url)) {
        return sessionCache.get(url)
      }
      try {
        const validated = await cachedFetch(url, fetchImpl, (data) => validateOfferingFile(data, id))
        return validated
      } catch {
        sessionCache.set(url, null)
        return null
      }
    },

    /**
     * @param {'dkj'|'pmap'|'bmap'} family
     * @returns {Promise<{ series: object[], latest: object|null, available: boolean, asOf: string|null, generatedAt: string|null }>}
     */
    async loadFamily(family) {
      const empty = {
        series: [],
        latest: null,
        available: false,
        asOf: null,
        generatedAt: null
      }
      if (!MARKET_FAMILIES.includes(family)) {
        return empty
      }

      try {
        const manifest = await this.loadManifest()
        if (!manifest) {
          return empty
        }

        const paths = manifest.paths?.[family]
        if (!paths?.series || !paths?.latest) {
          return empty
        }

        const [seriesFile, latestFile] = await Promise.all([
          cachedFetch(joinUrl(baseUrl, paths.series), fetchImpl, (data) =>
            validateSeriesFile(data, family)
          ),
          cachedFetch(joinUrl(baseUrl, paths.latest), fetchImpl, validateLatestFile)
        ])

        // Include active / matured / delisted so the composer can show maturity status in the hint.
        const listedSeries = (seriesFile.series || []).filter((row) => row && row.id)
        return {
          series: listedSeries,
          latest: latestFile,
          available: listedSeries.length > 0,
          asOf: latestFile.asOf || manifest.asOf || null,
          generatedAt: manifest.generatedAt || null
        }
      } catch {
        return empty
      }
    },

    /**
     * @param {'dkj'|'pmap'|'bmap'} family
     * @param {string} id
     */
    async loadQuotes(family, id) {
      if (!MARKET_FAMILIES.includes(family) || !id) {
        return null
      }
      try {
        const relative = `families/${family}/quotes/${encodeURIComponent(id)}.json`
        return await cachedFetch(joinUrl(baseUrl, relative), fetchImpl, (data) =>
          validateQuotesFile(data, id)
        )
      } catch {
        return null
      }
    },

    clearCache() {
      sessionCache.clear()
    }
  }
}

/** Clear module-level session cache (tests / soft reset). */
export function clearMarketDataSessionCache() {
  sessionCache.clear()
}

function quoteRowToObject(cols, row) {
  const out = {}
  cols.forEach((col, index) => {
    out[col] = row[index] ?? null
  })
  return out
}

/**
 * Pick a quote row for settleDate from a QuotesFile, or null.
 * @param {{ cols: string[], rows: unknown[][] }|null|undefined} quotesFile
 * @param {string} settleDate
 */
export function findQuoteRowBySettleDate(quotesFile, settleDate) {
  if (!quotesFile || !settleDate || !Array.isArray(quotesFile.rows)) {
    return null
  }
  const cols = quotesFile.cols || []
  const dIndex = cols.indexOf('d')
  if (dIndex < 0) {
    return null
  }
  const row = quotesFile.rows.find((entry) => Array.isArray(entry) && entry[dIndex] === settleDate)
  if (!row) {
    return null
  }
  return quoteRowToObject(cols, row)
}

/**
 * Nearest quote row by absolute day distance to settleDate (exact match preferred).
 * @param {{ cols: string[], rows: unknown[][] }|null|undefined} quotesFile
 * @param {string} settleDate
 * @returns {{ quote: object, date: string, clamped: boolean }|null}
 */
export function findNearestQuoteRow(quotesFile, settleDate) {
  if (!quotesFile || !Array.isArray(quotesFile.rows) || quotesFile.rows.length === 0) {
    return null
  }
  const cols = quotesFile.cols || []
  const dIndex = cols.indexOf('d')
  if (dIndex < 0) {
    return null
  }

  const exact = settleDate ? findQuoteRowBySettleDate(quotesFile, settleDate) : null
  if (exact) {
    return { quote: exact, date: settleDate, clamped: false }
  }

  const targetMs = settleDate && /^\d{4}-\d{2}-\d{2}$/.test(settleDate)
    ? Date.parse(`${settleDate}T00:00:00Z`)
    : NaN

  let best = null
  let bestDate = null
  let bestDistance = Number.POSITIVE_INFINITY

  quotesFile.rows.forEach((entry) => {
    if (!Array.isArray(entry)) {
      return
    }
    const date = entry[dIndex]
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return
    }
    const ms = Date.parse(`${date}T00:00:00Z`)
    if (Number.isNaN(ms)) {
      return
    }
    const distance = Number.isNaN(targetMs) ? 0 : Math.abs(ms - targetMs)
    if (distance < bestDistance || (distance === bestDistance && String(date) > String(bestDate))) {
      bestDistance = distance
      bestDate = String(date)
      best = quoteRowToObject(cols, entry)
    }
  })

  if (!best || !bestDate) {
    return null
  }
  return {
    quote: best,
    date: bestDate,
    clamped: !settleDate || bestDate !== settleDate
  }
}

/**
 * Resolve a quote for purchase/settlement date using latest + optional quotes history.
 * Clamps to the nearest available quote date when the requested date is missing.
 * Optional `priceCalendar` never invents quotes; it only annotates why a clamp happened
 * (`no_price` / `fetch_failed` vs thin history).
 *
 * @param {{
 *   requestedDate?: string|null,
 *   latestQuote?: object|null,
 *   quotesFile?: { cols: string[], rows: unknown[][] }|null,
 *   priceCalendar?: object|null
 * }} args
 * @returns {{
 *   quote: object,
 *   date: string,
 *   clamped: boolean,
 *   calendarStatus?: 'priced'|'no_price'|'fetch_failed'|null,
 *   clampReason?: 'no_quote'|'no_price'|'fetch_failed'|null
 * }|null}
 */
export function resolveQuoteForPurchaseDate({
  requestedDate = '',
  latestQuote = null,
  quotesFile = null,
  priceCalendar = null
} = {}) {
  const wanted = String(requestedDate || '').trim()
  const calendarStatus = wanted ? lookupPriceCalendarStatus(priceCalendar, wanted) : null

  function annotate(result) {
    if (!result) {
      return null
    }
    const out = { ...result, calendarStatus }
    if (!result.clamped) {
      out.clampReason = null
      return out
    }
    if (calendarStatus === 'no_price' || calendarStatus === 'fetch_failed') {
      out.clampReason = calendarStatus
    } else {
      out.clampReason = 'no_quote'
    }
    return out
  }

  if (wanted && latestQuote?.d === wanted) {
    return annotate({ quote: latestQuote, date: wanted, clamped: false })
  }

  const nearest = findNearestQuoteRow(quotesFile, wanted)
  if (nearest) {
    return annotate(nearest)
  }

  if (latestQuote?.d) {
    return annotate({
      quote: latestQuote,
      date: String(latestQuote.d),
      clamped: !wanted || wanted !== String(latestQuote.d)
    })
  }

  return null
}

/**
 * @param {Record<string, { d?: string, bid?: number|null, ask?: number|null, by?: number|null, ay?: number|null, ai?: number|null }>|null|undefined} latestQuotes
 * @param {string} id
 */
export function latestQuoteForId(latestQuotes, id) {
  if (!latestQuotes || !id) {
    return null
  }
  return latestQuotes[id] || null
}
