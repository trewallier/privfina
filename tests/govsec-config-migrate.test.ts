import { describe, expect, it } from 'vitest'
import {
  migrateBmapConfigForEdit,
  migratePmapConfigForEdit
} from '../public/controller/govsec-config-migrate.js'

describe('govsec config edit migration', () => {
  it('composes BMÁP dkjBase + premium into annualCouponRatePct and clears legacy fields', () => {
    const migrated = migrateBmapConfigForEdit({
      principal: 100000,
      dkjBaseYieldPct: 5.5,
      interestPremiumPct: 1.38,
      issueDate: '2024-03-22',
      purchaseDate: '2026-11-02'
    })
    expect(migrated.annualCouponRatePct).toBeCloseTo(6.88)
    expect(migrated).not.toHaveProperty('dkjBaseYieldPct')
    expect(migrated).not.toHaveProperty('interestPremiumPct')
    expect(migrated.maturityDate).toBe('')
  })

  it('keeps existing BMÁP annualCouponRatePct and does not invent maturity', () => {
    const migrated = migrateBmapConfigForEdit({
      annualCouponRatePct: 6.5,
      dkjBaseYieldPct: 5,
      interestPremiumPct: 1,
      maturityDate: '2028-03-22'
    })
    expect(migrated.annualCouponRatePct).toBe(6.5)
    expect(migrated.maturityDate).toBe('2028-03-22')
  })

  it('composes PMÁP inflation + premium into annualCouponRatePct', () => {
    const migrated = migratePmapConfigForEdit({
      previousYearAverageInflationPct: 3.7,
      interestPremiumPct: 1.2,
      dueDate: '2033-04-20'
    })
    expect(migrated.annualCouponRatePct).toBeCloseTo(4.9)
    expect(migrated.maturityDate).toBe('2033-04-20')
    expect(migrated).not.toHaveProperty('previousYearAverageInflationPct')
    expect(migrated).not.toHaveProperty('interestPremiumPct')
  })

  it('drops legacy startDate from saved BMÁP configs on edit', () => {
    const migrated = migrateBmapConfigForEdit({
      startDate: '2024-03-22',
      annualCouponRatePct: 6.5,
      maturityDate: '2028-03-22'
    })
    expect(migrated).not.toHaveProperty('startDate')
    expect(migrated.maturityDate).toBe('2028-03-22')
  })

  it('drops legacy startDate from saved PMÁP configs on edit', () => {
    const migrated = migratePmapConfigForEdit({
      startDate: '2026-05-23',
      annualCouponRatePct: 4.9,
      dueDate: '2036-05-23'
    })
    expect(migrated).not.toHaveProperty('startDate')
    expect(migrated.maturityDate).toBe('2036-05-23')
  })
})
