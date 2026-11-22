import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import { emptyMarketTree, MergeError, mergeSnapshot } from '../tools/market-data/merge.ts'
import { mergeBuborFile } from '../tools/market-data/merge-bubor.ts'
import {
  mapBuborHeaderToTenor,
  NormalizeBuborError,
  normalizeMnbBuborXls
} from '../tools/market-data/normalize-mnb-bubor.ts'
import { ValidateError, validateMarketTree } from '../tools/market-data/validate.ts'
import { normalizeAkkSnapshots } from '../tools/market-data/normalize.ts'
import { BUBOR_REF_PATH, type AkkEnvelope } from '../tools/market-data/types.ts'
import { assertPublishedTree } from '../tools/market-data/validate.ts'

const fixturesRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/market-data'
)

function loadJson<T>(rel: string): T {
  const text = readFileSync(path.join(fixturesRoot, rel), 'utf8')
  return JSON.parse(text) as T
}

async function loadXlsBytes(rel: string): Promise<Uint8Array> {
  const buf = await readFile(path.join(fixturesRoot, rel))
  return new Uint8Array(buf)
}

describe('MNB BUBOR normalize (ADR 0045)', () => {
  it('maps bilingual / spaced tenor headers', () => {
    expect(mapBuborHeaderToTenor('O/N')).toBe('ON')
    expect(mapBuborHeaderToTenor('1 hét')).toBe('1W')
    expect(mapBuborHeaderToTenor('1week')).toBe('1W')
    expect(mapBuborHeaderToTenor('3 hónap')).toBe('3M')
    expect(mapBuborHeaderToTenor('3months')).toBe('3M')
    expect(mapBuborHeaderToTenor('12hónap')).toBe('12M')
    expect(mapBuborHeaderToTenor('jegyzési nap')).toBeNull()
    expect(mapBuborHeaderToTenor('date of fixing')).toBeNull()
  })

  it('normalizes sparse historical sheets including uj 2002 and skips dashes', async () => {
    const bytes = await loadXlsBytes('bubor/bubor-sample.xls')
    const file = normalizeMnbBuborXls(bytes, {
      generatedAt: '2026-11-22T12:00:00.000Z'
    })

    expect(file.metric).toBe('bubor')
    expect(file.unit).toBe('pct')
    expect(file.source.id).toBe('mnb-bubor2-xls')
    expect(file.asOf).toBe('2023-01-04')
    expect(file.series['3M'].rows[0]).toEqual(['1996-08-01', 24.13])
    // uj 2002 companion merged into 3M history.
    expect(file.series['3M'].rows.some(([d]) => d === '2002-05-02')).toBe(true)
    expect(file.series['1W'].rows.some(([d, pct]) => d === '2002-05-02' && pct === 8.9)).toBe(
      true
    )
    // Empty ON on 1999-01-04 skipped; first ON is June.
    expect(file.series.ON.rows[0]).toEqual(['1999-06-01', 13.5])
    // Dash cells for 4M → no rows invented.
    expect(file.series['4M'].rows).toEqual([])
    expect(file.series['3M'].rows.some(([d]) => d === '2023-01-04')).toBe(true)
  })

  it('hard-fails when the same (tenor, date) has conflicting pct across sheets', async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const sheetA = XLSX.utils.aoa_to_sheet([
      ['Date of fixing', '3 months'],
      [44927, 5.5] // 2023-01-01-ish serial; exact ISO via number parse
    ])
    // Use ISO strings so the conflict fixture is unambiguous.
    const sheet2022 = XLSX.utils.aoa_to_sheet([
      ['jegyzési nap', '3 hónap'],
      ['2022-06-01', 7.1]
    ])
    const sheetUj = XLSX.utils.aoa_to_sheet([
      ['jegyzési nap', '3 hónap'],
      ['2022-06-01', 9.9]
    ])
    XLSX.utils.book_append_sheet(wb, sheet2022, '2002')
    XLSX.utils.book_append_sheet(wb, sheetUj, 'uj 2002')
    XLSX.utils.book_append_sheet(wb, sheetA, '2023')
    const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer
    expect(() => normalizeMnbBuborXls(new Uint8Array(bytes))).toThrow(NormalizeBuborError)
  })
})

