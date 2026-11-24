import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyWebkincstarQuotes } from '../tools/market-data/combine-webkincstar.ts'
import {
  budapestYesterdayIso,
  fetchWebkincstarSnapshots
} from '../tools/market-data/fetch-webkincstar.ts'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import { emptyMarketTree, mergeSnapshot } from '../tools/market-data/merge.ts'
import { priceCalendarFileFromDays } from '../tools/market-data/merge-price-calendar.ts'
import { normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import {
  assertErteknapMatchesDatum,
  familyFromWebkincstarInstrumentName,
  parseErteknap,
  parseWebkincstarPdfText,
  WebkincstarParseError
} from '../tools/market-data/parse-webkincstar-pdf.ts'
import { normalizeWebkincstarReports } from '../tools/market-data/normalize-webkincstar.ts'
import {
  PRICE_CALENDAR_REF_PATH,
  type AkkEnvelope,
  type QuoteRow
} from '../tools/market-data/types.ts'

const fixturesRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/market-data/webkincstar'
)
const marketFixturesRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/market-data'
)

function loadText(rel: string): string {
  return readFileSync(path.join(fixturesRoot, rel), 'utf8')
}

describe('WebKincstár PDF text parse (ADR 0039 / §6h PR2)', () => {
  it('parses Értéknap and priced DKJ rows with bid/ask/yields', () => {
    const text = loadText('dkj-2026-11-05.txt')
    expect(parseErteknap(text)).toBe('2026-11-05')
    const parsed = parseWebkincstarPdfText({
      reportName: '_20631_arfolyam_dkj',
      text
    })
    expect(parsed.status).toBe('priced')
    expect(parsed.erteknap).toBe('2026-11-05')
    expect(parsed.rows.length).toBe(8)
    const d261223 = parsed.rows.find((r) => r.name === 'D261223')
    expect(d261223).toMatchObject({
      id: 'D261223',
      family: 'dkj',
      bid: 99.1998,
      ask: 99.3904,
      by: 6.13,
      ay: 4.66,
      ai: null,
      maturity: '2026-12-23'
    })
    const nearMaturity = parsed.rows.find((r) => r.name === 'D261125')
    expect(nearMaturity?.ask).toBeNull()
  })

  it('marks empty DKJ table as no_price with matching Értéknap', () => {
    const parsed = parseWebkincstarPdfText({
      reportName: '_20631_arfolyam_dkj',
      text: loadText('dkj-2026-11-08-empty.txt')
    })
    expect(parsed.erteknap).toBe('2026-11-08')
    expect(parsed.status).toBe('no_price')
    expect(parsed.rows).toEqual([])
  })

  it('parses MAK multi-family rows (KTV / PMÁP / FixMÁP / BMÁP)', () => {
    const parsed = parseWebkincstarPdfText({
      reportName: '_20633_arfolyam_mak',
      text: loadText('mak-2026-11-05.txt')
    })
    expect(parsed.status).toBe('priced')
    expect(parsed.erteknap).toBe('2026-11-05')
    expect(parsed.rows.length).toBeGreaterThan(10)

    expect(familyFromWebkincstarInstrumentName('2030/Q2', '_20633_arfolyam_mak')).toBe(
      'fixmap'
    )
    expect(familyFromWebkincstarInstrumentName('2036/I1', '_20633_arfolyam_mak')).toBe('pmap')
    expect(familyFromWebkincstarInstrumentName('2032/R1', '_20633_arfolyam_mak')).toBe('bmap')
    expect(familyFromWebkincstarInstrumentName('2026/D', '_20633_arfolyam_mak')).toBe('ktv')

    const pmap = parsed.rows.find((r) => r.name === '2036/I1')
    expect(pmap).toMatchObject({
      id: '2036_I1',
      family: 'pmap',
      bid: 99,
      ask: 100,
      ai: 1.3315,
      maturity: '2036-02-21'
    })
    const bmap = parsed.rows.find((r) => r.name === '2032/R1')
    expect(bmap?.family).toBe('bmap')
    expect(bmap?.ask).toBe(100)
  })

  it('parses MAPP / PEMÁK / Start / KKJ reports (ADR 0042 / §6n)', () => {
    const mapp = parseWebkincstarPdfText({
      reportName: '_207461_arfolyam_mapp',
      text: loadText('mapp-2026-11-05.txt')
    })
    expect(mapp.status).toBe('priced')
    expect(mapp.rows.find((r) => r.name === '2031/M6')).toMatchObject({
      family: 'mapp',
      bid: 99,
      ask: 100,
      ai: 0.4658,
      maturity: '2031-11-27'
    })
    expect(mapp.rows.find((r) => r.name === 'N2026/46')?.ask).toBeNull()

    const pemak = parseWebkincstarPdfText({
      reportName: '_20638_arfolyam_pemak',
      text: loadText('pemak-2026-11-05.txt')
    })
    expect(pemak.rows.find((r) => r.name === '2029/U_EUR')).toMatchObject({
      family: 'emap',
      ask: 100,
      ai: 0.0807
    })

    const start = parseWebkincstarPdfText({
      reportName: '_20642_arfolyam_start',
      text: loadText('start-2026-11-05.txt')
    })
    expect(start.rows.find((r) => r.name === '2045/S_BABA')).toMatchObject({
      family: 'baba',
      bid: 100,
      ask: 100,
      ai: 5.5956
    })

    const kkj = parseWebkincstarPdfText({
      reportName: '_20632_arfolyam_kkj',
      text: loadText('kkj-2024-06-03.txt')
    })
    expect(kkj.rows.find((r) => r.name === 'K2024/23')).toMatchObject({
      family: 'omap',
      bid: 99.4,
      ask: null,
      ai: 8.926
    })

    const kkjEmpty = parseWebkincstarPdfText({
      reportName: '_20632_arfolyam_kkj',
      text: loadText('kkj-2026-11-05-empty.txt')
    })
    expect(kkjEmpty.status).toBe('no_price')
  })

  it('rejects Értéknap mismatch against requested datum', () => {
    const parsed = parseWebkincstarPdfText({
      reportName: '_20631_arfolyam_dkj',
      text: loadText('dkj-2026-11-05.txt')
    })
    expect(() =>
      assertErteknapMatchesDatum(parsed.erteknap, '2026-11-06', '_20631_arfolyam_dkj')
    ).toThrow(WebkincstarParseError)
  })

  it('throws when Értéknap header is missing', () => {
    expect(() =>
      parseWebkincstarPdfText({
        reportName: '_20631_arfolyam_dkj',
        text: 'Diszkont Kincstárjegyek\nD261125 99.0 %'
      })
    ).toThrow(/Értéknap/)
  })
})

