import { describe, expect, it } from 'vitest'
import {
  couponsFileFromMakPaymentTable,
  hasDefinedPaymentRates
} from '../tools/market-data/mak-offering-coupons.ts'

describe('mak-offering-coupons', () => {
  it('returns null for all-null FLOAT rates', () => {
    expect(hasDefinedPaymentRates([null, null])).toBe(false)
    expect(
      couponsFileFromMakPaymentTable({
        family: 'ktv',
        seriesId: 'A361126B26',
        issueDate: '2026-01-14',
        paymentDates: ['2026-02-26', '2026-05-26'],
        paymentRates: [null, null]
      })
    ).toBeNull()
  })

  it('adds issue band before first payment and zip-sorts unsorted pairs', () => {
    const file = couponsFileFromMakPaymentTable({
      family: 'ktv',
      seriesId: 'A370923A26',
      issueDate: '2026-02-18',
      paymentDates: ['2028-09-23', '2026-09-23', '2027-09-23'],
      paymentRates: [6.25, 3.72, 6.25]
    })
    expect(file).toBeTruthy()
    expect(file?.rows[0]).toEqual(['2026-02-18', '2026-09-22', 3.72])
    expect(file?.rows[1]).toEqual(['2026-09-23', '2027-09-22', 3.72])
    expect(file?.rows[2]).toEqual(['2027-09-23', '2028-09-22', 6.25])
    expect(file?.rows[3]).toEqual(['2028-09-23', null, 6.25])
  })
})
