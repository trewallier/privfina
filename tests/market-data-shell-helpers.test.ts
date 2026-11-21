import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const scriptsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tools/market-data/scripts'
)

describe('market-data bash git helpers', () => {
  it('ensure-clone.sh creates orphan and commit-push.sh commits with --no-push', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-sh-'))
    const clone = path.join(tmp, 'market-data')
    try {
      const ensure = spawnSync('bash', [path.join(scriptsDir, 'ensure-clone.sh')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          MARKET_DATA_PATH: clone,
          MARKET_DATA_BRANCH: 'market-data',
          MARKET_BRANCH_EXISTS: 'false',
          GITHUB_REPOSITORY: 'example/privfina',
          GITHUB_TOKEN: 'test-token-not-for-push',
          MARKET_DATA_BOT_USER_ID: '998877',
          MARKET_DATA_GIT_NAME: 'privfina-market-data[bot]'
        }
      })
      expect(ensure.status, ensure.stderr).toBe(0)
      const identity = spawnSync('git', ['config', '--get', 'user.email'], {
        cwd: clone,
        encoding: 'utf8'
      })
      expect(identity.stdout.trim()).toBe(
        '998877+privfina-market-data[bot]@users.noreply.github.com'
      )
      expect(identity.stdout).not.toContain('github-actions')

      const v2 = path.join(clone, 'data/market/v2')
      await mkdir(v2, { recursive: true })
      await writeFile(
        path.join(v2, 'manifest.json'),
        `${JSON.stringify({ schemaVersion: 2, asOf: '2026-11-02', digests: {} })}\n`,
        'utf8'
      )

      const push = spawnSync('bash', [path.join(scriptsDir, 'commit-push.sh')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          MARKET_DATA_PATH: clone,
          MARKET_DATA_BRANCH: 'market-data',
          MARKET_NO_PUSH: 'true'
        }
      })
      expect(push.status, push.stderr).toBe(0)
      expect(push.stdout).toContain('"committed":true')

      const header = spawnSync(
        'git',
        ['config', '--get', 'http.https://github.com/.extraheader'],
        { cwd: clone, encoding: 'utf8' }
      )
      expect(header.status).not.toBe(0)

      const bad = spawnSync('bash', [path.join(scriptsDir, 'ensure-clone.sh')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          MARKET_DATA_PATH: clone,
          MARKET_BRANCH_EXISTS: 'true',
          GITHUB_REPOSITORY: 'example/privfina'
        }
      })
      // Path already has .git so exists=true path succeeds (identity config only).
      expect(bad.status, bad.stderr).toBe(0)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('ensure-clone.sh fails closed when exists=true but clone is missing', () => {
    const result = spawnSync('bash', [path.join(scriptsDir, 'ensure-clone.sh')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        MARKET_DATA_PATH: path.join(os.tmpdir(), `missing-clone-${Date.now()}`),
        MARKET_BRANCH_EXISTS: 'true',
        GITHUB_REPOSITORY: 'example/privfina'
      }
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/\.git is missing/i)
  })

  it('ensure-clone.sh falls back to MARKET_DATA_APP_ID when bot user id is unset', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-sh-appid-'))
    const clone = path.join(tmp, 'market-data')
    try {
      const ensure = spawnSync('bash', [path.join(scriptsDir, 'ensure-clone.sh')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          MARKET_DATA_PATH: clone,
          MARKET_DATA_BRANCH: 'market-data',
          MARKET_BRANCH_EXISTS: 'false',
          GITHUB_REPOSITORY: 'example/privfina',
          GITHUB_TOKEN: 'test-token-not-for-push',
          MARKET_DATA_APP_ID: '12345',
          MARKET_DATA_GIT_NAME: 'privfina-market-data[bot]'
        }
      })
      expect(ensure.status, ensure.stderr).toBe(0)
      const identity = spawnSync('git', ['config', '--get', 'user.email'], {
        cwd: clone,
        encoding: 'utf8'
      })
      expect(identity.stdout.trim()).toBe(
        '12345+privfina-market-data[bot]@users.noreply.github.com'
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('install-poppler.sh', () => {
  const installScript = path.join(scriptsDir, 'install-poppler.sh')
  const productionManifest = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../tools/market-data/poppler.manifest'
  )

  function sha256(filePath: string): string {
    const result = spawnSync('sha256sum', [filePath], { encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim().split(/\s+/)[0]!
  }

  it('production manifest uses HTTPS URLs and 64-char sha256 digests', async () => {
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(productionManifest, 'utf8')
    const rows = text
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line && !line.startsWith('#'))
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      const parts = row.split('\t')
      expect(parts, row).toHaveLength(5)
      const [, , , hash, url] = parts
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      expect(url).toMatch(/^https:\/\//)
    }
  })

  it('verify-only succeeds for good cache and re-downloads a corrupt cached file once', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-poppler-'))
    const sourceDir = path.join(tmp, 'source')
    const debDir = path.join(tmp, 'debs')
    const manifestPath = path.join(tmp, 'fixture.manifest')
    try {
      await mkdir(sourceDir, { recursive: true })
      await mkdir(debDir, { recursive: true })
      const fileName = 'fixture.deb'
      const sourceFile = path.join(sourceDir, fileName)
      await writeFile(sourceFile, 'good-poppler-fixture\n', 'utf8')
      const hash = sha256(sourceFile)
      const sourceUrl = `file://${sourceFile}`
      await writeFile(
        manifestPath,
        [
          '# test fixture',
          ['fixture-pkg', '1.0', fileName, hash, sourceUrl].join('\t'),
          ''
        ].join('\n'),
        'utf8'
      )

      const good = spawnSync('bash', [installScript], {
        encoding: 'utf8',
        env: {
          ...process.env,
          POPPLER_MANIFEST: manifestPath,
          POPPLER_DEB_DIR: debDir,
          POPPLER_SKIP_INSTALL: '1',
          POPPLER_ALLOW_FILE_URLS: '1'
        }
      })
      expect(good.status, good.stderr).toBe(0)
      expect(good.stdout).toContain('"skipInstall":true')
      expect(sha256(path.join(debDir, fileName))).toBe(hash)

      await writeFile(path.join(debDir, fileName), 'poisoned-cache\n', 'utf8')
      const recovered = spawnSync('bash', [installScript], {
        encoding: 'utf8',
        env: {
          ...process.env,
          POPPLER_MANIFEST: manifestPath,
          POPPLER_DEB_DIR: debDir,
          POPPLER_SKIP_INSTALL: '1',
          POPPLER_ALLOW_FILE_URLS: '1'
        }
      })
      expect(recovered.status, recovered.stderr).toBe(0)
      expect(recovered.stderr).toMatch(/re-download/i)
      expect(sha256(path.join(debDir, fileName))).toBe(hash)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('verify-only fails closed when re-download still mismatches', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'privfina-poppler-bad-'))
    const sourceDir = path.join(tmp, 'source')
    const debDir = path.join(tmp, 'debs')
    const manifestPath = path.join(tmp, 'fixture.manifest')
    try {
      await mkdir(sourceDir, { recursive: true })
      await mkdir(debDir, { recursive: true })
      const fileName = 'fixture.deb'
      const sourceFile = path.join(sourceDir, fileName)
      await writeFile(sourceFile, 'source-body\n', 'utf8')
      // Manifest claims a hash that neither cache nor source can satisfy.
      const wrongHash = '0'.repeat(64)
      await writeFile(
        manifestPath,
        ['fixture-pkg', '1.0', fileName, wrongHash, `file://${sourceFile}`].join('\t') +
          '\n',
        'utf8'
      )
      await writeFile(path.join(debDir, fileName), 'stale-cache\n', 'utf8')

      const result = spawnSync('bash', [installScript], {
        encoding: 'utf8',
        env: {
          ...process.env,
          POPPLER_MANIFEST: manifestPath,
          POPPLER_DEB_DIR: debDir,
          POPPLER_SKIP_INSTALL: '1',
          POPPLER_ALLOW_FILE_URLS: '1'
        }
      })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/still mismatched|SHA256/i)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