describe('WebKincstár normalize + offline fetch (ADR 0039 / §6h PR2)', () => {
  it('normalizes DKJ+MAK into family quote buckets and calendar days', () => {
    const dkj = parseWebkincstarPdfText({
      reportName: '_20631_arfolyam_dkj',
      text: loadText('dkj-2026-11-05.txt')
    })
    const mak = parseWebkincstarPdfText({
      reportName: '_20633_arfolyam_mak',
      text: loadText('mak-2026-11-05.txt')
    })
    const normalized = normalizeWebkincstarReports([dkj, mak])
    expect(normalized.hasQuotes).toBe(true)
    expect(normalized.snapshot.byFamily.dkj.quotes.length).toBe(8)
    expect(normalized.snapshot.byFamily.pmap.quotes.length).toBeGreaterThan(0)
    expect(normalized.snapshot.byFamily.bmap.quotes.length).toBeGreaterThan(0)
    expect(normalized.calendarDays).toEqual([
      {
        datum: '2026-11-05',
        report: '_20631_arfolyam_dkj',
        status: 'priced',
        rowCount: 8
      },
      {
        datum: '2026-11-05',
        report: '_20633_arfolyam_mak',
        status: 'priced',
        rowCount: mak.rows.length
      }
    ])
  })

  it('fetchWebkincstarSnapshots works offline from text fixtures', async () => {
    const result = await fetchWebkincstarSnapshots({
      datum: '2026-11-05',
      rawDir: '/tmp/unused-webkincstar-raw',
      reports: ['_20631_arfolyam_dkj', '_20633_arfolyam_mak'],
      textByReport: {
        _20631_arfolyam_dkj: loadText('dkj-2026-11-05.txt'),
        _20633_arfolyam_mak: loadText('mak-2026-11-05.txt')
      }
    })
    expect(result.reports).toHaveLength(2)
    expect(result.failures).toEqual([])
    expect(result.reports[0].parsed.status).toBe('priced')
    expect(result.reports[1].parsed.status).toBe('priced')
  })

  it('isolates per-report failures so one healthy PDF is kept', async () => {
    const result = await fetchWebkincstarSnapshots({
      datum: '2026-11-05',
      rawDir: '/tmp/unused-webkincstar-raw',
      reports: ['_20631_arfolyam_dkj', '_20633_arfolyam_mak'],
      textByReport: {
        _20631_arfolyam_dkj: loadText('dkj-2026-11-05.txt'),
        // Wrong Értéknap vs requested datum → that report alone fails
        _20633_arfolyam_mak: loadText('mak-2026-11-08-empty.txt')
      }
    })
    expect(result.reports).toHaveLength(1)
    expect(result.reports[0].reportName).toBe('_20631_arfolyam_dkj')
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].reportName).toBe('_20633_arfolyam_mak')
  })

  it('offline textByReport never POSTs missing report keys (ADR 0042)', async () => {
    const result = await fetchWebkincstarSnapshots({
      datum: '2026-11-05',
      rawDir: '/tmp/unused-webkincstar-raw',
      reports: ['_20631_arfolyam_dkj', '_207461_arfolyam_mapp'],
      textByReport: {
        _20631_arfolyam_dkj: loadText('dkj-2026-11-05.txt')
        // mapp omitted → soft-fail, no network
      }
    })
    expect(result.reports).toHaveLength(1)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].reportName).toBe('_207461_arfolyam_mapp')
    expect(String(result.failures[0].error)).toMatch(/Offline textByReport missing/)
  })

  it('budapestYesterdayIso uses Europe/Budapest calendar day', () => {
    // 2026-11-08 00:30 UTC = still 2026-11-08 in Budapest → yesterday 2026-11-07
    const utc = new Date('2026-11-08T00:30:00.000Z')
    expect(budapestYesterdayIso(utc)).toBe('2026-11-07')
    // 2026-11-07 23:30 UTC = 2026-11-08 in Budapest → yesterday 2026-11-07
    const lateUtc = new Date('2026-11-07T23:30:00.000Z')
    expect(budapestYesterdayIso(lateUtc)).toBe('2026-11-07')
  })

  it('resolveWebkincstarLookbackDatums fills weekday holes after schedule drift', async () => {
    const {
      resolveWebkincstarLookbackDatums,
      webkincstarDatumNeedsFetch,
      shiftIsoDate,
      isIsoWeekday
    } = await import('../tools/market-data/fetch-webkincstar.ts')
    const { WEBKINCSTAR_REPORTS } = await import('../tools/market-data/webkincstar-reports.ts')

    expect(isIsoWeekday('2026-11-10')).toBe(true) // Tuesday
    expect(isIsoWeekday('2026-11-08')).toBe(false) // Sunday
    expect(shiftIsoDate('2026-11-11', -1)).toBe('2026-11-10')

    const previousDays = [
      // Nov 9 and Nov 11 present for all reports; Nov 10 missing (the drift hole).
      ...WEBKINCSTAR_REPORTS.flatMap((report) => [
        { datum: '2026-11-09', report, status: 'priced' },
        { datum: '2026-11-11', report, status: 'priced' }
      ])
    ]
    expect(webkincstarDatumNeedsFetch('2026-11-10', previousDays)).toBe(true)
    expect(webkincstarDatumNeedsFetch('2026-11-11', previousDays)).toBe(false)

    const datums = resolveWebkincstarLookbackDatums({
      primaryDatum: '2026-11-11',
      previousDays,
      maxExtraWeekdays: 3
    })
    expect(datums[0]).toBe('2026-11-11')
    expect(datums).toContain('2026-11-10')
    expect(datums.every((d) => isIsoWeekday(d) || d === '2026-11-11')).toBe(true)
  })

  it('resolveWebkincstarBackfillDatums builds §6m historical date loops', async () => {
    const {
      listIsoDatesInclusive,
      resolveWebkincstarBackfillDatums,
      WEBKINCSTAR_BACKFILL_DEFAULT_FROM,
      isIsoWeekday
    } = await import('../tools/market-data/fetch-webkincstar.ts')

    expect(WEBKINCSTAR_BACKFILL_DEFAULT_FROM).toBe('1990-01-01')
    expect(listIsoDatesInclusive('2026-11-01', '2026-11-03')).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03'
    ])
    expect(() => listIsoDatesInclusive('2026-11-03', '2026-11-01')).toThrow(/after to/)

    const all = resolveWebkincstarBackfillDatums({
      from: '2026-11-06',
      to: '2026-11-09'
    })
    expect(all).toEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'])

    const weekdays = resolveWebkincstarBackfillDatums({
      from: '2026-11-06',
      to: '2026-11-09',
      weekdaysOnly: true
    })
    expect(weekdays.every((d) => isIsoWeekday(d))).toBe(true)
    expect(weekdays).toEqual(['2026-11-06', '2026-11-09'])

    const previousDays = [
      { datum: '2026-11-06', report: '_20633_arfolyam_mak', status: 'priced' },
      { datum: '2026-11-09', report: '_20633_arfolyam_mak', status: 'no_price' }
    ]
    const resume = resolveWebkincstarBackfillDatums({
      from: '2026-11-06',
      to: '2026-11-09',
      weekdaysOnly: true,
      skipDurable: true,
      previousDays,
      reports: ['_20633_arfolyam_mak']
    })
    expect(resume).toEqual([])
  })

  it('resolveWebkincstarHistoricalBackfillDatums walks 6 days before per-report frontiers', async () => {
    const {
      contiguousDurableFrontierDatum,
      oldestDurablePriceCalendarDatum,
      resolveWebkincstarHistoricalBackfillDatums,
      resolveWebkincstarLookbackDatums,
      mergeWebkincstarFetchDatums,
      WEBKINCSTAR_BACKFILL_DEFAULT_FROM,
      WEBKINCSTAR_HISTORICAL_BACKFILL_DEPTH
    } = await import('../tools/market-data/fetch-webkincstar.ts')
    const { WEBKINCSTAR_REPORTS } = await import('../tools/market-data/webkincstar-reports.ts')

    expect(WEBKINCSTAR_BACKFILL_DEFAULT_FROM).toBe('1990-01-01')
    expect(WEBKINCSTAR_HISTORICAL_BACKFILL_DEPTH).toBe(6)

    // Contiguous tip cluster Nov 5…11 for every report (omit Nov 6–10 to keep fixture small —
    // frontier walks only while prior calendar days exist, so seed every day).
    const tipCluster: { datum: string; report: (typeof WEBKINCSTAR_REPORTS)[number]; status: 'priced' }[] =
      []
    for (const report of WEBKINCSTAR_REPORTS) {
      for (let d = 5; d <= 11; d += 1) {
        tipCluster.push({
          datum: `2026-11-${String(d).padStart(2, '0')}`,
          report,
          status: 'priced'
        })
      }
    }
    expect(contiguousDurableFrontierDatum(tipCluster, WEBKINCSTAR_REPORTS[0])).toBe('2026-11-05')
    expect(oldestDurablePriceCalendarDatum(tipCluster)).toBe('2026-11-05')

    const hist = resolveWebkincstarHistoricalBackfillDatums({ previousDays: tipCluster })
    expect(hist).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04'
    ])

    // Durable day inside the window is omitted when every report already has it.
    const withDurableGap = [
      ...tipCluster,
      ...WEBKINCSTAR_REPORTS.map((report) => ({
        datum: '2026-11-02',
        report,
        status: 'no_price' as const
      }))
    ]
    expect(resolveWebkincstarHistoricalBackfillDatums({ previousDays: withDurableGap })).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-03',
      '2026-11-04'
    ])

    expect(resolveWebkincstarHistoricalBackfillDatums({ previousDays: [] })).toEqual([])
    expect(oldestDurablePriceCalendarDatum([])).toBeNull()

    // Clamp: frontier 1990-01-03 → only days ≥ floor.
    const nearFloor = WEBKINCSTAR_REPORTS.flatMap((report) => [
      { datum: '1990-01-03', report, status: 'priced' as const },
      { datum: '1990-01-04', report, status: 'priced' as const }
    ])
    expect(contiguousDurableFrontierDatum(nearFloor, WEBKINCSTAR_REPORTS[0])).toBe('1990-01-03')
    expect(resolveWebkincstarHistoricalBackfillDatums({ previousDays: nearFloor })).toEqual([
      '1990-01-01',
      '1990-01-02'
    ])

    // Deep MAK island must not stall shallow DKJ: global min would be 2020-01-01,
    // but contiguous frontier for DKJ stays at 2026-11-05.
    const mak = '_20633_arfolyam_mak' as const
    const dkj = '_20631_arfolyam_dkj' as const
    const uneven = [
      { datum: '2020-01-01', report: mak, status: 'priced' as const },
      { datum: '2020-01-02', report: mak, status: 'priced' as const },
      ...['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'].flatMap(
        (datum) => [
          { datum, report: mak, status: 'priced' as const },
          { datum, report: dkj, status: 'priced' as const }
        ]
      )
    ]
    expect(oldestDurablePriceCalendarDatum(uneven, [mak, dkj])).toBe('2020-01-01')
    expect(contiguousDurableFrontierDatum(uneven, mak)).toBe('2026-11-05')
    expect(contiguousDurableFrontierDatum(uneven, dkj)).toBe('2026-11-05')
    const unevenHist = resolveWebkincstarHistoricalBackfillDatums({
      previousDays: uneven,
      reports: [mak, dkj]
    })
    expect(unevenHist).toContain('2026-10-30')
    expect(unevenHist).toContain('2026-11-04')
    expect(unevenHist).not.toContain('2019-12-26')

    // Ingest composition smoke: tip lookback ∪ historical both present.
    const tip = resolveWebkincstarLookbackDatums({
      primaryDatum: '2026-11-11',
      previousDays: tipCluster,
      maxExtraWeekdays: 3
    })
    const historical = resolveWebkincstarHistoricalBackfillDatums({ previousDays: tipCluster })
    const merged = mergeWebkincstarFetchDatums(tip, historical)
    expect(merged).toContain('2026-11-11')
    expect(merged).toContain('2026-10-30')
    expect(merged).toContain('2026-11-04')
    expect(merged).not.toContain('2026-11-05')
  })
})

