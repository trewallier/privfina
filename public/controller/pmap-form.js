const PMAP_PRODUCT_SPEC = {
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
      name: 'interestPremiumPct',
      type: 'number',
      label: 'Interest Premium',
      required: true,
      unit: 'percent',
      constraints: { minimum: 0, maximum: 100 }
    },
    {
      name: 'previousYearAverageInflationPct',
      type: 'number',
      label: 'Previous Year Average Inflation',
      required: true,
      unit: 'percent',
      constraints: { minimum: -100, maximum: 100 }
    },
    { name: 'startDate', type: 'string', label: 'Start Date', required: true, unit: 'date' },
    { name: 'purchaseDate', type: 'string', label: 'Purchase Date', required: false, unit: 'date' },
    { name: 'issueDate', type: 'string', label: 'Issue Date', required: false, unit: 'date' },
    { name: 'firstCouponDate', type: 'string', label: 'First Coupon Date', required: false, unit: 'date' }
  ],
  ui: {
    formTitle: 'Prémium Magyar Állampapír',
    sections: [
      { id: 'pmap-core', title: 'PMÁP Inputs', fieldNames: ['principal', 'interestPremiumPct', 'previousYearAverageInflationPct', 'startDate', 'purchaseDate', 'issueDate', 'firstCouponDate'] }
    ]
  }
}

const PMAP_FRONTEND_FIELD_ADAPTER = {
  principal: { inputId: 'investment-principal', formName: 'principal' },
  interestPremiumPct: { inputId: 'investment-spread-rate', formName: 'spreadRate' },
  previousYearAverageInflationPct: { inputId: 'investment-yearly-inflation', formName: 'yearlyInflation' },
  startDate: { inputId: 'investment-issue-date', formName: 'startDate' },
  purchaseDate: { inputId: 'investment-transaction-date', formName: 'purchaseDate' },
  issueDate: { inputId: 'investment-issue-date', formName: 'issueDate' },
  firstCouponDate: { inputId: 'investment-coupon-period', formName: 'firstCouponDate' }
}

function toInputType(field) {
  if (field.type === 'integer' || field.type === 'number') return 'number'
  if (field.type === 'string' && field.unit === 'date') return 'date'
  return 'text'
}

function applyNumericConstraints(input, constraints = {}) {
  if (typeof constraints.minimum === 'number') input.min = String(constraints.minimum)
  if (typeof constraints.maximum === 'number') input.max = String(constraints.maximum)
}

function applyPmapSpecToForm({ investmentForm, investmentBox }) {
  if (!investmentForm) return

  const fields = PMAP_PRODUCT_SPEC.ui.sections.flatMap((s) => s.fieldNames).map((name) => PMAP_PRODUCT_SPEC.inputs.find((f) => f.name === name)).filter(Boolean)

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
      const titleElement = label.querySelector('.pmap-field-label') || document.createElement('span')
      titleElement.className = 'pmap-field-label'
      titleElement.textContent = field.label
      label.insertBefore(titleElement, label.firstChild)
      label.insertBefore(document.createTextNode(' '), titleElement.nextSibling)
    }
  })

  if (investmentBox) {
    const summaryTitle = investmentBox.querySelector('.summary-title')
    if (summaryTitle) summaryTitle.textContent = PMAP_PRODUCT_SPEC.ui.formTitle
  }
}

export { PMAP_PRODUCT_SPEC, PMAP_FRONTEND_FIELD_ADAPTER, applyPmapSpecToForm }
