import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { canonicalJson } from './digests.ts'
import { assertSeriesId } from './ids.ts'
import { emptyMarketTree, type FamilyTreeState, type MarketTreeState } from './merge.ts'
import {
  FAMILIES,
  INFLATION_REF_PATH,
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
  type SeriesFile
} from './types.ts'

export function marketRoot(repoOrDataRoot: string): string {
  // Accept either repo root or .../data/market/v2
  if (path.basename(repoOrDataRoot) === MARKET_PATH_SEGMENT) return repoOrDataRoot
  return path.join(repoOrDataRoot, 'data', 'market', MARKET_PATH_SEGMENT)
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

export async function loadMarketTree(root: string): Promise<MarketTreeState> {
  const v2 = marketRoot(root)
  const tree = emptyMarketTree()
  const manifest = await readJsonIfExists<ManifestFile>(path.join(v2, 'manifest.json'))
  tree.manifest = manifest

  for (const family of FAMILIES) {
    const famDir = path.join(v2, 'families', family)
    const series =
      (await readJsonIfExists<SeriesFile>(path.join(famDir, 'series.json'))) ??
      ({ schemaVersion: SCHEMA_VERSION, family, series: [] } as SeriesFile)
    const latest =
      (await readJsonIfExists<LatestFile>(path.join(famDir, 'latest.json'))) ??
      ({ schemaVersion: SCHEMA_VERSION, asOf: null, quotes: {} } as LatestFile)
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
        quotes[id] = q
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
        coupons[id] = c
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw err
    }
    tree.families[family] = { series, latest, quotes, coupons }
  }

  const inflationPath = tree.manifest?.refs?.inflation ?? INFLATION_REF_PATH
  tree.inflation = await readJsonIfExists<InflationFile>(path.join(v2, inflationPath))
  return tree
}

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

  if (tree.inflation) {
    const rel = tree.manifest.refs?.inflation ?? INFLATION_REF_PATH
    const abs = path.join(v2, rel)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, canonicalJson(tree.inflation), 'utf8')
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
  for (const [id, q] of Object.entries(fam.quotes)) {
    assertSeriesId(id)
    if (q.id !== id) {
      throw new Error(`Quote map key ${id} !== body.id ${q.id}`)
    }
    if (q.cols.length !== QUOTE_COLS.length) {
      throw new Error(`Invalid quote cols for ${family}/${id}`)
    }
    await writeFile(path.join(quotesDir, `${id}.json`), canonicalJson(q), 'utf8')
  }
  for (const [id, c] of Object.entries(fam.coupons)) {
    assertSeriesId(id)
    if (c.id !== id) {
      throw new Error(`Coupon map key ${id} !== body.id ${c.id}`)
    }
    if (c.cols.join(',') !== COUPON_COLS.join(',')) {
      throw new Error(`Invalid coupon cols for ${family}/${id}`)
    }
    await writeFile(path.join(couponsDir, `${id}.json`), canonicalJson(c), 'utf8')
  }
}
