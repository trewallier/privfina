import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { canonicalJson } from './digests.ts'
import { assertSeriesId } from './ids.ts'
import { emptyMarketTree, type FamilyTreeState, type MarketTreeState } from './merge.ts'
import {
  FAMILIES,
  QUOTE_COLS,
  SCHEMA_VERSION,
  type FamilyCode,
  type LatestFile,
  type ManifestFile,
  type QuotesFile,
  type SeriesFile
} from './types.ts'

export function marketRoot(repoOrDataRoot: string): string {
  // Accept either repo root or .../data/market/v1
  if (path.basename(repoOrDataRoot) === 'v1') return repoOrDataRoot
  return path.join(repoOrDataRoot, 'data', 'market', 'v1')
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
  const v1 = marketRoot(root)
  const tree = emptyMarketTree()
  const manifest = await readJsonIfExists<ManifestFile>(path.join(v1, 'manifest.json'))
  tree.manifest = manifest

  for (const family of FAMILIES) {
    const famDir = path.join(v1, 'families', family)
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
    tree.families[family] = { series, latest, quotes }
  }
  return tree
}

export async function writeMarketTree(root: string, tree: MarketTreeState): Promise<void> {
  const v1 = marketRoot(root)
  await mkdir(v1, { recursive: true })
  if (!tree.manifest) {
    throw new Error('Cannot write market tree without manifest')
  }
  await writeFile(path.join(v1, 'manifest.json'), canonicalJson(tree.manifest), 'utf8')

  for (const family of FAMILIES) {
    await writeFamily(v1, family, tree.families[family])
  }
}

async function writeFamily(v1: string, family: FamilyCode, fam: FamilyTreeState): Promise<void> {
  const famDir = path.join(v1, 'families', family)
  const quotesDir = path.join(famDir, 'quotes')
  await mkdir(quotesDir, { recursive: true })
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
}
