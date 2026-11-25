import { formatMoneyAmount } from './controller/money-format.js'
import {
  computeAdaptiveXTicks,
  computeNiceYTicks,
  estimateTextWidth,
  filterSeriesToViewport,
  isViewportFull,
  seriesTimeDomain,
  yExtentForSeries
} from './controller/chart-viewport.js'
import { buildListOutline } from './list-status.js'
import { bindDraggable, bindDropSurface, cancelActiveListDrag } from './list-dnd.js'

function buildConfiguredRows(
  oneTimeFlows,
  recurringFlows,
  instrumentBundles,
  isFlowIncluded,
  options = {}
) {
  const rows = []
  const sortByDate = options.sortByDate !== false

  for (const flow of oneTimeFlows) {
    rows.push({
      id: flow.id,
      type: 'one-time',
      label: flow.category || 'one-time',
      startOrDate: flow.date,
      endOrCount: '-',
      period: '-',
      direction: flow.direction,
      amount: flow.amount,
      category: flow.category || 'general',
      included: isFlowIncluded(flow.id)
    })
  }

  for (const flow of recurringFlows) {
    rows.push({
      id: flow.id,
      type: 'recurring',
      label: flow.category || 'recurring',
      startOrDate: flow.startDate,
      endOrCount: flow.endDate || (flow.occurrences ? `count: ${flow.occurrences}` : '-'),
      period: flow.period,
      direction: flow.direction,
      amount: flow.amount,
      category: flow.category || 'general',
      included: isFlowIncluded(flow.id)
    })
  }

  for (const bundle of instrumentBundles) {
    const generatedFlows = Array.isArray(bundle.generatedFlows) ? bundle.generatedFlows : []
    const firstDate = generatedFlows.length > 0 ? generatedFlows[0].date : '-'
    const lastDate = generatedFlows.length > 0 ? generatedFlows[generatedFlows.length - 1].date : '-'
    const totalAmount = generatedFlows.reduce((sum, flow) => {
      const signed = flow.direction === 'inflow' ? flow.amount : -flow.amount
      return sum + signed
    }, 0)

    rows.push({
      id: bundle.id,
      type: bundle.instrumentType,
      label: bundle.label || bundle.config?.label || bundle.instrumentType,
      startOrDate: firstDate,
      endOrCount: `${lastDate} (${generatedFlows.length} flows)`,
      period:
        bundle.instrumentType === 'salary'
          ? bundle.config?.scheduleMode || 'custom-monthly-working-day'
          : bundle.config?.period || '-',
      direction: generatedFlows[0]?.direction || '-',
      amount: totalAmount,
      category: generatedFlows[0]?.category || bundle.instrumentType,
      included: isFlowIncluded(bundle.id)
    })
  }

  if (sortByDate) {
    rows.sort((a, b) => String(a.startOrDate).localeCompare(String(b.startOrDate)))
  }

  return rows
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function bindRowActions(root, rowData, handlers) {
  const {
    onToggleInclude,
    onEditOneTime,
    onDeleteOneTime,
    onEditRecurring,
    onDeleteRecurring,
    onEditInstrument,
    onDeleteInstrument
  } = handlers

  root.querySelector('.action-toggle-include')?.addEventListener('click', () => {
    onToggleInclude(rowData.id, !rowData.included)
  })

  root.querySelector('.action-edit')?.addEventListener('click', () => {
    if (rowData.type === 'one-time') {
      onEditOneTime(rowData.id)
    } else if (rowData.type === 'recurring') {
      onEditRecurring(rowData.id)
    } else {
      onEditInstrument(rowData.id)
    }
  })

  root.querySelector('.action-delete')?.addEventListener('click', () => {
    if (rowData.type === 'one-time') {
      onDeleteOneTime(rowData.id)
    } else if (rowData.type === 'recurring') {
      onDeleteRecurring(rowData.id)
    } else {
      onDeleteInstrument(rowData.id)
    }
  })
}

function renderActionButtons(rowData) {
  return `
    <div class="row-actions">
      <button
        class="icon-button action-toggle-include ${rowData.included ? 'is-active' : ''}"
        data-id="${rowData.id}"
        data-type="${rowData.type}"
        type="button"
        aria-label="${rowData.included ? 'Exclude from cumulative summary' : 'Include in cumulative summary'}"
        title="${rowData.included ? 'Exclude from cumulative summary' : 'Include in cumulative summary'}"
      >${renderActionIcon('include', rowData.included)}</button>
      <button
        class="icon-button action-edit"
        data-id="${rowData.id}"
        data-type="${rowData.type}"
        type="button"
        aria-label="Edit cash flow"
        title="Edit cash flow"
      >${renderActionIcon('edit')}</button>
      <button
        class="icon-button danger action-delete"
        data-id="${rowData.id}"
        data-type="${rowData.type}"
        type="button"
        aria-label="Delete cash flow"
        title="Delete cash flow"
      >${renderActionIcon('delete')}</button>
    </div>
  `
}

function formatSignedAmount(amount, direction) {
  const absolute = formatMoneyAmount(Math.abs(Number(amount) || 0))
  if (direction === 'outflow' || (typeof amount === 'number' && amount < 0)) {
    return `−${absolute}`
  }

  if (direction === 'inflow') {
    return `+${absolute}`
  }

  return absolute
}

function formatDateSummary(rowData) {
  if (rowData.endOrCount && rowData.endOrCount !== '-') {
    return `${rowData.startOrDate} → ${rowData.endOrCount}`
  }

  return String(rowData.startOrDate || '—')
}

function resolveOutline(options) {
  if (Array.isArray(options.outline)) {
    return options.outline
  }

  const {
    oneTimeFlows,
    recurringFlows,
    instrumentBundles,
    isFlowIncluded,
    listStatus
  } = options

  const rows = buildConfiguredRows(
    oneTimeFlows,
    recurringFlows,
    instrumentBundles,
    isFlowIncluded,
    { sortByDate: !listStatus || !listStatus.rootOrder?.length }
  )

  if (!listStatus) {
    return rows.map((row) => ({ type: 'item', row }))
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]))
  return buildListOutline(listStatus, rowsById)
}

