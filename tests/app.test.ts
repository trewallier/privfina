import { describe, expect, it } from 'vitest'
import {
  CURRENT_EXPORT_SCHEMA_VERSION,
  calculateCumulativeSeries,
  buildExportDocument,
  parseImportDocument,
  parseOccurrences,
  normalizeOneTimeFlow,
  normalizeOneTimeFlows,
  normalizeRecurringDefinition,
  normalizeRecurringDefinitions,
  rollBusinessDay,
  generateSalaryInstrumentBundle,
  generateSubscriptionInstrumentBundle,
  calculateLoanMonthlyInstallment,
  createLoanRepaymentPreview,
  generateLoanInstrumentBundle,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentBundle,
  normalizeInstrumentBundles,
  expandRecurringFlows,
  upsertFlowById,
  removeFlowById,
  buildEffectiveFlows
} from '../public/app.js'
import { parseRecurringSchedule } from '../public/recurrence.js'
import { downsampleSeriesForChart, formatAxisAmount, renderChart } from '../public/render.js'

describe('browser recurrence validation helpers', () => {
  it('normalizes valid one-time flows and rejects invalid entries', () => {
    expect(
      normalizeOneTimeFlow({
        id: 'a',
        date: '2024-01-10',
        amount: '100',
        direction: 'outflow',
        category: ''
      })
    ).toEqual({
      id: 'a',
      date: '2024-01-10',
      amount: 100,
      direction: 'outflow',
      category: 'general',
      description: undefined
    })

    expect(normalizeOneTimeFlow({ date: '', amount: 10 })).toBeNull()
    expect(normalizeOneTimeFlow({ date: '2024-01-10', amount: -1 })).toBeNull()
  })

  it('normalizes one-time flow lists', () => {
    const normalized = normalizeOneTimeFlows([
      { id: 'x', date: '2024-01-01', amount: 10, direction: 'inflow', category: 'salary' },
      { id: 'bad', date: '', amount: 20, direction: 'inflow', category: 'salary' }
    ])

    expect(normalized).toHaveLength(1)
    expect(normalized[0].id).toBe('x')
  })

  it('builds schema-versioned export documents', () => {
    const doc = buildExportDocument(
      [{ id: 'a', date: '2024-01-01', amount: 100, direction: 'inflow', category: 'salary' }],
      [
        {
          id: 'r1',
          period: '0 0 15 * *',
          startDate: '2024-01-01',
          occurrences: 12,
          amount: 100,
          direction: 'inflow',
          category: 'salary'
        }
      ],
      '2026-06-12T00:00:00.000Z'
    )

    expect(doc).toMatchObject({
      kind: 'privfina.export',
      schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
      exportedAt: '2026-06-12T00:00:00.000Z'
    })
    expect(doc.data.oneTimeCashFlows).toHaveLength(1)
    expect(doc.data.recurringCashFlows).toHaveLength(1)
    expect(doc.data.instrumentBundles).toHaveLength(0)
  })

  it('imports current schema export documents', () => {
    const imported = parseImportDocument({
      kind: 'privfina.export',
      schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
      exportedAt: '2026-06-12T00:00:00.000Z',
      data: {
        oneTimeCashFlows: [
          { id: 'a', date: '2024-01-01', amount: 100, direction: 'inflow', category: 'salary' }
        ],
        recurringCashFlows: [
          {
            id: 'r1',
            period: '0 0 15 * *',
            startDate: '2024-01-01',
            occurrences: 12,
            amount: 100,
            direction: 'inflow',
            category: 'salary'
          }
        ]
      }
    })

    expect(imported.oneTimeFlows).toHaveLength(1)
    expect(imported.recurringFlows).toHaveLength(1)
    expect(imported.instrumentBundles).toHaveLength(0)
    expect(imported.schemaVersion).toBe(CURRENT_EXPORT_SCHEMA_VERSION)
    expect(imported.warnings).toEqual([])
  })

  it('imports and migrates legacy schema v1 payloads', () => {
    const imported = parseImportDocument({
      oneTimeFlows: [{ date: '2024-01-01', amount: 100, direction: 'inflow' }],
      recurringFlows: [
        {
          period: '0 0 15 * *',
          startDate: '2024-01-01',
          occurrences: 1,
          amount: 10,
          direction: 'outflow'
        }
      ]
    })

    expect(imported.schemaVersion).toBe(CURRENT_EXPORT_SCHEMA_VERSION)
    expect(imported.oneTimeFlows[0].id).toBeTruthy()
    expect(imported.recurringFlows[0].id).toBeTruthy()
    expect(imported.warnings.some((entry) => entry.includes('legacy schema v1'))).toBe(true)
  })

  it('rejects unsupported future import schemas', () => {
    expect(() =>
      parseImportDocument({
        kind: 'privfina.export',
        schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION + 1,
        data: {
          oneTimeCashFlows: [],
          recurringCashFlows: []
        }
      })
    ).toThrow(/newer than this app/)
  })

  it('parses valid numeric occurrences and string occurrences', () => {
    expect(parseOccurrences(5)).toBe(5)
    expect(parseOccurrences('120')).toBe(120)
    expect(parseOccurrences('  7  ')).toBe(7)
  })

  it('returns undefined for invalid occurrences', () => {
    expect(parseOccurrences('abc')).toBeUndefined()
    expect(parseOccurrences(0)).toBeUndefined()
    expect(parseOccurrences(-3)).toBeUndefined()
    expect(parseOccurrences('1.5')).toBeUndefined()
  })

  it('normalizes a valid recurring definition and drops bad fields', () => {
    const raw = {
      id: 'x',
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      amount: '100',
      direction: 'outflow',
      category: 'subscriptions',
      endDate: '2024-12-31',
      occurrences: '12'
    }

    const normalized = normalizeRecurringDefinition(raw)
    expect(normalized).toEqual({
      ...raw,
      amount: 100,
      occurrences: 12,
      category: 'subscriptions'
    })
  })

  it('filters invalid recurring definitions', () => {
    const definitions = normalizeRecurringDefinitions([
      { period: '0 0 15 * *', startDate: '2024-01-01', amount: 100 },
      { period: '', startDate: '2024-01-01', amount: 100 },
      { period: '0 0 15 * *', startDate: '', amount: 100 },
      { period: '0 0 15 * *', startDate: '2024-01-01', amount: -10 }
    ])

    expect(definitions).toHaveLength(1)
    expect(definitions[0]).toMatchObject({ period: '0 0 15 * *', startDate: '2024-01-01', amount: 100 })
  })

  it('safely expands recurring flows with invalid occurrences and no end date', () => {
    const definition = {
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      amount: 100,
      direction: 'inflow',
      category: 'general',
      occurrences: 'invalid'
    }

    expect(expandRecurringFlows(definition, '2024-01-01', '2024-12-31')).toEqual([])
  })

  it('parses string occurrences directly in expandRecurringFlows', () => {
    const definition = {
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      occurrences: '12',
      amount: 100,
      direction: 'inflow',
      category: 'general'
    }

    expect(expandRecurringFlows(definition, '2024-01-01', '2024-12-31')).toHaveLength(12)
  })

  it('stops expanding recurring flows once the selected range ends', () => {
    const definition = {
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      occurrences: 120,
      amount: 100,
      direction: 'inflow',
      category: 'general'
    }

    expect(expandRecurringFlows(definition, '2024-01-01', '2024-01-31')).toHaveLength(1)
  })

  it('stops expanding flows for a range earlier than a distant endDate', () => {
    const definition = {
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      endDate: '2050-12-31',
      occurrences: 'invalid',
      amount: 100,
      direction: 'inflow',
      category: 'general'
    }

    expect(expandRecurringFlows(definition, '2024-01-01', '2024-01-31')).toEqual([
      {
        date: '2024-01-15',
        amount: 100,
        direction: 'inflow',
        category: 'general'
      }
    ])
  })

  it('parses weekly and annual recurring schedules', () => {
    expect(parseRecurringSchedule('0 0 * * 1')).toEqual({ type: 'weekly', weekday: 1 })
    expect(parseRecurringSchedule('0 0 15 6 *')).toEqual({ type: 'annual', day: 15, month: 6 })
  })

  it('expands weekly recurring flows inside the selected range', () => {
    const definition = {
      period: '0 0 * * 1',
      startDate: '2026-01-05',
      occurrences: 4,
      amount: 100,
      direction: 'inflow',
      category: 'salary'
    }

    expect(expandRecurringFlows(definition, '2026-01-01', '2026-01-31')).toEqual([
      { date: '2026-01-05', amount: 100, direction: 'inflow', category: 'salary' },
      { date: '2026-01-12', amount: 100, direction: 'inflow', category: 'salary' },
      { date: '2026-01-19', amount: 100, direction: 'inflow', category: 'salary' },
      { date: '2026-01-26', amount: 100, direction: 'inflow', category: 'salary' }
    ])
  })

  it('expands annual recurring flows inside the selected range', () => {
    const definition = {
      period: '0 0 15 6 *',
      startDate: '2024-06-15',
      occurrences: 5,
      amount: 200,
      direction: 'inflow',
      category: 'bonus'
    }

    expect(expandRecurringFlows(definition, '2025-01-01', '2027-12-31')).toEqual([
      { date: '2025-06-15', amount: 200, direction: 'inflow', category: 'bonus' },
      { date: '2026-06-15', amount: 200, direction: 'inflow', category: 'bonus' },
      { date: '2027-06-15', amount: 200, direction: 'inflow', category: 'bonus' }
    ])
  })

  it('adds a new one-time flow when id is not found', () => {
    const initial = [
      { id: 'a', date: '2024-01-01', amount: 50, direction: 'inflow', category: 'general' }
    ]

    const result = upsertFlowById(initial, {
      id: 'b',
      date: '2024-01-15',
      amount: 25,
      direction: 'outflow',
      category: 'rent'
    })

    expect(result).toHaveLength(2)
    expect(result.find((entry) => entry.id === 'b')).toMatchObject({ amount: 25, direction: 'outflow' })
  })

  it('edits an existing recurring flow by id', () => {
    const initial = [
      {
        id: 'rec-1',
        period: '0 0 15 * *',
        startDate: '2024-01-01',
        occurrences: 12,
        amount: 100,
        direction: 'inflow',
        category: 'salary'
      }
    ]

    const result = upsertFlowById(initial, {
      id: 'rec-1',
      period: '0 0 15 * *',
      startDate: '2024-01-01',
      occurrences: 6,
      amount: 125,
      direction: 'inflow',
      category: 'salary'
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ occurrences: 6, amount: 125 })
  })

  it('deletes a flow by id', () => {
    const initial = [
      { id: 'a', date: '2024-01-01', amount: 50, direction: 'inflow', category: 'general' },
      { id: 'b', date: '2024-01-02', amount: 20, direction: 'outflow', category: 'rent' }
    ]

    const result = removeFlowById(initial, 'a')
    expect(result).toEqual([{ id: 'b', date: '2024-01-02', amount: 20, direction: 'outflow', category: 'rent' }])
  })

  it('recalculates cumulative totals from effective flows in range', () => {
    const oneTime = [
      { id: 'a', date: '2024-01-10', amount: 100, direction: 'inflow', category: 'salary' },
      { id: 'b', date: '2024-01-20', amount: 40, direction: 'outflow', category: 'rent' }
    ]

    const recurring = [
      {
        id: 'r1',
        period: '0 0 15 * *',
        startDate: '2024-01-01',
        occurrences: 1,
        amount: 10,
        direction: 'outflow',
        category: 'subscription'
      }
    ]

    const effective = buildEffectiveFlows(oneTime, recurring, '2024-01-01', '2024-01-31')
    const series = calculateCumulativeSeries(effective)

    expect(series).toEqual([
      { date: '2024-01-10', cumulativeTotal: 100 },
      { date: '2024-01-15', cumulativeTotal: 90 },
      { date: '2024-01-20', cumulativeTotal: 50 }
    ])
  })

  it('rolls business dates with weekend and holiday awareness', () => {
    expect(rollBusinessDay('2026-05-10', 'preceding')).toBe('2026-05-08')
    expect(rollBusinessDay('2026-06-10', 'preceding', ['2026-06-10'])).toBe('2026-06-09')
    expect(rollBusinessDay('2026-01-31', 'modified-following')).toBe('2026-01-30')
  })

  it('builds salary instrument bundle with custom monthly rule', () => {
    const bundle = generateSalaryInstrumentBundle({
      label: 'Main salary',
      startDate: '2026-01-01',
      occurrences: 3,
      amount: 2000,
      scheduleMode: 'custom-monthly-working-day',
      targetDayOfMonth: 10,
      businessDayConvention: 'preceding',
      holidaysRaw: ''
    })

    expect(bundle.instrumentType).toBe('salary')
    expect(bundle.generatedFlows.map((flow) => flow.date)).toEqual([
      '2026-01-09',
      '2026-02-10',
      '2026-03-10'
    ])
  })

  it('builds subscription instrument bundle as recurring outflow', () => {
    const bundle = generateSubscriptionInstrumentBundle({
      label: 'Streaming',
      period: '0 0 5 * *',
      startDate: '2026-01-01',
      occurrences: 2,
      amount: 15,
      category: 'subscription'
    })

    expect(bundle.instrumentType).toBe('subscription')
    expect(bundle.generatedFlows.map((flow) => flow.direction)).toEqual(['outflow', 'outflow'])
  })

  it('builds loan instrument bundle with live repayment preview', () => {
    const bundle = generateLoanInstrumentBundle({
      label: 'Car loan',
      principal: 10000,
      annualRate: 0.06,
      termValue: 12,
      termUnit: 'months',
      startDate: '2026-01-10',
      repaymentDayOfMonth: 15,
      includeDisbursement: true,
      category: 'loan'
    })

    const preview = createLoanRepaymentPreview({
      principal: 10000,
      annualRate: 0.06,
      termMonths: 12,
      startDate: '2026-01-10',
      repaymentDayOfMonth: 15
    })

    expect(bundle.instrumentType).toBe('loan')
    expect(bundle.generatedFlows[0].direction).toBe('inflow')
    expect(bundle.preview.monthlyInstallment).toBeCloseTo(preview.monthlyInstallment, 6)
    expect(bundle.generatedFlows.some((flow) => flow.direction === 'outflow')).toBe(true)
  })

  it('builds investment instrument bundles for regular and custom bonds', () => {
    const regular = generateInvestmentInstrumentBundle({
      label: 'Regular bond',
      subtype: 'regular-bond',
      purchaseDate: '2026-01-01',
      maturityDate: '2026-07-01',
      principal: 1000,
      annualRate: 0.05,
      purchasePrice: 950,
      category: 'investment'
    })

    const custom = generateInvestmentInstrumentBundle({
      label: 'Custom bond',
      subtype: 'custom-bond',
      purchaseDate: '2026-01-01',
      maturityDate: '2026-04-01',
      principal: 1000,
      annualRate: 0.12,
      couponPeriod: '0 0 1 * *',
      category: 'investment'
    })

    const preview = createInvestmentMaturityPreview({
      subtype: 'regular-bond',
      purchaseDate: '2026-01-01',
      maturityDate: '2026-07-01',
      principal: 1000,
      annualRate: 0.05,
      purchasePrice: 950
    })

    expect(regular.instrumentType).toBe('investment')
    expect(regular.preview.maturityAmount).toBeCloseTo(preview.maturityAmount, 6)
    expect(regular.generatedFlows.some((flow) => flow.direction === 'outflow')).toBe(true)
    expect(custom.generatedFlows.filter((flow) => flow.direction === 'inflow').length).toBeGreaterThan(1)
  })

  it('normalizes mixed instrument bundle collections', () => {
    const normalized = normalizeInstrumentBundles([
      {
        id: 'loan-1',
        instrumentType: 'loan',
        label: 'Loan',
        config: { principal: 1000 },
        preview: { monthlyInstallment: 100, totalRepayment: 1200, totalInterest: 200, termMonths: 12 },
        generatedFlows: [{ date: '2026-01-01', amount: 1000, direction: 'inflow', category: 'loan' }]
      },
      {
        id: 'inv-1',
        instrumentType: 'investment',
        label: 'Bond',
        config: { subtype: 'regular-bond' },
        preview: { purchaseAmount: 900, maturityAmount: 1000, gainAmount: 100, subtype: 'regular-bond' },
        generatedFlows: [{ date: '2026-01-01', amount: 900, direction: 'outflow', category: 'investment' }]
      }
    ])

    expect(normalized).toHaveLength(2)
    expect(normalized[0].instrumentType).toBe('loan')
    expect(normalized[1].instrumentType).toBe('investment')
  })

  it('normalizes instrument bundle collections and drops unsupported types', () => {
    const normalized = normalizeInstrumentBundles([
      {
        id: 's1',
        instrumentType: 'salary',
        label: 'Salary',
        config: {},
        generatedFlows: [{ date: '2026-01-10', amount: 1000, direction: 'inflow', category: 'salary' }]
      },
      {
        id: 'x1',
        instrumentType: 'unsupported',
        generatedFlows: []
      }
    ])

    expect(normalized).toHaveLength(1)
    expect(normalized[0].id).toBe('s1')
  })

  it('formats axis amounts with separators', () => {
    expect(formatAxisAmount(12345.678)).toBe('12,345.68')
    expect(formatAxisAmount(-2000)).toBe('-2,000')
  })

  it('downsamples large chart series while preserving boundaries', () => {
    const series = Array.from({ length: 2500 }, (_, index) => ({
      date: `2024-01-${String((index % 28) + 1).padStart(2, '0')}`,
      cumulativeTotal: index
    }))

    const sampled = downsampleSeriesForChart(series, 400)

    expect(sampled.length).toBeLessThanOrEqual(401)
    expect(sampled[0]).toEqual(series[0])
    expect(sampled[sampled.length - 1]).toEqual(series[series.length - 1])
  })

  it('renders chart with y-axis labels and guide lines', () => {
    const container = { innerHTML: '' }

    renderChart(
      [
        { date: '2024-01-01', cumulativeTotal: 100 },
        { date: '2024-02-01', cumulativeTotal: 50 },
        { date: '2024-03-01', cumulativeTotal: 250 }
      ],
      container
    )

    expect(container.innerHTML).toContain('Cumulative total amount')
    expect(container.innerHTML).toContain('class="grid-line"')
    expect(container.innerHTML).toContain('class="y-tick-label"')
    expect(container.innerHTML).toContain('class="series-line"')
    expect(container.innerHTML).toContain(' H ')
    expect(container.innerHTML).toContain(' V ')
  })

  it('colors zero axis red when cumulative totals cross zero', () => {
    const container = { innerHTML: '' }

    renderChart(
      [
        { date: '2024-01-01', cumulativeTotal: -40 },
        { date: '2024-02-01', cumulativeTotal: 10 }
      ],
      container
    )

    expect(container.innerHTML).toContain('class="zero-axis"')
    expect(container.innerHTML).toContain('stroke="#c0392b"')
  })

  it('keeps zero axis neutral when cumulative totals do not cross zero', () => {
    const container = { innerHTML: '' }

    renderChart(
      [
        { date: '2024-01-01', cumulativeTotal: 20 },
        { date: '2024-02-01', cumulativeTotal: 50 }
      ],
      container
    )

    expect(container.innerHTML).toContain('class="zero-axis"')
    expect(container.innerHTML).toContain('stroke="#bcb1a3"')
  })

  it('renders an informative empty state for range without flows', () => {
    const container = { innerHTML: '' }

    renderChart([], container, {
      startDate: '2024-01-01',
      endDate: '2024-12-31'
    })

    expect(container.innerHTML).toContain('No cash flows in 2024-01-01 to 2024-12-31')
    expect(container.innerHTML).toContain('Cumulative total remains 0')
  })
})
