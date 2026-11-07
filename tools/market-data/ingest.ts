import { combineSnapshots } from './combine.ts'
import { applyWebkincstarQuotes } from './combine-webkincstar.ts'
import { fetchAkkSnapshots } from './fetch-akk.ts'
import { CsrfSession, fetchAllampapirSnapshots } from './fetch-allampapir.ts'
import { fetchKshInflationCsv } from './fetch-ksh-inflation.ts'
import { fetchRetailInterestSnapshots } from './fetch-retail-interest.ts'
import {
  budapestYesterdayIso,
  fetchWebkincstarSnapshots
} from './fetch-webkincstar.ts'
import { loadMarketTree, marketRoot, writeMarketTree } from './io.ts'
import { mergeSnapshot, type MergeResult } from './merge.ts'
import { priceCalendarFileFromDays } from './merge-price-calendar.ts'
import { normalizeAkkSnapshots } from './normalize.ts'
import { normalizeAllampapirSnapshots } from './normalize-allampapir.ts'
import { normalizeKshInflationCsv } from './normalize-ksh-inflation.ts'
import { normalizeRetailInterestEnvelope } from './normalize-retail-interest.ts'
import {
  fetchFailedCalendarDays,
  normalizeWebkincstarReports
} from './normalize-webkincstar.ts'
import {
  emptyNormalizedByFamily,
  FAMILIES,
  type AkkEnvelope,
  type AllampapirEnvelope,
  type FamilyCode,
  type InflationFile,
  type NormalizedSnapshot,
  type PriceCalendarFile,
  type RetailInterestFile,
  type SeriesRecord
} from './types.ts'
import { validateMarketTree } from './validate.ts'
import { WEBKINCSTAR_REPORTS, type WebkincstarReportName } from './webkincstar-reports.ts'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** Exit: success with changes. */
export const EXIT_UPDATED = 0
/** Exit: hard failure. */
export const EXIT_ERROR = 1
/**
 * Exit: success with no tree changes (local `ingest` CLI only).
 * `ci-ingest` always exits 0 on success and reports `changed` via GITHUB_OUTPUT.
 */
export const EXIT_UNCHANGED = 2

export interface IngestOptions {
  /** Output repo root or path containing data/market/v2 (or the v2 dir itself). */
  root: string
  /**
   * Optional baseline tree to load before merge (e.g. tip of `market-data`).
   * Defaults to `root` when omitted.
   */
  previousRoot?: string
  rawDir: string
  /** Skip ÁKK network; use provided envelopes (tests / offline). */
  catalog?: AkkEnvelope
  networkRates?: AkkEnvelope
  /**
   * Skip allampapir network; use provided per-paper envelopes (and optional meta).
   * When omitted with live ÁKK, allampapir is fetched. When omitted with fixture ÁKK,
   * an empty allampapir snapshot is combined (ÁKK-only offline).
   */
  allampapirPrices?: Record<string, AllampapirEnvelope>
  /** When true, do not fetch allampapir prices or retail interest even if fixtures omitted. */
  skipAllampapir?: boolean
  /**
   * Offline retailInterest get_all_data envelope. When omitted with fixture ÁKK / skip,
   * previous coupons are kept. Live runs refresh retail interest (soft-fail on errors).
   */
  retailInterestEnvelope?: AllampapirEnvelope
  /** Skip only retailInterest fetch/join (keep previous coupons / offered). */
  skipRetailInterest?: boolean
  /**
   * Offline KSH ara0040 CSV path. When omitted with fixture ÁKK / skip,
   * previous inflation refs are kept. Live runs always fetch KSH CSV (hard-fail).
   */
  inflationCsvPath?: string
  /** Raw CSV bytes (tests); takes precedence over inflationCsvPath. */
  inflationCsvBytes?: Uint8Array
  /** Skip only inflation fetch/merge (keep previous refs). */
  skipInflation?: boolean
  /**
   * Europe/Budapest YYYY-MM-DD for WebKincstár PDFs. Defaults to yesterday.
   */
  webkincstarDatum?: string
  /**
   * Offline pre-extracted `pdftotext -layout` texts keyed by report name (tests).
   * When set with fixture ÁKK, skips live WebKincstár POST.
   */
  webkincstarTextByReport?: Partial<Record<WebkincstarReportName, string>>
  /** Skip WebKincstár fetch/overlay (keep previous price calendar). */
  skipWebkincstar?: boolean
  fetchImpl?: typeof fetch
  generatedAt?: string
}

