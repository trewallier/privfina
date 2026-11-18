import { combineSnapshots } from './combine.ts'
import { applyWebkincstarQuotes } from './combine-webkincstar.ts'
import { fetchAkkSnapshots } from './fetch-akk.ts'
import { fetchAkkOfferingListings } from './fetch-akk-offerings.ts'
import { CsrfSession, fetchAllampapirSnapshots } from './fetch-allampapir.ts'
import { fetchKshInflationCsv } from './fetch-ksh-inflation.ts'
import { fetchRetailInterestSnapshots } from './fetch-retail-interest.ts'
import {
  budapestYesterdayIso,
  fetchWebkincstarSnapshots,
  resolveWebkincstarLookbackDatums
} from './fetch-webkincstar.ts'
import type { PriceCalendarDay } from './normalize-webkincstar.ts'
import { loadMarketTree, marketRoot, writeMarketTree } from './io.ts'
import { mergeSnapshot, type MergeResult } from './merge.ts'
import { fetchOfferingPdfsForListings } from './fetch-offering-pdf.ts'
import {
  archiveDocumentFromListing,
  diffOfferingsAgainstArchive,
  normalizeOfferingEnvelope,
  offeringStubFromListing
} from './normalize-offerings.ts'
import { mergeOfferingsState } from './merge-offerings.ts'
import type { OfferingFamilyCode } from './offering-families.ts'
import { parseOfferingPdfText } from './parse-offering-pdf.ts'
import { pdfBytesToTextLayout } from './pdf-text.ts'
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
  type OfferingArchiveFile,
  type OfferingFile,
  type PriceCalendarFile,
  type RetailInterestFile,
  type SaleWindow,
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
  /**
   * Offline getPublicOfferings envelopes keyed by offering family (tests).
   * When set with fixture ÁKK, skips live offering listing fetch.
   */
  offeringEnvelopesByFamily?: Partial<Record<OfferingFamilyCode, AkkEnvelope>>
  /** Skip offering listing/merge (keep previous offerings/archive). */
  skipOfferings?: boolean
  /**
   * Offline pre-extracted `pdftotext -layout` texts keyed by offering path UUID (tests).
   * When set, skips live Poppler extract for that UUID after download (WebKincstár-style).
   */
  offeringPdfTextByUuid?: Record<string, string>
  /**
   * When true, ISSUE archive rows with sticky `parse_failed` re-enter the PDF
   * download queue (operator recovery after a parser fix). Also honored via
   * `MARKET_REPARSE_PARSE_FAILED=1`.
   */
  reparseParseFailed?: boolean
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
  offeringsUpdated: boolean
  /** True when offering listing soft-failed and previous offerings were kept. */
  offeringsSoftFailed: boolean
  /** PDF downloads completed this run (unknown path UUIDs only; 0 on quiet archive-match days). */
  offeringPdfsDownloaded: number
  /** Unknown docs left as pending_download due to the per-family cap. */
  offeringPdfsPending: number
  /** PDF downloads that hashed but failed transcription this run. */
  offeringPdfsParseFailed: number
  /** WebKincstár (report, datum) rows appended as fetch_failed this run. */
  webkincstarFetchFailedDays: number
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
    `[market-data] WebKincstár soft-fail; recording fetch_failed calendar when possible and continuing dual-source publish: ${message}`
  )
}

function logOfferingsSoftFail(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error(
    `[market-data] offerings soft-fail; keeping previous offerings/archive and continuing price publish: ${message}`
  )
}

/**
 * Soft-fail calendar stubs must not conflict with an existing (report, datum) row
 * (priced / no_price / prior fetch_failed). Append only keys that are still absent
 * so a later PDF outage cannot MergeError the whole ingest (ADR 0039 "when possible").
 */
