import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  browserTodayIso,
  ensureDefaultPurchaseDateValue,
  familyUsesQuoteSettleControls,
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

  it('limits quote settle controls to DKJ (PMÁP/BMÁP use series fields only)', () => {
    expect(familyUsesQuoteSettleControls('dkj')).toBe(true)
    expect(familyUsesQuoteSettleControls('pmap')).toBe(false)
    expect(familyUsesQuoteSettleControls('bmap')).toBe(false)
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
})
