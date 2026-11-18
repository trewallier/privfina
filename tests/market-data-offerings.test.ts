import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import { loadMarketTree } from '../tools/market-data/io.ts'
import { mergeOfferingsState } from '../tools/market-data/merge-offerings.ts'
import {
  diffOfferingsAgainstArchive,
  normalizeOfferingEnvelope,
  pathUuidFromOfferingPath
} from '../tools/market-data/normalize-offerings.ts'
import type { AkkEnvelope } from '../tools/market-data/types.ts'

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'market-data'
)

async function loadJson(rel: string): Promise<AkkEnvelope> {
  const text = await readFile(path.join(fixtures, rel), 'utf8')
  return JSON.parse(text) as AkkEnvelope
}

describe('offering listing normalize/diff (ADR 0041)', () => {
  it('extracts path UUID and sale windows from getPublicOfferings', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.seriesId).toBe('A360221I26')
    expect(rows[0]?.saleWindow).toEqual({ from: '2026-07-17', to: '2027-07-16' })
    expect(rows[0]?.pathUuid).toBe('5a3cb5cb-121f-4517-bd62-c06b078b8aa9')
    expect(pathUuidFromOfferingPath('public_offerings/5a3cb5cb-121f-4517-bd62-c06b078b8aa9.pdf')).toBe(
      '5a3cb5cb-121f-4517-bd62-c06b078b8aa9'
    )
  })

  it('marks unknown path UUIDs when archive is empty; skips known sha256', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    const emptyDiff = diffOfferingsAgainstArchive(rows, [])
    expect(emptyDiff.unknownDocuments).toHaveLength(2)

    const withHash = diffOfferingsAgainstArchive(rows, [
      {
        pathId: rows[0]!.pathId,
        pathUuid: rows[0]!.pathUuid!,
        family: 'pmap',
        seriesId: rows[0]!.seriesId,
        isin: rows[0]!.isin,
        published: rows[0]!.published,
        modifiedOn: rows[0]!.modifiedOn,
        resourceType: rows[0]!.resourceType,
        sha256: 'a'.repeat(64),
        bytes: 100,
        status: 'downloaded',
        sourceHost: 'documents.akk.hu'
      }
    ])
    expect(withHash.unknownDocuments.map((r) => r.pathUuid)).toEqual([
      '9b403e1a-a2a2-4d78-a391-b62ad4fb9d3c'
    ])
  })

  it('prefers non-archive tip for series saleWindow', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    const diff = diffOfferingsAgainstArchive(rows, [])
    const tip = diff.saleWindowsBySeries.get('pmap\0A360221I26')
    expect(tip?.window).toEqual({ from: '2026-07-17', to: '2027-07-16' })
  })
})

describe('mergeOfferingsState', () => {
  it('publishes offering stubs + archive + series saleWindow patches', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    const diff = diffOfferingsAgainstArchive(rows, [])
    const merged = mergeOfferingsState({}, null, {
      listingRows: rows,
      saleWindowsBySeries: diff.saleWindowsBySeries,
      archiveUpserts: [],
      generatedAt: '2026-11-18T18:00:00.000Z'
    })
    expect(merged.offeringsByFamily.pmap?.A360221I26?.saleWindow).toEqual({
      from: '2026-07-17',
      to: '2027-07-16'
    })
    expect(merged.offeringsByFamily.pmap?.A360221I26?.source.host).toBe('www.akk.hu')
    expect(merged.offeringArchive.documents.length).toBeGreaterThanOrEqual(2)
    expect(merged.seriesSaleWindows.some((p) => p.seriesId === 'A360221I26')).toBe(true)
  })
})

