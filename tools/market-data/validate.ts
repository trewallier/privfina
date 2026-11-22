import {
  digestBubor,
  digestCanonical,
  digestInflation,
  digestOfferingArchive,
  digestPriceCalendar,
  digestSettlementCalendar
} from './digests.ts'
import { assertSeriesId } from './ids.ts'
import { loadMarketTree } from './io.ts'
import { publishedFamilies, type MarketTreeState } from './merge.ts'
import {
  BUBOR_REF_PATH,
  BUBOR_TENORS,
  COUPON_COLS,
  INFLATION_REF_PATH,
  OFFERING_ARCHIVE_REF_PATH,
  PRICE_CALENDAR_REF_PATH,
  QUOTE_COLS,
  REQUIRED_FAMILIES,
  SCHEMA_VERSION,
  SETTLEMENT_CALENDAR_REF_PATH,
  type BuborTenor,
  type FamilyCode,
  type InflationSeriesKey,
  type ManifestFile,
  type SeriesRecord
} from './types.ts'

export class ValidateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidateError'
  }
}

export function validateMarketTree(tree: MarketTreeState): void {
  if (!tree.manifest) {
    throw new ValidateError('Missing manifest')
  }
  validateManifest(tree.manifest)
  const families = tree.manifest.families
  for (const family of families) {
    const fam = tree.families[family]
    if (!fam) {
      throw new ValidateError(`Missing family state for ${family}`)
    }
    if (fam.series.schemaVersion !== SCHEMA_VERSION) {
      throw new ValidateError(`Bad series schemaVersion for ${family}`)
    }
    if (fam.series.family !== family) {
      throw new ValidateError(`series.family mismatch for ${family}`)
    }
    const required = (REQUIRED_FAMILIES as readonly string[]).includes(family)
    if (required && Object.keys(fam.latest.quotes).length === 0) {
      throw new ValidateError(`Required family ${family} has empty latest.json`)
    }
    const seriesIds = new Set<string>()
    for (const s of fam.series.series) {
      try {
        assertSeriesId(s.id)
      } catch (err) {
        throw new ValidateError(
          `Non-canonical series id in ${family}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      validateSeriesRecord(family, s, required)
      seriesIds.add(s.id)
    }
    for (const [id, q] of Object.entries(fam.quotes)) {
      try {
        assertSeriesId(id)
      } catch (err) {
        throw new ValidateError(
          `Non-canonical quote key in ${family}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      if (q.id !== id) throw new ValidateError(`Quote id mismatch ${family}/${id}`)
      if (q.family !== family) throw new ValidateError(`Quote family mismatch ${family}/${id}`)
      if (!seriesIds.has(id)) {
        throw new ValidateError(`Quote history for ${family}/${id} missing from series.json`)
      }
      if (q.cols.join(',') !== QUOTE_COLS.join(',')) {
        throw new ValidateError(`Quote cols mismatch ${family}/${id}`)
      }
      for (const row of q.rows) {
        if (!row[0] || !/^\d{4}-\d{2}-\d{2}$/.test(row[0])) {
          throw new ValidateError(`Bad quote date in ${family}/${id}`)
        }
      }
    }
    for (const [id, c] of Object.entries(fam.coupons ?? {})) {
      try {
        assertSeriesId(id)
      } catch (err) {
        throw new ValidateError(
          `Non-canonical coupon key in ${family}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      if (c.id !== id) throw new ValidateError(`Coupon id mismatch ${family}/${id}`)
      if (c.family !== family) throw new ValidateError(`Coupon family mismatch ${family}/${id}`)
      if (!seriesIds.has(id)) {
        throw new ValidateError(`Coupon schedule for ${family}/${id} missing from series.json`)
      }
      if (c.cols.join(',') !== COUPON_COLS.join(',')) {
        throw new ValidateError(`Coupon cols mismatch ${family}/${id}`)
      }
      if (c.schemaVersion !== SCHEMA_VERSION) {
        throw new ValidateError(`Bad coupon schemaVersion for ${family}/${id}`)
      }
      for (const row of c.rows) {
        if (!row[0] || !/^\d{4}-\d{2}-\d{2}$/.test(row[0])) {
          throw new ValidateError(`Bad coupon from date in ${family}/${id}`)
        }
        if (row[1] != null && !/^\d{4}-\d{2}-\d{2}$/.test(row[1])) {
          throw new ValidateError(`Bad coupon to date in ${family}/${id}`)
        }
        if (row[2] != null && (typeof row[2] !== 'number' || !Number.isFinite(row[2]))) {
          throw new ValidateError(`Bad coupon rate in ${family}/${id}`)
        }
      }
    }
    for (const [id, o] of Object.entries(fam.offerings ?? {})) {
      try {
        assertSeriesId(id)
      } catch (err) {
        throw new ValidateError(
          `Non-canonical offering key in ${family}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      if (o.id !== id) throw new ValidateError(`Offering id mismatch ${family}/${id}`)
      if (o.schemaVersion !== SCHEMA_VERSION) {
        throw new ValidateError(`Bad offering schemaVersion for ${family}/${id}`)
      }
      if (!o.source || typeof o.source.host !== 'string' || !o.source.disclaimer?.trim()) {
        throw new ValidateError(`Offering source attribution required for ${family}/${id}`)
      }
      if (o.saleWindow != null) {
        if (typeof o.saleWindow.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.saleWindow.from)) {
          throw new ValidateError(`Bad offering saleWindow.from for ${family}/${id}`)
        }
        if (
          o.saleWindow.to != null &&
          o.saleWindow.to !== '' &&
          !/^\d{4}-\d{2}-\d{2}$/.test(o.saleWindow.to)
        ) {
          throw new ValidateError(`Bad offering saleWindow.to for ${family}/${id}`)
        }
      }
      if (o.paymentDates != null) {
        if (!Array.isArray(o.paymentDates)) {
          throw new ValidateError(`Offering paymentDates must be an array for ${family}/${id}`)
        }
        for (const d of o.paymentDates) {
          if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            throw new ValidateError(`Bad offering paymentDate in ${family}/${id}`)
          }
        }
      }
    }
  }
  if (tree.manifest.refs?.retailInterest) {
    throw new ValidateError(
      'manifest.refs.retailInterest is not published under schemaVersion 2 (use coupons/<id>.json)'
    )
  }
  if (tree.inflation) {
    validateInflation(tree)
  } else if (tree.manifest.refs?.inflation || tree.manifest.digests[INFLATION_REF_PATH]) {
    throw new ValidateError('manifest references inflation but file is missing')
  }
  if (tree.bubor) {
    validateBubor(tree)
  } else if (tree.manifest.refs?.bubor || tree.manifest.digests[BUBOR_REF_PATH]) {
    throw new ValidateError('manifest references bubor but file is missing')
  }
  if (tree.settlementCalendar) {
    validateSettlementCalendar(tree)
  } else if (
    tree.manifest.refs?.settlementCalendar ||
    tree.manifest.digests[SETTLEMENT_CALENDAR_REF_PATH]
  ) {
    throw new ValidateError('manifest references settlementCalendar but file is missing')
  }
  if (tree.priceCalendar) {
    validatePriceCalendar(tree)
  } else if (
    tree.manifest.refs?.priceCalendar ||
    tree.manifest.digests[PRICE_CALENDAR_REF_PATH]
  ) {
    throw new ValidateError('manifest references priceCalendar but file is missing')
  }
  if (tree.offeringArchive) {
    validateOfferingArchive(tree)
  } else if (
    tree.manifest.refs?.offeringArchive ||
    tree.manifest.digests[OFFERING_ARCHIVE_REF_PATH]
  ) {
    throw new ValidateError('manifest references offeringArchive but file is missing')
  }
  verifyManifestDigests(tree)
}

function validateSeriesRecord(family: FamilyCode, s: SeriesRecord, requiredFamily: boolean): void {
  if (Object.prototype.hasOwnProperty.call(s, 'prem')) {
    throw new ValidateError(`series.prem is not allowed in schemaVersion 2 (${family}/${s.id})`)
  }
  if (
    requiredFamily &&
    s.status === 'active' &&
    (s.mat == null || s.mat === '')
  ) {
    throw new ValidateError(
      `Active series in required family ${family}/${s.id} must have non-null mat`
    )
  }
}

const INFLATION_SERIES_KEYS: InflationSeriesKey[] = ['yoy', 'mom', 'ytdFromDec', 'ytdYoy']

function validateInflation(tree: MarketTreeState): void {
  const file = tree.inflation
  if (!file) return
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidateError(`inflation schemaVersion must be ${SCHEMA_VERSION}`)
  }
  if (file.metric !== 'cpi_total' || file.unit !== 'pct_change') {
    throw new ValidateError('inflation metric/unit must be cpi_total / pct_change')
  }
  if (!file.source || file.source.id !== 'ksh-stadat-ara0040') {
    throw new ValidateError('inflation.source.id must be ksh-stadat-ara0040')
  }
  for (const key of INFLATION_SERIES_KEYS) {
    const block = file.series?.[key]
    if (!block) throw new ValidateError(`inflation.series missing ${key}`)
    if (!Array.isArray(block.rows)) {
      throw new ValidateError(`inflation.series.${key}.rows must be an array`)
    }
    for (const row of block.rows) {
      if (!Array.isArray(row) || row.length !== 2) {
        throw new ValidateError(`Bad inflation row shape in ${key}`)
      }
      const [ym, pct] = row
      if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) {
        throw new ValidateError(`Bad inflation ym in ${key}: ${String(ym)}`)
      }
      if (typeof pct !== 'number' || !Number.isFinite(pct)) {
        throw new ValidateError(`Bad inflation pct in ${key} ${ym}`)
      }
    }
  }
  if (!Array.isArray(file.annualAverage?.rows)) {
    throw new ValidateError('inflation.annualAverage.rows must be an array')
  }
  for (const row of file.annualAverage.rows) {
    if (!Array.isArray(row) || row.length !== 2) {
      throw new ValidateError('Bad inflation annualAverage row shape')
    }
    const [year, pct] = row
    if (typeof year !== 'string' || !/^\d{4}$/.test(year)) {
      throw new ValidateError(`Bad inflation annualAverage year: ${String(year)}`)
    }
    if (typeof pct !== 'number' || !Number.isFinite(pct)) {
      throw new ValidateError(`Bad inflation annualAverage pct for ${year}`)
    }
  }
  const refPath = tree.manifest?.refs?.inflation
  if (refPath && refPath !== INFLATION_REF_PATH) {
    throw new ValidateError(
      `manifest.refs.inflation must be ${INFLATION_REF_PATH}, got ${refPath}`
    )
  }
}

