function renderConfiguredTable(
  oneTimeFlows,
  recurringFlows,
  tbody,
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
      category: flow.category || 'general'
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
      category: flow.category || 'general'
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
      <td>
        <button class="primary action-edit" data-id="${rowData.id}" data-type="${rowData.type}" type="button">Edit</button>
        <button class="secondary action-delete" data-id="${rowData.id}" data-type="${rowData.type}" type="button">Delete</button>
      </td>
    `

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

function renderChart(series, container) {
  if (!series.length) {
    container.innerHTML = '<div class="empty">No cash flows in selected range. Baseline total: 0.</div>'
    return
  }

  const width = 880
  const height = 260
  const pad = 28

  const timestamps = series.map((point) => new Date(point.date).getTime())
  const totals = series.map((point) => point.cumulativeTotal)

  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const minTotal = Math.min(0, ...totals)
  const maxTotal = Math.max(0, ...totals)

  const xScale = (value) => {
    if (maxTime === minTime) {
      return width / 2
    }
    return pad + ((value - minTime) / (maxTime - minTime)) * (width - pad * 2)
  }

  const yScale = (value) => {
    if (maxTotal === minTotal) {
      return height / 2
    }
    return pad + ((maxTotal - value) / (maxTotal - minTotal)) * (height - pad * 2)
  }

  const points = series
    .map((point) => `${xScale(new Date(point.date).getTime())},${yScale(point.cumulativeTotal)}`)
    .join(' ')

  const zeroY = yScale(0)

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative cash-flow chart">
      <line x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}" stroke="#bcb1a3" stroke-width="1" />
      <polyline fill="none" stroke="#0f766e" stroke-width="3" points="${points}" />
      <text x="${pad}" y="18" fill="#6f6558" font-size="12">Cumulative total</text>
      <text x="${pad}" y="${height - 8}" fill="#6f6558" font-size="12">${series[0].date}</text>
      <text x="${width - pad - 80}" y="${height - 8}" fill="#6f6558" font-size="12">${series[series.length - 1].date}</text>
    </svg>
  `
}

export {
  renderConfiguredTable,
  renderChart
}