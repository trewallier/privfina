import { mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { canonicalJson } from './digests.ts'
import { assertSeriesId } from './ids.ts'
import { emptyMarketTree, type FamilyTreeState, type MarketTreeState } from './merge.ts'
import {
  coerceRetailInterestFile,
  joinRetailInterestToCoupons
} from './normalize-retail-interest.ts'
import {
  FAMILIES,
  INFLATION_REF_PATH,
  PRICE_CALENDAR_REF_PATH,
  type PriceCalendarFile,
  MARKET_PATH_SEGMENT,
  QUOTE_COLS,
  COUPON_COLS,
  SCHEMA_VERSION,
  type CouponsFile,
  type FamilyCode,
  type InflationFile,
  type LatestFile,
  type ManifestFile,
  type QuotesFile,
  type RetailInterestFile,
  type SeriesFile,
  type SeriesRecord
} from './types.ts'

/** Basename under `data/market/` for the legacy schemaVersion 1 tree. */
export const LEGACY_MARKET_PATH_SEGMENT = 'v1' as const

export function marketRoot(repoOrDataRoot: string): string {
  // Accept either repo root or .../data/market/v2
  if (path.basename(repoOrDataRoot) === MARKET_PATH_SEGMENT) return repoOrDataRoot
  return path.join(repoOrDataRoot, 'data', 'market', MARKET_PATH_SEGMENT)
}

export function marketRootV1(repoOrDataRoot: string): string {
  if (path.basename(repoOrDataRoot) === LEGACY_MARKET_PATH_SEGMENT) return repoOrDataRoot
  // When pointed at the v2 dir itself, sibling v1 lives next to it.
  if (path.basename(repoOrDataRoot) === MARKET_PATH_SEGMENT) {
    return path.join(path.dirname(repoOrDataRoot), LEGACY_MARKET_PATH_SEGMENT)
  }
  return path.join(repoOrDataRoot, 'data', 'market', LEGACY_MARKET_PATH_SEGMENT)
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const text = await readFile(filePath, 'utf8')
    return JSON.parse(text) as T
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    throw err
  }
}

function stripPrem(series: SeriesRecord[]): SeriesRecord[] {
  return series.map((s) => {
    const copy = { ...s } as SeriesRecord & { prem?: unknown }
    delete copy.prem
    return copy
  })
}

function bumpSchemaVersion<T extends { schemaVersion: number }>(file: T): T {
  return { ...file, schemaVersion: SCHEMA_VERSION }
}

function v2TreeHasContent(tree: MarketTreeState): boolean {
  if (tree.manifest) return true
  for (const family of FAMILIES) {
    const fam = tree.families[family]
    if (fam.series.series.length > 0) return true
    if (Object.keys(fam.quotes).length > 0) return true
    if (Object.keys(fam.coupons).length > 0) return true
  }
  return tree.inflation != null || tree.priceCalendar != null
}

async function loadFamilyDir(
  famDir: string,
  family: FamilyCode,
  options?: { dropPrem?: boolean; schemaVersion?: typeof SCHEMA_VERSION }
): Promise<FamilyTreeState> {
  const schemaVersion = options?.schemaVersion ?? SCHEMA_VERSION
  const seriesRaw =
    (await readJsonIfExists<SeriesFile>(path.join(famDir, 'series.json'))) ??
    ({ schemaVersion, family, series: [] } as SeriesFile)
  const series: SeriesFile = {
    schemaVersion,
    family,
    series: options?.dropPrem ? stripPrem(seriesRaw.series || []) : [...(seriesRaw.series || [])]
  }
  const latestRaw =
    (await readJsonIfExists<LatestFile>(path.join(famDir, 'latest.json'))) ??
    ({ schemaVersion, asOf: null, quotes: {} } as LatestFile)
  const latest: LatestFile = {
    schemaVersion,
    asOf: latestRaw.asOf ?? null,
    quotes: { ...(latestRaw.quotes || {}) }
  }
  const quotes: Record<string, QuotesFile> = {}
  const quotesDir = path.join(famDir, 'quotes')
  try {
    const files = await readdir(quotesDir)
    for (const name of files) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -'.json'.length)
      assertSeriesId(id)
      const q = await readJsonIfExists<QuotesFile>(path.join(quotesDir, name))
      if (!q) continue
      if (q.id !== id) {
        throw new Error(`Quote file ${name} id mismatch: body.id=${q.id}`)
      }
      quotes[id] = {
        schemaVersion,
        id: q.id,
        family: q.family || family,
        cols: q.cols?.length === QUOTE_COLS.length ? (q.cols as typeof QUOTE_COLS) : [...QUOTE_COLS],
        rows: q.rows || []
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw err
  }
  const coupons: Record<string, CouponsFile> = {}
  const couponsDir = path.join(famDir, 'coupons')
  try {
    const files = await readdir(couponsDir)
    for (const name of files) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -'.json'.length)
      assertSeriesId(id)
      const c = await readJsonIfExists<CouponsFile>(path.join(couponsDir, name))
      if (!c) continue
      if (c.id !== id) {
        throw new Error(`Coupon file ${name} id mismatch: body.id=${c.id}`)
      }
      coupons[id] = {
        schemaVersion,
        id: c.id,
        family: c.family || family,
        cols: [...COUPON_COLS],
        rows: c.rows || []
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw err
  }
  return { series, latest, quotes, coupons }
}

