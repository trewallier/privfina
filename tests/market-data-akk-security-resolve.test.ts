import { describe, expect, it, vi } from 'vitest'
import {
  buildAkkCatalogResolveIndex,
  buildSecurityResolveUrl,
  canonicalSeriesIdFromAkkRow,
  createAkkResolveBudget,
  resolveAkkSecurityByLabel
} from '../tools/market-data/akk-security-resolve.ts'
import type { AkkEnvelope, AkkRow } from '../tools/market-data/types.ts'

function d260930Row(): AkkRow {
  return {
    securityType: 'DKJ',
    name: 'D260930',
    longName: 'D260930',
    isin: 'HU0000533456',
    issueDate: '2025-10-01',
    maturityDate: '2026-09-30',
    currency: 'HUF',
    faceValue: 10000,
    interestConvention: '_ACT_365'
  }
}

function a270324Row(): AkkRow {
  return {
    securityType: 'PMAP',
    name: '2027/I',
    longName: 'A270324I22',
    isin: 'HU0000403114',
    issueDate: '2022-03-24',
    maturityDate: '2027-03-24',
    currency: 'HUF',
    faceValue: 10000,
    interestConvention: '_ACT_365',
    interestPeriod: '12M',
    interestType: 'FIX'
  }
}

function catalogEnvelope(rows: AkkRow[]): AkkEnvelope {
  return {
    meta: { status: 'OK', message: '', timestamp: '2026-11-05T12:00:00.000Z' },
    data: rows
  }
}

describe('akk-security-resolve (ADR 0048)', () => {
  it('indexes name and longName; D260930-shaped fixture resolves via index', async () => {
    const index = buildAkkCatalogResolveIndex(catalogEnvelope([d260930Row()]))
    const budget = createAkkResolveBudget(5)
    const hit = await resolveAkkSecurityByLabel('D260930', {
      index,
      budget,
      preferredFamily: 'dkj',
      asOf: '2026-11-05',
      fetchImpl: vi.fn()
    })
    expect(hit.via).toBe('index')
    expect(hit.series?.id).toBe('D260930')
    expect(hit.series?.identitySource).toBe('www.akk.hu')
    expect(hit.series?.isin).toBe('HU0000533456')
    expect(hit.series?.issue).toBe('2025-10-01')
    expect(budget.usedGets).toBe(0)
  })

  it('short name maps to longName canonical id', async () => {
    const row = a270324Row()
    expect(canonicalSeriesIdFromAkkRow(row)).toBe('A270324I22')
    const index = buildAkkCatalogResolveIndex(catalogEnvelope([row]))
    const budget = createAkkResolveBudget(5)
    const hit = await resolveAkkSecurityByLabel('2027/I', {
      index,
      budget,
      preferredFamily: 'pmap',
      asOf: '2026-11-05',
      fetchImpl: vi.fn()
    })
    expect(hit.via).toBe('index')
    expect(hit.series?.id).toBe('A270324I22')
    expect(hit.series?.name).toBe('2027/I')
    expect(hit.series?.identitySource).toBe('www.akk.hu')
  })

  it('miss returns null without inventing', async () => {
    const index = buildAkkCatalogResolveIndex(catalogEnvelope([]))
    const budget = createAkkResolveBudget(5)
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(catalogEnvelope([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    const hit = await resolveAkkSecurityByLabel('UNKNOWN99', {
      index,
      budget,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(hit.series).toBeNull()
    expect(hit.via).toBe('miss')
    expect(budget.usedGets).toBe(2) // longName then name
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('GET longName soft-fails without throwing', async () => {
    const index = buildAkkCatalogResolveIndex(catalogEnvelope([]))
    const budget = createAkkResolveBudget(5)
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const hit = await resolveAkkSecurityByLabel('D260930', {
      index,
      budget,
      retries: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(hit.series).toBeNull()
    expect(hit.via).toBe('soft_fail')
  })

  it('budget exhaustion is not a confirmed miss', async () => {
    const index = buildAkkCatalogResolveIndex(catalogEnvelope([]))
    const budget = createAkkResolveBudget(0)
    const fetchImpl = vi.fn()
    const hit = await resolveAkkSecurityByLabel('D260930', {
      index,
      budget,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(hit.series).toBeNull()
    expect(hit.via).toBe('budget_exhausted')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('GET longName hit caches into index for later labels', async () => {
    const index = buildAkkCatalogResolveIndex(catalogEnvelope([]))
    const budget = createAkkResolveBudget(5)
    const fetchImpl = vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('longName=D260930')) {
        return new Response(JSON.stringify(catalogEnvelope([d260930Row()])), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify(catalogEnvelope([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })
    const first = await resolveAkkSecurityByLabel('D260930', {
      index,
      budget,
      preferredFamily: 'dkj',
      asOf: '2026-11-05',
      retries: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(first.via).toBe('longName')
    expect(first.series?.id).toBe('D260930')
    expect(budget.usedGets).toBe(1)

    const second = await resolveAkkSecurityByLabel('D260930', {
      index,
      budget,
      preferredFamily: 'dkj',
      asOf: '2026-11-05',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    expect(second.via).toBe('index')
    expect(budget.usedGets).toBe(1)
  })

  it('buildSecurityResolveUrl encodes query params', () => {
    expect(buildSecurityResolveUrl({ longName: 'D260930' })).toContain(
      'query=getSecurityWithOutstanding'
    )
    expect(buildSecurityResolveUrl({ longName: 'D260930' })).toContain('longName=D260930')
    expect(buildSecurityResolveUrl({ name: '2027/I' })).toContain('name=2027%2FI')
  })
})
