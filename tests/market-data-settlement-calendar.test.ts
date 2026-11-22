import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  discoverSettlementCalendarFiles,
  pickLatestSettlementCalendarFile
} from '../tools/market-data/fetch-mnb-settlement-calendar.ts'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import { emptyMarketTree, mergeSnapshot } from '../tools/market-data/merge.ts'
import { mergeSettlementCalendarFile } from '../tools/market-data/merge-settlement-calendar.ts'
import { normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import {
  normalizeSettlementCalendarXlsx,
  normalizeSettlementCalendars
} from '../tools/market-data/normalize-mnb-settlement-calendar.ts'
import { assertPublishedTree } from '../tools/market-data/validate.ts'
import type { AkkEnvelope, SettlementCalendarFile } from '../tools/market-data/types.ts'
import { SETTLEMENT_CALENDAR_REF_PATH } from '../tools/market-data/types.ts'

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'market-data'
)
const CAL_DIR = path.join(FIXTURES, 'settlement-calendar')

async function loadXlsx(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(CAL_DIR, name)))
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

describe('MNB settlement calendar (ADR 0046)', () => {
  it('discovers hub links and prefers dated revision for a year', async () => {
    const hub = await readFile(path.join(CAL_DIR, 'hub.html'), 'utf8')
    const discovered = discoverSettlementCalendarFiles(hub)
    expect(discovered.map((d) => d.fileName)).toEqual([
      '2025-evi-elszamolasforgalmi-naptar.xlsx',
      '2026-evi-elszamolasforgalmi-naptar.xlsx',
      '2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx',
      '2027-evi-elszamolasforgalmi-naptar.xlsx'
    ])
    expect(pickLatestSettlementCalendarFile(discovered, 2026)?.fileName).toBe(
      '2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx'
    )
    expect(pickLatestSettlementCalendarFile(discovered, 2027)?.revisionDate).toBeNull()
  })

  it('normalizes closed weekdays and open weekends; Dec 12 flips on 2026-11-16 revision', async () => {
    const baseBytes = await loadXlsx('2026-evi-elszamolasforgalmi-naptar.xlsx')
    const revBytes = await loadXlsx('2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx')
    const base = normalizeSettlementCalendarXlsx(baseBytes, {
      year: 2026,
      fileName: '2026-evi-elszamolasforgalmi-naptar.xlsx',
      sourceDigest: sha256(baseBytes)
    })
    const rev = normalizeSettlementCalendarXlsx(revBytes, {
      year: 2026,
      fileName: '2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx',
      sourceDigest: sha256(revBytes)
    })

    expect(base.closed).toContain('2026-01-02')
    expect(base.closed).toContain('2026-12-24')
    expect(base.open).toContain('2026-01-10')
    expect(base.open).toContain('2026-12-12')

    expect(rev.closed).toContain('2026-12-24')
    expect(rev.open).toContain('2026-01-10')
    expect(rev.open).not.toContain('2026-12-12')
  })

  it('year-replace merge keeps unchanged years and rewrites on newer source digest', async () => {
    const revBytes = await loadXlsx('2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx')
    const baseBytes = await loadXlsx('2026-evi-elszamolasforgalmi-naptar.xlsx')
    const y2027 = await loadXlsx('2027-evi-elszamolasforgalmi-naptar.xlsx')

    const first = normalizeSettlementCalendars(
      [
        {
          year: 2026,
          fileName: '2026-evi-elszamolasforgalmi-naptar.xlsx',
          url: 'https://www.mnb.hu/letoltes/2026-evi-elszamolasforgalmi-naptar.xlsx',
          contentDigest: sha256(baseBytes),
          xlsxBytes: baseBytes,
          rawPath: 'x'
        },
        {
          year: 2027,
          fileName: '2027-evi-elszamolasforgalmi-naptar.xlsx',
          url: 'https://www.mnb.hu/letoltes/2027-evi-elszamolasforgalmi-naptar.xlsx',
          contentDigest: sha256(y2027),
          xlsxBytes: y2027,
          rawPath: 'y'
        }
      ],
      { generatedAt: '2026-11-01T00:00:00.000Z' }
    )

    const second = normalizeSettlementCalendars(
      [
        {
          year: 2026,
          fileName: '2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx',
          url: 'https://www.mnb.hu/letoltes/2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx',
          contentDigest: sha256(revBytes),
          xlsxBytes: revBytes,
          rawPath: 'z'
        }
      ],
      { generatedAt: '2026-11-16T00:00:00.000Z' }
    )

    const merged = mergeSettlementCalendarFile(first, second)
    expect(merged.replacedYears).toEqual([2026])
    expect(merged.keptYears).toEqual([])
    expect(merged.appendedYears).toEqual([])
    expect(merged.file.years.map((y) => y.year)).toEqual([2026, 2027])
    expect(merged.file.years.find((y) => y.year === 2026)?.open).not.toContain('2026-12-12')
    expect(merged.file.years.find((y) => y.year === 2027)?.sourceFile).toBe(
      '2027-evi-elszamolasforgalmi-naptar.xlsx'
    )
    expect(merged.contentChanged).toBe(true)

    const noop = mergeSettlementCalendarFile(merged.file, second)
    expect(noop.keptYears).toEqual([2026])
    expect(noop.contentChanged).toBe(false)
    expect(noop.file.generatedAt).toBe(merged.file.generatedAt)
  })

  it('mergeSnapshot publishes manifest.refs.settlementCalendar + digests', async () => {
    const catalog = JSON.parse(
      await readFile(path.join(FIXTURES, 'catalog.json'), 'utf8')
    ) as AkkEnvelope
    const rates = JSON.parse(
      await readFile(path.join(FIXTURES, 'network-rates.json'), 'utf8')
    ) as AkkEnvelope
    const snapshot = normalizeAkkSnapshots(catalog, rates, { requireFamilies: false })
    const revBytes = await loadXlsx('2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx')
    const file = normalizeSettlementCalendars(
      [
        {
          year: 2026,
          fileName: '2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx',
          url: 'https://www.mnb.hu/letoltes/2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx',
          contentDigest: sha256(revBytes),
          xlsxBytes: revBytes,
          rawPath: 'x'
        }
      ],
      { generatedAt: '2026-11-22T00:00:00.000Z' }
    )
    const result = mergeSnapshot(emptyMarketTree(), snapshot, {
      settlementCalendar: file,
      generatedAt: file.generatedAt
    })
    expect(result.tree.settlementCalendar?.years[0].year).toBe(2026)
    expect(result.tree.manifest?.refs?.settlementCalendar).toBe(SETTLEMENT_CALENDAR_REF_PATH)
    expect(result.tree.manifest?.digests[SETTLEMENT_CALENDAR_REF_PATH]).toBeTruthy()
    expect(result.settlementCalendarTouchedYears).toBe(1)
  })

  it('offline ingest writes refs/settlement-calendar.json', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'settlement-cal-'))
    const catalog = JSON.parse(await readFile(path.join(FIXTURES, 'catalog.json'), 'utf8'))
    const rates = JSON.parse(await readFile(path.join(FIXTURES, 'network-rates.json'), 'utf8'))
    const report = await ingestMarketData({
      root: out,
      rawDir: path.join(out, 'raw'),
      catalog,
      networkRates: rates,
      skipAllampapir: true,
      skipRetailInterest: true,
      skipInflation: true,
      skipBubor: true,
      skipWebkincstar: true,
      skipOfferings: true,
      settlementCalendarDir: CAL_DIR,
      settlementCalendarYears: [2026, 2027],
      generatedAt: '2026-11-22T12:00:00.000Z'
    })
    expect(report.settlementCalendarUpdated).toBe(true)
    expect(report.changed).toBe(true)
    await assertPublishedTree(out)
    const published = JSON.parse(
      await readFile(path.join(out, 'data/market/v2', SETTLEMENT_CALENDAR_REF_PATH), 'utf8')
    ) as SettlementCalendarFile
    expect(published.calendarId).toBe('HU-VIBER')
    expect(published.years.map((y) => y.year)).toEqual([2026, 2027])
    expect(published.years[0].sourceFile).toBe(
      '2026-evi-elszamolasforgalmi-naptar-2026-11-16.xlsx'
    )
    expect(published.years[0].open).not.toContain('2026-12-12')
  })
})
