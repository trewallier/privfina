import {
  findCommercialLoanProduct,
  purposeOptionLabel
} from './commercial-loan-product-metadata.js'
import { getCommercialLoanCommercialBlocks } from './commercial-loan-commercial-blocks.js'
import {
  applyCommercialLoanFieldChrome,
  applyCommercialLoanFieldHelpToForm
} from './commercial-loan-field-help.js'
import { parseMoneyAmount } from './money-format.js'

function readCheckedNames(formData, fieldName) {
  const values = formData.getAll(fieldName)
  return values.map((value) => String(value || '').trim()).filter(Boolean)
}

function mapFormDataToCommercialLoanSpecInputs(formData, product) {
  const graceRaw = formData.get('gracePeriodMonths')
  const gracePeriodMonths =
    graceRaw === undefined || graceRaw === null || String(graceRaw).trim() === ''
      ? product.defaultGracePeriodMonths
      : Number(graceRaw)

  if (!Number.isInteger(gracePeriodMonths) || gracePeriodMonths < 0) {
    throw new Error('Grace period months must be a non-negative integer.')
  }

  if (product.graceRequired && gracePeriodMonths < 1) {
    throw new Error(`${product.displayName} requires a positive grace period.`)
  }

  const blocks = getCommercialLoanCommercialBlocks(product.productCode)
  const packagingReady = String(formData.get('commercialPackagingReady') || '') === '1'
  const activeDiscountNames = packagingReady
    ? readCheckedNames(formData, 'activeDiscountNames')
    : blocks.defaultActiveDiscountNames || []
  const includeOptionalFeeNames = packagingReady
    ? readCheckedNames(formData, 'includeOptionalFeeNames')
    : []

  return {
    productCode: product.productCode,
    productId: product.productId,
    productSpecVersion: product.specVersion,
    principal: parseMoneyAmount(formData.get('principal')),
    annualInterestRatePct: Number(formData.get('annualRate')),
    termMonths: Number(formData.get('termMonths')),
    startDate: String(formData.get('startDate') || '').trim(),
    gracePeriodMonths,
    loanPurpose: String(formData.get('loanPurpose') || '').trim() || undefined,
    activeDiscountNames,
    includeOptionalFeeNames
  }
}

function populateCommercialLoanPurposeOptions(selectElement, product) {
  if (!selectElement) {
    return
  }

  const previous = selectElement.value
  selectElement.innerHTML = ''
  const blank = document.createElement('option')
  blank.value = ''
  blank.textContent = 'Select purpose'
  selectElement.appendChild(blank)

  ;(product?.loanPurposes || []).forEach((purpose) => {
    const option = document.createElement('option')
    option.value = purpose
    option.textContent = purposeOptionLabel(purpose)
    selectElement.appendChild(option)
  })

  if (previous && (product?.loanPurposes || []).includes(previous)) {
    selectElement.value = previous
  }
}

function renderCheckboxGroup({
  container,
  items,
  fieldName,
  activeNames,
  emptyText
}) {
  if (!container) {
    return
  }

  container.innerHTML = ''
  if (!items.length) {
    const empty = document.createElement('p')
    empty.className = 'field-help-static'
    empty.textContent = emptyText
    container.appendChild(empty)
    return
  }

  const active = new Set(activeNames || [])
  items.forEach((item) => {
    const label = document.createElement('label')
    label.className = 'inline-field'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.name = fieldName
    input.value = item.name
    input.checked = active.has(item.name)
    const title = document.createElement('span')
    title.className = 'label-title'
    title.textContent = item.label || item.name
    label.appendChild(input)
    label.appendChild(title)
    container.appendChild(label)
  })
}

function renderCommercialLoanCommercialControls({
  form,
  product,
  activeDiscountNames,
  includeOptionalFeeNames
}) {
  if (!form || !product) {
    return
  }

  const blocks = getCommercialLoanCommercialBlocks(product.productCode)
  const discountContainer = form.querySelector('#commercial-loan-discount-toggles')
  const optionalFeeContainer = form.querySelector('#commercial-loan-optional-fee-toggles')

  let readyInput = form.querySelector('input[name="commercialPackagingReady"]')
  if (!readyInput) {
    readyInput = document.createElement('input')
    readyInput.type = 'hidden'
    readyInput.name = 'commercialPackagingReady'
    form.appendChild(readyInput)
  }
  readyInput.value = '1'

  const discounts = blocks.discounts || []
  const optionalFees = (blocks.fees || []).filter((fee) => fee.optional)

  renderCheckboxGroup({
    container: discountContainer,
    items: discounts,
    fieldName: 'activeDiscountNames',
    activeNames: activeDiscountNames ?? blocks.defaultActiveDiscountNames ?? [],
    emptyText: 'No selectable discounts for this product.'
  })

  renderCheckboxGroup({
    container: optionalFeeContainer,
    items: optionalFees,
    fieldName: 'includeOptionalFeeNames',
    activeNames: includeOptionalFeeNames ?? [],
    emptyText: 'No optional add-on fees for this product.'
  })
}