function bindFolderActions(root, folder, handlers) {
  root.querySelector('.action-toggle-folder')?.addEventListener('click', () => {
    handlers.onToggleFolder?.(folder.id, !folder.collapsed)
  })

  root.querySelector('.action-rename-folder')?.addEventListener('click', () => {
    const nextName = window.prompt('Folder name', folder.name)
    if (nextName === null) {
      return
    }
    handlers.onRenameFolder?.(folder.id, nextName)
  })

  root.querySelector('.action-delete-folder')?.addEventListener('click', () => {
    if (!window.confirm(`Delete folder “${folder.name}”? Items move back to the root list.`)) {
      return
    }
    handlers.onDeleteFolder?.(folder.id)
  })
}

function appendItemTableRow(tbody, rowData, handlers, dnd, meta = {}) {
  const row = document.createElement('tr')
  row.className = meta.nested ? 'flow-item-row is-nested' : 'flow-item-row'
  row.dataset.id = rowData.id
  row.dataset.itemId = rowData.id
  if (meta.folderId) {
    row.dataset.folderId = meta.folderId
    row.dataset.dropTarget = 'folder-item'
    row.dataset.dropIndex = String(meta.index ?? 0)
  } else {
    row.dataset.dropTarget = 'root'
    row.dataset.dropIndex = String(meta.index ?? 0)
  }

  row.innerHTML = `
      <td>${escapeHtml(rowData.type)}</td>
      <td>${escapeHtml(rowData.startOrDate)}</td>
      <td>${escapeHtml(rowData.endOrCount)}</td>
      <td>${escapeHtml(rowData.period)}</td>
      <td>${escapeHtml(rowData.direction)}</td>
      <td>${formatMoneyAmount(rowData.amount)}</td>
      <td>${escapeHtml(rowData.category)}</td>
      <td class="action-col">
        ${renderActionButtons(rowData)}
      </td>
    `

  bindRowActions(row, rowData, handlers)
  if (dnd?.enabled) {
    bindDraggable(row, { kind: 'item', id: rowData.id }, dnd.onDrop, dnd.root)
  }
  tbody.appendChild(row)
}

