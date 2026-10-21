import {
  findCommercialLoanProduct,
  purposeOptionLabel
} from './commercial-loan-product-metadata.js'

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

  return {
    productCode: product.productCode,
    productId: product.productId,
    productSpecVersion: product.specVersion,
    principal: Number(formData.get('principal')),
    annualInterestRatePct: Number(formData.get('annualRate')),
    termMonths: Number(formData.get('termMonths')),
    startDate: String(formData.get('startDate') || '').trim(),
    gracePeriodMonths,
    loanPurpose: String(formData.get('loanPurpose') || '').trim() || undefined
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
  blank.textContent = 'Select purpose (hint)'
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
    discountElement.textContent = (product?.discountHints || []).join(' ') || 'No discount hints for this product.'
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
  forceDefaults = false
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
  renderCommercialLoanHints({
    product,
    eligibilityElement,
    discountElement,
    postSubsidyElement,
    commercialNoteElement
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
  applyCommercialLoanProductDefaults,
  applyCommercialLoanProductSelection
}
