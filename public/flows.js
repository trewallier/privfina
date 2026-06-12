import { expandRecurringFlows } from './recurrence.js'

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

function buildEffectiveFlows(oneTime, recurring, rangeStart, rangeEnd, instrumentBundles = []) {
  const oneTimeInRange = oneTime.filter((flow) => flow.date >= rangeStart && flow.date <= rangeEnd)
  const recurringExpanded = recurring.flatMap((definition) => {
    try {
      return expandRecurringFlows(definition, rangeStart, rangeEnd)
    } catch {
      return []
    }
  })

  const instrumentFlows = instrumentBundles.flatMap((bundle) => {
    const generatedFlows = Array.isArray(bundle.generatedFlows) ? bundle.generatedFlows : []
    return generatedFlows.filter((flow) => flow.date >= rangeStart && flow.date <= rangeEnd)
  })

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
  buildEffectiveFlows,
  calculateCumulativeSeries,
  suggestRange,
  extendRange
}