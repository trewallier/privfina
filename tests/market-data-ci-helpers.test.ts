import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  formatCiIngestNoticeLine,
  formatCiIngestStepSummary,
  runCiIngest
} from '../tools/market-data/ci-ingest.ts'
import { ingestMarketData } from '../tools/market-data/ingest.ts'
import type { AkkEnvelope } from '../tools/market-data/types.ts'
import { ValidateError, assertPublishedTree } from '../tools/market-data/validate.ts'

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'market-data'
)

async function loadFixture(name: string): Promise<AkkEnvelope> {
  const text = await readFile(path.join(fixturesDir, name), 'utf8')
  return JSON.parse(text) as AkkEnvelope
}

describe('formatCiIngestNoticeLine', () => {
  it('builds a quiet overview notice line', () => {
    expect(
      formatCiIngestNoticeLine({
        changed: true,
        asOf: '2026-11-05',
        webkincstarHistoricalGateOpen: false,
        webkincstarOverlaySkipped: 3,
        webkincstarFetchFailedDays: 0,
        offeringPdfsDownloaded: 2,
        offeringPdfsPending: 1,
        offeringPdfsParseFailed: 0,
        offeringBackfillFrontier: '2026-08-01',
        offeringGateFrontier: '2026-10-01'
      })
    ).toBe(
      'changed=true as_of=2026-11-05 wk_hist_gate=off wk_overlay_skip=3 wk_fetch_failed=0 pdfs=2 pending=1 parse_failed=0 frontier=2026-08-01 gate_frontier=2026-10-01'
    )
  })
})

describe('formatCiIngestStepSummary', () => {
  it('lists PDF series by family, frontier holders, and WK skips by family', () => {
    const md = formatCiIngestStepSummary({
      changed: true,
      asOf: '2026-11-24',
      webkincstarHistoricalGateOpen: true,
      webkincstarHistoricalEnabled: true,
      webkincstarDatumsFetched: ['2026-11-23'],
      webkincstarOverlaySkipped: 3,
      webkincstarOverlaySkippedSeries: [
        { family: 'dkj', id: 'D261028', name: 'D261028' },
        { family: 'ktv', id: '2026_H', name: '2026/H' },
        { family: 'mapp', id: 'N2026_41', name: 'N2026/41' }
      ],
      webkincstarFetchFailedDays: 0,
      webkincstarSoftFailed: false,
      offeringBackfillFrontier: '2022-04-21',
      offeringBackfillFrontierHolders: [
        {
          family: 'pmap',
          seriesId: 'P260421',
          resourceType: 'ISSUE',
          published: '2022-04-21',
          status: 'transcribed'
        }
      ],
      offeringGateFrontier: '2026-07-06',
      offeringGateFrontierHolders: [
        {
          family: 'baba',
          seriesId: 'B260706',
          resourceType: 'ISSUE',
          published: '2026-07-06',
          status: 'transcribed'
        }
      ],
      offeringPdfsDownloaded: 2,
      offeringPdfsPending: 1,
      offeringPdfsParseFailed: 1,
      offeringPdfsSkippedNoSchedule: 1,
      offeringPdfsTranscribedSeries: [{ family: 'dkj', seriesId: 'D261125' }],
      offeringPdfsParseFailedSeries: [{ family: 'ktv', seriesId: '2026_A' }],
      offeringPdfsSkippedSeries: [
        { family: 'mapp', seriesId: 'N2026_01', resourceType: 'TAP_ISSUE' }
      ],
      offeringsSoftFailed: false,
      retailInterestSoftFailed: false
    })
    expect(md).toContain('Overlay soft-skipped series (by family):')
    expect(md).toContain('- **dkj:** D261028')
    expect(md).toContain('- **ktv:** 2026_H (2026/H)')
    expect(md).toContain('- **mapp:** N2026_41 (N2026/41)')
    expect(md).toContain('deepest frontier holders | pmap/P260421/ISSUE')
    expect(md).toContain('shallowest frontier holders | baba/B260706/ISSUE')
    expect(md).toContain('PDF transcribed (successful) by family:')
    expect(md).toContain('- **dkj:** D261125')
    expect(md).toContain('PDF parse_failed by family:')
    expect(md).toContain('- **ktv:** 2026_A')
    expect(md).toContain('PDF skipped_no_schedule by family (series / type):')
    expect(md).toContain('- **mapp:** N2026_01 (TAP_ISSUE)')
  })

  it('escapes backslashes and pipes in series labels for markdown cells', () => {
    const md = formatCiIngestStepSummary({
      changed: false,
      asOf: '2026-11-24',
      webkincstarHistoricalGateOpen: false,
      webkincstarHistoricalEnabled: false,
      webkincstarDatumsFetched: [],
      webkincstarOverlaySkipped: 1,
      webkincstarOverlaySkippedSeries: [
        { family: 'dkj', id: 'A|B\\C', name: 'A|B\\C' }
      ],
      webkincstarFetchFailedDays: 0,
      webkincstarSoftFailed: false,
      offeringBackfillFrontier: null,
      offeringBackfillFrontierHolders: [],
      offeringGateFrontier: null,
      offeringGateFrontierHolders: [],
      offeringPdfsDownloaded: 0,
      offeringPdfsPending: 0,
      offeringPdfsParseFailed: 0,
      offeringPdfsSkippedNoSchedule: 0,
      offeringPdfsTranscribedSeries: [],
      offeringPdfsParseFailedSeries: [],
      offeringPdfsSkippedSeries: [],
      offeringsSoftFailed: false,
      retailInterestSoftFailed: false
    })
    expect(md).toContain('- **dkj:** A\\|B\\\\C')
  })
})

