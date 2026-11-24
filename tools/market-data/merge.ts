import { assertSeriesId } from './ids.ts'
import {
  digestBubor,
  digestCanonical,
  digestInflation,
  digestOfferingArchive,
  digestPriceCalendar,
  digestRetailInterest,
  digestSettlementCalendar
} from './digests.ts'
import { mergeBuborFile } from './merge-bubor.ts'
import { mergeInflationFile } from './merge-inflation.ts'
import { applySeriesSaleWindows } from './merge-offerings.ts'
import { mergePriceCalendarFile } from './merge-price-calendar.ts'
import { mergeSettlementCalendarFile } from './merge-settlement-calendar.ts'
import { joinRetailInterestToCoupons } from './normalize-retail-interest.ts'
import {
  BUBOR_REF_PATH,
  COUPON_COLS,
  FAMILIES,
  INFLATION_REF_PATH,
  OFFERING_ARCHIVE_REF_PATH,
  PRICE_CALENDAR_REF_PATH,
  QUOTE_COLS,
  REQUIRED_FAMILIES,
  SCHEMA_VERSION,
  SERIES_IDENTITY_SOURCE_AKK,
  SERIES_IDENTITY_SOURCE_WEBKINCSTAR,
  SETTLEMENT_CALENDAR_REF_PATH,
  type BuborFile,
  type CouponsFile,
  type CouponRow,
  type FamilyCode,
  type InflationFile,
  type LatestFile,
  type LatestQuote,
  type ManifestFile,
  type NormalizedSnapshot,
  type OfferingArchiveFile,
  type OfferingFile,
  type PriceCalendarFile,
  type QuotesFile,
  type QuoteRow,
  type RetailInterestFile,
  type SaleWindow,
  type SeriesFile,
  type SeriesRecord,
  type SeriesStatus,
  type SettlementCalendarFile
} from './types.ts'

export class MergeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MergeError'
  }
}

export interface FamilyTreeState {
  series: SeriesFile
  latest: LatestFile
  quotes: Record<string, QuotesFile>
  /** Per-series coupon schedules (`families/{fam}/coupons/<id>.json`). */
  coupons: Record<string, CouponsFile>
  /** Per-series public-offering transcriptions (`families/{fam}/offerings/<id>.json`). */
  offerings: Record<string, OfferingFile>
}

export interface MarketTreeState {
  manifest: ManifestFile | null
  families: Record<FamilyCode, FamilyTreeState>
  /**
   * Optional internal intermediate only (ADR 0038). Used for same-process content
   * compare; never published under refs/.
   */
  retailInterest: RetailInterestFile | null
  /** KSH CPI Összesen refs (ADR 0037); null when never ingested. */
  inflation: InflationFile | null
  /** MNB BUBOR fixings (ADR 0045); null when never ingested. */
  bubor: BuborFile | null
  /** MNB HU-VIBER settlement calendar (ADR 0046); null when never ingested. */
  settlementCalendar: SettlementCalendarFile | null
  /** WebKincstár priced / no_price / fetch_failed calendar (ADR 0039). */
  priceCalendar: PriceCalendarFile | null
  /** ÁKK public-offering document ledger (ADR 0041). */
  offeringArchive: OfferingArchiveFile | null
}

export interface MergeResult {
  tree: MarketTreeState
  changed: boolean
  asOf: string | null
  appendedRows: number
  skippedDuplicates: number
  /** Same-day rows replaced when `allowSameDayRewrite` (dual-source cutover). */
  rewrittenRows: number
  /** Inflation month/year rows appended this merge. */
  inflationAppendedRows: number
  /** BUBOR tenor×date rows appended this merge. */
  buborAppendedRows: number
  /** Settlement-calendar years replaced or appended this merge. */
  settlementCalendarTouchedYears: number
  /** Price-calendar days appended this merge. */
  priceCalendarAppendedDays: number
}

function emptyLatest(): LatestFile {
  return { schemaVersion: SCHEMA_VERSION, asOf: null, quotes: {} }
}

function emptySeries(family: FamilyCode): SeriesFile {
  return { schemaVersion: SCHEMA_VERSION, family, series: [] }
}

function emptyQuotes(family: FamilyCode, id: string): QuotesFile {
  assertSeriesId(id)
  return { schemaVersion: SCHEMA_VERSION, id, family, cols: QUOTE_COLS, rows: [] }
}

