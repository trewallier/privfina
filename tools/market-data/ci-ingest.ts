import { EXIT_ERROR, EXIT_UNCHANGED, EXIT_UPDATED, ingestMarketData } from './ingest.ts'
import { writeGithubOutput } from './github-output.ts'
import type { AkkEnvelope, AllampapirEnvelope } from './types.ts'

export interface CiIngestOptions {
  outRoot: string
  baselineRoot?: string
  rawDir: string
  catalog?: AkkEnvelope
  networkRates?: AkkEnvelope
  allampapirPrices?: Record<string, AllampapirEnvelope>
  skipAllampapir?: boolean
  fetchImpl?: typeof fetch
  generatedAt?: string
}

export interface CiIngestResult {
  changed: boolean
  asOf: string | null
  exitCode: typeof EXIT_UPDATED | typeof EXIT_UNCHANGED | typeof EXIT_ERROR
}

/**
 * CI ingest: merge into outRoot using optional baseline, emit GITHUB_OUTPUT.
 * Exit convention for the workflow: always 0 on success (changed or not); 1 on error.
 * `changed` / `as_of` are written to GITHUB_OUTPUT for job outputs + artifact gating.
 */
export async function runCiIngest(options: CiIngestOptions): Promise<CiIngestResult> {
  const report = await ingestMarketData({
    root: options.outRoot,
    previousRoot: options.baselineRoot,
    rawDir: options.rawDir,
    catalog: options.catalog,
    networkRates: options.networkRates,
    allampapirPrices: options.allampapirPrices,
    skipAllampapir: options.skipAllampapir,
    fetchImpl: options.fetchImpl,
    generatedAt: options.generatedAt
  })

  writeGithubOutput('changed', report.changed ? 'true' : 'false')
  writeGithubOutput('as_of', report.asOf ?? '')

  return {
    changed: report.changed,
    asOf: report.asOf,
    exitCode: report.changed ? EXIT_UPDATED : EXIT_UNCHANGED
  }
}
