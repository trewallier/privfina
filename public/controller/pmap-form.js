import { PMAP_PRODUCT_SPEC } from './pmap-product-spec.js'
import { mapPmapSpecInputsToLegacyInvestmentInput } from './pmap-calculation-adapter.js'
import { toInputType, applyNumericConstraints, orderedSpecFields } from './spec-form-utils.js'

const PMAP_FRONTEND_FIELD_ADAPTER = {
  principal: { inputId: 'investment-principal', formName: 'principal' },
  interestPremiumPct: { inputId: 'investment-spread-rate', formName: 'spreadRate' },
  previousYearAverageInflationPct: { inputId: 'investment-yearly-inflation', formName: 'yearlyInflation' },
  startDate: { inputId: 'investment-issue-date', formName: 'startDate' },
  purchaseDate: { inputId: 'investment-transaction-date', formName: 'purchaseDate' },
  issueDate: { inputId: 'investment-due-date', formName: 'issueDate' },
  firstCouponDate: { inputId: 'investment-coupon-period', formName: 'firstCouponDate' }
}

function ensureLabelTitleElement(label) {
  let titleElement = label.querySelector('.pmap-field-label')
  if (!titleElement) {
    titleElement = document.createElement('span')
    titleElement.className = 'pmap-field-label'
    label.insertBefore(titleElement, label.firstChild)
    label.insertBefore(document.createTextNode(' '), titleElement.nextSibling)
  }
  return titleElement
}

function reorderInvestmentRowsBySpec(investmentForm, fields) {
  const rows = Array.from(investmentForm.querySelectorAll('.row'))
  if (rows.length === 0) return

  const mappedLabelsInOrder = fields
    .map((field) => {
      const adapter = PMAP_FRONTEND_FIELD_ADAPTER[field.name]
      if (!adapter) return null
      const input = investmentForm.querySelector(`#${adapter.inputId}`)
      return input ? input.closest('label') : null
    })
    .filter(Boolean)

  const placed = new Set()
  mappedLabelsInOrder.forEach((label) => placed.add(label))

  const firstRow = rows[0]
  const secondRow = rows.length > 1 ? rows[1] : null

  if (firstRow) {
    const firstRowLabels = mappedLabelsInOrder.slice(0, 3)
    const remaining = Array.from(firstRow.children).filter((node) => !placed.has(node))
    ;[...firstRowLabels, ...remaining].forEach((label) => {
      firstRow.appendChild(label)
    })
  }

  if (secondRow) {
    const secondRowLabels = mappedLabelsInOrder.slice(3)
    const remaining = Array.from(secondRow.children).filter((node) => !placed.has(node))
    ;[...secondRowLabels, ...remaining].forEach((label) => {
      secondRow.appendChild(label)
    })
  }
}

function applyPmapSpecToForm({ investmentForm, investmentBox }) {
  if (!investmentForm) return

  const fields = orderedSpecFields(PMAP_PRODUCT_SPEC)

  fields.forEach((field) => {
    const adapter = PMAP_FRONTEND_FIELD_ADAPTER[field.name]
    if (!adapter) return
    const input = investmentForm.querySelector(`#${adapter.inputId}`)
    if (!input) return

    input.name = adapter.formName
    input.type = toInputType(field)
    input.required = Boolean(field.required)
    if (input.type === 'number') {
      applyNumericConstraints(input, field.constraints)
      if (field.type === 'integer') input.step = '1'
    }

    const label = input.closest('label')
    if (label) {
      ensureLabelTitleElement(label).textContent = field.label
    }
  })

  if (investmentBox) {
    const summaryTitle = investmentBox.querySelector('.summary-title')
    if (summaryTitle) summaryTitle.textContent = PMAP_PRODUCT_SPEC.ui.formTitle
  }

  reorderInvestmentRowsBySpec(investmentForm, fields)
}

function mapFormDataToPmapSpecInputs(formData) {
  return {
    principal: Number(formData.get('principal')),
    interestPremiumPct: Number(formData.get('spreadRate')),
    previousYearAverageInflationPct: Number(formData.get('yearlyInflation')),
    startDate: String(formData.get('startDate') || '').trim(),
    purchaseDate: String(formData.get('purchaseDate') || '').trim() || undefined,
    issueDate: String(formData.get('issueDate') || '').trim() || undefined,
    firstCouponDate: String(formData.get('firstCouponDate') || '').trim() || undefined
  }
}

function mapPmapSpecInputsToInvestmentBundleInput(specInputs, meta = {}) {
  const legacyInput = mapPmapSpecInputsToLegacyInvestmentInput(specInputs)

  return {
    id: meta.id,
    label: meta.label || PMAP_PRODUCT_SPEC.ui.formTitle,
    subtype: 'inflation-linked-bond',
    purchaseDate: legacyInput.transactionDate,
    maturityDate: legacyInput.dueDate,
    issueDate: legacyInput.issueDate,
    transactionDate: legacyInput.transactionDate,
    dueDate: legacyInput.dueDate,
    principal: legacyInput.principal,
    purchasePrice: undefined,
    annualRate: undefined,
    spreadRate: legacyInput.spreadRate,
    yearlyInflationRaw: legacyInput.yearlyInflationRaw,
    saleDate: '',
    saleValue: undefined,
    couponPeriod: specInputs.firstCouponDate || '',
    category: meta.category || 'investment',
    description: meta.description,
    createdAt: meta.createdAt
  }
}

export {
  PMAP_PRODUCT_SPEC,
  PMAP_FRONTEND_FIELD_ADAPTER,
  applyPmapSpecToForm,
  mapFormDataToPmapSpecInputs,
  mapPmapSpecInputsToInvestmentBundleInput,
  orderedSpecFields
}
