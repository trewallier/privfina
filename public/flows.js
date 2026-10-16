import { expandRecurringFlows } from './recurrence.js'
import { flattenInstrumentFlows } from './instruments.js'
import {
  sharedEvalResultCache,
  buildRecurringExpandCacheKey,
  buildInstrumentRangeCacheKey
} from './eval-cache.js'

function toSignedAmount(flow) {
  return flow.direction === 'inflow' ? flow.amount : -flow.amount
}

function upsertFlowById(flows, nextFlow) {
  let replaced = false
  const updated = flows.map((flow) => {
    if (flow.id === nextFlow.id) {
      replaced = true
      return nextFlow
    }
    return flow
  })

  if (!replaced) {
    updated.push(nextFlow)
  }

  return updated
}

function removeFlowById(flows, id) {
  return flows.filter((flow) => flow.id !== id)
}

function expandRecurringFlowsCached(definition, rangeStart, rangeEnd, cache = sharedEvalResultCache) {
  const key = buildRecurringExpandCacheKey(definition, rangeStart, rangeEnd)
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const expanded = expandRecurringFlows(definition, rangeStart, rangeEnd)
  cache.set(key, expanded)
  return expanded.map((flow) => ({ ...flow }))
}

function instrumentFlowsInRange(bundle, rangeStart, rangeEnd, cache = sharedEvalResultCache) {
  const bundleId = typeof bundle?.id === 'string' ? bundle.id : ''
  const updatedAt = typeof bundle?.updatedAt === 'string' ? bundle.updatedAt : ''
  const key = buildInstrumentRangeCacheKey(bundleId, updatedAt, rangeStart, rangeEnd)
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const flows = flattenInstrumentFlows([bundle]).filter(
    (flow) => flow.date >= rangeStart && flow.date <= rangeEnd
  )
  cache.set(key, flows)
  return flows.map((flow) => ({ ...flow }))
}

function buildEffectiveFlows(
  oneTime,
  recurring,
  rangeStart,
  rangeEnd,
  instrumentBundles = [],
  cache = sharedEvalResultCache
) {
  const oneTimeInRange = oneTime.filter((flow) => flow.date >= rangeStart && flow.date <= rangeEnd)
  const recurringExpanded = recurring.flatMap((definition) => {
    try {
      return expandRecurringFlowsCached(definition, rangeStart, rangeEnd, cache)
    } catch {
      return []
    }
  })

  const instrumentFlows = instrumentBundles.flatMap((bundle) =>
    instrumentFlowsInRange(bundle, rangeStart, rangeEnd, cache)
  )

  return [...oneTimeInRange, ...recurringExpanded, ...instrumentFlows].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
}

function calculateCumulativeSeries(flows) {
  let runningTotal = 0
  return flows.map((flow) => {
    runningTotal += toSignedAmount(flow)
    return {
      date: flow.date,
      cumulativeTotal: runningTotal
    }
  })
}

function suggestRange(flows) {
  if (!flows.length) {
    const now = new Date().toISOString().slice(0, 10)
    return { startDate: now, endDate: now }
  }

  const sortedDates = flows.map((flow) => flow.date).sort((a, b) => a.localeCompare(b))
  return {
    startDate: sortedDates[0],
    endDate: sortedDates[sortedDates.length - 1]
  }
}

function extendRange(currentStart, currentEnd, candidateStart, candidateEnd) {
  const starts = [currentStart, candidateStart].filter(Boolean)
  const ends = [currentEnd, candidateEnd].filter(Boolean)
  return {
    startDate: starts.sort((a, b) => a.localeCompare(b))[0],
    endDate: ends.sort((a, b) => a.localeCompare(b))[ends.length - 1]
  }
}

export {
  toSignedAmount,
  upsertFlowById,
  removeFlowById,
  expandRecurringFlowsCached,
  buildEffectiveFlows,
  calculateCumulativeSeries,
  suggestRange,
  extendRange
}
