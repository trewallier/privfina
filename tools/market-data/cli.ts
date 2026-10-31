#!/usr/bin/env node
/**
 * Market-data CLI (ADR 0034 / ROADMAP §6b).
 *
 *   node --experimental-strip-types tools/market-data/cli.ts publish --root . --raw-dir .tmp-market-data
 *   node --experimental-strip-types tools/market-data/cli.ts publish --root . --catalog path --rates path
 *
 * Exit codes: 0 updated, 2 unchanged, 1 error.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { EXIT_ERROR, EXIT_UNCHANGED, EXIT_UPDATED, publishMarketData } from './publish.ts'
import type { AkkEnvelope } from './types.ts'

function printHelp(): void {
  process.stdout.write(`Usage:
  market-data publish --root <repo-or-v1> [--raw-dir <dir>] [--catalog <json>] [--rates <json>]

Exit codes: 0 = updated, 2 = unchanged, 1 = error
`)
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name)
  if (idx === -1) return undefined
  return args[idx + 1]
}

async function loadEnvelope(filePath: string): Promise<AkkEnvelope> {
  const text = await readFile(filePath, 'utf8')
  return JSON.parse(text) as AkkEnvelope
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv
  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp()
    return EXIT_UPDATED
  }
  if (cmd !== 'publish') {
    process.stderr.write(`Unknown command: ${cmd}\n`)
    printHelp()
    return EXIT_ERROR
  }

  const root = getFlag(rest, '--root') ?? process.cwd()
  const rawDir = getFlag(rest, '--raw-dir') ?? path.join(process.cwd(), '.tmp-market-data')
  const catalogPath = getFlag(rest, '--catalog')
  const ratesPath = getFlag(rest, '--rates')

  const catalog = catalogPath ? await loadEnvelope(catalogPath) : undefined
  const networkRates = ratesPath ? await loadEnvelope(ratesPath) : undefined
  if ((catalog && !networkRates) || (!catalog && networkRates)) {
    process.stderr.write('Provide both --catalog and --rates, or neither for live fetch.\n')
    return EXIT_ERROR
  }

  const report = await publishMarketData({ root, rawDir, catalog, networkRates })
  const summary = {
    changed: report.changed,
    asOf: report.asOf,
    appendedRows: report.appendedRows,
    skippedDuplicates: report.skippedDuplicates,
    marketRoot: report.marketRoot
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`)
  return report.changed ? EXIT_UPDATED : EXIT_UNCHANGED
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
