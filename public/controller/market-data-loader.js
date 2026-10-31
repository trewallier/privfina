/**
 * Runtime loader for published government-security market JSON (ADR 0034 / ROADMAP §6b).
 * Fetches same-origin Pages files under data/market/v1/ — never ÁKK.
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

        const activeSeries = seriesFile.series.filter((row) => row && row.status === 'active')
        return {
          series: activeSeries,
          latest: latestFile,
          available: activeSeries.length > 0,
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
  const out = {}
  cols.forEach((col, index) => {
    out[col] = row[index] ?? null
  })
  return out
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
