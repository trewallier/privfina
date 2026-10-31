import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildCatalogUrl, buildNetworkRatesUrl } from '../tools/market-data/fetch-akk.ts'
import { loadMarketTree } from '../tools/market-data/io.ts'
import { emptyMarketTree, mergeSnapshot } from '../tools/market-data/merge.ts'
import { NormalizeError, normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import { publishMarketData } from '../tools/market-data/publish.ts'
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
    expect(buildNetworkRatesUrl()).toContain('type=DKJ')
    expect(buildNetworkRatesUrl()).toContain('type=PM%C3%81P')
    expect(buildNetworkRatesUrl()).toContain('query=getNetworkRates')
  })
})

describe('normalizeAkkSnapshots', () => {
  it('maps catalog + quotes into three families and uses settleDate as asOf', async () => {
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
    expect(first.appendedRows).toBe(3)
    expect(first.tree.families.dkj.latest.quotes.D261125.bid).toBe(99.615)
    expect(first.tree.manifest?.digests['families/dkj/latest.json']).toBeTruthy()

    const second = mergeSnapshot(first.tree, snap, {
      generatedAt: '2026-11-02T19:00:00+01:00'
    })
    expect(second.changed).toBe(false)
    expect(second.appendedRows).toBe(0)
    expect(second.skippedDuplicates).toBe(3)

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
    expect(third.appendedRows).toBe(3)
    expect(third.tree.families.dkj.quotes.D261125.rows).toHaveLength(2)
    expect(third.tree.families.dkj.latest.quotes.D261125.d).toBe('2026-11-03')
    expect(third.tree.families.dkj.latest.quotes.D261125.bid).toBe(99.7)
  })
})

describe('publishMarketData (fixture / disk)', () => {
  it('writes schemaVersion 1 tree and is a no-op on second identical publish', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-market-'))
    try {
      const first = await publishMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        generatedAt: '2026-11-02T18:00:00+01:00'
      })
      expect(first.changed).toBe(true)
      const seriesText = await readFile(
        path.join(tmp, 'data/market/v1/families/dkj/series.json'),
        'utf8'
      )
      expect(JSON.parse(seriesText).schemaVersion).toBe(1)

      const second = await publishMarketData({
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
