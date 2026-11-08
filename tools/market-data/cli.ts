#!/usr/bin/env node
/**
 * Market-data CLI (ADR 0034 / 0035 / 0036 / 0037 / ROADMAP §6b–§6e).
 *
 * Exit codes:
 * - `ingest`: 0 updated, 2 unchanged, 1 error
 * - `ci-ingest`: 0 on success (changed via GITHUB_OUTPUT), 1 error
 * - other commands: 0 success, 1 error
 *
 * Git clone/commit/push live in `tools/market-data/scripts/*.sh` (workflow path).
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { runCiIngest } from './ci-ingest.ts'
import { EXIT_ERROR, EXIT_UNCHANGED, EXIT_UPDATED, ingestMarketData } from './ingest.ts'
import { resolveBranch } from './resolve-branch.ts'
import type { AkkEnvelope, AllampapirEnvelope } from './types.ts'
import { assertPublishedTree } from './validate.ts'
import {
  WEBKINCSTAR_REPORTS,
  type WebkincstarReportName
} from './webkincstar-reports.ts'

function printHelp(): void {
  process.stdout.write(`Usage:
  market-data ingest --root <repo-or-v2> [--previous-root <path>] [--raw-dir <dir>]
      [--catalog <json>] [--rates <json>] [--allampapir-dir <dir>] [--skip-allampapir]
      [--retail-interest <json>] [--skip-retail-interest]
      [--inflation-csv <csv>] [--skip-inflation]
      [--webkincstar-dir <dir>] [--datum YYYY-MM-DD] [--skip-webkincstar]
  market-data ci-ingest --out-root <path> [--baseline-root <path>] [--raw-dir <dir>]
      [--catalog <json>] [--rates <json>] [--allampapir-dir <dir>] [--skip-allampapir]
      [--retail-interest <json>] [--skip-retail-interest]
      [--inflation-csv <csv>] [--skip-inflation]
      [--webkincstar-dir <dir>] [--datum YYYY-MM-DD] [--skip-webkincstar]
  market-data validate-tree --root <repo-or-v2>
  market-data resolve-branch --repository <owner/repo> --branch <name>

Git (workflow): bash tools/market-data/scripts/ensure-clone.sh | commit-push.sh

Exit codes: ingest 0/2/1; ci-ingest 0/1 (changed on GITHUB_OUTPUT); other commands 0/1
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

async function loadAllampapirDir(
  dir: string
): Promise<Record<string, AllampapirEnvelope>> {
  const entries = await readdir(dir)
  const prices: Record<string, AllampapirEnvelope> = {}
  for (const name of entries) {
    const m = /^prices_(.+)\.json$/i.exec(name)
    if (!m) continue
    const text = await readFile(path.join(dir, name), 'utf8')
    prices[m[1]] = JSON.parse(text) as AllampapirEnvelope
  }
  return prices
}

async function loadWebkincstarDir(
  dir: string
): Promise<Partial<Record<WebkincstarReportName, string>>> {
  const textByReport: Partial<Record<WebkincstarReportName, string>> = {}
  const entries = await readdir(dir)
  const aliases: Record<WebkincstarReportName, RegExp> = {
    _20631_arfolyam_dkj: /(?:^|[_-])dkj(?:[_-]|$)/i,
    _20633_arfolyam_mak: /(?:^|[_-])mak(?:[_-]|$)/i
  }
  for (const report of WEBKINCSTAR_REPORTS) {
    const candidates = entries.filter(
      (name) =>
        name.endsWith('.txt') &&
        (name.startsWith(report) || aliases[report].test(name))
    )
    const preferred =
      candidates.find((n) => n === `${report}.txt`) ??
      candidates.sort()[0]
    if (!preferred) continue
    textByReport[report] = await readFile(path.join(dir, preferred), 'utf8')
  }
  return textByReport
}

async function loadOptionalSources(args: string[]): Promise<{
  catalog?: AkkEnvelope
  networkRates?: AkkEnvelope
  allampapirPrices?: Record<string, AllampapirEnvelope>
  skipAllampapir?: boolean
  retailInterestEnvelope?: AllampapirEnvelope
  skipRetailInterest?: boolean
  inflationCsvPath?: string
  skipInflation?: boolean
  webkincstarTextByReport?: Partial<Record<WebkincstarReportName, string>>
  webkincstarDatum?: string
  skipWebkincstar?: boolean
}> {
  const catalogPath = getFlag(args, '--catalog')
  const ratesPath = getFlag(args, '--rates')
  if ((catalogPath && !ratesPath) || (!catalogPath && ratesPath)) {
    throw new Error('Provide both --catalog and --rates, or neither for live fetch.')
  }
  const allampapirDir = getFlag(args, '--allampapir-dir')
  const skipAllampapir = hasFlag(args, '--skip-allampapir')
  if (skipAllampapir && allampapirDir) {
    throw new Error('Use either --allampapir-dir or --skip-allampapir, not both.')
  }
  const retailInterestPath = getFlag(args, '--retail-interest')
  const skipRetailInterest = hasFlag(args, '--skip-retail-interest')
  if (skipRetailInterest && retailInterestPath) {
    throw new Error('Use either --retail-interest or --skip-retail-interest, not both.')
  }
  const inflationCsvPath = getFlag(args, '--inflation-csv')
  const skipInflation = hasFlag(args, '--skip-inflation')
  if (skipInflation && inflationCsvPath) {
    throw new Error('Use either --inflation-csv or --skip-inflation, not both.')
  }
  const webkincstarDir = getFlag(args, '--webkincstar-dir')
  const skipWebkincstar = hasFlag(args, '--skip-webkincstar')
  if (skipWebkincstar && webkincstarDir) {
    throw new Error('Use either --webkincstar-dir or --skip-webkincstar, not both.')
  }
  const webkincstarDatum = getFlag(args, '--datum')
  return {
    catalog: catalogPath ? await loadEnvelope(catalogPath) : undefined,
    networkRates: ratesPath ? await loadEnvelope(ratesPath) : undefined,
    allampapirPrices: allampapirDir ? await loadAllampapirDir(allampapirDir) : undefined,
    skipAllampapir,
    retailInterestEnvelope: retailInterestPath
      ? ((await loadEnvelope(retailInterestPath)) as AllampapirEnvelope)
      : undefined,
    skipRetailInterest,
    inflationCsvPath,
    skipInflation,
    webkincstarTextByReport: webkincstarDir
      ? await loadWebkincstarDir(webkincstarDir)
      : undefined,
    webkincstarDatum,
    skipWebkincstar
  }
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv
  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp()
    return EXIT_UPDATED
  }

  if (cmd === 'publish' || cmd === 'ingest') {
    const root = getFlag(rest, '--root') ?? process.cwd()
    const previousRoot = getFlag(rest, '--previous-root')
    const rawDir = getFlag(rest, '--raw-dir') ?? path.join(process.cwd(), '.tmp-market-data')
    const sources = await loadOptionalSources(rest)
    const report = await ingestMarketData({
      root,
      previousRoot,
      rawDir,
      catalog: sources.catalog,
      networkRates: sources.networkRates,
      allampapirPrices: sources.allampapirPrices,
      skipAllampapir: sources.skipAllampapir,
      retailInterestEnvelope: sources.retailInterestEnvelope,
      skipRetailInterest: sources.skipRetailInterest,
      inflationCsvPath: sources.inflationCsvPath,
      skipInflation: sources.skipInflation,
      webkincstarTextByReport: sources.webkincstarTextByReport,
      webkincstarDatum: sources.webkincstarDatum,
      skipWebkincstar: sources.skipWebkincstar
    })
    process.stdout.write(
      `${JSON.stringify({
        changed: report.changed,
        asOf: report.asOf,
        appendedRows: report.appendedRows,
        skippedDuplicates: report.skippedDuplicates,
        marketRoot: report.marketRoot,
        retailInterestUpdated: report.retailInterestUpdated,
        inflationUpdated: report.inflationUpdated,
        inflationAppendedRows: report.inflationAppendedRows,
        webkincstarUpdated: report.webkincstarUpdated,
        webkincstarSoftFailed: report.webkincstarSoftFailed,
        priceCalendarAppendedDays: report.priceCalendarAppendedDays
      })}\n`
    )
    return report.changed ? EXIT_UPDATED : EXIT_UNCHANGED
  }

  if (cmd === 'ci-ingest') {
    const outRoot = getFlag(rest, '--out-root') ?? process.env.MARKET_OUT_ROOT
    if (!outRoot) throw new Error('--out-root or MARKET_OUT_ROOT is required')
    const baselineRoot =
      getFlag(rest, '--baseline-root') ?? process.env.MARKET_BASELINE_ROOT ?? undefined
    const rawDir =
      getFlag(rest, '--raw-dir') ??
      process.env.MARKET_RAW_DIR ??
      path.join(process.cwd(), '.tmp-market-data')
    const sources = await loadOptionalSources(rest)
    const result = await runCiIngest({
      outRoot,
      baselineRoot,
      rawDir,
      catalog: sources.catalog,
      networkRates: sources.networkRates,
      allampapirPrices: sources.allampapirPrices,
      skipAllampapir: sources.skipAllampapir,
      retailInterestEnvelope: sources.retailInterestEnvelope,
      skipRetailInterest: sources.skipRetailInterest,
      inflationCsvPath: sources.inflationCsvPath,
      skipInflation: sources.skipInflation,
      webkincstarTextByReport: sources.webkincstarTextByReport,
      webkincstarDatum: sources.webkincstarDatum,
      skipWebkincstar: sources.skipWebkincstar
    })
    process.stdout.write(`${JSON.stringify({ changed: result.changed, asOf: result.asOf })}\n`)
    return EXIT_UPDATED
  }

  if (cmd === 'validate-tree') {
    const root = getFlag(rest, '--root') ?? process.env.MARKET_TREE_ROOT
    if (!root) throw new Error('--root or MARKET_TREE_ROOT is required')
    const tree = await assertPublishedTree(root)
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        asOf: tree.manifest?.asOf ?? null,
        families: tree.manifest?.families ?? []
      })}\n`
    )
    return EXIT_UPDATED
  }

  if (cmd === 'resolve-branch') {
    const repository =
      getFlag(rest, '--repository') ?? process.env.GITHUB_REPOSITORY ?? undefined
    const branch =
      getFlag(rest, '--branch') ?? process.env.MARKET_DATA_BRANCH ?? 'market-data'
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
    if (!repository) throw new Error('--repository or GITHUB_REPOSITORY is required')
    if (!token) throw new Error('GITHUB_TOKEN is required for resolve-branch')
    const result = await resolveBranch({ repository, branch, token })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return EXIT_UPDATED
  }

  if (cmd === 'ensure-data-clone' || cmd === 'commit-push') {
    process.stderr.write(
      `Removed: '${cmd}' TypeScript path deleted — use bash tools/market-data/scripts/*.sh\n`
    )
    return EXIT_ERROR
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
