function toFiniteNumber(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return parsed
}

function toPositiveInteger(value, label) {
  const parsed = toFiniteNumber(value, label)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return parsed
}

function toNonNegativeNumber(value, label) {
  const parsed = toFiniteNumber(value, label)
  if (parsed < 0) {
    throw new Error(`${label} must be non-negative.`)
  }
  return parsed
}

export { toFiniteNumber, toPositiveInteger, toNonNegativeNumber }
