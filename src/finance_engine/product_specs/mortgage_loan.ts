import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import type { LoanInstrumentInput } from '../interfaces'
import type { CashFlow } from '../models'
import {
  applyFeesAndDiscounts,
  DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES,
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
import {
  buildThmFlowsFromMonthly,
  calculateThm,
  expandScheduleToMonthlyPayments
} from '../instruments/thm'

export interface MortgageOfferingPackaging {
  representativePrincipal: number
  representativeTermMonths: number
  representativeGracePeriodMonths?: number
  representativeOfferingMonthlyPayment: number
  representativeOfferingGracePayment?: number
  excludeFeeNames?: string[]
}

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
  pricing?: {
    rateSettingRule?: string
    offeringPriceModel?: string
    offeringPackaging?: MortgageOfferingPackaging
    notes?: string[]
  }
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
  /** ADR 0022 percentRounded THM when offering packaging applies; otherwise raw. */
  thmPct: number
  annualInterestRatePct: number
  /** Effective annual rate used for offering-faithful installment packaging, when present. */
  packagingAnnualRatePct?: number
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

/**
 * Calibrate the effective packaging annual rate (%) so a level-payment annuity at
 * the representative principal/term/grace matches the published offering installment.
 */
export function calibrateOfferingPackagingAnnualRatePct(
  packaging: MortgageOfferingPackaging
): number {
  const principal = packaging.representativePrincipal
  const termMonths = packaging.representativeTermMonths
  const gracePeriodMonths = packaging.representativeGracePeriodMonths ?? 0
  const target = packaging.representativeOfferingMonthlyPayment

  let low = 0.0001
  let high = 100
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2
    const schedule = resolveLoanSchedule({
      principal,
      annualRate: mid / 100,
      termMonths,
      gracePeriodMonths,
      capitalizeInterestAtGraceEnd: false
    })
    if (schedule.monthlyInstallment < target) {
      low = mid
    } else {
      high = mid
    }
  }

  return (low + high) / 2
}

function resolveExcludeFeeNames(
  productSpec: MortgageLoanProductSpec,
  specInputs: MortgageLoanSpecInputs
): readonly string[] | undefined {
  if (specInputs.excludeFeeNames) {
    return specInputs.excludeFeeNames
  }
  const packaging = productSpec.pricing?.offeringPackaging
  if (packaging?.excludeFeeNames) {
    return packaging.excludeFeeNames
  }
  return DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES
}

interface ResolvedMortgageCommercialInputs {
  feePackage: CreditCostPackage
  resolvedRate: ReturnType<typeof resolveMortgageCustomerRate>
  gracePeriodMonths: number
  packagingAnnualRatePct?: number
  offeringPackaging?: MortgageOfferingPackaging
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
    excludeFeeNames: resolveExcludeFeeNames(productSpec, specInputs)
  })

  const resolvedRate = resolveMortgageCustomerRate({
    annualInterestRatePct: specInputs.annualInterestRatePct,
    transactionalAnnualRatePct: specInputs.transactionalAnnualRatePct,
    subsidy: productSpec.subsidy,
    rateDiscountBp: feePackage.totalRateDiscountBp
  })

  const offeringPackaging = productSpec.pricing?.offeringPackaging
  const packagingAnnualRatePct = offeringPackaging
    ? calibrateOfferingPackagingAnnualRatePct(offeringPackaging)
    : undefined

  return {
    feePackage,
    resolvedRate,
    gracePeriodMonths: resolveGracePeriodMonths(productSpec, specInputs),
    packagingAnnualRatePct,
    offeringPackaging
  }
}

