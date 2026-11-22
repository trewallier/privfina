import { digestBubor } from './digests.ts'
import { MergeError } from './merge.ts'
import {
  BUBOR_TENORS,
  SCHEMA_VERSION,
  type BuborDayRow,
  type BuborFile,
  type BuborTenor
} from './types.ts'

export interface MergeBuborResult {
  file: BuborFile
  appendedRows: number
  skippedDuplicates: number
  /** True when content digest differs from previous (excludes generatedAt). */
  contentChanged: boolean
}

function cloneBubor(file: BuborFile): BuborFile {
  return {
    schemaVersion: file.schemaVersion,
    source: { ...file.source },
    asOf: file.asOf,
    generatedAt: file.generatedAt,
    metric: file.metric,
    unit: file.unit,
    tenors: BUBOR_TENORS,
    series: Object.fromEntries(
      BUBOR_TENORS.map((t) => [
        t,
        {
          cols: ['date', 'pct'] as ['date', 'pct'],
          rows: file.series[t].rows.map((r) => [...r] as BuborDayRow)
        }
      ])
    ) as BuborFile['series']
  }
}

function mergeDayRows(
  previous: BuborDayRow[],
  incoming: BuborDayRow[],
  tenor: BuborTenor,
  counters: { appended: number; skipped: number }
): BuborDayRow[] {
  const byDate = new Map<string, number>()
  for (const [d, pct] of previous) byDate.set(d, pct)
  for (const [d, pct] of incoming) {
    const existing = byDate.get(d)
    if (existing !== undefined) {
      if (Object.is(existing, pct)) {
        counters.skipped += 1
        continue
      }
      throw new MergeError(
        `BUBOR historical conflict for ${tenor} ${d}: kept ${existing}, got ${pct}`
      )
    }
    byDate.set(d, pct)
    counters.appended += 1
  }
  return [...byDate.entries()]
    .map(([d, pct]) => [d, pct] as BuborDayRow)
    .sort((a, b) => a[0].localeCompare(b[0]))
}

function maxDateAcross(file: BuborFile): string | null {
  let best: string | null = null
  for (const t of BUBOR_TENORS) {
    for (const [d] of file.series[t].rows) {
      if (!best || d > best) best = d
    }
  }
  return best
}

/**
 * Append-first merge of MNB BUBOR refs (ADR 0045).
 * Same (tenor, date) + identical pct → skip; different pct → MergeError.
 * When content is unchanged vs previous, reuse previous generatedAt.
 */
export function mergeBuborFile(
  previous: BuborFile | null,
  incoming: BuborFile
): MergeBuborResult {
  if (!previous) {
    const file = cloneBubor(incoming)
    file.schemaVersion = SCHEMA_VERSION
    file.asOf = maxDateAcross(file) ?? incoming.asOf
    return {
      file,
      appendedRows: BUBOR_TENORS.reduce((n, t) => n + file.series[t].rows.length, 0),
      skippedDuplicates: 0,
      contentChanged: true
    }
  }

  const counters = { appended: 0, skipped: 0 }
  const merged = cloneBubor(previous)
  merged.source = { ...incoming.source }
  merged.metric = incoming.metric
  merged.unit = incoming.unit

  for (const t of BUBOR_TENORS) {
    merged.series[t] = {
      cols: ['date', 'pct'],
      rows: mergeDayRows(previous.series[t].rows, incoming.series[t].rows, t, counters)
    }
  }
  merged.asOf = maxDateAcross(merged)
  merged.generatedAt = incoming.generatedAt

  const contentChanged = digestBubor(merged) !== digestBubor(previous)
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
