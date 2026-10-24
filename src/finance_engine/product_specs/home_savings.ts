import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import type { CashFlow } from '../models'
import {
  DEFAULT_HOME_SAVINGS_PREMIUM_TIERS,
  generateHomeSavingsInstrumentCashFlows,
  resolveHomeSavingsPremiumRatePct,
  resolveHomeSavingsSchedule,
  type HomeSavingsInstrumentInput,
  type HomeSavingsPremiumTiers,
  type HomeSavingsScheduleSummary
} from '../instruments/home_savings'

export type HomeSavingsOpeningFeeMode =
  | 'standard-1pct'
  | 'promo-half-percent'
  | 'promo-fixed-65000'

export interface HomeSavingsProductFeeDefinition {
  name: string
  type: string
  value?: number
  unit?: string
  timing?: string
  description?: string
  maxAmount?: number
}

export interface HomeSavingsProductDiscountDefinition {
  name: string
  type: string
  value?: number
  unit?: string
  conditions?: string[]
  appliesToFeeNames?: string[]
}

export interface HomeSavingsProductSpec {
  specVersion: 'v2alpha1'
  kind: 'financial-product'
  id: string
  family: 'home-savings'
  variant: string
  productCode: string
  displayName?: string
  engine: {
    instrumentType: 'home-savings'
    paymentFrequency?: string
  }
  fees?: HomeSavingsProductFeeDefinition[]
  discounts?: HomeSavingsProductDiscountDefinition[]
  eligibilityRules?: string[]
  pricing?: {
    rateSettingRule?: string
    offeringPriceModel?: string
    notes?: string[]
  }
  assumptions?: string[]
}

export interface HomeSavingsSpecInputs {
  monthlyDeposit: number
  termMonths: number
  startDate: string
  housingPurpose: boolean
  openingFeeMode: HomeSavingsOpeningFeeMode
  /** Required for percent-based opening-fee modes until ÁSZF contract-amount formula is locked. */
  contractAmount?: number
  depositDayOfMonth?: number
  /** Optional ÁSZF annual deposit rate (percent). Omit to leave interest unmodeled. */
  depositInterestAnnualRatePct?: number
  earlyExitMonth?: number
  premiumTiers?: HomeSavingsPremiumTiers
  category?: string
  description?: string
}

export interface HomeSavingsEngineOutputs {
  productId: string
  productCode: string
  productSpecVersion: 'v2alpha1'
  accountOpeningFee: number
  accountFeeMonthly: number
  totalDeposits: number
  totalAccountFees: number
  premiumRatePct: number
  premiumBase: number
  premiumAmount: number
  terminalPayout: number
  depositInterest: number
  schedule: HomeSavingsScheduleSummary
}

function buildValidationError(errors: string[]): Error {
  return new Error(`Product spec validation failed: ${errors.join('; ')}`)
}

export function assertValidHomeSavingsProductSpec(
  spec: unknown
): asserts spec is HomeSavingsProductSpec {
  const candidate = spec as Partial<HomeSavingsProductSpec>
  if (candidate.family !== 'home-savings') {
    throw new Error('Product spec family must be home-savings.')
  }
  if (typeof candidate.productCode !== 'string' || candidate.productCode.length === 0) {
    throw new Error('Product spec productCode is required.')
  }
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    throw new Error('Product spec id is required.')
  }
  if (candidate.engine?.instrumentType !== 'home-savings') {
    throw new Error('Home-savings products must use engine.instrumentType home-savings.')
  }
}

export function parseHomeSavingsProductSpecYaml(yamlText: string): unknown {
  return YAML.parse(yamlText)
}

export function validateHomeSavingsProductSpec(productSpec: unknown, productSchema: unknown): void {
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

export function loadHomeSavingsProductSpec(
  yamlText: string,
  productSchema: unknown
): HomeSavingsProductSpec {
  const parsed = parseHomeSavingsProductSpecYaml(yamlText)
  validateHomeSavingsProductSpec(parsed, productSchema)
  assertValidHomeSavingsProductSpec(parsed)
  return parsed
}

function findFee(
  fees: HomeSavingsProductFeeDefinition[] | undefined,
  predicate: (fee: HomeSavingsProductFeeDefinition) => boolean
): HomeSavingsProductFeeDefinition | undefined {
  return (fees ?? []).find(predicate)
}

/**
 * Resolve monthly account management fee from product YAML (szamlavezetesi-dij).
 */
export function resolveHomeSavingsAccountFeeMonthly(
  productSpec: HomeSavingsProductSpec
): number {
  const fee =
    findFee(productSpec.fees, (entry) => entry.name === 'szamlavezetesi-dij') ??
    findFee(productSpec.fees, (entry) => entry.type === 'account-management')

  if (!fee || fee.value === undefined || fee.value === null) {
    throw new Error('Home-savings product spec must define a monthly account-management fee.')
  }

  const value = Number(fee.value)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Account management fee must be a non-negative finite number.')
  }
  return value
}

