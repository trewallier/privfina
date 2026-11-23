import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { formatFetchError, logFetchAttemptFailure } from './fetch-errors.ts'
import {
  MNB_LETOLTES_BASE_URL,
  MNB_SETTLEMENT_CALENDAR_HUB_URL
} from './types.ts'

export interface DiscoveredSettlementCalendarFile {
  year: number
  fileName: string
  url: string
  /** Optional revision date suffix YYYY-MM-DD parsed from filename; null for undated base. */
  revisionDate: string | null
}

export interface FetchMnbSettlementCalendarOptions {
  rawDir: string
  /**
   * Years that must exist on the hub (hard-fail if missing).
   * Typically Europe/Budapest current and current−1.
   */
  requiredYears: number[]
  /**
   * Years to fetch when present (tip years / current+1). Missing years are
   * skipped with a warning so merge can keep tip blocks (ADR 0046).
   */
  optionalYears?: number[]
  fetchImpl?: typeof fetch
  hubUrl?: string
  /** Optional offline hub HTML (tests). */
  hubHtml?: string
  /** Map fileName → bytes for offline XLSX (tests). */
  xlsxByFileName?: Record<string, Uint8Array>
  retries?: number
  backoffMs?: number
}

export interface FetchedSettlementCalendarYear {
  year: number
  fileName: string
  url: string
  contentDigest: string
  xlsxBytes: Uint8Array
  rawPath: string
}

export interface FetchMnbSettlementCalendarResult {
  hubUrl: string
  discovered: DiscoveredSettlementCalendarFile[]
  fetched: FetchedSettlementCalendarYear[]
  /** Optional years skipped because the hub had no XLSX. */
  skippedOptionalYears: number[]
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Parse hub HTML for `/letoltes/{year}-evi-elszamolasforgalmi-naptar….xlsx` links.
 */
export function discoverSettlementCalendarFiles(
  hubHtml: string
): DiscoveredSettlementCalendarFile[] {
  const re =
    /(?:href\s*=\s*["']|["'])(\/?letoltes\/(\d{4})-evi-elszamolasforgalmi-naptar(?:-(\d{4}-\d{2}-\d{2}))?\.xlsx)/gi
  const byKey = new Map<string, DiscoveredSettlementCalendarFile>()
  for (const match of hubHtml.matchAll(re)) {
    const rel = match[1].replace(/^\//, '')
    const year = Number(match[2])
    const revisionDate = match[3] ?? null
    const fileName = path.posix.basename(rel)
    const url = `${MNB_LETOLTES_BASE_URL}/${fileName}`
    const key = `${year}:${fileName}`
    byKey.set(key, { year, fileName, url, revisionDate })
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    // Dated revisions after undated base when sorting for display.
    if (a.revisionDate && !b.revisionDate) return 1
    if (!a.revisionDate && b.revisionDate) return -1
    return (a.revisionDate ?? '').localeCompare(b.revisionDate ?? '')
  })
}

/**
 * Prefer the latest dated revision for a year; fall back to the undated base.
 */
export function pickLatestSettlementCalendarFile(
  candidates: DiscoveredSettlementCalendarFile[],
  year: number
): DiscoveredSettlementCalendarFile | null {
  const forYear = candidates.filter((c) => c.year === year)
  if (forYear.length === 0) return null
  const dated = forYear
    .filter((c) => c.revisionDate)
    .sort((a, b) => (b.revisionDate ?? '').localeCompare(a.revisionDate ?? ''))
  if (dated.length > 0) return dated[0]
  return forYear.find((c) => !c.revisionDate) ?? forYear[0]
}

async function fetchBytes(
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
        headers: {
          Accept:
            'text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*',
          'Accept-Encoding': 'gzip, deflate'
        }
      })
      if (!res.ok) {
        httpStatus = res.status
        throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim() + ` for ${url}`)
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.byteLength < 64) {
        httpStatus = res.status
        throw new Error(`${label} too small (${buf.byteLength} bytes) HTTP ${res.status} for ${url}`)
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
    `Failed to fetch ${label} after ${retries} attempts: ${formatFetchError(lastError)}`
  )
}

/**
 * Discover + fetch MNB elszámolásforgalmi XLSX calendars (ADR 0046).
 * Required years hard-fail when missing; optional years soft-skip with a warning.
 * Hub with zero links / XLSX fetch/normalize failures still hard-fail.
 */
export async function fetchMnbSettlementCalendars(
  options: FetchMnbSettlementCalendarOptions
): Promise<FetchMnbSettlementCalendarResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  const backoffMs = options.backoffMs ?? 500
  const hubUrl = options.hubUrl ?? MNB_SETTLEMENT_CALENDAR_HUB_URL
  const requiredYears = [...new Set(options.requiredYears)].sort((a, b) => a - b)
  const optionalYears = [...new Set(options.optionalYears ?? [])]
    .filter((y) => !requiredYears.includes(y))
    .sort((a, b) => a - b)

  await mkdir(options.rawDir, { recursive: true })

  let hubHtml = options.hubHtml
  if (hubHtml == null) {
    const hubBytes = await fetchBytes(hubUrl, fetchImpl, retries, backoffMs, 'MNB settlement hub')
    hubHtml = new TextDecoder('utf-8').decode(hubBytes)
    await writeFile(path.join(options.rawDir, 'settlement-calendar-hub.html'), hubHtml, 'utf8')
  }

  const discovered = discoverSettlementCalendarFiles(hubHtml)
  if (discovered.length === 0) {
    throw new Error(`No elszámolásforgalmi XLSX links found on MNB hub ${hubUrl}`)
  }

  const fetched: FetchedSettlementCalendarYear[] = []
  const skippedOptionalYears: number[] = []

  async function fetchOne(year: number): Promise<FetchedSettlementCalendarYear | null> {
    const pick = pickLatestSettlementCalendarFile(discovered, year)
    if (!pick) return null

    let xlsxBytes = options.xlsxByFileName?.[pick.fileName]
    if (!xlsxBytes) {
      xlsxBytes = await fetchBytes(
        pick.url,
        fetchImpl,
        retries,
        backoffMs,
        `MNB settlement XLSX ${pick.fileName}`
      )
    }

    const contentDigest = createHash('sha256').update(xlsxBytes).digest('hex')
    const rawPath = path.join(options.rawDir, pick.fileName)
    await writeFile(rawPath, xlsxBytes)
    return {
      year,
      fileName: pick.fileName,
      url: pick.url,
      contentDigest,
      xlsxBytes,
      rawPath
    }
  }

  for (const year of requiredYears) {
    const row = await fetchOne(year)
    if (!row) {
      throw new Error(
        `No MNB elszámolásforgalmi XLSX for required year ${year} on hub ${hubUrl} (discovered ${discovered
          .map((d) => d.fileName)
          .join(', ')})`
      )
    }
    fetched.push(row)
  }

  for (const year of optionalYears) {
    const row = await fetchOne(year)
    if (!row) {
      skippedOptionalYears.push(year)
      console.warn(
        `[market-data] MNB settlement calendar: optional year ${year} not on hub; keeping tip block if present`
      )
      continue
    }
    fetched.push(row)
  }

  fetched.sort((a, b) => a.year - b.year)
  return { hubUrl, discovered, fetched, skippedOptionalYears }
}