describe('WebKincstár overlay + calendar + ingest (ADR 0039 / §6h PR3)', () => {
  function loadJson<T>(rel: string): T {
    return JSON.parse(readFileSync(path.join(marketFixturesRoot, rel), 'utf8')) as T
  }

  it('WebKincstár ask overrides differing dual-source ask on same (id,d)', () => {
    const akk = normalizeAkkSnapshots(
      loadJson<AkkEnvelope>('catalog.json'),
      loadJson<AkkEnvelope>('network-rates.json'),
      { requireFamilies: false }
    )
    const wk = normalizeWebkincstarReports([
      parseWebkincstarPdfText({
        reportName: '_20631_arfolyam_dkj',
        text: loadText('dkj-2026-11-05.txt')
      })
    ])
    // Seed a conflicting ask on catalog series D261125 for the PDF settle day.
    akk.byFamily.dkj.quotes.push({
      id: 'D261125',
      row: ['2026-11-05', 99.1, 99.2, 6, 4, null]
    })
    const overlay = applyWebkincstarQuotes(akk, wk.snapshot)
    const row = overlay.snapshot.byFamily.dkj.quotes.find(
      (q) => q.id === 'D261125' && q.row[0] === '2026-11-05'
    )
    // PDF D261125 has null ask near maturity; prefer non-null keeps seeded 99.2.
    // Use D261223 after adding it to series index via extraSeries-style presence:
    akk.byFamily.dkj.series.push({
      id: 'D261223',
      isin: 'HU0000529999',
      name: 'D261223',
      issue: null,
      mat: '2026-12-23',
      ccy: 'HUF',
      status: 'active'
    })
    akk.byFamily.dkj.quotes.push({
      id: 'D261223',
      row: ['2026-11-05', 99.1, 99.2, 6, 4, null]
    })
    const overlay2 = applyWebkincstarQuotes(akk, wk.snapshot)
    const row2 = overlay2.snapshot.byFamily.dkj.quotes.find(
      (q) => q.id === 'D261223' && q.row[0] === '2026-11-05'
    )
    expect(row2?.row[2]).toBe(99.3904) // WebKincstár ask wins over 99.2
    expect(overlay2.hasQuotes).toBe(true)
    expect(row?.row[1]).toBe(99.665) // WK bid overwrites seeded bid when both present
  })

  it('joins PMÁP PDF short name onto ÁKK longName id via series.name', () => {
    const akk = normalizeAkkSnapshots(
      loadJson<AkkEnvelope>('catalog.json'),
      loadJson<AkkEnvelope>('network-rates.json'),
      { requireFamilies: false }
    )
    const wk = normalizeWebkincstarReports([
      parseWebkincstarPdfText({
        reportName: '_20633_arfolyam_mak',
        text: loadText('mak-2026-11-05.txt')
      })
    ])
    const overlay = applyWebkincstarQuotes(akk, wk.snapshot)
    const row = overlay.snapshot.byFamily.pmap.quotes.find(
      (q) => q.id === 'A270324I22' && q.row[0] === '2026-11-05'
    )
    expect(row?.row[1]).toBe(99) // bid from 2027/I
    expect(row?.row[5]).toBe(3.6532) // ai
  })

  it('records skippedUnmatched quote identities when no catalog series match', () => {
    const emptyBase = normalizeAkkSnapshots(
      loadJson<AkkEnvelope>('catalog.json'),
      loadJson<AkkEnvelope>('network-rates.json'),
      { requireFamilies: false }
    )
    // Drop all series so every WK quote is unmatched.
    for (const family of Object.keys(emptyBase.byFamily) as Array<
      keyof typeof emptyBase.byFamily
    >) {
      emptyBase.byFamily[family].series = []
      emptyBase.byFamily[family].quotes = []
    }
    const wk = normalizeWebkincstarReports([
      parseWebkincstarPdfText({
        reportName: '_20631_arfolyam_dkj',
        text: loadText('dkj-2026-11-05.txt')
      })
    ])
    const overlay = applyWebkincstarQuotes(emptyBase, wk.snapshot)
    expect(overlay.skippedUnmatched).toBeGreaterThan(0)
    expect(overlay.skippedUnmatchedQuotes.length).toBeGreaterThan(0)
    expect(overlay.skippedUnmatchedQuotes.length).toBeLessThanOrEqual(overlay.skippedUnmatched)
    expect(overlay.skippedUnmatchedQuotes[0]).toEqual(
      expect.objectContaining({
        family: 'dkj',
        settleDate: '2026-11-05',
        id: expect.any(String),
        name: expect.any(String)
      })
    )
    expect(overlay.skippedUnmatchedSeries.length).toBeGreaterThan(0)
    expect(overlay.skippedUnmatchedSeries[0]).toEqual(
      expect.objectContaining({
        family: 'dkj',
        id: expect.any(String),
        name: expect.any(String)
      })
    )
    expect(overlay.hasQuotes).toBe(false)
    expect(overlay.inventedSeries).toEqual([])
  })

  it('invents marked series stubs when inventUnmatched is on (ADR 0048)', () => {
    const emptyBase = normalizeAkkSnapshots(
      loadJson<AkkEnvelope>('catalog.json'),
      loadJson<AkkEnvelope>('network-rates.json'),
      { requireFamilies: false }
    )
    for (const family of Object.keys(emptyBase.byFamily) as Array<
      keyof typeof emptyBase.byFamily
    >) {
      emptyBase.byFamily[family].series = []
      emptyBase.byFamily[family].quotes = []
    }
    const wk = normalizeWebkincstarReports([
      parseWebkincstarPdfText({
        reportName: '_20631_arfolyam_dkj',
        text: loadText('dkj-2026-11-05.txt')
      })
    ])
    const overlay = applyWebkincstarQuotes(emptyBase, wk.snapshot, {
      inventUnmatched: true
    })
    expect(overlay.skippedUnmatched).toBe(0)
    expect(overlay.inventedSeries.length).toBeGreaterThan(0)
    expect(overlay.hasQuotes).toBe(true)
    const stub = overlay.snapshot.byFamily.dkj.series.find(
      (s) => s.id === overlay.inventedSeries[0].id
    )
    expect(stub?.identitySource).toBe('webkincstar.allamkincstar.gov.hu')
    // Invent omits dayCount so ISSUE ACT/365F (etc.) can null-fill later (ADR 0048).
    expect(stub?.dayCount).toBeUndefined()
    expect(
      overlay.snapshot.byFamily.dkj.quotes.some((q) => q.id === stub?.id)
    ).toBe(true)
  })

  it('omits priced calendar seal when overlay soft-skips unmatched quotes (retry)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-wk-skip-nodurable-'))
    // Minimal DKJ text: one catalog series + one unmatched name → soft-skip.
    const dkjWithUnmatched = `
Diszkont Kincstárjegyek                                                                 Értéknap: 2026.11.05
D261125             99.6650 %      6.13 %   6.05 %            -             -           -            20        2026.11.25
D999999             99.0000 %      6.00 %   5.90 %            -             -           -            30        2026.12.05
`
    const dkjMatchedOnly = `
Diszkont Kincstárjegyek                                                                 Értéknap: 2026.11.05
D261125             99.6650 %      6.13 %   6.05 %            -             -           -            20        2026.11.25
`
    try {
      const report = await ingestMarketData({
        root: dir,
        rawDir: path.join(dir, 'raw'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        skipBubor: true,
        skipSettlementCalendar: true,
        skipOfferings: true,
        webkincstarDatum: '2026-11-05',
        webkincstarReports: ['_20631_arfolyam_dkj'],
        webkincstarTextByReport: {
          _20631_arfolyam_dkj: dkjWithUnmatched
        },
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarOverlaySkipped).toBeGreaterThan(0)
      const days = report.tree.priceCalendar?.days ?? []
      // Soft-skipped overlay → no durable priced/no_price seal for that report.
      expect(
        days.some(
          (d) =>
            d.report === '_20631_arfolyam_dkj' &&
            (d.status === 'priced' || d.status === 'no_price')
        )
      ).toBe(false)
      // Matched DKJ quote still overlays.
      const quotes = JSON.parse(
        await readFile(
          path.join(dir, 'data/market/v2/families/dkj/quotes/D261125.json'),
          'utf8'
        )
      )
      expect(quotes.rows.some((r: QuoteRow) => r[0] === '2026-11-05')).toBe(true)

      // Second run: every parsed row joins → seal priced.
      const sealed = await ingestMarketData({
        root: dir,
        previousRoot: dir,
        rawDir: path.join(dir, 'raw2'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        skipBubor: true,
        skipSettlementCalendar: true,
        skipOfferings: true,
        webkincstarDatum: '2026-11-05',
        webkincstarReports: ['_20631_arfolyam_dkj'],
        webkincstarTextByReport: {
          _20631_arfolyam_dkj: dkjMatchedOnly
        },
        generatedAt: '2026-11-05T19:00:00.000Z'
      })
      expect(sealed.webkincstarOverlaySkipped).toBe(0)
      expect(
        sealed.tree.priceCalendar?.days.some(
          (d) =>
            d.report === '_20631_arfolyam_dkj' &&
            d.datum === '2026-11-05' &&
            d.status === 'priced'
        )
      ).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('historical invent creates WK-origin stubs, applies quotes, and seals calendar (ADR 0048)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-wk-invent-'))
    const dkjWithUnmatched = `
Diszkont Kincstárjegyek                                                                 Értéknap: 2026.11.05
D261125             99.6650 %      6.13 %   6.05 %            -             -           -            20        2026.11.25
D999999             99.0000 %      6.00 %   5.90 %            -             -           -            30        2026.12.05
`
    try {
      const report = await ingestMarketData({
        root: dir,
        rawDir: path.join(dir, 'raw'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        skipBubor: true,
        skipSettlementCalendar: true,
        skipOfferings: true,
        // Explicit hist datums enable inventUnmatched (CLI bypass).
        webkincstarDatums: ['2026-11-05'],
        webkincstarReports: ['_20631_arfolyam_dkj'],
        webkincstarTextByReport: {
          _20631_arfolyam_dkj: dkjWithUnmatched
        },
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarHistoricalEnabled).toBe(true)
      expect(report.webkincstarOverlaySkipped).toBe(0)
      expect(report.webkincstarSeriesInvented).toBeGreaterThan(0)
      const invented = report.tree.families.dkj.series.series.find((s) => s.id === 'D999999')
      expect(invented?.identitySource).toBe('webkincstar.allamkincstar.gov.hu')
      expect(invented?.dayCount).toBeUndefined()
      expect(report.tree.families.dkj.quotes.D999999?.rows.some((r) => r[0] === '2026-11-05')).toBe(
        true
      )
      expect(
        report.tree.priceCalendar?.days.some(
          (d) =>
            d.report === '_20631_arfolyam_dkj' &&
            d.datum === '2026-11-05' &&
            d.status === 'priced'
        )
      ).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('tip-lookback-only (gate closed) soft-skips unmatched — does not invent (ADR 0048)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-wk-no-invent-tip-'))
    const dkjWithUnmatched = `
Diszkont Kincstárjegyek                                                                 Értéknap: 2026.11.05
D261125             99.6650 %      6.13 %   6.05 %            -             -           -            20        2026.11.25
D999999             99.0000 %      6.00 %   5.90 %            -             -           -            30        2026.12.05
`
    try {
      const report = await ingestMarketData({
        root: dir,
        rawDir: path.join(dir, 'raw'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        skipBubor: true,
        skipSettlementCalendar: true,
        skipOfferings: true,
        // Single tip datum — not explicit hist datums; inventUnmatched stays off.
        webkincstarDatum: '2026-11-05',
        webkincstarReports: ['_20631_arfolyam_dkj'],
        webkincstarTextByReport: {
          _20631_arfolyam_dkj: dkjWithUnmatched
        },
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarHistoricalEnabled).toBe(false)
      expect(report.webkincstarSeriesInvented).toBe(0)
      expect(report.webkincstarOverlaySkipped).toBeGreaterThan(0)
      expect(report.tree.families.dkj.series.series.some((s) => s.id === 'D999999')).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('seals sibling reports when only one report soft-skips unmatched quotes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-wk-skip-per-report-'))
    const dkjWithUnmatched = `
Diszkont Kincstárjegyek                                                                 Értéknap: 2026.11.05
D261125             99.6650 %      6.13 %   6.05 %            -             -           -            20        2026.11.25
D999999             99.0000 %      6.00 %   5.90 %            -             -           -            30        2026.12.05
`
    const kkjEmptyJoinable = loadText('kkj-2026-11-05-empty.txt')
    try {
      const report = await ingestMarketData({
        root: dir,
        rawDir: path.join(dir, 'raw'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        skipBubor: true,
        skipSettlementCalendar: true,
        skipOfferings: true,
        webkincstarDatum: '2026-11-05',
        webkincstarReports: ['_20631_arfolyam_dkj', '_20632_arfolyam_kkj'],
        webkincstarTextByReport: {
          _20631_arfolyam_dkj: dkjWithUnmatched,
          _20632_arfolyam_kkj: kkjEmptyJoinable
        },
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarOverlaySkipped).toBeGreaterThan(0)
      const days = report.tree.priceCalendar?.days ?? []
      expect(
        days.some(
          (d) =>
            d.report === '_20631_arfolyam_dkj' &&
            (d.status === 'priced' || d.status === 'no_price')
        )
      ).toBe(false)
      expect(
        days.find(
          (d) => d.report === '_20632_arfolyam_kkj' && d.datum === '2026-11-05'
        )?.status
      ).toBe('no_price')
      // Matched DKJ quote still overlays even though that report did not seal.
      const quotes = JSON.parse(
        await readFile(
          path.join(dir, 'data/market/v2/families/dkj/quotes/D261125.json'),
          'utf8'
        )
      )
      expect(quotes.rows.some((r: QuoteRow) => r[0] === '2026-11-05')).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('append-first price calendar digests change on no-price-only day', () => {
    const emptyDkj = parseWebkincstarPdfText({
      reportName: '_20631_arfolyam_dkj',
      text: loadText('dkj-2026-11-08-empty.txt')
    })
    const emptyMak = parseWebkincstarPdfText({
      reportName: '_20633_arfolyam_mak',
      text: loadText('mak-2026-11-08-empty.txt')
    })
    const normalized = normalizeWebkincstarReports([emptyDkj, emptyMak])
    const cal = priceCalendarFileFromDays(
      normalized.calendarDays,
      '2026-11-08T12:00:00.000Z'
    )
    const seeded = mergeSnapshot(
      emptyMarketTree(),
      normalizeAkkSnapshots(
        loadJson<AkkEnvelope>('catalog.json'),
        loadJson<AkkEnvelope>('network-rates.json'),
        { requireFamilies: false }
      ),
      { generatedAt: '2026-11-07T12:00:00.000Z', allowSameDayRewrite: true }
    )
    const noNewQuotes = {
      asOf: seeded.asOf,
      byFamily: normalizeWebkincstarReports([]).snapshot.byFamily
    }
    const merged = mergeSnapshot(seeded.tree, noNewQuotes, {
      generatedAt: '2026-11-08T12:00:00.000Z',
      priceCalendar: cal
    })
    expect(merged.changed).toBe(true)
    expect(merged.priceCalendarAppendedDays).toBe(2)
    expect(merged.tree.priceCalendar?.days.every((d) => d.status === 'no_price')).toBe(true)
    expect(merged.tree.manifest?.refs?.priceCalendar).toBe(PRICE_CALENDAR_REF_PATH)
    expect(merged.tree.manifest?.digests[PRICE_CALENDAR_REF_PATH]).toBeTruthy()
  })

  function allReportsMismatchTextByReport(): Record<string, string> {
    return {
      _20631_arfolyam_dkj: loadText('dkj-2026-11-08-empty.txt'),
      _20633_arfolyam_mak: loadText('mak-2026-11-08-empty.txt'),
      _207461_arfolyam_mapp: loadText('mapp-2026-11-08-empty.txt'),
      _20638_arfolyam_pemak: loadText('pemak-2026-11-08-empty.txt'),
      _20642_arfolyam_start: loadText('start-2026-11-08-empty.txt'),
      _20632_arfolyam_kkj: loadText('kkj-2026-11-08-empty.txt')
    }
  }

  function allReportsPricedTextByReport(): Record<string, string> {
    return {
      _20631_arfolyam_dkj: loadText('dkj-2026-11-05.txt'),
      _20633_arfolyam_mak: loadText('mak-2026-11-05.txt'),
      _207461_arfolyam_mapp: loadText('mapp-2026-11-05.txt'),
      _20638_arfolyam_pemak: loadText('pemak-2026-11-05.txt'),
      _20642_arfolyam_start: loadText('start-2026-11-05.txt'),
      _20632_arfolyam_kkj: loadText('kkj-2026-11-05-empty.txt')
    }
  }

  /** Catalog-joinable DKJ row only + empty siblings → durable priced/no_price seals. */
  function joinablePricedTextByReport(): Record<string, string> {
    const dkjMatched = `
Diszkont Kincstárjegyek                                                                 Értéknap: 2026.11.05
D261125             99.6650 %      6.13 %   6.05 %            -             -           -            20        2026.11.25
`
    const retarget = (rel: string) =>
      loadText(rel).replaceAll('2026.11.08', '2026.11.05')
    return {
      _20631_arfolyam_dkj: dkjMatched,
      _20633_arfolyam_mak: retarget('mak-2026-11-08-empty.txt'),
      _207461_arfolyam_mapp: retarget('mapp-2026-11-08-empty.txt'),
      _20638_arfolyam_pemak: retarget('pemak-2026-11-08-empty.txt'),
      _20642_arfolyam_start: retarget('start-2026-11-08-empty.txt'),
      _20632_arfolyam_kkj: loadText('kkj-2026-11-05-empty.txt')
    }
  }

  it('ingest soft-fail records fetch_failed without blocking dual-source', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-wk-soft-'))
    try {
      const report = await ingestMarketData({
        root: dir,
        rawDir: path.join(dir, 'raw'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        webkincstarDatum: '2026-11-05',
        // Force Értéknap mismatch → soft-fail path for every report
        webkincstarTextByReport: allReportsMismatchTextByReport(),
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarSoftFailed).toBe(true)
      expect(report.changed).toBe(true)
      expect(report.tree.priceCalendar?.days.every((d) => d.status === 'fetch_failed')).toBe(
        true
      )
      expect(report.tree.priceCalendar?.days.length).toBe(6)
      const cal = JSON.parse(
        await readFile(path.join(dir, 'data/market/v2', PRICE_CALENDAR_REF_PATH), 'utf8')
      )
      expect(cal.source.id).toBe('webkincstar-report-service')
      expect(cal.source.disclaimer).toMatch(/informational/i)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('soft-fail after a priced calendar day does not MergeError the ingest', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-wk-re-soft-'))
    try {
      const priced = await ingestMarketData({
        root: dir,
        rawDir: path.join(dir, 'raw'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        webkincstarDatum: '2026-11-05',
        webkincstarTextByReport: joinablePricedTextByReport(),
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(priced.webkincstarSoftFailed).toBe(false)
      expect(priced.webkincstarOverlaySkipped).toBe(0)
      expect(
        priced.tree.priceCalendar?.days.some((d) => d.status === 'priced')
      ).toBe(true)

      const soft = await ingestMarketData({
        root: dir,
        previousRoot: dir,
        rawDir: path.join(dir, 'raw2'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        webkincstarDatum: '2026-11-05',
        webkincstarTextByReport: allReportsMismatchTextByReport(),
        generatedAt: '2026-11-05T19:00:00.000Z'
      })
      expect(soft.webkincstarSoftFailed).toBe(true)
      // Prior priced/no_price rows kept — soft-fail must not rewrite or MergeError.
      expect(
        soft.tree.priceCalendar?.days
          .filter((d) => d.datum === '2026-11-05')
          .every((d) => d.status === 'priced' || d.status === 'no_price')
      ).toBe(true)
      expect(Object.keys(soft.tree.families.dkj.latest.quotes).length).toBeGreaterThan(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('partial WebKincstár success overlays the healthy report and marks the other fetch_failed', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-wk-partial-'))
    try {
      const report = await ingestMarketData({
        root: dir,
        rawDir: path.join(dir, 'raw'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        webkincstarDatum: '2026-11-05',
        webkincstarTextByReport: {
          _20631_arfolyam_dkj: `
Diszkont Kincstárjegyek                                                                 Értéknap: 2026.11.05
D261125             99.6650 %      6.13 %   6.05 %            -             -           -            20        2026.11.25
`,
          _20633_arfolyam_mak: loadText('mak-2026-11-08-empty.txt')
          // remaining §6n reports omitted → offline soft-fail (no POST)
        },
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarSoftFailed).toBe(true)
      expect(report.webkincstarUpdated).toBe(true)
      expect(report.webkincstarOverlaySkipped).toBe(0)
      const days = report.tree.priceCalendar?.days ?? []
      expect(
        days.find(
          (d) => d.report === '_20631_arfolyam_dkj' && d.datum === '2026-11-05'
        )?.status
      ).toBe('priced')
      expect(
        days.find(
          (d) => d.report === '_20633_arfolyam_mak' && d.datum === '2026-11-05'
        )?.status
      ).toBe('fetch_failed')
      expect(
        days.find(
          (d) => d.report === '_207461_arfolyam_mapp' && d.datum === '2026-11-05'
        )?.status
      ).toBe('fetch_failed')
      const quotes = JSON.parse(
        await readFile(
          path.join(dir, 'data/market/v2/families/dkj/quotes/D261125.json'),
          'utf8'
        )
      )
      const row = quotes.rows.find((r: QuoteRow) => r[0] === '2026-11-05')
      expect(row?.[1]).toBe(99.665)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('ingest §6n reports fills mapp/emap/baba ask when PDF prints eladási', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-wk-6n-'))
    try {
      // Seed prior series so overlay can join PDF short names onto catalog ids.
      const seed = await ingestMarketData({
        root: dir,
        rawDir: path.join(dir, 'raw-seed'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        allampapirPrices: {
          MAPP: loadJson('allampapir/prices_MAPP.json'),
          EMAP: loadJson('allampapir/prices_EMAP.json'),
          BABA: loadJson('allampapir/prices_BABA.json')
        },
        skipInflation: true,
        skipRetailInterest: true,
        skipWebkincstar: true,
        generatedAt: '2026-11-04T18:00:00.000Z'
      })
      expect(seed.changed).toBe(true)

      const report = await ingestMarketData({
        root: dir,
        previousRoot: dir,
        rawDir: path.join(dir, 'raw'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        webkincstarDatum: '2026-11-05',
        webkincstarTextByReport: {
          _20631_arfolyam_dkj: loadText('dkj-2026-11-05.txt'),
          _20633_arfolyam_mak: loadText('mak-2026-11-05.txt'),
          _207461_arfolyam_mapp: loadText('mapp-2026-11-05.txt'),
          _20638_arfolyam_pemak: loadText('pemak-2026-11-05.txt'),
          _20642_arfolyam_start: loadText('start-2026-11-05.txt'),
          _20632_arfolyam_kkj: loadText('kkj-2026-11-05-empty.txt')
        },
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarSoftFailed).toBe(false)
      expect(report.webkincstarUpdated).toBe(true)
      // Full fixture PDFs soft-skip unmatched names → calendar may stay non-durable;
      // matched eladási asks still overlay.

      const mappSeries = report.tree.families.mapp.series.series.find(
        (s) => s.name === '2031/M6'
      )
      expect(mappSeries).toBeTruthy()
      const mappQuotes = report.tree.families.mapp.quotes[mappSeries!.id]
      const mappRow = mappQuotes?.rows.find((r) => r[0] === '2026-11-05')
      expect(mappRow?.[2]).toBe(100) // eladási ask

      const babaSeries = report.tree.families.baba.series.series.find(
        (s) => s.name === '2045/S_BABA' || s.name === '2032/S_BABA'
      )
      expect(babaSeries).toBeTruthy()
      const babaId =
        report.tree.families.baba.series.series.find((s) => s.name === '2032/S_BABA')
          ?.id ?? babaSeries!.id
      const babaRow = report.tree.families.baba.quotes[babaId]?.rows.find(
        (r) => r[0] === '2026-11-05'
      )
      expect(babaRow?.[2]).toBe(100)

      const emapSeries = report.tree.families.emap.series.series.find(
        (s) => s.name === '2029/U_EUR'
      )
      expect(emapSeries).toBeTruthy()
      const emapRow = report.tree.families.emap.quotes[emapSeries!.id]?.rows.find(
        (r) => r[0] === '2026-11-05'
      )
      expect(emapRow?.[2]).toBe(100)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('ingest priced day updates DKJ quotes and price calendar', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-wk-priced-'))
    try {
      const report = await ingestMarketData({
        root: dir,
        rawDir: path.join(dir, 'raw'),
        catalog: loadJson<AkkEnvelope>('catalog.json'),
        networkRates: loadJson<AkkEnvelope>('network-rates.json'),
        skipAllampapir: true,
        skipInflation: true,
        skipRetailInterest: true,
        webkincstarDatum: '2026-11-05',
        webkincstarTextByReport: joinablePricedTextByReport(),
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarSoftFailed).toBe(false)
      expect(report.webkincstarOverlaySkipped).toBe(0)
      expect(report.webkincstarUpdated).toBe(true)
      expect(report.changed).toBe(true)
      const quotes = JSON.parse(
        await readFile(
          path.join(dir, 'data/market/v2/families/dkj/quotes/D261125.json'),
          'utf8'
        )
      )
      const row = quotes.rows.find((r: QuoteRow) => r[0] === '2026-11-05')
      expect(row?.[1]).toBe(99.665) // WebKincstár vételi for D261125
      const cal = JSON.parse(
        await readFile(path.join(dir, 'data/market/v2', PRICE_CALENDAR_REF_PATH), 'utf8')
      )
      expect(cal.days.some((d: { status: string }) => d.status === 'priced')).toBe(true)
      expect(cal.reports).toEqual(
        expect.arrayContaining([
          '_20631_arfolyam_dkj',
          '_20633_arfolyam_mak',
          '_207461_arfolyam_mapp',
          '_20638_arfolyam_pemak',
          '_20642_arfolyam_start',
          '_20632_arfolyam_kkj'
        ])
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
