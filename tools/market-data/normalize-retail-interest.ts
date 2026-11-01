import { familyFromRetailInterest } from './families.ts'
import { toSeriesId } from './ids.ts'
import {
  SCHEMA_VERSION,
  type AllampapirEnvelope,
  type AllampapirRow,
  type RetailInterestFile,
  type RetailInterestRow
} from './types.ts'

export class RetailInterestNormalizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetailInterestNormalizeError'
  }
}

function asString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim()
    return t.length === 0 ? null : t
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return null
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const t = value.trim().replace(/\s/g, '').replace(/%$/g, '').replace(',', '.')
    // Stepped coupons like "4,50 - 5,75 %" → take first number only when parse fails as whole.
    if (t.includes('-')) {
      const first = t.split('-')[0]?.trim()
      if (first) {
        const n = Number(first)
        return Number.isFinite(n) ? n : null
      }
    }
    if (t.length === 0) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function isoDate(value: unknown): string | null {
  const s = asString(value)
  if (!s) return null
  const dotted = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(s)
  if (dotted) return `${dotted[1]}-${dotted[2]}-${dotted[3]}`
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return iso ? iso[1] : null
}

function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase()
    return t === 'true' || t === '1' || t === 'yes'
  }
  return false
}

function envelopeRows(envelope: AllampapirEnvelope): AllampapirRow[] {
  const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : null
  if (!data) return []
  const raw = data.data
  if (Array.isArray(raw)) return raw as AllampapirRow[]
  if (raw && typeof raw === 'object') {
    return Object.values(raw as Record<string, AllampapirRow>)
  }
  return []
}

function mapRow(row: AllampapirRow): RetailInterestRow | null {
  const series = asString(row.name)
  const type = asString(row.type) ?? ''
  const from = isoDate(row.validFrom)
  if (!series || !from) return null

  let id: string
  try {
    id = toSeriesId(series)
  } catch {
    return null
  }

  const rate =
    asNumber(row.rate_val) ?? asNumber(row.rate) ?? null
  const ehm =
    asNumber(row.ehm_val) ?? asNumber(row.ehm) ?? null
  const to = isoDate(row.validTo)
  const mat = isoDate(row.maturity)
  const family = familyFromRetailInterest(type, row.place)

  const out: RetailInterestRow = {
    id,
    family,
    series,
    type,
    rate,
    ehm,
    from,
    to,
    offered: asBool(row.underIssue)
  }
  if (mat) out.mat = mat
  return out
}

/**
 * Normalize retailInterest get_all_data envelope → published refs file body (sans generatedAt).
 * Does not touch series.prem — period rates stay on this refs surface only (ADR 0036).
 */
export function normalizeRetailInterestEnvelope(
  envelope: AllampapirEnvelope,
  options?: { generatedAt?: string }
): RetailInterestFile {
  const rows: RetailInterestRow[] = []
  let asOf: string | null = null

  for (const raw of envelopeRows(envelope)) {
    const mapped = mapRow(raw)
    if (!mapped) continue
    rows.push(mapped)
    if (!asOf || mapped.from > asOf) asOf = mapped.from
  }

  rows.sort((a, b) => {
    const bySeries = a.series.localeCompare(b.series)
    if (bySeries !== 0) return bySeries
    return a.from.localeCompare(b.from)
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    asOf,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    rows
  }
}
