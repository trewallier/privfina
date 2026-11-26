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
import type { OfferingFamilyCode } from './offering-families.ts'
import { OFFERING_FAMILIES } from './offering-families.ts'
import type { AkkEnvelope, AllampapirEnvelope } from './types.ts'
import { assertPublishedTree } from './validate.ts'
import {
  WEBKINCSTAR_BACKFILL_DEFAULT_FROM,
  budapestYesterdayIso,
  resolveWebkincstarBackfillDatums
} from './fetch-webkincstar.ts'
import { loadMarketTree } from './io.ts'
import {
  WEBKINCSTAR_REPORTS,
  isWebkincstarReportName,
  type WebkincstarReportName
} from './webkincstar-reports.ts'

function printHelp(): void {
  process.stdout.write(`Usage:
  market-data ingest --root <repo-or-v2> [--previous-root <path>] [--raw-dir <dir>]
      [--catalog <json>] [--rates <json>] [--allampapir-dir <dir>] [--skip-allampapir]
      [--retail-interest <json>] [--skip-retail-interest]
      [--inflation-csv <csv>] [--skip-inflation]
      [--bubor-xls <xls>] [--skip-bubor]
      [--settlement-calendar-dir <dir>] [--skip-settlement-calendar]
      [--webkincstar-dir <dir>] [--datum YYYY-MM-DD] [--skip-webkincstar]
      [--offerings-dir <dir>] [--skip-offerings] [--reparse-parse-failed]
      [--promote-wk-origin]
  market-data ci-ingest --out-root <path> [--baseline-root <path>] [--raw-dir <dir>]
      [--catalog <json>] [--rates <json>] [--allampapir-dir <dir>] [--skip-allampapir]
      [--retail-interest <json>] [--skip-retail-interest]
      [--inflation-csv <csv>] [--skip-inflation]
      [--bubor-xls <xls>] [--skip-bubor]
      [--settlement-calendar-dir <dir>] [--skip-settlement-calendar]
      [--webkincstar-dir <dir>] [--datum YYYY-MM-DD] [--skip-webkincstar]
      [--offerings-dir <dir>] [--skip-offerings] [--reparse-parse-failed]
      [--promote-wk-origin]
  market-data backfill-webkincstar --root <repo-or-v2> --from YYYY-MM-DD [--to YYYY-MM-DD]
      [--reports name,name] [--weekdays-only] [--skip-durable] [--raw-dir <dir>]
      [--previous-root <path>] [--catalog <json>] [--rates <json>] …
      (--from required; default --reports = all WEBKINCSTAR_REPORTS; --to = Budapest yesterday)
  market-data validate-tree --root <repo-or-v2>
  market-data resolve-branch --repository <owner/repo> --branch <name>

Git (workflow): bash tools/market-data/scripts/ensure-clone.sh | commit-push.sh

Exit codes: ingest/backfill-webkincstar 0/2/1; ci-ingest 0/1 (changed on GITHUB_OUTPUT); other commands 0/1
`)
}

function parseWebkincstarReportsFlag(raw: string | undefined): WebkincstarReportName[] {
  // Default: full daily report set so one-shot CLI cannot deepen MAK alone and
  // stall shallower reports' rolling frontiers (ROADMAP §6m).
  if (!raw || !raw.trim()) {
    return [...WEBKINCSTAR_REPORTS]
  }
  const parts = raw.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean)
  const out: WebkincstarReportName[] = []
  for (const part of parts) {
    if (!isWebkincstarReportName(part)) {
      throw new Error(
        `Unknown WebKincstár report ${part}; expected one of ${WEBKINCSTAR_REPORTS.join(', ')}`
      )
    }
    out.push(part)
  }
  return out
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
    _20633_arfolyam_mak: /(?:^|[_-])mak(?:[_-]|$)/i,
    _207461_arfolyam_mapp: /(?:^|[_-])mapp(?:[_-]|$)/i,
    _20638_arfolyam_pemak: /(?:^|[_-])pemak(?:[_-]|$)/i,
    _20642_arfolyam_start: /(?:^|[_-])start(?:[_-]|$)/i,
    _20632_arfolyam_kkj: /(?:^|[_-])kkj(?:[_-]|$)/i
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

