import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildApToCanonicalIdMap,
  combineQuoteRows,
  combineSnapshots
} from '../tools/market-data/combine.ts'
import { familyFromAllampapirPaper } from '../tools/market-data/families.ts'
import {
  AllampapirFetchError,
  CookieJar,
  CsrfSession,
  fetchAllampapirSnapshots,
  postJsonWithSession
} from '../tools/market-data/fetch-allampapir.ts'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import { loadMarketTree } from '../tools/market-data/io.ts'
import { normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import { normalizeAllampapirSnapshots } from '../tools/market-data/normalize-allampapir.ts'
import type {
  AkkEnvelope,
  AllampapirEnvelope,
  SeriesRecord
} from '../tools/market-data/types.ts'
import { emptyNormalizedByFamily } from '../tools/market-data/types.ts'

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'market-data'
)
const apDir = path.join(fixturesDir, 'allampapir')

async function loadAkk(name: string): Promise<AkkEnvelope> {
  return JSON.parse(await readFile(path.join(fixturesDir, name), 'utf8')) as AkkEnvelope
}

async function loadAllampapirFixtures(): Promise<Record<string, AllampapirEnvelope>> {
  const prices: Record<string, AllampapirEnvelope> = {}
  for (const name of await readdir(apDir)) {
    const m = /^prices_(.+)\.json$/i.exec(name)
    if (!m) continue
    prices[m[1]] = JSON.parse(
      await readFile(path.join(apDir, name), 'utf8')
    ) as AllampapirEnvelope
  }
  return prices
}

describe('familyFromAllampapirPaper', () => {
  it('routes MAP rows by securityType and paper defaults otherwise', () => {
    expect(familyFromAllampapirPaper('DKJ', 'DKJ')).toBe('dkj')
    expect(familyFromAllampapirPaper('MAP', 'PMÁP')).toBe('pmap')
    expect(familyFromAllampapirPaper('MAP', 'BMÁP')).toBe('bmap')
    expect(familyFromAllampapirPaper('MAP', 'FixMÁP')).toBe('fixmap')
    expect(familyFromAllampapirPaper('MAP', 'KTV')).toBe('ktv')
    expect(familyFromAllampapirPaper('MAPP', 'MÁP Plusz')).toBe('mapp')
    expect(familyFromAllampapirPaper('BABA', 'BABA')).toBe('baba')
    expect(familyFromAllampapirPaper('EMAP', 'EMÁP')).toBe('emap')
    expect(familyFromAllampapirPaper('1MAP')).toBe('omap')
    expect(familyFromAllampapirPaper('MAP')).toBeNull()
  })
})

describe('normalizeAllampapirSnapshots', () => {
  it('parses HU numbers/dates and splits MAP subtypes into families', async () => {
    const prices = await loadAllampapirFixtures()
    const snap = normalizeAllampapirSnapshots(prices)
    expect(snap.asOf).toBe('2026-11-02')
    expect(snap.byFamily.dkj.quotes.some((q) => q.id === 'D261125')).toBe(true)
    expect(snap.byFamily.dkj.quotes.find((q) => q.id === 'D261223')?.row[2]).toBe(99.3512)
    expect(snap.byFamily.pmap.series.some((s) => s.id === 'A270324I22')).toBe(true)
    expect(snap.byFamily.bmap.series.some((s) => s.id === 'A280322N17')).toBe(true)
    expect(snap.byFamily.fixmap.quotes.length).toBeGreaterThan(0)
    expect(snap.byFamily.ktv.quotes.length).toBeGreaterThan(0)
    expect(snap.byFamily.mapp.quotes.length).toBeGreaterThan(0)
    expect(snap.byFamily.baba.quotes.length).toBeGreaterThan(0)
    expect(snap.byFamily.emap.quotes.length).toBeGreaterThan(0)
    expect(snap.byFamily.omap.quotes.length).toBe(0)
  })
})

