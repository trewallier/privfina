import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { digestRetailInterest } from '../tools/market-data/digests.ts'
import { familyFromRetailInterest } from '../tools/market-data/families.ts'
import {
  AllampapirFetchError,
  CookieJar,
  CsrfSession
} from '../tools/market-data/fetch-allampapir.ts'
import { fetchRetailInterestSnapshots } from '../tools/market-data/fetch-retail-interest.ts'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import { emptyMarketTree, mergeSnapshot } from '../tools/market-data/merge.ts'
import {
  joinRetailInterestToCoupons,
  normalizeRetailInterestEnvelope,
  parseRetailRateBands
} from '../tools/market-data/normalize-retail-interest.ts'
import { type AllampapirEnvelope, type SeriesRecord } from '../tools/market-data/types.ts'
import { validateMarketTree } from '../tools/market-data/validate.ts'
import { normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import { readFileSync } from 'node:fs'

const fixtureRoot = path.join(process.cwd(), 'tests/fixtures/market-data')

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(fixtureRoot, rel), 'utf8')) as T
}

const tmpDirs: string[] = []

afterEach(async () => {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

describe('retail interest normalize (ADR 0036 / 0038)', () => {
  it('maps family from type/place including KTJ / 2MÁP stubs', () => {
    expect(familyFromRetailInterest('FixMÁP', 'FIX_MAP')).toBe('fixmap')
    expect(familyFromRetailInterest('PMÁP', 'PMAP')).toBe('pmap')
    expect(familyFromRetailInterest('MÁP Plusz', 'MAPP')).toBe('mapp')
    expect(familyFromRetailInterest('nyomdai MÁP Plusz', 'MAPP_F')).toBe('mapp')
    expect(familyFromRetailInterest('KTJ I', 'KTJ')).toBe('ktj')
    expect(familyFromRetailInterest('2MÁP', '2MAP')).toBe('map2')
  })

  it('parses stepped rate bands without collapsing to the first value', () => {
    expect(parseRetailRateBands(null, '4,50 - 5,75')).toEqual([4.5, 5.75])
    expect(parseRetailRateBands(5, '5,00 - 6,00 %')).toEqual([5, 6])
    expect(parseRetailRateBands(5.5, '5,50 %')).toEqual([5.5])
  })

  it('normalizes get_all_data fixture into multi-band rates (no prem)', () => {
    const envelope = loadJson<AllampapirEnvelope>('retail-interest/get_all_data.json')
    const file = normalizeRetailInterestEnvelope(envelope, {
      generatedAt: '2026-11-01T12:00:00.000Z'
    })

    expect(file.schemaVersion).toBe(2)
    expect(file.asOf).toBe('2026-10-01')
    expect(file.rows.length).toBe(7)

    const fixOffered = file.rows.find((r) => r.series === '2029/Q2')
    expect(fixOffered).toMatchObject({
      id: '2029_Q2',
      family: 'fixmap',
      rates: [5.5],
      ehm: 5.62,
      from: '2026-10-01',
      to: null,
      offered: true,
      mat: '2029-10-25'
    })

    const fixPast = file.rows.find((r) => r.series === '2029/Q1')
    expect(fixPast?.offered).toBe(false)
    expect(fixPast?.to).toBe('2026-09-30')

    const pmap = file.rows.find((r) => r.series === '2036/I1')
    expect(pmap).toMatchObject({
      family: 'pmap',
      rates: [4.5],
      offered: true
    })

    const ktj = file.rows.find((r) => r.series === 'KTJ_I')
    expect(ktj?.family).toBe('ktj')
    expect(ktj?.offered).toBe(true)

    const mapp = file.rows.find((r) => r.series === '2031/M6')
    // Stepped "5,00 - 6,00 %" → both bands (never first-band-only).
    expect(mapp?.rates).toEqual([5, 6])
    expect(mapp?.family).toBe('mapp')
  })
})

describe('retail interest join → coupons + merge', () => {
  function seedJoinableSeries(): SeriesRecord {
    return {
      id: '2029_Q2',
      isin: null,
      name: '2029/Q2',
      issue: '2026-10-01',
      mat: '2029-10-25',
      ccy: 'HUF',
      status: 'active',
      dayCount: 'ACT/360'
    }
  }

  it('joins kamatok onto series ids and digests coupons (not refs)', () => {
    const envelope = loadJson<AllampapirEnvelope>('retail-interest/get_all_data.json')
    const retail = normalizeRetailInterestEnvelope(envelope, {
      generatedAt: '2026-11-01T12:00:00.000Z'
    })
    const catalog = loadJson('catalog.json')
    const rates = loadJson('network-rates.json')
    const snapshot = normalizeAkkSnapshots(catalog as never, rates as never, {
      requireFamilies: false
    })
    snapshot.byFamily.fixmap.series.push(seedJoinableSeries())

    const first = mergeSnapshot(emptyMarketTree(), snapshot, {
      generatedAt: '2026-11-01T12:00:00.000Z',
      retailInterest: retail
    })
    expect(first.changed).toBe(true)
    expect(first.tree.manifest?.refs?.retailInterest).toBeUndefined()
    expect(first.tree.manifest?.digests['refs/retail-interest.json']).toBeUndefined()

    const coupon = first.tree.families.fixmap.coupons['2029_Q2']
    expect(coupon?.rows).toEqual([['2026-10-01', null, 5.5]])
    expect(first.tree.manifest?.digests['families/fixmap/coupons/2029_Q2.json']).toBeTruthy()
    expect(
      first.tree.families.fixmap.series.series.find((s) => s.id === '2029_Q2')?.offered
    ).toBe(true)
    expect(first.tree.retailInterest?.rows).toHaveLength(7)
    validateMarketTree(first.tree)

    const stampedLater = {
      ...retail,
      generatedAt: '2026-11-02T08:00:00.000Z'
    }
    expect(digestRetailInterest(stampedLater)).toBe(digestRetailInterest(retail))
    const same = mergeSnapshot(first.tree, snapshot, {
      generatedAt: '2026-11-02T08:00:00.000Z',
      retailInterest: stampedLater
    })
    expect(same.changed).toBe(false)
    expect(same.tree.retailInterest?.generatedAt).toBe(first.tree.retailInterest!.generatedAt)
    expect(same.tree.families.fixmap.coupons['2029_Q2']?.rows).toEqual([
      ['2026-10-01', null, 5.5]
    ])

    const updatedRetail = {
      ...retail,
      generatedAt: '2026-11-01T13:00:00.000Z',
      rows: retail.rows.map((r) =>
        r.series === '2029/Q2' ? { ...r, rates: [5.75] } : { ...r, rates: [...r.rates] }
      )
    }
    const changed = mergeSnapshot(first.tree, snapshot, {
      generatedAt: '2026-11-01T13:00:00.000Z',
      retailInterest: updatedRetail
    })
    expect(changed.changed).toBe(true)
    expect(changed.tree.families.fixmap.coupons['2029_Q2']?.rows).toEqual([
      ['2026-10-01', null, 5.75]
    ])
  })

  it('joinRetailInterestToCoupons expands multi-band rates into distinct rows', () => {
    const retail = {
      schemaVersion: 2 as const,
      asOf: '2026-10-01',
      generatedAt: '2026-11-01T12:00:00.000Z',
      rows: [
        {
          id: '2029_Q2',
          family: 'fixmap' as const,
          series: '2029/Q2',
          type: 'FixMÁP',
          rates: [4.5, 5.75],
          ehm: null,
          from: '2026-10-01',
          to: null,
          offered: true
        }
      ]
    }
    const joined = joinRetailInterestToCoupons(retail, {
      fixmap: [seedJoinableSeries()]
    })
    expect(joined.couponsByFamily.fixmap?.['2029_Q2']?.rows).toEqual([
      ['2026-10-01', null, 4.5],
      ['2026-10-01', null, 5.75]
    ])
  })

  it('offeredById prefers the latest period (max from), not input order alone', () => {
    const retail = {
      schemaVersion: 2 as const,
      asOf: '2026-11-01',
      generatedAt: '2026-11-01T12:00:00.000Z',
      rows: [
        {
          id: '2029_Q2',
          family: 'fixmap' as const,
          series: '2029/Q2',
          type: 'FixMÁP',
          rates: [5.5],
          ehm: null,
          from: '2026-10-01',
          to: '2026-10-31',
          offered: true
        },
        {
          id: '2029_Q2',
          family: 'fixmap' as const,
          series: '2029/Q2',
          type: 'FixMÁP',
          rates: [5.75],
          ehm: null,
          from: '2026-11-01',
          to: null,
          offered: false
        },
        {
          id: '2029_Q2',
          family: 'fixmap' as const,
          series: '2029/Q2',
          type: 'FixMÁP',
          rates: [5.0],
          ehm: null,
          from: '2026-09-01',
          to: '2026-09-30',
          offered: true
        }
      ]
    }
    const joined = joinRetailInterestToCoupons(retail, {
      fixmap: [seedJoinableSeries()]
    })
    expect(joined.offeredById['2029_Q2']).toBe(false)
  })

  it('treats empty successful retailInterest as soft-fail when prior coupons exist', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-ri-empty-'))
    tmpDirs.push(tmp)
    const envelope = loadJson<AllampapirEnvelope>('retail-interest/get_all_data.json')

    await ingestMarketData({
      root: tmp,
      rawDir: path.join(tmp, 'raw1'),
      catalog: loadJson('catalog.json'),
      networkRates: loadJson('network-rates.json'),
      allampapirPrices: {
        DKJ: loadJson('allampapir/prices_DKJ.json'),
        MAP: loadJson('allampapir/prices_MAP.json'),
        MAPP: loadJson('allampapir/prices_MAPP.json'),
        BABA: loadJson('allampapir/prices_BABA.json'),
        EMAP: loadJson('allampapir/prices_EMAP.json'),
        '1MAP': loadJson('allampapir/prices_1MAP.json')
      },
      retailInterestEnvelope: envelope,
      generatedAt: '2026-11-01T12:00:00.000Z'
    })

    const couponPath = path.join(
      tmp,
      'data/market/v2/families/mapp/coupons/A311127M26.json'
    )
    const kept = JSON.parse(await readFile(couponPath, 'utf8'))

    const emptyEnvelope: AllampapirEnvelope = {
      status: true,
      message: 'ok',
      data: { data: [] }
    }
    const emptied = await ingestMarketData({
      root: tmp,
      previousRoot: tmp,
      rawDir: path.join(tmp, 'raw2'),
      catalog: loadJson('catalog.json'),
      networkRates: loadJson('network-rates.json'),
      allampapirPrices: {
        DKJ: loadJson('allampapir/prices_DKJ.json'),
        MAP: loadJson('allampapir/prices_MAP.json'),
        MAPP: loadJson('allampapir/prices_MAPP.json'),
        BABA: loadJson('allampapir/prices_BABA.json'),
        EMAP: loadJson('allampapir/prices_EMAP.json'),
        '1MAP': loadJson('allampapir/prices_1MAP.json')
      },
      retailInterestEnvelope: emptyEnvelope,
      generatedAt: '2026-11-01T14:00:00.000Z'
    })
    expect(emptied.retailInterestSoftFailed).toBe(true)
    expect(emptied.retailInterestUpdated).toBe(false)
    expect(JSON.parse(await readFile(couponPath, 'utf8'))).toEqual(kept)
  })

  it('keeps previous coupons when offline without envelope', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-ri-'))
    tmpDirs.push(tmp)
    const envelope = loadJson<AllampapirEnvelope>('retail-interest/get_all_data.json')

    const seeded = await ingestMarketData({
      root: tmp,
      rawDir: path.join(tmp, 'raw1'),
      catalog: loadJson('catalog.json'),
      networkRates: loadJson('network-rates.json'),
      allampapirPrices: {
        DKJ: loadJson('allampapir/prices_DKJ.json'),
        MAP: loadJson('allampapir/prices_MAP.json'),
        MAPP: loadJson('allampapir/prices_MAPP.json'),
        BABA: loadJson('allampapir/prices_BABA.json'),
        EMAP: loadJson('allampapir/prices_EMAP.json'),
        '1MAP': loadJson('allampapir/prices_1MAP.json')
      },
      retailInterestEnvelope: envelope,
      generatedAt: '2026-11-01T12:00:00.000Z'
    })
    expect(seeded.changed).toBe(true)
    expect(seeded.retailInterestUpdated).toBe(true)

    // 2031/M6 from MAPP prices joins onto A311127M26
    const couponPath = path.join(
      tmp,
      'data/market/v2/families/mapp/coupons/A311127M26.json'
    )
    const publishedCoupon = JSON.parse(await readFile(couponPath, 'utf8'))
    expect(publishedCoupon.rows).toEqual([
      ['2026-10-01', null, 5],
      ['2026-10-01', null, 6]
    ])

    const mappSeries = JSON.parse(
      await readFile(path.join(tmp, 'data/market/v2/families/mapp/series.json'), 'utf8')
    )
    const m6 = mappSeries.series.find(
      (s: { name: string; id: string }) => s.name === '2031/M6' || s.id === 'A311127M26'
    )
    expect(m6?.offered).toBe(true)
    expect(m6).not.toHaveProperty('prem')

    // Flat refs must not be written
    await expect(
      readFile(path.join(tmp, 'data/market/v2/refs/retail-interest.json'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' })

    const again = await ingestMarketData({
      root: tmp,
      previousRoot: tmp,
      rawDir: path.join(tmp, 'raw2'),
      catalog: loadJson('catalog.json'),
      networkRates: loadJson('network-rates.json'),
      allampapirPrices: {
        DKJ: loadJson('allampapir/prices_DKJ.json'),
        MAP: loadJson('allampapir/prices_MAP.json'),
        MAPP: loadJson('allampapir/prices_MAPP.json'),
        BABA: loadJson('allampapir/prices_BABA.json'),
        EMAP: loadJson('allampapir/prices_EMAP.json'),
        '1MAP': loadJson('allampapir/prices_1MAP.json')
      },
      skipRetailInterest: true,
      generatedAt: '2026-11-01T14:00:00.000Z'
    })
    expect(again.retailInterestUpdated).toBe(false)
    expect(again.retailInterestSoftFailed).toBe(false)
    const publishedAgain = JSON.parse(await readFile(couponPath, 'utf8'))
    expect(publishedAgain).toEqual(publishedCoupon)
  })

  it('soft-fails live retailInterest and still publishes the price tree', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-ri-soft-'))
    tmpDirs.push(tmp)
    const envelope = loadJson<AllampapirEnvelope>('retail-interest/get_all_data.json')
    const catalog = loadJson('catalog.json')
    const rates = loadJson('network-rates.json')
    const pricesDkj = loadJson('allampapir/prices_DKJ.json')

    await ingestMarketData({
      root: tmp,
      rawDir: path.join(tmp, 'raw-seed'),
      catalog,
      networkRates: rates,
      allampapirPrices: {
        DKJ: pricesDkj,
        MAP: loadJson('allampapir/prices_MAP.json'),
        MAPP: loadJson('allampapir/prices_MAPP.json'),
        BABA: loadJson('allampapir/prices_BABA.json'),
        EMAP: loadJson('allampapir/prices_EMAP.json'),
        '1MAP': loadJson('allampapir/prices_1MAP.json')
      },
      retailInterestEnvelope: envelope,
      generatedAt: '2026-11-01T12:00:00.000Z'
    })

    const couponPath = path.join(
      tmp,
      'data/market/v2/families/mapp/coupons/A311127M26.json'
    )
    const keptBefore = JSON.parse(await readFile(couponPath, 'utf8'))

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.includes('akk.hu') && url.includes('getSecurityWithOutstanding')) {
        return new Response(JSON.stringify(catalog), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (url.includes('akk.hu') && url.includes('getNetworkRates')) {
        return new Response(JSON.stringify(rates), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (url.endsWith('/api/csrf')) {
        return new Response(
          JSON.stringify({
            status: true,
            data: { headerName: 'X-CSRF-TOKEN', token: 'tok-soft' }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      if (url.includes('get_papers_with_prices')) {
        return new Response(
          JSON.stringify({
            status: true,
            data: { papers: { DKJ: { name: 'DKJ', fields: ['name'] } } }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      if (url.includes('get_prices')) {
        return new Response(JSON.stringify(pricesDkj), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (url.includes('retailInterest/get_all_data')) {
        return new Response(JSON.stringify({ status: false, message: 'boom' }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        })
      }
      if (url.includes('ara0040.csv')) {
        const csv = readFileSync(path.join(fixtureRoot, 'inflation/ara0040-sample.csv'))
        return new Response(csv, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' }
        })
      }
      return new Response('nope', { status: 404 })
    }

    const report = await ingestMarketData({
      root: tmp,
      previousRoot: tmp,
      rawDir: path.join(tmp, 'raw-live'),
      fetchImpl,
      generatedAt: '2026-11-03T12:00:00.000Z'
    })
    expect(report.retailInterestSoftFailed).toBe(true)
    expect(report.retailInterestUpdated).toBe(false)
    const kept = JSON.parse(await readFile(couponPath, 'utf8'))
    expect(kept).toEqual(keptBefore)
    const { loadMarketTree } = await import('../tools/market-data/io.ts')
    const tree = await loadMarketTree(tmp)
    validateMarketTree(tree)
    // Stepped kamatok "5,00 - 6,00 %" → two coupon rows with the same from/to.
    expect(tree.families.mapp.coupons.A311127M26?.rows).toHaveLength(2)
    expect(Object.keys(tree.families.dkj.latest.quotes).length).toBeGreaterThan(0)
  })
})

describe('fetchRetailInterest', () => {
  it('reuses a CSRF session and soft-oks empty rows', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-ri-fetch-'))
    tmpDirs.push(tmp)
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/api/csrf')) {
        return new Response(
          JSON.stringify({
            status: true,
            data: { headerName: 'X-CSRF-TOKEN', token: 'shared-tok' }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json', 'set-cookie': 'csrf_cookie=xyz' }
          }
        )
      }
      if (url.includes('retailInterest/get_all_data')) {
        return new Response(
          JSON.stringify({
            status: true,
            message: 'ok',
            data: { data: [], filter: {}, ordermap: {} }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response('nope', { status: 404 })
    }

    const session = new CsrfSession(
      'https://www.allampapir.hu',
      new CookieJar(),
      fetchImpl,
      'test-ua'
    )
    await session.ensure()
    expect(calls.filter((c) => c.includes('/api/csrf'))).toHaveLength(1)

    const result = await fetchRetailInterestSnapshots({
      rawDir: tmp,
      fetchImpl,
      session,
      retries: 2,
      backoffMs: 1
    })
    expect(result.envelope.status).toBe(true)
    expect(calls.filter((c) => c.includes('/api/csrf'))).toHaveLength(1)
    expect(calls.filter((c) => c.includes('retailInterest/get_all_data'))).toHaveLength(1)
  })

  it('hard-fails unexpected retailInterest shapes', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-ri-shape-'))
    tmpDirs.push(tmp)
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/api/csrf')) {
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

    await expect(
      fetchRetailInterestSnapshots({
        rawDir: tmp,
        fetchImpl,
        retries: 2,
        backoffMs: 1
      })
    ).rejects.toBeInstanceOf(AllampapirFetchError)
  })
})
