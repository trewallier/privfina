import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runCiIngest } from '../tools/market-data/ci-ingest.ts'
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

describe('runCiIngest', () => {
  it('writes GITHUB_OUTPUT changed flags and merges against a separate baseline', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-ci-ingest-'))
    const outFile = path.join(tmp, 'github-output.txt')
    await writeFile(outFile, '', 'utf8')
    const previous = process.env.GITHUB_OUTPUT
    process.env.GITHUB_OUTPUT = outFile
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
        generatedAt: '2026-11-02T18:00:00+01:00'
      })
      expect(first.changed).toBe(true)
      expect(first.asOf).toBe('2026-11-02')
      const output1 = await readFile(outFile, 'utf8')
      expect(output1).toContain('changed=true')
      expect(output1).toContain('as_of=2026-11-02')

      await writeFile(outFile, '', 'utf8')
      const second = await runCiIngest({
        outRoot: path.join(tmp, 'out2'),
        baselineRoot: outRoot,
        rawDir: path.join(tmp, 'raw2'),
        catalog,
        networkRates: rates,
        generatedAt: '2026-11-02T19:00:00+01:00'
      })
      expect(second.changed).toBe(false)
      const output2 = await readFile(outFile, 'utf8')
      expect(output2).toContain('changed=false')
    } finally {
      if (previous === undefined) delete process.env.GITHUB_OUTPUT
      else process.env.GITHUB_OUTPUT = previous
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

      const manifestPath = path.join(tmp, 'data/market/v1/manifest.json')
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
