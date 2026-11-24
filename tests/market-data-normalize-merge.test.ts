import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildCatalogUrl, buildNetworkRatesUrl } from '../tools/market-data/fetch-akk.ts'
import { loadMarketTree } from '../tools/market-data/io.ts'
import { accumulateSeries, emptyMarketTree, mergeSnapshot } from '../tools/market-data/merge.ts'
import { NormalizeError, normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import { digestCanonical } from '../tools/market-data/digests.ts'
import { ValidateError, validateMarketTree } from '../tools/market-data/validate.ts'
import type { AkkEnvelope } from '../tools/market-data/types.ts'

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'market-data'
)

async function loadFixture(name: string): Promise<AkkEnvelope> {
  const text = await readFile(path.join(fixturesDir, name), 'utf8')
  return JSON.parse(text) as AkkEnvelope
}

describe('market-data URL builders', () => {
  it('encodes Á accents once per security type filter', () => {
    expect(buildCatalogUrl()).toContain('securityType=DKJ')
    expect(buildCatalogUrl()).toContain('securityType=PM%C3%81P')
    expect(buildCatalogUrl()).toContain('securityType=BM%C3%81P')
    expect(buildCatalogUrl()).toContain('securityType=KTV')
    expect(buildNetworkRatesUrl()).toContain('type=DKJ')
    expect(buildNetworkRatesUrl()).toContain('type=PM%C3%81P')
    expect(buildNetworkRatesUrl()).toContain('type=KTV')
    expect(buildNetworkRatesUrl()).toContain('query=getNetworkRates')
  })
})

describe('normalizeAkkSnapshots', () => {
  it('maps catalog + quotes into required families and optional ktv, uses settleDate as asOf', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const snap = normalizeAkkSnapshots(catalog, rates)

    expect(snap.asOf).toBe('2026-11-02')
    expect(snap.byFamily.dkj.series.map((s) => s.id)).toEqual(['D261125'])
    expect(snap.byFamily.dkj.series[0].isin).toBe('HU0000525000')
    expect(snap.byFamily.pmap.series[0].ref).toBe('HUF CPI')
    expect(snap.byFamily.bmap.quotes[0].row[0]).toBe('2026-11-02')
    expect(snap.byFamily.bmap.quotes[0].row[1]).toBe(101.5)
    // Matured DKJ from catalog is not in hot series (not quoted).
    expect(snap.byFamily.dkj.series.some((s) => s.id === 'D200101')).toBe(false)

    const float2027 = snap.byFamily.ktv.series.find((s) => s.id === 'A270422B20')
    const float2036 = snap.byFamily.ktv.series.find((s) => s.id === 'A361126B26')
    expect(float2027).toMatchObject({
      iType: 'FLOAT',
      ref: 'BUBOR 3M',
      periodMonths: 3,
      dayCount: 'ACT/360',
      face: 10000
    })
    expect(float2036).toMatchObject({
      id: 'A361126B26',
      iType: 'FLOAT',
      ref: 'BUBOR 3M',
      periodMonths: 3,
      isin: 'HU0000407531'
    })
    // FIX catalog row without a quote stays out of hot series.
    expect(snap.byFamily.ktv.series.some((s) => s.id === 'A280623A18')).toBe(false)
  })

  it('fails when a required family has zero network-rate rows', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates-empty-dkj.json')
    expect(() => normalizeAkkSnapshots(catalog, rates)).toThrow(NormalizeError)
    expect(() => normalizeAkkSnapshots(catalog, rates)).toThrow(/dkj/i)
  })
})

describe('mergeSnapshot', () => {
  it('appends new settle dates and skips duplicates', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const snap = normalizeAkkSnapshots(catalog, rates)

    const first = mergeSnapshot(emptyMarketTree(), snap, {
      generatedAt: '2026-11-02T18:00:00+01:00'
    })
    expect(first.changed).toBe(true)
    // 3 required + 2 FLOAT ktv + 1 FIX ktv (2037/A) quotes
    expect(first.appendedRows).toBe(6)
    expect(first.tree.families.dkj.latest.quotes.D261125.bid).toBe(99.615)
    expect(first.tree.manifest?.digests['families/dkj/latest.json']).toBeTruthy()
    expect(first.tree.families.ktv.series.series.find((s) => s.id === 'A270422B20')?.iType).toBe(
      'FLOAT'
    )
    expect(Object.keys(first.tree.families.ktv.coupons)).toEqual([])

    const second = mergeSnapshot(first.tree, snap, {
      generatedAt: '2026-11-02T19:00:00+01:00'
    })
    expect(second.changed).toBe(false)
    expect(second.appendedRows).toBe(0)
    expect(second.skippedDuplicates).toBe(6)

    const nextDayRates: AkkEnvelope = structuredClone(rates)
    for (const row of nextDayRates.data ?? []) {
      row.settleDate = '2026-11-03'
      if (row.longName === 'D261125') row.bidPrice = 99.7
    }
    const nextSnap = normalizeAkkSnapshots(catalog, nextDayRates)
    const third = mergeSnapshot(second.tree, nextSnap, {
      generatedAt: '2026-11-03T18:00:00+01:00'
    })
    expect(third.changed).toBe(true)
    expect(third.appendedRows).toBe(6)
    expect(third.tree.families.dkj.quotes.D261125.rows).toHaveLength(2)
    expect(third.tree.families.dkj.latest.quotes.D261125.d).toBe('2026-11-03')
    expect(third.tree.families.dkj.latest.quotes.D261125.bid).toBe(99.7)
    // Still no BUBOR-derived coupon files after re-merge.
    expect(Object.keys(third.tree.families.ktv.coupons)).toEqual([])
  })
})

