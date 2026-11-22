import * as XLSX from 'xlsx'
import {
  BUBOR_TENORS,
  MNB_BUBOR_PAGE_URL,
  MNB_BUBOR_XLS_URL,
  SCHEMA_VERSION,
  type BuborDayRow,
  type BuborFile,
  type BuborTenor
} from './types.ts'

export class NormalizeBuborError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NormalizeBuborError'
  }
}

/** Sheets that are never year data. */
const SKIP_SHEETS = new Set(['sheet1', 'comment', 'hibalista-error list'])

/**
 * Map bilingual / spaced / historical header labels onto canonical tenors.
 * Returns null when the header is a date column or unrecognized.
 */
export function mapBuborHeaderToTenor(raw: unknown): BuborTenor | null {
  if (raw == null) return null
  let s = String(raw).trim().toLowerCase()
  if (!s) return null
  // Drop accents for hét / hónap matching.
  s = s.normalize('NFD').replace(/\p{M}/gu, '')
  s = s.replace(/\s+/g, '')
  s = s.replace(/_/g, '')

  if (
    s === 'dateoffixing' ||
    s === 'jegyzesinap' ||
    s === 'jegyzesinapja' ||
    s === 'date' ||
    s === 'nap'
  ) {
    return null
  }

  if (s === 'o/n' || s === 'on' || s === 'overnight') return 'ON'

  const week = /^(\d+)\s*(het|week|w)$/i.exec(s) || /^(\d+)(het|week|w)$/i.exec(s)
  if (week) {
    const n = Number(week[1])
    if (n === 1) return '1W'
    if (n === 2) return '2W'
    return null
  }

  const month =
    /^(\d+)\s*(honap|ho|month|months|m)$/i.exec(s) ||
    /^(\d+)(honap|ho|month|months|m)$/i.exec(s)
  if (month) {
    const n = Number(month[1])
    if (n >= 1 && n <= 12) return `${n}M` as BuborTenor
  }

  // Compact forms already without spaces: "1het", "3honap", "12months"
  return null
}

function emptySeries(): BuborFile['series'] {
  const series = {} as BuborFile['series']
  for (const t of BUBOR_TENORS) {
    series[t] = { cols: ['date', 'pct'], rows: [] }
  }
  return series
}

function parsePct(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null
  }
  const t = String(raw).trim()
  if (!t || t === '-' || t === '–' || t === '—') return null
  const n = Number(t.replace(/\s/g, '').replace(',', '.').replace(/%$/, ''))
  return Number.isFinite(n) ? n : null
}

function excelSerialToIso(serial: number): string | null {
  // SheetJS: Excel epoch; use UTC noon to avoid TZ day shifts.
  const parsed = XLSX.SSF.parse_date_code(serial)
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null
  const y = parsed.y
  const m = String(parsed.m).padStart(2, '0')
  const d = String(parsed.d).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateCell(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return excelSerialToIso(raw)
  }
  const s = String(raw).trim()
  if (!s) return null
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  if (iso) return iso[1]
  const dotted = /^(\d{4})[./](\d{2})[./](\d{2})/.exec(s)
  if (dotted) return `${dotted[1]}-${dotted[2]}-${dotted[3]}`
  // Excel may stringify dates depending on cell type when we read as raw.
  const asNum = Number(s)
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    return excelSerialToIso(asNum)
  }
  return null
}

function isYearSheetName(name: string): boolean {
  const t = name.trim()
  if (/^\d{4}$/.test(t)) return true
  // "uj 2002" / "új 2002" companion sheet for May–Dec 2002.
  const uj = /^uj\s+(\d{4})$/i.exec(t.normalize('NFD').replace(/\p{M}/gu, ''))
  return Boolean(uj)
}

function findHeaderRow(rows: unknown[][]): {
  headerRow: number
  tenorCols: Array<{ col: number; tenor: BuborTenor }>
} | null {
  // Scan first ~5 rows for a row that maps to ≥1 tenor.
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const row = rows[r] ?? []
    const tenorCols: Array<{ col: number; tenor: BuborTenor }> = []
    const seen = new Set<BuborTenor>()
    for (let c = 0; c < row.length; c++) {
      const tenor = mapBuborHeaderToTenor(row[c])
      if (!tenor || seen.has(tenor)) continue
      seen.add(tenor)
      tenorCols.push({ col: c, tenor })
    }
    if (tenorCols.length > 0) {
      return { headerRow: r, tenorCols }
    }
  }
  return null
}

