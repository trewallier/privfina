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

    // per-occurrence discounting
    const base = new Date('2026-01-01')
    let pv = 0
    for (const cf of expanded) {
      const cashDate = new Date(cf.date)
      const days = Math.round((cashDate.getTime() - base.getTime()) / (1000 * 60 * 60 * 24))
      const years = days / 365.0
      pv += (cf.direction === CashFlowDirection.Inflow ? cf.amount : -cf.amount) / Math.pow(1 + discountRate, years)
    }

    const closed = evaluateRecurring(input as any, range as any, 'npv', { discountRate })
    expect(typeof closed).toBe('number')
    expect(closed).toBeCloseTo(pv, 6)
  })
})
