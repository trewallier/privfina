/**
 * Viewport math and interactive controller for the cumulative cash-flow chart.
 * Date pickers choose which series is computed; this module pans/zooms within
 * the already-loaded series timestamps.
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
 * Adaptive calendar-aligned X tick timestamps based on available pixel width.
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
  const daySpan = span / DAY_MS

  /** @type {'day'|'week'|'month'|'quarter'|'year'} */
  let unit = 'year'
  let stepCount = 1
  if (daySpan <= maxTicks) {
    unit = 'day'
  } else if (daySpan / 7 <= maxTicks) {
    unit = 'week'
  } else if (daySpan / 30 <= maxTicks) {
    unit = 'month'
    stepCount = Math.max(1, Math.ceil(daySpan / 30 / maxTicks))
  } else if (daySpan / 91 <= maxTicks) {
    unit = 'quarter'
  } else {
    unit = 'year'
    stepCount = Math.max(1, Math.ceil(daySpan / 365 / maxTicks))
  }

  const ticks = [xMin]
  const cursor = new Date(xMin)
  if (unit === 'day') {
    cursor.setUTCHours(0, 0, 0, 0)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  } else if (unit === 'week') {
    cursor.setUTCHours(0, 0, 0, 0)
    const day = cursor.getUTCDay()
    const toMonday = day === 0 ? 1 : 8 - day
    cursor.setUTCDate(cursor.getUTCDate() + toMonday)
  } else if (unit === 'month') {
    cursor.setUTCFullYear(cursor.getUTCFullYear(), cursor.getUTCMonth() + stepCount, 1)
    cursor.setUTCHours(0, 0, 0, 0)
  } else if (unit === 'quarter') {
    const quarterMonth = Math.floor(cursor.getUTCMonth() / 3) * 3 + 3
    cursor.setUTCFullYear(cursor.getUTCFullYear(), quarterMonth, 1)
    cursor.setUTCHours(0, 0, 0, 0)
  } else {
    cursor.setUTCFullYear(cursor.getUTCFullYear() + stepCount, 0, 1)
    cursor.setUTCHours(0, 0, 0, 0)
  }

  const edgePad = span * 0.08
  while (cursor.getTime() < xMax - edgePad) {
    const time = cursor.getTime()
    if (time > xMin + edgePad) {
      ticks.push(time)
    }
    if (unit === 'day') {
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    } else if (unit === 'week') {
      cursor.setUTCDate(cursor.getUTCDate() + 7)
    } else if (unit === 'month') {
      cursor.setUTCMonth(cursor.getUTCMonth() + stepCount)
    } else if (unit === 'quarter') {
      cursor.setUTCMonth(cursor.getUTCMonth() + 3)
    } else {
      cursor.setUTCFullYear(cursor.getUTCFullYear() + stepCount)
    }
    if (ticks.length > 48) {
      break
    }
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
 * Shift an ISO date (YYYY-MM-DD) by whole months in UTC.
 * Clamps the day to the last day of the target month (Mar 31 − 1M → Feb 28/29).
 */
function shiftIsoDateByMonths(isoDate, months) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const clampedDay = Math.min(day, lastDay)
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), clampedDay))
    .toISOString()
    .slice(0, 10)
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
  return { startDate: shiftIsoDateByMonths(end, -1), endDate: end }
}

/**
 * Attach pan/zoom/tooltip interaction to a chart host.
 * Uses Pointer Events only (including multi-pointer pinch). Mostly-vertical
 * touch drags defer to page scroll.
 *
 * @param {{
 *   host: HTMLElement,
 *   toolbar?: HTMLElement|null,
 *   statusNode?: HTMLElement|null,
 *   render: (state: object) => object|void,
 *   updateCrosshair?: (host: HTMLElement, crosshair: object|null, layout: object|null) => void,
 * }} options
 */