function validateBubor(tree: MarketTreeState): void {
  const file = tree.bubor
  if (!file) return
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidateError(`bubor schemaVersion must be ${SCHEMA_VERSION}`)
  }
  if (file.metric !== 'bubor' || file.unit !== 'pct') {
    throw new ValidateError('bubor metric/unit must be bubor / pct')
  }
  if (!file.source || file.source.id !== 'mnb-bubor2-xls') {
    throw new ValidateError('bubor.source.id must be mnb-bubor2-xls')
  }
  if (!Array.isArray(file.tenors) || file.tenors.length !== BUBOR_TENORS.length) {
    throw new ValidateError('bubor.tenors must list the canonical tenor set')
  }
  for (let i = 0; i < BUBOR_TENORS.length; i++) {
    if (file.tenors[i] !== BUBOR_TENORS[i]) {
      throw new ValidateError(`bubor.tenors[${i}] must be ${BUBOR_TENORS[i]}`)
    }
  }
  for (const key of BUBOR_TENORS) {
    const block = file.series?.[key as BuborTenor]
    if (!block) throw new ValidateError(`bubor.series missing ${key}`)
    if (!Array.isArray(block.rows)) {
      throw new ValidateError(`bubor.series.${key}.rows must be an array`)
    }
    const seenDates = new Set<string>()
    let prevDate: string | null = null
    for (const row of block.rows) {
      if (!Array.isArray(row) || row.length !== 2) {
        throw new ValidateError(`Bad bubor row shape in ${key}`)
      }
      const [d, pct] = row
      if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        throw new ValidateError(`Bad bubor date in ${key}: ${String(d)}`)
      }
      if (typeof pct !== 'number' || !Number.isFinite(pct)) {
        throw new ValidateError(`Bad bubor pct in ${key} ${d}`)
      }
      if (seenDates.has(d)) {
        throw new ValidateError(`Duplicate bubor date in ${key}: ${d}`)
      }
      seenDates.add(d)
      if (prevDate !== null && d <= prevDate) {
        throw new ValidateError(`Non-ascending bubor dates in ${key}: ${prevDate} then ${d}`)
      }
      prevDate = d
    }
  }
  const refPath = tree.manifest?.refs?.bubor
  if (refPath && refPath !== BUBOR_REF_PATH) {
    throw new ValidateError(`manifest.refs.bubor must be ${BUBOR_REF_PATH}, got ${refPath}`)
  }
}

