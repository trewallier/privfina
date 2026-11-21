/**
 * Viewport math and interactive controller for the cumulative cash-flow chart.
 * Date pickers own the data domain; this module owns pan/zoom within that series.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_VISIBLE_DAYS = 3
const ZOOM_STEP = 1.25

function seriesTimeDomain(series) {
  if (!series.length) {
    return null
  }
  let xMin = Infinity
  let xMax = -Infinity
  for (const point of series) {
    const time = new Date(point.date).getTime()
    if (time < xMin) xMin = time
    if (time > xMax) xMax = time
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return null
  }
  if (xMin === xMax) {
    return { xMin: xMin - DAY_MS, xMax: xMax + DAY_MS }
  }
  return { xMin, xMax }
}

function clampViewport(viewport, domain) {
  if (!viewport || !domain) {
    return domain ? { ...domain } : null
  }

  const domainSpan = Math.max(domain.xMax - domain.xMin, DAY_MS)
  const minSpan = Math.min(MIN_VISIBLE_DAYS * DAY_MS, domainSpan)
  let span = Math.max(minSpan, viewport.xMax - viewport.xMin)
  span = Math.min(span, domainSpan)

  let mid = (viewport.xMin + viewport.xMax) / 2
  let xMin = mid - span / 2
  let xMax = mid + span / 2

  if (xMin < domain.xMin) {
    xMin = domain.xMin
    xMax = xMin + span
  }
  if (xMax > domain.xMax) {
    xMax = domain.xMax
    xMin = xMax - span
  }
  if (xMin < domain.xMin) {
    xMin = domain.xMin
  }

  return { xMin, xMax }
}

function zoomViewport(viewport, factor, anchorTime, domain) {
  if (!viewport || !domain) {
    return domain ? { ...domain } : null
  }
  const span = viewport.xMax - viewport.xMin
  const nextSpan = span / factor
  const anchor =
    Number.isFinite(anchorTime) && anchorTime >= viewport.xMin && anchorTime <= viewport.xMax
      ? anchorTime
      : (viewport.xMin + viewport.xMax) / 2
  const ratio = span > 0 ? (anchor - viewport.xMin) / span : 0.5
  const xMin = anchor - nextSpan * ratio
  const xMax = anchor + nextSpan * (1 - ratio)
  return clampViewport({ xMin, xMax }, domain)
}

function panViewport(viewport, deltaMs, domain) {
  if (!viewport || !domain) {
    return domain ? { ...domain } : null
  }
  return clampViewport(
    {
      xMin: viewport.xMin + deltaMs,
      xMax: viewport.xMax + deltaMs
    },
    domain
  )
}

function isViewportFull(viewport, domain, epsilonMs = DAY_MS / 4) {
  if (!viewport || !domain) {
    return true
  }
  return (
    Math.abs(viewport.xMin - domain.xMin) <= epsilonMs &&
    Math.abs(viewport.xMax - domain.xMax) <= epsilonMs
  )
}

/**
 * Classic "nice" number for axis scales.
 * @param {number} range
 * @param {boolean} round
 */
function niceNumber(range, round) {
  const abs = Math.abs(range)
  if (!(abs > 0) || !Number.isFinite(abs)) {
    return 1
  }
  const exponent = Math.floor(Math.log10(abs))
  const fraction = abs / 10 ** exponent
  let niceFraction
  if (round) {
    if (fraction < 1.5) niceFraction = 1
    else if (fraction < 3) niceFraction = 2
    else if (fraction < 7) niceFraction = 5
    else niceFraction = 10
  } else if (fraction <= 1) niceFraction = 1
  else if (fraction <= 2) niceFraction = 2
  else if (fraction <= 5) niceFraction = 5
  else niceFraction = 10

  return niceFraction * 10 ** exponent
}

/**
 * Build nice Y tick values that always include 0 when the range crosses or touches zero.
 * @param {number} minValue
 * @param {number} maxValue
 * @param {number} [tickCount=5]
 * @returns {number[]}
 */
