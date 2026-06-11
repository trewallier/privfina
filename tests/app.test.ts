import { describe, expect, it } from 'vitest'
import {
  parseOccurrences,
  normalizeRecurringDefinition,
  normalizeRecurringDefinitions,
  expandRecurringFlows
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
})
