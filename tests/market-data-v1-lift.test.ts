import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { loadMarketTree, writeMarketTree, marketRoot } from '../tools/market-data/io.ts'
import { emptyMarketTree, mergeSnapshot } from '../tools/market-data/merge.ts'
import { SCHEMA_VERSION, emptyNormalizedByFamily } from '../tools/market-data/types.ts'
import type { NormalizedSnapshot } from '../tools/market-data/types.ts'

const tmpDirs: string[] = []

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

async function writeV1Baseline(root: string): Promise<void> {
  const v1 = path.join(root, 'data', 'market', 'v1')
  await mkdir(path.join(v1, 'families', 'dkj', 'quotes'), { recursive: true })
  await mkdir(path.join(v1, 'families', 'pmap', 'quotes'), { recursive: true })
  await mkdir(path.join(v1, 'families', 'bmap', 'quotes'), { recursive: true })
  await mkdir(path.join(v1, 'refs'), { recursive: true })

  await writeFile(
    path.join(v1, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      asOf: '2026-11-01',
      generatedAt: '2026-11-01T12:00:00.000Z',
      families: ['dkj', 'pmap', 'bmap'],
      paths: {},
      refs: { retailInterest: 'refs/retail-interest.json', inflation: 'refs/inflation.json' },
      digests: { 'families/dkj/series.json': 'deadbeef' }
    }) + '\n',
    'utf8'
  )

  await writeFile(
    path.join(v1, 'families', 'bmap', 'series.json'),
    JSON.stringify({
      schemaVersion: 1,
      family: 'bmap',
      series: [
        {
          id: 'A280322N17',
          isin: 'HU0000403423',
          name: '2028/N',
          issue: '2017-10-03',
          mat: '2028-03-22',
          ccy: 'HUF',
          status: 'active',
          prem: 1.5
        }
      ]
    }) + '\n',
    'utf8'
  )
  await writeFile(
    path.join(v1, 'families', 'bmap', 'latest.json'),
    JSON.stringify({
      schemaVersion: 1,
      asOf: '2026-11-01',
      quotes: {
        A280322N17: { d: '2026-11-01', bid: 101, ask: 101.2, by: 5, ay: 4.9, ai: 0.2 }
      }
    }) + '\n',
    'utf8'
  )
  await writeFile(
    path.join(v1, 'families', 'bmap', 'quotes', 'A280322N17.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'A280322N17',
      family: 'bmap',
      cols: ['d', 'bid', 'ask', 'by', 'ay', 'ai'],
      rows: [
        ['2026-10-01', 100.5, 100.7, 5.1, 5.0, 0.1],
        ['2026-11-01', 101, 101.2, 5, 4.9, 0.2]
      ]
    }) + '\n',
    'utf8'
  )

  for (const family of ['dkj', 'pmap'] as const) {
    await writeFile(
      path.join(v1, 'families', family, 'series.json'),
      JSON.stringify({ schemaVersion: 1, family, series: [] }) + '\n',
      'utf8'
    )
    await writeFile(
      path.join(v1, 'families', family, 'latest.json'),
      JSON.stringify({ schemaVersion: 1, asOf: null, quotes: {} }) + '\n',
      'utf8'
    )
  }

  await writeFile(
    path.join(v1, 'refs', 'retail-interest.json'),
    JSON.stringify({
      schemaVersion: 1,
      asOf: '2026-10-01',
      generatedAt: '2026-11-01T12:00:00.000Z',
      rows: [
        {
          id: '2028_N',
          family: 'bmap',
          series: '2028/N',
          type: 'BMÁP',
          rates: [6.88],
          ehm: null,
          from: '2026-09-22',
          to: '2026-12-22',
          offered: true
        }
      ]
    }) + '\n',
    'utf8'
  )
}

describe('v1→v2 baseline lift + prune', () => {
  it('lifts v1 tip when v2 is empty: keeps quote history, drops prem, joins coupons', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-lift-'))
    tmpDirs.push(tmp)
    await writeV1Baseline(tmp)

    const tree = await loadMarketTree(tmp)
    expect(tree.manifest?.schemaVersion).toBe(SCHEMA_VERSION)
    expect(tree.families.bmap.series.series[0]).not.toHaveProperty('prem')
    expect(tree.families.bmap.quotes.A280322N17?.rows).toHaveLength(2)
    expect(tree.families.bmap.coupons.A280322N17?.rows).toEqual([
      ['2026-09-22', '2026-12-22', 6.88]
    ])
    expect(tree.families.bmap.series.series[0]?.offered).toBe(true)
    expect(tree.manifest?.refs?.retailInterest).toBeUndefined()
  })

  it('prunes orphan quote and coupon files on write', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-prune-'))
    tmpDirs.push(tmp)

    const snap: NormalizedSnapshot = {
      asOf: '2026-11-02',
      byFamily: {
        ...emptyNormalizedByFamily(),
        dkj: {
          series: [
            {
              id: 'D261125',
              isin: 'HU1',
              name: 'D261125',
              issue: '2026-07-29',
              mat: '2026-11-25',
              ccy: 'HUF',
              status: 'active'
            }
          ],
          quotes: [{ id: 'D261125', row: ['2026-11-02', 99.6, null, 6.0, null, 0] }]
        },
        pmap: {
          series: [
            {
              id: 'A270324I22',
              isin: 'HU2',
              name: '2027/I',
              issue: '2022-01-21',
              mat: '2027-03-24',
              ccy: 'HUF',
              status: 'active'
            }
          ],
          quotes: [{ id: 'A270324I22', row: ['2026-11-02', 100.1, 100.2, 4.1, 4.0, 1.2] }]
        },
        bmap: {
          series: [
            {
              id: 'KEEP_ME',
              isin: 'HU3',
              name: 'Keep',
              issue: '2020-01-01',
              mat: '2030-01-01',
              ccy: 'HUF',
              status: 'active'
            }
          ],
          quotes: [{ id: 'KEEP_ME', row: ['2026-11-02', 100, 100.1, 5, 4.9, 0] }]
        }
      }
    }
    const merged = mergeSnapshot(emptyMarketTree(), snap, {
      generatedAt: '2026-11-02T18:00:00+01:00'
    })
    // Seed an orphan coupon/quote that is not in the tree map.
    const v2 = marketRoot(tmp)
    await writeMarketTree(tmp, merged.tree)
    const orphanQuote = path.join(v2, 'families', 'bmap', 'quotes', 'ORPHAN.json')
    const orphanCoupon = path.join(v2, 'families', 'bmap', 'coupons', 'ORPHAN.json')
    await mkdir(path.dirname(orphanCoupon), { recursive: true })
    await writeFile(
      orphanQuote,
      JSON.stringify({
        schemaVersion: 2,
        id: 'ORPHAN',
        family: 'bmap',
        cols: ['d', 'bid', 'ask', 'by', 'ay', 'ai'],
        rows: []
      }),
      'utf8'
    )
    await writeFile(
      orphanCoupon,
      JSON.stringify({
        schemaVersion: 2,
        id: 'ORPHAN',
        family: 'bmap',
        cols: ['from', 'to', 'rate'],
        rows: []
      }),
      'utf8'
    )

    await writeMarketTree(tmp, merged.tree)

    await expect(readFile(orphanQuote, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(orphanCoupon, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(merged.tree.families.bmap.quotes.KEEP_ME).toBeTruthy()
  })
})
