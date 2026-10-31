import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { runCiIngest } from '../tools/market-data/ci-ingest.ts'
import { commitAndPush } from '../tools/market-data/commit-push.ts'
import {
  clearGithubHttpsExtraheader,
  ensureDataClone
} from '../tools/market-data/ensure-data-clone.ts'
import { publishMarketData } from '../tools/market-data/publish.ts'
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

      // Second ingest: baseline is previous out; should be unchanged.
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
      await publishMarketData({
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

describe('ensureDataClone + commitAndPush', () => {
  it('creates an orphan clone, commits staged market files, and clears auth extraheader', async () => {
    const catalog = await loadFixture('catalog.json')
    const rates = await loadFixture('network-rates.json')
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-ci-push-'))
    const clone = path.join(tmp, 'market-data')
    try {
      const ensured = await ensureDataClone({
        path: clone,
        branch: 'market-data',
        repository: 'example/privfina',
        token: 'test-token-not-for-push'
      })
      expect(ensured.created).toBe(true)

      const headerBefore = spawnSync(
        'git',
        ['config', '--get', 'http.https://github.com/.extraheader'],
        { cwd: clone, encoding: 'utf8' }
      )
      expect(headerBefore.status).toBe(0)
      expect(headerBefore.stdout.length).toBeGreaterThan(0)

      await publishMarketData({
        root: clone,
        rawDir: path.join(tmp, 'raw'),
        catalog,
        networkRates: rates,
        generatedAt: '2026-11-02T18:00:00+01:00'
      })
      await assertPublishedTree(clone)

      const again = await ensureDataClone({
        path: clone,
        branch: 'market-data',
        repository: 'example/privfina',
        token: 'test-token-not-for-push'
      })
      expect(again.created).toBe(false)

      const result = await commitAndPush({
        path: clone,
        branch: 'market-data',
        noPush: true
      })
      expect(result.committed).toBe(true)
      expect(result.pushed).toBe(false)
      expect(result.message).toBe('market-data: asOf 2026-11-02')
      expect(result.authCleared).toBe(true)

      const headerAfter = spawnSync(
        'git',
        ['config', '--get', 'http.https://github.com/.extraheader'],
        { cwd: clone, encoding: 'utf8' }
      )
      expect(headerAfter.status).not.toBe(0)

      const log = spawnSync('git', ['log', '-1', '--pretty=%s'], {
        cwd: clone,
        encoding: 'utf8'
      })
      expect(log.status).toBe(0)
      expect(log.stdout.trim()).toBe('market-data: asOf 2026-11-02')

      const noop = await commitAndPush({
        path: clone,
        branch: 'market-data',
        noPush: true
      })
      expect(noop.committed).toBe(false)

      // Idempotent clear when key is already absent.
      expect(() => clearGithubHttpsExtraheader(clone)).not.toThrow()
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
