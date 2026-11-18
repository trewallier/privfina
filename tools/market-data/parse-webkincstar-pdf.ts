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
  /** Display / PDF instrument label (e.g. `D261223`, `2036/I1`, `2031/M6`). */
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
/** MAK / PEMÁK / FixMÁP-style `yyyy/…` including `_EUR` / `_BABA` suffixes. */
const SLASH_NAME_RE =
  /^(\d{4}\/[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű0-9_]+)\b/u
/** MÁP Plusz nyomdai `N2026/46` and 1MÁP `K2024/23`. */
const LETTER_YEAR_SLASH_RE =
  /^([NK]\d{4}\/[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű0-9_]+)\b/u
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
 * Route instrument names to published families.
 * Dedicated §6n reports prefer report→family; MAK uses ÁKK-style letter suffixes.
 */
export function familyFromWebkincstarInstrumentName(
  name: string,
  reportName: WebkincstarReportName
): FamilyCode | null {
  if (reportName === '_20631_arfolyam_dkj' || /^D\d{6}$/i.test(name)) {
    return 'dkj'
  }
  if (reportName === '_207461_arfolyam_mapp') return 'mapp'
  if (reportName === '_20638_arfolyam_pemak') return 'emap'
  if (reportName === '_20642_arfolyam_start') return 'baba'
  if (reportName === '_20632_arfolyam_kkj') return 'omap'

  const slash = name.indexOf('/')
  if (slash === -1) return null
  const suffix = name.slice(slash + 1).toUpperCase()
  if (!suffix) return null
  if (/^Q\d*$/.test(suffix)) return 'fixmap'
  if (/^I\d*$/.test(suffix)) return 'pmap'
  if (/^[NR]\d*$/.test(suffix)) return 'bmap'
  if (/^M\d*$/.test(suffix)) return 'mapp'
  if (/_EUR$/.test(suffix) || /^[UXY]\d*_EUR$/.test(suffix)) return 'emap'
  if (/_BABA$/.test(suffix) || /^S\d*_BABA$/.test(suffix)) return 'baba'
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

function lastMaturityOnLine(line: string): string | null {
  const dates = [...line.matchAll(/(\d{4}[.\-/]\d{2}[.\-/]\d{2})/g)].map((m) => m[1])
  return dates.length > 0 ? parseHuMaturity(dates[dates.length - 1]) : null
}

function matchInstrumentName(
  trimmed: string
): { name: string; matchLen: number } | null {
  const dkj = DKJ_NAME_RE.exec(trimmed)
  if (dkj) return { name: dkj[1], matchLen: dkj[0].length }
  const letter = LETTER_YEAR_SLASH_RE.exec(trimmed)
  if (letter) return { name: letter[1], matchLen: letter[0].length }
  const slash = SLASH_NAME_RE.exec(trimmed)
  if (slash) return { name: slash[1], matchLen: slash[0].length }
  return null
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
  const maturity = lastMaturityOnLine(trimmed)
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

/**
 * Shared nettó / AI / bruttó / EHM / ISMA × vételi+eladási layout
 * (MAK, MAPP, PEMÁK).
 */
function parseDualSideMakStyleLine(
  line: string,
  reportName: WebkincstarReportName
): WebkincstarParsedRow | null {
  const trimmed = line.trim()
  const matched = matchInstrumentName(trimmed)
  if (!matched) return null
  // Skip disclaimer / narrative lines that mention a series-like token mid-sentence.
  if (
    !/^\d{4}\//.test(trimmed) &&
    !/^N\d{4}\//.test(trimmed) &&
    !/^K\d{4}\//.test(trimmed)
  ) {
    return null
  }
  const { name, matchLen } = matched
  const rest = trimmed.slice(matchLen)
  const tokens = extractPctTokens(rest)
  // Vételi nettó, felhalmozott, vételi bruttó, vételi EHM, vételi ISMA,
  // eladási nettó, felhalmozott, eladási bruttó, eladási EHM, eladási ISMA
  const bid = parseNumericToken(tokens[0] ?? '')
  const ai = parseNumericToken(tokens[1] ?? '')
  const by = parseNumericToken(tokens[3] ?? '')
  const ask = parseNumericToken(tokens[5] ?? '')
  const ay = parseNumericToken(tokens[8] ?? '')
  const maturity = lastMaturityOnLine(trimmed)
  const family = familyFromWebkincstarInstrumentName(name, reportName)
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
 * Babakötvény Start table: vételi nettó/bruttó/EHM/ISMA then
 * eladási nettó / felhalmozott / bruttó / EHM / ISMA (no vételi AI column).
 */
function parseStartLine(line: string): WebkincstarParsedRow | null {
  const trimmed = line.trim()
  const matched = matchInstrumentName(trimmed)
  if (!matched) return null
  if (!/^\d{4}\//.test(trimmed)) return null
  const { name, matchLen } = matched
  const tokens = extractPctTokens(trimmed.slice(matchLen))
  const bid = parseNumericToken(tokens[0] ?? '')
  const ask = parseNumericToken(tokens[4] ?? '')
  const ai = parseNumericToken(tokens[5] ?? '')
  return {
    name,
    id: toSeriesId(name),
    family: 'baba',
    bid,
    ask,
    by: null,
    ay: null,
    ai,
    maturity: lastMaturityOnLine(trimmed)
  }
}

/**
 * 1MÁP / KKJ: vételi-only (nettó, AI, bruttó, EHM, …) — never invent ask.
 */
function parseKkjLine(line: string): WebkincstarParsedRow | null {
  const trimmed = line.trim()
  const matched = matchInstrumentName(trimmed)
  if (!matched) return null
  if (!/^K\d{4}\//.test(trimmed)) return null
  const { name, matchLen } = matched
  const tokens = extractPctTokens(trimmed.slice(matchLen))
  const bid = parseNumericToken(tokens[0] ?? '')
  const ai = parseNumericToken(tokens[1] ?? '')
  const by = parseNumericToken(tokens[3] ?? '')
  return {
    name,
    id: toSeriesId(name),
    family: 'omap',
    bid,
    ask: null,
    by,
    ay: null,
    ai,
    maturity: lastMaturityOnLine(trimmed)
  }
}

function parseLine(
  reportName: WebkincstarReportName,
  line: string
): WebkincstarParsedRow | null {
  switch (reportName) {
    case '_20631_arfolyam_dkj':
      return parseDkjLine(line)
    case '_20642_arfolyam_start':
      return parseStartLine(line)
    case '_20632_arfolyam_kkj':
      return parseKkjLine(line)
    case '_20633_arfolyam_mak':
    case '_207461_arfolyam_mapp':
    case '_20638_arfolyam_pemak':
      return parseDualSideMakStyleLine(line, reportName)
    default: {
      const _exhaustive: never = reportName
      return _exhaustive
    }
  }
}

/**
 * Pure text-layer parser for WebKincstár daily price PDFs (ADR 0039 / 0042).
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
    const parsed = parseLine(reportName, line)
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
