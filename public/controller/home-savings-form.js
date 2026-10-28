import {
  assertComposerStartDateInSaleWindow,
  defaultStartDateForSaleWindow,
  findHomeSavingsProduct,
  formatHomeSavingsAvailabilityHint,
  formatOpeningFeeModeHelp,
  openingFeeModeLabel
} from './home-savings-product-metadata.js'
import { parseMoneyAmount } from './money-format.js'

function assertOpeningFeeModeForDeposit(product, openingFeeMode, monthlyDeposit) {
  const bands = product.openingFeeModeDepositBands || {}
  const band = bands[openingFeeMode]
  if (!band) {
    return
  }
  if (monthlyDeposit < band.min || monthlyDeposit > band.max) {
    throw new Error(
      `${openingFeeModeLabel(openingFeeMode)} requires monthly deposit between ${band.min} and ${band.max} Ft.`
    )
  }
}

function mapFormDataToHomeSavingsSpecInputs(formData, product) {
  const monthlyDeposit = parseMoneyAmount(formData.get('monthlyDeposit'))
  const termMonths = Number(formData.get('termMonths'))
  const startDate = String(formData.get('startDate') || '').trim()
  const housingPurpose = formData.get('housingPurpose') === 'on'
  const openingFeeMode = String(formData.get('openingFeeMode') || '').trim()
  const contractAmountRaw = String(formData.get('contractAmount') || '').trim()
  const minDeposit = Number(product.minMonthlyDeposit ?? 10_000)
  const maxDeposit = Number(product.maxMonthlyDeposit ?? 100_000)
  const schemeTerm = Number(product.defaultTermMonths)

  if (!Number.isFinite(monthlyDeposit) || monthlyDeposit < minDeposit || monthlyDeposit > maxDeposit) {
    throw new Error(`Monthly deposit must be between ${minDeposit} and ${maxDeposit} Ft.`)
  }
  // Composer locks term to the módozat default (early sell out of scope).
  if (!Number.isInteger(termMonths) || termMonths !== schemeTerm) {
    throw new Error(
      `Savings term must be ${schemeTerm} months for this módozat (early sell is out of scope).`
    )
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('Savings start date is required (YYYY-MM-DD).')
  }
  assertComposerStartDateInSaleWindow(startDate, product.saleWindow)
  if (!(product.openingFeeModes || []).includes(openingFeeMode)) {
    throw new Error('Select a valid opening fee mode.')
  }
  assertOpeningFeeModeForDeposit(product, openingFeeMode, monthlyDeposit)

  const specInputs = {
    productCode: product.productCode,
    productId: product.productId,
    productSpecVersion: product.specVersion,
    monthlyDeposit,
    termMonths,
    startDate,
    housingPurpose,
    openingFeeMode
  }

  if (contractAmountRaw) {
    const contractAmount = parseMoneyAmount(contractAmountRaw)
    if (!Number.isFinite(contractAmount) || contractAmount <= 0) {
      throw new Error('Contract amount must be a positive amount when provided.')
    }
    specInputs.contractAmount = contractAmount
  }

  return specInputs
}

function populateHomeSavingsOpeningFeeModes(selectElement, product) {
  if (!selectElement || !product) {
    return
  }

  const previous = selectElement.value
  selectElement.innerHTML = ''
  ;(product.openingFeeModes || []).forEach((mode) => {
    const option = document.createElement('option')
    option.value = mode
    option.textContent = openingFeeModeLabel(mode)
    selectElement.appendChild(option)
  })

  if (previous && (product.openingFeeModes || []).includes(previous)) {
    selectElement.value = previous
  } else {
    selectElement.value = product.defaultOpeningFeeMode
  }
}

function applyHomeSavingsSaleWindowToDateInput(dateInput, product, force = false) {
  if (!dateInput || !product) {
    return
  }

  const window = product.saleWindow
  if (window?.from) {
    dateInput.min = window.from
  } else {
    dateInput.removeAttribute('min')
  }
  if (window?.to) {
    dateInput.max = window.to
  } else {
    dateInput.removeAttribute('max')
  }

  if (force || !dateInput.value) {
    dateInput.value = defaultStartDateForSaleWindow(window)
  } else if (window) {
    try {
      assertComposerStartDateInSaleWindow(dateInput.value, window)
    } catch {
      dateInput.value = defaultStartDateForSaleWindow(window)
    }
  }
}

/**
 * Single availability line under the product picker (no readiness / eligibility /
 * loyalty / purpose dump). Withdrawn → "Unavailable since {to}"; else hidden.
 */
function renderHomeSavingsHints({ product, availabilityElement }) {
  if (!availabilityElement) {
    return
  }
  const text = formatHomeSavingsAvailabilityHint(product?.saleWindow)
  availabilityElement.textContent = text
  availabilityElement.hidden = !text
}

function applyHomeSavingsProductDefaults({ form, product, force = false }) {
  if (!form || !product) {
    return
  }

  const depositInput = form.querySelector('#home-savings-monthly-deposit')
  const termInput = form.querySelector('#home-savings-term-months')
  const housingInput = form.querySelector('#home-savings-housing-purpose')
  const openingFeeSelect = form.querySelector('#home-savings-opening-fee-mode')
  const startDateInput = form.querySelector('#home-savings-start-date')
  const openingFeeHelp = form.querySelector('#home-savings-opening-fee-mode-help p')
  const termHelp = form.querySelector('#home-savings-term-months-help p')

  if (depositInput && (force || !depositInput.value)) {
    depositInput.value = String(product.defaultMonthlyDeposit)
  }
  if (depositInput) {
    depositInput.min = String(product.minMonthlyDeposit ?? 10_000)
    depositInput.max = String(product.maxMonthlyDeposit ?? 100_000)
  }
  // Term is fixed to the módozat scheme default (early sell out of scope).
  if (termInput) {
    termInput.value = String(product.defaultTermMonths)
    termInput.readOnly = true
    termInput.min = String(product.defaultTermMonths)
    termInput.max = String(product.defaultTermMonths)
  }
  if (termHelp) {
    termHelp.textContent = `Fixed at ${product.defaultTermMonths} months for this módozat. Early sell / shorter terms are out of scope for now.`
  }
  if (housingInput && (force || !form.dataset.housingTouched)) {
    housingInput.checked = Boolean(product.defaultHousingPurpose)
  }
  if (force) {
    delete form.dataset.housingTouched
  }

  populateHomeSavingsOpeningFeeModes(openingFeeSelect, product)
  if (force && openingFeeSelect) {
    openingFeeSelect.value = product.defaultOpeningFeeMode
  }
  if (openingFeeHelp) {
    openingFeeHelp.textContent = formatOpeningFeeModeHelp(product)
  }

  applyHomeSavingsSaleWindowToDateInput(startDateInput, product, force)
}

function applyHomeSavingsProductSelection({
  form,
  productCode,
  availabilityElement,
  forceDefaults = false
}) {
  const product = findHomeSavingsProduct(productCode)
  if (!product || !form) {
    return null
  }

  applyHomeSavingsProductDefaults({ form, product, force: forceDefaults })
  renderHomeSavingsHints({
    product,
    availabilityElement
  })

  return product
}

export {
  assertOpeningFeeModeForDeposit,
  mapFormDataToHomeSavingsSpecInputs,
  populateHomeSavingsOpeningFeeModes,
  renderHomeSavingsHints,
  applyHomeSavingsProductDefaults,
  applyHomeSavingsProductSelection
}