describe('ingestMarketData (fixture / disk)', () => {
  it('writes schemaVersion 2 tree and is a no-op on second identical ingest', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-market-'))
    try {
      const first = await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        generatedAt: '2026-11-02T18:00:00+01:00'
      })
      expect(first.changed).toBe(true)
      const seriesText = await readFile(
        path.join(tmp, 'data/market/v2/families/dkj/series.json'),
        'utf8'
      )
      expect(JSON.parse(seriesText).schemaVersion).toBe(2)

      const second = await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        generatedAt: '2026-11-02T19:00:00+01:00'
      })
      expect(second.changed).toBe(false)

      const loaded = await loadMarketTree(tmp)
      expect(loaded.manifest?.asOf).toBe('2026-11-02')
      expect(Object.keys(loaded.families.pmap.latest.quotes)).toContain('A270324I22')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('SeriesRecord.identitySource (ADR 0048)', () => {
  it('accumulateSeries promotes WK-origin to www.akk.hu and never downgrades', () => {
    const wkStub = {
      id: 'D999999',
      isin: null,
      name: 'D999999',
      issue: null,
      mat: '2026-12-05',
      ccy: 'HUF',
      status: 'delisted' as const,
      dayCount: 'ACT/360' as const,
      identitySource: 'webkincstar.allamkincstar.gov.hu' as const
    }
    const akk = {
      id: 'D999999',
      isin: 'HU0000599999',
      name: 'D999999 long',
      issue: '2025-01-01',
      mat: '2026-12-05',
      ccy: 'HUF',
      status: 'active' as const,
      dayCount: 'ACT/360' as const
    }
    const promoted = accumulateSeries([wkStub], [akk], new Set(), new Set(['D999999']), '2026-11-05')
    expect(promoted[0].identitySource).toBe('www.akk.hu')
    expect(promoted[0].isin).toBe('HU0000599999')
    expect(promoted[0].name).toBe('D999999 long')

    const noDowngrade = accumulateSeries(
      [{ ...akk, identitySource: 'www.akk.hu' }],
      [wkStub],
      new Set(),
      new Set(['D999999']),
      '2026-11-05'
    )
    expect(noDowngrade[0].identitySource).toBe('www.akk.hu')
    expect(noDowngrade[0].isin).toBe('HU0000599999')
  })

  it('re-resolves status to matured after ISSUE mat enrich on WK-origin stub', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const snap = normalizeAkkSnapshots(catalog, rates)
    // Seed a WK-origin stub without mat (delisted) into the merge payload.
    snap.byFamily.dkj.series.push({
      id: 'D999999',
      isin: null,
      name: 'D999999',
      issue: null,
      mat: null,
      ccy: 'HUF',
      status: 'delisted',
      identitySource: 'webkincstar.allamkincstar.gov.hu'
    })
    const { tree } = mergeSnapshot(emptyMarketTree(), snap, {
      generatedAt: '2026-11-05T18:00:00+01:00',
      seriesIdentityEnrichments: [
        {
          family: 'dkj',
          seriesId: 'D999999',
          mat: '2020-01-01',
          dayCount: 'ACT/365F'
        }
      ]
    })
    const enriched = tree.families.dkj.series.series.find((s) => s.id === 'D999999')
    expect(enriched?.mat).toBe('2020-01-01')
    expect(enriched?.dayCount).toBe('ACT/365F')
    expect(enriched?.status).toBe('matured')
  })

  it('accepts www.akk.hu and webkincstar host; rejects null and other literals', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const snap = normalizeAkkSnapshots(catalog, rates)
    const { tree } = mergeSnapshot(emptyMarketTree(), snap, {
      generatedAt: '2026-11-02T18:00:00+01:00'
    })
    const series = tree.families.dkj.series.series[0]
    expect(series).toBeTruthy()
    const refreshDigest = () => {
      if (!tree.manifest) throw new Error('missing manifest')
      tree.manifest.digests['families/dkj/series.json'] = digestCanonical(
        tree.families.dkj.series
      )
    }

    series.identitySource = 'webkincstar.allamkincstar.gov.hu'
    refreshDigest()
    expect(() => validateMarketTree(tree)).not.toThrow()

    series.identitySource = 'www.akk.hu'
    refreshDigest()
    expect(() => validateMarketTree(tree)).not.toThrow()

    delete series.identitySource
    refreshDigest()
    expect(() => validateMarketTree(tree)).not.toThrow()

    ;(series as { identitySource?: string | null }).identitySource = null
    refreshDigest()
    expect(() => validateMarketTree(tree)).toThrow(ValidateError)
    expect(() => validateMarketTree(tree)).toThrow(/identitySource/)

    ;(series as { identitySource?: string }).identitySource = 'phantom'
    refreshDigest()
    expect(() => validateMarketTree(tree)).toThrow(ValidateError)
    expect(() => validateMarketTree(tree)).toThrow(/identitySource/)
  })
})
