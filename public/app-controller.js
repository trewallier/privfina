import {
  ONE_TIME_STORAGE_KEY,
  RECURRING_STORAGE_KEY,
  INSTRUMENT_BUNDLES_STORAGE_KEY,
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
  normalizeInstrumentBundles,
  generateSalaryInstrumentBundle,
  generateSubscriptionInstrumentBundle
} from './instruments.js'
import {
  normalizeRecurringDefinitions,
  parseIsoDate,
  parseRecurringSchedule
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
  const salaryForm = document.getElementById('salary-form')
  const subscriptionForm = document.getElementById('subscription-form')
  const oneTimeSubmitButton = document.getElementById('one-time-submit')
  const recurringSubmitButton = document.getElementById('recurring-submit')
  const salarySubmitButton = document.getElementById('salary-submit')
  const subscriptionSubmitButton = document.getElementById('subscription-submit')
  const oneTimeCancelButton = document.getElementById('one-time-cancel-edit')
  const recurringCancelButton = document.getElementById('recurring-cancel-edit')
  const salaryCancelButton = document.getElementById('salary-cancel-edit')
  const subscriptionCancelButton = document.getElementById('subscription-cancel-edit')
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
  const openSalaryBoxButton = document.getElementById('open-salary-box')
  const openSubscriptionBoxButton = document.getElementById('open-subscription-box')
  const oneTimeBox = document.getElementById('one-time-box')
  const recurringBox = document.getElementById('recurring-box')
  const salaryBox = document.getElementById('salary-box')
  const subscriptionBox = document.getElementById('subscription-box')
  const salaryScheduleModeInput = document.getElementById('salary-schedule-mode')
  const salaryCronWrap = document.getElementById('salary-cron-wrap')
  const salaryCustomWrap = document.getElementById('salary-custom-wrap')

  if (
    !oneTimeForm ||
    !recurringForm ||
    !salaryForm ||
    !subscriptionForm ||
    !oneTimeSubmitButton ||
    !recurringSubmitButton ||
    !salarySubmitButton ||
    !subscriptionSubmitButton ||
    !oneTimeCancelButton ||
    !recurringCancelButton ||
    !salaryCancelButton ||
    !subscriptionCancelButton ||
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
  const rawInstrumentBundles = loadList(INSTRUMENT_BUNDLES_STORAGE_KEY)
  let instrumentBundles = ensureFlowIds(normalizeInstrumentBundles(rawInstrumentBundles), 'instrument')
  let editingOneTimeId = null
  let editingRecurringId = null
  let editingSalaryId = null
  let editingSubscriptionId = null
  const excludedFlowIds = new Set()

  function isFlowIncluded(id) {
    return !excludedFlowIds.has(id)
  }

  function setFlowIncluded(id, included) {
    if (included) {
      excludedFlowIds.delete(id)
      return
    }

    excludedFlowIds.add(id)
  }

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

    if (salaryBox) {
      salaryBox.open = false
    }

    if (subscriptionBox) {
      subscriptionBox.open = false
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

    if (type === 'recurring') {
      if (oneTimeBox) {
        oneTimeBox.open = false
      }
      if (salaryBox) {
        salaryBox.open = false
      }
      if (subscriptionBox) {
        subscriptionBox.open = false
      }
      if (recurringBox) {
        recurringBox.open = true
      }
      return
    }

    if (type === 'salary') {
      if (oneTimeBox) {
        oneTimeBox.open = false
      }
      if (recurringBox) {
        recurringBox.open = false
      }
      if (subscriptionBox) {
        subscriptionBox.open = false
      }
      if (salaryBox) {
        salaryBox.open = true
      }
      return
    }

    if (type === 'subscription') {
      if (oneTimeBox) {
        oneTimeBox.open = false
      }
      if (recurringBox) {
        recurringBox.open = false
      }
      if (salaryBox) {
        salaryBox.open = false
      }
      if (subscriptionBox) {
        subscriptionBox.open = true
      }
      return
    }

    if (oneTimeBox) {
      oneTimeBox.open = false
    }
    if (recurringBox) {
      recurringBox.open = false
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

  function applySalaryModeVisibility(mode) {
    const isCron = mode === 'cron-like'
    if (salaryCronWrap) {
      salaryCronWrap.hidden = !isCron
    }
    if (salaryCustomWrap) {
      salaryCustomWrap.hidden = isCron
    }
  }

  function resetSalaryForm() {
    editingSalaryId = null
    salaryForm.reset()
    if (salaryScheduleModeInput) {
      salaryScheduleModeInput.value = 'custom-monthly-working-day'
      applySalaryModeVisibility('custom-monthly-working-day')
    }
    salarySubmitButton.textContent = 'Add Salary Instrument'
    salaryCancelButton.hidden = true
  }

  function resetSubscriptionForm() {
    editingSubscriptionId = null
    subscriptionForm.reset()
    subscriptionSubmitButton.textContent = 'Add Subscription Instrument'
    subscriptionCancelButton.hidden = true
  }

  function resetRangeIfEmpty() {
    if (oneTimeFlows.length || recurringFlows.length || instrumentBundles.length) {
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

  function startSalaryEdit(id) {
    const bundle = instrumentBundles.find(
      (entry) => entry.id === id && entry.instrumentType === 'salary'
    )
    if (!bundle) {
      return
    }

    const config = bundle.config || {}
    editingSalaryId = id
    salaryForm.querySelector('#salary-label').value = bundle.label || 'Salary'
    salaryForm.querySelector('#salary-start-date').value = config.startDate || ''
    salaryForm.querySelector('#salary-end-date').value = config.endDate || ''
    salaryForm.querySelector('#salary-occurrences').value =
      config.occurrences !== undefined ? String(config.occurrences) : ''
    salaryForm.querySelector('#salary-amount').value =
      config.amount !== undefined ? String(config.amount) : ''
    salaryForm.querySelector('#salary-category').value = config.category || 'salary'
    salaryForm.querySelector('#salary-description').value = config.description || ''
    salaryForm.querySelector('#salary-schedule-mode').value =
      config.scheduleMode || 'custom-monthly-working-day'
    salaryForm.querySelector('#salary-cron-period').value = config.cronPeriod || ''
    salaryForm.querySelector('#salary-target-day').value =
      config.targetDayOfMonth !== undefined ? String(config.targetDayOfMonth) : '10'
    salaryForm.querySelector('#salary-business-day-convention').value =
      config.businessDayConvention || 'preceding'
    salaryForm.querySelector('#salary-holidays').value = Array.isArray(config.holidays)
      ? config.holidays.join(', ')
      : ''

    applySalaryModeVisibility(config.scheduleMode || 'custom-monthly-working-day')
    salarySubmitButton.textContent = 'Save Salary Instrument'
    salaryCancelButton.hidden = false
    openComposerBox('salary')
  }

  function startSubscriptionEdit(id) {
    const bundle = instrumentBundles.find(
      (entry) => entry.id === id && entry.instrumentType === 'subscription'
    )
    if (!bundle) {
      return
    }

    const config = bundle.config || {}
    editingSubscriptionId = id
    subscriptionForm.querySelector('#subscription-label').value = bundle.label || 'Subscription'
    subscriptionForm.querySelector('#subscription-period').value = config.period || ''
    subscriptionForm.querySelector('#subscription-start-date').value = config.startDate || ''
    subscriptionForm.querySelector('#subscription-end-date').value = config.endDate || ''
    subscriptionForm.querySelector('#subscription-occurrences').value =
      config.occurrences !== undefined ? String(config.occurrences) : ''
    subscriptionForm.querySelector('#subscription-amount').value =
      config.amount !== undefined ? String(config.amount) : ''
    subscriptionForm.querySelector('#subscription-category').value = config.category || 'subscription'
    subscriptionForm.querySelector('#subscription-description').value = config.description || ''

    subscriptionSubmitButton.textContent = 'Save Subscription Instrument'
    subscriptionCancelButton.hidden = false
    openComposerBox('subscription')
  }

  if (JSON.stringify(oneTimeFlows) !== JSON.stringify(loadList(ONE_TIME_STORAGE_KEY))) {
    saveList(ONE_TIME_STORAGE_KEY, oneTimeFlows)
  }

  if (JSON.stringify(recurringFlows) !== JSON.stringify(rawRecurringFlows)) {
    saveList(RECURRING_STORAGE_KEY, recurringFlows)
  }

  if (JSON.stringify(instrumentBundles) !== JSON.stringify(rawInstrumentBundles)) {
    saveList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)
  }

  if (oneTimeBox) {
    oneTimeBox.addEventListener('toggle', () => {
      if (oneTimeBox.open) {
        if (recurringBox) {
          recurringBox.open = false
        }
        if (salaryBox) {
          salaryBox.open = false
        }
        if (subscriptionBox) {
          subscriptionBox.open = false
        }
      }
    })
  }

  if (recurringBox) {
    recurringBox.addEventListener('toggle', () => {
      if (recurringBox.open) {
        if (oneTimeBox) {
          oneTimeBox.open = false
        }
        if (salaryBox) {
          salaryBox.open = false
        }
        if (subscriptionBox) {
          subscriptionBox.open = false
        }
      }
    })
  }

  if (salaryBox) {
    salaryBox.addEventListener('toggle', () => {
      if (salaryBox.open) {
        if (oneTimeBox) {
          oneTimeBox.open = false
        }
        if (recurringBox) {
          recurringBox.open = false
        }
        if (subscriptionBox) {
          subscriptionBox.open = false
        }
      }
    })
  }

  if (subscriptionBox) {
    subscriptionBox.addEventListener('toggle', () => {
      if (subscriptionBox.open) {
        if (oneTimeBox) {
          oneTimeBox.open = false
        }
        if (recurringBox) {
          recurringBox.open = false
        }
        if (salaryBox) {
          salaryBox.open = false
        }
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

  if (openSalaryBoxButton) {
    openSalaryBoxButton.addEventListener('click', () => {
      openComposerBox('salary')
    })
  }

  if (openSubscriptionBoxButton) {
    openSubscriptionBoxButton.addEventListener('click', () => {
      openComposerBox('subscription')
    })
  }

  if (salaryScheduleModeInput) {
    salaryScheduleModeInput.addEventListener('change', () => {
      applySalaryModeVisibility(salaryScheduleModeInput.value)
    })
  }

  applySalaryModeVisibility(
    salaryScheduleModeInput ? salaryScheduleModeInput.value : 'custom-monthly-working-day'
  )

  const defaultRange = suggestRange([
    ...oneTimeFlows.map((entry) => ({ date: entry.date })),
    ...recurringFlows.map((entry) => ({ date: entry.startDate })),
    ...instrumentBundles.flatMap((bundle) =>
      (bundle.generatedFlows || []).map((flow) => ({
        date: flow.date
      }))
    )
  ])
  startInput.value = defaultRange.startDate
  endInput.value = defaultRange.endDate

  function rerender() {
    const sortedOneTime = [...oneTimeFlows].sort((a, b) => a.date.localeCompare(b.date))
    const sortedRecurring = [...recurringFlows].sort((a, b) => a.startDate.localeCompare(b.startDate))

    renderConfiguredTable(
      sortedOneTime,
      sortedRecurring,
      instrumentBundles,
      rows,
      isFlowIncluded,
      (id, included) => {
        setFlowIncluded(id, included)
        rerender()
      },
      (id) => {
        startOneTimeEdit(id)
      },
      (id) => {
        oneTimeFlows = removeFlowById(oneTimeFlows, id)
        excludedFlowIds.delete(id)
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
        excludedFlowIds.delete(id)
        saveList(RECURRING_STORAGE_KEY, recurringFlows)

        if (editingRecurringId === id) {
          resetRecurringForm()
        }

        resetRangeIfEmpty()
        rerender()
      },
      (id) => {
        const target = instrumentBundles.find((bundle) => bundle.id === id)
        if (!target) {
          return
        }

        if (target.instrumentType === 'salary') {
          startSalaryEdit(id)
        } else {
          startSubscriptionEdit(id)
        }
      },
      (id) => {
        instrumentBundles = removeFlowById(instrumentBundles, id)
        excludedFlowIds.delete(id)
        saveList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)

        if (editingSalaryId === id) {
          resetSalaryForm()
        }

        if (editingSubscriptionId === id) {
          resetSubscriptionForm()
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
      const includedOneTime = oneTimeFlows.filter((flow) => isFlowIncluded(flow.id))
      const includedRecurring = recurringFlows.filter((flow) => isFlowIncluded(flow.id))
      const includedBundles = instrumentBundles.filter((bundle) => isFlowIncluded(bundle.id))
      const effectiveFlows = buildEffectiveFlows(
        includedOneTime,
        includedRecurring,
        startDate,
        endDate,
        includedBundles
      )
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
      parseRecurringSchedule(period)
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

  salaryForm.addEventListener('submit', (event) => {
    event.preventDefault()

    try {
      const formData = new FormData(salaryForm)
      const bundle = generateSalaryInstrumentBundle({
        id: editingSalaryId || undefined,
        label: String(formData.get('label') || '').trim() || 'Salary',
        startDate: String(formData.get('startDate') || '').trim(),
        endDate: String(formData.get('endDate') || '').trim() || undefined,
        occurrences: String(formData.get('occurrences') || '').trim(),
        amount: Number(formData.get('amount')),
        category: String(formData.get('category') || '').trim() || 'salary',
        description: String(formData.get('description') || '').trim() || undefined,
        scheduleMode: String(formData.get('scheduleMode') || 'custom-monthly-working-day'),
        cronPeriod: String(formData.get('cronPeriod') || '').trim(),
        targetDayOfMonth: Number(formData.get('targetDayOfMonth') || 10),
        businessDayConvention: String(formData.get('businessDayConvention') || 'preceding'),
        holidaysRaw: String(formData.get('holidays') || '').trim(),
        createdAt: editingSalaryId
          ? instrumentBundles.find((entry) => entry.id === editingSalaryId)?.createdAt
          : undefined
      })

      if (!bundle || !bundle.generatedFlows.length) {
        return
      }

      instrumentBundles = upsertFlowById(instrumentBundles, bundle)
      saveList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)

      const firstDate = bundle.generatedFlows[0].date
      const lastDate = bundle.generatedFlows[bundle.generatedFlows.length - 1].date
      const updatedRange = extendRange(startInput.value, endInput.value, firstDate, lastDate)
      startInput.value = updatedRange.startDate
      endInput.value = updatedRange.endDate

      resetSalaryForm()
      collapseComposerBoxes()
      rerender()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save salary instrument.'
      setStorageStatus(message, 'error')
    }
  })

  subscriptionForm.addEventListener('submit', (event) => {
    event.preventDefault()

    try {
      const formData = new FormData(subscriptionForm)
      const bundle = generateSubscriptionInstrumentBundle({
        id: editingSubscriptionId || undefined,
        label: String(formData.get('label') || '').trim() || 'Subscription',
        period: String(formData.get('period') || '').trim(),
        startDate: String(formData.get('startDate') || '').trim(),
        endDate: String(formData.get('endDate') || '').trim() || undefined,
        occurrences: String(formData.get('occurrences') || '').trim(),
        amount: Number(formData.get('amount')),
        category: String(formData.get('category') || '').trim() || 'subscription',
        description: String(formData.get('description') || '').trim() || undefined,
        createdAt: editingSubscriptionId
          ? instrumentBundles.find((entry) => entry.id === editingSubscriptionId)?.createdAt
          : undefined
      })

      if (!bundle || !bundle.generatedFlows.length) {
        return
      }

      instrumentBundles = upsertFlowById(instrumentBundles, bundle)
      saveList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)

      const firstDate = bundle.generatedFlows[0].date
      const lastDate = bundle.generatedFlows[bundle.generatedFlows.length - 1].date
      const updatedRange = extendRange(startInput.value, endInput.value, firstDate, lastDate)
      startInput.value = updatedRange.startDate
      endInput.value = updatedRange.endDate

      resetSubscriptionForm()
      collapseComposerBoxes()
      rerender()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save subscription instrument.'
      setStorageStatus(message, 'error')
    }
  })

  oneTimeCancelButton.addEventListener('click', () => {
    resetOneTimeForm()
    collapseComposerBoxes()
  })

  recurringCancelButton.addEventListener('click', () => {
    resetRecurringForm()
    collapseComposerBoxes()
  })

  salaryCancelButton.addEventListener('click', () => {
    resetSalaryForm()
    collapseComposerBoxes()
  })

  subscriptionCancelButton.addEventListener('click', () => {
    resetSubscriptionForm()
    collapseComposerBoxes()
  })

  startInput.addEventListener('change', rerender)
  endInput.addEventListener('change', rerender)

  if (exportButton) {
    exportButton.addEventListener('click', () => {
      const exportDoc = buildExportDocument(oneTimeFlows, recurringFlows, instrumentBundles)
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
        instrumentBundles = imported.instrumentBundles
        excludedFlowIds.clear()
        saveList(ONE_TIME_STORAGE_KEY, oneTimeFlows)
        saveList(RECURRING_STORAGE_KEY, recurringFlows)
        saveList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)
        localStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, String(imported.schemaVersion))

        const importedRange = suggestRange([
          ...oneTimeFlows.map((entry) => ({ date: entry.date })),
          ...recurringFlows.map((entry) => ({ date: entry.startDate })),
          ...instrumentBundles.flatMap((bundle) =>
            (bundle.generatedFlows || []).map((flow) => ({
              date: flow.date
            }))
          )
        ])
        startInput.value = importedRange.startDate
        endInput.value = importedRange.endDate

        const extra = imported.warnings.length > 0 ? ` ${imported.warnings.join(' ')}` : ''
        setStorageStatus(
          `Imported ${oneTimeFlows.length} one-time, ${recurringFlows.length} recurring, and ${instrumentBundles.length} instrument bundles (schema v${imported.schemaVersion}).${extra}`,
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