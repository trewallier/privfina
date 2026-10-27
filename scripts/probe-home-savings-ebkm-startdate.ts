/**
 * Probe-only: ADR 0031 baseline startDate day-of-month sweep + interest variants
 * for withdrawn 4x10 EBKM residuals (investigation; not production engine).
 *
 * Run: npx tsx scripts/probe-home-savings-ebkm-startdate.ts
 * Optional: PROBE_JSON=1 to emit machine-readable JSON on stdout.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  HOME_SAVINGS_REGULAR_MONTHLY_DEPOSIT_DUE_BY_DAY,
  buildHomeSavingsAszfEbkmCashFlows,
  calculateEbkmFromHomeSavingsCashFlows,
  calculateHomeSavingsDepositInterest,
  loadHomeSavingsProductSpec,
  mapHomeSavingsSpecInputsToInstrumentInput,
  resolveHomeSavingsEbkmPayoutDate,
  resolveHomeSavingsMaturityPayoutDate,
  resolveHomeSavingsPremiumRatePct,
  resolveKiutalasiPeriodMonths,
  type HomeSavingsInstrumentInput,
  type HomeSavingsProductSpec,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { daysInMonthUtc, formatIsoDate, parseIsoDate } from '../src/finance_engine/date_utils'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

type VariantId = 'A' | 'H' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

type Flow = {
  date: string
  amount: number
  direction: 'inflow' | 'outflow'
  description?: string
}

type CellSpec = {
  label: string
  productYaml: string
  examplePath: string
  role: 'residual' | 'control' | 'regression'
  published: { withPremium: number; withoutPremium: number }
}

const CELLS: CellSpec[] = [
  {
    label: 'premium-4x10/ebkm-standard-20000',
    productYaml: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    examplePath: 'docs/product-specs/products/home-savings/premium-4x10/examples/ebkm-standard-20000.yaml',
    role: 'residual',
    published: { withPremium: 3.23, withoutPremium: -1.04 }
  },
  {
    label: 'premium-4x10/ebkm-standard-50000',
    productYaml: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    examplePath: 'docs/product-specs/products/home-savings/premium-4x10/examples/ebkm-standard-50000.yaml',
    role: 'control',
    published: { withPremium: 3.44, withoutPremium: -0.83 }
  },
  {
    label: 'premium-plusz-4x10/ebkm-standard-100000',
    productYaml: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    examplePath:
      'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-standard-100000.yaml',
    role: 'residual',
    published: { withPremium: 3.27, withoutPremium: -0.98 }
  },
  {
    label: 'premium-plusz-4x10/ebkm-standard-20000',
    productYaml: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    examplePath:
      'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-standard-20000.yaml',
    role: 'control',
    published: { withPremium: 2.64, withoutPremium: -1.6 }
  },
  {
    label: 'premium-8x30/ebkm-standard-20000',
    productYaml: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    examplePath: 'docs/product-specs/products/home-savings/premium-8x30/examples/ebkm-standard-20000.yaml',
    role: 'regression',
    published: { withPremium: 5.54, withoutPremium: -0.56 }
  },
  {
    label: 'premium-plusz-8x30/ebkm-standard-20000',
    productYaml: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    examplePath:
      'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/ebkm-standard-20000.yaml',
    role: 'regression',
    published: { withPremium: 5.31, withoutPremium: -0.79 }
  },
  {
    label: 'premium-plusz-10x30/ebkm-standard-20000',
    productYaml: 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
    examplePath:
      'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-20000.yaml',
    role: 'regression',
    published: { withPremium: 4.12, withoutPremium: -0.77 }
  }
]

const VARIANTS: VariantId[] = ['A', 'H', 'B', 'C', 'D', 'E', 'F', 'G']

function readRepo(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function loadProduct(rel: string): HomeSavingsProductSpec {
  const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
  return loadHomeSavingsProductSpec(readRepo(rel), schema)
}

function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const day = Math.min(date.getUTCDate(), daysInMonthUtc(targetYear, targetMonth))
  return new Date(Date.UTC(targetYear, targetMonth, day))
}

function shiftUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function monthDay1(iso: string): string {
  const d = parseIsoDate(iso)
  return formatIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
}

function withDayOfMonth(iso: string, day: number): string {
  const d = parseIsoDate(iso)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const clamped = Math.min(Math.max(1, day), daysInMonthUtc(y, m))
  return formatIsoDate(new Date(Date.UTC(y, m, clamped)))
}

function lastDayOfMonthBefore(isoPayout: string): string {
  const p = parseIsoDate(isoPayout)
  const last = new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), 0))
  return formatIsoDate(last)
}

function monthlyAnniversaryDates(startDate: string, occurrences: number): string[] {
  const start = parseIsoDate(startDate)
  const dates: string[] = []
  for (let i = 0; i < occurrences; i += 1) {
    dates.push(formatIsoDate(addMonthsUtc(start, i)))
  }
  return dates
}

/** Variant A: production ADR 0031 ÁSZF EBKM builder. */
function buildAszfProductionFlows(
  product: HomeSavingsProductSpec,
  baseInputs: HomeSavingsSpecInputs,
  housingPurpose: boolean,
  startDate: string
): { flows: Flow[]; interest: number; terminal: number } {
  const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
    ...baseInputs,
    startDate,
    housingPurpose
  })
  const flows = buildHomeSavingsAszfEbkmCashFlows(instrument) as Flow[]
  const terminal = flows.find((f) => f.direction === 'inflow')
  const totalDeposits = instrument.monthlyDeposit * instrument.termMonths
  const premium = housingPurpose
    ? (totalDeposits *
        resolveHomeSavingsPremiumRatePct({
          termMonths: instrument.termMonths,
          housingPurpose: true,
          tiers: instrument.premiumTiers
        })) /
      100
    : 0
  const interest = (terminal?.amount ?? 0) - totalDeposits - premium
  return { flows, interest, terminal: terminal?.amount ?? 0 }
}

