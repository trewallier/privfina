import { describe, expect, it } from 'vitest'
import { promoteWkOriginSeries, unionQuoteFiles } from '../tools/market-data/promote-wk-origin.ts'
import { emptyMarketTree } from '../tools/market-data/merge.ts'
import {
  SCHEMA_VERSION,
  SERIES_IDENTITY_SOURCE_AKK,
  SERIES_IDENTITY_SOURCE_WEBKINCSTAR,
  type QuoteRow,
  type SeriesRecord
} from '../tools/market-data/types.ts'

function wkStub(overrides: Partial<SeriesRecord> & Pick<SeriesRecord, 'id' | 'name'>): SeriesRecord {
  return {
    isin: null,
    issue: null,
    mat: '2027-03-24',
    ccy: 'HUF',
    status: 'delisted',
    identitySource: SERIES_IDENTITY_SOURCE_WEBKINCSTAR,
    ...overrides
  }
}

function akkSeries(): SeriesRecord {
  return {
    id: 'A270324I22',
    isin: 'HU0000403114',
    name: '2027/I',
    issue: '2022-03-24',
    mat: '2027-03-24',
    ccy: 'HUF',
    status: 'matured',
    dayCount: 'ACT/365F',
    identitySource: SERIES_IDENTITY_SOURCE_AKK
  }
}

describe('promoteWkOriginSeries (ADR 0048 cutover)', () => {
  it('rename-merges invent 2027_I quotes onto A270324I22 and rewrites archive seriesId', async () => {
    const tree = emptyMarketTree()
    const inventId = '2027_I'
    const canonical = akkSeries()
    tree.families.pmap.series = {
      schemaVersion: SCHEMA_VERSION,
      family: 'pmap',
      series: [wkStub({ id: inventId, name: '2027/I' })]
    }
    tree.families.pmap.quotes[inventId] = {
      schemaVersion: SCHEMA_VERSION,
      id: inventId,
      family: 'pmap',
      cols: ['d', 'bid', 'ask', 'by', 'ay', 'ai'],
      rows: [
        ['2024-01-02', 99, 100, null, null, 0.1] as QuoteRow,
        ['2024-01-03', 98.5, 99.5, null, null, 0.2] as QuoteRow
      ]
    }
    // Pre-existing canonical quote on a different settle date — must survive.
    tree.families.pmap.quotes[canonical.id] = {
      schemaVersion: SCHEMA_VERSION,
      id: canonical.id,
      family: 'pmap',
      cols: ['d', 'bid', 'ask', 'by', 'ay', 'ai'],
      rows: [['2023-12-01', 97, 98, null, null, null] as QuoteRow]
    }
    tree.families.pmap.series.series.push({
      ...canonical,
      // Pretend tip already had a thin ÁKK row without invent quotes
      identitySource: SERIES_IDENTITY_SOURCE_AKK
    })
    tree.offeringArchive = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-11-05T12:00:00.000Z',
      source: {
        id: 'akk-public-offerings',
        host: 'www.akk.hu',
        disclaimer: 'test'
      },
      documents: [
        {
          pathId: null,
          pathUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          family: 'pmap',
          seriesId: inventId,
          isin: null,
          published: '2022-03-01',
          modifiedOn: null,
          resourceType: 'ISSUE',
          sha256: null,
          bytes: null,
          status: 'listed',
          sourceHost: 'www.akk.hu'
        }
      ]
    }

    const result = await promoteWkOriginSeries(tree, {
      resolve: async () => ({ series: canonical, via: 'index', row: {} })
    })

    expect(result.counters.renamedMerged).toBe(1)
    expect(result.remaps).toEqual([{ family: 'pmap', fromId: inventId, toId: canonical.id }])
    expect(result.tree.families.pmap.series.series.find((s) => s.id === inventId)).toBeUndefined()
    expect(
      result.tree.families.pmap.series.series.find((s) => s.id === canonical.id)?.identitySource
    ).toBe(SERIES_IDENTITY_SOURCE_AKK)
    expect(result.tree.families.pmap.quotes[inventId]).toBeUndefined()
    const mergedRows = result.tree.families.pmap.quotes[canonical.id]?.rows ?? []
    expect(mergedRows.map((r) => r[0]).sort()).toEqual(['2023-12-01', '2024-01-02', '2024-01-03'])
    expect(result.tree.offeringArchive?.documents[0].seriesId).toBe(canonical.id)
  })

  it('same-id promote null-fills issue/isin and sets ÁKK identitySource', async () => {
    const tree = emptyMarketTree()
    const id = 'D260930'
    tree.families.dkj.series = {
      schemaVersion: SCHEMA_VERSION,
      family: 'dkj',
      series: [wkStub({ id, name: 'D260930', mat: '2026-09-30' })]
    }
    const akk: SeriesRecord = {
      id,
      isin: 'HU0000533456',
      name: 'D260930',
      issue: '2025-10-01',
      mat: '2026-09-30',
      ccy: 'HUF',
      status: 'matured',
      dayCount: 'ACT/365F',
      identitySource: SERIES_IDENTITY_SOURCE_AKK
    }
    const result = await promoteWkOriginSeries(tree, {
      resolve: async () => ({ series: akk, via: 'longName', row: {} })
    })
    expect(result.counters.promotedSameId).toBe(1)
    const row = result.tree.families.dkj.series.series[0]
    expect(row.identitySource).toBe(SERIES_IDENTITY_SOURCE_AKK)
    expect(row.isin).toBe('HU0000533456')
    expect(row.issue).toBe('2025-10-01')
    expect(row.dayCount).toBe('ACT/365F')
  })

  it('unionQuoteFiles keeps both histories and lets WK win conflicts', () => {
    const canonical = {
      schemaVersion: SCHEMA_VERSION,
      id: 'A270324I22',
      family: 'pmap' as const,
      cols: ['d', 'bid', 'ask', 'by', 'ay', 'ai'] as const,
      rows: [['2024-01-02', 90, 91, null, null, null] as QuoteRow]
    }
    const old = {
      schemaVersion: SCHEMA_VERSION,
      id: '2027_I',
      family: 'pmap' as const,
      cols: ['d', 'bid', 'ask', 'by', 'ay', 'ai'] as const,
      rows: [
        ['2024-01-02', 99, 100, null, null, 0.1] as QuoteRow,
        ['2024-01-03', 98, 99, null, null, null] as QuoteRow
      ]
    }
    const union = unionQuoteFiles('pmap', 'A270324I22', canonical, old)
    expect(union.rows).toHaveLength(2)
    const conflict = union.rows.find((r) => r[0] === '2024-01-02')
    expect(conflict?.[1]).toBe(99) // WK wins
    expect(union.rows.find((r) => r[0] === '2024-01-03')?.[1]).toBe(98)
  })
})
