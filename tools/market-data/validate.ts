import { digestCanonical, digestRetailInterest } from './digests.ts'
import { assertSeriesId } from './ids.ts'
import { loadMarketTree } from './io.ts'
import { publishedFamilies, type MarketTreeState } from './merge.ts'
import {
  QUOTE_COLS,
  REQUIRED_FAMILIES,
  RETAIL_INTEREST_REF_PATH,
  SCHEMA_VERSION,
  type FamilyCode,
  type ManifestFile
} from './types.ts'

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
  const families = tree.manifest.families
  for (const family of families) {
    const fam = tree.families[family]
    if (!fam) {
      throw new ValidateError(`Missing family state for ${family}`)
    }
    if (fam.series.schemaVersion !== SCHEMA_VERSION) {
      throw new ValidateError(`Bad series schemaVersion for ${family}`)
    }
    if (fam.series.family !== family) {
      throw new ValidateError(`series.family mismatch for ${family}`)
    }
    const required = (REQUIRED_FAMILIES as readonly string[]).includes(family)
    if (required && Object.keys(fam.latest.quotes).length === 0) {
      throw new ValidateError(`Required family ${family} has empty latest.json`)
    }
    const seriesIds = new Set<string>()
    for (const s of fam.series.series) {
      try {
        assertSeriesId(s.id)
      } catch (err) {
        throw new ValidateError(
          `Non-canonical series id in ${family}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      seriesIds.add(s.id)
    }
    for (const [id, q] of Object.entries(fam.quotes)) {
      try {
        assertSeriesId(id)
      } catch (err) {
        throw new ValidateError(
          `Non-canonical quote key in ${family}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      if (q.id !== id) throw new ValidateError(`Quote id mismatch ${family}/${id}`)
      if (q.family !== family) throw new ValidateError(`Quote family mismatch ${family}/${id}`)
      if (!seriesIds.has(id)) {
        throw new ValidateError(`Quote history for ${family}/${id} missing from series.json`)
      }
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
  if (tree.retailInterest) {
    validateRetailInterest(tree)
  } else if (tree.manifest.refs?.retailInterest || tree.manifest.digests[RETAIL_INTEREST_REF_PATH]) {
    throw new ValidateError('manifest references retail-interest but file is missing')
  }
  verifyManifestDigests(tree)
}

function validateRetailInterest(tree: MarketTreeState): void {
  const file = tree.retailInterest
  if (!file) return
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidateError('retail-interest schemaVersion must be 1')
  }
  if (!Array.isArray(file.rows)) {
    throw new ValidateError('retail-interest.rows must be an array')
  }
  for (const row of file.rows) {
    try {
      assertSeriesId(row.id)
    } catch (err) {
      throw new ValidateError(
        `Non-canonical retail-interest id: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    if (!row.from || !/^\d{4}-\d{2}-\d{2}$/.test(row.from)) {
      throw new ValidateError(`Bad retail-interest from date for ${row.id}`)
    }
    if (row.to != null && !/^\d{4}-\d{2}-\d{2}$/.test(row.to)) {
      throw new ValidateError(`Bad retail-interest to date for ${row.id}`)
    }
    if (typeof row.offered !== 'boolean') {
      throw new ValidateError(`retail-interest offered must be boolean for ${row.id}`)
    }
  }
  const refPath = tree.manifest?.refs?.retailInterest
  if (refPath && refPath !== RETAIL_INTEREST_REF_PATH) {
    throw new ValidateError(
      `manifest.refs.retailInterest must be ${RETAIL_INTEREST_REF_PATH}, got ${refPath}`
    )
  }
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
  const families = tree.manifest?.families ?? publishedFamilies(tree)
  for (const family of families) {
    const fam = tree.families[family]
    digests[`families/${family}/series.json`] = digestCanonical(fam.series)
    digests[`families/${family}/latest.json`] = digestCanonical(fam.latest)
    for (const [id, q] of Object.entries(fam.quotes)) {
      digests[`families/${family}/quotes/${id}.json`] = digestCanonical(q)
    }
  }
  if (tree.retailInterest) {
    digests[RETAIL_INTEREST_REF_PATH] = digestRetailInterest(tree.retailInterest)
  }
  return digests
}

/**
 * Defense-in-depth for the publish job: load a tree from disk, run schema checks,
 * and verify manifest digests before commit/push. Does not contact ÁKK or allampapir.
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
  for (const family of REQUIRED_FAMILIES) {
    if (!manifest.families.includes(family)) {
      throw new ValidateError(`manifest missing required family ${family}`)
    }
  }
  for (const family of manifest.families) {
    if (!manifest.paths[family as FamilyCode]) {
      throw new ValidateError(`manifest.paths missing ${family}`)
    }
  }
}