export interface IngestReport extends MergeResult {
  root: string
  marketRoot: string
  dualSource: boolean
  retailInterestUpdated: boolean
  /** True when live retailInterest fetch failed and previous coupons were kept. */
  retailInterestSoftFailed: boolean
  inflationUpdated: boolean
  webkincstarUpdated: boolean
  /** True when WebKincstár soft-failed and calendar recorded fetch_failed. */
  webkincstarSoftFailed: boolean
}

function emptyAllampapirSnapshot(): NormalizedSnapshot {
  return { asOf: null, byFamily: emptyNormalizedByFamily() }
}

function logRetailInterestSoftFail(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error(
    `[market-data] retailInterest soft-fail; keeping previous coupons and continuing price publish: ${message}`
  )
}

function logWebkincstarSoftFail(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error(
    `[market-data] WebKincstár soft-fail; recording fetch_failed calendar and continuing dual-source publish: ${message}`
  )
}

function previousSeriesForJoin(
  previous: Awaited<ReturnType<typeof loadMarketTree>>
): Array<{ family: FamilyCode; series: SeriesRecord }> {
  const out: Array<{ family: FamilyCode; series: SeriesRecord }> = []
  for (const family of FAMILIES) {
    for (const series of previous.families[family].series.series) {
      out.push({ family, series })
    }
  }
  return out
}