describe('runCiIngest', () => {
  it('writes GITHUB_OUTPUT changed flags and merges against a separate baseline', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-ci-ingest-'))
    const outFile = path.join(tmp, 'github-output.txt')
    const summaryFile = path.join(tmp, 'step-summary.md')
    await writeFile(outFile, '', 'utf8')
    await writeFile(summaryFile, '', 'utf8')
    const previousOut = process.env.GITHUB_OUTPUT
    const previousSummary = process.env.GITHUB_STEP_SUMMARY
    process.env.GITHUB_OUTPUT = outFile
    process.env.GITHUB_STEP_SUMMARY = summaryFile
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    try {
      const baseline = path.join(tmp, 'baseline')
      const outRoot = path.join(tmp, 'out')
      await mkdir(baseline, { recursive: true })

      const first = await runCiIngest({
        outRoot,
        baselineRoot: baseline,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        skipWebkincstar: true,
        skipOfferings: true,
        generatedAt: '2026-11-02T18:00:00+01:00'
      })
      expect(first.changed).toBe(true)
      expect(first.asOf).toBe('2026-11-02')
      expect(first.webkincstarHistoricalEnabled).toBe(false)
      const output1 = await readFile(outFile, 'utf8')
      expect(output1).toContain('changed=true')
      expect(output1).toContain('as_of=2026-11-02')
      expect(output1).toContain('webkincstar_historical_enabled=false')
      expect(output1).toContain('webkincstar_historical_gate_open=false')
      expect(output1).toContain('webkincstar_overlay_skipped=0')
      expect(output1).toContain('offering_backfill_frontier=')
      expect(output1).toContain('offering_gate_frontier=')
      expect(output1).toContain('offering_pdfs_skipped_no_schedule=')
      const summary1 = await readFile(summaryFile, 'utf8')
      expect(summary1).toContain('#### WebKincstár')
      expect(summary1).toContain('#### Offerings')
      expect(summary1).toContain('historical gate (shallowest frontier) | closed')
      expect(summary1).toContain('historical datums included | no')
      expect(summary1).toContain('deepest frontier (progress, min)')
      expect(summary1).toContain('shallowest frontier (gate readiness, max)')
      expect(summary1).toContain('deepest frontier holders')
      expect(summary1).toContain('shallowest frontier holders')
      expect(summary1).toContain('PDF transcribed (successful) by family:')
      expect(summary1).toContain('PDF parse_failed by family:')
      expect(summary1).toContain('PDF skipped_no_schedule by family (series / type):')
      expect(stdoutSpy.mock.calls.some((c) => String(c[0]).startsWith('::notice::'))).toBe(
        true
      )

      await writeFile(outFile, '', 'utf8')
      await writeFile(summaryFile, '', 'utf8')
      stdoutSpy.mockClear()
      const second = await runCiIngest({
        outRoot: path.join(tmp, 'out2'),
        baselineRoot: outRoot,
        rawDir: path.join(tmp, 'raw2'),
        catalog,
        networkRates: rates,
        skipWebkincstar: true,
        skipOfferings: true,
        generatedAt: '2026-11-02T19:00:00+01:00'
      })
      expect(second.changed).toBe(false)
      const output2 = await readFile(outFile, 'utf8')
      expect(output2).toContain('changed=false')
      expect(output2).toContain('webkincstar_soft_failed=false')
    } finally {
      stdoutSpy.mockRestore()
      if (previousOut === undefined) delete process.env.GITHUB_OUTPUT
      else process.env.GITHUB_OUTPUT = previousOut
      if (previousSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY
      else process.env.GITHUB_STEP_SUMMARY = previousSummary
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('assertPublishedTree', () => {
  it('accepts a freshly published tree and rejects tampered digests', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-validate-'))
    try {
      await ingestMarketData({
        root: tmp,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        generatedAt: '2026-11-02T18:00:00+01:00'
      })
      const tree = await assertPublishedTree(tmp)
      expect(tree.manifest?.asOf).toBe('2026-11-02')

      const manifestPath = path.join(tmp, 'data/market/v2/manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        digests: Record<string, string>
      }
      manifest.digests['families/dkj/latest.json'] = 'deadbeef'
      await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
      await expect(assertPublishedTree(tmp)).rejects.toBeInstanceOf(ValidateError)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
