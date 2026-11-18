/** WebKincstár daily price report names (ADR 0039 / 0042 / ROADMAP §6h / §6n). */

export const WEBKINCSTAR_REPORT_SERVICE_URL =
  'https://webkincstar.allamkincstar.gov.hu/report-service/report' as const

/**
 * Daily price reports fetched each ingest run.
 * DKJ + MAK (ADR 0039); MAPP / PEMÁK / Start / KKJ (ADR 0042 / §6n).
 */
export const WEBKINCSTAR_REPORTS = [
  '_20631_arfolyam_dkj',
  '_20633_arfolyam_mak',
  '_207461_arfolyam_mapp',
  '_20638_arfolyam_pemak',
  '_20642_arfolyam_start',
  '_20632_arfolyam_kkj'
] as const

export type WebkincstarReportName = (typeof WEBKINCSTAR_REPORTS)[number]

export function isWebkincstarReportName(value: string): value is WebkincstarReportName {
  return (WEBKINCSTAR_REPORTS as readonly string[]).includes(value)
}
