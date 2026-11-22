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

  it('marks unknown ISSUE UUIDs when archive is empty; skips TAP and known sha256', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    const emptyDiff = diffOfferingsAgainstArchive(rows, [])
    // Fixture has ISSUE + TAP_CLOSED — only ISSUE is PDF-eligible.
    expect(emptyDiff.unknownDocuments).toHaveLength(1)
    expect(emptyDiff.unknownDocuments[0]?.pathUuid).toBe(
      '5a3cb5cb-121f-4517-bd62-c06b078b8aa9'
    )
    expect(emptyDiff.unknownDocuments[0]?.resourceType).toBe('ISSUE')

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
    expect(withHash.unknownDocuments).toHaveLength(0)
  })

  it('reparseParseFailed requeues sticky parse_failed ISSUE rows only', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    const issue = rows.find((r) => r.resourceType === 'ISSUE')!
    const tap = rows.find((r) => r.resourceType === 'TAP_CLOSED')!
    const diff = diffOfferingsAgainstArchive(
      rows,
      [
        {
          pathId: issue.pathId,
          pathUuid: issue.pathUuid!,
          family: 'pmap',
          seriesId: issue.seriesId,
          isin: issue.isin,
          published: issue.published,
          modifiedOn: issue.modifiedOn,
          resourceType: issue.resourceType,
          sha256: 'c'.repeat(64),
          bytes: 10,
          status: 'parse_failed',
          sourceHost: 'documents.akk.hu'
        },
        {
          pathId: tap.pathId,
          pathUuid: tap.pathUuid!,
          family: 'pmap',
          seriesId: tap.seriesId,
          isin: tap.isin,
          published: tap.published,
          modifiedOn: tap.modifiedOn,
          resourceType: tap.resourceType,
          sha256: 'd'.repeat(64),
          bytes: 10,
          status: 'parse_failed',
          sourceHost: 'documents.akk.hu'
        }
      ],
      { reparseParseFailed: true }
    )
    expect(diff.unknownDocuments.map((r) => r.pathUuid)).toEqual([issue.pathUuid])
  })

  it('reparse skips series with transcribed sibling and enqueues archive-only ISSUE', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    const issue = rows.find((r) => r.resourceType === 'ISSUE')!
    const archiveOnlyUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const diff = diffOfferingsAgainstArchive(
      rows,
      [
        {
          pathId: issue.pathId,
          pathUuid: issue.pathUuid!,
          family: 'pmap',
          seriesId: issue.seriesId,
          isin: issue.isin,
          published: issue.published,
          modifiedOn: issue.modifiedOn,
          resourceType: 'ISSUE',
          sha256: 'c'.repeat(64),
          bytes: 10,
          status: 'parse_failed',
          sourceHost: 'documents.akk.hu'
        },
        {
          pathId: null,
          pathUuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          family: 'pmap',
          seriesId: issue.seriesId,
          isin: issue.isin,
          published: issue.published,
          modifiedOn: issue.modifiedOn,
          resourceType: 'ISSUE',
          sha256: 'e'.repeat(64),
          bytes: 10,
          status: 'transcribed',
          sourceHost: 'documents.akk.hu'
        },
        {
          pathId: null,
          pathUuid: archiveOnlyUuid,
          family: 'dkj',
          seriesId: 'D270120',
          isin: 'HU0000529999',
          published: '2026-10-01 14:00:00',
          modifiedOn: null,
          resourceType: 'ISSUE',
          sha256: 'f'.repeat(64),
          bytes: 10,
          status: 'parse_failed',
          sourceHost: 'documents.akk.hu'
        }
      ],
      { reparseParseFailed: true }
    )
    expect(diff.unknownDocuments.map((r) => r.pathUuid)).toEqual([archiveOnlyUuid])
    expect(diff.unknownDocuments[0]?.archive).toBe(true)
  })

  it('selectOfferingDownloads keeps one UUID per lacking series', async () => {
    const { selectOfferingDownloads } = await import(
      '../tools/market-data/normalize-offerings.ts'
    )
    const rows = [
      {
        family: 'dkj' as const,
        seriesId: 'D270120',
        name: 'D270120',
        isin: null,
        saleWindow: null,
        pathId: null,
        pathUuid: '11111111-1111-1111-1111-111111111111',
        path: null,
        published: '2026-10-01',
        modifiedOn: null,
        resourceType: 'ISSUE',
        archive: false,
        longName: null
      },
      {
        family: 'dkj' as const,
        seriesId: 'D270120',
        name: 'D270120',
        isin: null,
        saleWindow: null,
        pathId: null,
        pathUuid: '22222222-2222-2222-2222-222222222222',
        path: null,
        published: '2026-09-24',
        modifiedOn: null,
        resourceType: 'ISSUE',
        archive: false,
        longName: null
      },
      {
        family: 'dkj' as const,
        seriesId: 'D270818',
        name: 'D270818',
        isin: null,
        saleWindow: null,
        pathId: null,
        pathUuid: '33333333-3333-3333-3333-333333333333',
        path: null,
        published: '2026-10-05',
        modifiedOn: null,
        resourceType: 'ISSUE',
        archive: false,
        longName: null
      }
    ]
    const selected = selectOfferingDownloads(rows, { transcribedSeriesIds: new Set() })
    expect(selected.map((r) => r.pathUuid)).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333'
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

  it('migrates TAP parse_failed archive rows to skipped_no_schedule', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    const tap = rows.find((r) => r.resourceType === 'TAP_CLOSED')!
    const previousArchive = {
      schemaVersion: 2 as const,
      generatedAt: '2026-11-18T12:00:00.000Z',
      source: {
        id: 'akk-public-offerings',
        host: 'www.akk.hu',
        disclaimer: 'test'
      },
      documents: [
        {
          pathId: tap.pathId,
          pathUuid: tap.pathUuid!,
          family: 'pmap' as const,
          seriesId: tap.seriesId,
          isin: tap.isin,
          published: tap.published,
          modifiedOn: tap.modifiedOn,
          resourceType: tap.resourceType,
          sha256: 'a'.repeat(64),
          bytes: 12,
          status: 'parse_failed' as const,
          sourceHost: 'documents.akk.hu'
        }
      ]
    }
    const diff = diffOfferingsAgainstArchive(rows, previousArchive.documents)
    const merged = mergeOfferingsState({}, previousArchive, {
      listingRows: rows,
      saleWindowsBySeries: diff.saleWindowsBySeries,
      archiveUpserts: [],
      generatedAt: '2026-11-18T18:00:00.000Z'
    })
    const doc = merged.offeringArchive.documents.find((d) => d.pathUuid === tap.pathUuid)
    expect(doc?.status).toBe('skipped_no_schedule')
    expect(doc?.sha256).toBe('a'.repeat(64))
  })

  it('migrates ISSUE parse_failed to skipped_already_transcribed when series has transcription', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_pmap.json')
    const rows = normalizeOfferingEnvelope(envelope, 'pmap')
    const issue = rows.find((r) => r.resourceType === 'ISSUE')!
    const failedUuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    const previousArchive = {
      schemaVersion: 2 as const,
      generatedAt: '2026-11-18T12:00:00.000Z',
      source: {
        id: 'akk-public-offerings',
        host: 'www.akk.hu',
        disclaimer: 'test'
      },
      documents: [
        {
          pathId: null,
          pathUuid: failedUuid,
          family: 'pmap' as const,
          seriesId: issue.seriesId,
          isin: issue.isin,
          published: issue.published,
          modifiedOn: issue.modifiedOn,
          resourceType: 'ISSUE',
          sha256: 'b'.repeat(64),
          bytes: 12,
          status: 'parse_failed' as const,
          sourceHost: 'documents.akk.hu'
        },
        {
          pathId: issue.pathId,
          pathUuid: issue.pathUuid!,
          family: 'pmap' as const,
          seriesId: issue.seriesId,
          isin: issue.isin,
          published: issue.published,
          modifiedOn: issue.modifiedOn,
          resourceType: 'ISSUE',
          sha256: 'c'.repeat(64),
          bytes: 20,
          status: 'transcribed' as const,
          sourceHost: 'documents.akk.hu'
        }
      ]
    }
    const diff = diffOfferingsAgainstArchive(rows, previousArchive.documents)
    const merged = mergeOfferingsState({}, previousArchive, {
      listingRows: rows,
      saleWindowsBySeries: diff.saleWindowsBySeries,
      archiveUpserts: [],
      generatedAt: '2026-11-18T18:00:00.000Z'
    })
    const doc = merged.offeringArchive.documents.find((d) => d.pathUuid === failedUuid)
    expect(doc?.status).toBe('skipped_already_transcribed')
    expect(doc?.sha256).toBe('b'.repeat(64))
    expect(merged.archiveSkippedAlreadyTranscribed).toBe(1)
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

describe('ktv / MÁK offering ingest E2E (ADR 0044)', () => {
  function pdfResponse(body = '%PDF-1.4 fake-mak-offering'): Response {
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' }
    })
  }

  it('publishes ktv offerings with MAK paymentDates and null listing saleWindow', async () => {
    const catalog = await loadJson('catalog.json')
    const rates = await loadJson('network-rates.json')
    const ktv = await loadJson('offerings/getPublicOfferings_ktv.json')
    const makText = await readFile(
      path.join(fixtures, 'offerings/pdf-text/ktv-mak-2037-a.txt'),
      'utf8'
    )
    const fixUuid = '97f2a5b9-1ebf-4202-bc86-3f7e2f5f2e96'
    const floatUuid = '8eb21c40-060c-4c25-87b1-71207d22fa86'
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-offerings-ktv-'))
    const rawDir = path.join(tmp, 'raw')

    let pdfHits = 0
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.includes('.pdf')) {
        pdfHits += 1
        return pdfResponse()
      }
      return new Response('nope', { status: 404 })
    }

    const report = await ingestMarketData({
      root: tmp,
      rawDir,
      catalog,
      networkRates: rates,
      skipAllampapir: true,
      skipRetailInterest: true,
      skipInflation: true,
      skipWebkincstar: true,
      offeringEnvelopesByFamily: { ktv },
      fetchImpl,
      offeringPdfTextByUuid: {
        [fixUuid]: makText
        // FLOAT 2036/B intentionally omitted → sticky parse_failed / download without text
      },
      generatedAt: '2026-11-22T15:00:00.000Z'
    })

    expect(report.offeringsUpdated).toBe(true)
    expect(report.offeringsSoftFailed).toBe(false)
    expect(report.offeringPdfsDownloaded).toBe(2)
    expect(pdfHits).toBeGreaterThanOrEqual(2)

    const tree = await loadMarketTree(tmp)
    const offering = tree.families.ktv.offerings.A370923A26
    expect(offering?.paymentDates?.[0]).toBe('2026-09-23')
    expect(offering?.paymentDates?.at(-1)).toBe('2037-09-23')
    expect(offering?.paymentDates).toHaveLength(12)
    expect(offering?.saleWindow).toBeUndefined()
    expect(offering?.dayCount).toBeUndefined()
    expect(offering?.source?.host).toMatch(/akk\.hu/i)

    const floatDoc = tree.offeringArchive?.documents.find((d) => d.pathUuid === floatUuid)
    expect(floatDoc?.sha256).toBeTruthy()
    expect(['parse_failed', 'skipped_no_schedule']).toContain(floatDoc?.status)

    const fixDoc = tree.offeringArchive?.documents.find((d) => d.pathUuid === fixUuid)
    expect(fixDoc?.status).toBe('transcribed')
    expect(fixDoc?.family).toBe('ktv')
  })
})

