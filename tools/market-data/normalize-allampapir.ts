import { familyFromAllampapirPaper } from './families.ts'
import { toSeriesId } from './ids.ts'
import {
  emptyNormalizedByFamily,
  type AllampapirEnvelope,
  type AllampapirRow,
  type FamilyCode,
  type NormalizedSnapshot,
  type QuoteRow,
  type SeriesRecord
} from './types.ts'

export class AllampapirNormalizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AllampapirNormalizeError'
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

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function asNumber(value: unknown, field: string, rowId: string): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AllampapirNormalizeError(`Unparseable number for ${field} on ${rowId}`)
    }
    return value
  }
  if (typeof value === 'string') {
    const t = value.trim().replace(/\s/g, '').replace(/%$/g, '').replace(',', '.')
    if (t.length === 0) return null
    const n = Number(t)
    if (!Number.isFinite(n)) {
      throw new AllampapirNormalizeError(`Unparseable number for ${field} on ${rowId}: ${value}`)
    }
    return n
  }
  throw new AllampapirNormalizeError(`Unparseable number for ${field} on ${rowId}`)
}

/** Accept ISO or HU dotted dates (2026.11.02 / 2026.11.02T…). */
function isoDate(value: unknown): string | null {
  const s = asString(value)
  if (!s) return null
  const dotted = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(s)
  if (dotted) return `${dotted[1]}-${dotted[2]}-${dotted[3]}`
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return iso ? iso[1] : null
}

function rawLabelFromRow(row: AllampapirRow): string | null {
  return asString(row.longName) ?? asString(row.name) ?? asString(row.rawName)
}

function displayNameFromRow(row: AllampapirRow): string {
  const raw = asString(row.name) ?? asString(row.rawName) ?? asString(row.longName) ?? ''
  return stripHtml(raw) || raw
}

function mapSeriesFromRow(
  row: AllampapirRow,
  family: FamilyCode,
  asOf: string | null
): SeriesRecord | null {
  const label = rawLabelFromRow(row)
  if (!label) return null
  const id = toSeriesId(label)
  const mat = isoDate(row.maturityDate)
  const status: SeriesRecord['status'] =
    asOf && mat && mat < asOf ? 'matured' : 'active'
  const prem =
    asNumber(row.coupon_val, 'coupon_val', id) ?? asNumber(row.coupon, 'coupon', id)
  const rec: SeriesRecord = {
    id,
    isin: asString(row.isin),
    name: displayNameFromRow(row),
    issue: isoDate(row.issueDate),
    mat,
    ccy: asString(row.currency),
    status
  }
  if (prem != null && prem !== 0) rec.prem = prem
  void family
  return rec
}

function mapQuoteFromRow(
  row: AllampapirRow,
  envelopeSettle: string | null
): { id: string; row: QuoteRow } | null {
  const label = rawLabelFromRow(row)
  if (!label) return null
  const id = toSeriesId(label)
  const d = isoDate(row.settleDate) ?? envelopeSettle
  if (!d) {
    throw new AllampapirNormalizeError(`Missing settleDate on allampapir row ${id}`)
  }
  const quote: QuoteRow = [
    d,
    asNumber(row.bidPrice, 'bidPrice', id),
    asNumber(row.askPrice, 'askPrice', id),
    asNumber(row.bidYield, 'bidYield', id),
    asNumber(row.askYield, 'askYield', id),
    asNumber(row.accruedInterest, 'accruedInterest', id)
  ]
  return { id, row: quote }
}

function envelopeSettle(envelope: AllampapirEnvelope): string | null {
  const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : null
  if (!data) return null
  return isoDate(data.settle_date) ?? isoDate(data.settleDate)
}

function envelopeRows(envelope: AllampapirEnvelope): AllampapirRow[] {
  const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : null
  if (!data) return []
  return Array.isArray(data.data) ? (data.data as AllampapirRow[]) : []
}

/**
 * Normalize allampapir papers_meta + per-paper get_prices envelopes.
 * Empty papers (0 rows) are soft-ok. Non-empty rows with unmappable family fail closed.
 */
export function normalizeAllampapirSnapshots(
  pricesByPaper: Record<string, AllampapirEnvelope>,
  options?: { asOf?: string | null }
): NormalizedSnapshot {
  const byFamily = emptyNormalizedByFamily()
  let asOf: string | null = options?.asOf ?? null
  const seriesSeen = new Map<string, { family: FamilyCode; rec: SeriesRecord }>()

  for (const [paper, envelope] of Object.entries(pricesByPaper)) {
    const settle = envelopeSettle(envelope)
    const rows = envelopeRows(envelope)
    for (const row of rows) {
      const family = familyFromAllampapirPaper(paper, row.securityType)
      if (!family) {
        throw new AllampapirNormalizeError(
          `Unmappable allampapir family for paper=${paper} securityType=${JSON.stringify(row.securityType)} longName=${JSON.stringify(row.longName)}`
        )
      }
      const quoted = mapQuoteFromRow(row, settle)
      if (!quoted) continue
      byFamily[family].quotes.push(quoted)
      if (!asOf || quoted.row[0] > asOf) asOf = quoted.row[0]

      const series = mapSeriesFromRow(row, family, asOf)
      if (!series) continue
      const prev = seriesSeen.get(series.id)
      if (!prev) {
        seriesSeen.set(series.id, { family, rec: { ...series, status: 'active' } })
      } else if (prev.family !== family) {
        throw new AllampapirNormalizeError(
          `Series ${series.id} mapped to both ${prev.family} and ${family}`
        )
      }
    }
  }

  for (const { family, rec } of seriesSeen.values()) {
    byFamily[family].series.push(rec)
  }
  for (const family of Object.keys(byFamily) as FamilyCode[]) {
    byFamily[family].series.sort((a, b) => a.id.localeCompare(b.id))
  }

  return { asOf, byFamily }
}