describe('combineSnapshots', () => {
  it('prefers allampapir when same-day quote numerics differ', () => {
    expect(
      combineQuoteRows(
        ['2026-11-02', 99.0, null, 6.0, null, 0],
        ['2026-11-02', 99.1, 99.2, 5.9, 5.8, 0.1]
      )
    ).toEqual(['2026-11-02', 99.1, 99.2, 5.9, 5.8, 0.1])
    expect(
      combineQuoteRows(
        ['2026-11-02', 99.0, null, 6.0, null, 0],
        ['2026-11-02', null, 99.2, null, null, null]
      )
    ).toEqual(['2026-11-02', 99.0, 99.2, 6.0, null, 0])
  })

  it('merges ÁKK catalog isin with allampapir ask fill for overlapping DKJ', async () => {
    const catalog = await loadAkk('catalog.json')
    const rates = await loadAkk('network-rates.json')
    const akk = normalizeAkkSnapshots(catalog, rates, { requireFamilies: false })
    const ap = normalizeAllampapirSnapshots(await loadAllampapirFixtures())
    const { snapshot: combined, dualSource, stats } = combineSnapshots(akk, ap)

    expect(dualSource).toBe(true)
    expect(stats.idJoins).toBeGreaterThan(0)

    const dkj = combined.byFamily.dkj
    const series = dkj.series.find((s) => s.id === 'D261125')
    expect(series?.isin).toBe('HU0000525000')
    const row = dkj.quotes.find((q) => q.id === 'D261125')?.row
    expect(row?.[1]).toBe(99.615)
    expect(row?.[2]).toBeNull()

    const withAsk = dkj.quotes.find((q) => q.id === 'D261223')?.row
    expect(withAsk?.[2]).toBe(99.3512)
    expect(dkj.series.find((s) => s.id === 'D261223')?.isin).toBeNull()

    expect(combined.byFamily.mapp.quotes.length).toBeGreaterThan(0)
    expect(combined.byFamily.baba.quotes.length).toBeGreaterThan(0)
  })

  it('joins divergent labels on shared ISIN (ÁKK id wins)', () => {
    const akkSeries = new Map<string, SeriesRecord>([
      [
        'A270324I22',
        {
          id: 'A270324I22',
          isin: 'HU0000405584',
          name: '2027/I',
          issue: '2022-01-21',
          mat: '2027-03-24',
          ccy: 'HUF',
          status: 'active'
        }
      ]
    ])
    const apSeries = new Map<string, SeriesRecord>([
      [
        'OTHER_LABEL_2027I',
        {
          id: 'OTHER_LABEL_2027I',
          isin: 'HU0000405584',
          name: 'Other Label 2027/I',
          issue: '2022-01-21',
          mat: '2027-03-24',
          ccy: 'HUF',
          status: 'active'
        }
      ]
    ])
    const { alias, stats } = buildApToCanonicalIdMap(akkSeries, apSeries)
    expect(alias.get('OTHER_LABEL_2027I')).toBe('A270324I22')
    expect(stats.isinJoins).toBe(1)
    expect(stats.idJoins).toBe(0)

    const akk = {
      asOf: '2026-11-02',
      byFamily: emptyNormalizedByFamily()
    }
    akk.byFamily.pmap.series = [akkSeries.get('A270324I22')!]
    akk.byFamily.pmap.quotes = [
      { id: 'A270324I22', row: ['2026-11-02', 100.12, 100.25, 4.1, 4.0, 1.2] }
    ]
    // Required families need quotes — seed dkj/bmap minimally.
    akk.byFamily.dkj.series = [
      {
        id: 'D261125',
        isin: 'HU0000525000',
        name: 'D261125',
        issue: '2026-07-29',
        mat: '2026-11-25',
        ccy: 'HUF',
        status: 'active'
      }
    ]
    akk.byFamily.dkj.quotes = [
      { id: 'D261125', row: ['2026-11-02', 99.615, null, 6.05, null, 0] }
    ]
    akk.byFamily.bmap.series = [
      {
        id: 'A280322N17',
        isin: 'HU0000403423',
        name: '2028/N',
        issue: '2017-10-03',
        mat: '2028-03-22',
        ccy: 'HUF',
        status: 'active'
      }
    ]
    akk.byFamily.bmap.quotes = [
      { id: 'A280322N17', row: ['2026-11-02', 101.5, 101.7, 5.2, 5.1, 0.5] }
    ]

    const ap = {
      asOf: '2026-11-02',
      byFamily: emptyNormalizedByFamily()
    }
    ap.byFamily.pmap.series = [apSeries.get('OTHER_LABEL_2027I')!]
    ap.byFamily.pmap.quotes = [
      { id: 'OTHER_LABEL_2027I', row: ['2026-11-02', 99.0, 100.25, null, null, 3.6047] }
    ]

    const { snapshot, stats: combineStats } = combineSnapshots(akk, ap)
    expect(combineStats.isinJoins).toBe(1)
    expect(snapshot.byFamily.pmap.series.map((s) => s.id)).toEqual(['A270324I22'])
    expect(snapshot.byFamily.pmap.series[0].isin).toBe('HU0000405584')
    expect(snapshot.byFamily.pmap.quotes).toHaveLength(1)
    expect(snapshot.byFamily.pmap.quotes[0].id).toBe('A270324I22')
    expect(snapshot.byFamily.pmap.quotes[0].row).toEqual([
      '2026-11-02',
      99.0,
      100.25,
      4.1,
      4.0,
      3.6047
    ])
  })
})

