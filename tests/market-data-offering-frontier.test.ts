import { describe, expect, it } from 'vitest'
import { shiftIsoDate } from '../tools/market-data/fetch-webkincstar.ts'
import {
  contiguousOfferingSuccessFrontierDetail,
  contiguousOfferingSuccessFrontierPublished,
  maxOfferingSuccessFrontierPublished,
  minOfferingSuccessFrontierPublished,
  offeringSuccessFrontierExtremes,
  OFFERING_WK_HISTORICAL_GATE_DAYS,
  shouldEnableWebkincstarHistoricalBackfill
} from '../tools/market-data/offering-archive-frontier.ts'
import { SCHEMA_VERSION, type OfferingArchiveDocument } from '../tools/market-data/types.ts'

function doc(
  partial: Partial<OfferingArchiveDocument> &
    Pick<OfferingArchiveDocument, 'pathUuid' | 'family' | 'published' | 'status'>
): OfferingArchiveDocument {
  return {
    pathId: null,
    seriesId: partial.seriesId ?? 'S1',
    isin: null,
    modifiedOn: null,
    resourceType: partial.resourceType ?? 'ISSUE',
    sha256: partial.sha256 ?? (partial.status === 'transcribed' ? 'abc' : null),
    bytes: null,
    sourceHost: 'documents.akk.hu',
    ...partial
  }
}

describe('offering archive frontier / WK historical gate', () => {
  it('walks contiguous tip success and stops at first non-success gap', () => {
    const documents = [
      doc({ pathUuid: 'u1', family: 'dkj', published: '2026-11-20', status: 'transcribed' }),
      doc({
        pathUuid: 'u2',
        family: 'dkj',
        published: '2026-11-10',
        status: 'transcribed',
        seriesId: 'D261110'
      }),
      doc({ pathUuid: 'u3', family: 'dkj', published: '2026-10-01', status: 'pending_download' }),
      doc({ pathUuid: 'u4', family: 'dkj', published: '2026-09-01', status: 'transcribed' })
    ]
    expect(contiguousOfferingSuccessFrontierPublished(documents, 'dkj')).toBe('2026-11-10')
    const detail = contiguousOfferingSuccessFrontierDetail(documents, 'dkj')
    expect(detail?.published).toBe('2026-11-10')
    expect(detail?.holders).toEqual([
      expect.objectContaining({
        family: 'dkj',
        seriesId: 'D261110',
        resourceType: 'ISSUE',
        published: '2026-11-10'
      })
    ])
  })

  it('returns null when newest ISSUE is not terminal success', () => {
    const documents = [
      doc({ pathUuid: 'u1', family: 'pmap', published: '2026-11-20', status: 'pending_download' }),
      doc({ pathUuid: 'u2', family: 'pmap', published: '2026-10-01', status: 'transcribed' })
    ]
    expect(contiguousOfferingSuccessFrontierPublished(documents, 'pmap')).toBeNull()
  })

  it('ignores TAP_* rows when computing ISSUE frontier', () => {
    const documents = [
      doc({
        pathUuid: 'tap1',
        family: 'mapp',
        published: '2026-11-22',
        status: 'skipped_no_schedule',
        resourceType: 'TAP_1'
      }),
      doc({ pathUuid: 'u1', family: 'mapp', published: '2026-11-01', status: 'transcribed' })
    ]
    expect(contiguousOfferingSuccessFrontierPublished(documents, 'mapp')).toBe('2026-11-01')
  })

  it('gate stays closed for empty or shallow archive', () => {
    expect(
      shouldEnableWebkincstarHistoricalBackfill({
        archive: null,
        asOf: '2026-11-24'
      })
    ).toBe(false)

    const shallow = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-11-24T00:00:00.000Z',
      source: {
        id: 'akk-public-offerings' as const,
        host: 'www.akk.hu' as const,
        disclaimer: 'test'
      },
      documents: [
        doc({ pathUuid: 'u1', family: 'dkj', published: '2026-11-20', status: 'transcribed' })
      ]
    }
    // Only one family has a frontier → min across all families is null → closed.
    expect(
      shouldEnableWebkincstarHistoricalBackfill({ archive: shallow, asOf: '2026-11-24' })
    ).toBe(false)
  })

  it('gate opens when every family frontier is at least gateDays before asOf', () => {
    const asOf = '2026-11-24'
    const deep = shiftIsoDate(asOf, -(OFFERING_WK_HISTORICAL_GATE_DAYS + 5))
    const families = [
      'dkj',
      'pmap',
      'bmap',
      'fixmap',
      'mapp',
      'baba',
      'ktv'
    ] as const
    const documents = families.flatMap((family, i) => [
      doc({
        pathUuid: `${family}-new`,
        family,
        published: shiftIsoDate(asOf, -1),
        status: 'transcribed'
      }),
      doc({
        pathUuid: `${family}-old`,
        family,
        published: deep,
        status: i % 2 === 0 ? 'transcribed' : 'skipped_no_schedule'
      })
    ])
    const archive = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-11-24T00:00:00.000Z',
      source: {
        id: 'akk-public-offerings' as const,
        host: 'www.akk.hu' as const,
        disclaimer: 'test'
      },
      documents
    }
    expect(minOfferingSuccessFrontierPublished(archive)).toBe(deep)
    expect(maxOfferingSuccessFrontierPublished(archive)).toBe(deep)
    expect(shouldEnableWebkincstarHistoricalBackfill({ archive, asOf })).toBe(true)
    expect(
      shouldEnableWebkincstarHistoricalBackfill({
        archive,
        asOf,
        gateDays: OFFERING_WK_HISTORICAL_GATE_DAYS + 10
      })
    ).toBe(false)
  })

  it('gate stays closed when one family is shallow even if others are deep', () => {
    const asOf = '2026-11-24'
    const deep = shiftIsoDate(asOf, -(OFFERING_WK_HISTORICAL_GATE_DAYS + 10))
    const shallow = shiftIsoDate(asOf, -10)
    const families = [
      'dkj',
      'pmap',
      'bmap',
      'fixmap',
      'mapp',
      'baba',
      'ktv'
    ] as const
    const documents = families.flatMap((family, i) => {
      const frontier = family === 'baba' ? shallow : deep
      return [
        doc({
          pathUuid: `${family}-new`,
          family,
          published: shiftIsoDate(asOf, -1),
          status: 'transcribed'
        }),
        doc({
          pathUuid: `${family}-old`,
          family,
          published: frontier,
          status: i % 2 === 0 ? 'transcribed' : 'skipped_already_transcribed'
        })
      ]
    })
    const archive = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: '2026-11-24T00:00:00.000Z',
      source: {
        id: 'akk-public-offerings' as const,
        host: 'www.akk.hu' as const,
        disclaimer: 'test'
      },
      documents
    }
    // Deepest progress metric still reports the oldest frontier…
    expect(minOfferingSuccessFrontierPublished(archive)).toBe(deep)
    // …but gate readiness uses the shallowest family.
    expect(maxOfferingSuccessFrontierPublished(archive)).toBe(shallow)
    expect(shouldEnableWebkincstarHistoricalBackfill({ archive, asOf })).toBe(false)

    const extremes = offeringSuccessFrontierExtremes(archive)
    expect(extremes.deepest?.published).toBe(deep)
    expect(extremes.shallowest?.published).toBe(shallow)
    expect(extremes.shallowest?.holders.some((h) => h.family === 'baba')).toBe(true)
    expect(extremes.deepest?.holders.every((h) => h.family !== 'baba')).toBe(true)
  })
})
