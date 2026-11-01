import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { readdirSync } from 'fs'
import {
  clearMarketDataSessionCache,
  createMarketDataLoader,
  findNearestQuoteRow,
  findQuoteRowBySettleDate,
  latestQuoteForId,
  resolveQuoteForPurchaseDate
} from '../public/controller/market-data-loader.js'

const FIXTURE_ROOT = resolve(process.cwd(), 'tests/fixtures/market-data/published')

function createFixtureFetch() {
  return async (input: RequestInfo | URL) => {
    const url = String(input)
    const marker = '/data/market/v1/'
    const index = url.indexOf(marker)
    if (index < 0) {
      return new Response('not found', { status: 404 })
    }
    const relative = url.slice(index + marker.length).replace(/^\//, '')
    const filePath = resolve(FIXTURE_ROOT, relative)
    if (!existsSync(filePath)) {
      return new Response('missing', { status: 404 })
    }
    const body = readFileSync(filePath, 'utf8')
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

describe('market-data-loader', () => {
  beforeEach(() => {
    clearMarketDataSessionCache()
  })

  afterEach(() => {
    clearMarketDataSessionCache()
  })

  it('loads manifest → series → latest for a family including past statuses', async () => {
    const loader = createMarketDataLoader({
      baseUrl: '/privfina/',
      fetchImpl: createFixtureFetch()
    })

    const manifest = await loader.loadManifest()
    expect(manifest?.schemaVersion).toBe(1)
    expect(manifest?.families).toEqual(['dkj', 'pmap', 'bmap'])

    const family = await loader.loadFamily('dkj')
    expect(family.available).toBe(true)
    expect(family.asOf).toBe('2026-11-02')
    expect(family.series.map((row) => row.id)).toEqual(['D261125', 'D261223', 'DOLD000'])
    expect(family.series.find((row) => row.id === 'DOLD000')?.status).toBe('matured')
    expect(family.latest?.quotes.D261223.ask).toBe(99.3512)
  })

  it('loads quotes history and finds a settle-date row', async () => {
    const loader = createMarketDataLoader({
      baseUrl: '/privfina/data/market/v1/',
      fetchImpl: createFixtureFetch()
    })

    const quotes = await loader.loadQuotes('dkj', 'D261223')
    expect(quotes?.id).toBe('D261223')
    const row = findQuoteRowBySettleDate(quotes, '2026-10-31')
    expect(row).toEqual({
      d: '2026-10-31',
      bid: 99.1,
      ask: 99.2,
      by: 6.1,
      ay: 4.7,
      ai: 0
    })
    expect(latestQuoteForId({ D261223: { d: '2026-11-02', bid: 1, ask: 2, by: null, ay: null, ai: 0 } }, 'D261223')?.ask).toBe(2)
  })

  it('finds the nearest quote date and resolves purchase-date clamp', async () => {
    const loader = createMarketDataLoader({
      baseUrl: '/privfina/data/market/v1/',
      fetchImpl: createFixtureFetch()
    })
    const quotes = await loader.loadQuotes('dkj', 'D261223')
    // 2026-11-01 is equidistant from 10-31 and 11-02; tie-break prefers the later date.
    const nearest = findNearestQuoteRow(quotes, '2026-11-01')
    expect(nearest?.date).toBe('2026-11-02')
    expect(nearest?.clamped).toBe(true)
    expect(nearest?.quote.ask).toBe(99.3512)

    const before = findNearestQuoteRow(quotes, '2026-10-30')
    expect(before?.date).toBe('2026-10-31')
    expect(before?.clamped).toBe(true)

    const exact = resolveQuoteForPurchaseDate({
      requestedDate: '2026-10-31',
      latestQuote: { d: '2026-11-02', ask: 99.35 },
      quotesFile: quotes
    })
    expect(exact).toEqual({
      quote: expect.objectContaining({ d: '2026-10-31', ask: 99.2 }),
      date: '2026-10-31',
      clamped: false
    })

    const clamped = resolveQuoteForPurchaseDate({
      requestedDate: '2020-01-01',
      latestQuote: { d: '2026-11-02', ask: 99.35 },
      quotesFile: quotes
    })
    expect(clamped?.clamped).toBe(true)
    expect(clamped?.date).toBeTruthy()

    expect(
      resolveQuoteForPurchaseDate({
        requestedDate: '2026-11-02',
        latestQuote: null,
        quotesFile: { cols: ['d'], rows: [] }
      })
    ).toBeNull()
  })

  it('loads retail-interest refs when present', async () => {
    const loader = createMarketDataLoader({
      baseUrl: '/privfina/',
      fetchImpl: createFixtureFetch()
    })
    const retail = await loader.loadRetailInterest()
    expect(retail?.schemaVersion).toBe(1)
    expect(retail?.rows.some((row) => row.offered === true)).toBe(true)
    expect(retail?.rows.find((row) => row.series === '2027/J')?.rate).toBe(4.5)
  })

  it('soft-degrades when published files are missing', async () => {
    const loader = createMarketDataLoader({
      baseUrl: '/privfina/',
      fetchImpl: async () => new Response('gone', { status: 404 })
    })

    expect(await loader.loadManifest()).toBeNull()
    const family = await loader.loadFamily('dkj')
    expect(family).toEqual({
      series: [],
      latest: null,
      available: false,
      asOf: null
    })
    expect(await loader.loadRetailInterest()).toBeNull()
  })

  it('caches repeated fetches within the session', async () => {
    let hits = 0
    const fetchImpl = async (input: RequestInfo | URL) => {
      hits += 1
      return createFixtureFetch()(input)
    }
    const loader = createMarketDataLoader({ baseUrl: '/privfina/', fetchImpl })

    await loader.loadFamily('dkj')
    const afterFirst = hits
    await loader.loadFamily('dkj')
    expect(hits).toBe(afterFirst)
  })
})

describe('market-data public surface hygiene', () => {
  it('does not reference akk.hu hosts from public/ sources', () => {
    const publicRoot = resolve(process.cwd(), 'public')
    const stack = [publicRoot]
    const offenders: string[] = []

    while (stack.length > 0) {
      const current = stack.pop()!
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = resolve(current, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
          continue
        }
        if (!/\.(js|html|css|mjs|ts)$/.test(entry.name)) {
          continue
        }
        const text = readFileSync(full, 'utf8')
        if (/akk\.hu/i.test(text) || /allampapir\.hu/i.test(text)) {
          offenders.push(full.replace(process.cwd() + '/', ''))
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
