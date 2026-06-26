const BMAP_PRODUCT_SPEC = {
  id: 'government-security.bmap.standard',
  family: 'government-security',
  variant: 'bmap',
  displayName: 'Bónusz Magyar Állampapír',
  inputs: [
    {
      name: 'principal',
      type: 'number',
      label: 'Principal',
      required: true,
      unit: 'currency',
      constraints: { minimum: 1 }
    },
    {
      name: 'dkjBaseYieldPct',
      type: 'number',
      label: 'DKJ Base Yield',
      required: true,
      unit: 'percent',
      constraints: { minimum: -100, maximum: 100 }
    },
    {
      name: 'interestPremiumPct',
      type: 'number',
      label: 'Interest Premium',
      required: true,
      unit: 'percent',
      constraints: { minimum: 0, maximum: 100 }
    },
    { name: 'startDate', type: 'string', label: 'Start Date', required: true, unit: 'date' },
    { name: 'purchaseDate', type: 'string', label: 'Purchase Date', required: false, unit: 'date' },
    { name: 'issueDate', type: 'string', label: 'Issue Date', required: false, unit: 'date' },
    { name: 'firstCouponDate', type: 'string', label: 'First Coupon Date', required: false, unit: 'date' }
  ],
  ui: {
    formTitle: 'Bónusz Magyar Állampapír',
    sections: [
      {
        id: 'bmap-core',
        title: 'BMÁP Inputs',
        fieldNames: [
          'principal',
          'dkjBaseYieldPct',
          'interestPremiumPct',
          'startDate',
          'purchaseDate',
          'issueDate',
          'firstCouponDate'
        ]
      }
    ]
  }
}

const BMAP_FRONTEND_FIELD_ADAPTER = {
  principal: { inputId: 'bmap-principal' },
  dkjBaseYieldPct: { inputId: 'bmap-dkj-base-yield-pct' },
  interestPremiumPct: { inputId: 'bmap-interest-premium-pct' },
  startDate: { inputId: 'bmap-start-date' },
  purchaseDate: { inputId: 'bmap-purchase-date' },
  issueDate: { inputId: 'bmap-issue-date' },
  firstCouponDate: { inputId: 'bmap-first-coupon-date' }
}

import { toInputType, applyNumericConstraints, orderedSpecFields } from './spec-form-utils.js'

function ensureLabelTitleElement(label) {
  let titleElement = label.querySelector('.bmap-field-label')
  if (!titleElement) {
    titleElement = document.createElement('span')
    titleElement.className = 'bmap-field-label'
    label.insertBefore(titleElement, label.firstChild)
    label.insertBefore(document.createTextNode(' '), titleElement.nextSibling)
  }
  return titleElement
}

// `orderedSpecFields` is imported from `spec-form-utils.js`

function applyBmapSpecToForm({ bmapForm, bmapBox }) {
  void bmapBox
  if (!bmapForm) return

  const fields = orderedSpecFields(BMAP_PRODUCT_SPEC)
  fields.forEach((field) => {
    const adapter = BMAP_FRONTEND_FIELD_ADAPTER[field.name]
    if (!adapter) return

    const input = bmapForm.querySelector(`#${adapter.inputId}`)
    if (!input) return

    input.name = field.name
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

}

export { BMAP_PRODUCT_SPEC, BMAP_FRONTEND_FIELD_ADAPTER, applyBmapSpecToForm, orderedSpecFields }