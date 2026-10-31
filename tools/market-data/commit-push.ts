import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export interface CommitPushOptions {
  path: string
  branch: string
  /** Relative path under the clone to stage (default data/market/v1). */
  addPath?: string
  /** Skip `git push` (unit tests). */
  noPush?: boolean
  runGit?: typeof runGitCommand
}

export interface CommitPushResult {
  committed: boolean
  pushed: boolean
  message: string | null
}

function runGitCommand(
  args: string[],
  cwd: string
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: process.env
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
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

async function readAsOf(clonePath: string, addPath: string): Promise<string> {
  const manifestPath = path.join(clonePath, addPath, 'manifest.json')
  try {
    const text = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(text) as { asOf?: string | null }
    return manifest.asOf || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Stage published market-data files, commit when the index changes, push to origin.
 * Relies on credentials already configured on the clone (checkout persist-credentials
 * or ensure-data-clone extraheader) — does not embed tokens on the argv remote URL.
 */
export async function commitAndPush(options: CommitPushOptions): Promise<CommitPushResult> {
  const runGit = options.runGit ?? runGitCommand
  const dir = path.resolve(options.path)
  const addPath = options.addPath ?? 'data/market/v1'

  assertOk('git add', runGit(['add', '--', addPath], dir))

  const staged = runGit(['diff', '--staged', '--quiet'], dir)
  // git diff --quiet: status 0 = no diff, 1 = diff present
  if (staged.status === 0) {
    return { committed: false, pushed: false, message: null }
  }
  if (staged.status !== 1) {
    throw new Error(`git diff --staged --quiet failed: ${staged.stderr}`)
  }

  const asOf = await readAsOf(dir, addPath)
  const message = `market-data: asOf ${asOf}`
  assertOk('git commit', runGit(['commit', '-m', message], dir))

  if (options.noPush) {
    return { committed: true, pushed: false, message }
  }

  assertOk('git push', runGit(['push', '-u', 'origin', `HEAD:${options.branch}`], dir))
  return { committed: true, pushed: true, message }
}
