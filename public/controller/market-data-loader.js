/**
 * Runtime loader for published government-security market JSON
 * (ADR 0034 / 0035 / 0036 / ROADMAP §6b–§6d).
 * Fetches same-origin Pages files under data/market/v1/ — never official market hosts.
 */

export const MARKET_SCHEMA_VERSION = 1
export const MARKET_FAMILIES = Object.freeze(['dkj', 'pmap', 'bmap'])

const sessionCache = new Map()

function resolveBaseUrl(baseUrl) {
  if (baseUrl != null && String(baseUrl).trim() !== '') {
    const trimmed = String(baseUrl).replace(/\/?$/, '/')
    return trimmed.endsWith('data/market/v1/')
      ? trimmed
      : `${trimmed}data/market/v1/`
  }
  const viteBase =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : '/'
  const normalized = viteBase.endsWith('/') ? viteBase : `${viteBase}/`
  return `${normalized}data/market/v1/`
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

function validateRetailInterestFile(data) {
  if (!isPlainObject(data) || data.schemaVersion !== MARKET_SCHEMA_VERSION) {
    return null
  }
  if (!Array.isArray(data.rows)) {
    return null
  }
  return data
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
     * Lakossági kamatok refs (ADR 0036). Soft-null when missing.
     * @returns {Promise<object|null>}
     */
    async loadRetailInterest() {
      try {
        const manifest = await this.loadManifest()
        const relative =
          manifest?.refs?.retailInterest || 'refs/retail-interest.json'
        return await cachedFetch(joinUrl(baseUrl, relative), fetchImpl, validateRetailInterestFile)
      } catch {
        return null
      }
    },

    /**
     * @param {'dkj'|'pmap'|'bmap'} family
     * @returns {Promise<{ series: object[], latest: object|null, available: boolean, asOf: string|null }>}
     */
    async loadFamily(family) {
      if (!MARKET_FAMILIES.includes(family)) {
        return { series: [], latest: null, available: false, asOf: null }
      }

      try {
        const manifest = await this.loadManifest()
        if (!manifest) {
          return { series: [], latest: null, available: false, asOf: null }
        }

        const paths = manifest.paths?.[family]
        if (!paths?.series || !paths?.latest) {
          return { series: [], latest: null, available: false, asOf: null }
        }

        const [seriesFile, latestFile] = await Promise.all([
          cachedFetch(joinUrl(baseUrl, paths.series), fetchImpl, (data) =>
            validateSeriesFile(data, family)
          ),
          cachedFetch(joinUrl(baseUrl, paths.latest), fetchImpl, validateLatestFile)
        ])

        // Include active / matured / delisted so the composer can label available vs past.
        const listedSeries = (seriesFile.series || []).filter((row) => row && row.id)
        return {
          series: listedSeries,
          latest: latestFile,
          available: listedSeries.length > 0,
          asOf: latestFile.asOf || manifest.asOf || null
        }
      } catch {
        return { series: [], latest: null, available: false, asOf: null }
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
 *
 * @param {{
 *   requestedDate?: string|null,
 *   latestQuote?: object|null,
 *   quotesFile?: { cols: string[], rows: unknown[][] }|null
 * }} args
 * @returns {{ quote: object, date: string, clamped: boolean }|null}
 */
export function resolveQuoteForPurchaseDate({
  requestedDate = '',
  latestQuote = null,
  quotesFile = null
} = {}) {
  const wanted = String(requestedDate || '').trim()

  if (wanted && latestQuote?.d === wanted) {
    return { quote: latestQuote, date: wanted, clamped: false }
  }

  const nearest = findNearestQuoteRow(quotesFile, wanted)
  if (nearest) {
    return nearest
  }

  if (latestQuote?.d) {
    return {
      quote: latestQuote,
      date: String(latestQuote.d),
      clamped: !wanted || wanted !== String(latestQuote.d)
    }
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
