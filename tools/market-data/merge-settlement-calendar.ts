import { digestSettlementCalendar } from './digests.ts'
import {
  SCHEMA_VERSION,
  type SettlementCalendarFile,
  type SettlementCalendarYearBlock
} from './types.ts'

export interface MergeSettlementCalendarResult {
  file: SettlementCalendarFile
  replacedYears: number[]
  keptYears: number[]
  appendedYears: number[]
  /** True when content digest differs from previous (excludes generatedAt). */
  contentChanged: boolean
}

function cloneYear(block: SettlementCalendarYearBlock): SettlementCalendarYearBlock {
  return {
    year: block.year,
    sourceFile: block.sourceFile,
    sourceDigest: block.sourceDigest,
    closed: [...block.closed],
    open: [...block.open]
  }
}

function cloneFile(file: SettlementCalendarFile): SettlementCalendarFile {
  return {
    schemaVersion: file.schemaVersion,
    calendarId: file.calendarId,
    timezone: file.timezone,
    generatedAt: file.generatedAt,
    source: {
      ...file.source,
      files: file.source.files.map((f) => ({ ...f }))
    },
    years: file.years.map(cloneYear)
  }
}

/**
 * Year-replace merge of MNB settlement calendar refs (ADR 0046).
 * Incoming years replace previous blocks (mid-year revisions allowed).
 * Years only on previous are kept. Same sourceDigest → keep previous year bytes.
 */
export function mergeSettlementCalendarFile(
  previous: SettlementCalendarFile | null,
  incoming: SettlementCalendarFile
): MergeSettlementCalendarResult {
  if (!previous) {
    const file = cloneFile(incoming)
    file.schemaVersion = SCHEMA_VERSION
    return {
      file,
      replacedYears: [],
      keptYears: [],
      appendedYears: file.years.map((y) => y.year),
      contentChanged: true
    }
  }

  const byYear = new Map<number, SettlementCalendarYearBlock>()
  for (const y of previous.years) byYear.set(y.year, cloneYear(y))

  const replacedYears: number[] = []
  const keptYears: number[] = []
  const appendedYears: number[] = []

  for (const incomingYear of incoming.years) {
    const prior = byYear.get(incomingYear.year)
    if (!prior) {
      byYear.set(incomingYear.year, cloneYear(incomingYear))
      appendedYears.push(incomingYear.year)
      continue
    }
    if (prior.sourceDigest === incomingYear.sourceDigest) {
      // Keep previous block for byte stability when the source file is unchanged.
      keptYears.push(incomingYear.year)
      continue
    }
    byYear.set(incomingYear.year, cloneYear(incomingYear))
    replacedYears.push(incomingYear.year)
  }

  const years = [...byYear.values()].sort((a, b) => a.year - b.year)

  // Rebuild source.files: prefer incoming meta for years present there; else previous.
  const fileMetaByYear = new Map(
    previous.source.files.map((f) => [f.year, { ...f }] as const)
  )
  for (const f of incoming.source.files) {
    fileMetaByYear.set(f.year, { ...f })
  }

  const merged = cloneFile(previous)
  merged.schemaVersion = SCHEMA_VERSION
  merged.calendarId = incoming.calendarId
  merged.timezone = incoming.timezone
  merged.source = {
    id: incoming.source.id,
    host: incoming.source.host,
    hubUrl: incoming.source.hubUrl,
    disclaimer: incoming.source.disclaimer,
    files: [...fileMetaByYear.values()].sort((a, b) => a.year - b.year)
  }
  merged.years = years
  merged.generatedAt = incoming.generatedAt

  const contentChanged = digestSettlementCalendar(merged) !== digestSettlementCalendar(previous)
  if (!contentChanged) {
    merged.generatedAt = previous.generatedAt
  }

  return {
    file: merged,
    replacedYears,
    keptYears,
    appendedYears,
    contentChanged
  }
}