async function loadTreeAtPath(
  rootDir: string,
  options?: { dropPrem?: boolean; forceSchemaVersion?: typeof SCHEMA_VERSION }
): Promise<MarketTreeState> {
  const tree = emptyMarketTree()
  const manifest = await readJsonIfExists<ManifestFile>(path.join(rootDir, 'manifest.json'))
  tree.manifest = manifest
    ? options?.forceSchemaVersion
      ? bumpSchemaVersion(manifest)
      : manifest
    : null

  for (const family of FAMILIES) {
    const famDir = path.join(rootDir, 'families', family)
    tree.families[family] = await loadFamilyDir(famDir, family, {
      dropPrem: options?.dropPrem,
      schemaVersion: options?.forceSchemaVersion
    })
  }

  const inflationPath = tree.manifest?.refs?.inflation ?? INFLATION_REF_PATH
  const inflation = await readJsonIfExists<InflationFile>(path.join(rootDir, inflationPath))
  tree.inflation = inflation
    ? options?.forceSchemaVersion
      ? bumpSchemaVersion(inflation)
      : inflation
    : null

  const priceCalendarPath =
    tree.manifest?.refs?.priceCalendar ?? PRICE_CALENDAR_REF_PATH
  const priceCalendar = await readJsonIfExists<PriceCalendarFile>(
    path.join(rootDir, priceCalendarPath)
  )
  tree.priceCalendar = priceCalendar
    ? options?.forceSchemaVersion
      ? bumpSchemaVersion(priceCalendar)
      : priceCalendar
    : null

  // Internal-only: load flat retail-interest when present (v1 tip) for coupon lift.
  // Coerce ADR 0036 singular `rate` → ADR 0038 `rates` so join/merge never see undefined.
  const retailPath = tree.manifest?.refs?.retailInterest ?? 'refs/retail-interest.json'
  const retail = await readJsonIfExists<RetailInterestFile>(path.join(rootDir, retailPath))
  if (retail) {
    tree.retailInterest = coerceRetailInterestFile(retail)
  }
  return tree
}

/**
 * One-shot lift of a schemaVersion 1 `data/market/v1/` tip into an in-memory v2 tree:
 * copy quotes/series/latest, drop `prem`, bump schemaVersion, migrate inflation,
 * join flat retail-interest into per-series coupons when available.
 */
export async function liftV1MarketTree(repoOrDataRoot: string): Promise<MarketTreeState | null> {
  const v1 = marketRootV1(repoOrDataRoot)
  const manifest = await readJsonIfExists<ManifestFile>(path.join(v1, 'manifest.json'))
  if (!manifest) return null

  const lifted = await loadTreeAtPath(v1, { dropPrem: true, forceSchemaVersion: SCHEMA_VERSION })

  // Strip deprecated flat retailInterest path from manifest refs (coupons carry the data).
  if (lifted.manifest?.refs) {
    const { retailInterest: _drop, ...rest } = lifted.manifest.refs
    lifted.manifest.refs = Object.keys(rest).length > 0 ? rest : undefined
  }

  if (lifted.retailInterest) {
    const seriesByFamily: Partial<Record<FamilyCode, SeriesRecord[]>> = {}
    for (const family of FAMILIES) {
      seriesByFamily[family] = lifted.families[family].series.series
    }
    const joined = joinRetailInterestToCoupons(lifted.retailInterest, seriesByFamily)
    for (const family of FAMILIES) {
      const fromJoin = joined.couponsByFamily[family] ?? {}
      lifted.families[family].coupons = Object.fromEntries(
        Object.entries(fromJoin).map(([id, file]) => [id, { ...file, schemaVersion: SCHEMA_VERSION }])
      )
      lifted.families[family].series = {
        schemaVersion: SCHEMA_VERSION,
        family,
        series: lifted.families[family].series.series.map((s) => {
          const copy = { ...s }
          if (s.id in joined.offeredById) {
            copy.offered = joined.offeredById[s.id]
          }
          return copy
        })
      }
    }
  }

  // Manifest digests are rebuilt on the next merge; clear stale v1 digests so the
  // first ingest always treats the lifted baseline as needing a fresh publish.
  if (lifted.manifest) {
    lifted.manifest = {
      ...lifted.manifest,
      schemaVersion: SCHEMA_VERSION,
      digests: {}
    }
  }

  console.error(
    '[market-data] lifted schemaVersion 1 baseline from data/market/v1/ into v2 (quotes retained; prem dropped; coupons from retail-interest when present)'
  )
  return lifted
}

