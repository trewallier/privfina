import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ALLAMPAPIR_BASE_URL,
  AllampapirFetchError,
  CookieJar,
  CsrfSession,
  postJsonWithSession
} from './fetch-allampapir.ts'
import type { AllampapirEnvelope } from './types.ts'

export interface FetchRetailInterestOptions {
  rawDir: string
  fetchImpl?: typeof fetch
  retries?: number
  backoffMs?: number
  baseUrl?: string
  userAgent?: string
  /** Reuse an existing CSRF session (same jar as price fetch). */
  session?: CsrfSession
}

export interface FetchRetailInterestResult {
  envelope: AllampapirEnvelope
}

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; privfina-market-data/1.0; +https://github.com/trewallier/privfina)'

/**
 * CSRF + POST /api/retailInterest/get_all_data (Lakossági kamatok).
 * Soft-ok: HTTP 200 with empty data rows. Hard-fail CSRF / unexpected shapes.
 * XLSX download is intentionally not used (omits underIssue; see ADR 0036).
 */
export async function fetchRetailInterestSnapshots(
  options: FetchRetailInterestOptions
): Promise<FetchRetailInterestResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  const backoffMs = options.backoffMs ?? 1000
  const baseUrl = (options.baseUrl ?? ALLAMPAPIR_BASE_URL).replace(/\/$/, '')
  const userAgent = options.userAgent ?? DEFAULT_UA
  const session =
    options.session ??
    new CsrfSession(baseUrl, new CookieJar(), fetchImpl, userAgent)

  await mkdir(options.rawDir, { recursive: true })

  const { status, envelope } = await postJsonWithSession(
    `${baseUrl}/api/retailInterest/get_all_data`,
    {},
    `${baseUrl}/kamatok`,
    session,
    retries,
    backoffMs
  )
  await writeFile(
    path.join(options.rawDir, 'retail_interest_all.json'),
    `${JSON.stringify(envelope)}\n`,
    'utf8'
  )

  if (status !== 200 || envelope.status !== true) {
    throw new AllampapirFetchError(
      `allampapir retailInterest get_all_data HTTP ${status} status=${String(envelope.status)} message=${String(envelope.message)}`,
      status >= 400 && status < 500 ? 'http4xx' : 'shape',
      false
    )
  }

  const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : null
  if (!data) {
    throw new AllampapirFetchError(
      'allampapir retailInterest get_all_data missing data object',
      'shape',
      false
    )
  }
  const rows = data.data
  if (rows == null) {
    // Soft-ok empty: treat missing rows as [].
    return { envelope }
  }
  if (!Array.isArray(rows) && typeof rows !== 'object') {
    throw new AllampapirFetchError(
      'allampapir retailInterest get_all_data data.data must be array or object map',
      'shape',
      false
    )
  }

  return { envelope }
}
