/** WebKincstár daily price report names (ADR 0039 / ROADMAP §6h). */

export const WEBKINCSTAR_REPORT_SERVICE_URL =
  'https://webkincstar.allamkincstar.gov.hu/report-service/report' as const

/** v1 §6h reports: DKJ + MÁK (BMÁP / PMÁP / FixMÁP / KTV rows). */
export const WEBKINCSTAR_REPORTS = [
  '_20631_arfolyam_dkj',
  '_20633_arfolyam_mak'
] as const

export type WebkincstarReportName = (typeof WEBKINCSTAR_REPORTS)[number]

export function isWebkincstarReportName(value: string): value is WebkincstarReportName {
  return (WEBKINCSTAR_REPORTS as readonly string[]).includes(value)
}
