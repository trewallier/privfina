import {
  ONE_TIME_STORAGE_KEY,
  RECURRING_STORAGE_KEY,
  STORAGE_SCHEMA_VERSION_KEY,
  loadList,
  saveList
} from './storage.js'
import {
  normalizeOneTimeFlows,
  ensureFlowIds,
  buildExportDocument,
  parseImportDocument,
  checkStorageSchemaVersion
} from './import-export.js'
import {
  normalizeRecurringDefinitions,
  parseIsoDate,
  parseMonthlyCronDay
} from './recurrence.js'
import {
  upsertFlowById,
  removeFlowById,
  buildEffectiveFlows,
  calculateCumulativeSeries,
  suggestRange,
  extendRange
} from './flows.js'
import { renderConfiguredTable, renderChart } from './render.js'

function createFlowId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${prefix}-${Date.now()}`
}

function initController() {
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
  const flowComposer = document.getElementById('flow-composer')
  const toggleComposerButton = document.getElementById('toggle-composer')
  const openOneTimeBoxButton = document.getElementById('open-one-time-box')
  const openRecurringBoxButton = document.getElementById('open-recurring-box')
  const oneTimeBox = document.getElementById('one-time-box')
  const recurringBox = document.getElementById('recurring-box')

  if (
    !oneTimeForm ||
    !recurringForm ||
    !oneTimeSubmitButton ||
    !recurringSubmitButton ||
    !oneTimeCancelButton ||
    !recurringCancelButton ||
    !rows ||
    !chart ||
    !startInput ||
    !endInput
  ) {
    return
  }

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

  let oneTimeFlows = ensureFlowIds(normalizeOneTimeFlows(loadList(ONE_TIME_STORAGE_KEY)), 'one')
  const rawRecurringFlows = loadList(RECURRING_STORAGE_KEY)
  let recurringFlows = ensureFlowIds(normalizeRecurringDefinitions(rawRecurringFlows), 'recurring')
  let editingOneTimeId = null
  let editingRecurringId = null

  function setComposerVisibility(isVisible) {
    if (!flowComposer || !toggleComposerButton) {
      return
    }

    flowComposer.hidden = !isVisible
    toggleComposerButton.setAttribute('aria-expanded', String(isVisible))
    toggleComposerButton.textContent = isVisible ? 'Hide Add Flow Boxes' : 'Show Add Flow Boxes'
  }

  function collapseComposerBoxes() {
    if (oneTimeBox) {
      oneTimeBox.open = false
    }

    if (recurringBox) {
      recurringBox.open = false
    }
  }

  function openComposerBox(type) {
    setComposerVisibility(true)

    if (type === 'one-time') {
      if (recurringBox) {
        recurringBox.open = false
      }
      if (oneTimeBox) {
        oneTimeBox.open = true
      }
      return
    }

    if (oneTimeBox) {
      oneTimeBox.open = false
    }
    if (recurringBox) {
      recurringBox.open = true
    }
  }

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

  function resetRangeIfEmpty() {
    if (oneTimeFlows.length || recurringFlows.length) {
      return
    }

    const fallbackDate = new Date().toISOString().slice(0, 10)
    startInput.value = fallbackDate
    endInput.value = fallbackDate
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
    openComposerBox('one-time')
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
    openComposerBox('recurring')
  }

  if (JSON.stringify(oneTimeFlows) !== JSON.stringify(loadList(ONE_TIME_STORAGE_KEY))) {
    saveList(ONE_TIME_STORAGE_KEY, oneTimeFlows)
  }

  if (JSON.stringify(recurringFlows) !== JSON.stringify(rawRecurringFlows)) {
    saveList(RECURRING_STORAGE_KEY, recurringFlows)
  }

  if (oneTimeBox) {
    oneTimeBox.addEventListener('toggle', () => {
      if (oneTimeBox.open && recurringBox) {
        recurringBox.open = false
      }
    })
  }

  if (recurringBox) {
    recurringBox.addEventListener('toggle', () => {
      if (recurringBox.open && oneTimeBox) {
        oneTimeBox.open = false
      }
    })
  }

  if (toggleComposerButton) {
    toggleComposerButton.addEventListener('click', () => {
      const shouldShow = !flowComposer || flowComposer.hidden
      setComposerVisibility(shouldShow)
      if (!shouldShow) {
        collapseComposerBoxes()
      }
    })
  }

  if (openOneTimeBoxButton) {
    openOneTimeBoxButton.addEventListener('click', () => {
      openComposerBox('one-time')
    })
  }

  if (openRecurringBoxButton) {
    openRecurringBoxButton.addEventListener('click', () => {
      openComposerBox('recurring')
    })
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

        resetRangeIfEmpty()
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

        resetRangeIfEmpty()
        rerender()
      }
    )

    const startDate = startInput.value
    const endDate = endInput.value
    if (!startDate || !endDate || startDate > endDate) {
      chart.innerHTML = '<div class="empty">Select a valid date range.</div>'
      return
    }

    try {
      const effectiveFlows = buildEffectiveFlows(oneTimeFlows, recurringFlows, startDate, endDate)
      const series = calculateCumulativeSeries(effectiveFlows)
      renderChart(series, chart, {
        startDate,
        endDate
      })
    } catch (error) {
      chart.innerHTML = `<div class="empty">${error.message}</div>`
    }
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
      id: editingOneTimeId || createFlowId('one'),
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
    collapseComposerBoxes()
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
      id: editingRecurringId || createFlowId('recurring'),
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
    collapseComposerBoxes()
    rerender()
  })

  oneTimeCancelButton.addEventListener('click', () => {
    resetOneTimeForm()
    collapseComposerBoxes()
  })

  recurringCancelButton.addEventListener('click', () => {
    resetRecurringForm()
    collapseComposerBoxes()
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

        const importedRange = suggestRange([
          ...oneTimeFlows.map((entry) => ({ date: entry.date })),
          ...recurringFlows.map((entry) => ({ date: entry.startDate }))
        ])
        startInput.value = importedRange.startDate
        endInput.value = importedRange.endDate

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

export { initController }