function appendFolderTableRows(tbody, folderEntry, handlers, dnd, rootIndex) {
  const { folder, items } = folderEntry
  const header = document.createElement('tr')
  header.className = `flow-folder-row ${folder.collapsed ? 'is-collapsed' : 'is-expanded'}`
  header.dataset.folderId = folder.id
  header.dataset.dropTarget = 'folder'
  header.dataset.dropIndex = String(items.length)
  header.dataset.rootIndex = String(rootIndex)

  const editBlock = folder.collapsed
    ? ''
    : `
      <div class="folder-edit-row">
        <button class="icon-button action-rename-folder" type="button" aria-label="Rename folder" title="Rename folder">${renderActionIcon('edit')}</button>
        <button class="icon-button danger action-delete-folder" type="button" aria-label="Delete folder" title="Delete folder">${renderActionIcon('delete')}</button>
      </div>
    `

  header.innerHTML = `
    <td colspan="8">
      <div class="folder-header">
        <button class="folder-toggle action-toggle-folder" type="button" aria-expanded="${folder.collapsed ? 'false' : 'true'}" aria-label="${folder.collapsed ? 'Expand folder' : 'Collapse folder'}">
          <span class="folder-chevron" aria-hidden="true">${folder.collapsed ? '▶' : '▼'}</span>
          <span class="folder-name">${escapeHtml(folder.name)}</span>
        </button>
        ${editBlock}
      </div>
    </td>
  `

  bindFolderActions(header, folder, handlers)
  const folderHeader = header.querySelector('.folder-header')
  if (dnd?.enabled && folderHeader) {
    bindDraggable(folderHeader, { kind: 'folder', id: folder.id }, dnd.onDrop, dnd.root)
  }
  tbody.appendChild(header)

  if (!folder.collapsed) {
    items.forEach((rowData, index) => {
      appendItemTableRow(tbody, rowData, handlers, dnd, {
        nested: true,
        folderId: folder.id,
        index
      })
    })
  }
}

function renderConfiguredTable(options) {
  const { tableBody: tbody, outline, handlers, dnd } = options
  if (!tbody) {
    return
  }

  tbody.innerHTML = ''

  if (!outline.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.colSpan = 8
    cell.textContent = 'No cash flows configured yet.'
    row.appendChild(cell)
    tbody.appendChild(row)
    return
  }

  outline.forEach((entry, rootIndex) => {
    if (entry.type === 'folder') {
      appendFolderTableRows(tbody, entry, handlers, dnd, rootIndex)
      return
    }

    appendItemTableRow(tbody, entry.row, handlers, dnd, { index: rootIndex })
  })
}

function appendItemCard(container, rowData, handlers, dnd, meta = {}) {
  const card = document.createElement('article')
  card.className = meta.nested ? 'flow-card is-nested' : 'flow-card'
  card.dataset.id = rowData.id
  card.dataset.type = rowData.type
  card.dataset.itemId = rowData.id
  if (meta.folderId) {
    card.dataset.folderId = meta.folderId
    card.dataset.dropTarget = 'folder-item'
    card.dataset.dropIndex = String(meta.index ?? 0)
  } else {
    card.dataset.dropTarget = 'root'
    card.dataset.dropIndex = String(meta.index ?? 0)
  }

  const amountClass =
    rowData.direction === 'outflow' || Number(rowData.amount) < 0 ? 'is-outflow' : 'is-inflow'

  card.innerHTML = `
      <div class="flow-card-top">
        <div class="flow-card-heading">
          <span class="flow-card-type">${escapeHtml(rowData.type)}</span>
          <h4 class="flow-card-title">${escapeHtml(rowData.label)}</h4>
        </div>
        <p class="flow-card-amount ${amountClass}">${formatSignedAmount(rowData.amount, rowData.direction)}</p>
      </div>
      <p class="flow-card-meta">${escapeHtml(formatDateSummary(rowData))}</p>
      <div class="flow-card-actions">
        ${renderActionButtons(rowData)}
      </div>
    `

  bindRowActions(card, rowData, handlers)
  if (dnd?.enabled) {
    bindDraggable(card, { kind: 'item', id: rowData.id }, dnd.onDrop, dnd.root)
  }
  container.appendChild(card)
}

