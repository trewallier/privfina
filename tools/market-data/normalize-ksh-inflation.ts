import {
  KSH_ARA0040_CSV_URL,
  KSH_ARA0040_PAGE_URL,
  SCHEMA_VERSION,
  type InflationFile,
  type InflationMonthRow,
  type InflationSeriesKey,
  type InflationYearRow
} from './types.ts'

/** Hungarian month name → 1–12. */
const MONTH_NAME_TO_NUM: Record<string, number> = {
  januar: 1,
  január: 1,
  februar: 2,
  február: 2,
  marcius: 3,
  március: 3,
  aprilis: 4,
  április: 4,
  majus: 5,
  május: 5,
  junius: 6,
  június: 6,
  julius: 7,
  július: 7,
  augusztus: 8,
  szeptember: 9,
  oktober: 10,
  október: 10,
  november: 11,
  december: 12
}

const SECTION_SPECS: Array<{
  key: InflationSeriesKey
  /** Match when a CSV row's first cell starts with this (after trim). */
  startsWith: string
  kshBase: string
}> = [
  {
    key: 'yoy',
    startsWith: 'Az előző év azonos időszaka = 100,0%',
    kshBase: 'Az előző év azonos időszaka = 100,0%'
  },
  {
    key: 'mom',
    startsWith: 'Előző hónap = 100,0%',
    kshBase: 'Előző hónap = 100,0%'
  },
  {
    key: 'ytdFromDec',
    startsWith: 'Előző év december = 100,0',
    kshBase: 'Előző év december = 100,0 %'
  },
  {
    key: 'ytdYoy',
    startsWith: 'Évkezdettől kumulált',
    kshBase: 'Évkezdettől kumulált, előző év azonos időszaka = 100,0%'
  }
]

export class NormalizeInflationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NormalizeInflationError'
  }
}

function decodeCsvBytes(bytes: Uint8Array): string {
  // KSH STADAT CSV is ISO-8859-2 (Latin-2) with CRLF.
  return new TextDecoder('iso-8859-2').decode(bytes)
}

function splitCsvLine(line: string): string[] {
  // Semicolon-separated; no quoted fields in this table.
  return line.split(';').map((c) => c.trim())
}

function parseHuNumber(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return n
}

function normalizeMonthToken(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .normalize('NFC')
}

function monthNumFromToken(token: string): number | null {
  const key = normalizeMonthToken(token)
  return MONTH_NAME_TO_NUM[key] ?? null
}

/**
 * Parse Időszak cell into end-month YYYY-MM.
 * - `január` → month
 * - `január–december` / `január-december` → end month of range
 *
 * KSH CSV is mostly ISO-8859-2 but uses Windows-1252 byte 0x96 for en-dash;
 * after Latin-2 decode that becomes U+0096 — treat it as a range separator too.
 */
export function parseIdoszakToMonth(period: string, year: number): string | null {
  const p = period.trim().toLowerCase().normalize('NFC')
  if (!p) return null
  // ASCII hyphen, Unicode en/em dash, or CP1252 0x96 residual after Latin-2 decode.
  const parts = p.split(/[-–—\u0096]/).map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const end = parts[parts.length - 1]
    const m = monthNumFromToken(end)
    if (m == null) return null
    return `${year}-${String(m).padStart(2, '0')}`
  }
  const m = monthNumFromToken(p)
  if (m == null) return null
  return `${year}-${String(m).padStart(2, '0')}`
}

function parseYearCell(raw: string): number | null {
  const m = /^(\d{4})\.?$/.exec(raw.trim())
  if (!m) return null
  return Number(m[1])
}

function indexOfOsszesen(headerCells: string[]): number {
  const idx = headerCells.findIndex((c) => c.trim().toLowerCase() === 'összesen')
  if (idx < 0) {
    throw new NormalizeInflationError('KSH ara0040 CSV missing Összesen column')
  }
  return idx
}

function emptySeriesBlocks(): InflationFile['series'] {
  const series = {} as InflationFile['series']
  for (const spec of SECTION_SPECS) {
    series[spec.key] = { kshBase: spec.kshBase, cols: ['ym', 'pct'], rows: [] }
  }
  return series
}