function fetchFailedCalendarDaysAppendable(
  datum: string,
  reports: readonly WebkincstarReportName[],
  previousCalendar: PriceCalendarFile | null | undefined
): ReturnType<typeof fetchFailedCalendarDays> {
  const candidates = fetchFailedCalendarDays(datum, reports)
  if (!previousCalendar?.days?.length) return candidates
  const existing = new Set(
    previousCalendar.days.map((d) => `${d.report}\0${d.datum}`)
  )
  return candidates.filter((d) => !existing.has(`${d.report}\0${d.datum}`))
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
  let webkincstarFetchFailedDays = 0
  let mergeSnapshotInput = combined.snapshot

  const webkincstarPrimaryDatum = options.webkincstarDatum ?? budapestYesterdayIso()
  // Explicit --datum is a single-day operator backfill; default runs add short lookback.
  const webkincstarDatums = options.webkincstarDatum
    ? [options.webkincstarDatum]
    : resolveWebkincstarLookbackDatums({
        primaryDatum: webkincstarPrimaryDatum,
        previousDays: previous.priceCalendar?.days,
        reports: WEBKINCSTAR_REPORTS
      })
  const shouldFetchWebkincstar =
    !options.skipWebkincstar &&
    (Boolean(options.webkincstarTextByReport) || !offlineAkk)

  if (shouldFetchWebkincstar) {
    const calendarDaysAccum: PriceCalendarDay[] = []
    // Offline textByReport fixtures only cover one datum — fetch that primary once.
    const datumsToFetch =
      options.webkincstarTextByReport && !options.webkincstarDatum
        ? [webkincstarPrimaryDatum]
        : webkincstarDatums

    for (const webkincstarDatum of datumsToFetch) {
      try {
        const fetched = await fetchWebkincstarSnapshots({
          datum: webkincstarDatum,
          rawDir: path.join(options.rawDir, 'webkincstar', webkincstarDatum),
          fetchImpl: options.fetchImpl,
          textByReport: options.webkincstarTextByReport
        })

        if (fetched.failures.length > 0) {
          webkincstarSoftFailed = true
          for (const failure of fetched.failures) {
            logWebkincstarSoftFail(
              failure.error instanceof Error
                ? failure.error
                : new Error(String(failure.error))
            )
            console.error(
              `[market-data] WebKincstár report soft-fail: ${failure.reportName} datum=${webkincstarDatum}`
            )
          }
        }

        if (fetched.reports.length === 0) {
          const appendable = fetchFailedCalendarDaysAppendable(
            webkincstarDatum,
            WEBKINCSTAR_REPORTS,
            previous.priceCalendar
          )
          webkincstarFetchFailedDays += appendable.length
          calendarDaysAccum.push(...appendable)
        } else {
          const normalized = normalizeWebkincstarReports(
            fetched.reports.map((r) => r.parsed)
          )
          if (normalized.unmatchedNames.length > 0) {
            console.error(
              `[market-data] WebKincstár unmatched instrument names (soft-skip): ${normalized.unmatchedNames.join(', ')}`
            )
          }
          const overlay = applyWebkincstarQuotes(mergeSnapshotInput, normalized.snapshot, {
            extraSeries: previousSeriesForJoin(previous)
          })
          if (overlay.skippedUnmatched > 0) {
            console.error(
              `[market-data] WebKincstár overlay skipped ${overlay.skippedUnmatched} quote(s) with no catalog series match`
            )
          }
          mergeSnapshotInput = overlay.snapshot
          if (overlay.hasQuotes) webkincstarHasQuotes = true

          const failedReportNames = fetched.failures.map((f) => f.reportName)
          const failedDays = fetchFailedCalendarDaysAppendable(
            webkincstarDatum,
            failedReportNames,
            previous.priceCalendar
          )
          webkincstarFetchFailedDays += failedDays.length
          calendarDaysAccum.push(...normalized.calendarDays, ...failedDays)
        }
      } catch (err) {
        logWebkincstarSoftFail(err)
        webkincstarSoftFailed = true
        const appendable = fetchFailedCalendarDaysAppendable(
          webkincstarDatum,
          WEBKINCSTAR_REPORTS,
          previous.priceCalendar
        )
        webkincstarFetchFailedDays += appendable.length
        calendarDaysAccum.push(...appendable)
      }
    }

    if (calendarDaysAccum.length > 0) {
      priceCalendarUpdate = priceCalendarFileFromDays(calendarDaysAccum, generatedAt)
    }
  }

  let offeringsUpdated = false
  let offeringsSoftFailed = false
  let offeringPdfsDownloaded = 0
  let offeringPdfsPending = 0
  let offeringPdfsParseFailed = 0
  let offeringsByFamily: Partial<Record<FamilyCode, Record<string, OfferingFile>>> | undefined
  let offeringArchiveUpdate: OfferingArchiveFile | null | undefined
  let seriesSaleWindows:
    | Array<{ family: FamilyCode; seriesId: string; saleWindow: SaleWindow }>
    | undefined

  const reparseParseFailed =
    options.reparseParseFailed === true ||
    process.env.MARKET_REPARSE_PARSE_FAILED === '1' ||
    process.env.MARKET_REPARSE_PARSE_FAILED === 'true'

  const shouldFetchOfferings =
    !options.skipOfferings &&
    (Boolean(options.offeringEnvelopesByFamily) || !offlineAkk)

  if (shouldFetchOfferings) {
    try {
      const offeringFamilies = options.offeringEnvelopesByFamily
        ? (Object.keys(options.offeringEnvelopesByFamily) as OfferingFamilyCode[])
        : undefined
      const fetched = await fetchAkkOfferingListings({
        rawDir: path.join(options.rawDir, 'offerings'),
        fetchImpl: options.fetchImpl,
        envelopesByFamily: options.offeringEnvelopesByFamily,
        // Offline fixtures are partial — do not soft-fail-retry missing labels via fetchImpl.
        families: offeringFamilies
      })

      if (fetched.failures.length > 0) {
        offeringsSoftFailed = true
        for (const failure of fetched.failures) {
          logOfferingsSoftFail(
            failure.error instanceof Error
              ? failure.error
              : new Error(String(failure.error))
          )
          console.error(`[market-data] offerings family soft-fail: ${failure.family}`)
        }
      }

      if (fetched.byFamily.length === 0) {
        if (fetched.failures.length > 0) {
          offeringsSoftFailed = true
        }
      } else {
        const listingRows = fetched.byFamily.flatMap((f) =>
          normalizeOfferingEnvelope(f.envelope, f.family)
        )
        const diff = diffOfferingsAgainstArchive(
          listingRows,
          previous.offeringArchive?.documents,
          { reparseParseFailed }
        )

        const knownByUuid = new Map(
          (previous.offeringArchive?.documents ?? []).map((d) => [
            d.pathUuid.toLowerCase(),
            d
          ])
        )
        const transcribedSeriesIds = new Set(
          (previous.offeringArchive?.documents ?? [])
            .filter((d) => d.status === 'transcribed')
            .map((d) => `${d.family}\0${d.seriesId}`)
        )

        // Always index listing rows as listed first; PDF gate upgrades unknowns.
        const archiveUpserts = listingRows
          .map((row) => archiveDocumentFromListing(row, 'listed'))
          .filter((d): d is NonNullable<typeof d> => d != null)

        const offeringUpdates: OfferingFile[] = []

        // Offline fixture runs without a live fetchImpl for PDFs: only download when
        // not purely offline, or when a custom fetchImpl is supplied for tests.
        const shouldDownloadPdfs = !offlineAkk || Boolean(options.fetchImpl)
        if (shouldDownloadPdfs && diff.unknownDocuments.length > 0) {
          const pdfResult = await fetchOfferingPdfsForListings(
            diff.unknownDocuments,
            knownByUuid,
            {
              rawDir: path.join(options.rawDir, 'offerings', 'pdf'),
              fetchImpl: options.fetchImpl,
              reparseParseFailed,
              transcribedSeriesIds
            }
          )
          offeringPdfsDownloaded = pdfResult.downloadedCount
          offeringPdfsPending = pdfResult.pendingCount

          for (const dl of pdfResult.downloaded) {
            try {
              const uuidKey = (dl.row.pathUuid ?? '').toLowerCase()
              const injected = options.offeringPdfTextByUuid?.[uuidKey]
              const text =
                injected != null && injected !== ''
                  ? injected
                  : await pdfBytesToTextLayout(dl.bytes)
              const parsed = parseOfferingPdfText(text)
              const stub = offeringStubFromListing(dl.row, {
                paymentDates: parsed.paymentDates,
                dayCount: parsed.dayCount
              })
              offeringUpdates.push(stub)
              const transcribed = archiveDocumentFromListing(dl.row, 'transcribed', {
                sha256: dl.sha256,
                bytes: dl.bytes.byteLength,
                sourceHost: dl.sourceHost
              })
              if (transcribed) archiveUpserts.push(transcribed)
            } catch (err) {
              offeringPdfsParseFailed += 1
              console.error(
                `[market-data] offering PDF parse failed for ${dl.row.pathUuid}: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
              const failed = archiveDocumentFromListing(dl.row, 'parse_failed', {
                sha256: dl.sha256,
                bytes: dl.bytes.byteLength,
                sourceHost: dl.sourceHost
              })
              if (failed) archiveUpserts.push(failed)
            }
          }

          // Keep pending / download_failed upserts that were not transcribed.
          for (const doc of pdfResult.archiveUpserts) {
            if (doc.status === 'downloaded') continue
            archiveUpserts.push(doc)
          }
        } else if (diff.unknownDocuments.length > 0) {
          // Offline listing fixtures: leave unknowns as listed (no network PDFs).
          offeringPdfsPending = 0
        }

        const previousOfferings: Partial<Record<FamilyCode, Record<string, OfferingFile>>> =
          Object.fromEntries(
            FAMILIES.map((family) => [family, previous.families[family].offerings ?? {}])
          )
        const mergedOfferings = mergeOfferingsState(
          previousOfferings,
          previous.offeringArchive,
          {
            listingRows,
            saleWindowsBySeries: diff.saleWindowsBySeries,
            archiveUpserts,
            offeringUpdates,
            generatedAt
          }
        )
        offeringsByFamily = mergedOfferings.offeringsByFamily
        offeringArchiveUpdate = mergedOfferings.offeringArchive
        seriesSaleWindows = mergedOfferings.seriesSaleWindows
        offeringsUpdated =
          mergedOfferings.offeringsChanged ||
          mergedOfferings.archiveChanged ||
          mergedOfferings.saleWindowsChanged
      }
    } catch (err) {
      logOfferingsSoftFail(err)
      offeringsSoftFailed = true
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
  if (offeringsByFamily !== undefined) {
    mergeOptions.offeringsByFamily = offeringsByFamily
  }
  if (offeringArchiveUpdate !== undefined) {
    mergeOptions.offeringArchive = offeringArchiveUpdate
  }
  if (seriesSaleWindows !== undefined) {
    mergeOptions.seriesSaleWindows = seriesSaleWindows
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
    webkincstarSoftFailed,
    offeringsUpdated,
    offeringsSoftFailed,
    offeringPdfsDownloaded,
    offeringPdfsPending,
    offeringPdfsParseFailed,
    webkincstarFetchFailedDays
  }
}

/** @deprecated Use ingestMarketData */
export const publishMarketData = ingestMarketData
export type PublishOptions = IngestOptions
export type PublishReport = IngestReport
