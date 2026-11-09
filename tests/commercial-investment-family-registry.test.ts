import { describe, expect, it } from 'vitest'
import {
  getCommercialInvestmentFamily,
  listCommercialInvestmentFamilies,
  listCommercialInvestmentFamilyCodes,
  resolveCommercialInvestmentProductCodeFromBundle,
  applyCommercialInvestmentLivePreview,
  buildMarketMarketableRequiredFields,
  COUPON_BEARING_MARKETABLE_REQUIRED_FIELDS
} from '../public/controller/commercial-investment-family-registry.js'
import { MARKET_MARKETABLE_REQUIRED_FIELDS } from '../public/controller/market-data-autofill.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  couponBearingDomPrefix,
  buildCouponBearingMarketFieldSelectors,
  buildCouponBearingInputIds,
  buildCouponBearingFieldLabelClass,
  buildCouponBearingPurchaseOrSettlementSelector,
  parseCouponScheduleField
} from '../public/controller/commercial-investment-coupon-profile.js'
import { buildCommercialInvestmentProductOptions } from '../public/controller/investment-product-metadata.js'
import { BMAP_PRODUCT_SPEC } from '../public/controller/bmap-form.js'
import { DKJ_PRODUCT_SPEC } from '../public/controller/dkj-form.js'
import { FIXMAP_PRODUCT_SPEC } from '../public/controller/fixmap-form.js'
import { MAPP_PRODUCT_SPEC } from '../public/controller/mapp-form.js'
import { BABA_PRODUCT_SPEC } from '../public/controller/baba-form.js'
import { PMAP_PRODUCT_SPEC } from '../public/controller/pmap-form.js'

const PICKER_STATUSES = new Set([
  'schedule-usable',
  'commercially-usable',
  'fully-spec-backed'
])