/**
 * Variant G (ADR 0033 hybrid, experimental): ÁSZF fee span + ÁSZF terminal date,
 * interest through OTP maturity payout (lastDeposit+2). Probe-only — not in engine on this base.
 */
function buildHybridGFlows(
  product: HomeSavingsProductSpec,
  baseInputs: HomeSavingsSpecInputs,
  housingPurpose: boolean,
  startDate: string
): { flows: Flow[]; interest: number; terminal: number } {
  const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
    ...baseInputs,
    startDate,
    housingPurpose
  })
  const termMonths = instrument.termMonths
  const kiutalasi = resolveKiutalasiPeriodMonths({
    fallback: instrument.kiutalasiPeriodMonths ?? 2
  })
  const otpMaturity = resolveHomeSavingsMaturityPayoutDate({
    startDate,
    termMonths,
    kiutalasiPeriodMonths: kiutalasi
  })
  const interest = calculateHomeSavingsDepositInterest({
    monthlyDeposit: instrument.monthlyDeposit,
    termMonths,
    startDate,
    annualRatePct: Number(instrument.depositInterestAnnualRatePct ?? 0.1),
    payoutDate: otpMaturity
  })
  const flows = assembleFlows({
    instrument,
    startDate,
    depositStartDate: startDate,
    feeStartDate: startDate,
    interest,
    housingPurpose
  })
  return {
    flows,
    interest,
    terminal: flows.find((f) => f.direction === 'inflow')!.amount
  }
}

/**
 * Experimental ACT/360 interest with knobs (probe only).
 * Capitalization: month-1 of start month + N*12 (ÁSZF §5) unless anniversaryCaps.
 */
