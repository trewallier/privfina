import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
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
  calculateHomeSavingsScheduleFromSpecInputs,
  mapHomeSavingsSpecInputsToBundleInput
} from '../public/controller/home-savings-calculation-adapter.js'
import {
  createHomeSavingsInstrumentBundle,
  resolveHomeSavingsSchedule
} from '../public/instruments.js'
import {
  calculateHomeSavingsFromProductSpec,
  loadHomeSavingsProductSpec,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

function formDataFrom(entries: Record<string, string>): FormData {
  return {
    get(name: string) {
      return Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : null
    }
  } as FormData
}

describe('home-savings schedule-usable metadata', () => {
  it('exposes PRÉMIUM PLUSZ 10x30 for the commercial home-savings picker', () => {
    const codes = HOME_SAVINGS_PRODUCTS.map((entry) => entry.productCode)
    expect(codes).toEqual(['premium-plusz-10x30'])
    expect(buildHomeSavingsProductOptions()).toHaveLength(1)
    expect(findHomeSavingsProduct('premium-plusz-10x30')?.migrationStatus).toBe('schedule-usable')
    expect(findHomeSavingsProduct('premium-plusz-10x30')?.commerciallyBlockedReason).toMatch(
      /EBKM/i
    )
    expect(
      findHomeSavingsProductById('home-savings.premium-plusz-10x30.standard')?.displayName
    ).toMatch(/PRÉMIUM PLUSZ 10x30/)
    expect(resolveHomeSavingsReadinessHint('schedule-usable')).toMatch(/schedule-usable/)
  })

  it('maps form inputs to stamped product lineage and customer-perspective schedule', () => {
    const product = findHomeSavingsProduct('premium-plusz-10x30')
    expect(product).toBeTruthy()

    const specInputs = mapFormDataToHomeSavingsSpecInputs(
      formDataFrom({
        monthlyDeposit: '50000',
        termMonths: '120',
        startDate: '2026-10-10',
        housingPurpose: 'on',
        openingFeeMode: 'promo-fixed-65000'
      }),
      product!
    )

    const legacy = mapHomeSavingsSpecInputsToBundleInput(specInputs, {
      label: 'LTP test',
      description: 'User notes must not become deposit labels'
    })

    expect(legacy.productId).toBe('home-savings.premium-plusz-10x30.standard')
    expect(legacy.productCode).toBe('premium-plusz-10x30')
    expect(legacy.productSpecVersion).toBe('v2alpha1')
    expect(legacy.monthlyDeposit).toBe(50_000)
    expect(legacy.termMonths).toBe(120)
    expect(legacy.accountOpeningFee).toBe(65_000)
    expect(legacy.accountFeeMonthly).toBe(500)
    expect(legacy.housingPurpose).toBe(true)
    expect(legacy.depositInterestAnnualRatePct).toBe(0.1)
    expect(legacy.contractAmount).toBe(13_000_000)
    expect(legacy.description).toBe('User notes must not become deposit labels')
  })

  it('rejects promo opening-fee modes outside Hirdetmény deposit bands', () => {
    const product = findHomeSavingsProduct('premium-plusz-10x30')!
    expect(() =>
      mapFormDataToHomeSavingsSpecInputs(
        formDataFrom({
          monthlyDeposit: '20000',
          termMonths: '120',
          startDate: '2026-10-10',
          housingPurpose: 'on',
          openingFeeMode: 'promo-fixed-65000'
        }),
        product
      )
    ).toThrow(/50 000|50000/)

    expect(() =>
      mapFormDataToHomeSavingsSpecInputs(
        formDataFrom({
          monthlyDeposit: '60000',
          termMonths: '120',
          startDate: '2026-10-10',
          housingPurpose: 'on',
          openingFeeMode: 'promo-half-percent'
        }),
        product
      )
    ).toThrow(/49 990|49990/)
  })

  it('rejects explicit contractAmount that does not map to monthlyDeposit', () => {
    const product = findHomeSavingsProduct('premium-plusz-10x30')!
    const specInputs = mapFormDataToHomeSavingsSpecInputs(
      formDataFrom({
        monthlyDeposit: '50000',
        termMonths: '120',
        startDate: '2026-10-10',
        housingPurpose: 'on',
        openingFeeMode: 'promo-fixed-65000',
        contractAmount: '26000000'
      }),
      product
    )

    expect(() => mapHomeSavingsSpecInputsToBundleInput(specInputs)).toThrow(/maps to monthly deposit/)
  })

  it('creates/persists a browser bundle with productCode and fixed deposit flow labels', () => {
    const example = YAML.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/maturity-premium-120.yaml'
        ),
        'utf8'
      )
    ) as {
      inputs: {
        monthlyDeposit: number
        termMonths: number
        startDate: string
        housingPurpose: boolean
        openingFeeMode: string
      }
      expected: {
        accountOpeningFee: number
        totalDeposits: number
        totalAccountFees: number
        premiumRatePct: number
        premiumAmount: number
        contractAmount: number
        maturityPayoutDate: string
        engineDepositInterest: number
        engineTerminalPayout: number
        terminalPayout: number
      }
    }
    const { inputs, expected } = example

    const product = findHomeSavingsProduct('premium-plusz-10x30')
    const outputs = calculateHomeSavingsFromSpecInputs(
      {
        productCode: product!.productCode,
        monthlyDeposit: inputs.monthlyDeposit,
        termMonths: inputs.termMonths,
        startDate: inputs.startDate,
        housingPurpose: inputs.housingPurpose,
        openingFeeMode: inputs.openingFeeMode
      },
      {
        createHomeSavingsInstrumentBundle,
        label: 'Schedule-usable LTP',
        description: 'Optional notes'
      }
    )

    expect(outputs.accountOpeningFee).toBe(expected.accountOpeningFee)
    expect(outputs.totalDeposits).toBe(expected.totalDeposits)
    expect(outputs.totalAccountFees).toBe(expected.totalAccountFees)
    expect(outputs.premiumRatePct).toBe(expected.premiumRatePct)
    expect(outputs.premiumAmount).toBe(expected.premiumAmount)
    // Engine pins from maturity-premium-120.yaml (OTP Lejáratkor is expected.terminalPayout).
    expect(outputs.depositInterest).toBe(expected.engineDepositInterest)
    expect(outputs.terminalPayout).toBe(expected.engineTerminalPayout)
    expect(outputs.productId).toBe('home-savings.premium-plusz-10x30.standard')
    expect(outputs.productSpecVersion).toBe('v2alpha1')

    const bundle = outputs.bundle
    expect(bundle.instrumentType).toBe('home-savings')
    expect(bundle.productId).toBe('home-savings.premium-plusz-10x30.standard')
    expect(bundle.productSpecVersion).toBe('v2alpha1')
    expect(bundle.config.productCode).toBe('premium-plusz-10x30')
    expect(bundle.config.openingFeeMode).toBe(inputs.openingFeeMode)
    expect(bundle.config.contractAmount).toBe(expected.contractAmount)
    expect(bundle.config.description).toBe('Optional notes')

    const opening = bundle.generatedFlows.filter(
      (flow: { description?: string }) => flow.description === 'Account opening fee'
    )
    const deposits = bundle.generatedFlows.filter(
      (flow: { description?: string }) => flow.description === 'Monthly deposit'
    )
    const fees = bundle.generatedFlows.filter(
      (flow: { description?: string }) => flow.description === 'Account management fee'
    )
    const terminal = bundle.generatedFlows.filter(
      (flow: { description?: string }) => flow.description === 'Home-savings terminal payout'
    )

    expect(opening).toHaveLength(1)
    expect(opening[0].direction).toBe('outflow')
    expect(opening[0].amount).toBe(expected.accountOpeningFee)
    expect(deposits).toHaveLength(inputs.termMonths)
    expect(fees).toHaveLength(inputs.termMonths)
    expect(terminal).toHaveLength(1)
    expect(terminal[0].direction).toBe('inflow')
    expect(terminal[0].amount).toBe(expected.engineTerminalPayout)
    expect(terminal[0].date).toBe(expected.maturityPayoutDate)
  })

  it('preview schedule path returns scalars without requiring a bundle factory', () => {
    const example = YAML.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/maturity-premium-120.yaml'
        ),
        'utf8'
      )
    ) as {
      inputs: {
        monthlyDeposit: number
        termMonths: number
        startDate: string
        housingPurpose: boolean
        openingFeeMode: string
      }
      expected: {
        engineDepositInterest: number
        engineTerminalPayout: number
      }
    }

    const outputs = calculateHomeSavingsScheduleFromSpecInputs(
      {
        productCode: 'premium-plusz-10x30',
        monthlyDeposit: example.inputs.monthlyDeposit,
        termMonths: example.inputs.termMonths,
        startDate: example.inputs.startDate,
        housingPurpose: example.inputs.housingPurpose,
        openingFeeMode: example.inputs.openingFeeMode
      },
      { resolveHomeSavingsSchedule }
    )

    expect(outputs.terminalPayout).toBe(example.expected.engineTerminalPayout)
    expect(outputs.depositInterest).toBe(example.expected.engineDepositInterest)
    expect((outputs as { bundle?: unknown }).bundle).toBeUndefined()
  })

  it('zeros Premium when housing purpose is not assumed', () => {
    const example = YAML.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/maturity-premium-120.yaml'
        ),
        'utf8'
      )
    ) as {
      expected: {
        totalDeposits: number
        engineDepositInterest: number
      }
    }

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
    expect(outputs.terminalPayout).toBe(
      example.expected.totalDeposits + example.expected.engineDepositInterest
    )
  })

  it('matches engine locked maturity example on the browser dual-surface', () => {
    const yamlText = readFileSync(
      resolve(process.cwd(), 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml'),
      'utf8'
    )
    const schema = JSON.parse(
      readFileSync(resolve(process.cwd(), DEFAULT_PRODUCT_SCHEMA_PATH), 'utf8')
    )
    const product = loadHomeSavingsProductSpec(yamlText, schema)
    const example = YAML.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/maturity-premium-120.yaml'
        ),
        'utf8'
      )
    )
    const inputs = example.inputs as HomeSavingsSpecInputs

    const engine = calculateHomeSavingsFromProductSpec(product, inputs)
    const browser = calculateHomeSavingsScheduleFromSpecInputs(
      {
        productCode: 'premium-plusz-10x30',
        monthlyDeposit: inputs.monthlyDeposit,
        termMonths: inputs.termMonths,
        startDate: inputs.startDate,
        housingPurpose: inputs.housingPurpose,
        openingFeeMode: inputs.openingFeeMode
      },
      { resolveHomeSavingsSchedule }
    )

    expect(browser.accountOpeningFee).toBe(engine.accountOpeningFee)
    expect(browser.totalDeposits).toBe(engine.totalDeposits)
    expect(browser.totalAccountFees).toBe(engine.totalAccountFees)
    expect(browser.premiumRatePct).toBe(engine.premiumRatePct)
    expect(browser.premiumAmount).toBe(engine.premiumAmount)
    expect(browser.depositInterest).toBe(engine.depositInterest)
    expect(browser.terminalPayout).toBe(engine.terminalPayout)
  })
})
