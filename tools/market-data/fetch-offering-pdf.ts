import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { formatFetchError, logFetchAttemptFailure } from './fetch-errors.ts'
import {
  MAX_OFFERING_PDF_DOWNLOADS_PER_FAMILY,
  type OfferingFamilyCode
} from './offering-families.ts'
import {
  archiveDocumentFromListing,
  rankOfferingDownloads,
  type NormalizedOfferingListingRow
} from './normalize-offerings.ts'
import type { OfferingArchiveDocument } from './types.ts'

export const AKK_DOCUMENTS_BASE = 'https://documents.akk.hu/public_offerings'
export const ALLAMPAPIR_DOCUMENTS_BASE = 'https://www.allampapir.hu/dokumentumok'

export interface FetchOfferingPdfOptions {
  rawDir: string
  fetchImpl?: typeof fetch
  retries?: number
  backoffMs?: number
  /** Override max downloads per family (tests). */
  maxPerFamily?: number
}

export interface OfferingPdfDownload {
  row: NormalizedOfferingListingRow
  bytes: Uint8Array
  sha256: string
  sourceHost: string
  url: string
}

export interface FetchOfferingPdfsResult {
  downloaded: OfferingPdfDownload[]
  /** Archive upserts including successful downloads and pending/failed leftovers. */
  archiveUpserts: OfferingArchiveDocument[]
  pendingCount: number
  downloadedCount: number
  failedCount: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function offeringPdfUrls(pathUuid: string): Array<{ host: string; url: string }> {
  const uuid = pathUuid.toLowerCase()
  return [
    { host: 'documents.akk.hu', url: `${AKK_DOCUMENTS_BASE}/${uuid}.pdf` },
    { host: 'www.allampapir.hu', url: `${ALLAMPAPIR_DOCUMENTS_BASE}/${uuid}.pdf` }
  ]
}

function sha256HexBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function downloadPdfOnce(
  url: string,
  fetchImpl: typeof fetch,
  retries: number,
  backoffMs: number,
  label: string
): Promise<Uint8Array> {
  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    const started = Date.now()
    let httpStatus: number | undefined
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/pdf,*/*' }
      })
      if (!res.ok) {
        httpStatus = res.status
        throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim() + ` for ${url}`)
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.length < 5 || String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== '%PDF') {
        throw new Error(`Response is not a PDF for ${url}`)
      }
      return buf
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
      if (attempt < retries) await sleep(backoffMs * attempt)
    }
  }
  throw new Error(
    `Offering PDF download failed after ${retries} attempt(s): ${formatFetchError(lastError)}`
  )
}

/**
 * Download a single offering PDF: ÁKK documents host first, allampapir fallback.
 */
export async function downloadOfferingPdf(
  pathUuid: string,
  options: {
    fetchImpl?: typeof fetch
    retries?: number
    backoffMs?: number
  } = {}
): Promise<{ bytes: Uint8Array; sha256: string; sourceHost: string; url: string }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 2
  const backoffMs = options.backoffMs ?? 400
  let lastError: unknown
  for (const candidate of offeringPdfUrls(pathUuid)) {
    try {
      const bytes = await downloadPdfOnce(
        candidate.url,
        fetchImpl,
        retries,
        backoffMs,
        `offering-pdf:${pathUuid}`
      )
      return {
        bytes,
        sha256: sha256HexBytes(bytes),
        sourceHost: candidate.host,
        url: candidate.url
      }
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(
    `Offering PDF ${pathUuid} failed on ÁKK and allampapir: ${formatFetchError(lastError)}`
  )
}

/**
 * Select unknown listing rows (no archive sha256), cap at maxPerFamily, download.
 * Never downloads a UUID already present with sha256 in `knownByUuid`.
 */
export async function fetchOfferingPdfsForListings(
  unknownRows: NormalizedOfferingListingRow[],
  knownByUuid: Map<string, OfferingArchiveDocument>,
  options: FetchOfferingPdfOptions
): Promise<FetchOfferingPdfsResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxPerFamily = options.maxPerFamily ?? MAX_OFFERING_PDF_DOWNLOADS_PER_FAMILY
  await mkdir(options.rawDir, { recursive: true })

  const byFamily = new Map<OfferingFamilyCode, NormalizedOfferingListingRow[]>()
  for (const row of unknownRows) {
    if (!row.pathUuid) continue
    const key = row.pathUuid.toLowerCase()
    const known = knownByUuid.get(key)
    if (known?.sha256) continue
    const list = byFamily.get(row.family) ?? []
    list.push(row)
    byFamily.set(row.family, list)
  }

  const downloaded: OfferingPdfDownload[] = []
  const archiveUpserts: OfferingArchiveDocument[] = []
  let pendingCount = 0
  let failedCount = 0

  for (const [, rows] of byFamily) {
    const ranked = rankOfferingDownloads(rows)
    // Dedupe by pathUuid within the family ranking.
    const seen = new Set<string>()
    const unique: NormalizedOfferingListingRow[] = []
    for (const row of ranked) {
      const uuid = row.pathUuid!.toLowerCase()
      if (seen.has(uuid)) continue
      seen.add(uuid)
      unique.push(row)
    }
    const take = unique.slice(0, maxPerFamily)
    const pending = unique.slice(maxPerFamily)
    pendingCount += pending.length

    for (const row of pending) {
      const doc = archiveDocumentFromListing(row, 'pending_download')
      if (doc) archiveUpserts.push(doc)
    }

    for (const row of take) {
      const uuid = row.pathUuid!.toLowerCase()
      try {
        const result = await downloadOfferingPdf(uuid, {
          fetchImpl,
          retries: options.retries,
          backoffMs: options.backoffMs
        })
        const rawPath = path.join(options.rawDir, `${uuid}.pdf`)
        await writeFile(rawPath, result.bytes)
        downloaded.push({
          row,
          bytes: result.bytes,
          sha256: result.sha256,
          sourceHost: result.sourceHost,
          url: result.url
        })
        const doc = archiveDocumentFromListing(row, 'downloaded', {
          sha256: result.sha256,
          bytes: result.bytes.byteLength,
          sourceHost: result.sourceHost
        })
        if (doc) archiveUpserts.push(doc)
      } catch (err) {
        failedCount += 1
        console.error(
          `[market-data] offering PDF download failed for ${uuid}: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
        const doc = archiveDocumentFromListing(row, 'download_failed')
        if (doc) archiveUpserts.push(doc)
      }
    }
  }

  return {
    downloaded,
    archiveUpserts,
    pendingCount,
    downloadedCount: downloaded.length,
    failedCount
  }
}