function maxYm(rows: InflationMonthRow[]): string | null {
  let best: string | null = null
  for (const [ym] of rows) {
    if (!best || ym > best) best = ym
  }
  return best
}

function deriveAnnualAverage(ytdYoy: InflationMonthRow[]): InflationYearRow[] {
  const out: InflationYearRow[] = []
  for (const [ym, pct] of ytdYoy) {
    // január–december → YYYY-12
    if (!ym.endsWith('-12')) continue
    const year = ym.slice(0, 4)
    out.push([year, pct])
  }
  out.sort((a, b) => a[0].localeCompare(b[0]))
  return out
}

/**
 * Normalize KSH ara0040 CSV bytes into published inflation refs (Összesen only).
 * Values are percent change (index − 100). Blank Összesen cells are skipped.
 */
export function normalizeKshInflationCsv(
  csvBytes: Uint8Array,
  options?: { generatedAt?: string; csvUrl?: string; pageUrl?: string }
): InflationFile {
  const text = decodeCsvBytes(csvBytes)
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 4) {
    throw new NormalizeInflationError('KSH ara0040 CSV too short')
  }

  // Line 0: title; line 1: column header (Év;Időszak;…;Összesen;…)
  const headerIdx = lines.findIndex((l) => {
    const cells = splitCsvLine(l)
    return cells[0]?.toLowerCase() === 'év' || cells.some((c) => c.toLowerCase() === 'összesen')
  })
  if (headerIdx < 0) {
    throw new NormalizeInflationError('KSH ara0040 CSV missing header row')
  }
  const osszesenIdx = indexOfOsszesen(splitCsvLine(lines[headerIdx]))

  const series = emptySeriesBlocks()
  let active: (typeof SECTION_SPECS)[number] | null = null
  let currentYear: number | null = null

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    const cells = splitCsvLine(line)
    const first = cells[0] ?? ''

    const section = SECTION_SPECS.find((s) => first.startsWith(s.startsWith))
    if (section) {
      active = section
      currentYear = null
      continue
    }
    if (!active) continue

    // Data rows: year may be in col0 (`2017.` or blank); period in col1.
    const yearCell = cells[0] ?? ''
    const periodCell = cells[1] ?? ''
    const parsedYear = parseYearCell(yearCell)
    if (parsedYear != null) currentYear = parsedYear
    if (currentYear == null) continue
    if (!periodCell) continue

    const ym = parseIdoszakToMonth(periodCell, currentYear)
    if (!ym) continue

    const indexVal = parseHuNumber(cells[osszesenIdx] ?? '')
    if (indexVal == null) continue // blank forward months

    const pct = Math.round((indexVal - 100) * 10) / 10
    series[active.key].rows.push([ym, pct])
  }

  for (const key of Object.keys(series) as InflationSeriesKey[]) {
    const rows = series[key].rows
    // Dedupe by ym keeping last (CSV should be unique; defensive).
    const byYm = new Map<string, number>()
    for (const [ym, pct] of rows) byYm.set(ym, pct)
    series[key].rows = [...byYm.entries()]
      .map(([ym, pct]) => [ym, pct] as InflationMonthRow)
      .sort((a, b) => a[0].localeCompare(b[0]))
  }

  const asOfCandidates = (Object.keys(series) as InflationSeriesKey[])
    .map((k) => maxYm(series[k].rows))
    .filter((v): v is string => Boolean(v))
  const asOf =
    asOfCandidates.length > 0 ? asOfCandidates.reduce((a, b) => (a > b ? a : b)) : null

  if (!asOf) {
    throw new NormalizeInflationError('KSH ara0040 CSV produced no Összesen observations')
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    source: {
      id: 'ksh-stadat-ara0040',
      table: '1.2.1.2',
      pageUrl: options?.pageUrl ?? KSH_ARA0040_PAGE_URL,
      csvUrl: options?.csvUrl ?? KSH_ARA0040_CSV_URL
    },
    asOf,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    metric: 'cpi_total',
    unit: 'pct_change',
    series,
    annualAverage: {
      derivedFrom: 'ytdYoy:januar-december',
      cols: ['year', 'pct'],
      rows: deriveAnnualAverage(series.ytdYoy.rows)
    }
  }
}
