import { familyFromRetailInterest } from './families.ts'
import { toSeriesId } from './ids.ts'
import {
  COUPON_COLS,
  SCHEMA_VERSION,
  type AllampapirEnvelope,
  type AllampapirRow,
  type CouponRow,
  type CouponsFile,
  type FamilyCode,
  type RetailInterestFile,
  type RetailInterestRow,
  type SeriesRecord
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

function parseSingleRateToken(token: string): number | null {
  const t = token.trim().replace(/\s/g, '').replace(/%$/g, '').replace(',', '.')
  if (t.length === 0) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Parse kamatok rate display / value into one or more period rates.
 * Stepped strings like `"5,00 - 6,00 %"` become multiple bands (never first-band-only).
 */
/**
 * @param rateVal Preferred numeric / simple string from API (`rate_val`).
 * @param rateDisplay Optional display string (`rate`); stepped forms win over rateVal.
 */
export function parseRetailRateBands(rateVal: unknown, rateDisplay?: unknown): number[] {
  if (typeof rateDisplay === 'string' && rateDisplay.trim()) {
    const cleaned = rateDisplay.replace(/%/g, ' ').trim()
    if (cleaned.includes('-')) {
      const parts = cleaned.split('-').map((p) => parseSingleRateToken(p))
      const bands = parts.filter((n): n is number => n != null)
      if (bands.length > 0) return bands
    } else {
      const single = parseSingleRateToken(cleaned)
      if (single != null) return [single]
    }
  }
  if (typeof rateVal === 'number' && Number.isFinite(rateVal)) return [rateVal]
  if (typeof rateVal === 'string') {
    // Single-arg callers pass the display/value string as rateVal.
    const cleaned = rateVal.replace(/%/g, ' ').trim()
    if (cleaned.includes('-')) {
      const parts = cleaned.split('-').map((p) => parseSingleRateToken(p))
      const bands = parts.filter((n): n is number => n != null)
      if (bands.length > 0) return bands
    }
    const n = parseSingleRateToken(rateVal)
    if (n != null) return [n]
  }
  return []
}

/** Alias used by tests — same as parseRetailRateBands. */
export const parseRateBands = parseRetailRateBands

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    return parseSingleRateToken(value)
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

  const bands = parseRetailRateBands(row.rate_val, row.rate)
  const rates: Array<number | null> = bands.length > 0 ? bands : [null]
  const ehm = asNumber(row.ehm_val) ?? asNumber(row.ehm) ?? null
  const to = isoDate(row.validTo)
  const mat = isoDate(row.maturity)
  const family = familyFromRetailInterest(type, row.place)

  const out: RetailInterestRow = {
    id,
    family,
    series,
    type,
    rates,
    ehm,
    from,
    to,
    offered: asBool(row.underIssue)
  }
  if (mat) out.mat = mat
  return out
}

/**
 * Normalize retailInterest get_all_data envelope → INTERNAL rows (not published as flat refs).
 * Multi-band / stepped rate strings become multiple entries in `rates` (never first-band-only).
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

export interface RetailCouponsJoinResult {
  /** family → canonical series id → CouponsFile */
  couponsByFamily: Partial<Record<FamilyCode, Record<string, CouponsFile>>>
  /** Canonical series id → offered flag (latest period by `from` wins). */
  offeredById: Record<string, boolean>
}

function seriesMatchesRetail(series: SeriesRecord, row: RetailInterestRow): boolean {
  if (row.series === series.name) return true
  try {
    if (toSeriesId(row.series) === toSeriesId(series.name)) return true
  } catch {
    /* ignore */
  }
  try {
    if (row.id === toSeriesId(series.name)) return true
  } catch {
    /* ignore */
  }
  return false
}

function couponRowsFromRetail(row: RetailInterestRow): CouponRow[] {
  const rates = row.rates.length > 0 ? row.rates : [null]
  return rates.map((rate) => [row.from, row.to, rate] as CouponRow)
}

/**
 * Join retailInterest rows onto published series records.
 * Prefer ÁKK / catalog series id as the coupons file key when a match is found.
 * Unmatched retail rows with a family may only write under `toSeriesId(label)` when that
 * id already exists in the series list (never invent orphan coupon files).
 * Multi-band `rates` expand to distinct coupon rows with the same from/to.
 */
