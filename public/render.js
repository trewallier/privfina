function renderConfiguredTable(
  oneTimeFlows,
  recurringFlows,
  instrumentBundles,
  tbody,
  isFlowIncluded,
  onToggleInclude,
  onEditOneTime,
  onDeleteOneTime,
  onEditRecurring,
  onDeleteRecurring,
  onEditInstrument,
  onDeleteInstrument
) {
  tbody.innerHTML = ''
  const rows = []

  for (const flow of oneTimeFlows) {
    rows.push({
      id: flow.id,
      type: 'one-time',
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
      type: `instrument:${bundle.instrumentType}`,
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

  rows.sort((a, b) => a.startOrDate.localeCompare(b.startOrDate))

  if (!rows.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.colSpan = 8
    cell.textContent = 'No cash flows configured yet.'
    row.appendChild(cell)
    tbody.appendChild(row)
    return
  }

  for (const rowData of rows) {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${rowData.type}</td>
      <td>${rowData.startOrDate}</td>
      <td>${rowData.endOrCount}</td>
      <td>${rowData.period}</td>
      <td>${rowData.direction}</td>
      <td>${rowData.amount.toFixed(2)}</td>
      <td>${rowData.category}</td>
      <td class="action-col">
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
      </td>
    `

    row.querySelector('.action-toggle-include')?.addEventListener('click', () => {
      onToggleInclude(rowData.id, !rowData.included)
    })

    row.querySelector('.action-edit')?.addEventListener('click', () => {
      if (rowData.type === 'one-time') {
        onEditOneTime(rowData.id)
      } else if (rowData.type === 'recurring') {
        onEditRecurring(rowData.id)
      } else {
        onEditInstrument(rowData.id)
      }
    })

    row.querySelector('.action-delete')?.addEventListener('click', () => {
      if (rowData.type === 'one-time') {
        onDeleteOneTime(rowData.id)
      } else if (rowData.type === 'recurring') {
        onDeleteRecurring(rowData.id)
      } else {
        onDeleteInstrument(rowData.id)
      }
    })

    tbody.appendChild(row)
  }
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
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
  return formatter.format(value)
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
    const previous = series[index - 1]
    const current = series[index]
    const currentX = xScale(new Date(current.date).getTime())
    const previousY = yScale(previous.cumulativeTotal)
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
      <line class="grid-line" x1="${leftPad}" y1="${tick.y}" x2="${width - rightPad}" y2="${tick.y}" stroke="#e6e0d6" stroke-width="1" />
      <text class="y-tick-label" x="${leftPad - 10}" y="${tick.y + 4}" text-anchor="end" fill="#6f6558" font-size="11">${formatAxisAmount(tick.value)}</text>
    `
    )
    .join('')

  const zeroY = yScale(0)
  const hasZeroCrossing = minTotal < 0 && maxTotal > 0
  const zeroAxisColor = hasZeroCrossing ? '#c0392b' : '#bcb1a3'
  const startLabel = formatDateLabel(sampledSeries[0].date)
  const endLabel = formatDateLabel(sampledSeries[sampledSeries.length - 1].date)
  const samplingNote =
    sampledSeries.length < series.length
      ? `<text x="${width - rightPad}" y="18" text-anchor="end" fill="#6f6558" font-size="11">Showing ${sampledSeries.length.toLocaleString()} of ${series.length.toLocaleString()} points</text>`
      : ''

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative cash-flow chart">
      ${yTickMarkup}
      <line x1="${leftPad}" y1="${topPad}" x2="${leftPad}" y2="${height - bottomPad}" stroke="#c9bfae" stroke-width="1" />
      <line x1="${leftPad}" y1="${height - bottomPad}" x2="${width - rightPad}" y2="${height - bottomPad}" stroke="#c9bfae" stroke-width="1" />
      <line class="zero-axis" x1="${leftPad}" y1="${zeroY}" x2="${width - rightPad}" y2="${zeroY}" stroke="${zeroAxisColor}" stroke-width="1.5" />
      <path class="series-line" d="${holdPath}" fill="none" stroke="#0f766e" stroke-width="3" />
      <text x="${leftPad}" y="18" fill="#6f6558" font-size="12">Cumulative total amount</text>
      ${samplingNote}
      <text x="${leftPad}" y="${height - 10}" fill="#6f6558" font-size="12">${startLabel}</text>
      <text x="${width - rightPad}" y="${height - 10}" text-anchor="end" fill="#6f6558" font-size="12">${endLabel}</text>
    </svg>
  `
}

export {
  renderConfiguredTable,
  renderChart,
  downsampleSeriesForChart,
  formatAxisAmount
}