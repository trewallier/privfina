/**
 * Discount (DKJ) buy/sell % quote-history chart for the commercial investment composer.
 * Reuses renderChart / chart theme tokens from the viz-pane cumulative chart.
 */
import {
  formatAxisPercent,
  formatDateLabel,
  readChartThemeColors,
  renderChart,
  updateChartCrosshair
} from '../render.js'
import {
  findNearestPoint,
  seriesTimeDomain,
  timeFromClientX
} from './chart-viewport.js'
import { THEME_CHANGE_EVENT } from '../theme.js'

/**
 * Map published quote rows to investor-facing buy/sell % points.
 * Buy % = ask (eladási); Sell % = bid (vételi).
 * @param {{ cols?: string[], rows?: unknown[][] }|null|undefined} quotesFile
 * @returns {{ date: string, buyPct: number|null, sellPct: number|null }[]}
 */
export function mapQuotesToBuySellSeries(quotesFile) {
  if (!quotesFile || !Array.isArray(quotesFile.rows) || quotesFile.rows.length === 0) {
    return []
  }
  const cols = Array.isArray(quotesFile.cols) ? quotesFile.cols : []
  const dIndex = cols.indexOf('d')
  const bidIndex = cols.indexOf('bid')
  const askIndex = cols.indexOf('ask')
  if (dIndex < 0) {
    return []
  }

  const points = []
  for (const row of quotesFile.rows) {
    if (!Array.isArray(row)) continue
    const date = String(row[dIndex] || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const ask = askIndex >= 0 ? row[askIndex] : null
    const bid = bidIndex >= 0 ? row[bidIndex] : null
    const buyPct =
      ask != null && Number.isFinite(Number(ask)) ? Number(ask) : null
    const sellPct =
      bid != null && Number.isFinite(Number(bid)) ? Number(bid) : null
    if (buyPct == null && sellPct == null) continue
    points.push({ date, buyPct, sellPct })
  }

  points.sort((a, b) => a.date.localeCompare(b.date))
  return points
}

function formatBuySellTooltip(point) {
  const parts = [formatDateLabel(point.date)]
  if (point.buyPct != null && Number.isFinite(Number(point.buyPct))) {
    parts.push(`Buy ${formatAxisPercent(point.buyPct)}`)
  }
  if (point.sellPct != null && Number.isFinite(Number(point.sellPct))) {
    parts.push(`Sell ${formatAxisPercent(point.sellPct)}`)
  }
  return parts.join(' · ')
}

/**
 * Attach a ResizeObserver-backed buy/sell % chart host under the discount form.
 * @param {{ wrap?: HTMLElement|null, host?: HTMLElement|null }} [elements]
 */
export function createDiscountQuoteChartController({
  wrap = typeof document !== 'undefined'
    ? document.getElementById('discount-quote-chart-wrap')
    : null,
  host = typeof document !== 'undefined'
    ? document.getElementById('discount-quote-chart')
    : null
} = {}) {
  let series = []
  let layout = null
  let resizeObserver = null
  let measuredWidth = 0
  let rafId = 0
  let pointerBound = false

  const measure = () => {
    if (!host || typeof host.getBoundingClientRect !== 'function') {
      measuredWidth = 640
      return measuredWidth
    }
    return Math.max(280, Math.floor(host.getBoundingClientRect().width || 640))
  }

  const clearCrosshair = () => {
    if (!host || !layout) return
    updateChartCrosshair(host, null, layout)
  }

  const paint = () => {
    if (!host) {
      return
    }
    if (!series.length) {
      host.innerHTML = ''
      layout = null
      return
    }
    measuredWidth = measure()
    const theme = readChartThemeColors()
    layout = renderChart(series, host, {
      width: measuredWidth,
      height: 220,
      pathStyle: 'linear',
      showArea: false,
      showZeroAxis: false,
      includeZero: false,
      showSamplingNote: false,
      title: 'Buy / sell price % of face',
      ariaLabel: 'Buy and sell price percent history',
      emptyMessage: 'No published quote history for this series.',
      formatY: formatAxisPercent,
      themeColors: theme,
      lines: [
        { key: 'buyPct', label: 'Buy %', color: theme.series },
        { key: 'sellPct', label: 'Sell %', color: theme.seriesAlt }
      ]
    })
  }

  const schedulePaint = () => {
    if (!series.length) return
    if (typeof requestAnimationFrame !== 'function') {
      const nextWidth = measure()
      if (nextWidth === measuredWidth && host?.querySelector?.('.chart-svg')) {
        return
      }
      paint()
      return
    }
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      const nextWidth = measure()
      if (nextWidth === measuredWidth && host?.querySelector?.('.chart-svg')) {
        return
      }
      paint()
    })
  }

  const setVisible = (visible) => {
    if (!wrap) return
    wrap.hidden = !visible
  }

  const clear = () => {
    series = []
    layout = null
    setVisible(false)
    if (host) {
      host.innerHTML = ''
    }
  }

  const setQuotes = (quotesFile) => {
    series = mapQuotesToBuySellSeries(quotesFile)
    if (!series.length) {
      clear()
      return
    }
    setVisible(true)
    paint()
  }

  const onThemeChange = () => {
    if (series.length) {
      paint()
    }
  }

  const onPointerMove = (event) => {
    if (!host || !layout || !series.length) return
    const plot = host.querySelector('[data-chart-plot]')
    const plotRect = plot ? plot.getBoundingClientRect() : host.getBoundingClientRect()
    const domain = seriesTimeDomain(series) || {
      xMin: layout.minTime,
      xMax: layout.maxTime
    }
    const time = timeFromClientX(event.clientX, plotRect, {
      xMin: layout.minTime,
      xMax: layout.maxTime
    })
    const point = findNearestPoint(series, time)
    if (!point) {
      clearCrosshair()
      return
    }
    const yValue =
      point.buyPct != null && Number.isFinite(Number(point.buyPct))
        ? Number(point.buyPct)
        : point.sellPct
    updateChartCrosshair(
      host,
      {
        date: point.date,
        buyPct: point.buyPct,
        sellPct: point.sellPct,
        tooltipText: formatBuySellTooltip(point)
      },
      {
        ...layout,
        valueKey:
          yValue === point.sellPct && point.buyPct == null ? 'sellPct' : 'buyPct',
        formatY: formatAxisPercent,
        minTime: domain.xMin,
        maxTime: domain.xMax
      }
    )
  }

  const onPointerLeave = () => {
    clearCrosshair()
  }

  const bindPointer = () => {
    if (!host || pointerBound) return
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerleave', onPointerLeave)
    pointerBound = true
  }

  const unbindPointer = () => {
    if (!host || !pointerBound) return
    host.removeEventListener('pointermove', onPointerMove)
    host.removeEventListener('pointerleave', onPointerLeave)
    pointerBound = false
  }

  if (host && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (!series.length) return
      schedulePaint()
    })
    resizeObserver.observe(host)
  }

  if (typeof document !== 'undefined') {
    document.addEventListener(THEME_CHANGE_EVENT, onThemeChange)
  }

  bindPointer()
  clear()

  return {
    setQuotes,
    clear,
    redraw: paint,
    /** @internal test helper */
    _getSeries: () => series,
    destroy() {
      if (rafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      unbindPointer()
      if (typeof document !== 'undefined') {
        document.removeEventListener(THEME_CHANGE_EVENT, onThemeChange)
      }
      clear()
    }
  }
}
