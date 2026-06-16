import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import type { LoanInstrumentInput } from '../interfaces'
import type { CashFlow } from '../models'
import { generateLoanInstrumentCashFlows } from '../instruments/loan'

export interface FixedRateLoanProductSpec {
  specVersion: 'v1alpha1'
  kind: 'financial-product'
  id: 'loan.fixed-rate.standard'
  family: 'loan'
  variant: 'fixed-rate'
}

export interface FixedRateLoanSpecInputs {
  principal: number
  annualInterestRatePct: number
  termMonths: number
  startDate: string
  repaymentDayOfMonth?: number
  includeDisbursement?: boolean
  category?: string
  description?: string
}

function deriveRepaymentDayOfMonth(startDate: string): number {
  const day = Number(startDate.split('-')[2])
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Fixed-rate loan spec input startDate must be in YYYY-MM-DD format.')
  }
  return day
}

function buildValidationError(errors: string[]): Error {
  return new Error(`Product spec validation failed: ${errors.join('; ')}`)
}

function assertValidFixedRateProductSpec(spec: unknown): asserts spec is FixedRateLoanProductSpec {
  const candidate = spec as Partial<FixedRateLoanProductSpec>
  if (candidate.id !== 'loan.fixed-rate.standard') {
    throw new Error('Product spec id must be loan.fixed-rate.standard.')
  }
  if (candidate.family !== 'loan' || candidate.variant !== 'fixed-rate') {
    throw new Error('Product spec must describe loan/fixed-rate family and variant.')
  }
}

export function parseFixedRateLoanProductSpecYaml(yamlText: string): unknown {
  return YAML.parse(yamlText)
}

export function validateFixedRateLoanProductSpec(productSpec: unknown, productSchema: unknown): void {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validate = ajv.compile(productSchema as object)
  const valid = validate(productSpec)

  if (!valid) {
    const errors = (validate.errors ?? []).map((entry) => {
      const path = entry.instancePath || '/'
      return `${path} ${entry.message ?? 'is invalid'}`
    })
    throw buildValidationError(errors)
  }
}

export function loadFixedRateLoanProductSpec(yamlText: string, productSchema: unknown): FixedRateLoanProductSpec {
  const parsed = parseFixedRateLoanProductSpecYaml(yamlText)
  validateFixedRateLoanProductSpec(parsed, productSchema)
  assertValidFixedRateProductSpec(parsed)
  return parsed
}

export function mapFixedRateLoanSpecInputsToLoanInstrumentInput(
  specInputs: FixedRateLoanSpecInputs
): LoanInstrumentInput {
  return {
    principal: specInputs.principal,
    annualRate: specInputs.annualInterestRatePct / 100,
    termMonths: specInputs.termMonths,
    startDate: specInputs.startDate,
    repaymentDayOfMonth: specInputs.repaymentDayOfMonth ?? deriveRepaymentDayOfMonth(specInputs.startDate),
    includeDisbursement: specInputs.includeDisbursement,
    category: specInputs.category,
    description: specInputs.description
  }
}

export function generateLoanInstrumentCashFlowsFromFixedRateProductSpec(
  productSpec: FixedRateLoanProductSpec,
  specInputs: FixedRateLoanSpecInputs
): CashFlow[] {
  assertValidFixedRateProductSpec(productSpec)
  const loanInput = mapFixedRateLoanSpecInputsToLoanInstrumentInput(specInputs)
  return generateLoanInstrumentCashFlows(loanInput)
}