function experimentalInterest(input: {
  monthlyDeposit: number
  termMonths: number
  startDate: string
  annualRatePct: number
  payoutDate: string
  /** Accrue only on days belonging to complete calendar months inside [start, payout). */
  completeMonthsOnly?: boolean
  /** Each calendar month contributes exactly 30 ACT/360 day-units of accrual. */
  equalMonth30?: boolean
  anniversaryCaps?: boolean
}): number {
  const monthlyDeposit = input.monthlyDeposit
  const termMonths = input.termMonths
  const annualRatePct = input.annualRatePct
  const start = parseIsoDate(input.startDate)
  const payoutDate = parseIsoDate(input.payoutDate)

  const depositDates = new Map<string, number>()
  for (let i = 0; i < termMonths; i += 1) {
    const key = formatIsoDate(addMonthsUtc(start, i))
    depositDates.set(key, (depositDates.get(key) ?? 0) + monthlyDeposit)
  }

  const yearStart = input.anniversaryCaps
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
    : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const capDates = new Set<string>()
  for (let yearIndex = 1; yearIndex <= Math.ceil(termMonths / 12) + 4; yearIndex += 1) {
    capDates.add(formatIsoDate(addMonthsUtc(yearStart, yearIndex * 12)))
  }

  const startMonth = start.getUTCMonth()
  const startYear = start.getUTCFullYear()
  const payoutMonth = payoutDate.getUTCMonth()
  const payoutYear = payoutDate.getUTCFullYear()

  function isCompleteMonthDay(cursor: Date): boolean {
    const y = cursor.getUTCFullYear()
    const m = cursor.getUTCMonth()
    // Complete months strictly after start month and strictly before payout month.
    if (y < startYear || (y === startYear && m <= startMonth)) return false
    if (y > payoutYear || (y === payoutYear && m >= payoutMonth)) return false
    return true
  }

  let balance = 0
  let pendingInterest = 0
  let totalInterest = 0
  let cursor = new Date(start.getTime())

  // Equal-month path: once per anniversary month apply 30 days of interest at month end.
  if (input.equalMonth30) {
    // Deposit on each anniversary; accrue 30/360 between deposit months through payout month marker.
    const depositSchedule = monthlyAnniversaryDates(input.startDate, termMonths)
    // Include months from start through month before payout as accrual months.
    const accrualMonths: string[] = []
    {
      let mCursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
      const lastAccrualMonth = new Date(
        Date.UTC(payoutDate.getUTCFullYear(), payoutDate.getUTCMonth() - 1, 1)
      )
      while (mCursor.getTime() <= lastAccrualMonth.getTime()) {
        accrualMonths.push(formatIsoDate(mCursor))
        mCursor = addMonthsUtc(mCursor, 1)
      }
    }
    const depositByMonth = new Map<string, number>()
    for (const d of depositSchedule) {
      const dm = monthDay1(d)
      depositByMonth.set(dm, (depositByMonth.get(dm) ?? 0) + monthlyDeposit)
    }
    for (const monthStart of accrualMonths) {
      if (capDates.has(monthStart) && pendingInterest > 0) {
        const capitalized = Math.round(pendingInterest)
        balance += capitalized
        totalInterest += capitalized
        pendingInterest = 0
      }
      const dep = depositByMonth.get(monthStart) ?? 0
      // Credit deposits that fall in this calendar month (anniversary day).
      const month = parseIsoDate(monthStart)
      for (const [key, amt] of depositDates) {
        const dd = parseIsoDate(key)
        if (
          dd.getUTCFullYear() === month.getUTCFullYear() &&
          dd.getUTCMonth() === month.getUTCMonth()
        ) {
          balance += amt
        }
      }
      void dep
      pendingInterest += (balance * annualRatePct * 30) / (360 * 100)
    }
    if (pendingInterest > 0) totalInterest += Math.round(pendingInterest)
    return totalInterest
  }

  while (cursor.getTime() <= payoutDate.getTime()) {
    const key = formatIsoDate(cursor)

    if (capDates.has(key) && pendingInterest > 0) {
      const capitalized = Math.round(pendingInterest)
      balance += capitalized
      totalInterest += capitalized
      pendingInterest = 0
    }

    const deposit = depositDates.get(key)
    if (deposit) balance += deposit

    if (cursor.getTime() < payoutDate.getTime()) {
      const accrue = input.completeMonthsOnly ? isCompleteMonthDay(cursor) : true
      if (accrue) {
        pendingInterest += (balance * annualRatePct) / (360 * 100)
      }
    }
    cursor = shiftUtcDays(cursor, 1)
  }

  if (pendingInterest > 0) totalInterest += Math.round(pendingInterest)
  return totalInterest
}

