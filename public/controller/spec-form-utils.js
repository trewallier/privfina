function toInputType(field) {
  if (field.type === 'integer' || field.type === 'number') return 'number'
  if (field.type === 'string' && field.unit === 'date') return 'date'
  return 'text'
}

function applyNumericConstraints(input, constraints = {}) {
  if (typeof constraints.minimum === 'number') input.min = String(constraints.minimum)
  if (typeof constraints.maximum === 'number') input.max = String(constraints.maximum)
}

function orderedSpecFields(productSpec) {
  const fieldByName = new Map(productSpec.inputs.map((field) => [field.name, field]))
  const sectionOrder = productSpec.ui.sections.flatMap((section) => section.fieldNames)
  return sectionOrder.map((name) => fieldByName.get(name)).filter(Boolean)
}

function ensureFieldLabelTitleElement(label, className) {
  let titleElement = label.querySelector(`.${className}`)
  if (!titleElement) {
    titleElement = document.createElement('span')
    titleElement.className = className
    label.insertBefore(titleElement, label.firstChild)
    label.insertBefore(document.createTextNode(' '), titleElement.nextSibling)
  }
  return titleElement
}

function reorderFormRowBySpec(form, fields, fieldAdapter) {
  const firstRow = form.querySelector('.row')
  if (!firstRow) {
    return
  }

  const mappedInputIds = fields
    .map((field) => fieldAdapter[field.name])
    .filter(Boolean)
    .map((entry) => entry.inputId)

  const mappedLabelsInOrder = fields
    .map((field) => {
      const adapter = fieldAdapter[field.name]
      if (!adapter) {
        return null
      }
      const input = form.querySelector(`#${adapter.inputId}`)
      return input ? input.closest('label') : null
    })
    .filter(Boolean)

  const remainingLabels = Array.from(firstRow.children).filter((node) => {
    const input = node.querySelector('input, select')
    return !input || !mappedInputIds.includes(input.id)
  })

  ;[...mappedLabelsInOrder, ...remainingLabels].forEach((label) => {
    firstRow.appendChild(label)
  })
}

export {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields,
  ensureFieldLabelTitleElement,
  reorderFormRowBySpec
}
