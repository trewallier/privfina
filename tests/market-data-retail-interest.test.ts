import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { familyFromRetailInterest } from '../tools/market-data/families.ts'
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

    // Same retail body + same quote snapshot → digest no-op.
    const same = mergeSnapshot(first.tree, snapshot, {
      generatedAt: '2026-11-01T12:00:00.000Z',
      retailInterest: {
        ...retail,
        generatedAt: first.tree.retailInterest!.generatedAt
      }
    })
    expect(same.changed).toBe(false)

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
    const publishedAgain = JSON.parse(
      await readFile(path.join(tmp, 'data/market/v1', RETAIL_INTEREST_REF_PATH), 'utf8')
    )
    expect(publishedAgain.generatedAt).toBe(published.generatedAt)
  })
})