function assembleFlows(input: {
  instrument: HomeSavingsInstrumentInput
  startDate: string
  depositStartDate: string
  feeStartDate: string
  interest: number
  housingPurpose: boolean
  payoutDateForInterestUnused?: string
}): Flow[] {
  const {
    instrument,
    startDate,
    depositStartDate,
    feeStartDate,
    interest,
    housingPurpose
  } = input
  const termMonths = instrument.termMonths
  const kiutalasi = resolveKiutalasiPeriodMonths({
    fallback: instrument.kiutalasiPeriodMonths ?? 2
  })
  const lastDepositDate = formatIsoDate(
    addMonthsUtc(parseIsoDate(depositStartDate), termMonths - 1)
  )
  const ebkmPayoutDate = resolveHomeSavingsEbkmPayoutDate(lastDepositDate)
  const totalDeposits = instrument.monthlyDeposit * termMonths
  const premiumRatePct = resolveHomeSavingsPremiumRatePct({
    termMonths,
    housingPurpose,
    tiers: instrument.premiumTiers
  })
  const premiumAmount = housingPurpose ? (totalDeposits * premiumRatePct) / 100 : 0
  const terminalPayout = totalDeposits + interest + premiumAmount

  const flows: Flow[] = []
  if (instrument.accountOpeningFee > 0) {
    flows.push({
      date: startDate,
      amount: instrument.accountOpeningFee,
      direction: 'outflow',
      description: 'Account opening fee'
    })
  }
  for (const date of monthlyAnniversaryDates(depositStartDate, termMonths)) {
    flows.push({
      date,
      amount: instrument.monthlyDeposit,
      direction: 'outflow',
      description: 'Monthly deposit'
    })
  }
  if (instrument.accountFeeMonthly > 0) {
    for (const date of monthlyAnniversaryDates(feeStartDate, termMonths + kiutalasi)) {
      flows.push({
        date,
        amount: instrument.accountFeeMonthly,
        direction: 'outflow',
        description: 'Account management fee'
      })
    }
  }
  flows.push({
    date: ebkmPayoutDate,
    amount: terminalPayout,
    direction: 'inflow',
    description: 'Home-savings terminal payout'
  })
  return flows
}