/**
 * Resolve account opening fee from mode + product rules.
 * Percent modes require `contractAmount` (ÁSZF/contract formula still open).
 */
export function resolveHomeSavingsOpeningFee(
  productSpec: HomeSavingsProductSpec,
  specInputs: HomeSavingsSpecInputs
): number {
  assertValidHomeSavingsProductSpec(productSpec)
  const mode = specInputs.openingFeeMode

  if (mode === 'promo-fixed-65000') {
    return 65000
  }

  const contractAmount = Number(specInputs.contractAmount)
  if (!Number.isFinite(contractAmount) || contractAmount <= 0) {
    throw new Error(
      `openingFeeMode ${mode} requires a positive contractAmount until the ÁSZF szerződéses összeg formula is locked in the product spec.`
    )
  }

  if (mode === 'standard-1pct') {
    return (contractAmount * 1) / 100
  }

  if (mode === 'promo-half-percent') {
    return (contractAmount * 0.5) / 100
  }

  throw new Error(`Unsupported openingFeeMode: ${String(mode)}`)
}

export function mapHomeSavingsSpecInputsToInstrumentInput(
  productSpec: HomeSavingsProductSpec,
  specInputs: HomeSavingsSpecInputs
): HomeSavingsInstrumentInput {
  assertValidHomeSavingsProductSpec(productSpec)

  const accountFeeMonthly = resolveHomeSavingsAccountFeeMonthly(productSpec)
  const accountOpeningFee = resolveHomeSavingsOpeningFee(productSpec, specInputs)
  const premiumTiers = specInputs.premiumTiers ?? DEFAULT_HOME_SAVINGS_PREMIUM_TIERS

  return {
    monthlyDeposit: specInputs.monthlyDeposit,
    termMonths: specInputs.termMonths,
    startDate: specInputs.startDate,
    depositDayOfMonth: specInputs.depositDayOfMonth,
    accountFeeMonthly,
    accountOpeningFee,
    housingPurpose: specInputs.housingPurpose,
    depositInterestAnnualRatePct: specInputs.depositInterestAnnualRatePct,
    premiumTiers,
    earlyExitMonth: specInputs.earlyExitMonth,
    category: specInputs.category ?? 'home-savings',
    description: specInputs.description ?? productSpec.displayName
  }
}

export function calculateHomeSavingsFromProductSpec(
  productSpec: HomeSavingsProductSpec,
  specInputs: HomeSavingsSpecInputs
): HomeSavingsEngineOutputs {
  assertValidHomeSavingsProductSpec(productSpec)
  const instrumentInput = mapHomeSavingsSpecInputsToInstrumentInput(productSpec, specInputs)
  const schedule = resolveHomeSavingsSchedule(instrumentInput)

  return {
    productId: productSpec.id,
    productCode: productSpec.productCode,
    productSpecVersion: 'v2alpha1',
    accountOpeningFee: schedule.accountOpeningFee,
    accountFeeMonthly: schedule.accountFeeMonthly,
    totalDeposits: schedule.totalDeposits,
    totalAccountFees: schedule.totalAccountFees,
    premiumRatePct: schedule.premiumRatePct,
    premiumBase: schedule.premiumBase,
    premiumAmount: schedule.premiumAmount,
    terminalPayout: schedule.terminalPayout,
    depositInterest: schedule.depositInterest,
    schedule
  }
}

export function generateCashFlowsFromHomeSavingsProductSpec(
  productSpec: HomeSavingsProductSpec,
  specInputs: HomeSavingsSpecInputs
): CashFlow[] {
  const instrumentInput = mapHomeSavingsSpecInputsToInstrumentInput(productSpec, specInputs)
  return generateHomeSavingsInstrumentCashFlows(instrumentInput)
}

/** Convenience for tests / docs: Premium band lookup using default tiers. */
export function resolvePremiumRateForTerm(
  termMonths: number,
  housingPurpose: boolean,
  earlyExitMonth?: number
): number {
  return resolveHomeSavingsPremiumRatePct({
    termMonths,
    housingPurpose,
    earlyExitMonth,
    tiers: DEFAULT_HOME_SAVINGS_PREMIUM_TIERS
  })
}
