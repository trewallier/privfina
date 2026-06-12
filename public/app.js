const ONE_TIME_STORAGE_KEY = 'privfina.one_time_cash_flows.v1'
const RECURRING_STORAGE_KEY = 'privfina.recurring_cash_flows.v1'
const STORAGE_SCHEMA_VERSION_KEY = 'privfina.storage_schema_version'
const EXPORT_KIND = 'privfina.export'
const CURRENT_EXPORT_SCHEMA_VERSION = 2
const MIN_SUPPORTED_IMPORT_SCHEMA_VERSION = 1

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

function normalizeOneTimeFlow(flow) {
  if (!flow || typeof flow !== 'object') {
    return null
  }

  const date = String(flow.date || '').trim()
  const amount = Number(flow.amount)
  const direction = flow.direction === 'outflow' ? 'outflow' : 'inflow'
  const category = String(flow.category || '').trim() || 'general'
  const id = typeof flow.id === 'string' && flow.id.trim() ? flow.id.trim() : undefined
  const description = typeof flow.description === 'string' ? flow.description : undefined

  if (!date || !Number.isFinite(amount) || amount < 0) {
    return null
  }

  return {
    ...flow,
    id,
    date,
    amount,
    direction,
    category,
    description
  }
}

function normalizeOneTimeFlows(flows) {
  if (!Array.isArray(flows)) {
    return []
  }

  return flows
    .map(normalizeOneTimeFlow)
    .filter((flow) => flow !== null)
}

function ensureFlowIds(flows, prefix) {
  return flows.map((flow, index) => {
    if (typeof flow.id === 'string' && flow.id.trim().length > 0) {
      return flow
    }

    let generatedId
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      generatedId = crypto.randomUUID()
    } else {
      generatedId = `${prefix}-${Date.now()}-${index}`
    }

    return {
      ...flow,
      id: generatedId
    }
  })
}

function buildExportDocument(oneTimeFlows, recurringFlows, nowIso) {
  return {
    kind: EXPORT_KIND,
    schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
    exportedAt: nowIso || new Date().toISOString(),
    data: {
      oneTimeCashFlows: normalizeOneTimeFlows(oneTimeFlows),
      recurringCashFlows: normalizeRecurringDefinitions(recurringFlows)
    }
  }
}

function extractImportV1Data(payload) {
  return {
    oneTimeCashFlows: payload.oneTimeCashFlows || payload.oneTimeFlows || payload.oneTime || [],
    recurringCashFlows: payload.recurringCashFlows || payload.recurringFlows || payload.recurring || []
  }
}

function extractImportData(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Import payload must be a JSON object.')
  }

  const schemaVersion = Number.isInteger(payload.schemaVersion)
    ? payload.schemaVersion
    : MIN_SUPPORTED_IMPORT_SCHEMA_VERSION

  if (schemaVersion < MIN_SUPPORTED_IMPORT_SCHEMA_VERSION) {
    throw new Error(`Import schema v${schemaVersion} is too old to be supported.`)
  }

  if (schemaVersion > CURRENT_EXPORT_SCHEMA_VERSION) {
    throw new Error(
      `Import schema v${schemaVersion} is newer than this app (v${CURRENT_EXPORT_SCHEMA_VERSION}).`
    )
  }

  if (schemaVersion === 1) {
    return {
      schemaVersion,
      data: extractImportV1Data(payload)
    }
  }

  const source = payload.data && typeof payload.data === 'object' ? payload.data : payload
  return {
    schemaVersion,
    data: {
      oneTimeCashFlows: source.oneTimeCashFlows || [],
      recurringCashFlows: source.recurringCashFlows || []
    }
  }
}

function migrateImportDataToCurrent(schemaVersion, data) {
  let currentVersion = schemaVersion
  let currentData = data
  const warnings = []

  while (currentVersion < CURRENT_EXPORT_SCHEMA_VERSION) {
    if (currentVersion === 1) {
      warnings.push('Imported legacy schema v1. Data was migrated to the current export schema.')
      currentVersion = 2
      currentData = {
        oneTimeCashFlows: currentData.oneTimeCashFlows || [],
        recurringCashFlows: currentData.recurringCashFlows || []
      }
      continue
    }

    throw new Error(`No migration path is available from schema v${currentVersion}.`)
  }

  return {
    schemaVersion: currentVersion,
    data: currentData,
    warnings
  }
}

function parseImportDocument(payload) {
  const extracted = extractImportData(payload)
  const migrated = migrateImportDataToCurrent(extracted.schemaVersion, extracted.data)

  const oneTimeFlows = ensureFlowIds(normalizeOneTimeFlows(migrated.data.oneTimeCashFlows), 'one')
  const recurringFlows = ensureFlowIds(
    normalizeRecurringDefinitions(migrated.data.recurringCashFlows),
    'recurring'
  )

  return {
    oneTimeFlows,
    recurringFlows,
    schemaVersion: migrated.schemaVersion,
    warnings: migrated.warnings
  }
}