function buildPackagedSchedule(input: {
  principal: number
  annualRate: number
  termMonths: number
  gracePeriodMonths: number
  offeringPackaging?: MortgageOfferingPackaging
}): ResolvedLoanSchedule {
  const schedule = resolveLoanSchedule({
    principal: input.principal,
    annualRate: input.annualRate,
    termMonths: input.termMonths,
    gracePeriodMonths: input.gracePeriodMonths,
    capitalizeInterestAtGraceEnd: false
  })

  const packaging = input.offeringPackaging
  if (!packaging?.representativeOfferingGracePayment || input.gracePeriodMonths <= 0) {
    return {
      ...schedule,
      monthlyInstallment: Math.round(schedule.monthlyInstallment * 1e8) / 1e8
    }
  }

  const matchesRepresentative =
    input.principal === packaging.representativePrincipal &&
    input.termMonths === packaging.representativeTermMonths &&
    input.gracePeriodMonths === (packaging.representativeGracePeriodMonths ?? 0)

  if (!matchesRepresentative) {
    return schedule
  }

  // Snap grace to published whole-forint packaging at the representative case.
  const graceInterestOnlyPayment = packaging.representativeOfferingGracePayment
  const monthlyInstallment = packaging.representativeOfferingMonthlyPayment
  const amortizationMonths = schedule.amortizationMonths
  const totalRepayment =
    graceInterestOnlyPayment * input.gracePeriodMonths + monthlyInstallment * amortizationMonths
  const totalInterest = totalRepayment - input.principal

  return {
    ...schedule,
    graceInterestOnlyPayment,
    monthlyInstallment,
    totalRepayment,
    totalInterest
  }
}

/**
 * Map mortgage-loan spec inputs + product commercial blocks to loan instrument input.
 * When offering packaging is present, the schedule rate is the calibrated packaging rate
 * so customer cash flows match Hirdetmény repayment figures (ADR 0023).
 */
export function mapMortgageLoanSpecInputsToLoanInstrumentInput(
  productSpec: MortgageLoanProductSpec,
  specInputs: MortgageLoanSpecInputs
): LoanInstrumentInput {
  assertValidMortgageLoanProductSpec(productSpec)
  const { resolvedRate, gracePeriodMonths, packagingAnnualRatePct } = resolveMortgageCommercialInputs(
    productSpec,
    specInputs
  )

  const annualRate =
    packagingAnnualRatePct !== undefined
      ? packagingAnnualRatePct / 100
      : resolvedRate.annualRate

  return {
    principal: specInputs.principal,
    annualRate,
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
 * Compute commercial mortgage outputs (schedule + fees + ADR 0022 THM).
 * Public-offering products with `pricing.offeringPackaging` produce offering-faithful
 * installments and `thmPct` as `percentRounded`.
 */
export function calculateMortgageLoanFromProductSpec(
  productSpec: MortgageLoanProductSpec,
  specInputs: MortgageLoanSpecInputs
): MortgageLoanEngineOutputs {
  assertValidMortgageLoanProductSpec(productSpec)
  const {
    feePackage,
    resolvedRate,
    gracePeriodMonths,
    packagingAnnualRatePct,
    offeringPackaging
  } = resolveMortgageCommercialInputs(productSpec, specInputs)

  const scheduleRate =
    packagingAnnualRatePct !== undefined
      ? packagingAnnualRatePct / 100
      : resolvedRate.annualRate

  const schedule = buildPackagedSchedule({
    principal: specInputs.principal,
    annualRate: scheduleRate,
    termMonths: specInputs.termMonths,
    gracePeriodMonths,
    offeringPackaging
  })

  const monthlyPayments = expandScheduleToMonthlyPayments(schedule)
  const thmFlows = buildThmFlowsFromMonthly({
    principal: specInputs.principal,
    upfrontFees: feePackage.totalCreditCostFees,
    monthlyOutflows: monthlyPayments.map((amount, index) => ({
      monthIndex: index + 1,
      amount
    }))
  })
  const thm = calculateThm(thmFlows)
  const thmPct =
    packagingAnnualRatePct !== undefined ? thm.percentRounded : thm.rate * 100

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
    thmPct,
    annualInterestRatePct: resolvedRate.annualInterestRatePct,
    packagingAnnualRatePct,
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
