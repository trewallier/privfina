/**
 * Transcribe MÁK / ktv FIX offering paymentDates + paymentRates into coupons/<id>.json
 * (ADR 0044 follow-on). FLOAT rates stay unpublished (ADR 0047).
 */

import {
  COUPON_COLS,
  SCHEMA_VERSION,
  type CouponRow,
  type CouponsFile,
  type FamilyCode
} from './types.ts'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_RE.test(value)
}

function addCalendarDaysIso(iso: string, deltaDays: number): string | null {
  if (!isIsoDate(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + deltaDays)
  const yy = utc.getUTCFullYear()
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(utc.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * True when at least one parallel rate is a finite number (FIX / stepped FIX).
 * All-null → FLOAT / omitted — do not invent coupon files.
 */
export function hasDefinedPaymentRates(rates: Array<number | null> | null | undefined): boolean {
  if (!Array.isArray(rates) || rates.length === 0) return false
  return rates.some((r) => r != null && Number.isFinite(Number(r)))
}

/**
 * Build ADR 0038 coupons rows from a MÁK FIX payment table.
 * - Issue (when before first payment) starts the first band with the first payable rate.
 * - Each payment date is a band start carrying the rate printed for that payment.
 */
export function couponsFileFromMakPaymentTable(args: {
  family: FamilyCode
  seriesId: string
  issueDate?: string | null
  paymentDates: string[]
  paymentRates: Array<number | null>
}): CouponsFile | null {
  const { family, seriesId } = args
  if (family !== 'ktv') return null
  if (!hasDefinedPaymentRates(args.paymentRates)) return null

  const rawDates = Array.isArray(args.paymentDates) ? args.paymentDates : []
  const rawRates = Array.isArray(args.paymentRates) ? args.paymentRates : []
  // Zip then sort so unsorted parallel arrays cannot mis-pair rates.
  const paired = rawDates
    .map((d, i) => {
      const from = String(d || '').trim()
      if (!isIsoDate(from)) return null
      const raw = rawRates[i]
      const rate =
        raw == null || raw === ('' as unknown)
          ? null
          : Number.isFinite(Number(raw))
            ? Number(raw)
            : null
      return { from, rate }
    })
    .filter((row): row is { from: string; rate: number | null } => row != null)
    .sort((a, b) => a.from.localeCompare(b.from))
  if (paired.length === 0) return null

  const payments = paired.map((row) => row.from)
  const rates = paired.map((row) => row.rate)

  const rows: CouponRow[] = []
  const issue = isIsoDate(args.issueDate) ? args.issueDate : null
  if (issue && issue < payments[0]!) {
    const to = addCalendarDaysIso(payments[0]!, -1)
    rows.push([issue, to, rates[0] ?? null])
  }

  for (let i = 0; i < payments.length; i += 1) {
    const from = payments[i]!
    const next = payments[i + 1]
    const to = next ? addCalendarDaysIso(next, -1) : null
    rows.push([from, to, rates[i] ?? null])
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: seriesId,
    family,
    cols: COUPON_COLS,
    rows
  }
}
