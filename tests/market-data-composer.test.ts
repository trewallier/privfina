import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  browserTodayIso,
  ensureDefaultPurchaseDateValue,
  resolveSeriesSelectValue
} from '../public/controller/market-data-composer.js'

describe('market-data-composer helpers', () => {
  it('forces Manual entry when requestedId is empty string (edit / product-change)', () => {
    const available = ['D261223', 'D261125']
    expect(resolveSeriesSelectValue('', 'D261223', available)).toBe('')
    expect(resolveSeriesSelectValue(null, 'D261223', available)).toBe('')
  })

  it('keeps the current selection when requestedId is omitted', () => {
    const available = ['D261223', 'D261125']
    expect(resolveSeriesSelectValue(undefined, 'D261223', available)).toBe('D261223')
    expect(resolveSeriesSelectValue(undefined, 'GONE', available)).toBe('')
  })

  it('selects an explicit series id when still available', () => {
    expect(resolveSeriesSelectValue('D261125', 'D261223', ['D261223', 'D261125'])).toBe(
      'D261125'
    )
    expect(resolveSeriesSelectValue('MISSING', 'D261223', ['D261223'])).toBe('')
  })

  it('defaults empty purchase-date inputs to browser-local today', () => {
    const today = browserTodayIso(new Date('2026-11-01T15:30:00'))
    expect(today).toBe('2026-11-01')

    const empty = { value: '' }
    expect(ensureDefaultPurchaseDateValue(empty, '2026-11-01')).toBe(true)
    expect(empty.value).toBe('2026-11-01')

    const filled = { value: '2026-06-15' }
    expect(ensureDefaultPurchaseDateValue(filled, '2026-11-01')).toBe(false)
    expect(filled.value).toBe('2026-06-15')
  })
})

describe('commercial investment UI markup contracts', () => {
  const indexHtml = readFileSync(resolve(process.cwd(), 'public/index.html'), 'utf8')
  const appController = readFileSync(resolve(process.cwd(), 'public/app-controller.js'), 'utf8')

  it('does not render catalog readiness / migration-status copy', () => {
    expect(indexHtml).not.toContain('commercial-investment-readiness-hint')
    expect(indexHtml).not.toMatch(/Readiness:\s*fully-spec-backed/)
    expect(appController).not.toContain('resolveCommercialInvestmentReadinessHint')
  })

  it('removes quote settle date and update-from-latest controls', () => {
    expect(indexHtml).not.toContain('commercial-investment-settle-date')
    expect(indexHtml).not.toContain('Update from latest quote')
    expect(appController).not.toContain('familyUsesQuoteSettleControls')
    expect(appController).not.toContain('commercialInvestmentSettleDateInput')
    expect(appController).not.toContain('commercialInvestmentUpdateQuoteButton')
  })

  it('uses fixed product field rows for amount, rates, and dates', () => {
    expect(indexHtml).toContain('id="investment-dkj-wrap"')
    expect(indexHtml).toMatch(
      /id="dkj-face-value-wrap"[\s\S]*?id="dkj-settlement-date-wrap"[\s\S]*?id="dkj-purchase-price-pct-wrap"[\s\S]*?id="dkj-term-months-wrap"[\s\S]*?id="dkj-remaining-days-wrap"[\s\S]*?id="dkj-maturity-date-wrap"/
    )
    expect(indexHtml).toMatch(
      /id="pmap-principal-wrap"[\s\S]*?id="pmap-purchase-date-wrap"[\s\S]*?id="pmap-previous-year-inflation-pct-wrap"[\s\S]*?id="pmap-interest-premium-pct-wrap"[\s\S]*?id="pmap-issue-date-wrap"[\s\S]*?id="pmap-start-date-wrap"[\s\S]*?id="pmap-first-coupon-date-wrap"/
    )
    expect(indexHtml).toMatch(
      /id="bmap-principal-wrap"[\s\S]*?id="bmap-purchase-date-wrap"[\s\S]*?id="bmap-dkj-base-yield-pct-wrap"[\s\S]*?id="bmap-interest-premium-pct-wrap"[\s\S]*?id="bmap-issue-date-wrap"[\s\S]*?id="bmap-start-date-wrap"[\s\S]*?id="bmap-first-coupon-date-wrap"/
    )
  })

  it('clears market series selection at the start of commercial investment edit', () => {
    expect(appController).toMatch(/function startCommercialInvestmentEdit/)
    const editFn = appController.slice(
      appController.indexOf('function startCommercialInvestmentEdit'),
      appController.indexOf('function startInvestmentEdit')
    )
    expect(editFn).toContain('clearCommercialMarketSelection()')
    expect(editFn.indexOf('clearCommercialMarketSelection()')).toBeLessThan(
      editFn.indexOf('applyCommercialInvestmentProductUi')
    )
  })

  it('defaults PMÁP/BMÁP purchase dates via ensureDefaultPurchaseDate', () => {
    expect(appController).toContain('ensureDefaultPurchaseDate(pmapPurchaseDateInput)')
    expect(appController).toContain('ensureDefaultPurchaseDate(bmapPurchaseDateInput)')
  })

  it('wires series + purchase/settlement autofill and auto chrome sync', () => {
    expect(appController).toContain('formatSeriesAvailabilityLabel')
    expect(appController).toContain('syncCommercialMarketFieldChrome')
    expect(appController).toContain('clearCommercialMarketSourcedFields')
    expect(appController).toContain('bindCommercialPurchaseSettlementAutofill')
    expect(appController).toContain('decideMarketAutofillAction')
    expect(appController).toContain('resolveQuoteForPurchaseDate')
    expect(appController).not.toContain('Auto-filled from market data:')
    expect(appController).toContain("firstCouponDate: '#bmap-first-coupon-date'")
    expect(appController).toContain("dkjBaseYieldPct: '#bmap-dkj-base-yield-pct'")
    expect(appController).toContain(
      "previousYearAverageInflationPct: '#pmap-previous-year-inflation-pct'"
    )
  })
})
