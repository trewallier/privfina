import { describe, expect, it } from 'vitest'
import {
  deriveBmapAccruedInterestAmount,
  deriveBmapMaturityDate,
  deriveBmapRateOutputs,
  generateBmapQuarterlyCouponFlows
} from '../src/finance_engine/instruments/bmap'
import {
  deriveBmapAccruedInterestAmount as deriveBmapAccruedInterestAmountBrowser,
  deriveBmapRateOutputs as deriveBmapRateOutputsBrowser,
  generateQuarterlyCouponFlows as generateQuarterlyCouponFlowsBrowser
} from '../public/controller/bmap-calculation-adapter.js'

describe('BMAP TypeScript primitives (ADR 0017)', () => {
  it('derives a 6-year maturity from start date', () => {
    expect(deriveBmapMaturityDate('2026-04-24')).toBe('2032-04-24')
  })

  it('floors negative DKJ base yield and matches browser dual-surface', () => {
    const inputs = { dkjBaseYieldPct: -1.5, interestPremiumPct: 0.75 }
    const engine = deriveBmapRateOutputs(inputs)
    const browser = deriveBmapRateOutputsBrowser(inputs)

    expect(engine).toEqual({
      effectiveDkjBaseYieldPct: 0,
      annualCouponRatePct: 0.75,
      couponPaymentFrequency: 'quarterly',
      periodCouponRatePct: 0.1875
    })
    expect(browser).toEqual(engine)
  })

  it('computes ACT/360 accrued interest and matches browser dual-surface', () => {
    const specInputs = {
      principal: 1_000_000,
      startDate: '2026-04-01',
      purchaseDate: '2026-04-24',
      issueDate: '2026-04-01'
    }
    const annualCouponRatePct = 6.88
    const engine = deriveBmapAccruedInterestAmount(specInputs, annualCouponRatePct)
    const browser = deriveBmapAccruedInterestAmountBrowser(specInputs, annualCouponRatePct)

    expect(engine).toBeCloseTo((1_000_000 * 6.88 * 23) / (100 * 360), 10)
    expect(browser).toBe(engine)
  })

  it('builds quarterly coupon flows matching the browser dual-surface', () => {
    const specInputs = {
      principal: 1_000_000,
      dkjBaseYieldPct: 6.13,
      interestPremiumPct: 0.75,
      startDate: '2026-04-24',
      purchaseDate: '2026-04-24'
    }
    const rates = deriveBmapRateOutputs(specInputs)
    const purchaseAmount = specInputs.principal
    const engineFlows = generateBmapQuarterlyCouponFlows(
      specInputs,
      purchaseAmount,
      rates.annualCouponRatePct
    )
    const browserFlows = generateQuarterlyCouponFlowsBrowser(
      specInputs,
      purchaseAmount,
      rates.annualCouponRatePct
    )

    expect(engineFlows).toEqual(browserFlows)
    expect(engineFlows[0]).toMatchObject({
      date: '2026-04-24',
      direction: 'outflow',
      amount: purchaseAmount
    })
    expect(engineFlows.at(-1)).toMatchObject({
      date: '2032-04-24',
      direction: 'inflow',
      amount: specInputs.principal
    })
  })
})
