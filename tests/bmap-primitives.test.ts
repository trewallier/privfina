import { describe, expect, it } from 'vitest'
import {
  deriveBmapAccruedInterestAmount,
  deriveBmapRateOutputs,
  generateBmapQuarterlyCouponFlows
} from '../src/finance_engine/instruments/bmap'
import {
  deriveBmapAccruedInterestAmount as deriveBmapAccruedInterestAmountBrowser,
  deriveBmapRateOutputs as deriveBmapRateOutputsBrowser,
  generateQuarterlyCouponFlows as generateQuarterlyCouponFlowsBrowser
} from '../public/controller/bmap-calculation-adapter.js'

describe('BMAP TypeScript primitives (ADR 0017 / 0038)', () => {
  it('passes through published effective coupon and matches browser dual-surface', () => {
    const inputs = {
      annualCouponRatePct: 6.88,
      purchaseDate: '2026-04-24',
      issueDate: '2026-04-24'
    }
    const engine = deriveBmapRateOutputs(inputs)
    const browser = deriveBmapRateOutputsBrowser(inputs)

    expect(engine).toEqual({ annualCouponRatePct: 6.88 })
    expect(browser).toEqual(engine)
  })

  it('computes ACT/360 accrued interest and matches browser dual-surface', () => {
    const specInputs = {
      principal: 1_000_000,
      startDate: '2026-04-01',
      purchaseDate: '2026-04-24',
      issueDate: '2026-04-01',
      annualCouponRatePct: 6.88
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
      annualCouponRatePct: 6.88,
      startDate: '2026-04-24',
      purchaseDate: '2026-04-24',
      issueDate: '2026-04-24',
      maturityDate: '2032-04-24'
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
