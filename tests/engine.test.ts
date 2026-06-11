import { describe, it, expect } from 'vitest'
import { generateRecurringCashFlows, evaluateRecurring } from '../src/finance_engine/engine'
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
