import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AKK_SECURITY_TYPES } from './families.ts'
import { formatFetchError, logFetchAttemptFailure } from './fetch-errors.ts'
import type { AkkEnvelope } from './types.ts'

export const AKK_XPOSE3_BASE = 'https://www.akk.hu/api/data/xpose3-dwh/data'

export interface FetchAkkOptions {
  /** Directory for ephemeral raw JSON (gitignored). */
  rawDir: string
  /** Optional fetch impl (tests). */
  fetchImpl?: typeof fetch
  /** Max attempts per GET (including first try). */
  retries?: number
  /** Base backoff ms between retries. */
  backoffMs?: number
}

export interface FetchAkkResult {
  catalog: AkkEnvelope
  networkRates: AkkEnvelope
  catalogUrl: string
  networkRatesUrl: string
}

function encodeTypes(param: 'securityType' | 'type'): string {
  return AKK_SECURITY_TYPES.map((t) => `${param}=${encodeURIComponent(t)}`).join('&')
}

export function buildCatalogUrl(base = AKK_XPOSE3_BASE): string {
  return `${base}?query=getSecurityWithOutstanding&${encodeTypes('securityType')}`
}

export function buildNetworkRatesUrl(base = AKK_XPOSE3_BASE): string {
  return `${base}?query=getNetworkRates&orderField=maturityDate&orderDirection=ASC&${encodeTypes('type')}`
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function getJson(
  url: string,
  fetchImpl: typeof fetch,
  retries: number,
  backoffMs: number,
  label: string
): Promise<AkkEnvelope> {
  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    const started = Date.now()
    let httpStatus: number | undefined
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate'
        }
      })
      if (!res.ok) {
        httpStatus = res.status
        throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim() + ` for ${url}`)
      }
      const body = (await res.json()) as AkkEnvelope
      const status = body.meta?.status
      if (status && status !== 'OK') {
        httpStatus = res.status
        throw new Error(`ÁKK meta.status=${status} message=${body.meta?.message ?? ''} url=${url}`)
      }
      if (!Array.isArray(body.data)) {
        httpStatus = res.status
        throw new Error(`ÁKK response missing data[] for ${url}`)
      }
      return body
    } catch (err) {
      lastError = err
      logFetchAttemptFailure({
        label,
        attempt,
        retries,
        elapsedMs: Date.now() - started,
        err,
        httpStatus,
        url
      })
      if (attempt < retries) {
        await sleep(backoffMs * attempt)
      }
    }
  }
  throw new Error(
    `Failed to fetch ${label} after ${retries} attempts: ${formatFetchError(lastError)}`
  )
}

/** Two GETs only: catalog + combined network rates. */
export async function fetchAkkSnapshots(options: FetchAkkOptions): Promise<FetchAkkResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  const backoffMs = options.backoffMs ?? 1000
  const catalogUrl = buildCatalogUrl()
  const networkRatesUrl = buildNetworkRatesUrl()

  await mkdir(options.rawDir, { recursive: true })

  const catalog = await getJson(catalogUrl, fetchImpl, retries, backoffMs, 'ÁKK catalog')
  await writeFile(path.join(options.rawDir, 'catalog.json'), `${JSON.stringify(catalog)}\n`, 'utf8')

  const networkRates = await getJson(
    networkRatesUrl,
    fetchImpl,
    retries,
    backoffMs,
    'ÁKK networkRates'
  )
  await writeFile(
    path.join(options.rawDir, 'network-rates.json'),
    `${JSON.stringify(networkRates)}\n`,
    'utf8'
  )

  return { catalog, networkRates, catalogUrl, networkRatesUrl }
}
