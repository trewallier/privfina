import { describe, expect, it } from 'vitest'
import {
  clampViewport,
  computeAdaptiveXTicks,
  computeNiceYTicks,
  filterSeriesToViewport,
  isViewportFull,
  panViewport,
  resolveRangePreset,
  seriesTimeDomain,
  shiftIsoDateByMonths,
  zoomViewport,
  DAY_MS
} from '../public/controller/chart-viewport.js'

describe('chart viewport math', () => {
  const domain = {
    xMin: Date.parse('2024-01-01T00:00:00Z'),
    xMax: Date.parse('2024-12-31T00:00:00Z')
  }

  it('builds a series time domain from cumulative points', () => {
    expect(
      seriesTimeDomain([
        { date: '2024-02-01', cumulativeTotal: 10 },
        { date: '2024-03-01', cumulativeTotal: 20 }
      ])
    ).toEqual({
      xMin: Date.parse('2024-02-01T00:00:00Z'),
      xMax: Date.parse('2024-03-01T00:00:00Z')
    })
  })

  it('clamps zoomed viewports inside the data domain', () => {
    const zoomed = clampViewport(
      {
        xMin: domain.xMin - 10 * DAY_MS,
        xMax: domain.xMin + 5 * DAY_MS
      },
      domain
    )
    expect(zoomed.xMin).toBe(domain.xMin)
    expect(zoomed.xMax - zoomed.xMin).toBeGreaterThanOrEqual(3 * DAY_MS)
    expect(zoomed.xMax).toBeLessThanOrEqual(domain.xMax)
  })

  it('zooms toward an anchor and pans without leaving the domain', () => {
    const mid = (domain.xMin + domain.xMax) / 2
    const zoomed = zoomViewport(domain, 2, mid, domain)
    expect(zoomed.xMax - zoomed.xMin).toBeLessThan(domain.xMax - domain.xMin)
    expect(isViewportFull(zoomed, domain)).toBe(false)

    const panned = panViewport(zoomed, 40 * DAY_MS, domain)
    expect(panned.xMin).toBeGreaterThanOrEqual(domain.xMin)
    expect(panned.xMax).toBeLessThanOrEqual(domain.xMax)
  })

  it('computes nice Y ticks that include zero', () => {
    const ticks = computeNiceYTicks(-40, 250, 5)
    expect(ticks.length).toBeGreaterThan(2)
    expect(ticks).toContain(0)
    expect(ticks[0]).toBeLessThanOrEqual(-40)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(250)
  })

  it('adapts X tick density to plot width', () => {
    const narrow = computeAdaptiveXTicks(domain.xMin, domain.xMax, 280)
    const wide = computeAdaptiveXTicks(domain.xMin, domain.xMax, 900)
    expect(narrow[0]).toBe(domain.xMin)
    expect(narrow[narrow.length - 1]).toBe(domain.xMax)
    expect(wide.length).toBeGreaterThanOrEqual(narrow.length)
  })

  it('filters series with a hold point at the left viewport edge', () => {
    const series = [
      { date: '2024-01-01', cumulativeTotal: 0 },
      { date: '2024-02-01', cumulativeTotal: 50 },
      { date: '2024-03-01', cumulativeTotal: 80 },
      { date: '2024-04-01', cumulativeTotal: 90 }
    ]
    const visible = filterSeriesToViewport(series, {
      xMin: Date.parse('2024-02-15T00:00:00Z'),
      xMax: Date.parse('2024-03-15T00:00:00Z')
    })
    expect(visible[0].date).toBe('2024-02-01')
    expect(visible.map((point) => point.date)).toContain('2024-03-01')
    expect(visible.map((point) => point.date)).not.toContain('2024-04-01')
  })

  it('resolves range presets relative to the end date', () => {
    expect(shiftIsoDateByMonths('2024-06-15', -1)).toBe('2024-05-15')
    expect(resolveRangePreset('1m', { endDate: '2024-06-15' })).toEqual({
      startDate: '2024-05-15',
      endDate: '2024-06-15'
    })
    expect(resolveRangePreset('ytd', { endDate: '2024-06-15' })).toEqual({
      startDate: '2024-01-01',
      endDate: '2024-06-15'
    })
    expect(
      resolveRangePreset('max', {
        endDate: '2024-06-15',
        maxStart: '2023-01-01',
        maxEnd: '2024-12-01'
      })
    ).toEqual({
      startDate: '2023-01-01',
      endDate: '2024-12-01'
    })
  })
})