function checkStorageSchemaVersion() {
  const raw = localStorage.getItem(STORAGE_SCHEMA_VERSION_KEY)
  const stored = raw ? Number(raw) : undefined
  const validStored = Number.isInteger(stored) ? stored : undefined
  const warnings = []

  if (validStored !== undefined && validStored !== CURRENT_EXPORT_SCHEMA_VERSION) {
    if (validStored > CURRENT_EXPORT_SCHEMA_VERSION) {
      warnings.push(
        `Detected newer local schema v${validStored}. This app uses v${CURRENT_EXPORT_SCHEMA_VERSION}; compatibility is limited.`
      )
    } else {
      warnings.push(
        `Local schema changed from v${validStored} to v${CURRENT_EXPORT_SCHEMA_VERSION}. Export a fresh backup JSON.`
      )
    }
  }

  localStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, String(CURRENT_EXPORT_SCHEMA_VERSION))

  return {
    storedSchemaVersion: validStored,
    currentSchemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
    warnings
  }
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

function renderConfiguredTable(
  oneTimeFlows,
  recurringFlows,
  tbody,
  onEditOneTime,
  onDeleteOneTime,
  onEditRecurring,
  onDeleteRecurring
) {
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
      <td>
        <button class="primary action-edit" data-id="${rowData.id}" data-type="${rowData.type}" type="button">Edit</button>
        <button class="secondary action-delete" data-id="${rowData.id}" data-type="${rowData.type}" type="button">Delete</button>
      </td>
    `

    row.querySelector('.action-edit')?.addEventListener('click', () => {
      if (rowData.type === 'one-time') {
        onEditOneTime(rowData.id)
      } else {
        onEditRecurring(rowData.id)
      }
    })

    row.querySelector('.action-delete')?.addEventListener('click', () => {
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
  const oneTimeSubmitButton = document.getElementById('one-time-submit')
  const recurringSubmitButton = document.getElementById('recurring-submit')
  const oneTimeCancelButton = document.getElementById('one-time-cancel-edit')
  const recurringCancelButton = document.getElementById('recurring-cancel-edit')
  const schemaWarning = document.getElementById('schema-warning')
  const storageStatus = document.getElementById('storage-status')
  const exportButton = document.getElementById('export-json-button')
  const importInput = document.getElementById('import-json-input')
  const importButton = document.getElementById('import-json-button')
  const rows = document.getElementById('configured-flow-rows')
  const chart = document.getElementById('chart')
  const startInput = document.getElementById('range-start')
  const endInput = document.getElementById('range-end')

  const schemaCheck = checkStorageSchemaVersion()
  if (schemaWarning) {
    if (schemaCheck.warnings.length > 0) {
      schemaWarning.hidden = false
      schemaWarning.textContent = schemaCheck.warnings.join(' ')
      console.warn(schemaWarning.textContent)
    } else {
      schemaWarning.hidden = true
      schemaWarning.textContent = ''
    }
  }

  function setStorageStatus(message, level) {
    if (!storageStatus) {
      return
    }

    storageStatus.textContent = message
    storageStatus.dataset.level = level || 'info'
  }

  let oneTimeFlows = normalizeOneTimeFlows(loadList(ONE_TIME_STORAGE_KEY))
  oneTimeFlows = ensureFlowIds(oneTimeFlows, 'one')
  const rawRecurringFlows = loadList(RECURRING_STORAGE_KEY)
  let recurringFlows = ensureFlowIds(normalizeRecurringDefinitions(rawRecurringFlows), 'recurring')
  let editingOneTimeId = null
  let editingRecurringId = null

  function resetOneTimeForm() {
    editingOneTimeId = null
    oneTimeForm.reset()
    oneTimeForm.querySelector('#direction').value = 'inflow'
    oneTimeSubmitButton.textContent = 'Add Cash Flow'
    oneTimeCancelButton.hidden = true
  }

  function resetRecurringForm() {
    editingRecurringId = null
    recurringForm.reset()
    recurringForm.querySelector('#recurring-direction').value = 'inflow'
    recurringSubmitButton.textContent = 'Add Recurring Cash Flow'
    recurringCancelButton.hidden = true
  }

  function startOneTimeEdit(id) {
    const target = oneTimeFlows.find((flow) => flow.id === id)
    if (!target) {
      return
    }

    editingOneTimeId = id
    oneTimeForm.querySelector('#date').value = target.date
    oneTimeForm.querySelector('#amount').value = String(target.amount)
    oneTimeForm.querySelector('#direction').value = target.direction
    oneTimeForm.querySelector('#category').value = target.category || 'general'
    oneTimeSubmitButton.textContent = 'Save Cash Flow'
    oneTimeCancelButton.hidden = false
  }

  function startRecurringEdit(id) {
    const target = recurringFlows.find((flow) => flow.id === id)
    if (!target) {
      return
    }

    editingRecurringId = id
    recurringForm.querySelector('#period').value = target.period
    recurringForm.querySelector('#start-date').value = target.startDate
    recurringForm.querySelector('#end-date').value = target.endDate || ''
    recurringForm.querySelector('#occurrences').value =
      target.occurrences !== undefined ? String(target.occurrences) : ''
    recurringForm.querySelector('#recurring-amount').value = String(target.amount)
    recurringForm.querySelector('#recurring-direction').value = target.direction
    recurringForm.querySelector('#recurring-category').value = target.category || 'general'
    recurringSubmitButton.textContent = 'Save Recurring Cash Flow'
    recurringCancelButton.hidden = false
  }

  if (JSON.stringify(oneTimeFlows) !== JSON.stringify(loadList(ONE_TIME_STORAGE_KEY))) {
    saveList(ONE_TIME_STORAGE_KEY, oneTimeFlows)
  }

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
        startOneTimeEdit(id)
      },
      (id) => {
        oneTimeFlows = removeFlowById(oneTimeFlows, id)
        saveList(ONE_TIME_STORAGE_KEY, oneTimeFlows)

        if (editingOneTimeId === id) {
          resetOneTimeForm()
        }

        if (!oneTimeFlows.length && !recurringFlows.length) {
          const fallbackDate = new Date().toISOString().slice(0, 10)
          startInput.value = fallbackDate
          endInput.value = fallbackDate
        }

        rerender()
      },
      (id) => {
        startRecurringEdit(id)
      },
      (id) => {
        recurringFlows = removeFlowById(recurringFlows, id)
        saveList(RECURRING_STORAGE_KEY, recurringFlows)

        if (editingRecurringId === id) {
          resetRecurringForm()
        }

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

    const oneTimeFlow = {
      id: editingOneTimeId || crypto.randomUUID(),
      date,
      amount,
      direction,
      category
    }

    oneTimeFlows = upsertFlowById(oneTimeFlows, oneTimeFlow)
    saveList(ONE_TIME_STORAGE_KEY, oneTimeFlows)

    const updatedRange = extendRange(startInput.value, endInput.value, date, date)
    startInput.value = updatedRange.startDate
    endInput.value = updatedRange.endDate

    resetOneTimeForm()

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

    const recurringFlow = {
      id: editingRecurringId || crypto.randomUUID(),
      period,
      startDate,
      endDate: hasEndDate ? endDate : undefined,
      occurrences,
      amount,
      direction,
      category
    }

    recurringFlows = upsertFlowById(recurringFlows, recurringFlow)
    saveList(RECURRING_STORAGE_KEY, recurringFlows)

    const updatedRange = extendRange(startInput.value, endInput.value, startDate, endDate || startDate)
    startInput.value = updatedRange.startDate
    endInput.value = updatedRange.endDate

    resetRecurringForm()

    rerender()
  })

  oneTimeCancelButton.addEventListener('click', () => {
    resetOneTimeForm()
  })

  recurringCancelButton.addEventListener('click', () => {
    resetRecurringForm()
  })

  startInput.addEventListener('change', rerender)
  endInput.addEventListener('change', rerender)

  if (exportButton) {
    exportButton.addEventListener('click', () => {
      const exportDoc = buildExportDocument(oneTimeFlows, recurringFlows)
      const blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const stamp = exportDoc.exportedAt.slice(0, 10)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `privfina-export-v${exportDoc.schemaVersion}-${stamp}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setStorageStatus(`Exported JSON backup with schema v${exportDoc.schemaVersion}.`, 'success')
    })
  }

  if (importButton && importInput) {
    importButton.addEventListener('click', async () => {
      const file = importInput.files && importInput.files[0]
      if (!file) {
        setStorageStatus('Select a JSON file to import.', 'warning')
        return
      }

      try {
        const raw = await file.text()
        const parsed = JSON.parse(raw)
        const imported = parseImportDocument(parsed)

        oneTimeFlows = imported.oneTimeFlows
        recurringFlows = imported.recurringFlows
        saveList(ONE_TIME_STORAGE_KEY, oneTimeFlows)
        saveList(RECURRING_STORAGE_KEY, recurringFlows)
        localStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, String(imported.schemaVersion))

        const defaultRange = suggestRange([
          ...oneTimeFlows.map((entry) => ({ date: entry.date })),
          ...recurringFlows.map((entry) => ({ date: entry.startDate }))
        ])
        startInput.value = defaultRange.startDate
        endInput.value = defaultRange.endDate

        const extra = imported.warnings.length > 0 ? ` ${imported.warnings.join(' ')}` : ''
        setStorageStatus(
          `Imported ${oneTimeFlows.length} one-time and ${recurringFlows.length} recurring flows (schema v${imported.schemaVersion}).${extra}`,
          imported.warnings.length > 0 ? 'warning' : 'success'
        )
        rerender()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import JSON data.'
        setStorageStatus(message, 'error')
      }
    })
  }

  rerender()
}

export {
  CURRENT_EXPORT_SCHEMA_VERSION,
  MIN_SUPPORTED_IMPORT_SCHEMA_VERSION,
  parseOccurrences,
  normalizeOneTimeFlow,
  normalizeOneTimeFlows,
  normalizeRecurringDefinition,
  normalizeRecurringDefinitions,
  buildExportDocument,
  parseImportDocument,
  migrateImportDataToCurrent,
  checkStorageSchemaVersion,
  expandRecurringFlows,
  buildEffectiveFlows,
  calculateCumulativeSeries,
  upsertFlowById,
  removeFlowById
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