function buildVariantFlows(
  variant: VariantId,
  product: HomeSavingsProductSpec,
  baseInputs: HomeSavingsSpecInputs,
  housingPurpose: boolean,
  contractStartDate: string
): { flows: Flow[]; interest: number; terminal: number; scenarioStart: string } {
  if (variant === 'A') {
    const r = buildAszfProductionFlows(product, baseInputs, housingPurpose, contractStartDate)
    return { ...r, scenarioStart: contractStartDate }
  }
  if (variant === 'G') {
    const r = buildHybridGFlows(product, baseInputs, housingPurpose, contractStartDate)
    return { ...r, scenarioStart: contractStartDate }
  }

  const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
    ...baseInputs,
    startDate: contractStartDate,
    housingPurpose
  })
  const rate = Number(instrument.depositInterestAnnualRatePct ?? 0.1)
  const termMonths = instrument.termMonths

  if (variant === 'H') {
    const scenarioStart = monthDay1(contractStartDate)
    const lastDeposit = formatIsoDate(addMonthsUtc(parseIsoDate(scenarioStart), termMonths - 1))
    const aszfPayout = resolveHomeSavingsEbkmPayoutDate(lastDeposit)
    const interest = calculateHomeSavingsDepositInterest({
      monthlyDeposit: instrument.monthlyDeposit,
      termMonths,
      startDate: scenarioStart,
      annualRatePct: rate,
      payoutDate: aszfPayout
    })
    const flows = assembleFlows({
      instrument,
      startDate: scenarioStart,
      depositStartDate: scenarioStart,
      feeStartDate: scenarioStart,
      interest,
      housingPurpose
    })
    const terminal = flows.find((f) => f.direction === 'inflow')!.amount
    return { flows, interest, terminal, scenarioStart }
  }

  if (variant === 'B') {
    const lastDeposit = formatIsoDate(addMonthsUtc(parseIsoDate(contractStartDate), termMonths - 1))
    const aszfPayout = resolveHomeSavingsEbkmPayoutDate(lastDeposit)
    const interest = experimentalInterest({
      monthlyDeposit: instrument.monthlyDeposit,
      termMonths,
      startDate: contractStartDate,
      annualRatePct: rate,
      payoutDate: aszfPayout,
      completeMonthsOnly: true
    })
    const flows = assembleFlows({
      instrument,
      startDate: contractStartDate,
      depositStartDate: contractStartDate,
      feeStartDate: contractStartDate,
      interest,
      housingPurpose
    })
    return {
      flows,
      interest,
      terminal: flows.find((f) => f.direction === 'inflow')!.amount,
      scenarioStart: contractStartDate
    }
  }

  if (variant === 'C') {
    const lastDeposit = formatIsoDate(addMonthsUtc(parseIsoDate(contractStartDate), termMonths - 1))
    const aszfPayout = resolveHomeSavingsEbkmPayoutDate(lastDeposit)
    const interest = experimentalInterest({
      monthlyDeposit: instrument.monthlyDeposit,
      termMonths,
      startDate: contractStartDate,
      annualRatePct: rate,
      payoutDate: aszfPayout,
      equalMonth30: true
    })
    const flows = assembleFlows({
      instrument,
      startDate: contractStartDate,
      depositStartDate: contractStartDate,
      feeStartDate: contractStartDate,
      interest,
      housingPurpose
    })
    return {
      flows,
      interest,
      terminal: flows.find((f) => f.direction === 'inflow')!.amount,
      scenarioStart: contractStartDate
    }
  }

  if (variant === 'D') {
    const scenarioStart = monthDay1(contractStartDate)
    const lastDeposit = formatIsoDate(addMonthsUtc(parseIsoDate(scenarioStart), termMonths - 1))
    const aszfPayout = resolveHomeSavingsEbkmPayoutDate(lastDeposit)
    // Interest through last day of month before payout (= day before day-1 payout).
    const interestEnd = lastDayOfMonthBefore(aszfPayout)
    // calculateHomeSavingsDepositInterest stops day before payoutDate, so pass day after interestEnd.
    const payoutMarker = formatIsoDate(shiftUtcDays(parseIsoDate(interestEnd), 1))
    const interest = calculateHomeSavingsDepositInterest({
      monthlyDeposit: instrument.monthlyDeposit,
      termMonths,
      startDate: scenarioStart,
      annualRatePct: rate,
      payoutDate: payoutMarker
    })
    const flows = assembleFlows({
      instrument,
      startDate: scenarioStart,
      depositStartDate: scenarioStart,
      feeStartDate: scenarioStart,
      interest,
      housingPurpose
    })
    return {
      flows,
      interest,
      terminal: flows.find((f) => f.direction === 'inflow')!.amount,
      scenarioStart
    }
  }

  if (variant === 'E') {
    const lastDeposit = formatIsoDate(addMonthsUtc(parseIsoDate(contractStartDate), termMonths - 1))
    // Stop interest at last deposit: pass payoutDate = day after last deposit so accrual ends on last deposit day.
    const payoutMarker = formatIsoDate(shiftUtcDays(parseIsoDate(lastDeposit), 1))
    const interest = calculateHomeSavingsDepositInterest({
      monthlyDeposit: instrument.monthlyDeposit,
      termMonths,
      startDate: contractStartDate,
      annualRatePct: rate,
      payoutDate: payoutMarker
    })
    const flows = assembleFlows({
      instrument,
      startDate: contractStartDate,
      depositStartDate: contractStartDate,
      feeStartDate: contractStartDate,
      interest,
      housingPurpose
    })
    return {
      flows,
      interest,
      terminal: flows.find((f) => f.direction === 'inflow')!.amount,
      scenarioStart: contractStartDate
    }
  }

  // F — anniversary capitalization
  {
    const lastDeposit = formatIsoDate(addMonthsUtc(parseIsoDate(contractStartDate), termMonths - 1))
    const aszfPayout = resolveHomeSavingsEbkmPayoutDate(lastDeposit)
    const interest = experimentalInterest({
      monthlyDeposit: instrument.monthlyDeposit,
      termMonths,
      startDate: contractStartDate,
      annualRatePct: rate,
      payoutDate: aszfPayout,
      anniversaryCaps: true
    })
    const flows = assembleFlows({
      instrument,
      startDate: contractStartDate,
      depositStartDate: contractStartDate,
      feeStartDate: contractStartDate,
      interest,
      housingPurpose
    })
    return {
      flows,
      interest,
      terminal: flows.find((f) => f.direction === 'inflow')!.amount,
      scenarioStart: contractStartDate
    }
  }
}

function ebkmFromFlows(flows: Flow[]): { rate: number; percentRounded: number } {
  return calculateEbkmFromHomeSavingsCashFlows(flows, { retargetTerminalPayout: false })
}

type DayRow = {
  day: number
  startDate: string
  scenarioStart: string
  withPremium: number
  withoutPremium: number
  interestWithout: number
  terminalWithout: number
  matchBoth: boolean
  matchWith: boolean
  matchWithout: boolean
}

