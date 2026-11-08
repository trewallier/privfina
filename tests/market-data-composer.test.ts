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
  const commercialHost = readFileSync(
    resolve(process.cwd(), 'public/controller/commercial-investment-composer-host.js'),
    'utf8'
  )
  const commercialFamilyRegistry = readFileSync(
    resolve(process.cwd(), 'public/controller/commercial-investment-family-registry.js'),
    'utf8'
  )
  const commercialCouponProfile = readFileSync(
    resolve(process.cwd(), 'public/controller/commercial-investment-coupon-profile.js'),
    'utf8'
  )

  it('does not render catalog readiness / migration-status copy', () => {
    expect(indexHtml).not.toContain('commercial-investment-readiness-hint')
    expect(indexHtml).not.toMatch(/Readiness:\s*fully-spec-backed/)
    expect(appController).not.toContain('resolveCommercialInvestmentReadinessHint')
    expect(commercialHost).not.toContain('resolveCommercialInvestmentReadinessHint')
  })

  it('removes quote settle date and update-from-latest controls', () => {
    expect(indexHtml).not.toContain('commercial-investment-settle-date')
    expect(indexHtml).not.toContain('Update from latest quote')
    expect(appController).not.toContain('familyUsesQuoteSettleControls')
    expect(appController).not.toContain('commercialInvestmentSettleDateInput')
    expect(appController).not.toContain('commercialInvestmentUpdateQuoteButton')
    expect(commercialHost).not.toContain('familyUsesQuoteSettleControls')
    expect(commercialHost).not.toContain('commercialInvestmentSettleDateInput')
    expect(commercialHost).not.toContain('commercialInvestmentUpdateQuoteButton')
  })

  it('uses fixed product field rows for amount, rates, and dates', () => {
    expect(indexHtml).toContain('id="investment-dkj-wrap"')
    expect(indexHtml).toMatch(
      /id="dkj-face-value-wrap"[\s\S]*?id="dkj-settlement-date-wrap"[\s\S]*?id="dkj-purchase-price-pct-wrap"[\s\S]*?id="dkj-term-months-wrap"[\s\S]*?id="dkj-maturity-date-wrap"[\s\S]*?id="dkj-remaining-days-wrap"/
    )
    expect(indexHtml).toMatch(
      /id="pmap-principal-wrap"[\s\S]*?id="pmap-purchase-date-wrap"[\s\S]*?id="pmap-annual-coupon-rate-pct-wrap"[\s\S]*?id="pmap-maturity-date-wrap"[\s\S]*?id="pmap-issue-date-wrap"[\s\S]*?id="pmap-first-coupon-date-wrap"/
    )
    expect(indexHtml).toMatch(
      /id="fixmap-principal-wrap"[\s\S]*?id="fixmap-purchase-date-wrap"[\s\S]*?id="fixmap-annual-coupon-rate-pct-wrap"[\s\S]*?id="fixmap-maturity-date-wrap"[\s\S]*?id="fixmap-issue-date-wrap"[\s\S]*?id="fixmap-first-coupon-date-wrap"/
    )
    expect(indexHtml).toMatch(
      /id="bmap-principal-wrap"[\s\S]*?id="bmap-purchase-date-wrap"[\s\S]*?id="bmap-annual-coupon-rate-pct-wrap"[\s\S]*?id="bmap-maturity-date-wrap"[\s\S]*?id="bmap-issue-date-wrap"[\s\S]*?id="bmap-first-coupon-date-wrap"/
    )
  })

  it('clears market series selection at the start of commercial investment edit', () => {
    expect(commercialHost).toMatch(/function startEdit/)
    const start = commercialHost.indexOf('function startEdit')
    const nextFn = commercialHost.indexOf('\n  function ', start + 1)
    const editFn = commercialHost.slice(start, nextFn === -1 ? undefined : nextFn)
    expect(editFn).toContain('clearCommercialMarketSelection()')
    expect(editFn.indexOf('clearCommercialMarketSelection()')).toBeLessThan(
      editFn.indexOf('applyCommercialInvestmentProductUi')
    )
  })

  it('defaults coupon-bearing purchase dates via ensureDefaultPurchaseDate + registry profile', () => {
    expect(commercialHost).toContain("entry.composerProfile === 'coupon-bearing'")
    expect(commercialHost).toContain(
      'ensureDefaultPurchaseDate(commercialPurchaseOrSettlementInput(code))'
    )
    expect(commercialFamilyRegistry).toContain("composerProfile: 'coupon-bearing'")
    expect(commercialFamilyRegistry).toContain('buildCouponBearingPurchaseOrSettlementSelector')
    expect(commercialFamilyRegistry).toContain("productCode: 'pmap'")
    expect(commercialFamilyRegistry).toContain("productCode: 'bmap'")
    expect(commercialFamilyRegistry).toContain("productCode: 'fixmap'")
  })

  it('wires series + purchase/settlement autofill, stale clear, and apply-token guard', () => {
    expect(commercialHost).toContain('formatSeriesOptionLabel')
    expect(commercialHost).toContain('budapestTodayIso')
    expect(commercialHost).toContain('syncCommercialMarketFieldChrome')
    expect(commercialHost).toContain('clearCommercialMarketSourcedFields')
    expect(commercialHost).toContain('clearMarketableFieldsMissingFromPatch')
    expect(commercialHost).toContain('marketableFieldsMissingFromPatch')
    expect(commercialHost).toContain('bindCommercialPurchaseSettlementAutofill')
    expect(commercialHost).toContain('resolveQuoteForPurchaseDate')
    expect(commercialHost).toContain('loadPriceCalendar')
    expect(commercialHost).toContain('loadOffering')
    expect(commercialHost).toContain('setCommercialMarketAttribution')
    expect(commercialHost).toContain('formatPurchaseOutsideSaleWindowHint')
    expect(commercialHost).toContain('resolveSaleWindow')
    expect(commercialHost).toContain('formatOfferingAttributionDisclaimer')
    expect(commercialHost).toContain('offeringsById')
    expect(commercialHost).toContain('priceCalendar')
    expect(commercialHost).toContain('clampReason')
    expect(commercialHost).toContain('assertCommercialInvestmentDenomination')
    expect(commercialHost).toContain('commercialMarketApplyToken')
    expect(commercialHost).toContain('getCommercialInvestmentFamily')
    expect(commercialHost).toMatch(
      /async function applyCommercialMarketSelection\(\) \{[\s\S]*?const token = \+\+commercialMarketApplyToken/
    )
    expect(commercialHost).not.toContain('decideMarketAutofillAction')
    expect(commercialHost).not.toContain('preserveSeriesId')
    expect(commercialHost).not.toContain('Auto-filled from market data:')
    expect(commercialHost).not.toMatch(/productCode\s*===\s*['"]dkj['"]/)
    expect(commercialHost).not.toMatch(/productCode\s*===\s*['"]pmap['"]/)
    expect(commercialHost).not.toMatch(/productCode\s*===\s*['"]bmap['"]/)
    expect(commercialHost).not.toMatch(/productCode\s*===\s*['"]fixmap['"]/)
    expect(commercialHost).toContain('entry.hostWrapId')
    expect(commercialHost).toContain('entry?.fieldLabelClass')
    expect(commercialHost).toContain('entry?.marketableRequiredFields')
    expect(commercialHost).not.toContain('MARKET_MARKETABLE_REQUIRED_FIELDS')
    expect(commercialHost).not.toContain('calculateDkjFromSpecInputs')
    expect(commercialHost).not.toContain('.dkj-field-label, .pmap-field-label')
    expect(commercialFamilyRegistry).toContain('buildCouponBearingMarketFieldSelectors')
    expect(commercialFamilyRegistry).toContain('commercial-investment-coupon-profile.js')
    expect(commercialFamilyRegistry).toContain('applyCommercialInvestmentLivePreview')
    expect(commercialFamilyRegistry).toContain('marketableRequiredFields')
    expect(commercialFamilyRegistry).toContain('calculateFromSpecInputs')
    expect(commercialCouponProfile).toContain('annualCouponRatePct: `#${prefix}-annual-coupon-rate-pct`')
    expect(commercialCouponProfile).toContain('maturityDate: `#${prefix}-maturity-date`')
    expect(commercialCouponProfile).toContain(
      'dayCountConvention: `#${prefix}-day-count-convention`'
    )
    expect(commercialCouponProfile).toContain('firstCouponDate: `#${prefix}-first-coupon-date`')
    expect(commercialHost).not.toContain('bmap-dkj-base-yield-pct')
    expect(commercialHost).not.toContain('pmap-previous-year-inflation-pct')
    expect(indexHtml).toContain('id="commercial-investment-market-attribution"')
    expect(indexHtml).toContain('id="pmap-day-count-convention"')
    expect(indexHtml).toContain('id="fixmap-day-count-convention"')
    expect(indexHtml).toContain('id="bmap-day-count-convention"')
  })
})
