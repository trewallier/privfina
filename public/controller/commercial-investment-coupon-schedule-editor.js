/**
 * Shared coupon-period table for coupon-bearing commercial hosts (ADR 0040).
 * UI: From | Rate % only. Derives schedule `to`, syncs firstCouponDate + annualCouponRatePct.
 * Fix-rate schedules propagate Rate edits to every row; stepped schedules edit independently.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const editorsByPrefix = new Map()

function isValidIsoDate(value) {
  return ISO_DATE_RE.test(String(value || '').trim())
}

function parseDefinedRate(raw) {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** True when ≤1 distinct defined rate (flat / single-row / empty → fix mode). */
function isFixedCouponSchedule(rows) {
  const rates = (Array.isArray(rows) ? rows : [])
    .map((row) => parseDefinedRate(row?.rate))
    .filter((rate) => rate != null)
  if (rates.length <= 1) return true
  const first = rates[0]
  return rates.every((rate) => rate === first)
}

function clampCouponRatePct(raw) {
  if (raw == null || raw === '') return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return ''
  const clamped = Math.min(100, Math.max(0, n))
  const rounded = Math.round(clamped * 100) / 100
  return String(rounded)
}

function addCalendarDaysIso(iso, deltaDays) {
  const text = String(iso || '').trim()
  if (!isValidIsoDate(text)) return null
  const [y, m, d] = text.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + deltaDays)
  const yy = utc.getUTCFullYear()
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(utc.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Sort by from; set each `to` to the day before the next `from`; last `to` = null.
 * @param {Array<{ from?: string, to?: string|null, rate?: number|null }>} rows
 */
function deriveCouponScheduleTos(rows) {
  const cleaned = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      from: String(row?.from || '').trim(),
      rate: parseDefinedRate(row?.rate)
    }))
    .filter((row) => isValidIsoDate(row.from) || row.rate != null)
    .map((row) => ({
      from: isValidIsoDate(row.from) ? row.from : '',
      rate: row.rate
    }))
    .filter((row) => row.from || row.rate != null)

  const withFrom = cleaned.filter((row) => isValidIsoDate(row.from))
  const withoutFrom = cleaned.filter((row) => !isValidIsoDate(row.from))
  withFrom.sort((a, b) => a.from.localeCompare(b.from))
  const ordered = [...withFrom, ...withoutFrom]

  return ordered.map((row, index) => {
    const next = ordered[index + 1]
    let to = null
    if (isValidIsoDate(row.from) && next && isValidIsoDate(next.from)) {
      to = addCalendarDaysIso(next.from, -1)
    }
    return {
      from: row.from || undefined,
      to,
      rate: row.rate
    }
  })
}

function resolveAnnualCouponRatePctFromRows(rows, purchaseIso) {
  const list = Array.isArray(rows) ? rows : []
  const day = String(purchaseIso || '').trim()
  if (isValidIsoDate(day)) {
    const covering = list.find((row) => {
      const from = String(row?.from || '').trim()
      if (!isValidIsoDate(from) || from > day) return false
      const to = row?.to
      if (to != null && to !== '' && String(to) < day) return false
      return parseDefinedRate(row?.rate) != null
    })
    if (covering) return parseDefinedRate(covering.rate)
    const prior = list
      .filter(
        (row) =>
          isValidIsoDate(String(row?.from || '')) &&
          String(row.from) <= day &&
          parseDefinedRate(row?.rate) != null
      )
      .sort((a, b) => String(b.from).localeCompare(String(a.from)))[0]
    if (prior) return parseDefinedRate(prior.rate)
  }
  for (const row of list) {
    const rate = parseDefinedRate(row?.rate)
    if (rate != null) return rate
  }
  return null
}

function normalizeUiRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  const mapped = list.map((row) => ({
    from: String(row?.from || '').trim(),
    rate: parseDefinedRate(row?.rate)
  }))
  if (mapped.length === 0) {
    return [{ from: '', rate: null }]
  }
  return mapped
}