describe('commercial investment family registry (ADR 0040)', () => {
  it('looks up registered families by productCode', () => {
    expect(getCommercialInvestmentFamily('dkj')?.productSpec.id).toBe(DKJ_PRODUCT_SPEC.id)
    expect(getCommercialInvestmentFamily('pmap')?.productSpec.id).toBe(PMAP_PRODUCT_SPEC.id)
    expect(getCommercialInvestmentFamily('bmap')?.productSpec.id).toBe(BMAP_PRODUCT_SPEC.id)
    expect(getCommercialInvestmentFamily('fixmap')?.productSpec.id).toBe(FIXMAP_PRODUCT_SPEC.id)
    expect(getCommercialInvestmentFamily('mapp')?.productSpec.id).toBe(MAPP_PRODUCT_SPEC.id)
    expect(getCommercialInvestmentFamily('baba')?.productSpec.id).toBe(BABA_PRODUCT_SPEC.id)
  })

  it('returns null for unsupported product codes', () => {
    expect(getCommercialInvestmentFamily('emap')).toBeNull()
    expect(getCommercialInvestmentFamily('regular-bond')).toBeNull()
    expect(getCommercialInvestmentFamily('')).toBeNull()
    expect(getCommercialInvestmentFamily(undefined as unknown as string)).toBeNull()
  })

  it('assigns composerProfile discount vs coupon-bearing', () => {
    expect(getCommercialInvestmentFamily('dkj')?.composerProfile).toBe('discount')
    expect(getCommercialInvestmentFamily('pmap')?.composerProfile).toBe('coupon-bearing')
    expect(getCommercialInvestmentFamily('bmap')?.composerProfile).toBe('coupon-bearing')
    expect(getCommercialInvestmentFamily('fixmap')?.composerProfile).toBe('coupon-bearing')
    expect(getCommercialInvestmentFamily('mapp')?.composerProfile).toBe('coupon-bearing')
    expect(getCommercialInvestmentFamily('baba')?.composerProfile).toBe('coupon-bearing')
  })

  it('lists registered family codes including FixMÁP, MÁP Plusz, and Babakötvény', () => {
    const codes = listCommercialInvestmentFamilyCodes()
    expect(codes.sort()).toEqual(['baba', 'bmap', 'dkj', 'fixmap', 'mapp', 'pmap'])
    expect(listCommercialInvestmentFamilies()).toHaveLength(6)
  })

  it('resolves productCode from bundle productSpec id or subtype', () => {
    expect(
      resolveCommercialInvestmentProductCodeFromBundle({
        productId: DKJ_PRODUCT_SPEC.id,
        config: {}
      })
    ).toBe('dkj')
    expect(
      resolveCommercialInvestmentProductCodeFromBundle({
        config: { productId: PMAP_PRODUCT_SPEC.id }
      })
    ).toBe('pmap')
    expect(
      resolveCommercialInvestmentProductCodeFromBundle({
        config: { subtype: 'bmap' }
      })
    ).toBe('bmap')
    expect(
      resolveCommercialInvestmentProductCodeFromBundle({
        productId: FIXMAP_PRODUCT_SPEC.id,
        config: { subtype: 'fixmap' }
      })
    ).toBe('fixmap')
    expect(
      resolveCommercialInvestmentProductCodeFromBundle({
        productId: MAPP_PRODUCT_SPEC.id,
        config: { subtype: 'mapp' }
      })
    ).toBe('mapp')
    expect(
      resolveCommercialInvestmentProductCodeFromBundle({
        productId: BABA_PRODUCT_SPEC.id,
        config: { subtype: 'baba' }
      })
    ).toBe('baba')
    expect(resolveCommercialInvestmentProductCodeFromBundle(null)).toBeNull()
    expect(
      resolveCommercialInvestmentProductCodeFromBundle({
        config: { subtype: 'unknown' }
      })
    ).toBeNull()
  })

  it('keeps registry keys aligned with the commercial investment picker', () => {
    const pickerCodes = buildCommercialInvestmentProductOptions().map((entry) => entry.value)
    const registryCodes = listCommercialInvestmentFamilyCodes()
    expect(new Set(registryCodes)).toEqual(new Set(pickerCodes))
    expect(pickerCodes).toContain('fixmap')
    expect(pickerCodes).toContain('mapp')
    expect(pickerCodes).toContain('baba')
  })

  it('derives coupon-bearing selectors/inputIds from shared profile helpers', () => {
    for (const code of ['pmap', 'bmap', 'fixmap', 'mapp', 'baba'] as const) {
      const prefix = couponBearingDomPrefix(code)
      const entry = getCommercialInvestmentFamily(code)
      expect(entry?.composerProfile).toBe('coupon-bearing')
      expect(entry?.fieldLabelClass).toBe(buildCouponBearingFieldLabelClass(prefix))
      expect(entry?.inputIds).toEqual(buildCouponBearingInputIds(prefix))
      expect(entry?.marketFieldSelectors).toEqual(buildCouponBearingMarketFieldSelectors(prefix))
      expect(entry?.purchaseOrSettlementSelector).toBe(
        buildCouponBearingPurchaseOrSettlementSelector(prefix)
      )
      expect(entry?.marketFieldSelectors).toEqual({
        annualCouponRatePct: `#${code}-annual-coupon-rate-pct`,
        maturityDate: `#${code}-maturity-date`,
        issueDate: `#${code}-issue-date`,
        firstCouponDate: `#${code}-first-coupon-date`,
        couponSchedule: `#${code}-coupon-schedule`,
        couponFrequencyMonths: `#${code}-coupon-frequency-months`,
        dayCountConvention: `#${code}-day-count-convention`
      })
      expect(entry?.inputIds).toEqual([
        `${code}-principal`,
        `${code}-annual-coupon-rate-pct`,
        `${code}-maturity-date`,
        `${code}-purchase-date`,
        `${code}-issue-date`,
        `${code}-first-coupon-date`
      ])
    }
  })

  it('parses coupon schedule JSON via the shared coupon-profile helper', () => {
    expect(parseCouponScheduleField('')).toBeUndefined()
    expect(parseCouponScheduleField('[]')).toBeUndefined()
    expect(parseCouponScheduleField('not-json')).toBeUndefined()
    expect(parseCouponScheduleField('[{"ratePct":5}]')).toEqual([{ ratePct: 5 }])
  })

  it('exposes marketableRequiredFields + calculateFromSpecInputs + hostWrapId on every family', () => {
    for (const entry of listCommercialInvestmentFamilies()) {
      expect(entry.hostWrapId).toBe(`investment-${entry.productCode}-wrap`)
      expect(PICKER_STATUSES.has(entry.migrationStatus)).toBe(true)
      expect(Array.isArray(entry.marketableRequiredFields)).toBe(true)
      expect(entry.marketableRequiredFields.length).toBeGreaterThan(0)
      expect(typeof entry.calculateFromSpecInputs).toBe('function')
      expect(typeof entry.mapFormDataToSpecInputs).toBe('function')
    }
    expect(getCommercialInvestmentFamily('mapp')?.migrationStatus).toBe('fully-spec-backed')
    expect(getCommercialInvestmentFamily('mapp')?.hostWrapId).toBe('investment-mapp-wrap')
    expect(getCommercialInvestmentFamily('baba')?.migrationStatus).toBe('fully-spec-backed')
    expect(getCommercialInvestmentFamily('baba')?.hostWrapId).toBe('investment-baba-wrap')
    expect(getCommercialInvestmentFamily('dkj')?.marketableRequiredFields).toEqual([
      'purchasePricePct',
      'termMonths',
      'maturityDate',
      'remainingDays'
    ])
    expect(getCommercialInvestmentFamily('pmap')?.marketableRequiredFields).toEqual([
      ...COUPON_BEARING_MARKETABLE_REQUIRED_FIELDS
    ])
    expect(getCommercialInvestmentFamily('baba')?.marketableRequiredFields).toEqual([
      ...COUPON_BEARING_MARKETABLE_REQUIRED_FIELDS
    ])
  })

  it('derives MARKET_MARKETABLE_REQUIRED_FIELDS from the registry', () => {
    expect(MARKET_MARKETABLE_REQUIRED_FIELDS).toEqual(buildMarketMarketableRequiredFields())
    expect(Object.keys(MARKET_MARKETABLE_REQUIRED_FIELDS).sort()).toEqual([
      'baba',
      'bmap',
      'dkj',
      'fixmap',
      'mapp',
      'pmap'
    ])
  })

  it('applies discount vs coupon-bearing live preview via registry helpers', () => {
    const purchasePreviewInput = { value: '' }
    const maturityPreviewInput = { value: '' }
    const gainPreviewInput = { value: '' }
    const discountYieldPreviewInput = { value: '' }
    const discountCurrentValuePreviewInput = { value: '' }
    const inflationSchedulePreviewInput = { value: '' }
    const remainingDays = { value: '' }
    const form = {
      querySelector(selector: string) {
        if (selector === '#dkj-remaining-days') return remainingDays
        return null
      }
    } as unknown as HTMLFormElement

    const dkj = getCommercialInvestmentFamily('dkj')!
    const originalMap = dkj.mapFormDataToSpecInputs
    const originalCalc = dkj.calculateFromSpecInputs
    dkj.mapFormDataToSpecInputs = () => ({
      faceValue: 10000,
      purchasePricePct: 95,
      termMonths: 12,
      settlementDate: '2026-01-01',
      maturityDate: '2026-12-31'
    })
    dkj.calculateFromSpecInputs = () => ({
      purchaseAmount: 9500,
      redemptionValue: 10000,
      grossGain: 500,
      remainingDays: 364,
      annualizedYieldPct: 5.1234,
      simpleReturnPct: 5.2631
    })
    expect(
      applyCommercialInvestmentLivePreview(
        dkj,
        form,
        {
          purchasePreviewInput,
          maturityPreviewInput,
          gainPreviewInput,
          discountYieldPreviewInput,
          discountCurrentValuePreviewInput,
          inflationSchedulePreviewInput
        },
        { formatMoneyAmount: (n: number) => String(n), formData: {} }
      )
    ).toBe(true)
    expect(purchasePreviewInput.value).toBe('9500')
    expect(maturityPreviewInput.value).toBe('10000')
    expect(gainPreviewInput.value).toBe('500')
    expect(remainingDays.value).toBe('364')
    expect(discountYieldPreviewInput.value).toBe('5.1234%')
    expect(inflationSchedulePreviewInput.value).toBe('—')
    dkj.mapFormDataToSpecInputs = originalMap
    dkj.calculateFromSpecInputs = originalCalc

    const pmap = getCommercialInvestmentFamily('pmap')!
    const pmapMap = pmap.mapFormDataToSpecInputs
    const pmapCalc = pmap.calculateFromSpecInputs
    pmap.mapFormDataToSpecInputs = () => ({ principal: 100000 })
    pmap.calculateFromSpecInputs = () => ({
      purchaseAmount: 100500,
      annualCouponRatePct: 6.5
    })
    expect(
      applyCommercialInvestmentLivePreview(
        pmap,
        form,
        {
          purchasePreviewInput,
          maturityPreviewInput,
          gainPreviewInput,
          discountYieldPreviewInput,
          discountCurrentValuePreviewInput,
          inflationSchedulePreviewInput
        },
        { formatMoneyAmount: (n: number) => String(n), formData: {} }
      )
    ).toBe(true)
    expect(maturityPreviewInput.value).toBe('100000')
    expect(gainPreviewInput.value).toBe('-500')
    expect(inflationSchedulePreviewInput.value).toBe('6.5000%')
    expect(discountYieldPreviewInput.value).toBe('—')
    pmap.mapFormDataToSpecInputs = pmapMap
    pmap.calculateFromSpecInputs = pmapCalc
  })

  it('keeps commercial preview dispatch registry-driven (no subtype forests in previews.js)', () => {
    const previewsSrc = readFileSync(
      resolve(process.cwd(), 'public/controller/previews.js'),
      'utf8'
    )
    expect(previewsSrc).toContain('getCommercialInvestmentFamily')
    expect(previewsSrc).toContain('applyCommercialInvestmentLivePreview')
    expect(previewsSrc).not.toMatch(/subtype\s*===\s*['"]dkj['"]/)
    expect(previewsSrc).not.toMatch(/subtype\s*===\s*['"]pmap['"]/)
    expect(previewsSrc).not.toMatch(/subtype\s*===\s*['"]bmap['"]/)
    expect(previewsSrc).not.toMatch(/subtype\s*===\s*['"]fixmap['"]/)
    expect(previewsSrc).not.toMatch(/subtype\s*===\s*['"]mapp['"]/)
    expect(previewsSrc).not.toMatch(/subtype\s*===\s*['"]baba['"]/)
  })
})