function computeNiceYTicks(minValue, maxValue, tickCount = 5) {
  let lo = Math.min(0, minValue)
  let hi = Math.max(0, maxValue)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }

  const range = niceNumber(hi - lo, false)
  const step = niceNumber(range / Math.max(1, tickCount - 1), true)
  const niceMin = Math.floor(lo / step) * step
  const niceMax = Math.ceil(hi / step) * step

  const ticks = []
  // Guard against floating drift; cap tick count.
  for (let value = niceMin, guard = 0; value <= niceMax + step * 0.5 && guard < 24; value += step, guard += 1) {
    const rounded = Math.abs(value) < step * 1e-9 ? 0 : value
    ticks.push(rounded)
  }
  if (!ticks.includes(0) && lo <= 0 && hi >= 0) {
    ticks.push(0)
    ticks.sort((a, b) => a - b)
  }
  return ticks
}

/**
 * Adaptive X tick timestamps between domain ends based on available pixel width.
 * @param {number} xMin
 * @param {number} xMax
 * @param {number} plotWidthPx
 * @returns {number[]}
 */
function computeAdaptiveXTicks(xMin, xMax, plotWidthPx) {
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return []
  }
  if (xMax <= xMin) {
    return [xMin]
  }

  const approxLabelPx = plotWidthPx < 420 ? 72 : 96
  const maxTicks = Math.max(2, Math.floor(plotWidthPx / approxLabelPx))
  const span = xMax - xMin
  const rawStep = span / Math.max(1, maxTicks - 1)

  const candidates = [
    DAY_MS,
    2 * DAY_MS,
    7 * DAY_MS,
    14 * DAY_MS,
    30 * DAY_MS,
    60 * DAY_MS,
    90 * DAY_MS,
    182 * DAY_MS,
    365 * DAY_MS,
    730 * DAY_MS
  ]
  let step = candidates[candidates.length - 1]
  for (const candidate of candidates) {
    if (candidate >= rawStep) {
      step = candidate
      break
    }
  }

  const ticks = [xMin]
  const first = Math.ceil((xMin + step * 0.35) / step) * step
  for (let time = first; time < xMax - step * 0.35; time += step) {
    ticks.push(time)
  }
  if (ticks[ticks.length - 1] !== xMax) {
    ticks.push(xMax)
  }
  return ticks
}

function filterSeriesToViewport(series, viewport) {
  if (!series.length || !viewport) {
    return series
  }
  // Include the last point at or before xMin so the step line holds correctly.
  let startIndex = 0
  for (let index = 0; index < series.length; index += 1) {
    const time = new Date(series[index].date).getTime()
    if (time <= viewport.xMin) {
      startIndex = index
    } else {
      break
    }
  }
  const visible = []
  for (let index = startIndex; index < series.length; index += 1) {
    const point = series[index]
    const time = new Date(point.date).getTime()
    if (time > viewport.xMax) {
      break
    }
    visible.push(point)
  }
  // Ensure at least the hold point after viewport end for edge continuity when zoomed.
  if (!visible.length && series.length) {
    return [series[startIndex] || series[0]]
  }
  return visible
}

function yExtentForSeries(series, fitY, viewport) {
  const source = fitY ? filterSeriesToViewport(series, viewport) : series
  if (!source.length) {
    return { minTotal: -1, maxTotal: 1 }
  }
  let minTotal = Infinity
  let maxTotal = -Infinity
  for (const point of source) {
    const value = point.cumulativeTotal
    if (value < minTotal) minTotal = value
    if (value > maxTotal) maxTotal = value
  }
  minTotal = Math.min(0, minTotal)
  maxTotal = Math.max(0, maxTotal)
  if (minTotal === maxTotal) {
    minTotal -= 1
    maxTotal += 1
  }
  return { minTotal, maxTotal }
}

function estimateTextWidth(text, fontSize = 11) {
  // Approximate sans-serif advance width for layout padding (no canvas needed in tests).
  return Math.ceil(String(text).length * fontSize * 0.62)
}

function timeFromClientX(clientX, plotRect, viewport) {
  if (!plotRect || !viewport || plotRect.width <= 0) {
    return viewport ? (viewport.xMin + viewport.xMax) / 2 : 0
  }
  const ratio = Math.min(1, Math.max(0, (clientX - plotRect.left) / plotRect.width))
  return viewport.xMin + ratio * (viewport.xMax - viewport.xMin)
}

