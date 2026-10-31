import { fetchAkkSnapshots } from './fetch-akk.ts'
import { loadMarketTree, marketRoot, writeMarketTree } from './io.ts'
import { mergeSnapshot, type MergeResult } from './merge.ts'
import { normalizeAkkSnapshots } from './normalize.ts'
import type { AkkEnvelope } from './types.ts'
import { validateMarketTree } from './validate.ts'

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
  /** Skip network; use provided envelopes (tests / offline). */
  catalog?: AkkEnvelope
  networkRates?: AkkEnvelope
  fetchImpl?: typeof fetch
  generatedAt?: string
}

export interface IngestReport extends MergeResult {
  root: string
  marketRoot: string
}

/** Fetch (optional) → normalize → merge → validate → write when changed. */
export async function ingestMarketData(options: IngestOptions): Promise<IngestReport> {
  let catalog = options.catalog
  let networkRates = options.networkRates

  if (!catalog || !networkRates) {
    const fetched = await fetchAkkSnapshots({
      rawDir: options.rawDir,
      fetchImpl: options.fetchImpl
    })
    catalog = fetched.catalog
    networkRates = fetched.networkRates
  }

  const snapshot = normalizeAkkSnapshots(catalog, networkRates)
  const previous = await loadMarketTree(options.previousRoot ?? options.root)
  const merged = mergeSnapshot(previous, snapshot, { generatedAt: options.generatedAt })
  validateMarketTree(merged.tree)

  if (merged.changed) {
    await writeMarketTree(options.root, merged.tree)
    // Defense-in-depth: re-load and validate what we wrote.
    const written = await loadMarketTree(options.root)
    validateMarketTree(written)
  }

  return {
    ...merged,
    root: options.root,
    marketRoot: marketRoot(options.root)
  }
}

/** @deprecated Use ingestMarketData */
export const publishMarketData = ingestMarketData
export type PublishOptions = IngestOptions
export type PublishReport = IngestReport
