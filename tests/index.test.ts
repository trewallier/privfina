import { describe, expect, it } from 'vitest'
import {
  calculateCumulativeSeries,
  CashFlowDirection,
  createCalculationEngine,
  createOneTimeCashFlow
} from '../src/index'

describe('finance engine exports', () => {
  it('exposes CashFlowDirection enums', () => {
    expect(CashFlowDirection.Inflow).toBe('inflow')
    expect(CashFlowDirection.Outflow).toBe('outflow')
  })

  it('creates a calculation engine stub', () => {
    const engine = createCalculationEngine()
    expect(engine.summarizeCashFlows([])).toEqual([])
  })

  it('creates one-time cash flow with defaults', () => {
    const cashFlow = createOneTimeCashFlow({
      date: '2026-06-10',
      amount: 100,
      direction: CashFlowDirection.Inflow
    })

    expect(cashFlow).toEqual({
      date: '2026-06-10',
      amount: 100,
      direction: CashFlowDirection.Inflow,
      category: 'general',
      description: undefined
    })
  })

  it('builds cumulative series for selected date range', () => {
    const series = calculateCumulativeSeries(
      [
        { date: '2026-01-10', amount: 1000, direction: CashFlowDirection.Inflow, category: 'salary' },
        { date: '2026-01-15', amount: 200, direction: CashFlowDirection.Outflow, category: 'rent' },
        { date: '2026-02-01', amount: 150, direction: CashFlowDirection.Outflow, category: 'utilities' }
      ],
      '2026-01-01',
      '2026-01-31'
    )

    expect(series).toEqual([
      { date: '2026-01-10', cumulativeTotal: 1000 },
      { date: '2026-01-15', cumulativeTotal: 800 }
    ])
  })
})