describe('offering ingest budget (quiet day) + paymentDates E2E', () => {
  function pdfResponse(body = '%PDF-1.4 fake-offering'): Response {
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' }
    })
  }

  it('downloads+parses once via fetchImpl; archive-match second run hits zero PDFs', async () => {
    const catalog = await loadJson('catalog.json')
    const rates = await loadJson('network-rates.json')
    const pmap = await loadJson('offerings/getPublicOfferings_pmap.json')
    const baba = await loadJson('offerings/getPublicOfferings_baba.json')
    const pmapText = await readFile(
      path.join(fixtures, 'offerings/pdf-text/pmap-2036-i1.txt'),
      'utf8'
    )
    const babaText = await readFile(
      path.join(fixtures, 'offerings/pdf-text/baba-2045-s.txt'),
      'utf8'
    )
    const tipPmapUuid = '5a3cb5cb-121f-4517-bd62-c06b078b8aa9'
    const babaUuid = 'd1599c29-cd4a-417a-ae7a-932bfa987a70'
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'market-offerings-quiet-'))
    const rawDir = path.join(tmp, 'raw')
    const envelopes = { pmap, baba }

    let pdfHits = 0
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.includes('.pdf')) {
        pdfHits += 1
        return pdfResponse()
      }
      return new Response('nope', { status: 404 })
    }

    const first = await ingestMarketData({
      root: tmp,
      rawDir,
      catalog,
      networkRates: rates,
      skipAllampapir: true,
      skipRetailInterest: true,
      skipInflation: true,
      skipWebkincstar: true,
      offeringEnvelopesByFamily: envelopes,
      // Offline ÁKK fixtures alone skip the PDF gate; fetchImpl enables it so
      // archive-match dedupe is actually exercised (ADR 0041 quiet-day budget).
      fetchImpl,
      offeringPdfTextByUuid: {
        [tipPmapUuid]: pmapText,
        [babaUuid]: babaText
      },
      generatedAt: '2026-11-18T18:00:00.000Z'
    })
    expect(first.offeringsUpdated).toBe(true)
    // ISSUE-only gate: PMÁP ISSUE + BABA ISSUE (TAP_CLOSED is metadata-only).
    expect(first.offeringPdfsDownloaded).toBe(2)
    expect(first.offeringPdfsParseFailed).toBe(0)
    expect(pdfHits).toBeGreaterThanOrEqual(2)

    const tree = await loadMarketTree(tmp)
    expect(tree.families.pmap.offerings.A360221I26?.paymentDates?.[0]).toBe('2027-02-21')
    expect(tree.families.pmap.offerings.A360221I26?.dayCount).toBe('ACT/ACT')
    expect(tree.families.baba.offerings.A450201S26?.paymentDates?.[0]).toBe('2027-02-01')
    expect(
      tree.offeringArchive?.documents.filter((d) => d.sha256 != null).length
    ).toBeGreaterThanOrEqual(2)
    expect(
      tree.offeringArchive?.documents.find(
        (d) => d.pathUuid === '9b403e1a-a2a2-4d78-a391-b62ad4fb9d3c'
      )?.status
    ).toBe('listed')

    const pdfHitsBeforeSecond = pdfHits
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
      offeringEnvelopesByFamily: envelopes,
      fetchImpl,
      offeringPdfTextByUuid: {
        [tipPmapUuid]: pmapText,
        [babaUuid]: babaText
      },
      generatedAt: '2026-11-18T19:00:00.000Z'
    })
    expect(second.offeringPdfsDownloaded).toBe(0)
    expect(second.offeringPdfsPending).toBe(0)
    expect(pdfHits).toBe(pdfHitsBeforeSecond)
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