describe('ingestMarketData offerings listing', () => {
  it('writes offerings and archive from offline fixtures without PDF download', async () => {
    const catalog = await loadJson('catalog.json')
    const rates = await loadJson('network-rates.json')
    const pmap = await loadJson('offerings/getPublicOfferings_pmap.json')
    const baba = await loadJson('offerings/getPublicOfferings_baba.json')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-offerings-'))
    const rawDir = path.join(tmp, 'raw')

    const report = await ingestMarketData({
      root: tmp,
      rawDir,
      catalog,
      networkRates: rates,
      skipAllampapir: true,
      skipRetailInterest: true,
      skipInflation: true,
      skipWebkincstar: true,
      offeringEnvelopesByFamily: { pmap, baba },
      generatedAt: '2026-11-18T18:00:00.000Z'
    })

    expect(report.offeringsUpdated).toBe(true)
    expect(report.offeringsSoftFailed).toBe(false)
    expect(report.offeringPdfsDownloaded).toBe(0)

    const tree = await loadMarketTree(tmp)
    expect(tree.offeringArchive?.documents.length).toBeGreaterThan(0)
    expect(tree.families.pmap.offerings.A360221I26?.saleWindow?.from).toBe('2026-07-17')
    expect(tree.families.baba.offerings.A450201S26?.saleWindow?.from).toBe('2026-02-02')
    expect(tree.manifest?.refs?.offeringArchive).toBe('refs/offering-archive.json')

    // Second identical run: digest-gated no-op for offerings content.
    const second = await ingestMarketData({
      root: tmp,
      previousRoot: tmp,
      rawDir,
      catalog,
      networkRates: rates,
      skipAllampapir: true,
      skipRetailInterest: true,
      skipInflation: true,
      skipWebkincstar: true,
      offeringEnvelopesByFamily: { pmap, baba },
      generatedAt: '2026-11-18T19:00:00.000Z'
    })
    expect(second.changed).toBe(false)
  })

  it('skipOfferings keeps previous archive and still publishes prices', async () => {
    const catalog = await loadJson('catalog.json')
    const rates = await loadJson('network-rates.json')
    const pmap = await loadJson('offerings/getPublicOfferings_pmap.json')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-offerings-skip-'))
    const rawDir = path.join(tmp, 'raw')

    await ingestMarketData({
      root: tmp,
      rawDir,
      catalog,
      networkRates: rates,
      skipAllampapir: true,
      skipRetailInterest: true,
      skipInflation: true,
      skipWebkincstar: true,
      offeringEnvelopesByFamily: { pmap },
      generatedAt: '2026-11-18T18:00:00.000Z'
    })
    const before = await loadMarketTree(tmp)
    expect(before.offeringArchive?.documents.length).toBeGreaterThan(0)

    const report = await ingestMarketData({
      root: tmp,
      previousRoot: tmp,
      rawDir,
      catalog,
      networkRates: rates,
      skipAllampapir: true,
      skipRetailInterest: true,
      skipInflation: true,
      skipWebkincstar: true,
      skipOfferings: true,
      generatedAt: '2026-11-18T19:00:00.000Z'
    })
    expect(report.offeringsUpdated).toBe(false)
    const after = await loadMarketTree(tmp)
    expect(after.offeringArchive?.documents.length).toBe(
      before.offeringArchive?.documents.length
    )
  })
})

describe('fetchAkkOfferingListings soft-fail isolation', () => {
  it('isolates per-family failures without aborting siblings', async () => {
    const { fetchAkkOfferingListings } = await import(
      '../tools/market-data/fetch-akk-offerings.ts'
    )
    const pmap = await loadJson('offerings/getPublicOfferings_pmap.json')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'offerings-fetch-'))
    const result = await fetchAkkOfferingListings({
      rawDir: tmp,
      families: ['pmap', 'bmap'],
      envelopesByFamily: { pmap },
      retries: 1,
      backoffMs: 1,
      fetchImpl: async () => {
        throw new Error('bmap listing down')
      }
    })
    expect(result.byFamily.map((f) => f.family)).toEqual(['pmap'])
    expect(result.failures.map((f) => f.family)).toEqual(['bmap'])
  })
})

