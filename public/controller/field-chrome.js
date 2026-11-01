/**
 * Shared field presentation chrome: label, info bubble, required/optional/calculated roles.
 */

/** Canonical info-chip edge length in px; keep in sync with `--info-chip-size` in `public/index.html`. */
const INFO_CHIP_SIZE_PX = 18

function escapeCssIdent(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

function ensureLabelTitle(label) {
  let title = label.querySelector('.label-title')
  if (!title) {
    title = document.createElement('span')
    title.className = 'label-title'
    label.insertBefore(title, label.firstChild)
  }
  return title
}

const FIELD_LABEL_CLASS_SELECTOR =
  '.field-label, .loan-field-label, .commercial-loan-field-label, .home-savings-field-label, .dkj-field-label, .pmap-field-label, .bmap-field-label'

function ensureFieldLabelSpan(title, className = 'field-label') {
  let span = title.querySelector(`.${className}`)
  if (!span) {
    // Reuse a pre-existing label span that used a different class (avoids
    // duplicated visible titles when HTML ships `.field-label` and chrome asks
    // for `.home-savings-field-label`, etc.).
    span = title.querySelector(FIELD_LABEL_CLASS_SELECTOR)
    if (span) {
      span.className = className
    } else {
      span = document.createElement('span')
      span.className = className
      title.insertBefore(span, title.firstChild)
    }
  }

  title.querySelectorAll(FIELD_LABEL_CLASS_SELECTOR).forEach((node) => {
    if (node !== span) {
      node.remove()
    }
  })
  return span
}

function ensureRoleMarker(title) {
  let marker = title.querySelector('.field-role-marker')
  if (!marker) {
    marker = document.createElement('span')
    marker.className = 'field-role-marker'
  }
  // Keep title chrome order: label text → role marker → info chip.
  const chip = title.querySelector('.info-chip, [data-help-button]')
  if (chip) {
    title.insertBefore(marker, chip)
  } else if (marker.parentNode !== title) {
    title.appendChild(marker)
  }
  return marker
}

function ensureInfoChip(title, helpId, ariaLabel) {
  let chip = title.querySelector(`[data-help-button="${helpId}"]`)
  if (!chip) {
    chip = title.querySelector('.info-chip')
  }
  if (!chip) {
    chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'info-chip'
  }
  chip.classList.add('info-chip')
  chip.type = 'button'
  chip.setAttribute('data-help-button', helpId)
  chip.setAttribute('aria-label', ariaLabel || 'Field help')
  chip.textContent = 'i'
  // Info chip stays last in the title row so size/order stay consistent.
  title.appendChild(chip)
  return chip
}

function ensureHelpBlock(label, helpId, description) {
  let help = label.querySelector(`#${escapeCssIdent(helpId)}`)
  if (!help) {
    help = document.createElement('div')
    help.id = helpId
    help.className = 'field-help'
    help.hidden = true
    label.appendChild(help)
  }

  let close = help.querySelector('[data-help-close]')
  if (!close) {
    close = document.createElement('button')
    close.type = 'button'
    close.className = 'field-help-close'
    close.setAttribute('data-help-close', helpId)
    close.setAttribute('aria-label', 'Close')
    close.textContent = 'x'
    help.appendChild(close)
  } else {
    close.setAttribute('data-help-close', helpId)
  }

  let paragraph = help.querySelector('p')
  if (!paragraph) {
    paragraph = document.createElement('p')
    help.appendChild(paragraph)
  }
  if (description) {
    paragraph.textContent = description
  }
  return help
}

/**
 * Apply presentation metadata to a field label wrapping an input/select.
 * @param {HTMLLabelElement} label
 * @param {{ label: string, description?: string, required?: boolean, role?: 'input'|'derived'|'output', helpId?: string, labelClassName?: string }} meta
 * @param {HTMLInputElement|HTMLSelectElement|null} [input]
 */
function applyFieldChrome(label, meta, input = null) {
  if (!label || !meta) {
    return
  }

  const role = meta.role || 'input'
  const helpId =
    meta.helpId ||
    (input && input.id ? `${input.id}-help` : `field-help-${Math.random().toString(36).slice(2, 8)}`)

  const title = ensureLabelTitle(label)
  const labelSpan = ensureFieldLabelSpan(title, meta.labelClassName || 'field-label')
  labelSpan.textContent = meta.label

  // Remove leftover raw text nodes that duplicate the label (legacy HTML).
  Array.from(title.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      node.textContent = ' '
    }
  })

  const marker = ensureRoleMarker(title)
  const isAuto = Boolean(meta.auto) || meta.marker === 'auto'
  const isUnavailable = Boolean(meta.unavailable) || meta.marker === 'unavailable'
  if (role === 'output' || role === 'derived') {
    marker.textContent = 'calculated'
    marker.dataset.role = role
    marker.hidden = false
  } else if (isAuto) {
    marker.textContent = 'auto'
    marker.dataset.role = 'auto'
    marker.hidden = false
  } else if (isUnavailable) {
    marker.textContent = 'unavailable'
    marker.dataset.role = 'unavailable'
    marker.hidden = false
  } else if (meta.required) {
    marker.textContent = 'required'
    marker.dataset.role = 'required'
    marker.hidden = false
  } else {
    marker.textContent = 'optional'
    marker.dataset.role = 'optional'
    marker.hidden = false
  }

  ensureInfoChip(title, helpId, `${meta.label} help`)
  ensureHelpBlock(label, helpId, meta.description || '')

  label.classList.toggle('field-role-output', role === 'output' || role === 'derived')
  label.classList.toggle(
    'field-role-required',
    Boolean(meta.required) && role === 'input' && !isAuto && !isUnavailable
  )
  label.classList.toggle(
    'field-role-optional',
    !meta.required && role === 'input' && !isAuto && !isUnavailable
  )
  label.classList.toggle('field-role-auto', isAuto && role === 'input')
  label.classList.toggle('field-role-unavailable', isUnavailable && role === 'input')

  const control = input || label.querySelector('input, select, textarea')
  if (control) {
    if (role === 'output' || role === 'derived') {
      setControlMarketReadonly(control, true)
      control.required = false
    } else if (isAuto) {
      control.required = false
      setControlMarketReadonly(control, true)
    } else if (isUnavailable) {
      control.required = false
      setControlMarketReadonly(control, false)
    } else {
      setControlMarketReadonly(control, false)
      if (typeof meta.required === 'boolean') {
        control.required = meta.required
      }
    }
  }
}

