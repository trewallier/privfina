import { writeGithubOutput } from './github-output.ts'

export interface ResolveBranchOptions {
  repository: string
  branch: string
  token: string
  fetchImpl?: typeof fetch
}

export interface ResolveBranchResult {
  exists: boolean
  repository: string
  branch: string
}

/**
 * Fail-closed branch existence check via GitHub API.
 * Distinguishes 404 (missing) from other errors (throw).
 */
export async function resolveBranch(
  options: ResolveBranchOptions
): Promise<ResolveBranchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `https://api.github.com/repos/${options.repository}/git/ref/heads/${encodeURIComponent(options.branch)}`
  const res = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${options.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'privfina-market-data'
    }
  })
  if (res.status === 404) {
    writeGithubOutput('exists', 'false')
    return { exists: false, repository: options.repository, branch: options.branch }
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub ref lookup failed (${res.status}) for ${options.branch}: ${body}`)
  }
  writeGithubOutput('exists', 'true')
  return { exists: true, repository: options.repository, branch: options.branch }
}
