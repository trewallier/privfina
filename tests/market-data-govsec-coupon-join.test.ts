import { describe, expect, it } from 'vitest'
import { joinRetailInterestToCoupons } from '../tools/market-data/normalize-retail-interest.ts'
import type { RetailInterestFile, SeriesRecord } from '../tools/market-data/types.ts'

/**
 * Catalog-style ÁKK display names (2027/I, 2028/N) must join onto the same
 * series ids the SPA commercial picker uses — not only MAPP short names.
 */
describe('commercial PMÁP/BMÁP coupon join (catalog-style names)', () => {
  const pmapSeries: SeriesRecord = {
    id: 'A270324I22',
    isin: 'HU0000403118',
    name: '2027/I',
    issue: '2022-01-21',
    mat: '2027-03-24',
    ccy: 'HUF',
    status: 'active'
  }
  const bmapSeries: SeriesRecord = {
    id: 'A280322N17',
    isin: 'HU0000403423',
    name: '2028/N',
    issue: '2017-10-03',
    mat: '2028-03-22',
    ccy: 'HUF',
    status: 'active'
  }

  it('joins retail rows named like catalog PMÁP/BMÁP series onto ÁKK ids', () => {
    const retail: RetailInterestFile = {
      schemaVersion: 2,
      asOf: '2026-10-01',
      generatedAt: '2026-11-01T12:00:00.000Z',
      rows: [
        {
          id: '2027_I',
          family: 'pmap',
          series: '2027/I',
          type: 'PMÁP',
          rates: [4.5],
          ehm: null,
          from: '2026-03-24',
          to: '2027-03-23',
          offered: true
        },
        {
          id: '2028_N',
          family: 'bmap',
          series: '2028/N',
          type: 'BMÁP',
          rates: [5.47],
          ehm: null,
          from: '2026-03-22',
          to: '2026-06-21',
          offered: true
        },
        // Live-shaped names that do not match catalog 2027/I — must not steal the join.
        {
          id: '2036_I1',
          family: 'pmap',
          series: '2036/I1',
          type: 'PMÁP',
          rates: [4.5],
          ehm: null,
          from: '2026-07-17',
          to: '2027-02-20',
          offered: true
        }
      ]
    }

    const joined = joinRetailInterestToCoupons(retail, {
      pmap: [pmapSeries],
      bmap: [bmapSeries]
    })

    expect(joined.couponsByFamily.pmap?.A270324I22?.rows).toEqual([
      ['2026-03-24', '2027-03-23', 4.5]
    ])
    expect(joined.offeredById.A270324I22).toBe(true)
    expect(joined.couponsByFamily.bmap?.A280322N17?.rows).toEqual([
      ['2026-03-22', '2026-06-21', 5.47]
    ])
    expect(joined.offeredById.A280322N17).toBe(true)
    // No orphan invent under retail slug when series list only has catalog ids.
    expect(joined.couponsByFamily.pmap?.['2036_I1']).toBeUndefined()
  })
})