describe('fetchOfferingPdfsForListings (dedupe + max 10)', () => {
  function pdfResponse(body = '%PDF-1.4 fake'): Response {
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' }
    })
  }

  it('skips UUIDs that already have sha256 in the archive', async () => {
    const { fetchOfferingPdfsForListings } = await import(
      '../tools/market-data/fetch-offering-pdf.ts'
    )
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    const known = rows[0]!
    let fetches = 0
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'offerings-pdf-'))
    const result = await fetchOfferingPdfsForListings(rows, new Map([
      [
        known.pathUuid!,
        {
          pathId: known.pathId,
          pathUuid: known.pathUuid!,
          family: 'pmap',
          seriesId: known.seriesId,
          isin: known.isin,
          published: known.published,
          modifiedOn: known.modifiedOn,
          resourceType: known.resourceType,
          sha256: 'b'.repeat(64),
          bytes: 12,
          status: 'downloaded',
          sourceHost: 'documents.akk.hu'
        }
      ]
    ]), {
      rawDir: tmp,
      retries: 1,
      backoffMs: 1,
      fetchImpl: async () => {
        fetches += 1
        return pdfResponse()
      }
    })
    expect(result.downloadedCount).toBe(1)
    expect(fetches).toBe(1)
    expect(result.downloaded[0]?.row.pathUuid).toBe(rows[1]?.pathUuid)
  })

  it('downloads at most 10 unknowns per family and leaves the rest pending', async () => {
    const { fetchOfferingPdfsForListings } = await import(
      '../tools/market-data/fetch-offering-pdf.ts'
    )
    const rows = Array.from({ length: 11 }, (_, i) => ({
      family: 'pmap' as const,
      seriesId: `S${i}`,
      name: `S${i}`,
      isin: null,
      saleWindow: { from: '2026-01-01', to: '2026-12-31' },
      pathId: `id-${i}`,
      pathUuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      path: `public_offerings/00000000-0000-4000-8000-${String(i).padStart(12, '0')}.pdf`,
      published: `2026-01-${String((i % 28) + 1).padStart(2, '0')} 12:00:00`,
      modifiedOn: null,
      resourceType: 'ISSUE',
      archive: false,
      longName: `S${i}`
    }))
    let fetches = 0
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'offerings-pdf-cap-'))
    const result = await fetchOfferingPdfsForListings(rows, new Map(), {
      rawDir: tmp,
      maxPerFamily: 10,
      retries: 1,
      backoffMs: 1,
      fetchImpl: async () => {
        fetches += 1
        return pdfResponse()
      }
    })
    expect(result.downloadedCount).toBe(10)
    expect(result.pendingCount).toBe(1)
    expect(fetches).toBe(10)
    expect(result.archiveUpserts.filter((d) => d.status === 'pending_download')).toHaveLength(1)
  })

  it('second pass downloads zero when sha256 already recorded', async () => {
    const { fetchOfferingPdfsForListings } = await import(
      '../tools/market-data/fetch-offering-pdf.ts'
    )
    const envelope = await loadJson('offerings/getPublicOfferings_baba.json')
    const rows = normalizeOfferingEnvelope(envelope, 'baba')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'offerings-pdf-2-'))
    const first = await fetchOfferingPdfsForListings(rows, new Map(), {
      rawDir: tmp,
      retries: 1,
      backoffMs: 1,
      fetchImpl: async () => pdfResponse('%PDF-1.4 once')
    })
    expect(first.downloadedCount).toBe(1)
    const known = new Map(
      first.archiveUpserts
        .filter((d) => d.sha256)
        .map((d) => [d.pathUuid, d] as const)
    )
    let fetches = 0
    const second = await fetchOfferingPdfsForListings(rows, known, {
      rawDir: tmp,
      retries: 1,
      backoffMs: 1,
      fetchImpl: async () => {
        fetches += 1
        return pdfResponse()
      }
    })
    expect(second.downloadedCount).toBe(0)
    expect(fetches).toBe(0)
  })
})