function maxDate(rows: BuborDayRow[]): string | null {
  let best: string | null = null
  for (const [d] of rows) {
    if (!best || d > best) best = d
  }
  return best
}

/**
 * Normalize MNB bubor2.xls bytes into published BUBOR refs (all historical sheets).
 * Sparse cells (`''` / `'-'`) are omitted. Duplicate (tenor, date) keeps the last value seen.
 */
export function normalizeMnbBuborXls(
  xlsBytes: Uint8Array,
  options?: { generatedAt?: string; xlsUrl?: string; pageUrl?: string }
): BuborFile {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(xlsBytes, {
      type: 'array',
      cellDates: false,
      raw: true
    })
  } catch (err) {
    throw new NormalizeBuborError(
      `Failed to parse bubor2.xls: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const series = emptySeries()
  const byTenorDate = new Map<BuborTenor, Map<string, number>>()
  for (const t of BUBOR_TENORS) byTenorDate.set(t, new Map())

  let sheetsParsed = 0
  for (const sheetName of workbook.SheetNames) {
    const key = sheetName.trim().toLowerCase()
    if (SKIP_SHEETS.has(key)) continue
    if (!isYearSheetName(sheetName)) continue

    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
      header: 1,
      raw: true,
      defval: null
    }) as unknown[][]
    if (rows.length < 2) continue

    const header = findHeaderRow(rows)
    if (!header) continue
    sheetsParsed += 1

    // Prefer the last header row when both HU and EN are present back-to-back
    // (e.g. 2023: HU then EN). If the next row also looks like headers, skip it.
    let dataStart = header.headerRow + 1
    if (dataStart < rows.length) {
      const next = findHeaderRow(rows.slice(dataStart, dataStart + 1).concat([[]]))
      // Re-check only the immediate next row.
      const nextRow = rows[dataStart] ?? []
      let nextLooksHeader = false
      for (const cell of nextRow) {
        if (mapBuborHeaderToTenor(cell)) {
          nextLooksHeader = true
          break
        }
      }
      if (nextLooksHeader) dataStart += 1
      void next
    }

    for (let r = dataStart; r < rows.length; r++) {
      const row = rows[r] ?? []
      const date = parseDateCell(row[0])
      if (!date) continue
      for (const { col, tenor } of header.tenorCols) {
        const pct = parsePct(row[col])
        if (pct == null) continue
        byTenorDate.get(tenor)!.set(date, pct)
      }
    }
  }

  if (sheetsParsed === 0) {
    throw new NormalizeBuborError('bubor2.xls produced no year sheets with tenor headers')
  }

  let anyRows = 0
  for (const t of BUBOR_TENORS) {
    const map = byTenorDate.get(t)!
    const rows = [...map.entries()]
      .map(([d, pct]) => [d, pct] as BuborDayRow)
      .sort((a, b) => a[0].localeCompare(b[0]))
    series[t].rows = rows
    anyRows += rows.length
  }

  if (anyRows === 0) {
    throw new NormalizeBuborError('bubor2.xls produced no BUBOR observations')
  }

  const asOfCandidates = BUBOR_TENORS.map((t) => maxDate(series[t].rows)).filter(
    (v): v is string => Boolean(v)
  )
  const asOf =
    asOfCandidates.length > 0 ? asOfCandidates.reduce((a, b) => (a > b ? a : b)) : null

  return {
    schemaVersion: SCHEMA_VERSION,
    source: {
      id: 'mnb-bubor2-xls',
      pageUrl: options?.pageUrl ?? MNB_BUBOR_PAGE_URL,
      xlsUrl: options?.xlsUrl ?? MNB_BUBOR_XLS_URL
    },
    asOf,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    metric: 'bubor',
    unit: 'pct',
    tenors: BUBOR_TENORS,
    series
  }
}
