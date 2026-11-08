import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  budapestYesterdayIso,
  fetchWebkincstarSnapshots
} from '../tools/market-data/fetch-webkincstar.ts'
import {
  assertErteknapMatchesDatum,
  familyFromWebkincstarInstrumentName,
  parseErteknap,
  parseWebkincstarPdfText,
  WebkincstarParseError
} from '../tools/market-data/parse-webkincstar-pdf.ts'
import { normalizeWebkincstarReports } from '../tools/market-data/normalize-webkincstar.ts'

const fixturesRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/market-data/webkincstar'
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
