import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import { emptyMarketTree, MergeError, mergeSnapshot } from '../tools/market-data/merge.ts'
import { mergeInflationFile } from '../tools/market-data/merge-inflation.ts'
import {
  normalizeKshInflationCsv,
  parseIdoszakToMonth
} from '../tools/market-data/normalize-ksh-inflation.ts'
import { normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import { INFLATION_REF_PATH, type AkkEnvelope } from '../tools/market-data/types.ts'
import { assertPublishedTree } from '../tools/market-data/validate.ts'

const fixturesRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/market-data'
)

function loadJson<T>(rel: string): T {
  const text = readFileSync(path.join(fixturesRoot, rel), 'utf8')
  return JSON.parse(text) as T
}

async function loadCsvBytes(rel: string): Promise<Uint8Array> {
  const buf = await readFile(path.join(fixturesRoot, rel))
  return new Uint8Array(buf)
}

describe('KSH inflation normalize (ADR 0037)', () => {
  it('parses Hungarian month and Jan–M range tokens', () => {
    expect(parseIdoszakToMonth('január', 2017)).toBe('2017-01')
    expect(parseIdoszakToMonth('október', 2026)).toBe('2026-10')
    expect(parseIdoszakToMonth('január–december', 2017)).toBe('2017-12')
    expect(parseIdoszakToMonth('január-március', 2018)).toBe('2018-03')
    expect(parseIdoszakToMonth('', 2017)).toBeNull()
  })

  it('normalizes Összesen-only pct_change series and skips blank months', async () => {
    const bytes = await loadCsvBytes('inflation/ara0040-sample.csv')
    const file = normalizeKshInflationCsv(bytes, {
      generatedAt: '2026-11-01T12:00:00.000Z'
    })

    expect(file.metric).toBe('cpi_total')
    expect(file.unit).toBe('pct_change')
    expect(file.source.id).toBe('ksh-stadat-ara0040')
    expect(file.series.yoy.rows[0]).toEqual(['2017-01', 2.3])
    expect(file.series.yoy.rows.find(([ym]) => ym === '2017-02')).toEqual(['2017-02', 2.9])
    // Blank október/november in fixture must not appear.
    expect(file.series.yoy.rows.some(([ym]) => ym.endsWith('-10') && ym.startsWith('2018'))).toBe(
      false
    )
    expect(file.series.mom.rows[0]).toEqual(['2017-01', 0.4])
    expect(file.series.ytdFromDec.rows.length).toBeGreaterThan(0)
    expect(file.series.ytdYoy.rows.length).toBeGreaterThan(0)
    // Annual average from január–december of ytdYoy.
    expect(file.annualAverage.rows.some(([year]) => year === '2017')).toBe(true)
    const y2017 = file.annualAverage.rows.find(([year]) => year === '2017')
    expect(y2017?.[1]).toBe(2.4)
    expect(file.asOf).toBeTruthy()
  })
})

describe('KSH inflation merge (ADR 0037)', () => {
  it('appends new months and skips identical history', async () => {
    const bytes = await loadCsvBytes('inflation/ara0040-sample.csv')
    const first = normalizeKshInflationCsv(bytes, { generatedAt: '2026-11-01T12:00:00.000Z' })
    const again = normalizeKshInflationCsv(bytes, { generatedAt: '2026-11-02T12:00:00.000Z' })
    const same = mergeInflationFile(first, again)
    expect(same.contentChanged).toBe(false)
    expect(same.file.generatedAt).toBe(first.generatedAt)
    expect(same.appendedRows).toBe(0)
    expect(same.skippedDuplicates).toBeGreaterThan(0)

    const extended = structuredClone(again)
    extended.series.yoy.rows.push(['2018-03', 2.0])
    extended.generatedAt = '2026-11-03T12:00:00.000Z'
    const grown = mergeInflationFile(first, extended)
    expect(grown.contentChanged).toBe(true)
    expect(grown.appendedRows).toBe(1)
    expect(grown.file.series.yoy.rows.some(([ym, pct]) => ym === '2018-03' && pct === 2.0)).toBe(
      true
    )
  })

  it('fails when historical pct changes', async () => {
    const bytes = await loadCsvBytes('inflation/ara0040-sample.csv')
    const first = normalizeKshInflationCsv(bytes, { generatedAt: '2026-11-01T12:00:00.000Z' })
    const conflict = structuredClone(first)
    conflict.series.yoy.rows[0] = ['2017-01', 9.9]
    expect(() => mergeInflationFile(first, conflict)).toThrow(MergeError)
  })

  it('wires into mergeSnapshot digests and tree refs', async () => {
    const catalog = loadJson<AkkEnvelope>('catalog.json')
    const rates = loadJson<AkkEnvelope>('network-rates.json')
    const snapshot = normalizeAkkSnapshots(catalog, rates, { requireFamilies: false })
    const bytes = await loadCsvBytes('inflation/ara0040-sample.csv')
    const inflation = normalizeKshInflationCsv(bytes, {
      generatedAt: '2026-11-01T12:00:00.000Z'
    })

    const first = mergeSnapshot(emptyMarketTree(), snapshot, {
      generatedAt: '2026-11-01T12:00:00.000Z',
      inflation
    })
    expect(first.changed).toBe(true)
    expect(first.tree.inflation?.series.yoy.rows.length).toBeGreaterThan(0)
    expect(first.tree.manifest?.refs?.inflation).toBe(INFLATION_REF_PATH)
    expect(first.tree.manifest?.digests[INFLATION_REF_PATH]).toBeTruthy()
    expect(first.inflationAppendedRows).toBeGreaterThan(0)

    const again = mergeSnapshot(first.tree, snapshot, {
      generatedAt: '2026-11-02T12:00:00.000Z',
      inflation: normalizeKshInflationCsv(bytes, { generatedAt: '2026-11-02T12:00:00.000Z' })
    })
    expect(again.changed).toBe(false)
    expect(again.tree.inflation?.generatedAt).toBe(first.tree.inflation!.generatedAt)
  })
})

describe('KSH inflation ingest wiring', () => {
  it('publishes refs/inflation.json from fixture CSV and is digest-stable', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-inflation-'))
    try {
      const catalog = loadJson<AkkEnvelope>('catalog.json')
      const rates = loadJson<AkkEnvelope>('network-rates.json')
      const bytes = await loadCsvBytes('inflation/ara0040-sample.csv')

      const seeded = await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        skipAllampapir: true,
        skipRetailInterest: true,
        inflationCsvBytes: bytes,
        generatedAt: '2026-11-01T12:00:00.000Z'
      })
      expect(seeded.changed).toBe(true)
      expect(seeded.inflationUpdated).toBe(true)
      const written = await readFile(
        path.join(tmp, 'data/market/v1', INFLATION_REF_PATH),
        'utf8'
      )
      const parsed = JSON.parse(written)
      expect(parsed.series.yoy.rows[0]).toEqual(['2017-01', 2.3])
      await assertPublishedTree(tmp)

      const again = await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw2'),
        catalog,
        networkRates: rates,
        skipAllampapir: true,
        skipRetailInterest: true,
        inflationCsvBytes: bytes,
        generatedAt: '2026-11-02T12:00:00.000Z'
      })
      expect(again.changed).toBe(false)
      expect(again.inflationUpdated).toBe(true)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
