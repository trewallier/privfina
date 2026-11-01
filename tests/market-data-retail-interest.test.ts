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
import { normalizeRetailInterestEnvelope } from '../tools/market-data/normalize-retail-interest.ts'
import { RETAIL_INTEREST_REF_PATH, type AllampapirEnvelope } from '../tools/market-data/types.ts'
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

describe('retail interest normalize (ADR 0036)', () => {
  it('maps family from type/place and keeps KTJ family null', () => {
    expect(familyFromRetailInterest('FixMÁP', 'FIX_MAP')).toBe('fixmap')
    expect(familyFromRetailInterest('PMÁP', 'PMAP')).toBe('pmap')
    expect(familyFromRetailInterest('MÁP Plusz', 'MAPP')).toBe('mapp')
    expect(familyFromRetailInterest('nyomdai MÁP Plusz', 'MAPP_F')).toBe('mapp')
    expect(familyFromRetailInterest('KTJ I', 'KTJ')).toBeNull()
  })

  it('normalizes get_all_data fixture without touching prem semantics', () => {
    const envelope = loadJson<AllampapirEnvelope>('retail-interest/get_all_data.json')
    const file = normalizeRetailInterestEnvelope(envelope, {
      generatedAt: '2026-11-01T12:00:00.000Z'
    })

    expect(file.schemaVersion).toBe(1)
    expect(file.asOf).toBe('2026-10-01')
    expect(file.rows.length).toBe(7)

    const fixOffered = file.rows.find((r) => r.series === '2029/Q2')
    expect(fixOffered).toMatchObject({
      id: '2029_Q2',
      family: 'fixmap',
      rate: 5.5,
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
      rate: 4.5,
      offered: true
    })

    const ktj = file.rows.find((r) => r.series === 'KTJ_I')
    expect(ktj?.family).toBeNull()
    expect(ktj?.offered).toBe(true)

    const mapp = file.rows.find((r) => r.series === '2031/M6')
    expect(mapp?.rate).toBe(5)
    expect(mapp?.family).toBe('mapp')
  })
})

describe('retail interest merge + ingest', () => {
  it('full-replaces refs and digests when retail interest changes', () => {
    const envelope = loadJson<AllampapirEnvelope>('retail-interest/get_all_data.json')
    const retail = normalizeRetailInterestEnvelope(envelope, {
      generatedAt: '2026-11-01T12:00:00.000Z'
    })
    const catalog = loadJson('catalog.json')
    const rates = loadJson('network-rates.json')
    const snapshot = normalizeAkkSnapshots(catalog as never, rates as never, {
      requireFamilies: false
    })

    const first = mergeSnapshot(emptyMarketTree(), snapshot, {
      generatedAt: '2026-11-01T12:00:00.000Z',
      retailInterest: retail
    })
    expect(first.changed).toBe(true)
    expect(first.tree.retailInterest?.rows).toHaveLength(7)
    expect(first.tree.manifest?.refs?.retailInterest).toBe(RETAIL_INTEREST_REF_PATH)
    expect(first.tree.manifest?.digests[RETAIL_INTEREST_REF_PATH]).toBeTruthy()
    validateMarketTree(first.tree)

    // Same rows + different generatedAt must not change digests / force a commit.
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
    expect(same.tree.retailInterest?.generatedAt).toBe(
      first.tree.retailInterest!.generatedAt
    )

    const updatedRetail = {
      ...retail,
      generatedAt: '2026-11-01T13:00:00.000Z',
      rows: retail.rows.map((r) =>
        r.series === '2029/Q2' ? { ...r, rate: 5.75 } : { ...r }
      )
    }
    const changed = mergeSnapshot(first.tree, snapshot, {
      generatedAt: '2026-11-01T13:00:00.000Z',
      retailInterest: updatedRetail
    })
    expect(changed.changed).toBe(true)
    expect(changed.tree.retailInterest?.rows.find((r) => r.series === '2029/Q2')?.rate).toBe(5.75)
  })

  it('keeps previous retail interest when offline without envelope', async () => {
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

    const published = JSON.parse(
      await readFile(path.join(tmp, 'data/market/v1', RETAIL_INTEREST_REF_PATH), 'utf8')
    )
    expect(published.rows.some((r: { offered: boolean }) => r.offered)).toBe(true)
    // Ensure we did not stuff period coupons into series.prem via this path
    const pmapSeries = JSON.parse(
      await readFile(path.join(tmp, 'data/market/v1/families/pmap/series.json'), 'utf8')
    )
    for (const s of pmapSeries.series) {
      if (s.name === '2036/I1' || s.id === '2036_I1') {
        expect(s.prem == null || s.prem !== 4.5).toBe(true)
      }
    }

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
    const publishedAgain = JSON.parse(
      await readFile(path.join(tmp, 'data/market/v1', RETAIL_INTEREST_REF_PATH), 'utf8')
    )
    expect(publishedAgain.generatedAt).toBe(published.generatedAt)
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
    const kept = JSON.parse(
      await readFile(path.join(tmp, 'data/market/v1', RETAIL_INTEREST_REF_PATH), 'utf8')
    )
    expect(kept.generatedAt).toBe('2026-11-01T12:00:00.000Z')
    expect(kept.rows.length).toBe(7)
    // Price tree remains valid even though retailInterest soft-failed.
    const { loadMarketTree } = await import('../tools/market-data/io.ts')
    const tree = await loadMarketTree(tmp)
    validateMarketTree(tree)
    expect(tree.retailInterest?.rows).toHaveLength(7)
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
