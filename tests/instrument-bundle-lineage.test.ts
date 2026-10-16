import { describe, expect, it } from 'vitest'
import {
  generateLoanInstrumentBundle,
  generateSalaryInstrumentBundle,
  generateSubscriptionInstrumentBundle,
  generateInvestmentInstrumentBundle,
  normalizeInstrumentBundle,
  normalizeInstrumentBundles,
  flattenInstrumentFlows
} from '../public/instruments.js'
import { buildEffectiveFlows } from '../public/flows.js'
import { createLoanInstrumentBundle, createInvestmentInstrumentBundle } from '../src/finance_engine/engine'
import { CashFlowDirection } from '../src/finance_engine/models'
import { mapFixedRateLoanSpecInputsToLegacyLoanBundleInput } from '../public/controller/fixed-rate-loan-calculation-adapter.js'
import { FIXED_RATE_LOAN_PRODUCT_SPEC } from '../public/controller/fixed-rate-loan-product-spec.js'

describe('instrument bundle lineage contract', () => {
  it('stamps deterministic flow lineage when generating a loan bundle', () => {
    const bundle = generateLoanInstrumentBundle({
      id: 'loan-fixed-1',
      label: 'Car loan',
      productId: FIXED_RATE_LOAN_PRODUCT_SPEC.id,
      productSpecVersion: FIXED_RATE_LOAN_PRODUCT_SPEC.specVersion,
      principal: 1200,
      annualRate: 0,
      termValue: 3,
      termUnit: 'months',
      startDate: '2026-01-01',
      repaymentDayOfMonth: 1,
      includeDisbursement: true,
      category: 'loan'
    })

    expect(bundle.productId).toBe('loan.fixed-rate.standard')
    expect(bundle.productSpecVersion).toBe('v1alpha1')
    expect(bundle.config.productId).toBe('loan.fixed-rate.standard')
    expect(bundle.config.productSpecVersion).toBe('v1alpha1')
    expect(bundle.generatedFlows.length).toBeGreaterThan(1)
    expect(bundle.generatedFlows[0]).toMatchObject({
      id: 'loan-fixed-1-flow-0',
      sourceInstrumentId: 'loan-fixed-1',
      sourceInstrumentType: 'loan'
    })
    expect(bundle.generatedFlows.every((flow) => flow.sourceInstrumentId === 'loan-fixed-1')).toBe(true)
  })

  it('preserves createdAt and regenerates lineage ids on edit', () => {
    const createdAt = '2026-01-01T00:00:00.000Z'
    const first = generateSalaryInstrumentBundle({
      id: 'salary-1',
      label: 'Salary',
      startDate: '2026-01-01',
      occurrences: 2,
      amount: 1000,
      createdAt
    })
    const edited = generateSalaryInstrumentBundle({
      id: 'salary-1',
      label: 'Salary updated',
      startDate: '2026-01-01',
      occurrences: 3,
      amount: 1100,
      createdAt: first.createdAt
    })

    expect(edited.createdAt).toBe(createdAt)
    expect(typeof edited.updatedAt).toBe('string')
    expect(edited.generatedFlows).toHaveLength(3)
    expect(edited.generatedFlows.map((flow) => flow.id)).toEqual([
      'salary-1-flow-0',
      'salary-1-flow-1',
      'salary-1-flow-2'
    ])
    expect(edited.generatedFlows.every((flow) => flow.sourceInstrumentType === 'salary')).toBe(true)
  })

  it('normalizes legacy bundles by lifting config product refs and stamping missing lineage', () => {
    const normalized = normalizeInstrumentBundle({
      id: 'inv-legacy',
      instrumentType: 'investment',
      label: 'Legacy bond',
      config: {
        productId: 'government-security.dkj.standard',
        productSpecVersion: 'v1alpha1',
        subtype: 'dkj'
      },
      generatedFlows: [{ date: '2026-01-01', amount: 100, direction: 'outflow', category: 'investment' }]
    })

    expect(normalized?.productId).toBe('government-security.dkj.standard')
    expect(normalized?.productSpecVersion).toBe('v1alpha1')
    expect(normalized?.generatedFlows[0]).toMatchObject({
      id: 'inv-legacy-flow-0',
      sourceInstrumentId: 'inv-legacy',
      sourceInstrumentType: 'investment'
    })
  })

  it('preserves existing flow lineage ids when re-normalizing', () => {
    const normalized = normalizeInstrumentBundles([
      {
        id: 'sub-1',
        instrumentType: 'subscription',
        label: 'Stream',
        config: {},
        generatedFlows: [
          {
            id: 'custom-flow-id',
            date: '2026-02-01',
            amount: 12,
            direction: 'outflow',
            category: 'subscription',
            sourceInstrumentId: 'sub-1',
            sourceInstrumentType: 'subscription'
          }
        ]
      }
    ])

    expect(normalized[0].generatedFlows[0].id).toBe('custom-flow-id')
    expect(normalized[0].generatedFlows[0].sourceInstrumentId).toBe('sub-1')
  })

  it('exposes lineage on chart-effective instrument flows via flattenInstrumentFlows', () => {
    const loan = generateLoanInstrumentBundle({
      id: 'loan-chart',
      principal: 1000,
      annualRate: 0,
      termValue: 2,
      termUnit: 'months',
      startDate: '2026-01-10',
      repaymentDayOfMonth: 15,
      includeDisbursement: true
    })
    const subscription = generateSubscriptionInstrumentBundle({
      id: 'sub-chart',
      period: '0 0 5 * *',
      startDate: '2026-01-01',
      occurrences: 1,
      amount: 20
    })

    const flattened = flattenInstrumentFlows([loan, subscription])
    expect(flattened.every((flow) => flow.sourceInstrumentId && flow.sourceInstrumentType && flow.id)).toBe(
      true
    )

    const effective = buildEffectiveFlows([], [], '2026-01-01', '2026-12-31', [loan, subscription])
    expect(effective.some((flow) => flow.sourceInstrumentId === 'loan-chart')).toBe(true)
    expect(effective.some((flow) => flow.sourceInstrumentId === 'sub-chart')).toBe(true)
  })

  it('carries product-spec version from the fixed-rate loan adapter into the bundle', () => {
    const bundle = generateLoanInstrumentBundle(
      mapFixedRateLoanSpecInputsToLegacyLoanBundleInput(
        {
          principal: 100000,
          annualInterestRatePct: 5,
          termMonths: 12,
          startDate: '2026-01-01'
        },
        {
          id: 'loan-adapter-1',
          label: FIXED_RATE_LOAN_PRODUCT_SPEC.ui.formTitle,
          repaymentDayOfMonth: 1,
          includeDisbursement: true,
          termValue: 12,
          termUnit: 'months'
        }
      )
    )

    expect(bundle.productId).toBe(FIXED_RATE_LOAN_PRODUCT_SPEC.id)
    expect(bundle.productSpecVersion).toBe(FIXED_RATE_LOAN_PRODUCT_SPEC.specVersion)
    expect(bundle.generatedFlows[0].sourceInstrumentId).toBe('loan-adapter-1')
  })

  it('stamps lineage in TypeScript loan and investment bundle creators', () => {
    const loan = createLoanInstrumentBundle({
      id: 'ts-loan-1',
      principal: 1000,
      annualRate: 0,
      termMonths: 2,
      startDate: '2026-01-01',
      repaymentDayOfMonth: 1,
      includeDisbursement: true,
      productId: 'loan.fixed-rate.standard',
      productSpecVersion: 'v1alpha1'
    })
    const investment = createInvestmentInstrumentBundle({
      id: 'ts-inv-1',
      subtype: 'regular-bond',
      purchaseDate: '2026-01-01',
      maturityDate: '2026-07-01',
      principal: 1000,
      annualRate: 0.05,
      purchasePrice: 950,
      productId: 'investment.regular-bond',
      productSpecVersion: 'v1alpha1'
    })

    expect(loan.generatedFlows[0]).toMatchObject({
      id: 'ts-loan-1-flow-0',
      sourceInstrumentId: 'ts-loan-1',
      sourceInstrumentType: 'loan',
      direction: CashFlowDirection.Inflow
    })
    expect(loan.productId).toBe('loan.fixed-rate.standard')
    expect(investment.generatedFlows[0]).toMatchObject({
      id: 'ts-inv-1-flow-0',
      sourceInstrumentId: 'ts-inv-1',
      sourceInstrumentType: 'investment'
    })
    expect(investment.productSpecVersion).toBe('v1alpha1')
  })

  it('stamps lineage for investment generation without a product-spec id', () => {
    const bundle = generateInvestmentInstrumentBundle({
      id: 'inv-generic',
      subtype: 'regular-bond',
      purchaseDate: '2026-01-01',
      maturityDate: '2026-07-01',
      principal: 1000,
      annualRate: 0.05,
      purchasePrice: 950
    })

    expect(bundle.productId).toBeUndefined()
    expect(bundle.generatedFlows[0]).toMatchObject({
      id: 'inv-generic-flow-0',
      sourceInstrumentId: 'inv-generic',
      sourceInstrumentType: 'investment'
    })
  })
})
