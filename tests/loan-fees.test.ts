import { describe, expect, it } from 'vitest'
import {
  applyFeesAndDiscounts,
  DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES
} from '../src/finance_engine/instruments/loan_fees'

describe('applyFeesAndDiscounts', () => {
  const fees = [
    {
      name: 'folyositasi-dij',
      type: 'disbursement',
      value: 0.75,
      unit: 'percent' as const,
      maxAmount: 200_000,
      timing: 'upfront' as const
    },
    {
      name: 'hitelbiztositeki-ertek-megallapitas',
      type: 'appraisal',
      value: 58_765,
      unit: 'amount' as const,
      timing: 'upfront' as const
    },
    {
      name: 'fedezetkezelesi-koltseg',
      type: 'property-management',
      value: 20_000,
      unit: 'amount' as const,
      timing: 'upfront' as const
    },
    {
      name: 'azonnali-ertekbecsles',
      type: 'appraisal',
      value: 21_980,
      unit: 'amount' as const,
      timing: 'upfront' as const
    },
    {
      name: 'egyszeri-kamatcsokkentes-dij',
      type: 'other',
      value: 2,
      unit: 'percent' as const,
      maxAmount: 200_000,
      timing: 'upfront' as const
    },
    {
      name: 'elotorlesztesi-dij',
      type: 'prepayment',
      value: 1.5,
      unit: 'percent' as const,
      timing: 'on-event' as const
    }
  ]

  const discounts = [
    {
      name: 'otp-dijkedvezmenyes-folyositasi-dij-elengedes',
      type: 'fee-waiver' as const,
      value: 100,
      unit: 'percent' as const
    },
    {
      name: 'huseg-szolgaltatas',
      type: 'rate-discount' as const,
      value: 120,
      unit: 'bp' as const
    }
  ]

  it('applies representative upfront fees with percent caps and excludes optional add-ons', () => {
    const result = applyFeesAndDiscounts(fees, discounts, {
      principal: 12_000_000
    })

    expect([...DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES]).toEqual([
      'azonnali-ertekbecsles',
      'egyszeri-kamatcsokkentes-dij'
    ])
    expect(result.lines.map((line) => line.name)).toEqual([
      'folyositasi-dij',
      'hitelbiztositeki-ertek-megallapitas',
      'fedezetkezelesi-koltseg'
    ])
    expect(result.lines[0].grossAmount).toBe(90_000)
    expect(result.totalCreditCostFees).toBe(90_000 + 58_765 + 20_000)
    expect(result.totalRateDiscountBp).toBe(0)
  })

  it('applies active disbursement fee waiver and rate discount bp', () => {
    const result = applyFeesAndDiscounts(fees, discounts, {
      principal: 12_000_000,
      activeDiscountNames: [
        'otp-dijkedvezmenyes-folyositasi-dij-elengedes',
        'huseg-szolgaltatas'
      ]
    })

    const disbursement = result.lines.find((line) => line.name === 'folyositasi-dij')
    expect(disbursement?.amount).toBe(0)
    expect(result.totalCreditCostFees).toBe(58_765 + 20_000)
    expect(result.totalRateDiscountBp).toBe(120)
  })

  it('caps percent fees at maxAmount', () => {
    const result = applyFeesAndDiscounts(
      [
        {
          name: 'folyositasi-dij',
          type: 'disbursement',
          value: 0.75,
          unit: 'percent',
          maxAmount: 30_000,
          timing: 'upfront'
        }
      ],
      [],
      { principal: 12_000_000 }
    )

    expect(result.lines[0].grossAmount).toBe(30_000)
  })
})
