/**
 * Browser evaluation-result cache (mirrors src/finance_engine/eval_cache.ts).
 * Used by chart/expand paths; invalidate on definition or bundle mutations.
 */

function cloneCacheValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => (entry && typeof entry === 'object' ? { ...entry } : entry))
  }
  return value
}

class EvalResultCache {
  constructor(maxEntries = 256) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('maxEntries must be a positive integer.')
    }
    this.maxEntries = maxEntries
    this.entries = new Map()
    this.hits = 0
    this.misses = 0
  }

  get(key) {
    if (!this.entries.has(key)) {
      this.misses += 1
      return undefined
    }

    this.hits += 1
    const value = this.entries.get(key)
    this.entries.delete(key)
    this.entries.set(key, value)
    return cloneCacheValue(value)
  }

  set(key, value) {
    if (this.entries.has(key)) {
      this.entries.delete(key)
    }
    this.entries.set(key, cloneCacheValue(value))

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) {
        break
      }
      this.entries.delete(oldestKey)
    }
  }

  has(key) {
    return this.entries.has(key)
  }

  invalidateAll() {
    this.entries.clear()
  }

  invalidateWhere(predicate) {
    let removed = 0
    for (const key of [...this.entries.keys()]) {
      if (predicate(key)) {
        this.entries.delete(key)
        removed += 1
      }
    }
    return removed
  }

  invalidateByKind(kind) {
    const prefix = `${kind}|`
    return this.invalidateWhere((key) => key.startsWith(prefix))
  }

  invalidateRecurringFingerprint(fingerprint) {
    const token = `|def:${fingerprint}|`
    return this.invalidateWhere((key) => key.includes(token))
  }

  invalidateInstrument(bundleId) {
    const token = `|bundle:${bundleId}|`
    return this.invalidateWhere((key) => key.includes(token))
  }

  get size() {
    return this.entries.size
  }

  stats() {
    return {
      size: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      maxEntries: this.maxEntries
    }
  }
}

function fingerprintRecurringDefinition(definition) {
  return JSON.stringify({
    id: typeof definition?.id === 'string' ? definition.id : null,
    period: String(definition?.period || ''),
    startDate: String(definition?.startDate || ''),
    endDate: definition?.endDate ? String(definition.endDate) : null,
    occurrences: typeof definition?.occurrences === 'number' ? definition.occurrences : null,
    amount: Number(definition?.amount),
    direction: definition?.direction === 'outflow' ? 'outflow' : 'inflow',
    category: definition?.category ?? null,
    description: definition?.description ?? null
  })
}

function buildRecurringExpandCacheKey(definition, rangeStart, rangeEnd) {
  const fingerprint = fingerprintRecurringDefinition(definition)
  return `recurring-expand|def:${fingerprint}|range:${rangeStart}:${rangeEnd}`
}

function buildInstrumentRangeCacheKey(bundleId, updatedAt, rangeStart, rangeEnd) {
  return `instrument-range|bundle:${bundleId}|updated:${updatedAt}|range:${rangeStart}:${rangeEnd}`
}

const sharedEvalResultCache = new EvalResultCache()

export {
  EvalResultCache,
  fingerprintRecurringDefinition,
  buildRecurringExpandCacheKey,
  buildInstrumentRangeCacheKey,
  sharedEvalResultCache
}
