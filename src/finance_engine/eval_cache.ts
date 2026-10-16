import type { CashFlow } from './models'
import type { DateRange, RecurringCashFlowInput } from './interfaces'
import { evaluateRecurring } from './recurring'

export type EvalCacheKind = 'recurring-evaluate' | 'recurring-expand' | 'instrument-range'

export interface EvalCacheStats {
  size: number
  hits: number
  misses: number
  maxEntries: number
}

type RecurringFingerprintInput = Pick<
  RecurringCashFlowInput,
  'period' | 'startDate' | 'endDate' | 'occurrences' | 'amount' | 'direction' | 'category' | 'description'
> & { id?: string }

function cloneCacheValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      entry && typeof entry === 'object' ? { ...(entry as Record<string, unknown>) } : entry
    ) as T
  }
  return value
}

/**
 * In-memory evaluation-result cache with explicit invalidation helpers.
 * Keys are opaque strings built by the fingerprint helpers below.
 */
export class EvalResultCache {
  private readonly entries = new Map<string, unknown>()
  private hits = 0
  private misses = 0

  constructor(private readonly maxEntries = 256) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('maxEntries must be a positive integer.')
    }
  }

  get<T>(key: string): T | undefined {
    if (!this.entries.has(key)) {
      this.misses += 1
      return undefined
    }

    this.hits += 1
    // Refresh LRU order
    const value = this.entries.get(key) as T
    this.entries.delete(key)
    this.entries.set(key, value)
    return cloneCacheValue(value)
  }

  set(key: string, value: unknown): void {
    if (this.entries.has(key)) {
      this.entries.delete(key)
    }
    this.entries.set(key, cloneCacheValue(value))

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined
      if (oldestKey === undefined) {
        break
      }
      this.entries.delete(oldestKey)
    }
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  invalidateAll(): void {
    this.entries.clear()
  }

  invalidateWhere(predicate: (key: string) => boolean): number {
    let removed = 0
    for (const key of [...this.entries.keys()]) {
      if (predicate(key)) {
        this.entries.delete(key)
        removed += 1
      }
    }
    return removed
  }

  invalidateByKind(kind: EvalCacheKind): number {
    const prefix = `${kind}|`
    return this.invalidateWhere((key) => key.startsWith(prefix))
  }

  invalidateRecurringFingerprint(fingerprint: string): number {
    const token = `|def:${fingerprint}|`
    return this.invalidateWhere((key) => key.includes(token))
  }

  invalidateInstrument(bundleId: string): number {
    const token = `|bundle:${bundleId}|`
    return this.invalidateWhere((key) => key.includes(token))
  }

  get size(): number {
    return this.entries.size
  }

  stats(): EvalCacheStats {
    return {
      size: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      maxEntries: this.maxEntries
    }
  }
}

export function fingerprintRecurringDefinition(definition: RecurringFingerprintInput): string {
  return JSON.stringify({
    id: typeof definition.id === 'string' ? definition.id : null,
    period: String(definition.period || ''),
    startDate: String(definition.startDate || ''),
    endDate: definition.endDate ? String(definition.endDate) : null,
    occurrences: typeof definition.occurrences === 'number' ? definition.occurrences : null,
    amount: Number(definition.amount),
    direction: definition.direction,
    category: definition.category ?? null,
    description: definition.description ?? null
  })
}

export function buildRecurringEvaluateCacheKey(
  definition: RecurringFingerprintInput,
  range: DateRange,
  mode: 'expand' | 'aggregate' | 'npv',
  opts?: { discountRate?: number; baseDate?: string }
): string {
  const fingerprint = fingerprintRecurringDefinition(definition)
  const optsFingerprint = JSON.stringify({
    discountRate: opts?.discountRate ?? null,
    baseDate: opts?.baseDate ?? null
  })
  return `recurring-evaluate|def:${fingerprint}|range:${range.startDate}:${range.endDate}|mode:${mode}|opts:${optsFingerprint}`
}

export function buildRecurringExpandCacheKey(
  definition: RecurringFingerprintInput,
  rangeStart: string,
  rangeEnd: string
): string {
  const fingerprint = fingerprintRecurringDefinition(definition)
  return `recurring-expand|def:${fingerprint}|range:${rangeStart}:${rangeEnd}`
}

export function buildInstrumentRangeCacheKey(
  bundleId: string,
  updatedAt: string,
  rangeStart: string,
  rangeEnd: string
): string {
  return `instrument-range|bundle:${bundleId}|updated:${updatedAt}|range:${rangeStart}:${rangeEnd}`
}

export const sharedEvalResultCache = new EvalResultCache()

export function evaluateRecurringWithCache(
  input: RecurringCashFlowInput,
  range: DateRange,
  mode: 'expand' | 'aggregate' | 'npv',
  opts?: { discountRate?: number; baseDate?: string },
  cache: EvalResultCache = sharedEvalResultCache
): number | CashFlow[] {
  const key = buildRecurringEvaluateCacheKey(input, range, mode, opts)
  const cached = cache.get<number | CashFlow[]>(key)
  if (cached !== undefined) {
    return cached
  }

  const computed = evaluateRecurring(input, range, mode, opts)
  cache.set(key, computed)
  return cloneCacheValue(computed)
}