function renderCommercialLoanHints({
  product,
  eligibilityElement,
  discountElement,
  postSubsidyElement,
  commercialNoteElement
}) {
  if (eligibilityElement) {
    eligibilityElement.textContent = (product?.eligibilityHints || []).join(' ')
  }
  if (discountElement) {
    // Discount conditions stay as soft copy; selectable toggles own activation.
    discountElement.textContent =
      (product?.discountHints || []).join(' ') || 'Use the discount toggles below when conditions are met.'
  }
  if (postSubsidyElement) {
    const text = product?.postSubsidyInfo || ''
    postSubsidyElement.hidden = !text
    postSubsidyElement.textContent = text
  }
  if (commercialNoteElement) {
    const blocked = product?.commerciallyBlockedReason || ''
    commercialNoteElement.hidden = !blocked
    commercialNoteElement.textContent = blocked
      ? `Not commercially ready: ${blocked}`
      : ''
  }
}

function applyCommercialLoanProductDefaults({ form, product }) {
  if (!form || !product) {
    return
  }

  const rateInput = form.querySelector('#commercial-loan-annual-rate')
  const termInput = form.querySelector('#commercial-loan-term-months')
  const graceInput = form.querySelector('#commercial-loan-grace-period-months')
  const purposeSelect = form.querySelector('#commercial-loan-purpose')

  if (rateInput && !rateInput.value) {
    rateInput.value = String(product.defaultAnnualInterestRatePct)
  }
  if (termInput && !termInput.value) {
    termInput.value = String(product.defaultTermMonths)
  }
  if (graceInput) {
    if (!graceInput.value || product.graceRequired) {
      graceInput.value = String(product.defaultGracePeriodMonths)
    }
    graceInput.required = Boolean(product.graceRequired)
  }

  populateCommercialLoanPurposeOptions(purposeSelect, product)
}

function applyCommercialLoanProductSelection({
  form,
  productCode,
  eligibilityElement,
  discountElement,
  postSubsidyElement,
  commercialNoteElement,
  forceDefaults = false,
  activeDiscountNames,
  includeOptionalFeeNames
}) {
  const product = findCommercialLoanProduct(productCode)
  if (!product || !form) {
    return null
  }

  if (forceDefaults) {
    const rateInput = form.querySelector('#commercial-loan-annual-rate')
    const termInput = form.querySelector('#commercial-loan-term-months')
    const graceInput = form.querySelector('#commercial-loan-grace-period-months')
    if (rateInput) rateInput.value = String(product.defaultAnnualInterestRatePct)
    if (termInput) termInput.value = String(product.defaultTermMonths)
    if (graceInput) graceInput.value = String(product.defaultGracePeriodMonths)
  }

  applyCommercialLoanProductDefaults({ form, product })
  applyCommercialLoanFieldHelpToForm(form, product.productCode)
  applyCommercialLoanFieldChrome(form, product)
  renderCommercialLoanHints({
    product,
    eligibilityElement,
    discountElement,
    postSubsidyElement,
    commercialNoteElement
  })

  const blocks = getCommercialLoanCommercialBlocks(product.productCode)
  renderCommercialLoanCommercialControls({
    form,
    product,
    activeDiscountNames: forceDefaults
      ? blocks.defaultActiveDiscountNames
      : activeDiscountNames ?? blocks.defaultActiveDiscountNames,
    includeOptionalFeeNames: forceDefaults ? [] : includeOptionalFeeNames
  })

  const summaryTitle = form.closest('.flow-box')?.querySelector('.summary-title')
  if (summaryTitle) {
    summaryTitle.textContent = 'Commercial loan'
  }

  return product
}

export {
  mapFormDataToCommercialLoanSpecInputs,
  populateCommercialLoanPurposeOptions,
  renderCommercialLoanHints,
  renderCommercialLoanCommercialControls,
  applyCommercialLoanProductDefaults,
  applyCommercialLoanProductSelection
}
