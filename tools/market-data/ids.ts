/**
 * Canonical series id: one slug used as map key, quotes/<id>.json filename, and QuotesFile.id.
 * Source display names (accents/spaces) live on SeriesRecord.name — never in the id.
 */

const UNSAFE = /[^A-Za-z0-9._-]+/g
const MULTI_UNDERSCORE = /_+/g
const EDGE_UNDERSCORE = /^_+|_+$/g

function slugify(raw: string): string {
  return raw
    .normalize('NFC')
    .trim()
    .replace(UNSAFE, '_')
    .replace(MULTI_UNDERSCORE, '_')
    .replace(EDGE_UNDERSCORE, '')
}

/** Normalize a raw ÁKK longName/name into a filesystem- and map-safe series id. */
export function toSeriesId(raw: string): string {
  const nfc = raw.normalize('NFC').trim()
  if (!nfc) {
    throw new Error('Cannot derive series id from empty name')
  }
  const slug = slugify(nfc)
  if (!slug) {
    throw new Error(`Cannot derive series id from ${JSON.stringify(raw)}`)
  }
  return slug
}

export function assertSeriesId(id: string): void {
  const expected = toSeriesId(id)
  if (id !== expected) {
    throw new Error(`Non-canonical series id ${JSON.stringify(id)} (expected ${expected})`)
  }
}

/** True when id is already canonical (safe for filenames / map keys). */
export function isCanonicalSeriesId(id: string): boolean {
  try {
    return id.length > 0 && id === toSeriesId(id)
  } catch {
    return false
  }
}
