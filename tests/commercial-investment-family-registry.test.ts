import { describe, expect, it } from 'vitest'
import {
  getCommercialInvestmentFamily,
  listCommercialInvestmentFamilies,
  listCommercialInvestmentFamilyCodes,
  resolveCommercialInvestmentProductCodeFromBundle
} from '../public/controller/commercial-investment-family-registry.js'
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
import { PMAP_PRODUCT_SPEC } from '../public/controller/pmap-form.js'

describe('commercial investment family registry (ADR 0040)', () => {
  it('looks up registered families by productCode', () => {
    expect(getCommercialInvestmentFamily('dkj')?.productSpec.id).toBe(DKJ_PRODUCT_SPEC.id)
    expect(getCommercialInvestmentFamily('pmap')?.productSpec.id).toBe(PMAP_PRODUCT_SPEC.id)
    expect(getCommercialInvestmentFamily('bmap')?.productSpec.id).toBe(BMAP_PRODUCT_SPEC.id)
    expect(getCommercialInvestmentFamily('fixmap')?.productSpec.id).toBe(FIXMAP_PRODUCT_SPEC.id)
  })

  it('returns null for unsupported product codes', () => {
    expect(getCommercialInvestmentFamily('mapp')).toBeNull()
    expect(getCommercialInvestmentFamily('regular-bond')).toBeNull()
    expect(getCommercialInvestmentFamily('')).toBeNull()
    expect(getCommercialInvestmentFamily(undefined as unknown as string)).toBeNull()
  })

  it('assigns composerProfile discount vs coupon-bearing', () => {
    expect(getCommercialInvestmentFamily('dkj')?.composerProfile).toBe('discount')
    expect(getCommercialInvestmentFamily('pmap')?.composerProfile).toBe('coupon-bearing')
    expect(getCommercialInvestmentFamily('bmap')?.composerProfile).toBe('coupon-bearing')
    expect(getCommercialInvestmentFamily('fixmap')?.composerProfile).toBe('coupon-bearing')
  })

  it('lists registered family codes including FixMÁP', () => {
    const codes = listCommercialInvestmentFamilyCodes()
    expect(codes.sort()).toEqual(['bmap', 'dkj', 'fixmap', 'pmap'])
    expect(listCommercialInvestmentFamilies()).toHaveLength(4)
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
  })

  it('derives coupon-bearing selectors/inputIds from shared profile helpers', () => {
    for (const code of ['pmap', 'bmap', 'fixmap'] as const) {
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
})