function sweepCell(
  cell: CellSpec,
  variant: VariantId,
  maxDay = HOME_SAVINGS_REGULAR_MONTHLY_DEPOSIT_DUE_BY_DAY
): {
  cell: string
  variant: VariantId
  exampleStart: string
  published: CellSpec['published']
  days1to28MatchBoth: number
  days1to28Total: number
  invarianceScore: number
  uniqueRoundedPairs: string[]
  dayRows: DayRow[]
  exampleDayMatch: boolean
} {
  const product = loadProduct(cell.productYaml)
  const example = YAML.parse(readRepo(cell.examplePath))
  const baseInputs = example.inputs as HomeSavingsSpecInputs
  const exampleStart = baseInputs.startDate
  const dayRows: DayRow[] = []

  // ÁSZF/USZ tárgyhó ≤12 — sweep only legal continuous-schedule credit days.
  for (let day = 1; day <= maxDay; day += 1) {
    const startDate = withDayOfMonth(exampleStart, day)
    const withR = buildVariantFlows(variant, product, baseInputs, true, startDate)
    const withoutR = buildVariantFlows(variant, product, baseInputs, false, startDate)
    const withPct = ebkmFromFlows(withR.flows).percentRounded
    const withoutPct = ebkmFromFlows(withoutR.flows).percentRounded
    const matchWith = withPct === cell.published.withPremium
    const matchWithout = withoutPct === cell.published.withoutPremium
    dayRows.push({
      day,
      startDate,
      scenarioStart: withR.scenarioStart,
      withPremium: withPct,
      withoutPremium: withoutPct,
      interestWithout: withoutR.interest,
      terminalWithout: withoutR.terminal,
      matchBoth: matchWith && matchWithout,
      matchWith,
      matchWithout
    })
  }

  const matchBothCount = dayRows.filter((r) => r.matchBoth).length
  const uniqueRoundedPairs = [
    ...new Set(dayRows.map((r) => `${r.withPremium}/${r.withoutPremium}`))
  ]
  const exampleDay = parseIsoDate(exampleStart).getUTCDate()
  const exampleRow = dayRows.find((r) => r.day === Math.min(exampleDay, maxDay))

  return {
    cell: cell.label,
    variant,
    exampleStart,
    published: cell.published,
    days1to28MatchBoth: matchBothCount,
    days1to28Total: dayRows.length,
    invarianceScore: matchBothCount / dayRows.length,
    uniqueRoundedPairs,
    dayRows,
    exampleDayMatch: Boolean(exampleRow?.matchBoth)
  }
}

function summarizeRegressionAtExampleDay(
  cell: CellSpec,
  variant: VariantId
): { match: boolean; withPremium: number; withoutPremium: number } {
  const product = loadProduct(cell.productYaml)
  const example = YAML.parse(readRepo(cell.examplePath))
  const baseInputs = example.inputs as HomeSavingsSpecInputs
  const startDate = baseInputs.startDate
  const withR = buildVariantFlows(variant, product, baseInputs, true, startDate)
  const withoutR = buildVariantFlows(variant, product, baseInputs, false, startDate)
  const withPct = ebkmFromFlows(withR.flows).percentRounded
  const withoutPct = ebkmFromFlows(withoutR.flows).percentRounded
  return {
    match: withPct === cell.published.withPremium && withoutPct === cell.published.withoutPremium,
    withPremium: withPct,
    withoutPremium: withoutPct
  }
}

