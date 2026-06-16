import { describe, it, expect } from 'vitest'
import {
  generateRecurringCashFlows,
  evaluateRecurring,
  generateSalaryInstrumentCashFlows,
  generateSubscriptionInstrumentCashFlows,
  runStatefulSimulation,
  calculateLoanMonthlyInstallment,
  simulateLoanAmortization,
  createLoanRepaymentPreview,
  generateLoanInstrumentCashFlows,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentCashFlows
} from '../src/finance_engine/engine'
import { CashFlowDirection } from '../src/finance_engine/models'

describe('evaluateRecurring', () => {
  it('aggregate equals expand sum within range', () => {
    const input = {
      period: '0 0 15 * *',
      startDate: '2026-01-15',
      occurrences: 12,
      amount: 100,
      direction: CashFlowDirection.Inflow
    }

    const range = { startDate: '2026-01-01', endDate: '2026-12-31' }

    const expanded = generateRecurringCashFlows(input as any).filter((cf) => cf.date >= range.startDate && cf.date <= range.endDate)
    const sum = expanded.reduce((s, cf) => s + (cf.direction === CashFlowDirection.Inflow ? cf.amount : -cf.amount), 0)

    const agg = evaluateRecurring(input as any, range as any, 'aggregate')
    expect(agg).toBe(sum)
  })

  it('closed-form npv matches per-occurrence discounting for monthly fixed flows', () => {
    const input = {
      period: '0 0 15 * *',
      startDate: '2026-01-15',
      occurrences: 12,
      amount: 1000,
      direction: CashFlowDirection.Inflow
    }

    const range = { startDate: '2026-01-01', endDate: '2026-12-31' }
    const discountRate = 0.05

    const expanded = generateRecurringCashFlows(input as any).filter((cf) => cf.date >= range.startDate && cf.date <= range.endDate)

    // per-occurrence discounting using monthly effective rate to match closed-form assumptions
    const base = new Date('2026-01-01')
    const monthlyR = Math.pow(1 + discountRate, 1 / 12) - 1
    let pv = 0
    for (const cf of expanded) {
      const cashDate = new Date(cf.date)
      const months = (cashDate.getUTCFullYear() - base.getUTCFullYear()) * 12 + (cashDate.getUTCMonth() - base.getUTCMonth()) + (cashDate.getUTCDate() < base.getUTCDate() ? -1 : 0)
      pv += (cf.direction === CashFlowDirection.Inflow ? cf.amount : -cf.amount) / Math.pow(1 + monthlyR, months)
    }

    const closed = evaluateRecurring(input as any, range as any, 'npv', { discountRate })
    expect(typeof closed).toBe('number')
    expect(closed).toBeCloseTo(pv, 6)
  })

  it('closed-form weekly npv matches per-occurrence discounting', () => {
    const input = {
      period: '0 0 * * 1', // every Monday
      startDate: '2026-01-05',
      occurrences: 52,
      amount: 100,
      direction: CashFlowDirection.Inflow
    }

    const range = { startDate: '2026-01-01', endDate: '2026-12-31' }
    const discountRate = 0.05

    const expanded = generateRecurringCashFlows(input as any).filter((cf) => cf.date >= range.startDate && cf.date <= range.endDate)

    const base = new Date('2026-01-01')
    const weeklyR = Math.pow(1 + discountRate, 1 / 52) - 1
    let pv = 0
    for (const cf of expanded) {
      const cashDate = new Date(cf.date)
      const weeks = Math.floor((cashDate.getTime() - base.getTime()) / (7 * 24 * 60 * 60 * 1000))
      pv += (cf.direction === CashFlowDirection.Inflow ? cf.amount : -cf.amount) / Math.pow(1 + weeklyR, weeks)
    }

    const closed = evaluateRecurring(input as any, range as any, 'npv', { discountRate })
    expect(typeof closed).toBe('number')
    expect(closed).toBeCloseTo(pv, 6)
  })

  it('closed-form annual npv matches per-occurrence discounting', () => {
    const input = {
      period: '0 0 15 6 *', // June 15 every year
      startDate: '2024-06-15',
      occurrences: 5,
      amount: 2000,
      direction: CashFlowDirection.Inflow
    }

    const range = { startDate: '2024-01-01', endDate: '2028-12-31' }
    const discountRate = 0.04

    const expanded = generateRecurringCashFlows(input as any).filter((cf) => cf.date >= range.startDate && cf.date <= range.endDate)

    const base = new Date('2024-01-01')
    let pv = 0
    for (const cf of expanded) {
      const cashDate = new Date(cf.date)
      const years = cashDate.getUTCFullYear() - base.getUTCFullYear()
      pv += (cf.direction === CashFlowDirection.Inflow ? cf.amount : -cf.amount) / Math.pow(1 + discountRate, years)
    }

    const closed = evaluateRecurring(input as any, range as any, 'npv', { discountRate })
    expect(typeof closed).toBe('number')
    expect(closed).toBeCloseTo(pv, 6)
  })
})

