import { describe, expect, it } from 'vitest'
import {
  buildSpecBackedInvestmentSubtypeOptions,
  buildSpecBackedInvestmentSubtypeUiConfig
} from '../public/controller/investment-product-metadata.js'
import { buildGenericBondSubtypeUiConfig } from '../public/controller/generic-bond-presentation.js'
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

  it('marks catalog products as dedicated-host presentations', () => {
    const config = buildSpecBackedInvestmentSubtypeUiConfig()
    expect(config.bmap.usesDedicatedHost).toBe(true)
    expect(config.dkj.usesDedicatedHost).toBe(true)
    expect(config.pmap.usesDedicatedHost).toBe(true)
    expect(config.bmap.hostId).toBe('investment-bmap-wrap')
    expect(config.dkj.hostId).toBe('investment-dkj-wrap')
    expect(config.pmap.hostId).toBe('investment-pmap-wrap')
  })

  it('keeps catalog field descriptions aligned with embedded product specs', () => {
    const config = buildSpecBackedInvestmentSubtypeUiConfig()
    expect(config.dkj.fields.faceValue.label).toBe(inputByName(DKJ_PRODUCT_SPEC, 'faceValue')?.label)
    expect(config.dkj.fields.faceValue.description).toBe(
      inputByName(DKJ_PRODUCT_SPEC, 'faceValue')?.description
    )
    expect(config.pmap.fields.previousYearAverageInflationPct.required).toBe(
      inputByName(PMAP_PRODUCT_SPEC, 'previousYearAverageInflationPct')?.required
    )
    expect(config.bmap.fields.dkjBaseYieldPct.description).toBe(
      inputByName(BMAP_PRODUCT_SPEC, 'dkjBaseYieldPct')?.description
    )
  })
})

describe('generic bond presentation module', () => {
  it('exposes required/visible/help metadata for all generic subtypes', () => {
    const config = buildGenericBondSubtypeUiConfig()
    for (const subtype of [
      'regular-bond',
      'discount-bond',
      'inflation-linked-bond',
      'custom-bond'
    ]) {
      expect(config[subtype].fields.principal.description).toBeTruthy()
      expect(config[subtype].fields.transactionDate).toBeTruthy()
      expect(config[subtype].visible.transactionDate).toBe(true)
      expect(config[subtype].required.transactionDate).toBe(true)
    }
    expect(config['discount-bond'].annualRateReadOnly).toBe(true)
    expect(config['discount-bond'].required.purchasePrice).toBe(true)
    expect(config['inflation-linked-bond'].required.yearlyInflation).toBe(true)
    expect(config['custom-bond'].required.couponPeriod).toBe(true)
  })
})