function validateSettlementCalendar(tree: MarketTreeState): void {
  const file = tree.settlementCalendar
  if (!file) return
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidateError(`settlementCalendar schemaVersion must be ${SCHEMA_VERSION}`)
  }
  if (file.calendarId !== 'HU-VIBER') {
    throw new ValidateError('settlementCalendar.calendarId must be HU-VIBER')
  }
  if (file.timezone !== 'Europe/Budapest') {
    throw new ValidateError('settlementCalendar.timezone must be Europe/Budapest')
  }
  if (!file.source || file.source.id !== 'mnb-elszamolasforgalmi-naptar') {
    throw new ValidateError('settlementCalendar.source.id must be mnb-elszamolasforgalmi-naptar')
  }
  if (!file.source.disclaimer || !file.source.disclaimer.trim()) {
    throw new ValidateError('settlementCalendar.source.disclaimer is required')
  }
  if (!Array.isArray(file.years)) {
    throw new ValidateError('settlementCalendar.years must be an array')
  }
  let prevYear: number | null = null
  const seenYears = new Set<number>()
  for (const block of file.years) {
    if (!block || typeof block.year !== 'number' || !Number.isInteger(block.year)) {
      throw new ValidateError('settlementCalendar year blocks require integer year')
    }
    if (seenYears.has(block.year)) {
      throw new ValidateError(`Duplicate settlementCalendar year ${block.year}`)
    }
    seenYears.add(block.year)
    if (prevYear !== null && block.year <= prevYear) {
      throw new ValidateError(
        `Non-ascending settlementCalendar years: ${prevYear} then ${block.year}`
      )
    }
    prevYear = block.year
    if (typeof block.sourceFile !== 'string' || !block.sourceFile.trim()) {
      throw new ValidateError(`settlementCalendar ${block.year}: sourceFile required`)
    }
    if (typeof block.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(block.sourceDigest)) {
      throw new ValidateError(`settlementCalendar ${block.year}: sourceDigest must be sha256 hex`)
    }
    validateIsoDateList(block.closed, `settlementCalendar ${block.year} closed`)
    validateIsoDateList(block.open, `settlementCalendar ${block.year} open`)
    for (const d of block.closed) {
      if (!d.startsWith(`${block.year}-`)) {
        throw new ValidateError(`closed date ${d} not in year ${block.year}`)
      }
    }
    for (const d of block.open) {
      if (!d.startsWith(`${block.year}-`)) {
        throw new ValidateError(`open date ${d} not in year ${block.year}`)
      }
    }
  }
  const refPath = tree.manifest?.refs?.settlementCalendar
  if (refPath && refPath !== SETTLEMENT_CALENDAR_REF_PATH) {
    throw new ValidateError(
      `manifest.refs.settlementCalendar must be ${SETTLEMENT_CALENDAR_REF_PATH}, got ${refPath}`
    )
  }
}

