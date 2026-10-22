import { formatMoneyAmount } from './controller/money-format.js'
import { buildListOutline } from './list-status.js'
import { bindDraggable, bindDropSurface } from './list-dnd.js'

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
  if (dnd?.enabled) {
    bindDraggable(header, { kind: 'folder', id: folder.id }, dnd.onDrop, dnd.root)
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
  if (dnd?.enabled) {
    bindDraggable(block, { kind: 'folder', id: folder.id }, dnd.onDrop, dnd.root)
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

  const dndRoot = cardsContainer?.parentElement || tableBody?.parentElement
  const dnd = {
    enabled: typeof onListDrop === 'function',
    onDrop: onListDrop,
    root: dndRoot
  }

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

function formatDateLabel(isoDate) {
  const [year, month, day] = isoDate.split('-').map((value) => Number(value))
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC'
  }).format(parsed)
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

function renderChart(series, container, options = {}) {
  const startDate = options.startDate
  const endDate = options.endDate

  if (!series.length) {
    const rangeMessage = startDate && endDate ? `${startDate} to ${endDate}` : 'the selected date range'
    container.innerHTML = `<div class="empty">No cash flows in ${rangeMessage}. Cumulative total remains ${formatAxisAmount(0)}.</div>`
    return
  }

  const sampledSeries = downsampleSeriesForChart(series)
  const width = 880
  const height = 300
  const leftPad = 82
  const rightPad = 24
  const topPad = 24
  const bottomPad = 36
  const yTickCount = 5

  const timestamps = sampledSeries.map((point) => new Date(point.date).getTime())
  const totals = sampledSeries.map((point) => point.cumulativeTotal)

  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const minTotal = Math.min(0, ...totals)
  const maxTotal = Math.max(0, ...totals)

  const xScale = (value) => {
    if (maxTime === minTime) {
      return (leftPad + (width - rightPad)) / 2
    }
    return leftPad + ((value - minTime) / (maxTime - minTime)) * (width - leftPad - rightPad)
  }

  const yScale = (value) => {
    if (maxTotal === minTotal) {
      return (topPad + (height - bottomPad)) / 2
    }
    return topPad + ((maxTotal - value) / (maxTotal - minTotal)) * (height - topPad - bottomPad)
  }

  const holdPath = buildHoldPath(sampledSeries, xScale, yScale)

  const yTicks = Array.from({ length: yTickCount }, (_, index) => {
    const ratio = yTickCount === 1 ? 0 : index / (yTickCount - 1)
    const value = maxTotal - (maxTotal - minTotal) * ratio
    return {
      y: yScale(value),
      value
    }
  })

  const yTickMarkup = yTicks
    .map(
      (tick) => `
      <line class="grid-line" x1="${leftPad}" y1="${tick.y}" x2="${width - rightPad}" y2="${tick.y}" stroke="#dce4ee" stroke-width="1" />
      <text class="y-tick-label" x="${leftPad - 10}" y="${tick.y + 4}" text-anchor="end" fill="#5a6a7d" font-size="11">${formatAxisAmount(tick.value)}</text>
    `
    )
    .join('')

  const zeroY = yScale(0)
  const hasZeroCrossing = minTotal < 0 && maxTotal > 0
  const zeroAxisColor = hasZeroCrossing ? '#c0392b' : '#a8b4c4'
  const startLabel = formatDateLabel(sampledSeries[0].date)
  const endLabel = formatDateLabel(sampledSeries[sampledSeries.length - 1].date)
  const samplingNote =
    sampledSeries.length < series.length
      ? `<text x="${width - rightPad}" y="18" text-anchor="end" fill="#5a6a7d" font-size="11">Showing ${sampledSeries.length.toLocaleString()} of ${series.length.toLocaleString()} points</text>`
      : ''

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative cash-flow chart">
      ${yTickMarkup}
      <line x1="${leftPad}" y1="${topPad}" x2="${leftPad}" y2="${height - bottomPad}" stroke="#b0bdce" stroke-width="1" />
      <line x1="${leftPad}" y1="${height - bottomPad}" x2="${width - rightPad}" y2="${height - bottomPad}" stroke="#b0bdce" stroke-width="1" />
      <line class="zero-axis" x1="${leftPad}" y1="${zeroY}" x2="${width - rightPad}" y2="${zeroY}" stroke="${zeroAxisColor}" stroke-width="1.5" />
      <path class="series-line" d="${holdPath}" fill="none" stroke="#2563eb" stroke-width="3" />
      <text x="${leftPad}" y="18" fill="#5a6a7d" font-size="12">Cumulative total amount</text>
      ${samplingNote}
      <text x="${leftPad}" y="${height - 10}" fill="#5a6a7d" font-size="12">${startLabel}</text>
      <text x="${width - rightPad}" y="${height - 10}" text-anchor="end" fill="#5a6a7d" font-size="12">${endLabel}</text>
    </svg>
  `
}

export {
  buildConfiguredRows,
  renderConfiguredTable,
  renderConfiguredCards,
  renderConfiguredLists,
  renderChart,
  downsampleSeriesForChart,
  formatAxisAmount,
  formatSignedAmount
}