describe('ktv / MÁK offering family registration (ADR 0044)', () => {
  it('maps ÁKK label KTV (and MAK gloss) to family ktv with auction URL', async () => {
    const {
      OFFERING_FAMILIES,
      OFFERING_LABEL_BY_FAMILY,
      isOfferingFamily,
      offeringFamilyFromLabel
    } = await import('../tools/market-data/offering-families.ts')
    const { buildPublicOfferingsUrl } = await import('../tools/market-data/fetch-akk-offerings.ts')

    expect(isOfferingFamily('ktv')).toBe(true)
    expect(OFFERING_FAMILIES).toContain('ktv')
    expect(OFFERING_LABEL_BY_FAMILY.ktv).toEqual({ label: 'KTV', mode: 'auction' })
    expect(offeringFamilyFromLabel('KTV')).toBe('ktv')
    expect(offeringFamilyFromLabel('MÁK')).toBe('ktv')
    expect(offeringFamilyFromLabel('MAK')).toBe('ktv')

    const url = buildPublicOfferingsUrl('ktv')
    expect(url).toContain('label=KTV')
    expect(url).toContain('auctionStart=')
    expect(url).toContain('auctionType=ISSUE')
    expect(url).not.toContain('ptsStart=')
  })

  it('normalizes KTV auction listings without inventing saleWindow', async () => {
    const envelope = await loadJson('offerings/getPublicOfferings_ktv.json')
    const rows = normalizeOfferingEnvelope(envelope, 'ktv')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.family).toBe('ktv')
    expect(rows[0]?.seriesId).toBe('A370923A26')
    expect(rows[0]?.saleWindow).toBeNull()
    expect(rows[0]?.pathUuid).toBe('97f2a5b9-1ebf-4202-bc86-3f7e2f5f2e96')
    expect(rows[0]?.resourceType).toBe('ISSUE')
    expect(rows[1]?.seriesId).toBe('A361126B26')
    expect(rows[1]?.saleWindow).toBeNull()

    const diff = diffOfferingsAgainstArchive(rows, [])
    expect(diff.unknownDocuments).toHaveLength(2)
    expect(diff.saleWindowsBySeries.size).toBe(0)
  })
})