function validateIsoDateList(list: unknown, label: string): void {
  if (!Array.isArray(list)) {
    throw new ValidateError(`${label} must be an array`)
  }
  let prev: string | null = null
  const seen = new Set<string>()
  for (const d of list) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new ValidateError(`Bad ${label} date: ${String(d)}`)
    }
    if (seen.has(d)) {
      throw new ValidateError(`Duplicate ${label} date: ${d}`)
    }
    seen.add(d)
    if (prev !== null && d <= prev) {
      throw new ValidateError(`Non-ascending ${label} dates: ${prev} then ${d}`)
    }
    prev = d
  }
}

function validatePriceCalendar(tree: MarketTreeState): void {
  const file = tree.priceCalendar
  if (!file) return
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidateError(`priceCalendar schemaVersion must be ${SCHEMA_VERSION}`)
  }
  if (!file.source || file.source.id !== 'webkincstar-report-service') {
    throw new ValidateError('priceCalendar.source.id must be webkincstar-report-service')
  }
  if (!file.source.disclaimer || !file.source.disclaimer.trim()) {
    throw new ValidateError('priceCalendar.source.disclaimer is required')
  }
  if (!Array.isArray(file.reports) || file.reports.length === 0) {
    throw new ValidateError('priceCalendar.reports must be a non-empty array')
  }
  if (!Array.isArray(file.days)) {
    throw new ValidateError('priceCalendar.days must be an array')
  }
  const seen = new Set<string>()
  for (const day of file.days) {
    if (!day || typeof day.datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.datum)) {
      throw new ValidateError(`Bad priceCalendar datum: ${String(day?.datum)}`)
    }
    if (typeof day.report !== 'string' || !day.report) {
      throw new ValidateError('priceCalendar day missing report')
    }
    if (
      day.status !== 'priced' &&
      day.status !== 'no_price' &&
      day.status !== 'fetch_failed'
    ) {
      throw new ValidateError(`Bad priceCalendar status: ${String(day.status)}`)
    }
    if (typeof day.rowCount !== 'number' || !Number.isFinite(day.rowCount) || day.rowCount < 0) {
      throw new ValidateError(`Bad priceCalendar rowCount for ${day.report} ${day.datum}`)
    }
    const key = `${day.report}\0${day.datum}`
    if (seen.has(key)) {
      throw new ValidateError(`Duplicate priceCalendar day ${day.report} ${day.datum}`)
    }
    seen.add(key)
  }
  const refPath = tree.manifest?.refs?.priceCalendar
  if (refPath && refPath !== PRICE_CALENDAR_REF_PATH) {
    throw new ValidateError(
      `manifest.refs.priceCalendar must be ${PRICE_CALENDAR_REF_PATH}, got ${refPath}`
    )
  }
}