/**
 * Mark autofilled controls read-only without disabling <select>.
 * Selects stay enabled so FormData still includes them; interaction is blocked via
 * `.control-market-readonly` (pointer-events) + aria-readonly instead of `disabled`.
 * @param {HTMLElement} control
 * @param {boolean} readonly
 */
function setControlMarketReadonly(control, readonly) {
  if (!control) {
    return
  }
  if (control.tagName === 'SELECT') {
    if (readonly) {
      if (control.dataset.savedTabIndex === undefined) {
        control.dataset.savedTabIndex = control.hasAttribute('tabindex')
          ? String(control.tabIndex)
          : ''
      }
      control.tabIndex = -1
      control.classList.add('control-market-readonly')
      control.setAttribute('aria-readonly', 'true')
      control.dataset.marketReadonly = 'true'
    } else {
      control.classList.remove('control-market-readonly')
      control.removeAttribute('aria-readonly')
      delete control.dataset.marketReadonly
      if (control.dataset.savedTabIndex !== undefined) {
        if (control.dataset.savedTabIndex === '') {
          control.removeAttribute('tabindex')
        } else {
          control.tabIndex = Number(control.dataset.savedTabIndex)
        }
        delete control.dataset.savedTabIndex
      }
    }
    return
  }
  control.readOnly = Boolean(readonly)
}

/**
 * Prefer updating an existing .label-title / .field-label instead of prepending a second title.
 * Drop-in replacement for ensureFieldLabelTitleElement that avoids duplicate labels.
 */
function ensureFieldLabelTitleElement(label, className) {
  const title = ensureLabelTitle(label)
  return ensureFieldLabelSpan(title, className || 'field-label')
}

function setFormStatus(element, message, level = 'info') {
  if (!element) {
    return
  }
  element.textContent = message || ''
  element.dataset.level = level || 'info'
  element.hidden = !message
}

function clearFieldValidity(form) {
  if (!form) {
    return
  }
  form.querySelectorAll('input, select, textarea').forEach((control) => {
    if (typeof control.setCustomValidity === 'function') {
      control.setCustomValidity('')
    }
    control.removeAttribute('aria-invalid')
  })
}

/**
 * Map known investment domain errors onto likely controls.
 * @returns {HTMLElement|null} the control that was marked, if any
 */
function applyInvestmentFieldValidity(form, message) {
  if (!form || !message) {
    return null
  }

  clearFieldValidity(form)
  const text = String(message)
  /** @type {Array<[RegExp, string]>} */
  const rules = [
    [/settlementDate|transaction date/i, 'investment-transaction-date'],
    [/issue date/i, 'investment-issue-date'],
    [/due date|maturity/i, 'investment-due-date'],
    [/purchase price|purchasePrice/i, 'investment-purchase-price'],
    [/face value|principal/i, 'investment-principal'],
    [/spread|interestPremium/i, 'investment-spread-rate'],
    [/inflation|yearlyInflation|previousYearAverageInflation/i, 'investment-yearly-inflation'],
    [/annual rate|annualRate/i, 'investment-annual-rate'],
    [/coupon|firstCoupon/i, 'investment-coupon-period'],
    [/termMonths|term bucket/i, 'dkj-term-months'],
    [/remainingDays/i, 'dkj-remaining-days'],
    [/purchaseDate must be on or after startDate/i, 'bmap-purchase-date'],
    [/startDate/i, 'bmap-start-date']
  ]

  for (const [pattern, id] of rules) {
    if (!pattern.test(text)) {
      continue
    }
    const control = form.querySelector(`#${escapeCssIdent(id)}`)
    if (!control) {
      continue
    }
    if (typeof control.setCustomValidity === 'function') {
      control.setCustomValidity(text)
    }
    control.setAttribute('aria-invalid', 'true')
    return control
  }

  return null
}

export {
  INFO_CHIP_SIZE_PX,
  applyFieldChrome,
  ensureFieldLabelTitleElement,
  ensureLabelTitle,
  setFormStatus,
  clearFieldValidity,
  applyInvestmentFieldValidity
}