export function joinRetailInterestToCoupons(
  retail: RetailInterestFile | null | undefined,
  seriesByFamily: Partial<Record<FamilyCode, readonly SeriesRecord[]>>
): RetailCouponsJoinResult {
  const couponsByFamily: Partial<Record<FamilyCode, Record<string, CouponsFile>>> = {}
  const offeredById: Record<string, boolean> = {}
  if (!retail) return { couponsByFamily, offeredById }

  const knownIds = new Set<string>()
  const flatSeries: Array<{ family: FamilyCode; series: SeriesRecord }> = []
  for (const [family, list] of Object.entries(seriesByFamily) as Array<
    [FamilyCode, readonly SeriesRecord[] | undefined]
  >) {
    if (!list) continue
    for (const s of list) {
      knownIds.add(s.id)
      flatSeries.push({ family, series: s })
    }
  }

  const rowsByTarget = new Map<string, { family: FamilyCode; rows: CouponRow[] }>()
  /** Track the latest retail period (by `from`) that contributed offered for each series id. */
  const offeredFromById: Record<string, string> = {}

  for (const row of retail.rows) {
    if (!row.family) continue

    let matched: { family: FamilyCode; series: SeriesRecord } | null = null
    for (const candidate of flatSeries) {
      if (candidate.family !== row.family) continue
      if (seriesMatchesRetail(candidate.series, row)) {
        matched = candidate
        break
      }
    }

    let targetId: string | null = null
    let targetFamily: FamilyCode | null = null
    if (matched) {
      targetId = matched.series.id
      targetFamily = matched.family
    } else {
      try {
        const slug = toSeriesId(row.series)
        if (knownIds.has(slug)) {
          targetId = slug
          targetFamily = row.family
        }
      } catch {
        /* skip */
      }
    }

    if (!targetId || !targetFamily) continue

    // Latest period (max `from`) wins for offered; ties keep the later row in input order.
    const prevFrom = offeredFromById[targetId]
    if (prevFrom == null || row.from >= prevFrom) {
      offeredFromById[targetId] = row.from
      offeredById[targetId] = row.offered
    }
    const key = `${targetFamily}\0${targetId}`
    const prev = rowsByTarget.get(key)
    const nextRows = couponRowsFromRetail(row)
    if (prev) {
      prev.rows.push(...nextRows)
    } else {
      rowsByTarget.set(key, { family: targetFamily, rows: nextRows })
    }
  }

  for (const [key, { family, rows }] of rowsByTarget) {
    const id = key.split('\0')[1]!
    rows.sort((a, b) => {
      const byFrom = a[0].localeCompare(b[0])
      if (byFrom !== 0) return byFrom
      const aTo = a[1] ?? ''
      const bTo = b[1] ?? ''
      const byTo = aTo.localeCompare(bTo)
      if (byTo !== 0) return byTo
      const ar = a[2] ?? Number.POSITIVE_INFINITY
      const br = b[2] ?? Number.POSITIVE_INFINITY
      return ar - br
    })
    if (!couponsByFamily[family]) couponsByFamily[family] = {}
    couponsByFamily[family]![id] = {
      schemaVersion: SCHEMA_VERSION,
      id,
      family,
      cols: COUPON_COLS,
      rows: rows.map((r) => [...r] as CouponRow)
    }
  }

  return { couponsByFamily, offeredById }
}

/** @deprecated Prefer joinRetailInterestToCoupons */
export function buildCouponsFromRetailInterest(
  rows: readonly RetailInterestRow[],
  seriesByFamily: Partial<Record<FamilyCode, readonly SeriesRecord[]>>
): {
  couponsByFamily: Map<FamilyCode, Map<string, CouponRow[]>>
  offeredBySeriesId: Map<string, boolean>
} {
  const joined = joinRetailInterestToCoupons(
    {
      schemaVersion: SCHEMA_VERSION,
      asOf: null,
      generatedAt: new Date(0).toISOString(),
      rows: [...rows]
    },
    seriesByFamily
  )
  const couponsByFamily = new Map<FamilyCode, Map<string, CouponRow[]>>()
  for (const [family, files] of Object.entries(joined.couponsByFamily) as Array<
    [FamilyCode, Record<string, CouponsFile> | undefined]
  >) {
    if (!files) continue
    const byId = new Map<string, CouponRow[]>()
    for (const [id, file] of Object.entries(files)) {
      byId.set(id, file.rows.map((r) => [...r] as CouponRow))
    }
    couponsByFamily.set(family, byId)
  }
  return {
    couponsByFamily,
    offeredBySeriesId: new Map(Object.entries(joined.offeredById))
  }
}

export { COUPON_COLS }
