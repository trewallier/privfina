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
      textByReport: {
        _20631_arfolyam_dkj: loadText('dkj-2026-11-05.txt'),
        _20633_arfolyam_mak: loadText('mak-2026-11-05.txt')
      }
    })
    expect(result.reports).toHaveLength(2)
    expect(result.reports[0].parsed.status).toBe('priced')
    expect(result.reports[1].parsed.status).toBe('priced')
  })

  it('budapestYesterdayIso uses Europe/Budapest calendar day', () => {
    // 2026-11-08 00:30 UTC = still 2026-11-08 in Budapest → yesterday 2026-11-07
    const utc = new Date('2026-11-08T00:30:00.000Z')
    expect(budapestYesterdayIso(utc)).toBe('2026-11-07')
    // 2026-11-07 23:30 UTC = 2026-11-08 in Budapest → yesterday 2026-11-07
    const lateUtc = new Date('2026-11-07T23:30:00.000Z')
    expect(budapestYesterdayIso(lateUtc)).toBe('2026-11-07')
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
        webkincstarTextByReport: {
          // Force Értéknap mismatch → soft-fail path
          _20631_arfolyam_dkj: loadText('dkj-2026-11-08-empty.txt'),
          _20633_arfolyam_mak: loadText('mak-2026-11-08-empty.txt')
        },
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarSoftFailed).toBe(true)
      expect(report.changed).toBe(true)
      expect(report.tree.priceCalendar?.days.every((d) => d.status === 'fetch_failed')).toBe(
        true
      )
      const cal = JSON.parse(
        await readFile(path.join(dir, 'data/market/v2', PRICE_CALENDAR_REF_PATH), 'utf8')
      )
      expect(cal.source.id).toBe('webkincstar-report-service')
      expect(cal.source.disclaimer).toMatch(/informational/i)
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
        webkincstarTextByReport: {
          _20631_arfolyam_dkj: loadText('dkj-2026-11-05.txt'),
          _20633_arfolyam_mak: loadText('mak-2026-11-05.txt')
        },
        generatedAt: '2026-11-05T18:00:00.000Z'
      })
      expect(report.webkincstarSoftFailed).toBe(false)
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
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
