/**
 * DKJ buy/sell % quote-history chart for the commercial investment composer.
 * Reuses renderChart / chart theme tokens from the viz-pane cumulative chart.
 */
import {
  formatAxisPercent,
  readChartThemeColors,
  renderChart
} from '../render.js'
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

/**
 * Attach a ResizeObserver-backed buy/sell % chart host under the DKJ form.
 * @param {{ wrap?: HTMLElement|null, host?: HTMLElement|null }} [elements]
 */
export function createDkjQuoteChartController({
  wrap = document.getElementById('dkj-quote-chart-wrap'),
  host = document.getElementById('dkj-quote-chart')
} = {}) {
  let series = []
  let resizeObserver = null
  let measuredWidth = 0

  const measure = () => {
    if (!host || typeof host.getBoundingClientRect !== 'function') {
      measuredWidth = 640
      return
    }
    measuredWidth = Math.max(280, Math.floor(host.getBoundingClientRect().width || 640))
  }

  const paint = () => {
    if (!host) {
      return
    }
    if (!series.length) {
      host.innerHTML = ''
      return
    }
    measure()
    const theme = readChartThemeColors()
    renderChart(series, host, {
      width: measuredWidth,
      height: 220,
      pathStyle: 'linear',
      showArea: false,
      showZeroAxis: false,
      includeZero: false,
      showSamplingNote: false,
      title: 'Buy / sell price % of face',
      ariaLabel: 'DKJ buy and sell price percent history',
      emptyMessage: 'No published quote history for this series.',
      formatY: formatAxisPercent,
      themeColors: theme,
      lines: [
        { key: 'buyPct', label: 'Buy %', color: theme.series },
        { key: 'sellPct', label: 'Sell %', color: theme.seriesAlt }
      ]
    })
  }

  const setVisible = (visible) => {
    if (!wrap) return
    wrap.hidden = !visible
  }

  const clear = () => {
    series = []
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

  if (host && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (!series.length) return
      paint()
    })
    resizeObserver.observe(host)
  }

  if (typeof document !== 'undefined') {
    document.addEventListener(THEME_CHANGE_EVENT, onThemeChange)
  }

  clear()

  return {
    setQuotes,
    clear,
    redraw: paint,
    destroy() {
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener(THEME_CHANGE_EVENT, onThemeChange)
      }
      clear()
    }
  }
}