function appendFolderCard(container, folderEntry, handlers, dnd, rootIndex) {
  const { folder, items } = folderEntry
  const block = document.createElement('section')
  block.className = `flow-folder-card ${folder.collapsed ? 'is-collapsed' : 'is-expanded'}`
  block.dataset.folderId = folder.id
  block.dataset.dropTarget = 'folder'
  block.dataset.dropIndex = String(items.length)
  block.dataset.rootIndex = String(rootIndex)

  const editBlock = folder.collapsed
    ? ''
    : `
      <div class="folder-edit-row">
        <button class="icon-button action-rename-folder" type="button" aria-label="Rename folder" title="Rename folder">${renderActionIcon('edit')}</button>
        <button class="icon-button danger action-delete-folder" type="button" aria-label="Delete folder" title="Delete folder">${renderActionIcon('delete')}</button>
      </div>
    `

  block.innerHTML = `
    <div class="folder-header">
      <button class="folder-toggle action-toggle-folder" type="button" aria-expanded="${folder.collapsed ? 'false' : 'true'}" aria-label="${folder.collapsed ? 'Expand folder' : 'Collapse folder'}">
        <span class="folder-chevron" aria-hidden="true">${folder.collapsed ? '▶' : '▼'}</span>
        <span class="folder-name">${escapeHtml(folder.name)}</span>
      </button>
      ${editBlock}
    </div>
    <div class="folder-children"></div>
  `

  bindFolderActions(block, folder, handlers)
  const header = block.querySelector('.folder-header')
  if (dnd?.enabled && header) {
    // Bind the header only — nesting draggable on the section breaks child card drags
    // and can leave ghost clones stranded after release.
    bindDraggable(header, { kind: 'folder', id: folder.id }, dnd.onDrop, dnd.root)
  }

  const children = block.querySelector('.folder-children')
  if (!folder.collapsed) {
    items.forEach((rowData, index) => {
      appendItemCard(children, rowData, handlers, dnd, {
        nested: true,
        folderId: folder.id,
        index
      })
    })
  }

  container.appendChild(block)
}

function renderConfiguredCards(options) {
  const { cardsContainer: container, outline, handlers, dnd } = options
  if (!container) {
    return
  }

  container.innerHTML = ''

  if (!outline.length) {
    const empty = document.createElement('div')
    empty.className = 'flow-card-empty'
    empty.textContent = 'No cash flows configured yet.'
    container.appendChild(empty)
    return
  }

  outline.forEach((entry, rootIndex) => {
    if (entry.type === 'folder') {
      appendFolderCard(container, entry, handlers, dnd, rootIndex)
      return
    }

    appendItemCard(container, entry.row, handlers, dnd, { index: rootIndex })
  })
}

function renderConfiguredLists(options) {
  const {
    oneTimeFlows,
    recurringFlows,
    instrumentBundles,
    tableBody,
    cardsContainer,
    isFlowIncluded,
    listStatus,
    outline: providedOutline,
    onToggleInclude,
    onEditOneTime,
    onDeleteOneTime,
    onEditRecurring,
    onDeleteRecurring,
    onEditInstrument,
    onDeleteInstrument,
    onToggleFolder,
    onRenameFolder,
    onDeleteFolder,
    onListDrop
  } = options

  const handlers = {
    onToggleInclude,
    onEditOneTime,
    onDeleteOneTime,
    onEditRecurring,
    onDeleteRecurring,
    onEditInstrument,
    onDeleteInstrument,
    onToggleFolder,
    onRenameFolder,
    onDeleteFolder
  }

  const outline =
    providedOutline ||
    resolveOutline({
      oneTimeFlows,
      recurringFlows,
      instrumentBundles,
      isFlowIncluded,
      listStatus
    })

  const dndRoot =
    cardsContainer?.closest('#configured-section') ||
    tableBody?.closest('#configured-section') ||
    cardsContainer?.parentElement ||
    tableBody?.parentElement
  const dnd = {
    enabled: typeof onListDrop === 'function',
    onDrop: onListDrop,
    root: dndRoot
  }

  // Drop handlers re-render this list; purge any prior ghost/dragging state first.
  cancelActiveListDrag(dndRoot)

  if (dnd.enabled && dndRoot) {
    bindDropSurface(dndRoot, onListDrop)
  }

  renderConfiguredTable({ tableBody, outline, handlers, dnd })
  renderConfiguredCards({ cardsContainer, outline, handlers, dnd })
}