function main(): void {
  const focusCells = CELLS.filter((c) => c.role === 'residual' || c.role === 'control')
  const regressionCells = CELLS.filter((c) => c.role === 'regression')

  const sweeps = []
  for (const cell of focusCells) {
    for (const variant of VARIANTS) {
      sweeps.push(sweepCell(cell, variant))
    }
  }

  const regressions: Record<
    string,
    Record<string, { match: boolean; withPremium: number; withoutPremium: number }>
  > = {}
  for (const cell of regressionCells) {
    regressions[cell.label] = {}
    for (const variant of VARIANTS) {
      regressions[cell.label][variant] = summarizeRegressionAtExampleDay(cell, variant)
    }
  }

  // H invariance: same month, different legal contract days (1…12) → identical scenario
  const hInvarianceChecks = []
  for (const cell of focusCells.filter((c) => c.role === 'residual')) {
    const product = loadProduct(cell.productYaml)
    const example = YAML.parse(readRepo(cell.examplePath))
    const baseInputs = example.inputs as HomeSavingsSpecInputs
    const d1 = buildVariantFlows(
      'H',
      product,
      baseInputs,
      false,
      withDayOfMonth(baseInputs.startDate, 1)
    )
    const d6 = buildVariantFlows(
      'H',
      product,
      baseInputs,
      false,
      withDayOfMonth(baseInputs.startDate, 6)
    )
    const d12 = buildVariantFlows(
      'H',
      product,
      baseInputs,
      false,
      withDayOfMonth(baseInputs.startDate, HOME_SAVINGS_REGULAR_MONTHLY_DEPOSIT_DUE_BY_DAY)
    )
    hInvarianceChecks.push({
      cell: cell.label,
      scenarioStarts: [d1.scenarioStart, d6.scenarioStart, d12.scenarioStart],
      interests: [d1.interest, d6.interest, d12.interest],
      terminals: [d1.terminal, d6.terminal, d12.terminal],
      ebkms: [
        ebkmFromFlows(d1.flows).percentRounded,
        ebkmFromFlows(d6.flows).percentRounded,
        ebkmFromFlows(d12.flows).percentRounded
      ],
      invariant:
        d1.interest === d6.interest &&
        d6.interest === d12.interest &&
        d1.terminal === d6.terminal &&
        ebkmFromFlows(d1.flows).percentRounded === ebkmFromFlows(d6.flows).percentRounded
    })
  }

  const scoreboard = focusCells.map((cell) => {
    const byVariant: Record<string, unknown> = {}
    for (const variant of VARIANTS) {
      const s = sweeps.find((x) => x.cell === cell.label && x.variant === variant)!
      byVariant[variant] = {
        invarianceScore: Number(s.invarianceScore.toFixed(3)),
        daysMatchBoth: `${s.days1to28MatchBoth}/${s.days1to28Total}`,
        uniquePairs: s.uniqueRoundedPairs,
        exampleDayMatch: s.exampleDayMatch
      }
    }
    return { cell: cell.label, role: cell.role, published: cell.published, byVariant }
  })

  const outDir = resolve(process.cwd(), 'docs/dev-notes')
  mkdirSync(outDir, { recursive: true })
  const jsonPath = resolve(outDir, 'ebkm-4x10-interest-invariance-probe.json')
  const payload = {
    generatedAt: new Date().toISOString(),
    note: 'Probe-only results; variants B/C/D/E/F are experimental and not production engine.',
    scoreboard,
    hInvarianceChecks,
    regressions,
    // Compact day matrices for residual cells under A/H/G (most relevant)
    residualDayMatrices: sweeps
      .filter(
        (s) =>
          (s.cell.includes('20000') || s.cell.includes('100000')) &&
          CELLS.find((c) => c.label === s.cell)?.role === 'residual' &&
          (s.variant === 'A' || s.variant === 'H' || s.variant === 'G' || s.variant === 'B')
      )
      .map((s) => ({
        cell: s.cell,
        variant: s.variant,
        exampleStart: s.exampleStart,
        published: s.published,
        days: s.dayRows.map((r) => ({
          day: r.day,
          with: r.withPremium,
          without: r.withoutPremium,
          interestWo: r.interestWithout,
          match: r.matchBoth
        }))
      }))
  }
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2))

  // Human summary to stdout
  console.log('=== EBKM 4x10 interest invariance probe ===\n')
  for (const row of scoreboard) {
    console.log(`## ${row.cell} (${row.role}) published ${row.published.withPremium}/${row.published.withoutPremium}`)
    for (const variant of VARIANTS) {
      const v = row.byVariant[variant] as {
        invarianceScore: number
        daysMatchBoth: string
        uniquePairs: string[]
        exampleDayMatch: boolean
      }
      console.log(
        `  ${variant}: matchBoth ${v.daysMatchBoth} score=${v.invarianceScore} exampleDay=${v.exampleDayMatch} pairs=${v.uniquePairs.join(' | ')}`
      )
    }
    console.log('')
  }
  console.log('=== H month-1 invariance (contract day 1/6/12; ÁSZF due bound) ===')
  console.log(JSON.stringify(hInvarianceChecks, null, 2))
  console.log('\n=== Regression at example startDate ===')
  for (const [label, variants] of Object.entries(regressions)) {
    const bits = VARIANTS.map((v) => `${v}:${variants[v].match ? 'OK' : `${variants[v].withPremium}/${variants[v].withoutPremium}`}`).join(' ')
    console.log(`${label}: ${bits}`)
  }
  console.log(`\nWrote ${jsonPath}`)

  if (process.env.PROBE_JSON === '1') {
    console.log(JSON.stringify(payload))
  }
}

main()