describe('parseOfferingPdfText', () => {
  it('extracts PMÁP explicit payment dates and ACT/ACT day-count', async () => {
    const { parseOfferingPdfText } = await import('../tools/market-data/parse-offering-pdf.ts')
    const text = await readFile(
      path.join(fixtures, 'offerings/pdf-text/pmap-2036-i1.txt'),
      'utf8'
    )
    const parsed = parseOfferingPdfText(text)
    expect(parsed.dayCount).toBe('ACT/ACT')
    expect(parsed.paymentDates[0]).toBe('2027-02-21')
    expect(parsed.paymentDates.at(-1)).toBe('2036-02-21')
    expect(parsed.paymentDates).toHaveLength(10)
  })

  it('expands Babakötvény recurring Feb-1 coupons through maturity', async () => {
    const { parseOfferingPdfText } = await import('../tools/market-data/parse-offering-pdf.ts')
    const text = await readFile(
      path.join(fixtures, 'offerings/pdf-text/baba-2045-s.txt'),
      'utf8'
    )
    const parsed = parseOfferingPdfText(text)
    expect(parsed.dayCount).toBe('ACT/ACT')
    expect(parsed.paymentDates[0]).toBe('2027-02-01')
    expect(parsed.paymentDates.at(-1)).toBe('2045-02-01')
    expect(parsed.paymentDates.length).toBeGreaterThan(10)
  })

  it('parses FixMAP split kamatfizetés date list', async () => {
    const { parseOfferingPdfText } = await import('../tools/market-data/parse-offering-pdf.ts')
    const text = await readFile(
      path.join(fixtures, 'offerings/pdf-text/fixmap-2029-q26.txt'),
      'utf8'
    )
    const parsed = parseOfferingPdfText(text)
    expect(parsed.dayCount).toBe('ACT/ACT')
    expect(parsed.maturity).toBe('2029-07-24')
    expect(parsed.paymentDates[0]).toBe('2026-10-24')
    expect(parsed.paymentDates.at(-1)).toBe('2029-07-24')
    expect(parsed.paymentDates).toHaveLength(12)
  })

  it('parses MÁPP Kamatteljesítés table payment dates', async () => {
    const { parseOfferingPdfText } = await import('../tools/market-data/parse-offering-pdf.ts')
    const text = await readFile(
      path.join(fixtures, 'offerings/pdf-text/mapp-2031-m26.txt'),
      'utf8'
    )
    const parsed = parseOfferingPdfText(text)
    expect(parsed.dayCount).toBe('ACT/ACT')
    expect(parsed.maturity).toBe('2031-02-27')
    expect(parsed.paymentDates).toEqual([
      '2027-02-27',
      '2028-02-27',
      '2029-02-27',
      '2030-02-27',
      '2031-02-27'
    ])
  })

  it('accepts DKJ zero-coupon ISSUE with empty paymentDates + ACT/360', async () => {
    const { parseOfferingPdfText } = await import('../tools/market-data/parse-offering-pdf.ts')
    const text = await readFile(
      path.join(fixtures, 'offerings/pdf-text/dkj-d270623.txt'),
      'utf8'
    )
    const parsed = parseOfferingPdfText(text)
    expect(parsed.dayCount).toBe('ACT/360')
    expect(parsed.maturity).toBe('2027-06-23')
    expect(parsed.paymentDates).toEqual([])
  })

  it('classifies Babakötvény KÖZLEMÉNY amendments as skip_no_schedule', async () => {
    const { classifyOfferingPdfText, parseOfferingPdfText } = await import(
      '../tools/market-data/parse-offering-pdf.ts'
    )
    const text = await readFile(
      path.join(fixtures, 'offerings/pdf-text/baba-kozlemeny-modositas.txt'),
      'utf8'
    )
    expect(classifyOfferingPdfText(text)).toBe('skip_no_schedule')
    expect(() => parseOfferingPdfText(text)).toThrow(/No paymentDates or dayCount/)
  })

  it('classifies real Baba and DKJ offering text as parse', async () => {
    const { classifyOfferingPdfText } = await import('../tools/market-data/parse-offering-pdf.ts')
    const baba = await readFile(path.join(fixtures, 'offerings/pdf-text/baba-2045-s.txt'), 'utf8')
    const dkj = await readFile(path.join(fixtures, 'offerings/pdf-text/dkj-d270623.txt'), 'utf8')
    expect(classifyOfferingPdfText(baba)).toBe('parse')
    expect(classifyOfferingPdfText(dkj)).toBe('parse')
  })

  it('parses MÁK/KTV annual date±rate kamatfizetés table (2037/A)', async () => {
    const { classifyOfferingPdfText, parseOfferingPdfText } = await import(
      '../tools/market-data/parse-offering-pdf.ts'
    )
    const text = await readFile(
      path.join(fixtures, 'offerings/pdf-text/ktv-mak-2037-a.txt'),
      'utf8'
    )
    expect(classifyOfferingPdfText(text)).toBe('parse')
    const parsed = parseOfferingPdfText(text)
    expect(parsed.maturity).toBe('2037-09-23')
    expect(parsed.dayCount).toBeNull()
    expect(parsed.paymentDates[0]).toBe('2026-09-23')
    expect(parsed.paymentDates.at(-1)).toBe('2037-09-23')
    expect(parsed.paymentDates).toHaveLength(12)
    expect(parsed.paymentRates).toHaveLength(12)
    // Same-row rates only; first period / orphan `%` lines stay null (no invent).
    expect(parsed.paymentRates?.[0]).toBeNull()
    expect(parsed.paymentRates?.[1]).toBe(6.25)
    expect(parsed.paymentRates?.[2]).toBe(6.25)
  })

  it('parses Green MÁK/KTV long annual table (2051/G)', async () => {
    const { parseOfferingPdfText } = await import('../tools/market-data/parse-offering-pdf.ts')
    const text = await readFile(
      path.join(fixtures, 'offerings/pdf-text/ktv-mak-2051-g-green.txt'),
      'utf8'
    )
    const parsed = parseOfferingPdfText(text)
    expect(parsed.maturity).toBe('2051-04-28')
    expect(parsed.paymentDates[0]).toBe('2022-04-28')
    expect(parsed.paymentDates.at(-1)).toBe('2051-04-28')
    expect(parsed.paymentDates).toHaveLength(30)
    expect(parsed.paymentRates).toHaveLength(30)
  })

  it('FLOAT MÁK table yields paymentDates with null rates (never invent coupons)', async () => {
    const { classifyOfferingPdfText, parseOfferingPdfText } = await import(
      '../tools/market-data/parse-offering-pdf.ts'
    )
    const text = await readFile(
      path.join(fixtures, 'offerings/pdf-text/ktv-mak-2036-b-float.txt'),
      'utf8'
    )
    expect(classifyOfferingPdfText(text)).toBe('parse')
    const parsed = parseOfferingPdfText(text)
    expect(parsed.maturity).toBe('2036-11-26')
    expect(parsed.dayCount).toBeNull()
    expect(parsed.paymentDates[0]).toBe('2027-11-26')
    expect(parsed.paymentDates.at(-1)).toBe('2036-11-26')
    expect(parsed.paymentDates).toHaveLength(10)
    expect(parsed.paymentRates).toEqual(Array(10).fill(null))
  })
})