function renderActionIcon(type, included = false) {
  if (type === 'edit') {
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 11.5 3.4 9.1 10.9 1.6a1.5 1.5 0 0 1 2.1 0l1.4 1.4a1.5 1.5 0 0 1 0 2.1L6.9 12.6 4.5 13z" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.8 2.7 13.3 6.2" stroke-width="1.4" stroke-linecap="round"/></svg>'
  }

  if (type === 'delete') {
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4h11" stroke-width="1.4" stroke-linecap="round"/><path d="M6 1.8h4" stroke-width="1.4" stroke-linecap="round"/><path d="M4 4l.7 9.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8L12 4" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 6.4v5" stroke-width="1.4" stroke-linecap="round"/><path d="M9.5 6.4v5" stroke-width="1.4" stroke-linecap="round"/></svg>'
  }

  if (included) {
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.4 8s2.4-4.4 6.6-4.4S14.6 8 14.6 8s-2.4 4.4-6.6 4.4S1.4 8 1.4 8Z" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" stroke-width="1.4"/></svg>'
  }

  return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.4 8s2.4-4.4 6.6-4.4S14.6 8 14.6 8s-2.4 4.4-6.6 4.4S1.4 8 1.4 8Z" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" stroke-width="1.4"/><path d="M2.2 13.8 13.8 2.2" stroke-width="1.4" stroke-linecap="round"/></svg>'
}

function formatAxisAmount(value) {
  return formatMoneyAmount(value, { fractionDigits: 2 })
}

function formatDateLabel(isoDate, { compact = false } = {}) {
  const [year, month, day] = isoDate.split('-').map((value) => Number(value))
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (compact) {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: '2-digit',
      timeZone: 'UTC'
    }).format(parsed)
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC'
  }).format(parsed)
}

function formatTimestampLabel(timestamp, { compact = false } = {}) {
  return formatDateLabel(new Date(timestamp).toISOString().slice(0, 10), { compact })
}

function downsampleSeriesForChart(series, maxPoints = 900) {
  if (series.length <= maxPoints || maxPoints < 2) {
    return series
  }

  const sampled = []
  const step = Math.ceil((series.length - 1) / (maxPoints - 1))
  for (let index = 0; index < series.length; index += step) {
    sampled.push(series[index])
  }

  const last = series[series.length - 1]
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last)
  }

  return sampled
}

function buildHoldPath(series, xScale, yScale) {
  if (!series.length) {
    return ''
  }

  const first = series[0]
  let path = `M ${xScale(new Date(first.date).getTime())} ${yScale(first.cumulativeTotal)}`

  for (let index = 1; index < series.length; index += 1) {
    const current = series[index]
    const currentX = xScale(new Date(current.date).getTime())
    const currentY = yScale(current.cumulativeTotal)

    path += ` H ${currentX} V ${currentY}`
  }

  return path
}

function buildHoldAreaPath(series, xScale, yScale, baselineY, xMin, xMax) {
  if (!series.length) {
    return ''
  }
  const line = buildHoldPath(series, xScale, yScale)
  const last = series[series.length - 1]
  const lastX = xScale(Math.min(xMax, new Date(last.date).getTime()))
  const firstX = xScale(Math.max(xMin, new Date(series[0].date).getTime()))
  return `${line} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`
}

