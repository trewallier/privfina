import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import type { LoanInstrumentInput } from '../interfaces'
import type { CashFlow } from '../models'
import {
  applyFeesAndDiscounts,
  type CreditCostPackage,
  type ProductDiscountDefinition,
  type ProductFeeDefinition
} from '../instruments/loan_fees'
import {
  resolveMortgageCustomerRate,
  type ProductSubsidyDefinition
} from '../instruments/loan_subsidy'
import {
  generateLoanInstrumentCashFlows,
  resolveLoanSchedule,
  type ResolvedLoanSchedule
} from '../instruments/loan'
import { computeThmPct, expandScheduleToMonthlyPayments } from '../instruments/thm'

export interface MortgageLoanProductSpec {
  specVersion: 'v2alpha1'
  kind: 'financial-product'
  id: string
  family: 'mortgage-loan'
  variant: string
  productCode: string
  displayName?: string
  engine: {
    instrumentType: 'loan'
    rateType?: string
    amortizationType?: string
    paymentFrequency?: string
    gracePeriodMonths?: number
    interestPeriodMonths?: number
  }
  subsidy?: ProductSubsidyDefinition
  fees?: ProductFeeDefinition[]
  discounts?: ProductDiscountDefinition[]
  loanPurposes?: string[]
}

export interface MortgageLoanSpecInputs {
  principal: number
  annualInterestRatePct: number
  termMonths: number
  startDate: string
  loanPurpose?: string
  transactionalAnnualRatePct?: number
  gracePeriodMonths?: number
  repaymentDayOfMonth?: number
  includeDisbursement?: boolean
  category?: string
  description?: string
  /** Discount names to activate for fee waivers / rate discounts. */
  activeDiscountNames?: string[]
  /** Override default representative fee exclusions. */
  excludeFeeNames?: string[]
}

export interface MortgageLoanEngineOutputs {
  productId: string
  productCode: string
  productSpecVersion: 'v2alpha1'
  monthlyPayment: number
  graceInterestOnlyPayment?: number
  paymentCount: number
  totalInterest: number
  totalRepayment: number
  totalCreditCostFees: number
  totalPaid: number
  thmPct: number
  annualInterestRatePct: number
  schedule: ResolvedLoanSchedule
  feePackage: CreditCostPackage
}

function buildValidationError(errors: string[]): Error {
  return new Error(`Product spec validation failed: ${errors.join('; ')}`)
}

export function assertValidMortgageLoanProductSpec(
  spec: unknown
): asserts spec is MortgageLoanProductSpec {
  const candidate = spec as Partial<MortgageLoanProductSpec>
  if (candidate.family !== 'mortgage-loan') {
    throw new Error('Product spec family must be mortgage-loan.')
  }
  if (typeof candidate.productCode !== 'string' || candidate.productCode.length === 0) {
    throw new Error('Product spec productCode is required.')
  }
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw new Error('Product spec id is required.')
  }
  if (candidate.engine?.instrumentType !== 'loan') {
    throw new Error('Mortgage-loan products must use engine.instrumentType loan.')
  }
}

export function parseMortgageLoanProductSpecYaml(yamlText: string): unknown {
  return YAML.parse(yamlText)
}

export function validateMortgageLoanProductSpec(productSpec: unknown, productSchema: unknown): void {
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

export function loadMortgageLoanProductSpec(
  yamlText: string,
  productSchema: unknown
): MortgageLoanProductSpec {
  const parsed = parseMortgageLoanProductSpecYaml(yamlText)
  validateMortgageLoanProductSpec(parsed, productSchema)
  assertValidMortgageLoanProductSpec(parsed)
  return parsed
}

function deriveRepaymentDayOfMonth(startDate: string): number {
  const day = Number(startDate.split('-')[2])
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Mortgage-loan spec input startDate must be in YYYY-MM-DD format.')
  }
  return day
}

function resolveGracePeriodMonths(
  productSpec: MortgageLoanProductSpec,
  specInputs: MortgageLoanSpecInputs
): number {
  if (specInputs.gracePeriodMonths !== undefined && specInputs.gracePeriodMonths !== null) {
    return Number(specInputs.gracePeriodMonths)
  }
  if (
    productSpec.engine.amortizationType === 'interest-only-then-annuity' &&
    productSpec.engine.gracePeriodMonths !== undefined
  ) {
    return Number(productSpec.engine.gracePeriodMonths)
  }
  return Number(productSpec.engine.gracePeriodMonths ?? 0)
}