function emptyCoupons(family: FamilyCode, id: string): CouponsFile {
  assertSeriesId(id)
  return { schemaVersion: SCHEMA_VERSION, id, family, cols: COUPON_COLS, rows: [] }
}

export function emptyMarketTree(): MarketTreeState {
  const families = {} as Record<FamilyCode, FamilyTreeState>
  for (const family of FAMILIES) {
    families[family] = {
      series: emptySeries(family),
      latest: emptyLatest(),
      quotes: {},
      coupons: {},
      offerings: {}
    }
  }
  return {
    manifest: null,
    families,
    retailInterest: null,
    inflation: null,
    bubor: null,
    settlementCalendar: null,
    priceCalendar: null,
    offeringArchive: null
  }
}

function quoteRowsEqual(a: QuoteRow, b: QuoteRow): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
}

function toLatestQuote(row: QuoteRow): LatestQuote {
  return { d: row[0], bid: row[1], ask: row[2], by: row[3], ay: row[4], ai: row[5] }
}

/**
 * Status precedence: calendar maturity vs asOf wins over "quoted in this snapshot".
 * Historical WebKincstár backfill rewrites past settle dates into the merge payload;
 * those must not resurrect a series whose mat is already before asOf (ADR 0034).
 * "Quoted" means a live settle on asOf (see mergeSnapshot), not any historical row.
 * Strict `mat < asOf` (not `<=`): maturity-day settles may still mark active —
 * same predicate as normalize.ts / normalize-allampapir.ts / normalize-webkincstar.ts.
 */
function resolveStatus(
  rec: SeriesRecord,
  quoted: boolean,
  asOf: string | null
): SeriesStatus {
  if (asOf && rec.mat && rec.mat < asOf) return 'matured'
  if (quoted) return 'active'
  return 'delisted'
}

function effectiveIdentitySource(
  s: SeriesRecord
): typeof SERIES_IDENTITY_SOURCE_AKK | typeof SERIES_IDENTITY_SOURCE_WEBKINCSTAR {
  return s.identitySource ?? SERIES_IDENTITY_SOURCE_AKK
}

/**
 * Identity-aware series upsert (ADR 0048):
 * - ÁKK host (omit / www.akk.hu) never downgrades to WebKincstár host.
 * - ÁKK over WK-origin promotes to www.akk.hu; ÁKK non-null fields win,
 *   WK non-null fills only where ÁKK left null/undefined.
 */
function mergeSeriesIdentity(prev: SeriesRecord, incoming: SeriesRecord): SeriesRecord {
  const prevSrc = effectiveIdentitySource(prev)
  const inSrc = effectiveIdentitySource(incoming)
  if (prevSrc === SERIES_IDENTITY_SOURCE_AKK && inSrc === SERIES_IDENTITY_SOURCE_WEBKINCSTAR) {
    return {
      ...prev,
      identitySource: prev.identitySource ?? SERIES_IDENTITY_SOURCE_AKK
    }
  }
  if (prevSrc === SERIES_IDENTITY_SOURCE_WEBKINCSTAR && inSrc === SERIES_IDENTITY_SOURCE_AKK) {
    const merged: SeriesRecord = {
      ...prev,
      ...incoming,
      identitySource: SERIES_IDENTITY_SOURCE_AKK
    }
    const keys = [
      'isin',
      'name',
      'issue',
      'mat',
      'ccy',
      'face',
      'iType',
      'dayCount',
      'offered',
      'saleWindow',
      'ref',
      'periodMonths'
    ] as const
    for (const key of keys) {
      const incomingVal = incoming[key]
      const prevVal = prev[key]
      if (
        (incomingVal === null || incomingVal === undefined) &&
        prevVal !== null &&
        prevVal !== undefined
      ) {
        ;(merged as Record<string, unknown>)[key] = prevVal
      }
    }
    return merged
  }
  return { ...prev, ...incoming }
}

/**
 * Accumulate series: keep every known id (esp. those with quote history), upsert fields,
 * set status from maturity vs asOf, else whether the id has a live (asOf) quote.
 */
