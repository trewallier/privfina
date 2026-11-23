import { combineSnapshots } from './combine.ts'
import { applyWebkincstarQuotes } from './combine-webkincstar.ts'
import { fetchAkkSnapshots } from './fetch-akk.ts'
import { fetchAkkOfferingListings } from './fetch-akk-offerings.ts'
import { CsrfSession, fetchAllampapirSnapshots } from './fetch-allampapir.ts'
import { fetchKshInflationCsv } from './fetch-ksh-inflation.ts'
import { fetchMnbBuborXls } from './fetch-mnb-bubor.ts'
import {
  discoverSettlementCalendarFiles,
  fetchMnbSettlementCalendars,
  pickLatestSettlementCalendarFile
} from './fetch-mnb-settlement-calendar.ts'
import { fetchRetailInterestSnapshots } from './fetch-retail-interest.ts'
import {
  budapestTodayIso,
  budapestYesterdayIso,
  fetchWebkincstarSnapshots,
  mergeWebkincstarFetchDatums,
  oldestDurablePriceCalendarDatum,
  resolveWebkincstarHistoricalBackfillDatums,
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
import { couponsFileFromMakPaymentTable } from './mak-offering-coupons.ts'
import {
  classifyOfferingPdfText,
  extractIssueDate,
  parseOfferingPdfText
} from './parse-offering-pdf.ts'
import { pdfBytesToTextLayout } from './pdf-text.ts'
import { priceCalendarFileFromDays } from './merge-price-calendar.ts'
import { normalizeAkkSnapshots } from './normalize.ts'
import { normalizeAllampapirSnapshots } from './normalize-allampapir.ts'
import { normalizeKshInflationCsv } from './normalize-ksh-inflation.ts'
import { normalizeMnbBuborXls } from './normalize-mnb-bubor.ts'
import { normalizeSettlementCalendars } from './normalize-mnb-settlement-calendar.ts'
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
  type BuborFile,
  type InflationFile,
  type NormalizedSnapshot,
  type CouponsFile,
  type OfferingArchiveFile,
  type OfferingFile,
  type PriceCalendarFile,
  type RetailInterestFile,
  type SaleWindow,
  type SeriesRecord,
  type SettlementCalendarFile
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
   * Offline MNB bubor2.xls path. When omitted with fixture ÁKK / skip,
   * previous bubor refs are kept. Live runs always fetch MNB XLS (hard-fail).
   */
  buborXlsPath?: string
  /** Raw XLS bytes (tests); takes precedence over buborXlsPath. */
  buborXlsBytes?: Uint8Array
  /** Skip only BUBOR fetch/merge (keep previous refs). */
  skipBubor?: boolean
  /**
   * Offline directory with hub.html + yearly XLSX files (ADR 0046 tests).
   * When omitted with fixture ÁKK / skip, previous settlement-calendar refs are kept.
   * Live runs always fetch the MNB hub + XLSX (hard-fail).
   */
  settlementCalendarDir?: string
  /**
   * Explicit **required** year list for settlement-calendar fetch (tests).
   * When set, every listed year hard-fails if missing and optional years are
   * empty. When omitted, defaults are required `[current−1, current]` and
   * optional `[current+1, …tipYears]` (soft-skip missing optional; tip kept).
   */
  settlementCalendarYears?: number[]
  /** Skip only settlement-calendar fetch/merge (keep previous refs). */
  skipSettlementCalendar?: boolean
  /**
   * Europe/Budapest YYYY-MM-DD for WebKincstár PDFs. Defaults to yesterday.
   * Ignored when `webkincstarDatums` is non-empty (ROADMAP §6m historical loop).
   */
  webkincstarDatum?: string
  /**
   * Explicit multi-day WebKincstár fetch list (ROADMAP §6m). When set, replaces
   * the default yesterday + lookback (and single `--datum`) selection.
   */
  webkincstarDatums?: string[]
  /**
   * Subset of WebKincstár reports to fetch (defaults to full ADR 0039 / 0042 list).
   * Operator one-shot §6m CLI may pass a subset (e.g. `_20633_arfolyam_mak` only).
   */
  webkincstarReports?: readonly WebkincstarReportName[]
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
  buborUpdated: boolean
  settlementCalendarUpdated: boolean
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
  /** PDF downloads classified as no-schedule (KÖZLEMÉNY / amendment) this run. */
  offeringPdfsSkippedNoSchedule: number
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

  /** undefined = keep previous; file = append-first merge. */
  let buborUpdate: BuborFile | undefined
  if (options.buborXlsBytes) {
    buborUpdate = normalizeMnbBuborXls(options.buborXlsBytes, { generatedAt })
  } else if (options.buborXlsPath) {
    const bytes = new Uint8Array(await readFile(options.buborXlsPath))
    buborUpdate = normalizeMnbBuborXls(bytes, { generatedAt })
  } else if (!options.skipBubor && !offlineAkk) {
    // Live / non-fixture runs: hard-fail on MNB fetch or normalize (ADR 0045).
    const fetched = await fetchMnbBuborXls({
      rawDir: path.join(options.rawDir, 'mnb'),
      fetchImpl: options.fetchImpl
    })
    buborUpdate = normalizeMnbBuborXls(fetched.xlsBytes, {
      generatedAt,
      xlsUrl: fetched.xlsUrl
    })
  }

  const combined = combineSnapshots(akkSnapshot, allampapirSnapshot)
  const previous = await loadMarketTree(options.previousRoot ?? options.root)

  /** undefined = keep previous; file = year-replace merge (ADR 0046). */
  let settlementCalendarUpdate: SettlementCalendarFile | undefined
  if (!options.skipSettlementCalendar) {
    const tipYears = previous.settlementCalendar?.years.map((y) => y.year) ?? []
    const currentYear = Number(budapestTodayIso().slice(0, 4))
    // Required: current + prior year (must be on hub). Optional: next year + tip years
    // not already required — missing optional years soft-skip so tip blocks stay (ADR 0046).
    const requiredYears =
      options.settlementCalendarYears ?? [currentYear - 1, currentYear]
    const optionalYears = options.settlementCalendarYears
      ? []
      : [...new Set([currentYear + 1, ...tipYears])].filter((y) => !requiredYears.includes(y))

    if (options.settlementCalendarDir) {
      const hubHtml = await readFile(
        path.join(options.settlementCalendarDir, 'hub.html'),
        'utf8'
      )
      const xlsxByFileName: Record<string, Uint8Array> = {}
      const discovered = discoverSettlementCalendarFiles(hubHtml)
      const wantYears = [...new Set([...requiredYears, ...optionalYears])]
      for (const year of wantYears) {
        const pick = pickLatestSettlementCalendarFile(discovered, year)
        if (!pick) continue
        const bytes = new Uint8Array(
          await readFile(path.join(options.settlementCalendarDir, pick.fileName))
        )
        xlsxByFileName[pick.fileName] = bytes
      }
      const fetched = await fetchMnbSettlementCalendars({
        rawDir: path.join(options.rawDir, 'mnb-settlement'),
        requiredYears,
        optionalYears,
        hubHtml,
        xlsxByFileName,
        fetchImpl: options.fetchImpl
      })
      settlementCalendarUpdate = normalizeSettlementCalendars(fetched.fetched, {
        generatedAt,
        hubUrl: fetched.hubUrl
      })
    } else if (!offlineAkk) {
      // Live / non-fixture runs: hard-fail hub/required years / normalize; optional soft-skip.
      const fetched = await fetchMnbSettlementCalendars({
        rawDir: path.join(options.rawDir, 'mnb-settlement'),
        requiredYears,
        optionalYears,
        fetchImpl: options.fetchImpl
      })
      settlementCalendarUpdate = normalizeSettlementCalendars(fetched.fetched, {
        generatedAt,
        hubUrl: fetched.hubUrl
      })
    }
  }

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

  const webkincstarReports = options.webkincstarReports ?? WEBKINCSTAR_REPORTS
  const webkincstarPrimaryDatum = options.webkincstarDatum ?? budapestYesterdayIso()
  // Explicit multi-day list (§6m CLI) wins; else single --datum; else tip path
  // (yesterday + ≤3 weekday lookback) ∪ rolling historical window (6 days before
  // oldest durable price-calendar datum, floor 1990-01-01).
  const webkincstarDatums =
    Array.isArray(options.webkincstarDatums) && options.webkincstarDatums.length > 0
      ? options.webkincstarDatums
      : options.webkincstarDatum
        ? [options.webkincstarDatum]
        : mergeWebkincstarFetchDatums(
            resolveWebkincstarLookbackDatums({
              primaryDatum: webkincstarPrimaryDatum,
              previousDays: previous.priceCalendar?.days,
              reports: webkincstarReports
            }),
            resolveWebkincstarHistoricalBackfillDatums({
              oldestDatum: oldestDurablePriceCalendarDatum(
                previous.priceCalendar?.days,
                webkincstarReports
              ),
              previousDays: previous.priceCalendar?.days,
              reports: webkincstarReports
            })
          )
  const shouldFetchWebkincstar =
    !options.skipWebkincstar &&
    (Boolean(options.webkincstarTextByReport) || !offlineAkk)

  if (shouldFetchWebkincstar) {
    const calendarDaysAccum: PriceCalendarDay[] = []
    // Offline textByReport fixtures only cover one datum — fetch that primary once
    // unless an explicit multi-day / --datum list was provided.
    const datumsToFetch =
      options.webkincstarTextByReport &&
      !options.webkincstarDatum &&
      !(Array.isArray(options.webkincstarDatums) && options.webkincstarDatums.length > 0)
        ? [webkincstarPrimaryDatum]
        : webkincstarDatums

    for (const webkincstarDatum of datumsToFetch) {
      try {
        const fetched = await fetchWebkincstarSnapshots({
          datum: webkincstarDatum,
          rawDir: path.join(options.rawDir, 'webkincstar', webkincstarDatum),
          fetchImpl: options.fetchImpl,
          textByReport: options.webkincstarTextByReport,
          reports: webkincstarReports
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
            webkincstarReports,
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
          webkincstarReports,
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
  let offeringPdfsSkippedNoSchedule = 0
  let offeringsByFamily: Partial<Record<FamilyCode, Record<string, OfferingFile>>> | undefined
  let offeringArchiveUpdate: OfferingArchiveFile | null | undefined
  let seriesSaleWindows:
    | Array<{ family: FamilyCode; seriesId: string; saleWindow: SaleWindow }>
    | undefined
  /** MÁK FIX paymentRates → coupons/<id>.json (never FLOAT inventions). */
  let couponUpsertsByFamily: Partial<Record<FamilyCode, Record<string, CouponsFile>>> | undefined

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
        const couponUpserts: Partial<Record<FamilyCode, Record<string, CouponsFile>>> = {}

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
              if (classifyOfferingPdfText(text) === 'skip_no_schedule') {
                offeringPdfsSkippedNoSchedule += 1
                console.error(
                  `[market-data] offering PDF skipped (no schedule) for ${dl.row.pathUuid}`
                )
                const skipped = archiveDocumentFromListing(dl.row, 'skipped_no_schedule', {
                  sha256: dl.sha256,
                  bytes: dl.bytes.byteLength,
                  sourceHost: dl.sourceHost
                })
                if (skipped) archiveUpserts.push(skipped)
                continue
              }
              const parsed = parseOfferingPdfText(text)
              const stub = offeringStubFromListing(dl.row, {
                paymentDates: parsed.paymentDates,
                dayCount: parsed.dayCount
              })
              offeringUpdates.push(stub)
              // ADR 0044: FIX paymentRates → coupons/<id>.json; FLOAT all-null → skip.
              if (
                dl.row.family === 'ktv' &&
                Array.isArray(parsed.paymentRates) &&
                parsed.paymentDates.length > 0
              ) {
                const issueDate =
                  extractIssueDate(text) ||
                  previous.families.ktv?.series.series.find((s) => s.id === dl.row.seriesId)
                    ?.issue ||
                  null
                const coupons = couponsFileFromMakPaymentTable({
                  family: 'ktv',
                  seriesId: dl.row.seriesId,
                  issueDate,
                  paymentDates: parsed.paymentDates,
                  paymentRates: parsed.paymentRates
                })
                if (coupons) {
                  if (!couponUpserts.ktv) couponUpserts.ktv = {}
                  couponUpserts.ktv[dl.row.seriesId] = coupons
                }
              }
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
        if (Object.keys(couponUpserts).length > 0) {
          couponUpsertsByFamily = couponUpserts
        }
        offeringsUpdated =
          mergedOfferings.offeringsChanged ||
          mergedOfferings.archiveChanged ||
          mergedOfferings.saleWindowsChanged ||
          Boolean(couponUpsertsByFamily)
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
  if (buborUpdate !== undefined) {
    mergeOptions.bubor = buborUpdate
  }
  if (settlementCalendarUpdate !== undefined) {
    mergeOptions.settlementCalendar = settlementCalendarUpdate
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
  if (couponUpsertsByFamily !== undefined) {
    mergeOptions.couponUpsertsByFamily = couponUpsertsByFamily
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
    buborUpdated: buborUpdate !== undefined,
    settlementCalendarUpdated: settlementCalendarUpdate !== undefined,
    webkincstarUpdated: priceCalendarUpdate !== undefined,
    webkincstarSoftFailed,
    offeringsUpdated,
    offeringsSoftFailed,
    offeringPdfsDownloaded,
    offeringPdfsPending,
    offeringPdfsParseFailed,
    offeringPdfsSkippedNoSchedule,
    webkincstarFetchFailedDays
  }
}

/** @deprecated Use ingestMarketData */
export const publishMarketData = ingestMarketData
export type PublishOptions = IngestOptions
export type PublishReport = IngestReport
