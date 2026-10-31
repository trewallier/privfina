import { digestCanonical } from './digests.ts'
import { loadMarketTree } from './io.ts'
import type { MarketTreeState } from './merge.ts'
import { FAMILIES, QUOTE_COLS, SCHEMA_VERSION, type ManifestFile } from './types.ts'

export class ValidateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidateError'
  }
}

export function validateMarketTree(tree: MarketTreeState): void {
  if (!tree.manifest) {
    throw new ValidateError('Missing manifest')
  }
  validateManifest(tree.manifest)
  for (const family of FAMILIES) {
    const fam = tree.families[family]
    if (fam.series.schemaVersion !== SCHEMA_VERSION) {
      throw new ValidateError(`Bad series schemaVersion for ${family}`)
    }
    if (fam.series.family !== family) {
      throw new ValidateError(`series.family mismatch for ${family}`)
    }
    if (Object.keys(fam.latest.quotes).length === 0) {
      throw new ValidateError(`Required family ${family} has empty latest.json`)
    }
    for (const [id, q] of Object.entries(fam.quotes)) {
      if (q.id !== id) throw new ValidateError(`Quote id mismatch ${family}/${id}`)
      if (q.family !== family) throw new ValidateError(`Quote family mismatch ${family}/${id}`)
      if (q.cols.join(',') !== QUOTE_COLS.join(',')) {
        throw new ValidateError(`Quote cols mismatch ${family}/${id}`)
      }
      for (const row of q.rows) {
        if (!row[0] || !/^\d{4}-\d{2}-\d{2}$/.test(row[0])) {
          throw new ValidateError(`Bad quote date in ${family}/${id}`)
        }
      }
    }
  }
  verifyManifestDigests(tree)
}

/** Recompute file digests and require an exact match to manifest.digests. */
export function verifyManifestDigests(tree: MarketTreeState): void {
  if (!tree.manifest) {
    throw new ValidateError('Missing manifest')
  }
  const expected = computeTreeDigests(tree)
  const actual = tree.manifest.digests
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
  for (const key of keys) {
    if (expected[key] !== actual[key]) {
      throw new ValidateError(
        `Digest mismatch for ${key}: manifest=${actual[key] ?? 'missing'} recomputed=${expected[key] ?? 'missing'}`
      )
    }
  }
}

export function computeTreeDigests(tree: MarketTreeState): Record<string, string> {
  const digests: Record<string, string> = {}
  for (const family of FAMILIES) {
    const fam = tree.families[family]
    digests[`families/${family}/series.json`] = digestCanonical(fam.series)
    digests[`families/${family}/latest.json`] = digestCanonical(fam.latest)
    for (const [id, q] of Object.entries(fam.quotes)) {
      digests[`families/${family}/quotes/${id}.json`] = digestCanonical(q)
    }
  }
  return digests
}

/**
 * Defense-in-depth for the publish job: load a tree from disk, run schema checks,
 * and verify manifest digests before commit/push. Does not contact ÁKK.
 */
export async function assertPublishedTree(root: string): Promise<MarketTreeState> {
  const tree = await loadMarketTree(root)
  validateMarketTree(tree)
  return tree
}

function validateManifest(manifest: ManifestFile): void {
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidateError('manifest.schemaVersion must be 1')
  }
  for (const family of FAMILIES) {
    if (!manifest.families.includes(family)) {
      throw new ValidateError(`manifest missing family ${family}`)
    }
    if (!manifest.paths[family]) {
      throw new ValidateError(`manifest.paths missing ${family}`)
    }
  }
}
