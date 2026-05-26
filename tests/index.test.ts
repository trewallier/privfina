import { describe, expect, it } from 'vitest'
import { CashFlowDirection, createCalculationEngine } from '../src/index'

describe('finance engine exports', () => {
  it('exposes CashFlowDirection enums', () => {
    expect(CashFlowDirection.Inflow).toBe('inflow')
    expect(CashFlowDirection.Outflow).toBe('outflow')
  })

  it('creates a calculation engine stub', () => {
    const engine = createCalculationEngine()
    expect(engine.summarizeCashFlows([])).toEqual([])
  })
})
