import {
  findHomeSavingsProduct,
  openingFeeModeLabel,
  resolveHomeSavingsReadinessHint
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

  if (!Number.isFinite(monthlyDeposit) || monthlyDeposit < minDeposit || monthlyDeposit > maxDeposit) {
    throw new Error(`Monthly deposit must be between ${minDeposit} and ${maxDeposit} Ft.`)
  }
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120) {
    throw new Error('Savings term must be an integer between 1 and 120 months.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('Savings start date is required (YYYY-MM-DD).')
  }
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

function renderHomeSavingsHints({
  product,
  readinessElement,
  eligibilityElement,
  discountElement,
  premiumElement
}) {
  if (readinessElement) {
    readinessElement.textContent = resolveHomeSavingsReadinessHint(product?.migrationStatus)
  }
  if (eligibilityElement) {
    eligibilityElement.textContent = (product?.eligibilityHints || []).join(' ')
  }
  if (discountElement) {
    discountElement.textContent = (product?.discountHints || []).join(' ')
  }
  if (premiumElement) {
    const text = product?.premiumHints || ''
    premiumElement.hidden = !text
    premiumElement.textContent = text
  }
}

function applyHomeSavingsProductDefaults({ form, product, force = false }) {
  if (!form || !product) {
    return
  }

  const depositInput = form.querySelector('#home-savings-monthly-deposit')
  const termInput = form.querySelector('#home-savings-term-months')
  const housingInput = form.querySelector('#home-savings-housing-purpose')
  const openingFeeSelect = form.querySelector('#home-savings-opening-fee-mode')

  if (depositInput && (force || !depositInput.value)) {
    depositInput.value = String(product.defaultMonthlyDeposit)
  }
  if (termInput && (force || !termInput.value)) {
    termInput.value = String(product.defaultTermMonths)
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
}

function applyHomeSavingsProductSelection({
  form,
  productCode,
  readinessElement,
  eligibilityElement,
  discountElement,
  premiumElement,
  forceDefaults = false
}) {
  const product = findHomeSavingsProduct(productCode)
  if (!product || !form) {
    return null
  }

  applyHomeSavingsProductDefaults({ form, product, force: forceDefaults })
  renderHomeSavingsHints({
    product,
    readinessElement,
    eligibilityElement,
    discountElement,
    premiumElement
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