describe('dual-source cutover merge', () => {
  it('rewrites same settleDate when ÁKK-only baseline meets dual-source ingest', async () => {
    const catalog = await loadAkk('catalog.json')
    const rates = await loadAkk('network-rates.json')
    const allampapirPrices = await loadAllampapirFixtures()
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-cutover-'))
    try {
      const baseline = await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw1'),
        catalog,
        networkRates: rates,
        skipAllampapir: true,
        generatedAt: '2026-11-02T17:00:00+01:00'
      })
      expect(baseline.dualSource).toBe(false)
      expect(baseline.changed).toBe(true)
      const before = await loadMarketTree(tmp)
      expect(before.families.pmap.latest.quotes.A270324I22?.bid).toBe(100.12)
      expect(before.families.pmap.latest.quotes.A270324I22?.ai).toBe(1.2)

      const cutover = await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw2'),
        catalog,
        networkRates: rates,
        allampapirPrices,
        generatedAt: '2026-11-02T18:00:00+01:00'
      })
      expect(cutover.dualSource).toBe(true)
      expect(cutover.changed).toBe(true)
      expect(cutover.rewrittenRows).toBeGreaterThan(0)

      const after = await loadMarketTree(tmp)
      // allampapir fixture fills ai / bid for overlapping PMÁP on same settleDate
      expect(after.families.pmap.latest.quotes.A270324I22?.d).toBe('2026-11-02')
      expect(after.families.pmap.quotes.A270324I22.rows).toHaveLength(1)
      expect(after.families.mapp.series.series.length).toBeGreaterThan(0)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('dual-source ingestMarketData', () => {
  it('writes optional families and treasury-prefer digests in one tree', async () => {
    const catalog = await loadAkk('catalog.json')
    const rates = await loadAkk('network-rates.json')
    const allampapirPrices = await loadAllampapirFixtures()
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-ap-'))
    try {
      const report = await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        allampapirPrices,
        generatedAt: '2026-11-02T18:00:00+01:00'
      })
      expect(report.changed).toBe(true)
      expect(report.dualSource).toBe(true)
      const loaded = await loadMarketTree(tmp)
      expect(loaded.manifest?.families).toEqual(
        expect.arrayContaining(['dkj', 'pmap', 'bmap', 'mapp', 'baba', 'emap', 'fixmap', 'ktv'])
      )
      expect(loaded.manifest?.families).not.toContain('omap')
      expect(loaded.families.dkj.latest.quotes.D261223?.ask).toBe(99.3512)
      expect(loaded.families.dkj.series.series.find((s) => s.id === 'D261125')?.isin).toBe(
        'HU0000525000'
      )
      expect(loaded.families.mapp.series.series.length).toBeGreaterThan(0)

      const second = await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        allampapirPrices,
        generatedAt: '2026-11-02T19:00:00+01:00'
      })
      expect(second.changed).toBe(false)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('fetchAllampapir CSRF session', () => {
  it('bootstraps CSRF once and reuses the token across POSTs', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-csrf-'))
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/api/csrf')) {
        return new Response(
          JSON.stringify({
            status: true,
            message: 'ok',
            data: { headerName: 'X-CSRF-TOKEN', token: 'tok-1', tokenName: 'csrf' }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json', 'set-cookie': 'csrf_cookie=abc' }
          }
        )
      }
      if (url.includes('get_papers_with_prices')) {
        return new Response(
          JSON.stringify({
            status: true,
            message: 'ok',
            data: {
              papers: {
                DKJ: { name: 'DKJ', fields: ['name'] },
                '1MAP': { name: '1MAP', fields: ['name'] }
              }
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      if (url.includes('get_prices')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { paper?: string }
        return new Response(
          JSON.stringify({
            status: true,
            message: 'ok',
            data: { settle_date: '2026.11.02', data: [] }
          }),
          {
            status: body.paper === '1MAP' ? 404 : 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }
      return new Response('nope', { status: 404 })
    }

    try {
      const result = await fetchAllampapirSnapshots({
        rawDir: tmp,
        fetchImpl,
        retries: 2,
        backoffMs: 1
      })
      expect(result.papers).toEqual(['1MAP', 'DKJ'])
      expect(calls.filter((c) => c.includes('/api/csrf'))).toHaveLength(1)
      expect(calls.filter((c) => c.includes('get_papers_with_prices'))).toHaveLength(1)
      expect(calls.filter((c) => c.includes('get_prices'))).toHaveLength(2)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('refreshes CSRF on csrf_failed and retries; does not retry hard 4xx shape', async () => {
    const jar = new CookieJar()
    const baseUrl = 'https://www.allampapir.hu'
    let csrfCalls = 0
    let postCalls = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/api/csrf')) {
        csrfCalls += 1
        return new Response(
          JSON.stringify({
            status: true,
            data: { headerName: 'X-CSRF-TOKEN', token: `tok-${csrfCalls}` }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      postCalls += 1
      if (postCalls === 1) {
        return new Response(JSON.stringify({ message: 'csrf_failed', status: false }), {
          status: 403,
          headers: { 'content-type': 'application/json' }
        })
      }
      return new Response(
        JSON.stringify({ status: true, data: { papers: { DKJ: { name: 'DKJ', fields: [] } } } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    const session = new CsrfSession(baseUrl, jar, fetchImpl, 'test-ua')
    const ok = await postJsonWithSession(
      `${baseUrl}/api/networkRate/get_papers_with_prices`,
      {},
      `${baseUrl}/kincstari_arfolyamjegyzes/`,
      session,
      3,
      1
    )
    expect(ok.status).toBe(200)
    expect(csrfCalls).toBe(2)
    expect(postCalls).toBe(2)

    const badFetch: typeof fetch = async (input) => {
      if (String(input).endsWith('/api/csrf')) {
        return new Response(
          JSON.stringify({
            status: true,
            data: { headerName: 'X-CSRF-TOKEN', token: 't' }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ status: false, message: 'nope' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    }
    const session2 = new CsrfSession(baseUrl, new CookieJar(), badFetch, 'test-ua')
    // postJson returns 400 envelope; caller classifies — session itself does not throw on 400 JSON
    const bad = await postJsonWithSession(
      `${baseUrl}/api/networkRate/get_papers_with_prices`,
      {},
      `${baseUrl}/`,
      session2,
      3,
      1
    )
    expect(bad.status).toBe(400)

    const badDir = await mkdtemp(path.join(os.tmpdir(), 'privfina-csrf-bad-'))
    try {
      await expect(
        fetchAllampapirSnapshots({
          rawDir: badDir,
          fetchImpl: badFetch,
          retries: 2,
          backoffMs: 1
        })
      ).rejects.toBeInstanceOf(AllampapirFetchError)
    } finally {
      await rm(badDir, { recursive: true, force: true })
    }
  })
})
