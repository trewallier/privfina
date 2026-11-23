import { describe, expect, it } from 'vitest'
import {
  dayCountFromInterestConvention,
  periodMonthsFromInterestPeriod
} from '../tools/market-data/normalize.ts'

describe('periodMonthsFromInterestPeriod', () => {
  it('maps 3M / 12M labels', () => {
    expect(periodMonthsFromInterestPeriod('3M')).toBe(3)
    expect(periodMonthsFromInterestPeriod('12M')).toBe(12)
    expect(periodMonthsFromInterestPeriod(' 6m ')).toBe(6)
  })

  it('returns null for bad tokens', () => {
    expect(periodMonthsFromInterestPeriod(null)).toBeNull()
    expect(periodMonthsFromInterestPeriod('')).toBeNull()
    expect(periodMonthsFromInterestPeriod('quarterly')).toBeNull()
    expect(periodMonthsFromInterestPeriod('0M')).toBeNull()
    expect(periodMonthsFromInterestPeriod('3')).toBeNull()
  })
})

describe('dayCountFromInterestConvention', () => {
  it('maps ÁKK underscore tokens onto published enums', () => {
    expect(dayCountFromInterestConvention('_ACT_360')).toBe('ACT/360')
    expect(dayCountFromInterestConvention('_ACT_365')).toBe('ACT/365F')
    expect(dayCountFromInterestConvention('ACT/365F')).toBe('ACT/365F')
    expect(dayCountFromInterestConvention('30E/360')).toBe('30E/360')
    expect(dayCountFromInterestConvention('30/360')).toBe('30E/360')
  })

  it('returns null for unknown tokens', () => {
    expect(dayCountFromInterestConvention(null)).toBeNull()
    expect(dayCountFromInterestConvention('')).toBeNull()
    expect(dayCountFromInterestConvention('_ACT_ACT')).toBeNull()
    expect(dayCountFromInterestConvention('BUS/252')).toBeNull()
  })
})
