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
      expect(identity.stdout).not.toContain('github-actions')

      const v1 = path.join(clone, 'data/market/v1')
      await mkdir(v1, { recursive: true })
      await writeFile(
        path.join(v1, 'manifest.json'),
        `${JSON.stringify({ schemaVersion: 1, asOf: '2026-11-02', digests: {} })}\n`,
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
})
