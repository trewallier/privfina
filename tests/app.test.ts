import { describe, expect, it } from 'vitest'
import {
  calculateCumulativeSeries,
  parseOccurrences,
  normalizeRecurringDefinition,
  normalizeRecurringDefinitions,
  expandRecurringFlows,
  upsertFlowById,
  removeFlowById,
  buildEffectiveFlows
} from '../public/app.js'

describe('browser recurrence validation helpers', () => {
  it('parses valid numeric occurrences and string occurrences', () => {
    expect(parseOccurrences(5)).toBe(5)
    expect(parseOccurrences('120')).toBe(120)
    expect(parseOccurrences('  7  ')).toBe(7)
  })

  it('returns undefined for invalid occurrences', () => {
    expect(parseOccurrences('abc')).toBeUndefined()
    expect(parseOccurrences(0)).toBeUndefined()
    expect(parseOccurrences(-3)).toBeUndefined()
    expect(parseOccurrences('1.5')).toBeUndefined()
  })

  it('normalizes a valid recurring definition and drops bad fields', () => {
    const raw = {
      id: 'x',
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      amount: '100',
      direction: 'outflow',
      category: 'subscriptions',
      endDate: '2024-12-31',
      occurrences: '12'
    }

    const normalized = normalizeRecurringDefinition(raw)
    expect(normalized).toEqual({
      ...raw,
      amount: 100,
      occurrences: 12,
      category: 'subscriptions'
    })
  })

  it('filters invalid recurring definitions', () => {
    const definitions = normalizeRecurringDefinitions([
      { period: '0 0 15 * *', startDate: '2024-01-01', amount: 100 },
      { period: '', startDate: '2024-01-01', amount: 100 },
      { period: '0 0 15 * *', startDate: '', amount: 100 },
      { period: '0 0 15 * *', startDate: '2024-01-01', amount: -10 }
    ])

    expect(definitions).toHaveLength(1)
    expect(definitions[0]).toMatchObject({ period: '0 0 15 * *', startDate: '2024-01-01', amount: 100 })
  })

  it('safely expands recurring flows with invalid occurrences and no end date', () => {
    const definition = {
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      amount: 100,
      direction: 'inflow',
      category: 'general',
      occurrences: 'invalid'
    }

    expect(expandRecurringFlows(definition, '2024-01-01', '2024-12-31')).toEqual([])
  })

  it('parses string occurrences directly in expandRecurringFlows', () => {
    const definition = {
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      occurrences: '12',
      amount: 100,
      direction: 'inflow',
      category: 'general'
    }

    expect(expandRecurringFlows(definition, '2024-01-01', '2024-12-31')).toHaveLength(12)
  })

  it('stops expanding recurring flows once the selected range ends', () => {
    const definition = {
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      occurrences: 120,
      amount: 100,
      direction: 'inflow',
      category: 'general'
    }

    expect(expandRecurringFlows(definition, '2024-01-01', '2024-01-31')).toHaveLength(1)
  })

  it('stops expanding flows for a range earlier than a distant endDate', () => {
    const definition = {
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      endDate: '2050-12-31',
      occurrences: 'invalid',
      amount: 100,
      direction: 'inflow',
      category: 'general'
    }

    expect(expandRecurringFlows(definition, '2024-01-01', '2024-01-31')).toEqual([
      {
        date: '2024-01-15',
        amount: 100,
        direction: 'inflow',
        category: 'general'
      }
    ])
  })

  it('adds a new one-time flow when id is not found', () => {
    const initial = [
      { id: 'a', date: '2024-01-01', amount: 50, direction: 'inflow', category: 'general' }
    ]

    const result = upsertFlowById(initial, {
      id: 'b',
      date: '2024-01-15',
      amount: 25,
      direction: 'outflow',
      category: 'rent'
    })

    expect(result).toHaveLength(2)
    expect(result.find((entry) => entry.id === 'b')).toMatchObject({ amount: 25, direction: 'outflow' })
  })

  it('edits an existing recurring flow by id', () => {
    const initial = [
      {
        id: 'rec-1',
        period: '0 0 15 * *',
        startDate: '2024-01-01',
        occurrences: 12,
        amount: 100,
        direction: 'inflow',
        category: 'salary'
      }
    ]

    const result = upsertFlowById(initial, {
      id: 'rec-1',
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      occurrences: 6,
      amount: 125,
      direction: 'inflow',
      category: 'salary'
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ occurrences: 6, amount: 125 })
  })

  it('deletes a flow by id', () => {
    const initial = [
      { id: 'a', date: '2024-01-01', amount: 50, direction: 'inflow', category: 'general' },
      { id: 'b', date: '2024-01-02', amount: 20, direction: 'outflow', category: 'rent' }
    ]

    const result = removeFlowById(initial, 'a')
    expect(result).toEqual([{ id: 'b', date: '2024-01-02', amount: 20, direction: 'outflow', category: 'rent' }])
  })

  it('recalculates cumulative totals from effective flows in range', () => {
    const oneTime = [
      { id: 'a', date: '2024-01-10', amount: 100, direction: 'inflow', category: 'salary' },
      { id: 'b', date: '2024-01-20', amount: 40, direction: 'outflow', category: 'rent' }
    ]

    const recurring = [
      {
        id: 'r1',
        period: '0 0 15 * *',
        startDate: '2024-01-01',
        occurrences: 1,
        amount: 10,
        direction: 'outflow',
        category: 'subscription'
      }
    ]

    const effective = buildEffectiveFlows(oneTime, recurring, '2024-01-01', '2024-01-31')
    const series = calculateCumulativeSeries(effective)

    expect(series).toEqual([
      { date: '2024-01-10', cumulativeTotal: 100 },
      { date: '2024-01-15', cumulativeTotal: 90 },
      { date: '2024-01-20', cumulativeTotal: 50 }
    ])
  })
})
