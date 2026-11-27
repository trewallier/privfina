import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createDiscountQuoteChartController,
  mapQuotesToBuySellSeries
} from '../public/controller/discount-quote-chart.js'
import {
  buildLinearPath,
  formatAxisPercent,
  renderChart,
  updateChartCrosshair
} from '../public/render.js'
import { yExtentForSeries } from '../public/controller/chart-viewport.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureQuotes = JSON.parse(
  readFileSync(
    join(here, 'fixtures/market-data/published/families/dkj/quotes/D261223.json'),
    'utf8'
  )
)

describe('mapQuotesToBuySellSeries', () => {
  it('maps ask→buyPct and bid→sellPct in date order', () => {
    const series = mapQuotesToBuySellSeries(fixtureQuotes)
    expect(series).toEqual([
      { date: '2026-10-31', buyPct: 99.2, sellPct: 99.1 },
      { date: '2026-11-02', buyPct: 99.3512, sellPct: 99.1502 }
    ])
  })

  it('skips days with neither bid nor ask and keeps one-sided rows', () => {
    const series = mapQuotesToBuySellSeries({
      cols: ['d', 'bid', 'ask', 'by', 'ay', 'ai'],
      rows: [
        ['2026-11-01', null, 99.4, null, 4.5, 0],
        ['2026-11-02', 99.1, null, 6.0, null, 0],
        ['2026-11-03', null, null, null, null, 0],
        ['bad-date', 99, 99.1, 1, 1, 0]
      ]
    })
    expect(series).toEqual([
      { date: '2026-11-01', buyPct: 99.4, sellPct: null },
      { date: '2026-11-02', buyPct: null, sellPct: 99.1 }
    ])
  })

  it('returns empty for missing quote files', () => {
    expect(mapQuotesToBuySellSeries(null)).toEqual([])
    expect(mapQuotesToBuySellSeries({ cols: ['d', 'bid', 'ask'], rows: [] })).toEqual([])
  })
})

describe('dual-line percent chart render', () => {
  it('formats percent axis labels', () => {
    expect(formatAxisPercent(99.1502)).toBe('99.15%')
    expect(formatAxisPercent(null)).toBe('—')
  })

  it('builds linear paths that break across null gaps', () => {
    const series = [
      { date: '2026-11-01', buyPct: 99.2 },
      { date: '2026-11-02', buyPct: 99.25 },
      { date: '2026-11-03', buyPct: null },
      { date: '2026-11-04', buyPct: 99.4 },
      { date: '2026-11-05', buyPct: 99.45 }
    ]
    const path = buildLinearPath(series, (t) => t / 1e12, (v) => v, 'buyPct')
    expect(path).toContain('M ')
    expect(path).toContain(' L ')
    // Gap forces a second move-to rather than one continuous segment.
    expect((path.match(/M /g) || []).length).toBe(2)
  })

  it('computes Y extent across multiple keys without forcing zero', () => {
    const extent = yExtentForSeries(
      [
        { date: '2026-11-01', buyPct: 99.2, sellPct: 99.0 },
        { date: '2026-11-02', buyPct: 99.5, sellPct: 99.1 }
      ],
      false,
      null,
      { valueKeys: ['buyPct', 'sellPct'], includeZero: false }
    )
    expect(extent.minTotal).toBeGreaterThan(98)
    expect(extent.maxTotal).toBeLessThan(100)
  })

  it('renders two linear percent lines without area fill', () => {
    const container = { innerHTML: '', setAttribute: () => {}, querySelector: () => null }
    const series = mapQuotesToBuySellSeries(fixtureQuotes)
    renderChart(series, container, {
      width: 480,
      height: 220,
      pathStyle: 'linear',
      showArea: false,
      showZeroAxis: false,
      includeZero: false,
      title: 'Buy / sell price % of face',
      formatY: formatAxisPercent,
      lines: [
        { key: 'buyPct', label: 'Buy %', color: '#2563eb' },
        { key: 'sellPct', label: 'Sell %', color: '#c2410c' }
      ]
    })

    expect(container.innerHTML).toContain('Buy / sell price % of face')
    expect(container.innerHTML).toContain('data-series-key="buyPct"')
    expect(container.innerHTML).toContain('data-series-key="sellPct"')
    expect(container.innerHTML).toMatch(/\d+\.\d{2}%/)
    expect(container.innerHTML).not.toContain('>0.00%<')
    expect(container.innerHTML).not.toContain('class="series-area"')
    expect(container.innerHTML).toContain(' L ')
    expect(container.innerHTML).not.toMatch(/class="series-line"[^>]* H /)
  })

  it('keeps default cumulative hold chart behavior', () => {
    const container = { innerHTML: '' }
    renderChart(
      [
        { date: '2024-01-01', cumulativeTotal: 100 },
        { date: '2024-02-01', cumulativeTotal: 50 }
      ],
      container
    )
    expect(container.innerHTML).toContain('Cumulative total amount')
    expect(container.innerHTML).toContain('class="series-area"')
    expect(container.innerHTML).toContain(' H ')
    expect(container.innerHTML).toContain(' V ')
  })

  it('formats dayDelta with money even when layout.formatY is percent', () => {
    const tooltip = { hidden: true, textContent: '', style: { left: '', top: '' } }
    const container = {
      querySelector(selector: string) {
        if (selector === '.chart-crosshair-x') return { setAttribute: vi.fn() }
        if (selector === '.chart-crosshair-y') return { setAttribute: vi.fn() }
        if (selector === '.chart-crosshair-point') return { setAttribute: vi.fn() }
        if (selector === '.chart-tooltip') return tooltip
        return null
      }
    }
    updateChartCrosshair(
      container,
      { date: '2024-06-01', cumulativeTotal: 1000, dayDelta: 1000 },
      {
        leftPad: 80,
        plotRight: 620,
        topPad: 28,
        plotBottom: 260,
        plotWidth: 540,
        plotHeight: 232,
        width: 640,
        height: 300,
        minTime: Date.parse('2024-01-01T00:00:00Z'),
        maxTime: Date.parse('2024-12-01T00:00:00Z'),
        yMin: 0,
        yMax: 2000,
        formatY: formatAxisPercent
      }
    )
    expect(tooltip.textContent).toContain('day 1 000.00')
    expect(tooltip.textContent).not.toMatch(/day\s+1000\.00%/)
  })
})

