import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { toSeriesId, isCanonicalSeriesId } from '../tools/market-data/ids.ts'
import { loadMarketTree, writeMarketTree } from '../tools/market-data/io.ts'
import {
  MergeError,
  emptyMarketTree,
  mergeSnapshot
} from '../tools/market-data/merge.ts'
import { NormalizeError, normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import type { AkkEnvelope, SeriesRecord } from '../tools/market-data/types.ts'
import { SCHEMA_VERSION } from '../tools/market-data/types.ts'

describe('toSeriesId', () => {
  it('transliterates Hungarian diacritics then slugifies spaces/punctuation', () => {
    expect(toSeriesId('PMÁP 2030/I')).toBe('PMAP_2030_I')
    expect(toSeriesId('Bónusz 2028/N')).toBe('Bonusz_2028_N')
    expect(toSeriesId('  D261125  ')).toBe('D261125')
    expect(isCanonicalSeriesId('PMAP_2030_I')).toBe(true)
    expect(isCanonicalSeriesId('PMÁP 2030/I')).toBe(false)
  })
})

describe('id load/write round-trip', () => {
  it('keeps slug as map key, filename, and QuotesFile.id through disk', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-id-rt-'))
    try {
      const id = toSeriesId('Bónusz 2028/N')
      expect(id).toBe('Bonusz_2028_N')
      const tree = emptyMarketTree()
      tree.families.bmap.series = {
        schemaVersion: SCHEMA_VERSION,
        family: 'bmap',
        series: [
          {
            id,
            isin: 'HU0000403423',
            name: 'Bónusz 2028/N',
            issue: '2017-10-03',
            mat: '2028-03-22',
            ccy: 'HUF',
            status: 'active'
          }
        ]
      }
      tree.families.bmap.quotes[id] = {
        schemaVersion: SCHEMA_VERSION,
        id,
        family: 'bmap',
        cols: ['d', 'bid', 'ask', 'by', 'ay', 'ai'],
        rows: [['2026-11-02', 101.5, 101.7, 5.2, 5.1, 0.5]]
      }
      tree.families.bmap.latest = {
        schemaVersion: SCHEMA_VERSION,
        asOf: '2026-11-02',
        quotes: { [id]: { d: '2026-11-02', bid: 101.5, ask: 101.7, by: 5.2, ay: 5.1, ai: 0.5 } }
      }
      // Minimal valid digests via a no-op merge path: write after building digests through merge.
      const snap: NormalizedSnapshot = {
        asOf: '2026-11-02',
        byFamily: {
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
            quotes: [
              { id: 'D261125', row: ['2026-11-02', 99.6, null, 6.0, null, 0] }
            ]
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
            quotes: [
              { id: 'A270324I22', row: ['2026-11-02', 100.1, 100.2, 4.1, 4.0, 1.2] }
            ]
          },
          bmap: {
            series: tree.families.bmap.series.series,
            quotes: [{ id, row: ['2026-11-02', 101.5, 101.7, 5.2, 5.1, 0.5] }]
          }
        }
      }
      const merged = mergeSnapshot(emptyMarketTree(), snap, {
        generatedAt: '2026-11-02T18:00:00+01:00'
      })
      await writeMarketTree(tmp, merged.tree)

      const quotePath = path.join(tmp, 'data/market/v1/families/bmap/quotes', `${id}.json`)
      const onDisk = JSON.parse(await readFile(quotePath, 'utf8')) as { id: string }
      expect(onDisk.id).toBe(id)

      const loaded = await loadMarketTree(tmp)
      expect(loaded.families.bmap.quotes[id]?.id).toBe(id)
      expect(loaded.families.bmap.series.series.find((s) => s.id === id)?.name).toBe('Bónusz 2028/N')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('accumulate series + same-day conflicts', () => {
  it('retains prior series as delisted when no longer quoted and keeps quote history', () => {
    const retired: SeriesRecord = {
      id: 'OLD_SERIES',
      isin: 'HU0000999999',
      name: 'Old Series',
      issue: '2020-01-01',
      mat: '2030-01-01',
      ccy: 'HUF',
      status: 'active'
    }
    const active: SeriesRecord = {
      id: 'A280322N17',
      isin: 'HU0000403423',
      name: '2028/N',
      issue: '2017-10-03',
      mat: '2028-03-22',
      ccy: 'HUF',
      status: 'active'
    }
    const first = mergeSnapshot(
      emptyMarketTree(),
      {
        asOf: '2026-11-02',
        byFamily: {
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
            quotes: [{ id: 'D261125', row: ['2026-11-02', 99.6, null, 6, null, 0] }]
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
            series: [retired, active],
            quotes: [
              { id: 'OLD_SERIES', row: ['2026-11-02', 100, 100.1, 5, 4.9, 0] },
              { id: 'A280322N17', row: ['2026-11-02', 101.5, 101.7, 5.2, 5.1, 0.5] }
            ]
          }
        }
      },
      { generatedAt: '2026-11-02T18:00:00+01:00' }
    )
    expect(first.tree.families.bmap.series.series.map((s) => s.id).sort()).toEqual([
      'A280322N17',
      'OLD_SERIES'
    ])

    const second = mergeSnapshot(
      first.tree,
      {
        asOf: '2026-11-03',
        byFamily: {
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
            quotes: [{ id: 'D261125', row: ['2026-11-03', 99.7, null, 6.1, null, 0] }]
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
            quotes: [{ id: 'A270324I22', row: ['2026-11-03', 100.2, 100.3, 4.0, 3.9, 1.2] }]
          },
          bmap: {
            series: [active],
            quotes: [{ id: 'A280322N17', row: ['2026-11-03', 101.6, 101.8, 5.1, 5.0, 0.5] }]
          }
        }
      },
      { generatedAt: '2026-11-03T18:00:00+01:00' }
    )

    const ids = second.tree.families.bmap.series.series.map((s) => s.id).sort()
    expect(ids).toEqual(['A280322N17', 'OLD_SERIES'])
    expect(second.tree.families.bmap.series.series.find((s) => s.id === 'OLD_SERIES')?.status).toBe(
      'delisted'
    )
    expect(second.tree.families.bmap.quotes.OLD_SERIES.rows).toHaveLength(1)
    expect(second.tree.families.bmap.series.series.find((s) => s.id === 'A280322N17')?.status).toBe(
      'active'
    )
  })

  it('skips identical same-day rows and fails on conflicting values', () => {
    const base = mergeSnapshot(
      emptyMarketTree(),
      {
        asOf: '2026-11-02',
        byFamily: {
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
            quotes: [{ id: 'D261125', row: ['2026-11-02', 99.6, null, 6, null, 0] }]
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
                id: 'A280322N17',
                isin: 'HU3',
                name: '2028/N',
                issue: '2017-10-03',
                mat: '2028-03-22',
                ccy: 'HUF',
                status: 'active'
              }
            ],
            quotes: [{ id: 'A280322N17', row: ['2026-11-02', 101.5, 101.7, 5.2, 5.1, 0.5] }]
          }
        }
      },
      { generatedAt: '2026-11-02T18:00:00+01:00' }
    )

    const dup = mergeSnapshot(base.tree, {
      asOf: '2026-11-02',
      byFamily: base.tree.families.dkj
        ? {
            dkj: {
              series: base.tree.families.dkj.series.series,
              quotes: [{ id: 'D261125', row: ['2026-11-02', 99.6, null, 6, null, 0] }]
            },
            pmap: {
              series: base.tree.families.pmap.series.series,
              quotes: [{ id: 'A270324I22', row: ['2026-11-02', 100.1, 100.2, 4.1, 4.0, 1.2] }]
            },
            bmap: {
              series: base.tree.families.bmap.series.series,
              quotes: [{ id: 'A280322N17', row: ['2026-11-02', 101.5, 101.7, 5.2, 5.1, 0.5] }]
            }
          }
        : (null as never)
    })
    expect(dup.skippedDuplicates).toBe(3)
    expect(dup.appendedRows).toBe(0)

    expect(() =>
      mergeSnapshot(base.tree, {
        asOf: '2026-11-02',
        byFamily: {
          dkj: {
            series: base.tree.families.dkj.series.series,
            quotes: [{ id: 'D261125', row: ['2026-11-02', 99.999, null, 6, null, 0] }]
          },
          pmap: {
            series: base.tree.families.pmap.series.series,
            quotes: [{ id: 'A270324I22', row: ['2026-11-02', 100.1, 100.2, 4.1, 4.0, 1.2] }]
          },
          bmap: {
            series: base.tree.families.bmap.series.series,
            quotes: [{ id: 'A280322N17', row: ['2026-11-02', 101.5, 101.7, 5.2, 5.1, 0.5] }]
          }
        }
      })
    ).toThrow(MergeError)
  })
})

describe('catalog join policy', () => {
  it('fails when a quoted series is missing from the catalog', () => {
    const catalog: AkkEnvelope = { meta: { status: 'OK' }, data: [] }
    const rates: AkkEnvelope = {
      meta: { status: 'OK' },
      data: [
        {
          longName: 'D261125',
          securityType: 'DKJ',
          settleDate: '2026-11-02',
          bidPrice: 99.6
        },
        {
          longName: 'A270324I22',
          securityType: 'PMÁP',
          settleDate: '2026-11-02',
          bidPrice: 100
        },
        {
          longName: 'A280322N17',
          securityType: 'BMÁP',
          settleDate: '2026-11-02',
          bidPrice: 101
        }
      ]
    }
    expect(() => normalizeAkkSnapshots(catalog, rates)).toThrow(NormalizeError)
    expect(() => normalizeAkkSnapshots(catalog, rates)).toThrow(/join miss/i)
  })
})
