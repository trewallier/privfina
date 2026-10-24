import { describe, expect, it } from 'vitest'
import {
  HOME_SAVINGS_PRODUCTS,
  buildHomeSavingsProductOptions,
  findHomeSavingsProduct,
  findHomeSavingsProductById,
  resolveHomeSavingsReadinessHint
} from '../public/controller/home-savings-product-metadata.js'
import { mapFormDataToHomeSavingsSpecInputs } from '../public/controller/home-savings-form.js'
import {
  calculateHomeSavingsFromSpecInputs,
  mapHomeSavingsSpecInputsToBundleInput
} from '../public/controller/home-savings-calculation-adapter.js'
import { createHomeSavingsInstrumentBundle } from '../public/instruments.js'

describe('home-savings schedule-usable metadata', () => {
  it('exposes PRÉMIUM PLUSZ 10x30 for the commercial home-savings picker', () => {
    const codes = HOME_SAVINGS_PRODUCTS.map((entry) => entry.productCode)
    expect(codes).toEqual(['premium-plusz-10x30'])
    expect(buildHomeSavingsProductOptions()).toHaveLength(1)
    expect(findHomeSavingsProduct('premium-plusz-10x30')?.migrationStatus).toBe('schedule-usable')
    expect(
      findHomeSavingsProductById('home-savings.premium-plusz-10x30.standard')?.displayName
    ).toMatch(/PRÉMIUM PLUSZ 10x30/)
    expect(resolveHomeSavingsReadinessHint('schedule-usable')).toMatch(/schedule-usable/)
  })

  it('maps form inputs to stamped product lineage and customer-perspective schedule', () => {
    const product = findHomeSavingsProduct('premium-plusz-10x30')
    expect(product).toBeTruthy()

    const specInputs = mapFormDataToHomeSavingsSpecInputs(
      {
        get(name: string) {
          const entries: Record<string, string> = {
            monthlyDeposit: '50000',
            termMonths: '120',
            startDate: '2026-10-10',
            housingPurpose: 'on',
            openingFeeMode: 'promo-fixed-65000'
          }
          return Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : null
        }
      } as FormData,
      product!
    )

    const legacy = mapHomeSavingsSpecInputsToBundleInput(specInputs, {
      label: 'LTP test'
    })

    expect(legacy.productId).toBe('home-savings.premium-plusz-10x30.standard')
    expect(legacy.productSpecVersion).toBe('v2alpha1')
    expect(legacy.monthlyDeposit).toBe(50_000)
    expect(legacy.termMonths).toBe(120)
    expect(legacy.accountOpeningFee).toBe(65_000)
    expect(legacy.accountFeeMonthly).toBe(500)
    expect(legacy.housingPurpose).toBe(true)
    expect(legacy.depositInterestAnnualRatePct).toBe(0.1)
    expect(legacy.contractAmount).toBe(13_000_000)
  })

  it('creates/persists a browser bundle with opening fee, deposits, fees, and terminal Premium inflow', () => {
    const product = findHomeSavingsProduct('premium-plusz-10x30')
    const outputs = calculateHomeSavingsFromSpecInputs(
      {
        productCode: product!.productCode,
        monthlyDeposit: 50_000,
        termMonths: 120,
        startDate: '2026-10-10',
        housingPurpose: true,
        openingFeeMode: 'promo-fixed-65000'
      },
      { createHomeSavingsInstrumentBundle, label: 'Schedule-usable LTP' }
    )

    expect(outputs.accountOpeningFee).toBe(65_000)
    expect(outputs.totalDeposits).toBe(6_000_000)
    expect(outputs.totalAccountFees).toBe(60_000)
    expect(outputs.premiumRatePct).toBe(30)
    expect(outputs.premiumAmount).toBe(1_800_000)
    expect(outputs.depositInterest).toBe(30_286)
    expect(outputs.terminalPayout).toBe(7_830_286)
    expect(outputs.productId).toBe('home-savings.premium-plusz-10x30.standard')
    expect(outputs.productSpecVersion).toBe('v2alpha1')

    const bundle = outputs.bundle
    expect(bundle.instrumentType).toBe('home-savings')
    expect(bundle.productId).toBe('home-savings.premium-plusz-10x30.standard')
    expect(bundle.productSpecVersion).toBe('v2alpha1')
    expect(bundle.config.openingFeeMode).toBe('promo-fixed-65000')

    const opening = bundle.generatedFlows.filter(
      (flow: { description?: string }) => flow.description === 'Account opening fee'
    )
    const deposits = bundle.generatedFlows.filter(
      (flow: { direction?: string; amount?: number }) =>
        flow.direction === 'outflow' && flow.amount === 50_000
    )
    const fees = bundle.generatedFlows.filter(
      (flow: { description?: string }) => flow.description === 'Account management fee'
    )
    const terminal = bundle.generatedFlows.filter(
      (flow: { description?: string }) => flow.description === 'Home-savings terminal payout'
    )

    expect(opening).toHaveLength(1)
    expect(opening[0].direction).toBe('outflow')
    expect(opening[0].amount).toBe(65_000)
    expect(deposits).toHaveLength(120)
    expect(fees).toHaveLength(120)
    expect(terminal).toHaveLength(1)
    expect(terminal[0].direction).toBe('inflow')
    expect(terminal[0].amount).toBe(7_830_286)
  })

  it('zeros Premium when housing purpose is not assumed', () => {
    const outputs = calculateHomeSavingsFromSpecInputs(
      {
        productCode: 'premium-plusz-10x30',
        monthlyDeposit: 50_000,
        termMonths: 120,
        startDate: '2026-10-10',
        housingPurpose: false,
        openingFeeMode: 'standard-1pct'
      },
      { createHomeSavingsInstrumentBundle }
    )

    expect(outputs.accountOpeningFee).toBe(130_000)
    expect(outputs.premiumRatePct).toBe(0)
    expect(outputs.premiumAmount).toBe(0)
    expect(outputs.terminalPayout).toBe(6_000_000 + 30_286)
  })
})