describe('discount quote chart controller visibility', () => {
  it('shows on setQuotes with history and hides on clear / empty', () => {
    const wrap = { hidden: true }
    let hostHtml = ''
    const host = {
      getBoundingClientRect: () => ({ width: 480, height: 220, left: 0, top: 0 }),
      querySelector: () => null,
      setAttribute: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      get innerHTML() {
        return hostHtml
      },
      set innerHTML(value) {
        hostHtml = value
      }
    }
    const chart = createDiscountQuoteChartController({ wrap: wrap as HTMLElement, host: host as unknown as HTMLElement })

    chart.setQuotes(fixtureQuotes)
    expect(wrap.hidden).toBe(false)
    expect(hostHtml).toContain('data-series-key="buyPct"')
    expect(hostHtml).toContain('data-series-key="sellPct"')
    expect(chart._getSeries().length).toBe(2)

    chart.clear()
    expect(wrap.hidden).toBe(true)
    expect(hostHtml).toBe('')
    expect(chart._getSeries()).toEqual([])

    chart.setQuotes({ cols: ['d', 'bid', 'ask'], rows: [] })
    expect(wrap.hidden).toBe(true)
    expect(chart._getSeries()).toEqual([])

    chart.destroy()
  })
})

describe('commercial host wiring', () => {
  it('wires the discount quote chart controller without productCode branches', () => {
    const commercialHost = readFileSync(
      join(here, '../public/controller/commercial-investment-composer-host.js'),
      'utf8'
    )
    const indexHtml = readFileSync(join(here, '../public/index.html'), 'utf8')
    expect(commercialHost).toContain('createDiscountQuoteChartController')
    expect(commercialHost).toContain('syncDiscountQuoteChart')
    expect(commercialHost).toContain("composerProfile === 'discount'")
    expect(commercialHost).not.toMatch(/productCode\s*===\s*['"]dkj['"]/)
    expect(indexHtml).toContain('id="discount-quote-chart"')
    expect(indexHtml).toContain('id="discount-quote-chart-wrap"')
    expect(indexHtml).toContain('class="chart-surface"')
  })
})
