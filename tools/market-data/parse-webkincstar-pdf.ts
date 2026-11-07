import type { FamilyCode, QuoteRow } from './types.ts'
import { toSeriesId } from './ids.ts'
import {
  isWebkincstarReportName,
  type WebkincstarReportName
} from './webkincstar-reports.ts'

export class WebkincstarParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebkincstarParseError'
  }
}

/** One parsed instrument row from a WebKincstár daily price table. */
export interface WebkincstarParsedRow {
  /** Display / PDF instrument label (e.g. `D261223`, `2036/I1`). */
  name: string
  /** Canonical id from `toSeriesId(name)`. */
  id: string
  /** Best-effort family from report + name heuristics (null when unknown). */
  family: FamilyCode | null
  /** Quote tuple without date — caller stamps settleDate from Értéknap. */
  bid: number | null
  ask: number | null
  by: number | null
  ay: number | null
  ai: number | null
  /** Maturity ISO date when the table prints one. */
  maturity: string | null
}

export interface WebkincstarParseResult {
  reportName: WebkincstarReportName
  /** ISO settle date from header `Értéknap`. */
  erteknap: string
  /** `priced` when ≥1 data row; `no_price` when header ok but empty table. */
  status: 'priced' | 'no_price'
  rows: WebkincstarParsedRow[]
}

const ERTEKNAP_RE = /Értéknap:\s*(\d{4})[.\-/](\d{2})[.\-/](\d{2})/u
const DKJ_NAME_RE = /^(D\d{6})\b/
const MAK_NAME_RE = /^(\d{4}\/[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű0-9]+)\b/u
const PCT_TOKEN_RE = /(-|\u2013|Vált\.?|\d{1,3}(?:[.,]\d+)?\s*%)/giu

function huDateToIso(y: string, m: string, d: string): string {
  return `${y}-${m}-${d}`
}

/** Parse `Értéknap: YYYY.MM.DD` (also accepts - / separators). */
export function parseErteknap(text: string): string | null {
  const m = ERTEKNAP_RE.exec(text)
  if (!m) return null
  return huDateToIso(m[1], m[2], m[3])
}

/**
 * Route MAK table instrument names to published families.
 * PDF sections are not product-typed; use ÁKK-style letter suffixes.
 */
export function familyFromWebkincstarInstrumentName(
  name: string,
  reportName: WebkincstarReportName
): FamilyCode | null {
  if (reportName === '_20631_arfolyam_dkj' || /^D\d{6}$/i.test(name)) {
    return 'dkj'
  }
  const slash = name.indexOf('/')
  if (slash === -1) return null
  const suffix = name.slice(slash + 1).toUpperCase()
  if (!suffix) return null
  if (/^Q\d*$/.test(suffix)) return 'fixmap'
  if (/^I\d*$/.test(suffix)) return 'pmap'
  if (/^[NR]\d*$/.test(suffix)) return 'bmap'
  // Conventional fixed KTV letters (A–H, …) and other unclassified MÁK rows.
  if (/^[A-Z]\d*$/.test(suffix)) return 'ktv'
  return null
}

function parseNumericToken(raw: string): number | null {
  const t = raw.trim()
  if (!t || t === '-' || t === '\u2013') return null
  if (/^Vált\.?$/i.test(t)) return null
  const cleaned = t.replace(/%/g, '').replace(/\s+/g, '').replace(',', '.')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Collect %-like / dash / Vált. tokens from a data line after the instrument name. */
function extractPctTokens(rest: string): string[] {
  const tokens: string[] = []
  const re = new RegExp(PCT_TOKEN_RE.source, PCT_TOKEN_RE.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(rest)) !== null) {
    tokens.push(m[1].trim())
  }
  return tokens
}

function parseHuMaturity(raw: string): string | null {
  const m = /(\d{4})[.\-/](\d{2})[.\-/](\d{2})/.exec(raw.trim())
  if (!m) return null
  return huDateToIso(m[1], m[2], m[3])
}