function validateOfferingArchive(tree: MarketTreeState): void {
  const file = tree.offeringArchive
  if (!file) return
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidateError(`offeringArchive schemaVersion must be ${SCHEMA_VERSION}`)
  }
  if (!file.source || file.source.id !== 'akk-public-offerings') {
    throw new ValidateError('offeringArchive.source.id must be akk-public-offerings')
  }
  if (!file.source.disclaimer || !file.source.disclaimer.trim()) {
    throw new ValidateError('offeringArchive.source.disclaimer is required')
  }
  if (!Array.isArray(file.documents)) {
    throw new ValidateError('offeringArchive.documents must be an array')
  }
  const seen = new Set<string>()
  for (const doc of file.documents) {
    if (!doc?.pathUuid || typeof doc.pathUuid !== 'string') {
      throw new ValidateError('offeringArchive document missing pathUuid')
    }
    const key = doc.pathUuid.toLowerCase()
    if (seen.has(key)) {
      throw new ValidateError(`Duplicate offeringArchive pathUuid ${doc.pathUuid}`)
    }
    seen.add(key)
    if (typeof doc.seriesId !== 'string' || !doc.seriesId) {
      throw new ValidateError(`offeringArchive document missing seriesId for ${doc.pathUuid}`)
    }
    if (doc.sha256 != null && (typeof doc.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(doc.sha256))) {
      throw new ValidateError(`Bad offeringArchive sha256 for ${doc.pathUuid}`)
    }
  }
  const refPath = tree.manifest?.refs?.offeringArchive
  if (refPath && refPath !== OFFERING_ARCHIVE_REF_PATH) {
    throw new ValidateError(
      `manifest.refs.offeringArchive must be ${OFFERING_ARCHIVE_REF_PATH}, got ${refPath}`
    )
  }
}

