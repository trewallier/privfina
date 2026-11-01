import { digestInflation } from './digests.ts'
import { MergeError } from './merge.ts'
import {
  SCHEMA_VERSION,
  type InflationFile,
  type InflationMonthRow,
  type InflationSeriesKey,
  type InflationYearRow
} from './types.ts'

export interface MergeInflationResult {
  file: InflationFile
  appendedRows: number
  skippedDuplicates: number
  /** True when content digest differs from previous (excludes generatedAt). */
  contentChanged: boolean
}

const SERIES_KEYS: InflationSeriesKey[] = ['yoy', 'mom', 'ytdFromDec', 'ytdYoy']

function cloneInflation(file: InflationFile): InflationFile {
  return {
    schemaVersion: file.schemaVersion,
    source: { ...file.source },
    asOf: file.asOf,
    generatedAt: file.generatedAt,
    metric: file.metric,
    unit: file.unit,
    series: Object.fromEntries(
      SERIES_KEYS.map((k) => [
        k,
        {
          kshBase: file.series[k].kshBase,
          cols: ['ym', 'pct'] as ['ym', 'pct'],
          rows: file.series[k].rows.map((r) => [...r] as InflationMonthRow)
        }
      ])
    ) as InflationFile['series'],
    annualAverage: {
      derivedFrom: file.annualAverage.derivedFrom,
      cols: ['year', 'pct'],
      rows: file.annualAverage.rows.map((r) => [...r] as InflationYearRow)
    }
  }
}

function mergeMonthRows(
  previous: InflationMonthRow[],
  incoming: InflationMonthRow[],
  seriesKey: InflationSeriesKey,
  counters: { appended: number; skipped: number }
): InflationMonthRow[] {
  const byYm = new Map<string, number>()
  for (const [ym, pct] of previous) byYm.set(ym, pct)
  for (const [ym, pct] of incoming) {
    const existing = byYm.get(ym)
    if (existing !== undefined) {
      if (Object.is(existing, pct)) {
        counters.skipped += 1
        continue
      }
      throw new MergeError(
        `Inflation historical conflict for ${seriesKey} ${ym}: kept ${existing}, got ${pct}`
      )
    }
    byYm.set(ym, pct)
    counters.appended += 1
  }
  return [...byYm.entries()]
    .map(([ym, pct]) => [ym, pct] as InflationMonthRow)
    .sort((a, b) => a[0].localeCompare(b[0]))
}

function mergeYearRows(
  previous: InflationYearRow[],
  incoming: InflationYearRow[],
  counters: { appended: number; skipped: number }
): InflationYearRow[] {
  const byYear = new Map<string, number>()
  for (const [year, pct] of previous) byYear.set(year, pct)
  for (const [year, pct] of incoming) {
    const existing = byYear.get(year)
    if (existing !== undefined) {
      if (Object.is(existing, pct)) {
        counters.skipped += 1
        continue
      }
      throw new MergeError(
        `Inflation annualAverage conflict for ${year}: kept ${existing}, got ${pct}`
      )
    }
    byYear.set(year, pct)
    counters.appended += 1
  }
  return [...byYear.entries()]
    .map(([year, pct]) => [year, pct] as InflationYearRow)
    .sort((a, b) => a[0].localeCompare(b[0]))
}

function maxYmAcross(file: InflationFile): string | null {
  let best: string | null = null
  for (const key of SERIES_KEYS) {
    for (const [ym] of file.series[key].rows) {
      if (!best || ym > best) best = ym
    }
  }
  return best
}

/**
 * Append-first merge of KSH inflation refs.
 * Same (series, ym) + identical pct → skip; different pct → MergeError.
 * When content is unchanged vs previous, reuse previous generatedAt.
 */
export function mergeInflationFile(
  previous: InflationFile | null,
  incoming: InflationFile
): MergeInflationResult {
  if (!previous) {
    const file = cloneInflation(incoming)
    file.schemaVersion = SCHEMA_VERSION
    file.asOf = maxYmAcross(file) ?? incoming.asOf
    return {
      file,
      appendedRows: SERIES_KEYS.reduce((n, k) => n + file.series[k].rows.length, 0) +
        file.annualAverage.rows.length,
      skippedDuplicates: 0,
      contentChanged: true
    }
  }

  const counters = { appended: 0, skipped: 0 }
  const merged = cloneInflation(previous)
  merged.source = { ...incoming.source }
  merged.metric = incoming.metric
  merged.unit = incoming.unit

  for (const key of SERIES_KEYS) {
    merged.series[key] = {
      kshBase: incoming.series[key].kshBase || previous.series[key].kshBase,
      cols: ['ym', 'pct'],
      rows: mergeMonthRows(
        previous.series[key].rows,
        incoming.series[key].rows,
        key,
        counters
      )
    }
  }
  merged.annualAverage = {
    derivedFrom: 'ytdYoy:januar-december',
    cols: ['year', 'pct'],
    rows: mergeYearRows(previous.annualAverage.rows, incoming.annualAverage.rows, counters)
  }
  merged.asOf = maxYmAcross(merged)
  merged.generatedAt = incoming.generatedAt

  const contentChanged = digestInflation(merged) !== digestInflation(previous)
  if (!contentChanged) {
    merged.generatedAt = previous.generatedAt
    merged.asOf = previous.asOf
  }

  return {
    file: merged,
    appendedRows: counters.appended,
    skippedDuplicates: counters.skipped,
    contentChanged
  }
}
