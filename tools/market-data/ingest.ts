import { combineSnapshots } from './combine.ts'
import { fetchAkkSnapshots } from './fetch-akk.ts'
import { CsrfSession, fetchAllampapirSnapshots } from './fetch-allampapir.ts'
import { fetchKshInflationCsv } from './fetch-ksh-inflation.ts'
import { fetchRetailInterestSnapshots } from './fetch-retail-interest.ts'
import { loadMarketTree, marketRoot, writeMarketTree } from './io.ts'
import { mergeSnapshot, type MergeResult } from './merge.ts'
import { normalizeAkkSnapshots } from './normalize.ts'
import { normalizeAllampapirSnapshots } from './normalize-allampapir.ts'
import { normalizeKshInflationCsv } from './normalize-ksh-inflation.ts'
import { normalizeRetailInterestEnvelope } from './normalize-retail-interest.ts'
import {
  emptyNormalizedByFamily,
  type AkkEnvelope,
  type AllampapirEnvelope,
  type InflationFile,
  type NormalizedSnapshot,
  type RetailInterestFile
} from './types.ts'
import { validateMarketTree } from './validate.ts'
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
  /** Output repo root or path containing data/market/v1 (or the v1 dir itself). */
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
   * previous refs are kept. Live runs refresh retail interest (soft-fail on errors).
   */
  retailInterestEnvelope?: AllampapirEnvelope
  /** Skip only retailInterest fetch/replace (keep previous refs). */
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
  fetchImpl?: typeof fetch
  generatedAt?: string
}

export interface IngestReport extends MergeResult {
  root: string
  marketRoot: string
  dualSource: boolean
  retailInterestUpdated: boolean
  /** True when live retailInterest fetch failed and previous refs were kept. */
  retailInterestSoftFailed: boolean
  inflationUpdated: boolean
}

function emptyAllampapirSnapshot(): NormalizedSnapshot {
  return { asOf: null, byFamily: emptyNormalizedByFamily() }
}

function logRetailInterestSoftFail(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error(
    `[market-data] retailInterest soft-fail; keeping previous refs and continuing price publish: ${message}`
  )
}

/** Fetch (optional) → normalize → combine → merge → validate → write when changed. */
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
  // Dual-source combined rows may rewrite same settleDate vs an ÁKK-only baseline (cutover).
  const mergeOptions: Parameters<typeof mergeSnapshot>[2] = {
    generatedAt,
    allowSameDayRewrite: combined.dualSource
  }
  if (retailInterestUpdate !== undefined) {
    mergeOptions.retailInterest = retailInterestUpdate
  }
  if (inflationUpdate !== undefined) {
    mergeOptions.inflation = inflationUpdate
  }
  const merged = mergeSnapshot(previous, combined.snapshot, mergeOptions)
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
    inflationUpdated: inflationUpdate !== undefined
  }
}

/** @deprecated Use ingestMarketData */
export const publishMarketData = ingestMarketData
export type PublishOptions = IngestOptions
export type PublishReport = IngestReport
