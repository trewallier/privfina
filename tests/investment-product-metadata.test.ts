import { describe, expect, it } from 'vitest'
import {
  buildSpecBackedInvestmentSubtypeOptions,
  buildSpecBackedInvestmentSubtypeUiConfig
} from '../public/controller/investment-product-metadata.js'
import { BMAP_PRODUCT_SPEC } from '../public/controller/bmap-form.js'
import { DKJ_PRODUCT_SPEC } from '../public/controller/dkj-form.js'
import { PMAP_PRODUCT_SPEC } from '../public/controller/pmap-form.js'

function inputByName(spec: any, inputName: string) {
  return spec.inputs.find((entry: any) => entry.name === inputName)
}

describe('spec-backed investment metadata helper', () => {
  it('builds BMAP, DKJ, and PMAP subtype option labels from spec metadata', () => {
    const options = buildSpecBackedInvestmentSubtypeOptions()
    const optionByValue = new Map(options.map((entry) => [entry.value, entry]))

    expect(optionByValue.get('bmap')?.label).toBe(BMAP_PRODUCT_SPEC.ui.formTitle)
    expect(optionByValue.get('dkj')?.label).toBe(DKJ_PRODUCT_SPEC.ui.formTitle)
    expect(optionByValue.get('pmap')?.label).toBe(PMAP_PRODUCT_SPEC.ui.formTitle)
    expect(optionByValue.get('bmap')?.migrationStatus).toBe('fully-spec-backed')
    expect(optionByValue.get('dkj')?.migrationStatus).toBe('fully-spec-backed')
    expect(optionByValue.get('pmap')?.migrationStatus).toBe('fully-spec-backed')
  })

  it('derives BMAP required and label metadata from mapped spec fields', () => {
    const config = buildSpecBackedInvestmentSubtypeUiConfig().bmap

    expect(config.text.principalLabel).toBe(inputByName(BMAP_PRODUCT_SPEC, 'principal')?.label)
    expect(config.required.transactionDate).toBe(
      inputByName(BMAP_PRODUCT_SPEC, 'purchaseDate')?.required
    )
    expect(config.required.issueDate).toBe(inputByName(BMAP_PRODUCT_SPEC, 'issueDate')?.required)
    expect(config.required.couponPeriod).toBe(
      inputByName(BMAP_PRODUCT_SPEC, 'firstCouponDate')?.required
    )
  })

  it('derives DKJ required and label metadata from mapped spec fields', () => {
    const config = buildSpecBackedInvestmentSubtypeUiConfig().dkj

    expect(config.text.principalLabel).toBe(inputByName(DKJ_PRODUCT_SPEC, 'faceValue')?.label)
    expect(config.text.purchasePriceLabel).toBe(
      inputByName(DKJ_PRODUCT_SPEC, 'purchasePricePct')?.label
    )
    expect(config.required.transactionDate).toBe(
      inputByName(DKJ_PRODUCT_SPEC, 'settlementDate')?.required
    )
    expect(config.required.dueDate).toBe(inputByName(DKJ_PRODUCT_SPEC, 'maturityDate')?.required)
    expect(config.required.termMonths).toBe(inputByName(DKJ_PRODUCT_SPEC, 'termMonths')?.required)
    expect(config.required.remainingDays).toBe(
      inputByName(DKJ_PRODUCT_SPEC, 'remainingDays')?.required
    )
  })

  it('derives PMAP required and label metadata from mapped spec fields', () => {
    const config = buildSpecBackedInvestmentSubtypeUiConfig().pmap

    expect(config.text.principalLabel).toBe(inputByName(PMAP_PRODUCT_SPEC, 'principal')?.label)
    expect(config.required.issueDate).toBe(inputByName(PMAP_PRODUCT_SPEC, 'startDate')?.required)
    expect(config.required.transactionDate).toBe(
      inputByName(PMAP_PRODUCT_SPEC, 'purchaseDate')?.required
    )
    expect(config.required.dueDate).toBe(inputByName(PMAP_PRODUCT_SPEC, 'issueDate')?.required)
    expect(config.required.spreadRate).toBe(
      inputByName(PMAP_PRODUCT_SPEC, 'interestPremiumPct')?.required
    )
    expect(config.required.yearlyInflation).toBe(
      inputByName(PMAP_PRODUCT_SPEC, 'previousYearAverageInflationPct')?.required
    )
    expect(config.required.couponPeriod).toBe(
      inputByName(PMAP_PRODUCT_SPEC, 'firstCouponDate')?.required
    )
  })
})