/** Fetch (optional) → normalize → combine → WebKincstár overlay → merge → validate → write. */
export async function ingestMarketData(options: IngestOptions): Promise<IngestReport> {
  let catalog = options.catalog
  let networkRates = options.networkRates
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const offlineAkk = Boolean(options.catalog && options.networkRates)

  if (!catalog || !networkRates) {
    const fetched = await fetchAkkSnapshots({
      rawDir: path.join(options.rawDir, 'akk'),
      fetchImpl: options.fetchImpl
    })
    catalog = fetched.catalog
    networkRates = fetched.networkRates
  }

  const akkSnapshot = normalizeAkkSnapshots(catalog, networkRates, {
    requireFamilies: false
  })

  let allampapirSnapshot: NormalizedSnapshot
  let allampapirSession: CsrfSession | undefined
  if (options.allampapirPrices) {
    allampapirSnapshot = normalizeAllampapirSnapshots(options.allampapirPrices)
  } else if (options.skipAllampapir || offlineAkk) {
    // Offline ÁKK-only fixtures: empty treasury side; combine still enforces required families.
    allampapirSnapshot = emptyAllampapirSnapshot()
  } else {
    const fetched = await fetchAllampapirSnapshots({
      rawDir: path.join(options.rawDir, 'allampapir'),
      fetchImpl: options.fetchImpl
    })
    allampapirSnapshot = normalizeAllampapirSnapshots(fetched.pricesByPaper)
    allampapirSession = fetched.session
  }

  /** undefined = keep previous; file = replace (including empty rows). */
  let retailInterestUpdate: RetailInterestFile | undefined
  let retailInterestSoftFailed = false
  if (options.retailInterestEnvelope) {
    retailInterestUpdate = normalizeRetailInterestEnvelope(options.retailInterestEnvelope, {
      generatedAt
    })
  } else if (!options.skipRetailInterest && !options.skipAllampapir && !offlineAkk) {
    try {
      const fetched = await fetchRetailInterestSnapshots({
        rawDir: path.join(options.rawDir, 'allampapir'),
        fetchImpl: options.fetchImpl,
        session: allampapirSession
      })
      retailInterestUpdate = normalizeRetailInterestEnvelope(fetched.envelope, { generatedAt })
    } catch (err) {
      // Soft-fail: kamatok outage must not block ÁKK / price publishes (ADR 0036).
      logRetailInterestSoftFail(err)
      retailInterestSoftFailed = true
    }
  }

  /** undefined = keep previous; file = append-first merge. */
  let inflationUpdate: InflationFile | undefined
  if (options.inflationCsvBytes) {
    inflationUpdate = normalizeKshInflationCsv(options.inflationCsvBytes, { generatedAt })
  } else if (options.inflationCsvPath) {
    const bytes = new Uint8Array(await readFile(options.inflationCsvPath))
    inflationUpdate = normalizeKshInflationCsv(bytes, { generatedAt })
  } else if (!options.skipInflation && !offlineAkk) {
    // Live / non-fixture runs: hard-fail on KSH fetch or normalize (ADR 0037).
    const fetched = await fetchKshInflationCsv({
      rawDir: path.join(options.rawDir, 'ksh'),
      fetchImpl: options.fetchImpl
    })
    inflationUpdate = normalizeKshInflationCsv(fetched.csvBytes, {
      generatedAt,
      csvUrl: fetched.csvUrl
    })
  }

  const combined = combineSnapshots(akkSnapshot, allampapirSnapshot)
  const previous = await loadMarketTree(options.previousRoot ?? options.root)

  // Empty successful live retailInterest is treated like soft-fail: keep previous coupons
  // unless this is an intentional full wipe (previous also had no coupons / no retail).
  if (retailInterestUpdate !== undefined && retailInterestUpdate.rows.length === 0) {
    const previousHadCoupons = FAMILIES.some(
      (family) => Object.keys(previous.families[family].coupons).length > 0
    )
    const previousHadRetail = Boolean(previous.retailInterest?.rows?.length)
    if (previousHadCoupons || previousHadRetail) {
      logRetailInterestSoftFail(
        new Error('retailInterest returned zero rows; keeping previous coupons/offered')
      )
      retailInterestSoftFailed = true
      retailInterestUpdate = undefined
    }
  }

  /** undefined = keep previous calendar; file = append-first merge. */
  let priceCalendarUpdate: PriceCalendarFile | undefined
  let webkincstarSoftFailed = false
  let webkincstarHasQuotes = false
  let mergeSnapshotInput = combined.snapshot

  const webkincstarDatum = options.webkincstarDatum ?? budapestYesterdayIso()
  const shouldFetchWebkincstar =
    !options.skipWebkincstar &&
    (Boolean(options.webkincstarTextByReport) || !offlineAkk)

  if (shouldFetchWebkincstar) {
    try {
      const fetched = await fetchWebkincstarSnapshots({
        datum: webkincstarDatum,
        rawDir: path.join(options.rawDir, 'webkincstar'),
        fetchImpl: options.fetchImpl,
        textByReport: options.webkincstarTextByReport
      })
      const normalized = normalizeWebkincstarReports(
        fetched.reports.map((r) => r.parsed)
      )
      if (normalized.unmatchedNames.length > 0) {
        console.error(
          `[market-data] WebKincstár unmatched instrument names (soft-skip): ${normalized.unmatchedNames.join(', ')}`
        )
      }
      const overlay = applyWebkincstarQuotes(combined.snapshot, normalized.snapshot, {
        extraSeries: previousSeriesForJoin(previous)
      })
      if (overlay.skippedUnmatched > 0) {
        console.error(
          `[market-data] WebKincstár overlay skipped ${overlay.skippedUnmatched} quote(s) with no catalog series match`
        )
      }
      mergeSnapshotInput = overlay.snapshot
      webkincstarHasQuotes = overlay.hasQuotes
      priceCalendarUpdate = priceCalendarFileFromDays(normalized.calendarDays, generatedAt)
    } catch (err) {
      // Soft-fail: PDF outage must not block dual-source / KSH (ADR 0039).
      logWebkincstarSoftFail(err)
      webkincstarSoftFailed = true
      priceCalendarUpdate = priceCalendarFileFromDays(
        fetchFailedCalendarDays(webkincstarDatum, WEBKINCSTAR_REPORTS),
        generatedAt
      )
    }
  }

  // Dual-source or WebKincstár overlay may rewrite same settleDate vs prior tip.
  const mergeOptions: Parameters<typeof mergeSnapshot>[2] = {
    generatedAt,
    allowSameDayRewrite: combined.dualSource || webkincstarHasQuotes
  }
  if (retailInterestUpdate !== undefined) {
    mergeOptions.retailInterest = retailInterestUpdate
  }
  if (inflationUpdate !== undefined) {
    mergeOptions.inflation = inflationUpdate
  }
  if (priceCalendarUpdate !== undefined) {
    mergeOptions.priceCalendar = priceCalendarUpdate
  }
  const merged = mergeSnapshot(previous, mergeSnapshotInput, mergeOptions)
  validateMarketTree(merged.tree)

  if (merged.changed) {
    await writeMarketTree(options.root, merged.tree)
    const written = await loadMarketTree(options.root)
    validateMarketTree(written)
  }

  return {
    ...merged,
    root: options.root,
    marketRoot: marketRoot(options.root),
    dualSource: combined.dualSource,
    retailInterestUpdated: retailInterestUpdate !== undefined,
    retailInterestSoftFailed,
    inflationUpdated: inflationUpdate !== undefined,
    webkincstarUpdated: priceCalendarUpdate !== undefined,
    webkincstarSoftFailed
  }
}

/** @deprecated Use ingestMarketData */
export const publishMarketData = ingestMarketData
export type PublishOptions = IngestOptions
export type PublishReport = IngestReport
