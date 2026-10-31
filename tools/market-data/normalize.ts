import { familyFromSecurityType } from './families.ts'
import { toSeriesId } from './ids.ts'
import {
  FAMILIES,
  type AkkEnvelope,
  type AkkRow,
  type FamilyCode,
  type NormalizedSnapshot,
  type QuoteRow,
  type SeriesRecord
} from './types.ts'

export class NormalizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NormalizeError'
  }
}

function asString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim()
    return t.length === 0 ? null : t
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function asNumber(value: unknown, field: string, rowId: string): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new NormalizeError(`Unparseable number for ${field} on ${rowId}`)
    }
    return value
  }
  if (typeof value === 'string') {
    const t = value.trim().replace(/\s/g, '').replace(',', '.')
    if (t.length === 0) return null
    const n = Number(t)
    if (!Number.isFinite(n)) {
      throw new NormalizeError(`Unparseable number for ${field} on ${rowId}: ${value}`)
    }
    return n
  }
  throw new NormalizeError(`Unparseable number for ${field} on ${rowId}`)
}

function isoDate(value: unknown): string | null {
  const s = asString(value)
  if (!s) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return m ? m[1] : null
}

function emptyByFamily(): NormalizedSnapshot['byFamily'] {
  return {
    dkj: { series: [], quotes: [] },
    pmap: { series: [], quotes: [] },
    bmap: { series: [], quotes: [] }
  }
}

function rawLabelFromRow(row: AkkRow): string | null {
  return asString(row.longName) ?? asString(row.name)
}

function mapCatalogRow(row: AkkRow, asOf: string | null): SeriesRecord | null {
  const family = familyFromSecurityType(row.securityType)
  if (!family) return null
  const label = rawLabelFromRow(row)
  if (!label) return null
  const id = toSeriesId(label)
  const mat = isoDate(row.maturityDate)
  const status: SeriesRecord['status'] =
    asOf && mat && mat < asOf ? 'matured' : 'active'
  const face = asNumber(row.faceValue, 'faceValue', id)
  const prem = asNumber(row.coupon, 'coupon', id)
  const displayName = asString(row.name) ?? label
  const rec: SeriesRecord = {
    id,
    isin: asString(row.isin),
    name: displayName,
    issue: isoDate(row.issueDate),
    mat,
    ccy: asString(row.currency),
    status
  }
  if (face != null) rec.face = face
  if (asString(row.interestType)) rec.iType = asString(row.interestType)
  if (prem != null && prem !== 0) rec.prem = prem
  if (asString(row.referenceCurve)) rec.ref = asString(row.referenceCurve)
  return rec
}

function mapQuoteRow(row: AkkRow): { family: FamilyCode; id: string; row: QuoteRow } | null {
  const family = familyFromSecurityType(row.securityType)
  if (!family) return null
  const label = rawLabelFromRow(row)
  if (!label) return null
  const id = toSeriesId(label)
  const d = isoDate(row.settleDate)
  if (!d) {
    throw new NormalizeError(`Missing settleDate on network-rate row ${id}`)
  }
  const quote: QuoteRow = [
    d,
    asNumber(row.bidPrice, 'bidPrice', id),
    asNumber(row.askPrice, 'askPrice', id),
    asNumber(row.bidYield, 'bidYield', id),
    asNumber(row.askYield, 'askYield', id),
    asNumber(row.accruedInterest, 'accruedInterest', id)
  ]
  return { family, id, row: quote }
}

/**
 * Build a normalized snapshot from ÁKK catalog + network-rate envelopes.
 * Series list in the snapshot is the **currently quoted** set only; merge accumulates history.
 * Catalog join misses for quoted ids fail hard (commercial past-calc needs metadata).
 */
export function normalizeAkkSnapshots(
  catalog: AkkEnvelope,
  networkRates: AkkEnvelope,
  options?: { asOf?: string | null }
): NormalizedSnapshot {
  const catalogRows = catalog.data ?? []
  const rateRows = networkRates.data ?? []

  const byFamily = emptyByFamily()
  const quotedIds = new Set<string>()
  let asOf: string | null = options?.asOf ?? null

  for (const row of rateRows) {
    const mapped = mapQuoteRow(row)
    if (!mapped) continue
    quotedIds.add(mapped.id)
    byFamily[mapped.family].quotes.push({ id: mapped.id, row: mapped.row })
    if (!asOf || mapped.row[0] > asOf) asOf = mapped.row[0]
  }

  for (const family of FAMILIES) {
    if (byFamily[family].quotes.length === 0) {
      throw new NormalizeError(`Required family ${family} has zero network-rate rows`)
    }
  }

  const catalogById = new Map<string, SeriesRecord>()
  for (const row of catalogRows) {
    const mapped = mapCatalogRow(row, asOf)
    if (!mapped) continue
    catalogById.set(mapped.id, mapped)
  }

  const joinMisses: string[] = []
  const seen = new Set<string>()
  for (const family of FAMILIES) {
    for (const q of byFamily[family].quotes) {
      if (seen.has(q.id)) continue
      seen.add(q.id)
      const fromCatalog = catalogById.get(q.id)
      if (!fromCatalog) {
        joinMisses.push(q.id)
        continue
      }
      byFamily[family].series.push({ ...fromCatalog, status: 'active' })
    }
    byFamily[family].series.sort((a, b) => a.id.localeCompare(b.id))
  }

  if (joinMisses.length > 0) {
    throw new NormalizeError(
      `Catalog join miss for quoted series (${joinMisses.length}): ${joinMisses.slice(0, 8).join(', ')}`
    )
  }

  return { asOf, byFamily }
}
