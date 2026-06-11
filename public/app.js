const ONE_TIME_STORAGE_KEY = 'privfina.one_time_cash_flows.v1'
const RECURRING_STORAGE_KEY = 'privfina.recurring_cash_flows.v1'

function toSignedAmount(flow) {
  return flow.direction === 'inflow' ? flow.amount : -flow.amount
}

function loadList(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveList(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function parseOccurrences(value) {
  if (Number.isInteger(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  return undefined
}

function normalizeRecurringDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    return null
  }

  const period = String(definition.period || '').trim()
  const startDate = String(definition.startDate || '').trim()
  const amount = Number(definition.amount)
  const direction = definition.direction === 'outflow' ? 'outflow' : 'inflow'
  const category = String(definition.category || '').trim() || 'general'
  const endDate = definition.endDate ? String(definition.endDate).trim() : undefined
  const occurrences = parseOccurrences(definition.occurrences)

  if (!period || !startDate || !Number.isFinite(amount) || amount < 0) {
    return null
  }

  const normalized = {
    ...definition,
    period,
    startDate,
    amount,
    direction,
    category
  }

  if (endDate) {
    normalized.endDate = endDate
  } else {
    delete normalized.endDate
  }

  if (occurrences !== undefined) {
    normalized.occurrences = occurrences
  } else {
    delete normalized.occurrences
  }

  return normalized
}

function normalizeRecurringDefinitions(definitions) {
  if (!Array.isArray(definitions)) {
    return []
  }

  return definitions
    .map(normalizeRecurringDefinition)
    .filter((definition) => definition !== null)
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new Error(`Invalid date: ${value}`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`)
  }
  return utc
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysInMonthUtc(year, monthZeroBased) {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate()
}

function parseMonthlyCronDay(period) {
  const cronMatch = /^([*]|[0-5]?\d)\s+([*]|[01]?\d|2[0-3])\s+([1-9]|[12]\d|3[01])\s+\*\s+\*$/.exec(
    String(period || '').trim()
  )
  if (!cronMatch) {
    throw new Error('Use monthly cron-like format: "m h day * *".')
  }
  return Number(cronMatch[3])
}

function expandRecurringFlows(definition, rangeStart, rangeEnd) {
  const dayOfMonth = parseMonthlyCronDay(definition.period)
  const startDate = parseIsoDate(definition.startDate)
  const rangeEndDate = parseIsoDate(rangeEnd)
  const endDate = definition.endDate ? parseIsoDate(definition.endDate) : null
  const occurrences = parseOccurrences(definition.occurrences)
  const hasValidOccurrences = typeof occurrences === 'number'
  const maxOccurrences = hasValidOccurrences
    ? occurrences
    : Number.MAX_SAFE_INTEGER

  if (!hasValidOccurrences && !endDate) {
    return []
  }

  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()
  const generated = []
  let iterationCount = 0
  const MAX_ITERATIONS = 10000

  while (generated.length < maxOccurrences && iterationCount < MAX_ITERATIONS) {
    iterationCount += 1
    const monthDays = daysInMonthUtc(year, month)
    if (dayOfMonth <= monthDays) {
      const candidate = new Date(Date.UTC(year, month, dayOfMonth))
      const inWindow = candidate.getTime() >= startDate.getTime()
      const beforeEnd = !endDate || candidate.getTime() <= endDate.getTime()
      if (inWindow && beforeEnd) {
        const iso = formatIsoDate(candidate)
        if (iso >= rangeStart && iso <= rangeEnd) {
          generated.push({
            date: iso,
            amount: definition.amount,
            direction: definition.direction,
            category: definition.category || 'general'
          })
        }
      }

      if (endDate && candidate.getTime() > endDate.getTime()) {
        break
      }
    }

    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }

    const nextCandidate = new Date(Date.UTC(year, month, dayOfMonth))
    if (nextCandidate.getTime() > rangeEndDate.getTime()) {
      break
    }
  }

  return generated
}

function buildEffectiveFlows(oneTime, recurring, rangeStart, rangeEnd) {
  const oneTimeInRange = oneTime.filter((flow) => flow.date >= rangeStart && flow.date <= rangeEnd)
  const recurringExpanded = recurring.flatMap((definition) => {
    try {
      return expandRecurringFlows(definition, rangeStart, rangeEnd)
    } catch {
      return []
    }
  })
  return [...oneTimeInRange, ...recurringExpanded].sort((a, b) => a.date.localeCompare(b.date))
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

function renderConfiguredTable(oneTimeFlows, recurringFlows, tbody, onDeleteOneTime, onDeleteRecurring) {
  tbody.innerHTML = ''
  const rows = []

  for (const flow of oneTimeFlows) {
    rows.push({
      id: flow.id,
      type: 'one-time',
      startOrDate: flow.date,
      endOrCount: '-',
      period: '-',
      direction: flow.direction,
      amount: flow.amount,
      category: flow.category || 'general'
    })
  }

  for (const flow of recurringFlows) {
    rows.push({
      id: flow.id,
      type: 'recurring',
      startOrDate: flow.startDate,
      endOrCount: flow.endDate || (flow.occurrences ? `count: ${flow.occurrences}` : '-'),
      period: flow.period,
      direction: flow.direction,
      amount: flow.amount,
      category: flow.category || 'general'
    })
  }

  rows.sort((a, b) => a.startOrDate.localeCompare(b.startOrDate))

  if (!rows.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.colSpan = 8
    cell.textContent = 'No cash flows configured yet.'
    row.appendChild(cell)
    tbody.appendChild(row)
    return
  }

  for (const rowData of rows) {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${rowData.type}</td>
      <td>${rowData.startOrDate}</td>
      <td>${rowData.endOrCount}</td>
      <td>${rowData.period}</td>
      <td>${rowData.direction}</td>
      <td>${rowData.amount.toFixed(2)}</td>
      <td>${rowData.category}</td>
      <td><button class="secondary" data-id="${rowData.id}" data-type="${rowData.type}" type="button">Delete</button></td>
    `

    row.querySelector('button')?.addEventListener('click', () => {
      if (rowData.type === 'one-time') {
        onDeleteOneTime(rowData.id)
      } else {
        onDeleteRecurring(rowData.id)
      }
    })

    tbody.appendChild(row)
  }
}

function renderChart(series, container) {
  if (!series.length) {
    container.innerHTML = '<div class="empty">No cash flows in selected range. Baseline total: 0.</div>'
    return
  }

  const width = 880
  const height = 260
  const pad = 28

  const timestamps = series.map((point) => new Date(point.date).getTime())
  const totals = series.map((point) => point.cumulativeTotal)

  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const minTotal = Math.min(0, ...totals)
  const maxTotal = Math.max(0, ...totals)

  const xScale = (value) => {
    if (maxTime === minTime) {
      return width / 2
    }
    return pad + ((value - minTime) / (maxTime - minTime)) * (width - pad * 2)
  }

  const yScale = (value) => {
    if (maxTotal === minTotal) {
      return height / 2
    }
    return pad + ((maxTotal - value) / (maxTotal - minTotal)) * (height - pad * 2)
  }

  const points = series
    .map((point) => `${xScale(new Date(point.date).getTime())},${yScale(point.cumulativeTotal)}`)
    .join(' ')

  const zeroY = yScale(0)

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative cash-flow chart">
      <line x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}" stroke="#bcb1a3" stroke-width="1" />
      <polyline fill="none" stroke="#0f766e" stroke-width="3" points="${points}" />
      <text x="${pad}" y="18" fill="#6f6558" font-size="12">Cumulative total</text>
      <text x="${pad}" y="${height - 8}" fill="#6f6558" font-size="12">${series[0].date}</text>
      <text x="${width - pad - 80}" y="${height - 8}" fill="#6f6558" font-size="12">${series[series.length - 1].date}</text>
    </svg>
  `
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

function init() {
  const oneTimeForm = document.getElementById('cash-flow-form')
  const recurringForm = document.getElementById('recurring-form')
  const rows = document.getElementById('configured-flow-rows')
  const chart = document.getElementById('chart')
  const startInput = document.getElementById('range-start')
  const endInput = document.getElementById('range-end')

  let oneTimeFlows = loadList(ONE_TIME_STORAGE_KEY)
  const rawRecurringFlows = loadList(RECURRING_STORAGE_KEY)
  let recurringFlows = normalizeRecurringDefinitions(rawRecurringFlows)

  if (JSON.stringify(recurringFlows) !== JSON.stringify(rawRecurringFlows)) {
    saveList(RECURRING_STORAGE_KEY, recurringFlows)
  }

  const defaultRange = suggestRange([
    ...oneTimeFlows.map((entry) => ({ date: entry.date })),
    ...recurringFlows.map((entry) => ({ date: entry.startDate }))
  ])
  startInput.value = defaultRange.startDate
  endInput.value = defaultRange.endDate

  function rerender() {
    const sortedOneTime = [...oneTimeFlows].sort((a, b) => a.date.localeCompare(b.date))
    const sortedRecurring = [...recurringFlows].sort((a, b) => a.startDate.localeCompare(b.startDate))

    renderConfiguredTable(
      sortedOneTime,
      sortedRecurring,
      rows,
      (id) => {
        oneTimeFlows = oneTimeFlows.filter((flow) => flow.id !== id)
        saveList(ONE_TIME_STORAGE_KEY, oneTimeFlows)

        if (!oneTimeFlows.length && !recurringFlows.length) {
          const fallbackDate = new Date().toISOString().slice(0, 10)
          startInput.value = fallbackDate
          endInput.value = fallbackDate
        }

        rerender()
      },
      (id) => {
        recurringFlows = recurringFlows.filter((flow) => flow.id !== id)
        saveList(RECURRING_STORAGE_KEY, recurringFlows)

        if (!oneTimeFlows.length && !recurringFlows.length) {
          const fallbackDate = new Date().toISOString().slice(0, 10)
          startInput.value = fallbackDate
          endInput.value = fallbackDate
        }

        rerender()
      }
    )

    const startDate = startInput.value
    const endDate = endInput.value
    if (!startDate || !endDate || startDate > endDate) {
      chart.innerHTML = '<div class="empty">Select a valid date range.</div>'
      return
    }

    let effectiveFlows
    try {
      effectiveFlows = buildEffectiveFlows(oneTimeFlows, recurringFlows, startDate, endDate)
    } catch (error) {
      chart.innerHTML = `<div class="empty">${error.message}</div>`
      return
    }

    const series = calculateCumulativeSeries(effectiveFlows)
    renderChart(series, chart)
  }

  oneTimeForm.addEventListener('submit', (event) => {
    event.preventDefault()

    const formData = new FormData(oneTimeForm)
    const amount = Number(formData.get('amount'))
    const date = String(formData.get('date') || '')
    const direction = String(formData.get('direction') || 'inflow')
    const category = String(formData.get('category') || '').trim() || 'general'

    if (!date || !Number.isFinite(amount) || amount < 0) {
      return
    }

    oneTimeFlows = [
      ...oneTimeFlows,
      {
        id: crypto.randomUUID(),
        date,
        amount,
        direction,
        category
      }
    ]
    saveList(ONE_TIME_STORAGE_KEY, oneTimeFlows)

    const range = suggestRange([...oneTimeFlows.map((entry) => ({ date: entry.date }))])
    startInput.value = range.startDate
    endInput.value = range.endDate

    oneTimeForm.reset()
    oneTimeForm.querySelector('#direction').value = 'inflow'

    rerender()
  })

  recurringForm.addEventListener('submit', (event) => {
    event.preventDefault()

    const formData = new FormData(recurringForm)
    const period = String(formData.get('period') || '').trim()
    const startDate = String(formData.get('startDate') || '')
    const endDate = String(formData.get('endDate') || '').trim()
    const occurrencesRaw = String(formData.get('occurrences') || '').trim()
    const amount = Number(formData.get('amount'))
    const direction = String(formData.get('direction') || 'inflow')
    const category = String(formData.get('category') || '').trim() || 'general'

    const hasEndDate = endDate.length > 0
    const hasOccurrences = occurrencesRaw.length > 0
    if (!hasEndDate && !hasOccurrences) {
      return
    }

    const occurrences = hasOccurrences ? Number(occurrencesRaw) : undefined
    if (hasOccurrences && (!Number.isInteger(occurrences) || occurrences <= 0)) {
      return
    }

    if (!startDate || !period || !Number.isFinite(amount) || amount < 0) {
      return
    }

    try {
      parseMonthlyCronDay(period)
      const parsedStart = parseIsoDate(startDate)
      if (hasEndDate) {
        const parsedEnd = parseIsoDate(endDate)
        if (parsedEnd.getTime() < parsedStart.getTime()) {
          return
        }
      }
    } catch {
      return
    }

    recurringFlows = [
      ...recurringFlows,
      {
        id: crypto.randomUUID(),
        period,
        startDate,
        endDate: hasEndDate ? endDate : undefined,
        occurrences,
        amount,
        direction,
        category
      }
    ]
    saveList(RECURRING_STORAGE_KEY, recurringFlows)

    const updatedRange = extendRange(startInput.value, endInput.value, startDate, endDate || startDate)
    startInput.value = updatedRange.startDate
    endInput.value = updatedRange.endDate

    recurringForm.reset()
    recurringForm.querySelector('#recurring-direction').value = 'inflow'

    rerender()
  })

  startInput.addEventListener('change', rerender)
  endInput.addEventListener('change', rerender)

  rerender()
}

export {
  parseOccurrences,
  normalizeRecurringDefinition,
  normalizeRecurringDefinitions,
  expandRecurringFlows,
  buildEffectiveFlows
}

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
if (isBrowser) {
  const runInit = () => {
    if (document.getElementById('cash-flow-form') && document.getElementById('recurring-form')) {
      init()
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', runInit)
  } else {
    runInit()
  }
}