function findNearestPoint(series, targetTime) {
  if (!series.length) {
    return null
  }
  let best = series[0]
  let bestDist = Math.abs(new Date(best.date).getTime() - targetTime)
  for (let index = 1; index < series.length; index += 1) {
    const point = series[index]
    const dist = Math.abs(new Date(point.date).getTime() - targetTime)
    if (dist < bestDist) {
      best = point
      bestDist = dist
    }
  }
  return best
}

/**
 * Attach pan/zoom/tooltip interaction to a chart host.
 * @param {{
 *   host: HTMLElement,
 *   toolbar?: HTMLElement|null,
 *   statusNode?: HTMLElement|null,
 *   render: (state: object) => void,
 * }} options
 */
function createChartInteraction({ host, toolbar = null, statusNode = null, render }) {
  let series = []
  let domain = null
  let viewport = null
  let fitY = true
  let width = 880
  let height = 300
  let crosshair = null
  let rangeMeta = { startDate: '', endDate: '' }

  let pointerMode = null
  let lastPointer = null
  let pointerMoved = false
  let pinchStartDist = null
  let pinchStartViewport = null
  let lastTapAt = 0
  let resizeObserver = null

  const plotSelector = '[data-chart-plot]'

  const getState = () => ({
    series,
    domain,
    viewport,
    fitY,
    width,
    height,
    crosshair,
    startDate: rangeMeta.startDate,
    endDate: rangeMeta.endDate,
    samplingNote: statusNode
      ? null
      : undefined
  })

  const updateStatus = () => {
    if (!statusNode) {
      return
    }
    if (!series.length || !viewport || !domain) {
      statusNode.textContent = ''
      return
    }
    if (isViewportFull(viewport, domain)) {
      statusNode.textContent =
        series.length > 900
          ? `Showing downsampled series (${series.length.toLocaleString()} points)`
          : ''
      return
    }
    const start = new Date(viewport.xMin).toISOString().slice(0, 10)
    const end = new Date(viewport.xMax).toISOString().slice(0, 10)
    statusNode.textContent = `Viewing ${start} → ${end}`
  }

  const redraw = () => {
    updateStatus()
    render(getState())
  }

  const measure = () => {
    const rect = host.getBoundingClientRect()
    width = Math.max(280, Math.floor(rect.width) || 880)
    const narrow = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(max-width: 1020px)').matches
      : width < 1020
    const shellChart =
      typeof document !== 'undefined' &&
      document.querySelector('main[data-shell-view="chart"]')
    if (shellChart && narrow) {
      height = Math.max(260, Math.min(360, Math.floor(window.innerHeight * 0.5)))
    } else if (narrow) {
      height = 240
    } else {
      height = 300
    }
  }

  const setSeries = (nextSeries, { startDate = '', endDate = '', resetViewport = true } = {}) => {
    series = Array.isArray(nextSeries) ? nextSeries : []
    rangeMeta = { startDate, endDate }
    domain = seriesTimeDomain(series)
    if (resetViewport || !viewport || !domain) {
      viewport = domain ? { ...domain } : null
    } else {
      viewport = clampViewport(viewport, domain)
    }
    crosshair = null
    measure()
    redraw()
  }

  const setViewport = (next) => {
    viewport = clampViewport(next, domain)
    redraw()
  }

  const resetViewport = () => {
    viewport = domain ? { ...domain } : null
    crosshair = null
    redraw()
  }

  const getPlotRect = () => {
    const plot = host.querySelector(plotSelector)
    return plot ? plot.getBoundingClientRect() : host.getBoundingClientRect()
  }

  const setCrosshairFromClientX = (clientX) => {
    if (!series.length || !viewport) {
      crosshair = null
      return
    }
    const plotRect = getPlotRect()
    const time = timeFromClientX(clientX, plotRect, viewport)
    const point = findNearestPoint(filterSeriesToViewport(series, viewport), time)
    if (!point) {
      crosshair = null
      return
    }
    const visible = filterSeriesToViewport(series, viewport)
    const index = visible.findIndex((entry) => entry.date === point.date)
    const previous = index > 0 ? visible[index - 1] : null
    const dayDelta = previous ? point.cumulativeTotal - previous.cumulativeTotal : null
    crosshair = {
      date: point.date,
      cumulativeTotal: point.cumulativeTotal,
      dayDelta
    }
  }

  const onWheel = (event) => {
    if (!viewport || !domain) {
      return
    }
    event.preventDefault()
    const plotRect = getPlotRect()
    const anchor = timeFromClientX(event.clientX, plotRect, viewport)
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    viewport = zoomViewport(viewport, factor, anchor, domain)
    redraw()
  }

  const onPointerDown = (event) => {
    if (!viewport || !domain) {
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    host.setPointerCapture?.(event.pointerId)
    pointerMode = 'pan'
    pointerMoved = false
    lastPointer = { x: event.clientX, y: event.clientY, id: event.pointerId }
    setCrosshairFromClientX(event.clientX)
    redraw()
  }

  const onPointerMove = (event) => {
    if (!viewport || !domain) {
      return
    }
    if (pointerMode === 'pan' && lastPointer && lastPointer.id === event.pointerId) {
      const plotRect = getPlotRect()
      const span = viewport.xMax - viewport.xMin
      const deltaPx = event.clientX - lastPointer.x
      if (Math.abs(deltaPx) > 3 || Math.abs(event.clientY - lastPointer.y) > 3) {
        pointerMoved = true
      }
      const deltaMs = plotRect.width > 0 ? (-deltaPx / plotRect.width) * span : 0
      viewport = panViewport(viewport, deltaMs, domain)
      lastPointer = { x: event.clientX, y: event.clientY, id: event.pointerId }
      setCrosshairFromClientX(event.clientX)
      redraw()
      return
    }
    if (event.pointerType === 'mouse') {
      setCrosshairFromClientX(event.clientX)
      redraw()
    }
  }

  const onPointerUp = (event) => {
    const wasTap = pointerMode === 'pan' && !pointerMoved
    if (lastPointer && lastPointer.id === event.pointerId) {
      pointerMode = null
      lastPointer = null
    }
    if (!wasTap) {
      pointerMoved = false
      return
    }
    const now = Date.now()
    if (now - lastTapAt < 320) {
      resetViewport()
      lastTapAt = 0
    } else {
      lastTapAt = now
    }
    pointerMoved = false
  }

  const onPointerLeave = () => {
    if (pointerMode) {
      return
    }
    crosshair = null
    redraw()
  }

  const touchDistance = (touches) => {
    const [a, b] = touches
    const dx = a.clientX - b.clientX
    const dy = a.clientY - b.clientY
    return Math.hypot(dx, dy)
  }

  const onTouchStart = (event) => {
    if (event.touches.length === 2 && viewport) {
      event.preventDefault()
      pinchStartDist = touchDistance(event.touches)
      pinchStartViewport = { ...viewport }
      pointerMode = 'pinch'
    }
  }

  const onTouchMove = (event) => {
    if (pointerMode === 'pinch' && event.touches.length === 2 && pinchStartDist && pinchStartViewport) {
      event.preventDefault()
      const dist = touchDistance(event.touches)
      if (!(dist > 0) || !(pinchStartDist > 0)) {
        return
      }
      const factor = dist / pinchStartDist
      const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2
      const anchor = timeFromClientX(midX, getPlotRect(), pinchStartViewport)
      viewport = zoomViewport(pinchStartViewport, factor, anchor, domain)
      setCrosshairFromClientX(midX)
      redraw()
    }
  }

  const onTouchEnd = () => {
    if (pointerMode === 'pinch') {
      pointerMode = null
      pinchStartDist = null
      pinchStartViewport = null
    }
  }

  const onKeyDown = (event) => {
    if (!viewport || !domain) {
      return
    }
    const span = viewport.xMax - viewport.xMin
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      viewport = zoomViewport(viewport, ZOOM_STEP, (viewport.xMin + viewport.xMax) / 2, domain)
      redraw()
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      viewport = zoomViewport(viewport, 1 / ZOOM_STEP, (viewport.xMin + viewport.xMax) / 2, domain)
      redraw()
    } else if (event.key === '0') {
      event.preventDefault()
      resetViewport()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      viewport = panViewport(viewport, -span * 0.15, domain)
      redraw()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      viewport = panViewport(viewport, span * 0.15, domain)
      redraw()
    }
  }

  const onToolbarClick = (event) => {
    const button = event.target.closest('[data-chart-action]')
    if (!button || !viewport || !domain) {
      return
    }
    const action = button.getAttribute('data-chart-action')
    if (action === 'zoom-in') {
      viewport = zoomViewport(viewport, ZOOM_STEP, (viewport.xMin + viewport.xMax) / 2, domain)
      redraw()
    } else if (action === 'zoom-out') {
      viewport = zoomViewport(viewport, 1 / ZOOM_STEP, (viewport.xMin + viewport.xMax) / 2, domain)
      redraw()
    } else if (action === 'reset') {
      resetViewport()
    } else if (action === 'fit-y') {
      fitY = !fitY
      button.setAttribute('aria-pressed', fitY ? 'true' : 'false')
      redraw()
    }
  }

  host.classList.add('chart-host')
  host.setAttribute('tabindex', '0')
  host.setAttribute('role', 'img')
  host.style.touchAction = 'none'

  host.addEventListener('wheel', onWheel, { passive: false })
  host.addEventListener('pointerdown', onPointerDown)
  host.addEventListener('pointermove', onPointerMove)
  host.addEventListener('pointerup', onPointerUp)
  host.addEventListener('pointercancel', onPointerUp)
  host.addEventListener('pointerleave', onPointerLeave)
  host.addEventListener('touchstart', onTouchStart, { passive: false })
  host.addEventListener('touchmove', onTouchMove, { passive: false })
  host.addEventListener('touchend', onTouchEnd)
  host.addEventListener('keydown', onKeyDown)

  if (toolbar) {
    toolbar.addEventListener('click', onToolbarClick)
    const fitButton = toolbar.querySelector('[data-chart-action="fit-y"]')
    if (fitButton) {
      fitButton.setAttribute('aria-pressed', fitY ? 'true' : 'false')
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      measure()
      redraw()
    })
    resizeObserver.observe(host)
  }

  measure()

  return {
    setSeries,
    resetViewport,
    getViewport: () => (viewport ? { ...viewport } : null),
    destroy() {
      host.removeEventListener('wheel', onWheel)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerup', onPointerUp)
      host.removeEventListener('pointercancel', onPointerUp)
      host.removeEventListener('pointerleave', onPointerLeave)
      host.removeEventListener('touchstart', onTouchStart)
      host.removeEventListener('touchmove', onTouchMove)
      host.removeEventListener('touchend', onTouchEnd)
      host.removeEventListener('keydown', onKeyDown)
      if (toolbar) {
        toolbar.removeEventListener('click', onToolbarClick)
      }
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }
}