export async function loadMarketTree(root: string): Promise<MarketTreeState> {
  const v2 = marketRoot(root)
  const tree = await loadTreeAtPath(v2)
  if (v2TreeHasContent(tree)) {
    return tree
  }
  const lifted = await liftV1MarketTree(root)
  return lifted ?? tree
}

async function listJsonBasenames(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir)
    return files.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length))
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return []
    throw err
  }
}

/**
 * Write the published tree and prune orphan quote/coupon JSON files that are no
 * longer in the in-memory tree (push overlays tip otherwise leave ghosts that
 * break digests/validate when the join set shrinks).
 */
export async function writeMarketTree(root: string, tree: MarketTreeState): Promise<void> {
  const v2 = marketRoot(root)
  await mkdir(v2, { recursive: true })
  if (!tree.manifest) {
    throw new Error('Cannot write market tree without manifest')
  }
  await writeFile(path.join(v2, 'manifest.json'), canonicalJson(tree.manifest), 'utf8')

  for (const family of tree.manifest.families) {
    await writeFamily(v2, family, tree.families[family])
  }

  // Drop family folders that are no longer listed (rare; keep when still on disk empty).
  // Prefer pruning quote/coupon orphans inside written families.

  if (tree.inflation) {
    const rel = tree.manifest.refs?.inflation ?? INFLATION_REF_PATH
    const abs = path.join(v2, rel)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, canonicalJson(tree.inflation), 'utf8')
  }

  if (tree.priceCalendar) {
    const rel = tree.manifest.refs?.priceCalendar ?? PRICE_CALENDAR_REF_PATH
    const abs = path.join(v2, rel)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, canonicalJson(tree.priceCalendar), 'utf8')
  }

  // Never re-publish flat retail-interest under v2.
  const legacyRetail = path.join(v2, 'refs', 'retail-interest.json')
  try {
    await unlink(legacyRetail)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw err
  }
}

async function pruneOrphans(
  dir: string,
  keepIds: Set<string>
): Promise<void> {
  const existing = await listJsonBasenames(dir)
  for (const id of existing) {
    if (keepIds.has(id)) continue
    await unlink(path.join(dir, `${id}.json`))
  }
}

async function writeFamily(v2: string, family: FamilyCode, fam: FamilyTreeState): Promise<void> {
  const famDir = path.join(v2, 'families', family)
  const quotesDir = path.join(famDir, 'quotes')
  const couponsDir = path.join(famDir, 'coupons')
  await mkdir(quotesDir, { recursive: true })
  await mkdir(couponsDir, { recursive: true })
  await writeFile(path.join(famDir, 'series.json'), canonicalJson(fam.series), 'utf8')
  await writeFile(path.join(famDir, 'latest.json'), canonicalJson(fam.latest), 'utf8')
  const quoteIds = new Set<string>()
  for (const [id, q] of Object.entries(fam.quotes)) {
    assertSeriesId(id)
    if (q.id !== id) {
      throw new Error(`Quote map key ${id} !== body.id ${q.id}`)
    }
    if (q.cols.length !== QUOTE_COLS.length) {
      throw new Error(`Invalid quote cols for ${family}/${id}`)
    }
    quoteIds.add(id)
    await writeFile(path.join(quotesDir, `${id}.json`), canonicalJson(q), 'utf8')
  }
  await pruneOrphans(quotesDir, quoteIds)

  const couponIds = new Set<string>()
  for (const [id, c] of Object.entries(fam.coupons)) {
    assertSeriesId(id)
    if (c.id !== id) {
      throw new Error(`Coupon map key ${id} !== body.id ${c.id}`)
    }
    if (c.cols.join(',') !== COUPON_COLS.join(',')) {
      throw new Error(`Invalid coupon cols for ${family}/${id}`)
    }
    couponIds.add(id)
    await writeFile(path.join(couponsDir, `${id}.json`), canonicalJson(c), 'utf8')
  }
  await pruneOrphans(couponsDir, couponIds)
}

/** Remove an entire published v2 tree before extracting a fresh artifact (push job). */
export async function clearPublishedMarketTree(root: string): Promise<void> {
  const v2 = marketRoot(root)
  await rm(v2, { recursive: true, force: true })
}