function createChartInteraction({
  host,
  toolbar = null,
  statusNode = null,
  render,
  updateCrosshair = null
}) {
  let series = []
  let domain = null
  let viewport = null
  let fitY = true
  let width = 880
  let height = 300
  let crosshair = null
  let rangeMeta = { startDate: '', endDate: '' }
  let layout = null

  /** @type {Map<number, { x: number, y: number }>} */
  const activePointers = new Map()
  let pointerMode = null
  let panCommitted = false
  let pointerMoved = false
  let lastPanX = null
  let panStartX = null
  let panStartY = null
  let pinchStartDist = null
  let pinchStartViewport = null
  let lastTapAt = 0
  let resizeObserver = null

  const getState = () => ({
    series,
    domain,
    viewport,
    fitY,
    width,
    height,
    startDate: rangeMeta.startDate,
    endDate: rangeMeta.endDate
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

  const paintCrosshair = () => {
    if (typeof updateCrosshair === 'function') {
      updateCrosshair(host, crosshair, layout)
    }
  }

  const redrawFull = () => {
    updateStatus()
    const nextLayout = render(getState())
    layout = nextLayout || null
    paintCrosshair()
  }

  const measure = () => {
    const rect = host.getBoundingClientRect()
    width = Math.max(280, Math.floor(rect.width) || 880)
    const narrow =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(max-width: 1020px)').matches
        : width < 1020
    const shellChart =
      typeof document !== 'undefined' && document.querySelector('main[data-shell-view="chart"]')
    if (shellChart && narrow) {
      height = Math.max(260, Math.min(360, Math.floor(window.innerHeight * 0.5)))
    } else if (narrow) {
      height = 240
    } else {
      height = 300
    }
  }

  const sameDomain = (a, b) => Boolean(a && b && a.xMin === b.xMin && a.xMax === b.xMax)

  const setSeries = (nextSeries, { startDate = '', endDate = '', resetViewport = true } = {}) => {
    series = Array.isArray(nextSeries) ? nextSeries : []
    rangeMeta = { startDate, endDate }
    const previousDomain = domain
    domain = seriesTimeDomain(series)
    if (resetViewport || !viewport || !domain) {
      viewport = domain ? { ...domain } : null
    } else if (sameDomain(previousDomain, domain)) {
      viewport = clampViewport(viewport, domain)
    } else {
      viewport = clampViewport(viewport, domain)
    }
    crosshair = null
    measure()
    redrawFull()
  }

  const resetViewportFn = () => {
    viewport = domain ? { ...domain } : null
    crosshair = null
    redrawFull()
  }

  const getPlotRect = () => {
    const plot = host.querySelector('[data-chart-plot]')
    return plot ? plot.getBoundingClientRect() : host.getBoundingClientRect()
  }

  const setCrosshairFromClientX = (clientX) => {
    if (!series.length || !viewport) {
      crosshair = null
      return
    }
    const time = timeFromClientX(clientX, getPlotRect(), viewport)
    const visible = filterSeriesToViewport(series, viewport)
    const point = findNearestPoint(visible, time)
    if (!point) {
      crosshair = null
      return
    }
    const index = visible.findIndex((entry) => entry.date === point.date)
    const previous = index > 0 ? visible[index - 1] : null
    crosshair = {
      date: point.date,
      cumulativeTotal: point.cumulativeTotal,
      dayDelta: previous ? point.cumulativeTotal - previous.cumulativeTotal : null
    }
  }

  const pointerDistance = () => {
    const points = [...activePointers.values()]
    if (points.length < 2) {
      return 0
    }
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  const pointerMidX = () => {
    const points = [...activePointers.values()]
    if (points.length < 2) {
      return points[0]?.x || 0
    }
    return (points[0].x + points[1].x) / 2
  }

  const restoreTouchAction = () => {
    host.style.touchAction = 'pan-y'
  }

  const onWheel = (event) => {
    if (!viewport || !domain) {
      return
    }
    event.preventDefault()
    const anchor = timeFromClientX(event.clientX, getPlotRect(), viewport)
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    viewport = zoomViewport(viewport, factor, anchor, domain)
    redrawFull()
  }

  const onPointerDown = (event) => {
    if (!viewport || !domain) {
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    host.setPointerCapture?.(event.pointerId)

    if (activePointers.size >= 2) {
      pointerMode = 'pinch'
      panCommitted = false
      lastPanX = null
      panStartX = null
      panStartY = null
      pinchStartDist = pointerDistance()
      pinchStartViewport = { ...viewport }
      host.style.touchAction = 'none'
      event.preventDefault()
      return
    }

    pointerMode = 'pan'
    panCommitted = event.pointerType === 'mouse'
    pointerMoved = false
    lastPanX = event.clientX
    panStartX = event.clientX
    panStartY = event.clientY
    if (panCommitted) {
      host.style.touchAction = 'none'
    }
    setCrosshairFromClientX(event.clientX)
    paintCrosshair()
  }

  const onPointerMove = (event) => {
    if (!viewport || !domain) {
      return
    }

    if (!activePointers.has(event.pointerId)) {
      if (event.pointerType === 'mouse' && !pointerMode) {
        setCrosshairFromClientX(event.clientX)
        paintCrosshair()
      }
      return
    }

    const previous = activePointers.get(event.pointerId)
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointerMode === 'pinch' && activePointers.size >= 2 && pinchStartDist && pinchStartViewport) {
      event.preventDefault()
      const dist = pointerDistance()
      if (dist > 0 && pinchStartDist > 0) {
        const factor = dist / pinchStartDist
        const anchor = timeFromClientX(pointerMidX(), getPlotRect(), pinchStartViewport)
        viewport = zoomViewport(pinchStartViewport, factor, anchor, domain)
        setCrosshairFromClientX(pointerMidX())
        redrawFull()
      }
      return
    }

    if (pointerMode !== 'pan' || activePointers.size !== 1) {
      return
    }

    const dx = event.clientX - (previous?.x ?? event.clientX)
    const dy = event.clientY - (previous?.y ?? event.clientY)
    const totalDx = event.clientX - (panStartX ?? event.clientX)
    const totalDy = event.clientY - (panStartY ?? event.clientY)

    if (!panCommitted) {
      if (
        event.pointerType !== 'mouse' &&
        Math.abs(totalDy) > 8 &&
        Math.abs(totalDy) > Math.abs(totalDx) * 1.2
      ) {
        host.releasePointerCapture?.(event.pointerId)
        activePointers.delete(event.pointerId)
        pointerMode = null
        lastPanX = null
        panStartX = null
        panStartY = null
        restoreTouchAction()
        return
      }
      if (Math.abs(totalDx) > 6) {
        panCommitted = true
        host.style.touchAction = 'none'
      } else {
        return
      }
    }

    event.preventDefault()
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      pointerMoved = true
    }
    const plotRect = getPlotRect()
    const span = viewport.xMax - viewport.xMin
    const deltaMs = plotRect.width > 0 ? (-dx / plotRect.width) * span : 0
    viewport = panViewport(viewport, deltaMs, domain)
    lastPanX = event.clientX
    setCrosshairFromClientX(event.clientX)
    redrawFull()
  }

  const onPointerUp = (event) => {
    const wasPanTap = pointerMode === 'pan' && !pointerMoved && activePointers.size <= 1
    activePointers.delete(event.pointerId)

    if (activePointers.size >= 2) {
      pointerMode = 'pinch'
      pinchStartDist = pointerDistance()
      pinchStartViewport = viewport ? { ...viewport } : null
      return
    }

    if (activePointers.size === 1 && pointerMode === 'pinch') {
      pointerMode = 'pan'
      panCommitted = false
      pointerMoved = false
      lastPanX = [...activePointers.values()][0].x
      pinchStartDist = null
      pinchStartViewport = null
      restoreTouchAction()
      return
    }

    if (activePointers.size === 0) {
      pointerMode = null
      lastPanX = null
      panStartX = null
      panStartY = null
      panCommitted = false
      pinchStartDist = null
      pinchStartViewport = null
      restoreTouchAction()

      if (wasPanTap) {
        const now = Date.now()
        if (now - lastTapAt < 320) {
          resetViewportFn()
          lastTapAt = 0
        } else {
          lastTapAt = now
        }
      }
      pointerMoved = false
    }
  }

  const onPointerLeave = () => {
    if (pointerMode || activePointers.size) {
      return
    }
    crosshair = null
    paintCrosshair()
  }

  const onKeyDown = (event) => {
    if (!viewport || !domain) {
      return
    }
    const span = viewport.xMax - viewport.xMin
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      viewport = zoomViewport(viewport, ZOOM_STEP, (viewport.xMin + viewport.xMax) / 2, domain)
      redrawFull()
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      viewport = zoomViewport(viewport, 1 / ZOOM_STEP, (viewport.xMin + viewport.xMax) / 2, domain)
      redrawFull()
    } else if (event.key === '0') {
      event.preventDefault()
      resetViewportFn()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      viewport = panViewport(viewport, -span * 0.15, domain)
      redrawFull()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      viewport = panViewport(viewport, span * 0.15, domain)
      redrawFull()
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
      redrawFull()
    } else if (action === 'zoom-out') {
      viewport = zoomViewport(viewport, 1 / ZOOM_STEP, (viewport.xMin + viewport.xMax) / 2, domain)
      redrawFull()
    } else if (action === 'reset') {
      resetViewportFn()
    } else if (action === 'fit-y') {
      fitY = !fitY
      button.setAttribute('aria-pressed', fitY ? 'true' : 'false')
      redrawFull()
    }
  }

  host.classList.add('chart-host')
  host.setAttribute('tabindex', '0')
  host.setAttribute('role', 'application')
  host.setAttribute(
    'aria-description',
    'Cumulative cash-flow chart. Use arrow keys to pan, plus and minus to zoom, zero to reset.'
  )
  restoreTouchAction()

  host.addEventListener('wheel', onWheel, { passive: false })
  host.addEventListener('pointerdown', onPointerDown)
  host.addEventListener('pointermove', onPointerMove)
  host.addEventListener('pointerup', onPointerUp)
  host.addEventListener('pointercancel', onPointerUp)
  host.addEventListener('pointerleave', onPointerLeave)
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
      redrawFull()
    })
    resizeObserver.observe(host)
  }

  measure()

  return {
    setSeries,
    resetViewport: resetViewportFn,
    getViewport: () => (viewport ? { ...viewport } : null),
    getFitY: () => fitY,
    destroy() {
      host.removeEventListener('wheel', onWheel)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerup', onPointerUp)
      host.removeEventListener('pointercancel', onPointerUp)
      host.removeEventListener('pointerleave', onPointerLeave)
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