function readHiddenSchedule(form, prefix) {
  const input = form?.querySelector(`#${prefix}-coupon-schedule`)
  const text = String(input?.value || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Keep engine sync inputs as non-validating hidden FormData carriers. */
function normalizeCouponEngineSyncFields(form, prefix) {
  if (!form || !prefix) return
  for (const id of [`${prefix}-annual-coupon-rate-pct`, `${prefix}-first-coupon-date`]) {
    const input = form.querySelector(`#${id}`)
    if (!input) continue
    input.type = 'hidden'
    input.required = false
    input.removeAttribute('min')
    input.removeAttribute('max')
    input.removeAttribute('step')
  }
}

function createEditor(prefix, rootEl, form) {
  let fixedMode = true
  let marketLocked = false
  let hostActive = true
  let rows = [{ from: '', rate: null }]
  let hintEl = null
  let bodyEl = null
  let syncing = false

  function getPurchaseDate() {
    return String(form?.querySelector(`#${prefix}-purchase-date`)?.value || '').trim()
  }

  function getIssueDate() {
    return String(form?.querySelector(`#${prefix}-issue-date`)?.value || '').trim()
  }

  function controlsInteractive() {
    return hostActive && !marketLocked
  }

  function syncHiddenFields() {
    if (!form || syncing) return
    syncing = true
    try {
      normalizeCouponEngineSyncFields(form, prefix)
      const derived = deriveCouponScheduleTos(rows)
      const scheduleInput = form.querySelector(`#${prefix}-coupon-schedule`)
      if (scheduleInput) {
        const persistable = derived.filter((row) => isValidIsoDate(row.from) || row.rate != null)
        scheduleInput.value =
          persistable.length > 0
            ? JSON.stringify(
                persistable.map((row) => ({
                  from: row.from,
                  to: row.to ?? null,
                  rate: row.rate
                }))
              )
            : ''
      }

      // firstCouponDate follows sorted schedule, not raw UI row order.
      const firstFrom =
        derived.map((row) => String(row.from || '').trim()).find((from) => isValidIsoDate(from)) ||
        ''
      const firstCouponInput = form.querySelector(`#${prefix}-first-coupon-date`)
      if (firstCouponInput) {
        firstCouponInput.value = firstFrom
      }

      const annual = resolveAnnualCouponRatePctFromRows(derived, getPurchaseDate())
      const annualInput = form.querySelector(`#${prefix}-annual-coupon-rate-pct`)
      if (annualInput) {
        annualInput.value = annual == null ? '' : String(annual)
      }
    } finally {
      syncing = false
    }
  }

  function updateHint() {
    if (!hintEl) return
    hintEl.textContent = fixedMode
      ? 'Fixed coupon: rate edits apply to all periods.'
      : 'Stepped coupon: each period has its own rate.'
  }

  function setRowRate(index, raw, { propagate = true } = {}) {
    const clamped = clampCouponRatePct(raw)
    const rate = clamped === '' ? null : Number(clamped)
    if (propagate && fixedMode) {
      rows = rows.map((row) => ({ ...row, rate }))
    } else if (rows[index]) {
      rows[index] = { ...rows[index], rate }
    }
  }

  function onRateInput(index, value) {
    if (!controlsInteractive()) return
    setRowRate(index, value, { propagate: fixedMode })
    render()
    syncHiddenFields()
    form?.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function onFromInput(index, value) {
    if (!controlsInteractive()) return
    if (!rows[index]) return
    rows[index] = { ...rows[index], from: String(value || '').trim() }
    syncHiddenFields()
    form?.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function addRow() {
    if (!controlsInteractive()) return
    const sharedRate = fixedMode
      ? rows.map((row) => row.rate).find((rate) => rate != null) ?? null
      : null
    rows = [...rows, { from: '', rate: sharedRate }]
    render()
    syncHiddenFields()
  }

  function removeRow(index) {
    if (!controlsInteractive()) return
    if (rows.length <= 1) {
      rows = [{ from: '', rate: null }]
    } else {
      rows = rows.filter((_, i) => i !== index)
    }
    fixedMode = isFixedCouponSchedule(rows)
    render()
    syncHiddenFields()
  }

  /** Single markup: header + period rows; CSS stacks on narrow viewports. */
  function render() {
    if (!bodyEl) return
    bodyEl.replaceChildren()

    const header = document.createElement('div')
    header.className = 'coupon-schedule-header'
    header.setAttribute('aria-hidden', 'true')
    header.innerHTML =
      '<span>From</span><span>Rate %</span><span class="coupon-schedule-actions-col"></span>'

    const list = document.createElement('div')
    list.className = 'coupon-schedule-rows'
    list.setAttribute('role', 'table')
    list.setAttribute('aria-label', 'Coupon periods')

    rows.forEach((row, index) => {
      const group = document.createElement('div')
      group.className = 'coupon-schedule-period'
      group.setAttribute('role', 'row')
      group.setAttribute(
        'aria-label',
        index === 0 ? 'Period 1 (first coupon)' : `Period ${index + 1}`
      )

      const fromLabel = document.createElement('label')
      fromLabel.className = 'coupon-schedule-from-wrap'
      const fromTitle = document.createElement('span')
      fromTitle.className = 'coupon-schedule-field-label'
      fromTitle.textContent = 'From'
      const fromInput = document.createElement('input')
      fromInput.type = 'date'
      fromInput.value = row.from || ''
      fromInput.className = 'coupon-schedule-from'
      fromInput.setAttribute(
        'aria-label',
        index === 0 ? 'First coupon date (period from)' : `Period ${index + 1} from`
      )
      fromInput.disabled = !controlsInteractive()
      fromInput.addEventListener('change', () => onFromInput(index, fromInput.value))
      fromLabel.append(fromTitle, fromInput)

      const rateLabel = document.createElement('label')
      rateLabel.className = 'coupon-schedule-rate-wrap'
      const rateTitle = document.createElement('span')
      rateTitle.className = 'coupon-schedule-field-label'
      rateTitle.textContent = 'Rate %'
      const rateInput = document.createElement('input')
      rateInput.type = 'number'
      rateInput.min = '0'
      rateInput.max = '100'
      // step=any avoids flaky native (value-min)%step checks; clamp still enforces 0.01.
      rateInput.step = 'any'
      rateInput.value = row.rate == null ? '' : String(row.rate)
      rateInput.className = 'coupon-schedule-rate'
      rateInput.setAttribute('aria-label', `Period ${index + 1} annual coupon rate percent`)
      rateInput.disabled = !controlsInteractive()
      // Only the active host's first rate participates in native constraint validation.
      rateInput.required = hostActive && index === 0
      rateInput.addEventListener('change', () => {
        const clamped = clampCouponRatePct(rateInput.value)
        rateInput.value = clamped
        onRateInput(index, clamped)
      })
      rateInput.addEventListener('blur', () => {
        const clamped = clampCouponRatePct(rateInput.value)
        if (rateInput.value !== clamped) {
          rateInput.value = clamped
          onRateInput(index, clamped)
        }
      })
      rateLabel.append(rateTitle, rateInput)

      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'coupon-schedule-remove'
      removeBtn.textContent = 'Remove'
      removeBtn.setAttribute('aria-label', `Remove period ${index + 1}`)
      removeBtn.disabled = !controlsInteractive()
      removeBtn.addEventListener('click', () => removeRow(index))

      group.append(fromLabel, rateLabel, removeBtn)
      list.appendChild(group)
    })

    bodyEl.append(header, list)
    updateHint()

    const addBtn = rootEl.querySelector('.coupon-schedule-add')
    if (addBtn) addBtn.disabled = !controlsInteractive()
  }

  function setSchedule(scheduleRows, { reevaluateMode = true } = {}) {
    rows = normalizeUiRows(scheduleRows)
    if (reevaluateMode) {
      fixedMode = isFixedCouponSchedule(rows)
    }
    if (rows.length === 1 && !rows[0].from && isValidIsoDate(getIssueDate())) {
      rows[0] = { ...rows[0], from: getIssueDate() }
    }
    render()
    syncHiddenFields()
  }

  function setMarketLocked(locked) {
    marketLocked = Boolean(locked)
    render()
  }

  function setHostActive(active) {
    hostActive = Boolean(active)
    render()
    if (!hostActive) {
      // Ensure inactive editors never block form checkValidity().
      rootEl.querySelectorAll('input').forEach((input) => {
        input.required = false
        input.disabled = true
      })
    }
  }

  function loadFromHidden() {
    normalizeCouponEngineSyncFields(form, prefix)
    const schedule = readHiddenSchedule(form, prefix)
    const annualInput = form?.querySelector(`#${prefix}-annual-coupon-rate-pct`)
    const firstCouponInput = form?.querySelector(`#${prefix}-first-coupon-date`)
    const annual = parseDefinedRate(annualInput?.value)
    const firstCoupon = String(firstCouponInput?.value || '').trim()

    if (schedule.length > 0) {
      setSchedule(schedule, { reevaluateMode: true })
    } else if (isValidIsoDate(firstCoupon) || annual != null) {
      setSchedule([{ from: firstCoupon, rate: annual }], { reevaluateMode: true })
    } else {
      setSchedule([], { reevaluateMode: true })
    }

    const annualSourced = annualInput?.dataset?.marketSourced === 'true'
    const scheduleSourced =
      form?.querySelector(`#${prefix}-coupon-schedule`)?.dataset?.marketSourced === 'true'
    setMarketLocked(annualSourced || scheduleSourced)
  }

  rootEl.replaceChildren()
  rootEl.classList.add('coupon-schedule-editor')
  rootEl.dataset.prefix = prefix

  const title = document.createElement('div')
  title.className = 'coupon-schedule-title label-title'
  title.textContent = 'Coupon periods'

  hintEl = document.createElement('p')
  hintEl.className = 'coupon-schedule-hint'
  hintEl.setAttribute('aria-live', 'polite')

  bodyEl = document.createElement('div')
  bodyEl.className = 'coupon-schedule-body'

  const addBtn = document.createElement('button')
  addBtn.type = 'button'
  addBtn.className = 'coupon-schedule-add'
  addBtn.textContent = 'Add period'
  addBtn.addEventListener('click', addRow)

  rootEl.append(title, hintEl, bodyEl, addBtn)

  const api = {
    prefix,
    setSchedule,
    loadFromHidden,
    setMarketLocked,
    setHostActive,
    syncHiddenFields,
    getRows: () => rows.map((row) => ({ ...row })),
    isFixedMode: () => fixedMode,
    isHostActive: () => hostActive
  }
  editorsByPrefix.set(prefix, api)
  loadFromHidden()
  return api
}

function mountCouponScheduleEditor(prefix, rootEl, form) {
  if (!rootEl || !form) return null
  const existing = editorsByPrefix.get(prefix)
  if (existing && rootEl.dataset.mounted === 'true') {
    return existing
  }
  rootEl.dataset.mounted = 'true'
  return createEditor(prefix, rootEl, form)
}

function refreshCouponScheduleEditor(prefix, form) {
  const root = form?.querySelector(`#${prefix}-coupon-schedule-editor`)
  if (!root) return null
  return mountCouponScheduleEditor(prefix, root, form)
}

function ensureAllCouponScheduleEditors(form) {
  if (!form) return
  form.querySelectorAll('[id$="-coupon-schedule-editor"]').forEach((root) => {
    const prefix = String(root.id || '').replace(/-coupon-schedule-editor$/, '')
    if (!prefix) return
    normalizeCouponEngineSyncFields(form, prefix)
    const editor = mountCouponScheduleEditor(prefix, root, form)
    editor?.syncHiddenFields?.()
  })
}

/**
 * Enable interactive validation only on the selected coupon-bearing family.
 * Inactive editors disable controls and clear `required` so they cannot block submit.
 */
function setActiveCouponScheduleEditor(form, activePrefix) {
  if (!form) return
  ensureAllCouponScheduleEditors(form)
  form.querySelectorAll('[id$="-coupon-schedule-editor"]').forEach((root) => {
    const prefix = String(root.id || '').replace(/-coupon-schedule-editor$/, '')
    const editor = editorsByPrefix.get(prefix)
    if (!editor) return
    editor.setHostActive(Boolean(activePrefix) && prefix === activePrefix)
  })
}

function syncCouponScheduleEditorAfterMarket(prefix, form) {
  normalizeCouponEngineSyncFields(form, prefix)
  const editor = refreshCouponScheduleEditor(prefix, form)
  if (!editor) return
  editor.loadFromHidden()
}

/** Recompute hidden annualCouponRatePct / firstCouponDate / schedule without reloading rows. */
function resyncCouponScheduleEngineFields(prefix, form) {
  normalizeCouponEngineSyncFields(form, prefix)
  const editor = editorsByPrefix.get(prefix) || refreshCouponScheduleEditor(prefix, form)
  editor?.syncHiddenFields?.()
}

/** Test-only: drop mounted editor instances between cases. */
function resetCouponScheduleEditorsForTests() {
  editorsByPrefix.clear()
}

export {
  isFixedCouponSchedule,
  clampCouponRatePct,
  deriveCouponScheduleTos,
  resolveAnnualCouponRatePctFromRows,
  normalizeCouponEngineSyncFields,
  mountCouponScheduleEditor,
  refreshCouponScheduleEditor,
  ensureAllCouponScheduleEditors,
  setActiveCouponScheduleEditor,
  syncCouponScheduleEditorAfterMarket,
  resyncCouponScheduleEngineFields,
  resetCouponScheduleEditorsForTests
}