async function loadOfferingsDir(
  dir: string
): Promise<Partial<Record<OfferingFamilyCode, AkkEnvelope>>> {
  const out: Partial<Record<OfferingFamilyCode, AkkEnvelope>> = {}
  const entries = await readdir(dir)
  for (const family of OFFERING_FAMILIES) {
    const preferred = entries.find(
      (name) =>
        name === `getPublicOfferings_${family}.json` ||
        name === `${family}.json`
    )
    if (!preferred) continue
    const text = await readFile(path.join(dir, preferred), 'utf8')
    out[family] = JSON.parse(text) as AkkEnvelope
  }
  return out
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
  buborXlsPath?: string
  skipBubor?: boolean
  webkincstarTextByReport?: Partial<Record<WebkincstarReportName, string>>
  webkincstarDatum?: string
  skipWebkincstar?: boolean
  offeringEnvelopesByFamily?: Partial<Record<OfferingFamilyCode, AkkEnvelope>>
  skipOfferings?: boolean
  reparseParseFailed?: boolean
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
  const buborXlsPath = getFlag(args, '--bubor-xls')
  const skipBubor = hasFlag(args, '--skip-bubor')
  if (skipBubor && buborXlsPath) {
    throw new Error('Use either --bubor-xls or --skip-bubor, not both.')
  }
  const settlementCalendarDir = getFlag(args, '--settlement-calendar-dir')
  const skipSettlementCalendar = hasFlag(args, '--skip-settlement-calendar')
  if (skipSettlementCalendar && settlementCalendarDir) {
    throw new Error(
      'Use either --settlement-calendar-dir or --skip-settlement-calendar, not both.'
    )
  }
  const webkincstarDir = getFlag(args, '--webkincstar-dir')
  const skipWebkincstar = hasFlag(args, '--skip-webkincstar')
  if (skipWebkincstar && webkincstarDir) {
    throw new Error('Use either --webkincstar-dir or --skip-webkincstar, not both.')
  }
  const offeringsDir = getFlag(args, '--offerings-dir')
  const skipOfferings = hasFlag(args, '--skip-offerings')
  if (skipOfferings && offeringsDir) {
    throw new Error('Use either --offerings-dir or --skip-offerings, not both.')
  }
  const reparseParseFailed = hasFlag(args, '--reparse-parse-failed')
  const promoteWkOrigin = hasFlag(args, '--promote-wk-origin')
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
    buborXlsPath,
    skipBubor,
    settlementCalendarDir,
    skipSettlementCalendar,
    webkincstarTextByReport: webkincstarDir
      ? await loadWebkincstarDir(webkincstarDir)
      : undefined,
    webkincstarDatum,
    skipWebkincstar,
    offeringEnvelopesByFamily: offeringsDir ? await loadOfferingsDir(offeringsDir) : undefined,
    skipOfferings,
    reparseParseFailed,
    promoteWkOrigin
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
      buborXlsPath: sources.buborXlsPath,
      skipBubor: sources.skipBubor,
      settlementCalendarDir: sources.settlementCalendarDir,
      skipSettlementCalendar: sources.skipSettlementCalendar,
      webkincstarTextByReport: sources.webkincstarTextByReport,
      webkincstarDatum: sources.webkincstarDatum,
      skipWebkincstar: sources.skipWebkincstar,
      offeringEnvelopesByFamily: sources.offeringEnvelopesByFamily,
      skipOfferings: sources.skipOfferings,
      reparseParseFailed: sources.reparseParseFailed,
      promoteWkOrigin: sources.promoteWkOrigin
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
        buborUpdated: report.buborUpdated,
        buborAppendedRows: report.buborAppendedRows,
        settlementCalendarUpdated: report.settlementCalendarUpdated,
        settlementCalendarTouchedYears: report.settlementCalendarTouchedYears,
        webkincstarUpdated: report.webkincstarUpdated,
        webkincstarSoftFailed: report.webkincstarSoftFailed,
        webkincstarFetchFailedDays: report.webkincstarFetchFailedDays,
        webkincstarHistoricalEnabled: report.webkincstarHistoricalEnabled,
        webkincstarDatumsFetched: report.webkincstarDatumsFetched,
        offeringBackfillFrontier: report.offeringBackfillFrontier,
        priceCalendarAppendedDays: report.priceCalendarAppendedDays,
        offeringsUpdated: report.offeringsUpdated,
        offeringsSoftFailed: report.offeringsSoftFailed,
        offeringPdfsDownloaded: report.offeringPdfsDownloaded,
        offeringPdfsPending: report.offeringPdfsPending,
        offeringPdfsParseFailed: report.offeringPdfsParseFailed,
        offeringPdfsSkippedNoSchedule: report.offeringPdfsSkippedNoSchedule
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
      buborXlsPath: sources.buborXlsPath,
      skipBubor: sources.skipBubor,
      settlementCalendarDir: sources.settlementCalendarDir,
      skipSettlementCalendar: sources.skipSettlementCalendar,
      webkincstarTextByReport: sources.webkincstarTextByReport,
      webkincstarDatum: sources.webkincstarDatum,
      skipWebkincstar: sources.skipWebkincstar,
      offeringEnvelopesByFamily: sources.offeringEnvelopesByFamily,
      skipOfferings: sources.skipOfferings,
      reparseParseFailed: sources.reparseParseFailed,
      promoteWkOrigin: sources.promoteWkOrigin
    })
    process.stdout.write(
      `${JSON.stringify({
        changed: result.changed,
        asOf: result.asOf,
        offeringPdfsDownloaded: result.offeringPdfsDownloaded,
        offeringPdfsPending: result.offeringPdfsPending,
        offeringPdfsParseFailed: result.offeringPdfsParseFailed,
        offeringPdfsSkippedNoSchedule: result.offeringPdfsSkippedNoSchedule,
        offeringBackfillFrontier: result.offeringBackfillFrontier,
        offeringGateFrontier: result.offeringGateFrontier,
        offeringsSoftFailed: result.offeringsSoftFailed,
        webkincstarFetchFailedDays: result.webkincstarFetchFailedDays,
        webkincstarHistoricalEnabled: result.webkincstarHistoricalEnabled,
        webkincstarHistoricalGateOpen: result.webkincstarHistoricalGateOpen,
        webkincstarDatumsFetched: result.webkincstarDatumsFetched,
        webkincstarOverlaySkipped: result.webkincstarOverlaySkipped,
        webkincstarSoftFailed: result.webkincstarSoftFailed,
        retailInterestSoftFailed: result.retailInterestSoftFailed
      })}\n`
    )
    return EXIT_UPDATED
  }

  if (cmd === 'backfill-webkincstar') {
    // ROADMAP §6m: historical WebKincstár date-loop into an existing market tree tip.
    // Require explicit --from so a bare invocation cannot request decades of daily PDFs
    // (scrape floor WEBKINCSTAR_BACKFILL_DEFAULT_FROM is for scheduled rolling history).
    const root = getFlag(rest, '--root') ?? process.cwd()
    const previousRoot = getFlag(rest, '--previous-root') ?? root
    const rawDir = getFlag(rest, '--raw-dir') ?? path.join(process.cwd(), '.tmp-market-data')
    const from = getFlag(rest, '--from')
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new Error(
        `backfill-webkincstar requires --from YYYY-MM-DD ` +
          `(scrape floor ${WEBKINCSTAR_BACKFILL_DEFAULT_FROM}; prefer scheduled rolling history)`
      )
    }
    const to = getFlag(rest, '--to') ?? budapestYesterdayIso()
    const reports = parseWebkincstarReportsFlag(getFlag(rest, '--reports'))
    const weekdaysOnly = hasFlag(rest, '--weekdays-only')
    const skipDurable = hasFlag(rest, '--skip-durable')
    const previous = await loadMarketTree(previousRoot)
    const webkincstarDatums = resolveWebkincstarBackfillDatums({
      from,
      to,
      weekdaysOnly,
      skipDurable,
      previousDays: previous.priceCalendar?.days,
      reports
    })
    process.stderr.write(
      `[market-data] §6m WebKincstár backfill ${from}…${to} reports=${reports.join(',')} ` +
        `datums=${webkincstarDatums.length} weekdaysOnly=${weekdaysOnly} skipDurable=${skipDurable}\n`
    )
    if (webkincstarDatums.length === 0) {
      process.stdout.write(
        `${JSON.stringify({
          changed: false,
          asOf: previous.manifest?.asOf ?? null,
          webkincstarDatums: 0,
          webkincstarUpdated: false
        })}\n`
      )
      return EXIT_UNCHANGED
    }
    const sources = await loadOptionalSources(rest)
    const report = await ingestMarketData({
      root,
      previousRoot,
      rawDir,
      catalog: sources.catalog,
      networkRates: sources.networkRates,
      allampapirPrices: sources.allampapirPrices,
      skipAllampapir: sources.skipAllampapir ?? true,
      retailInterestEnvelope: sources.retailInterestEnvelope,
      skipRetailInterest: sources.skipRetailInterest ?? true,
      inflationCsvPath: sources.inflationCsvPath,
      skipInflation: sources.skipInflation ?? true,
      buborXlsPath: sources.buborXlsPath,
      skipBubor: sources.skipBubor ?? true,
      settlementCalendarDir: sources.settlementCalendarDir,
      skipSettlementCalendar: sources.skipSettlementCalendar ?? true,
      webkincstarTextByReport: sources.webkincstarTextByReport,
      webkincstarDatums,
      webkincstarReports: reports,
      skipWebkincstar: false,
      offeringEnvelopesByFamily: sources.offeringEnvelopesByFamily,
      skipOfferings: sources.skipOfferings ?? true,
      reparseParseFailed: sources.reparseParseFailed
    })
    process.stdout.write(
      `${JSON.stringify({
        changed: report.changed,
        asOf: report.asOf,
        webkincstarDatums: webkincstarDatums.length,
        webkincstarUpdated: report.webkincstarUpdated,
        webkincstarSoftFailed: report.webkincstarSoftFailed,
        webkincstarFetchFailedDays: report.webkincstarFetchFailedDays,
        priceCalendarAppendedDays: report.priceCalendarAppendedDays,
        appendedRows: report.appendedRows,
        marketRoot: report.marketRoot
      })}\n`
    )
    return report.changed ? EXIT_UPDATED : EXIT_UNCHANGED
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