interface ResolvedMortgageCommercialInputs {
  feePackage: CreditCostPackage
  resolvedRate: ReturnType<typeof resolveMortgageCustomerRate>
  gracePeriodMonths: number
}

/**
 * Shared commercial resolution used by map + calculate paths (fees, customer rate, grace).
 */
function resolveMortgageCommercialInputs(
  productSpec: MortgageLoanProductSpec,
  specInputs: MortgageLoanSpecInputs
): ResolvedMortgageCommercialInputs {
  const feePackage = applyFeesAndDiscounts(productSpec.fees ?? [], productSpec.discounts ?? [], {
    principal: specInputs.principal,
    activeDiscountNames: specInputs.activeDiscountNames,
    excludeFeeNames: specInputs.excludeFeeNames
  })

  const resolvedRate = resolveMortgageCustomerRate({
    annualInterestRatePct: specInputs.annualInterestRatePct,
    transactionalAnnualRatePct: specInputs.transactionalAnnualRatePct,
    subsidy: productSpec.subsidy,
    rateDiscountBp: feePackage.totalRateDiscountBp
  })

  return {
    feePackage,
    resolvedRate,
    gracePeriodMonths: resolveGracePeriodMonths(productSpec, specInputs)
  }
}

/**
 * Map mortgage-loan spec inputs + product commercial blocks to loan instrument input.
 */
export function mapMortgageLoanSpecInputsToLoanInstrumentInput(
  productSpec: MortgageLoanProductSpec,
  specInputs: MortgageLoanSpecInputs
): LoanInstrumentInput {
  assertValidMortgageLoanProductSpec(productSpec)
  const { resolvedRate, gracePeriodMonths } = resolveMortgageCommercialInputs(
    productSpec,
    specInputs
  )

  return {
    principal: specInputs.principal,
    annualRate: resolvedRate.annualRate,
    termMonths: specInputs.termMonths,
    startDate: specInputs.startDate,
    repaymentDayOfMonth:
      specInputs.repaymentDayOfMonth ?? deriveRepaymentDayOfMonth(specInputs.startDate),
    gracePeriodMonths,
    capitalizeInterestAtGraceEnd: false,
    includeDisbursement: specInputs.includeDisbursement ?? false,
    category: specInputs.category ?? 'mortgage-loan',
    description: specInputs.description ?? productSpec.displayName
  }
}

/**
 * Compute engine-lane outputs for a mortgage-loan product (schedule + fees + THM).
 */
export function calculateMortgageLoanFromProductSpec(
  productSpec: MortgageLoanProductSpec,
  specInputs: MortgageLoanSpecInputs
): MortgageLoanEngineOutputs {
  assertValidMortgageLoanProductSpec(productSpec)
  const { feePackage, resolvedRate, gracePeriodMonths } = resolveMortgageCommercialInputs(
    productSpec,
    specInputs
  )

  const schedule = resolveLoanSchedule({
    principal: specInputs.principal,
    annualRate: resolvedRate.annualRate,
    termMonths: specInputs.termMonths,
    gracePeriodMonths,
    capitalizeInterestAtGraceEnd: false
  })

  const monthlyPayments = expandScheduleToMonthlyPayments(schedule)
  const thm = computeThmPct({
    principal: specInputs.principal,
    upfrontFees: feePackage.totalCreditCostFees,
    monthlyPayments
  })

  const totalPaid = schedule.totalRepayment + feePackage.totalCreditCostFees

  return {
    productId: productSpec.id,
    productCode: productSpec.productCode,
    productSpecVersion: 'v2alpha1',
    monthlyPayment: schedule.monthlyInstallment,
    graceInterestOnlyPayment:
      schedule.gracePeriodMonths > 0 ? schedule.graceInterestOnlyPayment : undefined,
    paymentCount: schedule.paymentCount,
    totalInterest: schedule.totalInterest,
    totalRepayment: schedule.totalRepayment,
    totalCreditCostFees: feePackage.totalCreditCostFees,
    totalPaid,
    thmPct: thm.thmPct,
    annualInterestRatePct: resolvedRate.annualInterestRatePct,
    schedule,
    feePackage
  }
}

export function generateLoanInstrumentCashFlowsFromMortgageLoanProductSpec(
  productSpec: MortgageLoanProductSpec,
  specInputs: MortgageLoanSpecInputs
): CashFlow[] {
  const loanInput = mapMortgageLoanSpecInputsToLoanInstrumentInput(productSpec, specInputs)
  return generateLoanInstrumentCashFlows(loanInput)
}
