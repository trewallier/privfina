function renderConfiguredTable(
  oneTimeFlows,
  recurringFlows,
  tbody,
  isFlowIncluded,
  onToggleInclude,
  onEditOneTime,
  onDeleteOneTime,
  onEditRecurring,
  onDeleteRecurring
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

  rows.sort((a, b) => a.startOrDate.localeCompare(b.startOrDate))

  if (!rows.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.colSpan = 9
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
      <td>
        <label>
          <input class="action-include" data-id="${rowData.id}" type="checkbox" ${rowData.included ? 'checked' : ''} />
          include
        </label>
      </td>
      <td>
        <button class="primary action-edit" data-id="${rowData.id}" data-type="${rowData.type}" type="button">Edit</button>
        <button class="secondary action-delete" data-id="${rowData.id}" data-type="${rowData.type}" type="button">Delete</button>
      </td>
    `

    row.querySelector('.action-include')?.addEventListener('change', (event) => {
      const target = event.currentTarget
      if (target instanceof HTMLInputElement) {
        onToggleInclude(rowData.id, target.checked)
      }
    })

    row.querySelector('.action-edit')?.addEventListener('click', () => {
      if (rowData.type === 'one-time') {
        onEditOneTime(rowData.id)
      } else {
        onEditRecurring(rowData.id)
      }
    })

    row.querySelector('.action-delete')?.addEventListener('click', () => {
      if (rowData.type === 'one-time') {
        onDeleteOneTime(rowData.id)
      } else {
        onDeleteRecurring(rowData.id)
      }
    })

    tbody.appendChild(row)
  }
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

  const points = sampledSeries
    .map((point) => `${xScale(new Date(point.date).getTime())},${yScale(point.cumulativeTotal)}`)
    .join(' ')

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
      <line x1="${leftPad}" y1="${zeroY}" x2="${width - rightPad}" y2="${zeroY}" stroke="#bcb1a3" stroke-width="1.5" />
      <polyline fill="none" stroke="#0f766e" stroke-width="3" points="${points}" />
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