export function accumulateSeries(
  previous: SeriesRecord[],
  incoming: SeriesRecord[],
  quotedIds: Set<string>,
  quoteIdsWithHistory: Set<string>,
  asOf: string | null
): SeriesRecord[] {
  const byId = new Map<string, SeriesRecord>()
  for (const s of previous) {
    assertSeriesId(s.id)
    byId.set(s.id, { ...s })
  }
  for (const s of incoming) {
    assertSeriesId(s.id)
    const prev = byId.get(s.id)
    byId.set(s.id, prev ? mergeSeriesIdentity(prev, s) : { ...s })
  }
  for (const id of quoteIdsWithHistory) {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        isin: null,
        name: id,
        issue: null,
        mat: null,
        ccy: null,
        status: 'delisted'
      })
    }
  }
  for (const [id, rec] of byId) {
    rec.status = resolveStatus(rec, quotedIds.has(id), asOf)
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function rebuildLatest(quotes: Record<string, QuotesFile>): LatestFile {
  const latest: LatestFile = emptyLatest()
  let maxD: string | null = null
  for (const [id, file] of Object.entries(quotes)) {
    if (file.rows.length === 0) continue
    let best = file.rows[0]
    for (const row of file.rows) {
      if (row[0] >= best[0]) best = row
    }
    latest.quotes[id] = toLatestQuote(best)
    if (!maxD || best[0] > maxD) maxD = best[0]
  }
  latest.asOf = maxD
  return latest
}

/** Required families always published; optional only when they have series, quotes, or coupons. */
export function publishedFamilies(tree: MarketTreeState): FamilyCode[] {
  const out: FamilyCode[] = []
  for (const family of FAMILIES) {
    const fam = tree.families[family]
    const required = (REQUIRED_FAMILIES as readonly string[]).includes(family)
    const hasContent =
      fam.series.series.length > 0 ||
      Object.keys(fam.quotes).length > 0 ||
      Object.keys(fam.coupons).length > 0 ||
      Object.keys(fam.offerings).length > 0 ||
      Object.keys(fam.latest.quotes).length > 0
    if (required || hasContent) out.push(family)
  }
  return out
}

function buildManifest(tree: MarketTreeState, asOf: string | null, generatedAt: string): ManifestFile {
  const digests: Record<string, string> = {}
  const paths = {} as ManifestFile['paths']
  const families = publishedFamilies(tree)
  for (const family of families) {
    const fam = tree.families[family]
    paths[family] = {
      series: `families/${family}/series.json`,
      latest: `families/${family}/latest.json`
    }
    digests[`families/${family}/series.json`] = digestCanonical(fam.series)
    digests[`families/${family}/latest.json`] = digestCanonical(fam.latest)
    for (const [id, q] of Object.entries(fam.quotes)) {
      digests[`families/${family}/quotes/${id}.json`] = digestCanonical(q)
    }
    for (const [id, c] of Object.entries(fam.coupons)) {
      digests[`families/${family}/coupons/${id}.json`] = digestCanonical(c)
    }
    for (const [id, o] of Object.entries(fam.offerings)) {
      digests[`families/${family}/offerings/${id}.json`] = digestCanonical(o)
    }
  }
  const refs: ManifestFile['refs'] = {}
  if (tree.inflation) {
    refs.inflation = INFLATION_REF_PATH
    digests[INFLATION_REF_PATH] = digestInflation(tree.inflation)
  }
  if (tree.bubor) {
    refs.bubor = BUBOR_REF_PATH
    digests[BUBOR_REF_PATH] = digestBubor(tree.bubor)
  }
  if (tree.settlementCalendar) {
    refs.settlementCalendar = SETTLEMENT_CALENDAR_REF_PATH
    digests[SETTLEMENT_CALENDAR_REF_PATH] = digestSettlementCalendar(tree.settlementCalendar)
  }
  if (tree.priceCalendar) {
    refs.priceCalendar = PRICE_CALENDAR_REF_PATH
    digests[PRICE_CALENDAR_REF_PATH] = digestPriceCalendar(tree.priceCalendar)
  }
  if (tree.offeringArchive) {
    refs.offeringArchive = OFFERING_ARCHIVE_REF_PATH
    digests[OFFERING_ARCHIVE_REF_PATH] = digestOfferingArchive(tree.offeringArchive)
  }
  const manifest: ManifestFile = {
    schemaVersion: SCHEMA_VERSION,
    asOf,
    generatedAt,
    families,
    paths,
    digests
  }
  if (Object.keys(refs).length > 0) {
    manifest.refs = refs
  }
  return manifest
}

function digestsEqual(a: ManifestFile | null, b: ManifestFile): boolean {
  if (!a) return false
  const keys = new Set([...Object.keys(a.digests), ...Object.keys(b.digests)])
  for (const k of keys) {
    if (a.digests[k] !== b.digests[k]) return false
  }
  return true
}

function cloneCouponsFile(c: CouponsFile): CouponsFile {
  return {
    schemaVersion: c.schemaVersion,
    id: c.id,
    family: c.family,
    cols: COUPON_COLS,
    rows: c.rows.map((r) => [...r] as CouponRow)
  }
}

function applyRetailInterestJoin(
  tree: MarketTreeState,
  retail: RetailInterestFile | null
): void {
  const seriesByFamily: Partial<Record<FamilyCode, SeriesRecord[]>> = {}
  for (const family of FAMILIES) {
    seriesByFamily[family] = tree.families[family].series.series
  }
  const joined = joinRetailInterestToCoupons(retail, seriesByFamily)

  for (const family of FAMILIES) {
    const fam = tree.families[family]
    const fromJoin = joined.couponsByFamily[family] ?? {}
    const next: Record<string, CouponsFile> = {}
    for (const [id, file] of Object.entries(fromJoin)) {
      next[id] = cloneCouponsFile(file)
    }
    fam.coupons = next

    fam.series = {
      schemaVersion: SCHEMA_VERSION,
      family,
      series: fam.series.series.map((s) => {
        const copy = { ...s }
        if (s.id in joined.offeredById) {
          copy.offered = joined.offeredById[s.id]
        } else {
          delete copy.offered
        }
        return copy
      })
    }
  }
}

/**
 * Merge a normalized snapshot into an existing market tree (append-first).
 * Same (id, settleDate) + identical values → skip; same date + different values → fail
 * unless `allowSameDayRewrite` (dual-source combined snapshot / ÁKK-only → treasury cutover).
 * series.json accumulates; statuses mark active / matured / delisted.
 */
export function mergeSnapshot(
  previous: MarketTreeState,
  snapshot: NormalizedSnapshot,
  options?: {
    generatedAt?: string
    allowSameDayRewrite?: boolean
    /**
     * When provided (including empty rows), join onto series → replace coupons per id and
     * set series.offered. Intermediate only — not published as refs/retail-interest.json.
     * When omitted, keep previous coupons / offered / internal retailInterest.
     */
    retailInterest?: RetailInterestFile | null
    /**
     * When provided, append-first merge into inflation refs (historical conflicts fail).
     * When omitted, keep previous inflation.
     */
    inflation?: InflationFile | null
    /**
     * When provided, append-first merge into BUBOR refs (historical conflicts fail).
     * When omitted, keep previous bubor.
     */
    bubor?: BuborFile | null
    /**
     * When provided, year-replace merge into settlement-calendar refs (ADR 0046).
     * When omitted, keep previous settlement calendar.
     */
    settlementCalendar?: SettlementCalendarFile | null
    /**
     * When provided, append-first merge into price-calendar refs (ADR 0039).
     * When omitted, keep previous price calendar.
     */
    priceCalendar?: PriceCalendarFile | null
    /**
     * When provided, replace offerings maps per family (ADR 0041).
     * When omitted, keep previous offerings.
     */
    offeringsByFamily?: Partial<Record<FamilyCode, Record<string, OfferingFile>>>
    /**
     * When provided, replace offering-archive refs (ADR 0041).
     * When omitted, keep previous archive.
     */
    offeringArchive?: OfferingArchiveFile | null
    /**
     * Series-adjacent saleWindow patches from offering listings (ADR 0041).
     */
    seriesSaleWindows?: Array<{ family: FamilyCode; seriesId: string; saleWindow: SaleWindow }>
    /**
     * Upsert per-series coupon files after retailInterest join (ADR 0044 MÁK FIX
     * transcription). Does not clear other ids. When omitted, keep coupons as-is.
     */
    couponUpsertsByFamily?: Partial<Record<FamilyCode, Record<string, CouponsFile>>>
  }
): MergeResult {
  const tree: MarketTreeState = {
    manifest: previous.manifest,
    families: {} as Record<FamilyCode, FamilyTreeState>,
    retailInterest: previous.retailInterest
      ? {
          schemaVersion: previous.retailInterest.schemaVersion,
          asOf: previous.retailInterest.asOf,
          generatedAt: previous.retailInterest.generatedAt,
          rows: previous.retailInterest.rows.map((r) => ({
            ...r,
            rates: [...r.rates]
          }))
        }
      : null,
    inflation: previous.inflation ? structuredClone(previous.inflation) : null,
    bubor: previous.bubor ? structuredClone(previous.bubor) : null,
    settlementCalendar: previous.settlementCalendar
      ? structuredClone(previous.settlementCalendar)
      : null,
    priceCalendar: previous.priceCalendar
      ? structuredClone(previous.priceCalendar)
      : null,
    offeringArchive: previous.offeringArchive
      ? structuredClone(previous.offeringArchive)
      : null
  }
  for (const family of FAMILIES) {
    tree.families[family] = cloneFamily(previous.families[family])
  }

  let appendedRows = 0
  let skippedDuplicates = 0
  let rewrittenRows = 0
  let inflationAppendedRows = 0
  let buborAppendedRows = 0
  let settlementCalendarTouchedYears = 0
  let priceCalendarAppendedDays = 0
  const allowSameDayRewrite = options?.allowSameDayRewrite === true
  const asOf = snapshot.asOf

  for (const family of FAMILIES) {
    const fam = tree.families[family]
    const incoming = snapshot.byFamily[family] ?? { series: [], quotes: [] }
    // Live quote set for status: settle on asOf only. Multi-day WebKincstár
    // overlays accumulate older rows in the same snapshot; those must not flip
    // matured/delisted series back to active.
    const quotedIds = new Set(
      incoming.quotes
        .filter((q) => asOf == null || q.row[0] === asOf)
        .map((q) => q.id)
    )

    for (const q of incoming.quotes) {
      assertSeriesId(q.id)
      let file = fam.quotes[q.id]
      if (!file) {
        file = emptyQuotes(family, q.id)
        fam.quotes[q.id] = file
      }
      const existingIdx = file.rows.findIndex((r) => r[0] === q.row[0])
      if (existingIdx >= 0) {
        const existing = file.rows[existingIdx]
        if (quoteRowsEqual(existing, q.row)) {
          skippedDuplicates += 1
          continue
        }
        if (allowSameDayRewrite) {
          file.rows[existingIdx] = [...q.row] as QuoteRow
          rewrittenRows += 1
          continue
        }
        throw new MergeError(
          `Same-day quote conflict for ${family}/${q.id} on ${q.row[0]}: kept ${JSON.stringify(existing)}, got ${JSON.stringify(q.row)}`
        )
      }
      file.rows.push([...q.row] as QuoteRow)
      file.rows.sort((a, b) => a[0].localeCompare(b[0]))
      appendedRows += 1
    }

    fam.series = {
      schemaVersion: SCHEMA_VERSION,
      family,
      series: accumulateSeries(
        fam.series.series,
        incoming.series,
        quotedIds,
        new Set(Object.keys(fam.quotes)),
        asOf
      )
    }

    fam.latest = rebuildLatest(fam.quotes)
  }

  if (options && 'retailInterest' in options) {
    const incoming = options.retailInterest
    if (
      incoming &&
      previous.retailInterest &&
      digestRetailInterest(incoming) === digestRetailInterest(previous.retailInterest)
    ) {
      // Content unchanged: keep previous generatedAt + coupons/offered already cloned.
      tree.retailInterest = {
        schemaVersion: previous.retailInterest.schemaVersion,
        asOf: previous.retailInterest.asOf,
        generatedAt: previous.retailInterest.generatedAt,
        rows: previous.retailInterest.rows.map((r) => ({
          ...r,
          rates: [...r.rates]
        }))
      }
    } else {
      tree.retailInterest = incoming
        ? {
            schemaVersion: incoming.schemaVersion,
            asOf: incoming.asOf,
            generatedAt: incoming.generatedAt,
            rows: incoming.rows.map((r) => ({
              ...r,
              rates: [...r.rates]
            }))
          }
        : null
      applyRetailInterestJoin(tree, tree.retailInterest)
    }
  }

  if (options && 'inflation' in options) {
    const incoming = options.inflation
    if (incoming) {
      const mergedInf = mergeInflationFile(previous.inflation, incoming)
      tree.inflation = mergedInf.file
      inflationAppendedRows = mergedInf.appendedRows
      skippedDuplicates += mergedInf.skippedDuplicates
    } else {
      tree.inflation = null
    }
  }

  if (options && 'bubor' in options) {
    const incoming = options.bubor
    if (incoming) {
      const mergedBubor = mergeBuborFile(previous.bubor, incoming)
      tree.bubor = mergedBubor.file
      buborAppendedRows = mergedBubor.appendedRows
      skippedDuplicates += mergedBubor.skippedDuplicates
    } else {
      tree.bubor = null
    }
  }

  if (options && 'settlementCalendar' in options) {
    const incoming = options.settlementCalendar
    if (incoming) {
      const mergedCal = mergeSettlementCalendarFile(previous.settlementCalendar, incoming)
      tree.settlementCalendar = mergedCal.file
      settlementCalendarTouchedYears =
        mergedCal.replacedYears.length + mergedCal.appendedYears.length
    } else {
      tree.settlementCalendar = null
    }
  }

  if (options && 'priceCalendar' in options) {
    const incoming = options.priceCalendar
    if (incoming) {
      const mergedCal = mergePriceCalendarFile(previous.priceCalendar, incoming)
      tree.priceCalendar = mergedCal.file
      priceCalendarAppendedDays = mergedCal.appendedDays
      skippedDuplicates += mergedCal.skippedDuplicates
    } else {
      tree.priceCalendar = null
    }
  }

  if (options && 'offeringsByFamily' in options) {
    const incoming = options.offeringsByFamily
    if (incoming) {
      for (const family of FAMILIES) {
        const map = incoming[family]
        if (map) {
          tree.families[family].offerings = Object.fromEntries(
            Object.entries(map).map(([id, o]) => [id, structuredClone(o)])
          )
        }
      }
    }
  }

  if (options && 'offeringArchive' in options) {
    tree.offeringArchive = options.offeringArchive
      ? structuredClone(options.offeringArchive)
      : null
  }

  if (options?.seriesSaleWindows && options.seriesSaleWindows.length > 0) {
    const byFamily = new Map<FamilyCode, Array<{ seriesId: string; saleWindow: SaleWindow }>>()
    for (const patch of options.seriesSaleWindows) {
      const list = byFamily.get(patch.family) ?? []
      list.push({ seriesId: patch.seriesId, saleWindow: patch.saleWindow })
      byFamily.set(patch.family, list)
    }
    for (const [family, patches] of byFamily) {
      const fam = tree.families[family]
      const applied = applySeriesSaleWindows(fam.series.series, patches)
      fam.series = {
        schemaVersion: SCHEMA_VERSION,
        family,
        series: applied.series
      }
    }
  }

  if (options?.couponUpsertsByFamily) {
    for (const family of FAMILIES) {
      const upserts = options.couponUpsertsByFamily[family]
      if (!upserts) continue
      const fam = tree.families[family]
      const seriesIds = new Set(fam.series.series.map((s) => s.id))
      for (const [id, file] of Object.entries(upserts)) {
        // Coupons must join an existing series row (same gate as retailInterest).
        if (!seriesIds.has(id)) continue
        fam.coupons[id] = cloneCouponsFile(file)
      }
    }
  }

  const generatedAt = options?.generatedAt ?? new Date().toISOString()
  const manifest = buildManifest(tree, asOf, generatedAt)
  const changed = !digestsEqual(previous.manifest, manifest)
  tree.manifest = manifest

  return {
    tree,
    changed,
    asOf,
    appendedRows,
    skippedDuplicates,
    rewrittenRows,
    inflationAppendedRows,
    buborAppendedRows,
    settlementCalendarTouchedYears,
    priceCalendarAppendedDays
  }
}

function cloneFamily(fam: FamilyTreeState): FamilyTreeState {
  return {
    series: {
      schemaVersion: fam.series.schemaVersion,
      family: fam.series.family,
      series: fam.series.series.map((s) => ({ ...s }))
    },
    latest: {
      schemaVersion: fam.latest.schemaVersion,
      asOf: fam.latest.asOf,
      quotes: Object.fromEntries(
        Object.entries(fam.latest.quotes).map(([k, v]) => [k, { ...v }])
      )
    },
    quotes: Object.fromEntries(
      Object.entries(fam.quotes).map(([id, q]) => [
        id,
        {
          schemaVersion: q.schemaVersion,
          id: q.id,
          family: q.family,
          cols: QUOTE_COLS,
          rows: q.rows.map((r) => [...r] as QuoteRow)
        }
      ])
    ),
    coupons: Object.fromEntries(
      Object.entries(fam.coupons).map(([id, c]) => [id, cloneCouponsFile(c)])
    ),
    offerings: Object.fromEntries(
      Object.entries(fam.offerings ?? {}).map(([id, o]) => [id, structuredClone(o)])
    )
  }
}

/** @internal test helper — empty coupons file factory */
export { emptyCoupons }
