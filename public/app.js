const STORAGE_KEY = 'privfina.one_time_cash_flows.v1'

function toSignedAmount(flow) {
  return flow.direction === 'inflow' ? flow.amount : -flow.amount
}

function loadCashFlows() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
  } catch {
    return []
  }
}

function saveCashFlows(flows) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flows))
}

function calculateCumulativeSeries(flows, startDate, endDate) {
  const sorted = [...flows]
    .filter((flow) => flow.date >= startDate && flow.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date))

  let runningTotal = 0
  return sorted.map((flow) => {
    runningTotal += toSignedAmount(flow)
    return {
      date: flow.date,
      cumulativeTotal: runningTotal
    }
  })
}

function renderTable(flows, tbody, onDelete) {
  tbody.innerHTML = ''

  if (!flows.length) {
    const row = document.createElement('tr')
    const cell = document.createElement('td')
    cell.colSpan = 5
    cell.textContent = 'No cash flows yet.'
    row.appendChild(cell)
    tbody.appendChild(row)
    return
  }

  for (const flow of flows) {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${flow.date}</td>
      <td>${flow.direction}</td>
      <td>${flow.amount.toFixed(2)}</td>
      <td>${flow.category}</td>
      <td><button class="secondary" data-id="${flow.id}" type="button">Delete</button></td>
    `
    row.querySelector('button')?.addEventListener('click', () => onDelete(flow.id))
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

function suggestRange(flows) {
  if (!flows.length) {
    const now = new Date().toISOString().slice(0, 10)
    return { startDate: now, endDate: now }
  }

  const sortedDates = flows.map((flow) => flow.date).sort((a, b) => a.localeCompare(b))
  return {
    startDate: sortedDates[0],
    endDate: sortedDates[sortedDates.length - 1]
  }
}

function init() {
  const form = document.getElementById('cash-flow-form')
  const rows = document.getElementById('cash-flow-rows')
  const chart = document.getElementById('chart')
  const startInput = document.getElementById('range-start')
  const endInput = document.getElementById('range-end')

  let cashFlows = loadCashFlows()

  const defaultRange = suggestRange(cashFlows)
  startInput.value = defaultRange.startDate
  endInput.value = defaultRange.endDate

  function rerender() {
    const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date))
    renderTable(sorted, rows, (id) => {
      cashFlows = cashFlows.filter((flow) => flow.id !== id)
      saveCashFlows(cashFlows)

      if (!cashFlows.length) {
        const fallbackDate = new Date().toISOString().slice(0, 10)
        startInput.value = fallbackDate
        endInput.value = fallbackDate
      }

      rerender()
    })

    const startDate = startInput.value
    const endDate = endInput.value
    if (!startDate || !endDate || startDate > endDate) {
      chart.innerHTML = '<div class="empty">Select a valid date range.</div>'
      return
    }

    const series = calculateCumulativeSeries(cashFlows, startDate, endDate)
    renderChart(series, chart)
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()

    const formData = new FormData(form)
    const amount = Number(formData.get('amount'))
    const date = String(formData.get('date') || '')
    const direction = String(formData.get('direction') || 'inflow')
    const category = String(formData.get('category') || '').trim() || 'general'

    if (!date || !Number.isFinite(amount) || amount < 0) {
      return
    }

    const nextFlow = {
      id: crypto.randomUUID(),
      date,
      amount,
      direction,
      category
    }

    cashFlows = [...cashFlows, nextFlow]
    saveCashFlows(cashFlows)

    const range = suggestRange(cashFlows)
    startInput.value = range.startDate
    endInput.value = range.endDate

    form.reset()
    form.querySelector('#direction').value = 'inflow'

    rerender()
  })

  startInput.addEventListener('change', rerender)
  endInput.addEventListener('change', rerender)

  rerender()
}

init()
