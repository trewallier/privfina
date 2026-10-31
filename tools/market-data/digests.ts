import { createHash } from 'node:crypto'

/** Stable JSON for hashing (sorted object keys; arrays keep order). */
export function canonicalJson(value: unknown): string {
  return `${stableStringify(value)}\n`
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function digestCanonical(value: unknown): string {
  return sha256Hex(canonicalJson(value))
}