describe('fetchOfferingPdfsForListings (dedupe + max 10)', () => {
  function pdfResponse(body = '%PDF-1.4 fake'): Response {
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' }
    })
  }

  it('skips UUIDs that already have sha256 and ignores TAP unknowns', async () => {
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
    // Remaining fixture row is TAP_CLOSED — not downloaded.
    expect(result.downloadedCount).toBe(0)
    expect(fetches).toBe(0)
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

  it('rejects oversized PDF bodies via Content-Length and streaming cap', async () => {
    const { downloadOfferingPdf, readResponseBodyWithCap } = await import(
      '../tools/market-data/fetch-offering-pdf.ts'
    )
    const { MAX_OFFERING_PDF_BYTES } = await import(
      '../tools/market-data/offering-families.ts'
    )

    await expect(
      readResponseBodyWithCap(
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(MAX_OFFERING_PDF_BYTES + 1) }
        }),
        MAX_OFFERING_PDF_BYTES,
        'https://example.test/big.pdf'
      )
    ).rejects.toThrow(/Content-Length/)

    const oversize = new Uint8Array(64)
    oversize.set([0x25, 0x50, 0x44, 0x46]) // %PDF
    await expect(
      downloadOfferingPdf('00000000-0000-4000-8000-000000000099', {
        retries: 1,
        backoffMs: 1,
        maxBytes: 16,
        fetchImpl: async () =>
          new Response(oversize, {
            status: 200,
            headers: { 'Content-Type': 'application/pdf' }
          })
      })
    ).rejects.toThrow(/exceeds 16 bytes|ÁKK and allampapir/)
  })
})
