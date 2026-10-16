import { describe, expect, it } from 'vitest'
import {
  EvalResultCache,
  fingerprintRecurringDefinition,
  buildRecurringEvaluateCacheKey,
  buildRecurringExpandCacheKey,
  buildInstrumentRangeCacheKey,
  evaluateRecurringWithCache,
  sharedEvalResultCache
} from '../src/finance_engine/engine'
import { CashFlowDirection } from '../src/finance_engine/models'
import {
  expandRecurringFlowsCached,
  buildEffectiveFlows
} from '../public/flows.js'
import {
  sharedEvalResultCache as browserCache,
  fingerprintRecurringDefinition as browserFingerprint
} from '../public/eval-cache.js'
import { generateLoanInstrumentBundle } from '../public/instruments.js'

describe('EvalResultCache (engine)', () => {
  it('records hits and misses and clones array values', () => {
    const cache = new EvalResultCache(8)
    const key = 'recurring-expand|demo'
    expect(cache.get(key)).toBeUndefined()
    expect(cache.stats().misses).toBe(1)

    const value = [{ date: '2026-01-01', amount: 10 }]
    cache.set(key, value)
    const first = cache.get<Array<{ date: string; amount: number }>>(key)
    expect(first).toEqual(value)
    expect(cache.stats().hits).toBe(1)

    first![0].amount = 99
    expect(cache.get<Array<{ amount: number }>>(key)![0].amount).toBe(10)
  })

  it('evicts oldest entries when exceeding maxEntries', () => {
    const cache = new EvalResultCache(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(true)
    expect(cache.has('c')).toBe(true)
  })

  it('invalidates by kind, fingerprint, and instrument id', () => {
    const cache = new EvalResultCache()
    const def = {
      id: 'r1',
      period: '0 0 15 * *',
      startDate: '2026-01-01',
      occurrences: 3,
      amount: 100,
      direction: CashFlowDirection.Inflow
    }
    const fingerprint = fingerprintRecurringDefinition(def)
    const evaluateKey = buildRecurringEvaluateCacheKey(
      def,
      { startDate: '2026-01-01', endDate: '2026-12-31' },
      'aggregate'
    )
    const expandKey = buildRecurringExpandCacheKey(def, '2026-01-01', '2026-12-31')
    const instrumentKey = buildInstrumentRangeCacheKey('loan-1', '2026-01-01T00:00:00.000Z', '2026-01-01', '2026-12-31')

    cache.set(evaluateKey, 300)
    cache.set(expandKey, [])
    cache.set(instrumentKey, [])

    expect(cache.invalidateRecurringFingerprint(fingerprint)).toBe(2)
    expect(cache.has(evaluateKey)).toBe(false)
    expect(cache.has(expandKey)).toBe(false)
    expect(cache.has(instrumentKey)).toBe(true)

    expect(cache.invalidateInstrument('loan-1')).toBe(1)
    expect(cache.size).toBe(0)

    cache.set(expandKey, [])
    cache.set(instrumentKey, [])
    expect(cache.invalidateByKind('recurring-expand')).toBe(1)
    expect(cache.has(instrumentKey)).toBe(true)
    cache.invalidateAll()
    expect(cache.size).toBe(0)
  })

  it('evaluateRecurringWithCache returns stable aggregate results across hits', () => {
    sharedEvalResultCache.invalidateAll()
    const input = {
      period: '0 0 15 * *',
      startDate: '2026-01-15',
      occurrences: 12,
      amount: 100,
      direction: CashFlowDirection.Inflow
    }
    const range = { startDate: '2026-01-01', endDate: '2026-12-31' }

    const first = evaluateRecurringWithCache(input, range, 'aggregate')
    const beforeHits = sharedEvalResultCache.stats().hits
    const second = evaluateRecurringWithCache(input, range, 'aggregate')
    expect(second).toBe(first)
    expect(sharedEvalResultCache.stats().hits).toBe(beforeHits + 1)

    const changed = evaluateRecurringWithCache({ ...input, amount: 200 }, range, 'aggregate')
    expect(changed).toBe(2400)
  })
})

describe('browser eval cache wiring', () => {
  it('caches recurring expand results used by buildEffectiveFlows', () => {
    browserCache.invalidateAll()
    const definition = {
      id: 'salary-recurring',
      period: '0 0 15 * *',
      startDate: '2026-01-01',
      occurrences: 12,
      amount: 100,
      direction: 'inflow',
      category: 'salary'
    }

    const first = expandRecurringFlowsCached(definition, '2026-01-01', '2026-06-30')
    expect(first.length).toBeGreaterThan(0)
    const missesAfterFirst = browserCache.stats().misses
    const second = expandRecurringFlowsCached(definition, '2026-01-01', '2026-06-30')
    expect(second).toEqual(first)
    expect(browserCache.stats().hits).toBeGreaterThan(0)
    expect(browserCache.stats().misses).toBe(missesAfterFirst)

    second[0].amount = 1
    expect(expandRecurringFlowsCached(definition, '2026-01-01', '2026-06-30')[0].amount).toBe(100)
  })

  it('caches instrument range slices keyed by bundle updatedAt', () => {
    browserCache.invalidateAll()
    const bundle = generateLoanInstrumentBundle({
      id: 'loan-cache-1',
      principal: 1200,
      annualRate: 0,
      termValue: 3,
      termUnit: 'months',
      startDate: '2026-01-01',
      repaymentDayOfMonth: 1,
      includeDisbursement: true,
      createdAt: '2026-01-01T00:00:00.000Z'
    })

    const first = buildEffectiveFlows([], [], '2026-01-01', '2026-12-31', [bundle], browserCache)
    expect(first.some((flow) => flow.sourceInstrumentId === 'loan-cache-1')).toBe(true)
    const hitsBefore = browserCache.stats().hits
    buildEffectiveFlows([], [], '2026-01-01', '2026-12-31', [bundle], browserCache)
    expect(browserCache.stats().hits).toBeGreaterThan(hitsBefore)

    const edited = {
      ...bundle,
      updatedAt: '2026-02-01T00:00:00.000Z',
      generatedFlows: bundle.generatedFlows.slice(0, 1)
    }
    const afterEdit = buildEffectiveFlows([], [], '2026-01-01', '2026-12-31', [edited], browserCache)
    expect(afterEdit).toHaveLength(1)
  })

  it('keeps browser fingerprints aligned with definition identity changes', () => {
    const base = {
      id: 'r1',
      period: '0 0 1 * *',
      startDate: '2026-01-01',
      occurrences: 2,
      amount: 10,
      direction: 'outflow',
      category: 'bills'
    }
    const original = browserFingerprint(base)
    const changed = browserFingerprint({ ...base, amount: 11 })
    expect(original).not.toBe(changed)
  })
})