describe('MNB BUBOR merge (ADR 0045)', () => {
  it('appends new dates and skips identical history', async () => {
    const bytes = await loadXlsBytes('bubor/bubor-sample.xls')
    const first = normalizeMnbBuborXls(bytes, { generatedAt: '2026-11-22T12:00:00.000Z' })
    const again = normalizeMnbBuborXls(bytes, { generatedAt: '2026-11-23T12:00:00.000Z' })
    const same = mergeBuborFile(first, again)
    expect(same.contentChanged).toBe(false)
    expect(same.file.generatedAt).toBe(first.generatedAt)
    expect(same.appendedRows).toBe(0)
    expect(same.skippedDuplicates).toBeGreaterThan(0)

    const extended = structuredClone(again)
    extended.series['3M'].rows.push(['2023-01-05', 16.52])
    extended.generatedAt = '2026-11-24T12:00:00.000Z'
    const grown = mergeBuborFile(first, extended)
    expect(grown.contentChanged).toBe(true)
    expect(grown.appendedRows).toBe(1)
    expect(
      grown.file.series['3M'].rows.some(([d, pct]) => d === '2023-01-05' && pct === 16.52)
    ).toBe(true)
  })

  it('fails when a historical fixing changes', async () => {
    const bytes = await loadXlsBytes('bubor/bubor-sample.xls')
    const first = normalizeMnbBuborXls(bytes, { generatedAt: '2026-11-22T12:00:00.000Z' })
    const conflict = structuredClone(first)
    conflict.series['3M'].rows[0] = ['1996-08-01', 99.9]
    expect(() => mergeBuborFile(first, conflict)).toThrow(MergeError)
  })

  it('first previous-null merge publishes full history', async () => {
    const bytes = await loadXlsBytes('bubor/bubor-sample.xls')
    const incoming = normalizeMnbBuborXls(bytes, { generatedAt: '2026-11-22T12:00:00.000Z' })
    const first = mergeBuborFile(null, incoming)
    expect(first.contentChanged).toBe(true)
    expect(first.appendedRows).toBeGreaterThan(10)
    expect(first.file.series['3M'].rows.length).toBe(incoming.series['3M'].rows.length)
  })

  it('validateBubor rejects duplicate or non-ascending dates', async () => {
    const bytes = await loadXlsBytes('bubor/bubor-sample.xls')
    const bubor = normalizeMnbBuborXls(bytes, { generatedAt: '2026-11-22T12:00:00.000Z' })
    const catalog = loadJson<AkkEnvelope>('catalog.json')
    const rates = loadJson<AkkEnvelope>('network-rates.json')
    const snapshot = normalizeAkkSnapshots(catalog, rates, { requireFamilies: false })
    const merged = mergeSnapshot(emptyMarketTree(), snapshot, {
      generatedAt: '2026-11-22T12:00:00.000Z',
      bubor
    })
    const bad = structuredClone(merged.tree)
    bad.bubor!.series['3M'].rows.push(['1996-08-01', 1])
    expect(() => validateMarketTree(bad)).toThrow(ValidateError)
  })

  it('wires into mergeSnapshot digests and tree refs', async () => {
    const catalog = loadJson<AkkEnvelope>('catalog.json')
    const rates = loadJson<AkkEnvelope>('network-rates.json')
    const snapshot = normalizeAkkSnapshots(catalog, rates, { requireFamilies: false })
    const bytes = await loadXlsBytes('bubor/bubor-sample.xls')
    const bubor = normalizeMnbBuborXls(bytes, {
      generatedAt: '2026-11-22T12:00:00.000Z'
    })

    const first = mergeSnapshot(emptyMarketTree(), snapshot, {
      generatedAt: '2026-11-22T12:00:00.000Z',
      bubor
    })
    expect(first.changed).toBe(true)
    expect(first.tree.bubor?.series['3M'].rows.length).toBeGreaterThan(0)
    expect(first.tree.manifest?.refs?.bubor).toBe(BUBOR_REF_PATH)
    expect(first.tree.manifest?.digests[BUBOR_REF_PATH]).toBeTruthy()
    expect(first.buborAppendedRows).toBeGreaterThan(0)

    const again = mergeSnapshot(first.tree, snapshot, {
      generatedAt: '2026-11-23T12:00:00.000Z',
      bubor: normalizeMnbBuborXls(bytes, { generatedAt: '2026-11-23T12:00:00.000Z' })
    })
    expect(again.buborAppendedRows).toBe(0)
    expect(again.tree.bubor?.generatedAt).toBe(first.tree.bubor?.generatedAt)
  })
})

describe('MNB BUBOR ingest offline (ADR 0045)', () => {
  it('writes refs/bubor.json via --bubor-xls fixture path', async () => {
    const catalog = loadJson<AkkEnvelope>('catalog.json')
    const rates = loadJson<AkkEnvelope>('network-rates.json')
    const bytes = await loadXlsBytes('bubor/bubor-sample.xls')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-bubor-'))
    try {
      const report = await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        skipAllampapir: true,
        skipRetailInterest: true,
        skipInflation: true,
        skipWebkincstar: true,
        skipOfferings: true,
        buborXlsBytes: bytes,
        generatedAt: '2026-11-22T12:00:00.000Z'
      })
      expect(report.changed).toBe(true)
      expect(report.buborUpdated).toBe(true)
      expect(report.buborAppendedRows).toBeGreaterThan(0)
      const published = JSON.parse(
        await readFile(path.join(tmp, 'data/market/v2', BUBOR_REF_PATH), 'utf8')
      )
      expect(published.source.id).toBe('mnb-bubor2-xls')
      expect(published.series['3M'].rows.length).toBeGreaterThan(0)
      await assertPublishedTree(tmp)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
