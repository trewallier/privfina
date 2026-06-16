import type { InvestmentMaturityPreview } from '../interfaces'
import type { CashFlow } from '../models'
import { CashFlowDirection } from '../models'
import { generateRecurringCashFlows } from '../recurring'
import {
  DEFAULT_COUPON_PERIOD,
  InvestmentBundleInput,
  MONTHS_PER_YEAR,
  calculateInflationLinkedMaturityAmount,
  calculateMonthlyCompoundedAmount,
  createCashFlow,
  ensurePositiveAmount,
  getInvestmentPurchaseAmount,
  maturityDateFromInput,
  parseYearlyInflation,
  sortCashFlowsByDate,
  toIsoDate
} from './common'

export function createInvestmentMaturityPreview(input: InvestmentBundleInput): InvestmentMaturityPreview {
  const { purchase, months } = maturityDateFromInput(input.purchaseDate, input.maturityDate)
  const subtype = input.subtype
  const principal = ensurePositiveAmount(input.principal)
  const purchaseAmount = getInvestmentPurchaseAmount(input)
  const annualRate = Number(input.annualRate ?? 0)
  const spreadRate = Number(input.spreadRate ?? 0)
  const yearlyInflation = parseYearlyInflation(input.yearlyInflation)

  let maturityAmount = principal

  if (subtype === 'regular-bond') {
    const rate = Number.isFinite(annualRate) ? annualRate : 0
    maturityAmount = calculateMonthlyCompoundedAmount(principal, rate, months)
  } else if (subtype === 'discount-bond') {
    maturityAmount = principal
  } else if (subtype === 'inflation-linked-bond') {
    maturityAmount = calculateInflationLinkedMaturityAmount(
      principal,
      purchase,
      months,
      yearlyInflation,
      spreadRate
    )
  }

  return {
    purchaseAmount,
    maturityAmount,
    gainAmount: maturityAmount - purchaseAmount,
    subtype
  }
}

export function generateInvestmentInstrumentCashFlows(input: InvestmentBundleInput): CashFlow[] {
  const { purchase, maturity, months } = maturityDateFromInput(input.purchaseDate, input.maturityDate)
  const principal = ensurePositiveAmount(input.principal)
  const purchaseAmount = getInvestmentPurchaseAmount(input)
  const annualRate = Number(input.annualRate ?? 0)
  const spreadRate = Number(input.spreadRate ?? 0)
  const yearlyInflation = parseYearlyInflation(input.yearlyInflation)
  const category = input.category ?? 'investment'
  const description = input.description
  const flows: CashFlow[] = []
  const purchaseIso = toIsoDate(purchase)
  const maturityIso = toIsoDate(maturity)

  flows.push(createCashFlow(purchaseIso, purchaseAmount, CashFlowDirection.Outflow, category, description))

  if (input.subtype === 'regular-bond') {
    flows.push(
      createCashFlow(
        maturityIso,
        calculateMonthlyCompoundedAmount(principal, annualRate, months),
        CashFlowDirection.Inflow,
        category,
        description
      )
    )
  } else if (input.subtype === 'discount-bond') {
    flows.push(createCashFlow(maturityIso, principal, CashFlowDirection.Inflow, category, description))
  } else if (input.subtype === 'inflation-linked-bond') {
    flows.push(
      createCashFlow(
        maturityIso,
        calculateInflationLinkedMaturityAmount(principal, purchase, months, yearlyInflation, spreadRate),
        CashFlowDirection.Inflow,
        category,
        description
      )
    )
  } else {
    const couponPeriod = input.couponPeriod || DEFAULT_COUPON_PERIOD
    const periodicCoupon = principal * (annualRate / MONTHS_PER_YEAR)
    const couponFlows = generateRecurringCashFlows({
      period: couponPeriod,
      startDate: purchaseIso,
      endDate: maturityIso,
      amount: periodicCoupon,
      direction: CashFlowDirection.Inflow,
      category,
      description
    })

    flows.push(...couponFlows)
    flows.push(createCashFlow(maturityIso, principal, CashFlowDirection.Inflow, category, description))
  }

  return sortCashFlowsByDate(flows)
}

export function createInvestmentInstrumentBundle(input: InvestmentBundleInput) {
  const generatedFlows = generateInvestmentInstrumentCashFlows(input)
  const preview = createInvestmentMaturityPreview(input)

  return {
    id: input.id || `investment-${Date.now()}`,
    instrumentType: 'investment',
    label: input.label || 'Investment',
    config: {
      subtype: input.subtype,
      purchaseDate: input.purchaseDate,
      maturityDate: input.maturityDate,
      principal: input.principal,
      purchasePrice: input.purchasePrice,
      annualRate: input.annualRate,
      spreadRate: input.spreadRate,
      yearlyInflation: input.yearlyInflation || [],
      couponPeriod: input.couponPeriod,
      category: input.category ?? 'investment',
      description: input.description
    },
    preview,
    generatedFlows,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}