/**
 * Shift an ISO date (YYYY-MM-DD) by whole months in UTC.
 */
function shiftIsoDateByMonths(isoDate, months) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + months, day))
  return date.toISOString().slice(0, 10)
}

/**
 * Resolve a range preset relative to an end date (typically today or current end).
 * @param {'1m'|'3m'|'ytd'|'max'} preset
 * @param {{ endDate: string, maxStart?: string, maxEnd?: string }} context
 */
function resolveRangePreset(preset, { endDate, maxStart, maxEnd }) {
  const end = endDate || maxEnd || new Date().toISOString().slice(0, 10)
  if (preset === 'max') {
    return {
      startDate: maxStart || end,
      endDate: maxEnd || end
    }
  }
  if (preset === 'ytd') {
    const year = end.slice(0, 4)
    return { startDate: `${year}-01-01`, endDate: end }
  }
  if (preset === '3m') {
    return { startDate: shiftIsoDateByMonths(end, -3), endDate: end }
  }
  // 1m default
  return { startDate: shiftIsoDateByMonths(end, -1), endDate: end }
}

export {
  DAY_MS,
  MIN_VISIBLE_DAYS,
  ZOOM_STEP,
  seriesTimeDomain,
  clampViewport,
  zoomViewport,
  panViewport,
  isViewportFull,
  niceNumber,
  computeNiceYTicks,
  computeAdaptiveXTicks,
  filterSeriesToViewport,
  yExtentForSeries,
  estimateTextWidth,
  timeFromClientX,
  findNearestPoint,
  createChartInteraction,
  shiftIsoDateByMonths,
  resolveRangePreset
}