describe('instrument foundations', () => {
  it('generates salary flows with default custom monthly working-day rule', () => {
    const result = generateSalaryInstrumentCashFlows({
      startDate: '2026-01-01',
      occurrences: 3,
      amount: 2000,
      customMonthlyRule: {
        targetDayOfMonth: 10
      }
    })

    expect(result.map((entry) => entry.date)).toEqual(['2026-01-09', '2026-02-10', '2026-03-10'])
    expect(result.every((entry) => entry.direction === CashFlowDirection.Inflow)).toBe(true)
  })

  it('generates salary flows in cron-like mode', () => {
    const result = generateSalaryInstrumentCashFlows({
      startDate: '2026-01-01',
      occurrences: 2,
      amount: 1500,
      scheduleMode: 'cron-like',
      cronPeriod: '0 0 15 * *'
    })

    expect(result.map((entry) => entry.date)).toEqual(['2026-01-15', '2026-02-15'])
  })

  it('applies holiday-aware rolling for salary custom rule', () => {
    const result = generateSalaryInstrumentCashFlows({
      startDate: '2026-06-01',
      occurrences: 1,
      amount: 1000,
      customMonthlyRule: {
        targetDayOfMonth: 10,
        holidays: ['2026-06-10']
      }
    })

    expect(result[0].date).toBe('2026-06-09')
  })

  it('wraps subscription instrument as recurring outflow', () => {
    const result = generateSubscriptionInstrumentCashFlows({
      period: '0 0 5 * *',
      startDate: '2026-01-01',
      occurrences: 2,
      amount: 30
    })

    expect(result.map((entry) => entry.direction)).toEqual([
      CashFlowDirection.Outflow,
      CashFlowDirection.Outflow
    ])
    expect(result.map((entry) => entry.date)).toEqual(['2026-01-05', '2026-02-05'])
  })

  it('simulates stateful events chronologically', () => {
    const simulation = runStatefulSimulation({
      initialState: { balance: 1000 },
      events: [
        { date: '2026-01-15', type: 'payment', payload: { amount: -200 } },
        { date: '2026-01-05', type: 'income', payload: { amount: 500 } }
      ],
      transition: (state, event) => {
        const amount = (event.payload as { amount: number }).amount
        return {
          balance: state.balance + amount
        }
      }
    })

    expect(simulation.steps.map((step) => step.event.type)).toEqual(['income', 'payment'])
    expect(simulation.finalState.balance).toBe(1300)
  })

  it('computes loan installment preview and amortization schedule', () => {
    const installment = calculateLoanMonthlyInstallment(12000, 0.06, 12)
    const schedule = simulateLoanAmortization(12000, 0.06, 12)
    const preview = createLoanRepaymentPreview({
      principal: 12000,
      annualRate: 0.06,
      termMonths: 12,
      startDate: '2026-01-01',
      repaymentDayOfMonth: 1
    })
    const loanFlows = generateLoanInstrumentCashFlows({
      principal: 12000,
      annualRate: 0.06,
      termMonths: 12,
      startDate: '2026-01-01',
      repaymentDayOfMonth: 1,
      includeDisbursement: true,
      category: 'loan'
    })

    expect(installment).toBeGreaterThan(0)
    expect(schedule).toHaveLength(12)
    expect(schedule[0].remainingPrincipal).toBeLessThan(12000)
    expect(schedule[11].remainingPrincipal).toBeCloseTo(0, 2)
    expect(preview.monthlyInstallment).toBeCloseTo(installment, 6)
    expect(loanFlows[0].direction).toBe(CashFlowDirection.Inflow)
    expect(loanFlows.some((entry) => entry.direction === CashFlowDirection.Outflow)).toBe(true)
  })

  it('generates investment flows and maturity previews for multiple subtypes', () => {
    const regularPreview = createInvestmentMaturityPreview({
      subtype: 'regular-bond',
      purchaseDate: '2026-01-01',
      maturityDate: '2026-07-01',
      principal: 1000,
      annualRate: 0.06
    })

    const discountFlows = generateInvestmentInstrumentCashFlows({
      subtype: 'discount-bond',
      purchaseDate: '2026-01-01',
      maturityDate: '2026-07-01',
      issueDate: '2025-12-01',
      transactionDate: '2026-01-15',
      dueDate: '2026-07-01',
      principal: 1000,
      purchasePrice: 900,
      category: 'investment'
    })

    const inflationPreview = createInvestmentMaturityPreview({
      subtype: 'inflation-linked-bond',
      purchaseDate: '2026-01-01',
      maturityDate: '2028-07-01',
      issueDate: '2025-07-01',
      transactionDate: '2026-01-01',
      dueDate: '2028-07-01',
      principal: 1000,
      purchasePrice: 950,
      spreadRate: 0.01,
      yearlyInflation: [
        { year: 2026, rate: 0.03 },
        { year: 2027, rate: 0.02 },
        { year: 2028, rate: 0.025 }
      ]
    })

    const customFlows = generateInvestmentInstrumentCashFlows({
      subtype: 'custom-bond',
      purchaseDate: '2026-01-01',
      maturityDate: '2026-04-01',
      principal: 1000,
      annualRate: 0.12,
      couponPeriod: '0 0 1 * *',
      category: 'investment'
    })

    expect(regularPreview.maturityAmount).toBeGreaterThan(1000)
    expect(discountFlows[0].direction).toBe(CashFlowDirection.Outflow)
    expect(discountFlows.some((entry) => entry.direction === CashFlowDirection.Inflow)).toBe(true)
    expect(discountFlows[0].date).toBe('2026-01-15')
    expect(discountFlows[discountFlows.length - 1].date).toBe('2026-07-01')
    expect(inflationPreview.inflationMetrics?.annualMaturityDates.length).toBeGreaterThan(0)
    expect(customFlows.filter((entry) => entry.direction === CashFlowDirection.Inflow).length).toBeGreaterThan(1)
  })
})
