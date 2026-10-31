#!/usr/bin/env node
/**
 * Market-data CLI (ADR 0034 / ROADMAP §6b).
 *
 * Exit codes for `publish`: 0 updated, 2 unchanged, 1 error.
 * Exit codes for `ci-ingest` / `ensure-data-clone` / `commit-push`: 0 success, 1 error
 * (`ci-ingest` records changed=true|false on GITHUB_OUTPUT).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runCiIngest } from './ci-ingest.ts'
import { commitAndPush } from './commit-push.ts'
import { ensureDataClone } from './ensure-data-clone.ts'
import { EXIT_ERROR, EXIT_UNCHANGED, EXIT_UPDATED, publishMarketData } from './publish.ts'
import type { AkkEnvelope } from './types.ts'

function printHelp(): void {
  process.stdout.write(`Usage:
  market-data publish --root <repo-or-v1> [--previous-root <path>] [--raw-dir <dir>] [--catalog <json>] [--rates <json>]
  market-data ci-ingest --out-root <path> [--baseline-root <path>] [--raw-dir <dir>] [--catalog <json>] [--rates <json>]
  market-data ensure-data-clone --path <dir> --branch <name> --repository <owner/repo>
  market-data commit-push --path <dir> --branch <name> [--no-push]

Exit codes: publish 0/2/1; other commands 0/1
`)
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name)
  if (idx === -1) return undefined
  return args[idx + 1]
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

async function loadEnvelope(filePath: string): Promise<AkkEnvelope> {
  const text = await readFile(filePath, 'utf8')
  return JSON.parse(text) as AkkEnvelope
}

async function loadOptionalEnvelopes(args: string[]): Promise<{
  catalog?: AkkEnvelope
  networkRates?: AkkEnvelope
}> {
  const catalogPath = getFlag(args, '--catalog')
  const ratesPath = getFlag(args, '--rates')
  if ((catalogPath && !ratesPath) || (!catalogPath && ratesPath)) {
    throw new Error('Provide both --catalog and --rates, or neither for live fetch.')
  }
  return {
    catalog: catalogPath ? await loadEnvelope(catalogPath) : undefined,
    networkRates: ratesPath ? await loadEnvelope(ratesPath) : undefined
  }
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv
  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp()
    return EXIT_UPDATED
  }

  if (cmd === 'publish') {
    const root = getFlag(rest, '--root') ?? process.cwd()
    const previousRoot = getFlag(rest, '--previous-root')
    const rawDir = getFlag(rest, '--raw-dir') ?? path.join(process.cwd(), '.tmp-market-data')
    const envelopes = await loadOptionalEnvelopes(rest)
    const report = await publishMarketData({
      root,
      previousRoot,
      rawDir,
      catalog: envelopes.catalog,
      networkRates: envelopes.networkRates
    })
    process.stdout.write(
      `${JSON.stringify({
        changed: report.changed,
        asOf: report.asOf,
        appendedRows: report.appendedRows,
        skippedDuplicates: report.skippedDuplicates,
        marketRoot: report.marketRoot
      })}\n`
    )
    return report.changed ? EXIT_UPDATED : EXIT_UNCHANGED
  }

  if (cmd === 'ci-ingest') {
    const outRoot = getFlag(rest, '--out-root')
    if (!outRoot) throw new Error('--out-root is required')
    const baselineRoot = getFlag(rest, '--baseline-root')
    const rawDir = getFlag(rest, '--raw-dir') ?? path.join(process.cwd(), '.tmp-market-data')
    const envelopes = await loadOptionalEnvelopes(rest)
    const result = await runCiIngest({
      outRoot,
      baselineRoot,
      rawDir,
      catalog: envelopes.catalog,
      networkRates: envelopes.networkRates
    })
    process.stdout.write(`${JSON.stringify({ changed: result.changed, asOf: result.asOf })}\n`)
    // Workflow treats any success as exit 0; changed is gated via GITHUB_OUTPUT.
    return EXIT_UPDATED
  }

  if (cmd === 'ensure-data-clone') {
    const clonePath = getFlag(rest, '--path')
    const branch = getFlag(rest, '--branch') ?? 'market-data'
    const repository = getFlag(rest, '--repository') ?? process.env.GITHUB_REPOSITORY
    if (!clonePath) throw new Error('--path is required')
    if (!repository) throw new Error('--repository or GITHUB_REPOSITORY is required')
    const result = await ensureDataClone({ path: clonePath, branch, repository })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return EXIT_UPDATED
  }

  if (cmd === 'commit-push') {
    const clonePath = getFlag(rest, '--path')
    const branch = getFlag(rest, '--branch') ?? 'market-data'
    if (!clonePath) throw new Error('--path is required')
    const result = await commitAndPush({
      path: clonePath,
      branch,
      noPush: hasFlag(rest, '--no-push')
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return EXIT_UPDATED
  }

  process.stderr.write(`Unknown command: ${cmd}\n`)
  printHelp()
  return EXIT_ERROR
}

const args = process.argv.slice(2)
main(args)
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
    process.exitCode = EXIT_ERROR
  })