function updateChartCrosshair(container, crosshair, layout) {
  if (!container || !container.querySelector) {
    return
  }
  const lineX = container.querySelector('.chart-crosshair-x')
  const lineY = container.querySelector('.chart-crosshair-y')
  const point = container.querySelector('.chart-crosshair-point')
  const tooltip = container.querySelector('.chart-tooltip')
  if (!lineX || !lineY || !point || !tooltip || !layout) {
    return
  }

  if (!crosshair || !crosshair.date) {
    lineX.setAttribute('visibility', 'hidden')
    lineY.setAttribute('visibility', 'hidden')
    point.setAttribute('visibility', 'hidden')
    tooltip.hidden = true
    tooltip.textContent = ''
    return
  }

  const cx =
    layout.maxTime === layout.minTime
      ? layout.leftPad + layout.plotWidth / 2
      : layout.leftPad +
        ((new Date(crosshair.date).getTime() - layout.minTime) /
          (layout.maxTime - layout.minTime)) *
          layout.plotWidth
  const cy =
    layout.yMax === layout.yMin
      ? layout.topPad + layout.plotHeight / 2
      : layout.topPad +
        ((layout.yMax - crosshair.cumulativeTotal) / (layout.yMax - layout.yMin)) *
          layout.plotHeight

  lineX.setAttribute('x1', String(cx))
  lineX.setAttribute('x2', String(cx))
  lineX.setAttribute('y1', String(layout.topPad))
  lineX.setAttribute('y2', String(layout.plotBottom))
  lineX.setAttribute('visibility', 'visible')

  lineY.setAttribute('x1', String(layout.leftPad))
  lineY.setAttribute('x2', String(layout.plotRight))
  lineY.setAttribute('y1', String(cy))
  lineY.setAttribute('y2', String(cy))
  lineY.setAttribute('visibility', 'visible')

  point.setAttribute('cx', String(cx))
  point.setAttribute('cy', String(cy))
  point.setAttribute('visibility', 'visible')

  const delta =
    crosshair.dayDelta !== null && crosshair.dayDelta !== undefined
      ? ` · day ${formatAxisAmount(crosshair.dayDelta)}`
      : ''
  tooltip.hidden = false
  tooltip.style.left = `${Math.min(layout.width - 12, Math.max(12, cx))}px`
  tooltip.style.top = `${Math.max(8, cy - 36)}px`
  tooltip.textContent = `${formatDateLabel(crosshair.date)} · ${formatAxisAmount(crosshair.cumulativeTotal)}${delta}`
}

function readChartThemeColors(root = globalThis.document?.documentElement) {
  const fallbacks = {
    grid: '#dce4ee',
    axis: '#b0bdce',
    muted: '#5a6a7d',
    series: '#2563eb',
    seriesFill: 'rgba(37, 99, 235, 0.12)',
    crosshair: '#94a3b8',
    zero: '#a8b4c4',
    zeroWarn: '#c0392b',
    pointStroke: '#ffffff'
  }
  if (!root || typeof globalThis.getComputedStyle !== 'function') {
    return fallbacks
  }
  try {
    const styles = globalThis.getComputedStyle(root)
    const read = (name, fallback) => {
      const value = styles.getPropertyValue(name).trim()
      return value || fallback
    }
    return {
      grid: read('--chart-grid', fallbacks.grid),
      axis: read('--chart-axis', fallbacks.axis),
      muted: read('--chart-muted', fallbacks.muted),
      series: read('--chart-series', fallbacks.series),
      seriesFill: read('--chart-series-fill', fallbacks.seriesFill),
      crosshair: read('--chart-crosshair', fallbacks.crosshair),
      zero: read('--chart-zero', fallbacks.zero),
      zeroWarn: read('--chart-zero-warn', fallbacks.zeroWarn),
      pointStroke: read('--chart-point-stroke', fallbacks.pointStroke)
    }
  } catch {
    return fallbacks
  }
}