/** Recompute file digests and require an exact match to manifest.digests. */
export function verifyManifestDigests(tree: MarketTreeState): void {
  if (!tree.manifest) {
    throw new ValidateError('Missing manifest')
  }
  const expected = computeTreeDigests(tree)
  const actual = tree.manifest.digests
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
  for (const key of keys) {
    if (expected[key] !== actual[key]) {
      throw new ValidateError(
        `Digest mismatch for ${key}: manifest=${actual[key] ?? 'missing'} recomputed=${expected[key] ?? 'missing'}`
      )
    }
  }
}

export function computeTreeDigests(tree: MarketTreeState): Record<string, string> {
  const digests: Record<string, string> = {}
  const families = tree.manifest?.families ?? publishedFamilies(tree)
  for (const family of families) {
    const fam = tree.families[family]
    digests[`families/${family}/series.json`] = digestCanonical(fam.series)
    digests[`families/${family}/latest.json`] = digestCanonical(fam.latest)
    for (const [id, q] of Object.entries(fam.quotes)) {
      digests[`families/${family}/quotes/${id}.json`] = digestCanonical(q)
    }
    for (const [id, c] of Object.entries(fam.coupons ?? {})) {
      digests[`families/${family}/coupons/${id}.json`] = digestCanonical(c)
    }
    for (const [id, o] of Object.entries(fam.offerings ?? {})) {
      digests[`families/${family}/offerings/${id}.json`] = digestCanonical(o)
    }
  }
  if (tree.inflation) {
    digests[INFLATION_REF_PATH] = digestInflation(tree.inflation)
  }
  if (tree.bubor) {
    digests[BUBOR_REF_PATH] = digestBubor(tree.bubor)
  }
  if (tree.settlementCalendar) {
    digests[SETTLEMENT_CALENDAR_REF_PATH] = digestSettlementCalendar(tree.settlementCalendar)
  }
  if (tree.priceCalendar) {
    digests[PRICE_CALENDAR_REF_PATH] = digestPriceCalendar(tree.priceCalendar)
  }
  if (tree.offeringArchive) {
    digests[OFFERING_ARCHIVE_REF_PATH] = digestOfferingArchive(tree.offeringArchive)
  }
  return digests
}

/**
 * Defense-in-depth for the publish job: load a tree from disk, run schema checks,
 * and verify manifest digests before commit/push. Does not contact ÁKK or allampapir.
 */
export async function assertPublishedTree(root: string): Promise<MarketTreeState> {
  const tree = await loadMarketTree(root)
  validateMarketTree(tree)
  return tree
}

function validateManifest(manifest: ManifestFile): void {
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidateError(`manifest.schemaVersion must be ${SCHEMA_VERSION}`)
  }
  for (const family of REQUIRED_FAMILIES) {
    if (!manifest.families.includes(family)) {
      throw new ValidateError(`manifest missing required family ${family}`)
    }
  }
  for (const family of manifest.families) {
    if (!manifest.paths[family as FamilyCode]) {
      throw new ValidateError(`manifest.paths missing ${family}`)
    }
  }
}