function parseDkjLine(line: string): WebkincstarParsedRow | null {
  const trimmed = line.trim()
  const nameMatch = DKJ_NAME_RE.exec(trimmed)
  if (!nameMatch) return null
  const name = nameMatch[1]
  const rest = trimmed.slice(nameMatch[0].length)
  const tokens = extractPctTokens(rest)
  // Vételi: árfolyam EHM ISMA; Eladási: árfolyam EHM ISMA
  const bid = parseNumericToken(tokens[0] ?? '')
  const by = parseNumericToken(tokens[1] ?? '')
  // skip ISMA vételi (tokens[2])
  const ask = parseNumericToken(tokens[3] ?? '')
  const ay = parseNumericToken(tokens[4] ?? '')
  // maturity is last YYYY.MM.DD on the line
  const matMatch = /(\d{4}[.\-/]\d{2}[.\-/]\d{2})\s*$/.exec(trimmed)
  const maturity = matMatch ? parseHuMaturity(matMatch[1]) : null
  return {
    name,
    id: toSeriesId(name),
    family: 'dkj',
    bid,
    ask,
    by,
    ay,
    ai: null,
    maturity
  }
}

function parseMakLine(line: string): WebkincstarParsedRow | null {
  const trimmed = line.trim()
  const nameMatch = MAK_NAME_RE.exec(trimmed)
  if (!nameMatch) return null
  const name = nameMatch[1]
  // Skip disclaimer / narrative lines that happen to mention a series-like token mid-sentence.
  if (!/^\d{4}\//.test(trimmed)) return null
  const rest = trimmed.slice(nameMatch[0].length)
  const tokens = extractPctTokens(rest)
  // Vételi nettó, felhalmozott, vételi bruttó, vételi EHM, vételi ISMA,
  // eladási nettó, felhalmozott, eladási bruttó, eladási EHM, eladási ISMA
  const bid = parseNumericToken(tokens[0] ?? '')
  const ai = parseNumericToken(tokens[1] ?? '')
  const by = parseNumericToken(tokens[3] ?? '')
  const ask = parseNumericToken(tokens[5] ?? '')
  const ay = parseNumericToken(tokens[8] ?? '')
  // Last date on the line is maturity.
  const dates = [...trimmed.matchAll(/(\d{4}[.\-/]\d{2}[.\-/]\d{2})/g)].map((m) => m[1])
  const maturity = dates.length > 0 ? parseHuMaturity(dates[dates.length - 1]) : null
  const family = familyFromWebkincstarInstrumentName(name, '_20633_arfolyam_mak')
  return {
    name,
    id: toSeriesId(name),
    family,
    bid,
    ask,
    by,
    ay,
    ai,
    maturity
  }
}

/**
 * Pure text-layer parser for WebKincstár daily price PDFs (ADR 0039).
 * Input must be `pdftotext -layout` (or equivalent) output — not raw PDF bytes.
 */
export function parseWebkincstarPdfText(options: {
  reportName: string
  text: string
}): WebkincstarParseResult {
  const { reportName, text } = options
  if (!isWebkincstarReportName(reportName)) {
    throw new WebkincstarParseError(`Unsupported WebKincstár reportName: ${reportName}`)
  }
  const erteknap = parseErteknap(text)
  if (!erteknap) {
    throw new WebkincstarParseError(
      `Missing Értéknap header in ${reportName} PDF text`
    )
  }

  const rows: WebkincstarParsedRow[] = []
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const parsed =
      reportName === '_20631_arfolyam_dkj' ? parseDkjLine(line) : parseMakLine(line)
    if (!parsed) continue
    if (seen.has(parsed.id)) continue
    seen.add(parsed.id)
    rows.push(parsed)
  }

  return {
    reportName,
    erteknap,
    status: rows.length > 0 ? 'priced' : 'no_price',
    rows
  }
}

/** Stamp settle date onto a parsed row as a schemaVersion 2 QuoteRow. */
export function webkincstarRowToQuoteRow(
  settleDate: string,
  row: WebkincstarParsedRow
): QuoteRow {
  return [settleDate, row.bid, row.ask, row.by, row.ay, row.ai]
}

/**
 * Assert parsed Értéknap equals the requested datum (guards empty/wrong-day shells).
 */
export function assertErteknapMatchesDatum(
  erteknap: string,
  datum: string,
  reportName: string
): void {
  if (erteknap !== datum) {
    throw new WebkincstarParseError(
      `Értéknap ${erteknap} does not match requested datum ${datum} for ${reportName}`
    )
  }
}
