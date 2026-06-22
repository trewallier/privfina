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

export { toInputType, applyNumericConstraints, orderedSpecFields }
