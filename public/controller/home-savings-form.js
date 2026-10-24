import {
  findHomeSavingsProduct,
  openingFeeModeLabel,
  resolveHomeSavingsReadinessHint
} from './home-savings-product-metadata.js'
import { parseMoneyAmount } from './money-format.js'

function mapFormDataToHomeSavingsSpecInputs(formData, product) {
  const monthlyDeposit = parseMoneyAmount(formData.get('monthlyDeposit'))
  const termMonths = Number(formData.get('termMonths'))
  const startDate = String(formData.get('startDate') || '').trim()
  const housingPurpose = formData.get('housingPurpose') === 'on'
  const openingFeeMode = String(formData.get('openingFeeMode') || '').trim()
  const contractAmountRaw = String(formData.get('contractAmount') || '').trim()

  if (!Number.isFinite(monthlyDeposit) || monthlyDeposit < 10_000 || monthlyDeposit > 100_000) {
    throw new Error('Monthly deposit must be between 10 000 and 100 000 Ft.')
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

function applyHomeSavingsProductDefaults({ form, product }) {
  if (!form || !product) {
    return
  }

  const depositInput = form.querySelector('#home-savings-monthly-deposit')
  const termInput = form.querySelector('#home-savings-term-months')
  const housingInput = form.querySelector('#home-savings-housing-purpose')
  const openingFeeSelect = form.querySelector('#home-savings-opening-fee-mode')

  if (depositInput && !depositInput.value) {
    depositInput.value = String(product.defaultMonthlyDeposit)
  }
  if (termInput && !termInput.value) {
    termInput.value = String(product.defaultTermMonths)
  }
  if (housingInput && !form.dataset.housingTouched) {
    housingInput.checked = Boolean(product.defaultHousingPurpose)
  }

  populateHomeSavingsOpeningFeeModes(openingFeeSelect, product)
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

  if (forceDefaults) {
    const depositInput = form.querySelector('#home-savings-monthly-deposit')
    const termInput = form.querySelector('#home-savings-term-months')
    const housingInput = form.querySelector('#home-savings-housing-purpose')
    const openingFeeSelect = form.querySelector('#home-savings-opening-fee-mode')
    if (depositInput) depositInput.value = String(product.defaultMonthlyDeposit)
    if (termInput) termInput.value = String(product.defaultTermMonths)
    if (housingInput) housingInput.checked = Boolean(product.defaultHousingPurpose)
    if (openingFeeSelect) openingFeeSelect.value = product.defaultOpeningFeeMode
    delete form.dataset.housingTouched
  }

  applyHomeSavingsProductDefaults({ form, product })
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
  mapFormDataToHomeSavingsSpecInputs,
  populateHomeSavingsOpeningFeeModes,
  renderHomeSavingsHints,
  applyHomeSavingsProductDefaults,
  applyHomeSavingsProductSelection
}
