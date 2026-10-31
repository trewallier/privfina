import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export interface EnsureDataCloneOptions {
  /** Working directory that should become / already is the market-data clone. */
  path: string
  branch: string
  /** owner/repo */
  repository: string
  /** Prefer GITHUB_TOKEN from env when creating remote auth. */
  token?: string
  /** Injected for tests. */
  runGit?: typeof runGitCommand
}

export interface EnsureDataCloneResult {
  created: boolean
  path: string
  branch: string
}

function runGitCommand(
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function assertOk(
  label: string,
  result: { status: number; stdout: string; stderr: string }
): void {
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}): ${result.stderr || result.stdout}`)
  }
}

/**
 * Ensure `path` is a git worktree on `branch`, ready for authenticated push.
 * If checkout already produced a clone, this is a no-op besides identity config.
 * If the directory is missing / not a repo, create an orphan branch locally and
 * configure HTTPS extraheader auth (same pattern as actions/checkout).
 */
export async function ensureDataClone(options: EnsureDataCloneOptions): Promise<EnsureDataCloneResult> {
  const runGit = options.runGit ?? runGitCommand
  const dir = path.resolve(options.path)
  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  const gitDir = path.join(dir, '.git')

  await mkdir(dir, { recursive: true })

  let created = false
  if (!(await pathExists(gitDir))) {
    created = true
    assertOk('git init', runGit(['init'], dir))
    assertOk('orphan checkout', runGit(['checkout', '--orphan', options.branch], dir))
  }

  assertOk(
    'git user.email',
    runGit(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], dir)
  )
  assertOk('git user.name', runGit(['config', 'user.name', 'github-actions[bot]'], dir))

  // Prefer checkout-managed credentials when present; otherwise set extraheader like actions/checkout.
  const remote = runGit(['remote', 'get-url', 'origin'], dir)
  if (remote.status !== 0) {
    if (!token) {
      throw new Error('GITHUB_TOKEN required to configure origin for a new market-data clone')
    }
    const url = `https://github.com/${options.repository}.git`
    assertOk('git remote add', runGit(['remote', 'add', 'origin', url], dir))
    const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64')
    assertOk(
      'git auth extraheader',
      runGit(['config', 'http.https://github.com/.extraheader', `AUTHORIZATION: basic ${basic}`], dir)
    )
  }

  return { created, path: dir, branch: options.branch }
}