function renderChart(series, container, options = {}) {
  const startDate = options.startDate
  const endDate = options.endDate
  const theme = options.themeColors || readChartThemeColors()

  if (!series.length) {
    const rangeMessage = startDate && endDate ? `${startDate} to ${endDate}` : 'the selected date range'
    const message = `No cash flows in ${rangeMessage}. Cumulative total remains ${formatAxisAmount(0)}.`
    // Constant HTML shell only; put dynamic text via textContent (CodeQL js/xss-through-dom).
    container.innerHTML = '<div class="empty"></div>'
    container.querySelector('.empty').textContent = message
    return null
  }

  const domain = options.domain || seriesTimeDomain(series)
  const viewport = options.viewport
    ? options.viewport
    : domain
      ? { ...domain }
      : { xMin: 0, xMax: 1 }
  // Filter to the visible window first, then downsample so zoomed views stay dense.
  const visibleRaw = filterSeriesToViewport(series, viewport)
  const sampledVisible = downsampleSeriesForChart(visibleRaw)
  const fitY = options.fitY !== false
  const width = Math.max(280, Math.floor(options.width || 880))
  const height = Math.max(200, Math.floor(options.height || 300))
  const rightPad = 20
  const topPad = 28
  const bottomPad = 40
  const plotRight = width - rightPad

  const { minTotal, maxTotal } = yExtentForSeries(series, fitY, viewport)
  const yTickValues = computeNiceYTicks(minTotal, maxTotal, 5)
  const yLabelWidths = yTickValues.map((value) => estimateTextWidth(formatAxisAmount(value), 11))
  const leftPad = Math.max(72, Math.min(128, Math.max(...yLabelWidths, 0) + 16))
  const plotWidth = Math.max(40, plotRight - leftPad)
  const plotBottom = height - bottomPad
  const plotHeight = Math.max(40, plotBottom - topPad)

  const minTime = viewport.xMin
  const maxTime = viewport.xMax
  const yMin = Math.min(minTotal, ...yTickValues)
  const yMax = Math.max(maxTotal, ...yTickValues)

  const xScale = (value) => {
    if (maxTime === minTime) {
      return leftPad + plotWidth / 2
    }
    return leftPad + ((value - minTime) / (maxTime - minTime)) * plotWidth
  }

  const yScale = (value) => {
    if (yMax === yMin) {
      return topPad + plotHeight / 2
    }
    return topPad + ((yMax - value) / (yMax - yMin)) * plotHeight
  }

  const plotSeries = []
  if (sampledVisible.length) {
    const first = sampledVisible[0]
    plotSeries.push({
      date: new Date(Math.max(minTime, new Date(first.date).getTime())).toISOString().slice(0, 10),
      cumulativeTotal: first.cumulativeTotal
    })
    for (let index = 1; index < sampledVisible.length; index += 1) {
      plotSeries.push(sampledVisible[index])
    }
    const last = sampledVisible[sampledVisible.length - 1]
    const lastTime = new Date(last.date).getTime()
    if (lastTime < maxTime) {
      plotSeries.push({
        date: new Date(maxTime).toISOString().slice(0, 10),
        cumulativeTotal: last.cumulativeTotal
      })
    }
  }

  const holdPath = buildHoldPath(plotSeries, xScale, yScale)
  const zeroY = yScale(0)
  const areaPath = buildHoldAreaPath(plotSeries, xScale, yScale, zeroY, minTime, maxTime)

  const yTickMarkup = yTickValues
    .map((value) => {
      const y = yScale(value)
      return `
      <line class="grid-line" x1="${leftPad}" y1="${y}" x2="${plotRight}" y2="${y}" stroke="${theme.grid}" stroke-width="1" />
      <text class="y-tick-label" x="${leftPad - 10}" y="${y + 4}" text-anchor="end" fill="${theme.muted}" font-size="11">${formatAxisAmount(value)}</text>
    `
    })
    .join('')

  const compactX = width < 520
  const xTickTimes = computeAdaptiveXTicks(minTime, maxTime, plotWidth)
  const xTickMarkup = xTickTimes
    .map((time, index) => {
      const x = xScale(time)
      const isEnd = index === 0 || index === xTickTimes.length - 1
      const anchor = index === 0 ? 'start' : index === xTickTimes.length - 1 ? 'end' : 'middle'
      const label = formatTimestampLabel(time, { compact: compactX && !isEnd })
      return `<text class="x-tick-label" x="${x}" y="${height - 12}" text-anchor="${anchor}" fill="${theme.muted}" font-size="12">${label}</text>`
    })
    .join('')

  const hasZeroCrossing = minTotal < 0 && maxTotal > 0
  const zeroAxisColor = hasZeroCrossing ? theme.zeroWarn : theme.zero
  const showSamplingInSvg =
    options.showSamplingNote !== false &&
    sampledVisible.length < visibleRaw.length &&
    isViewportFull(viewport, domain)
  const samplingNote = showSamplingInSvg
    ? `<text class="chart-sampling-note" x="${plotRight}" y="18" text-anchor="end" fill="${theme.muted}" font-size="11">Showing ${sampledVisible.length.toLocaleString()} of ${visibleRaw.length.toLocaleString()} points</text>`
    : ''

  const ariaRange = `${formatTimestampLabel(minTime)} to ${formatTimestampLabel(maxTime)}`
  const clipId = `chart-plot-clip-${width}x${height}`
  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="presentation" aria-hidden="true">
      <defs>
        <clipPath id="${clipId}">
          <rect x="${leftPad}" y="${topPad}" width="${plotWidth}" height="${plotHeight}" />
        </clipPath>
      </defs>
      <text class="chart-title" x="${leftPad}" y="18" fill="${theme.muted}" font-size="12">Cumulative total amount</text>
      ${samplingNote}
      ${yTickMarkup}
      <line x1="${leftPad}" y1="${topPad}" x2="${leftPad}" y2="${plotBottom}" stroke="${theme.axis}" stroke-width="1" />
      <line x1="${leftPad}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="${theme.axis}" stroke-width="1" />
      <g data-chart-plot="true" clip-path="url(#${clipId})">
        <rect class="chart-plot-hit" x="${leftPad}" y="${topPad}" width="${plotWidth}" height="${plotHeight}" fill="transparent" />
        <path class="series-area" d="${areaPath}" fill="${theme.seriesFill}" stroke="none" />
        <line class="zero-axis" x1="${leftPad}" y1="${zeroY}" x2="${plotRight}" y2="${zeroY}" stroke="${zeroAxisColor}" stroke-width="1.5" />
        <path class="series-line" d="${holdPath}" fill="none" stroke="${theme.series}" stroke-width="2.5" stroke-linejoin="round" />
        <line class="chart-crosshair-x" x1="${leftPad}" y1="${topPad}" x2="${leftPad}" y2="${plotBottom}" stroke="${theme.crosshair}" stroke-width="1" stroke-dasharray="4 3" visibility="hidden" />
        <line class="chart-crosshair-y" x1="${leftPad}" y1="${topPad}" x2="${plotRight}" y2="${topPad}" stroke="${theme.crosshair}" stroke-width="1" stroke-dasharray="4 3" visibility="hidden" />
        <circle class="chart-crosshair-point" cx="${leftPad}" cy="${topPad}" r="4.5" fill="${theme.series}" stroke="${theme.pointStroke}" stroke-width="2" visibility="hidden" />
      </g>
      ${xTickMarkup}
    </svg>
    <div class="chart-tooltip" hidden></div>
  `
  if (container.setAttribute) {
    container.setAttribute(
      'aria-label',
      `Cumulative cash-flow chart, visible range ${ariaRange}`
    )
  }

  const layout = {
    leftPad,
    plotRight,
    topPad,
    plotBottom,
    plotWidth,
    plotHeight,
    width,
    height,
    minTime,
    maxTime,
    yMin,
    yMax
  }

  if (options.crosshair) {
    updateChartCrosshair(container, options.crosshair, layout)
  }

  return layout
}

export {
  buildConfiguredRows,
  renderConfiguredTable,
  renderConfiguredCards,
  renderConfiguredLists,
  renderChart,
  readChartThemeColors,
  updateChartCrosshair,
  downsampleSeriesForChart,
  formatAxisAmount,
  formatDateLabel,
  formatSignedAmount,
  buildHoldPath,
  buildHoldAreaPath
}
