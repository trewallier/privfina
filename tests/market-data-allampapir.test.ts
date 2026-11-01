import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { combineQuoteRows, combineSnapshots } from '../tools/market-data/combine.ts'
import { familyFromAllampapirPaper } from '../tools/market-data/families.ts'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import { loadMarketTree } from '../tools/market-data/io.ts'
import { normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import { normalizeAllampapirSnapshots } from '../tools/market-data/normalize-allampapir.ts'
import type { AkkEnvelope, AllampapirEnvelope } from '../tools/market-data/types.ts'

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
      combineQuoteRows(['2026-11-02', 99.0, null, 6.0, null, 0], ['2026-11-02', null, 99.2, null, null, null])
    ).toEqual(['2026-11-02', 99.0, 99.2, 6.0, null, 0])
  })

  it('merges ÁKK catalog isin with allampapir ask fill for overlapping DKJ', async () => {
    const catalog = await loadAkk('catalog.json')
    const rates = await loadAkk('network-rates.json')
    const akk = normalizeAkkSnapshots(catalog, rates, { requireFamilies: false })
    const ap = normalizeAllampapirSnapshots(await loadAllampapirFixtures())
    const combined = combineSnapshots(akk, ap)

    const dkj = combined.byFamily.dkj
    const series = dkj.series.find((s) => s.id === 'D261125')
    expect(series?.isin).toBe('HU0000525000')
    const row = dkj.quotes.find((q) => q.id === 'D261125')?.row
    expect(row?.[1]).toBe(99.615)
    // ÁKK ask null; allampapir also empty for this series — stays null
    expect(row?.[2]).toBeNull()

    const withAsk = dkj.quotes.find((q) => q.id === 'D261223')?.row
    expect(withAsk?.[2]).toBe(99.3512)
    expect(dkj.series.find((s) => s.id === 'D261223')?.isin).toBeNull()

    expect(combined.byFamily.mapp.quotes.length).toBeGreaterThan(0)
    expect(combined.byFamily.baba.quotes.length).toBeGreaterThan(0)
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
