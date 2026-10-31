import { fetchAkkSnapshots } from './fetch-akk.ts'
import { loadMarketTree, marketRoot, writeMarketTree } from './io.ts'
import { mergeSnapshot, type MergeResult } from './merge.ts'
import { normalizeAkkSnapshots } from './normalize.ts'
import type { AkkEnvelope } from './types.ts'
import { validateMarketTree } from './validate.ts'

export const EXIT_UPDATED = 0
export const EXIT_ERROR = 1
export const EXIT_UNCHANGED = 2

export interface PublishOptions {
  /** Repo root or path containing data/market/v1 (or the v1 dir itself). */
  root: string
  rawDir: string
  /** Skip network; use provided envelopes (tests / offline). */
  catalog?: AkkEnvelope
  networkRates?: AkkEnvelope
  fetchImpl?: typeof fetch
  generatedAt?: string
}

export interface PublishReport extends MergeResult {
  root: string
  marketRoot: string
}

export async function publishMarketData(options: PublishOptions): Promise<PublishReport> {
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
  const previous = await loadMarketTree(options.root)
  const merged = mergeSnapshot(previous, snapshot, { generatedAt: options.generatedAt })
  validateMarketTree(merged.tree)

  if (merged.changed) {
    await writeMarketTree(options.root, merged.tree)
  }

  return {
    ...merged,
    root: options.root,
    marketRoot: marketRoot(options.root)
  }
}
