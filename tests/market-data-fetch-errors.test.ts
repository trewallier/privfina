import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeFetchFailure,
  formatFetchError,
  logFetchAttemptFailure
} from '../tools/market-data/fetch-errors.ts'
import { fetchKshInflationCsv } from '../tools/market-data/fetch-ksh-inflation.ts'

describe('formatFetchError / describeFetchFailure', () => {
  it('surfaces undici cause message and code for bare fetch failed', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('Connect Timeout Error'), {
        code: 'UND_ERR_CONNECT_TIMEOUT'
      })
    })
    expect(formatFetchError(err)).toContain('fetch failed')
    expect(formatFetchError(err)).toContain('Connect Timeout Error')
    expect(formatFetchError(err)).toContain('[UND_ERR_CONNECT_TIMEOUT]')
    const described = describeFetchFailure(err)
    expect(described.kind).toBe('no-http-response')
    expect(described.httpStatus).toBeNull()
  })

  it('marks HTTP status when provided after a Response', () => {
    const err = new Error('HTTP 503 Service Unavailable for https://example.test/x')
    const described = describeFetchFailure(err, { httpStatus: 503 })
    expect(described.kind).toBe('http-error')
    expect(described.httpStatus).toBe(503)
    expect(described.summary).toContain('HTTP 503')
  })
})

describe('logFetchAttemptFailure', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs httpResponse=none for transport failures', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND example.invalid'), {
        code: 'ENOTFOUND'
      })
    })
    logFetchAttemptFailure({
      label: 'KSH ara0040',
      attempt: 2,
      retries: 3,
      elapsedMs: 12,
      err,
      url: 'https://example.invalid/x.csv'
    })
    expect(spy).toHaveBeenCalledTimes(1)
    const line = String(spy.mock.calls[0]?.[0] ?? '')
    expect(line).toContain('[market-data] KSH ara0040 attempt 2/3 failed after 12ms')
    expect(line).toContain('httpResponse=none')
    expect(line).toContain('ENOTFOUND')
    expect(line).toContain('url=https://example.invalid/x.csv')
  })

  it('logs httpStatus when Response was received', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logFetchAttemptFailure({
      label: 'ÁKK catalog',
      attempt: 1,
      retries: 3,
      elapsedMs: 40,
      err: new Error('HTTP 502 Bad Gateway for https://akk.example/x'),
      httpStatus: 502,
      url: 'https://akk.example/x'
    })
    const line = String(spy.mock.calls[0]?.[0] ?? '')
    expect(line).toContain('httpStatus=502')
    expect(line).not.toContain('httpResponse=none')
  })
})

describe('fetchKshInflationCsv diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs each attempt and includes cause in the final thrown message', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ksh-fetch-log-'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl: typeof fetch = async () => {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('Connect Timeout Error'), {
          code: 'UND_ERR_CONNECT_TIMEOUT'
        })
      })
    }
    try {
      await expect(
        fetchKshInflationCsv({
          rawDir: tmp,
          fetchImpl,
          retries: 2,
          backoffMs: 1,
          csvUrl: 'https://example.invalid/ara0040.csv'
        })
      ).rejects.toThrow(/UND_ERR_CONNECT_TIMEOUT/)
      expect(spy).toHaveBeenCalledTimes(2)
      expect(String(spy.mock.calls[0]?.[0] ?? '')).toContain('httpResponse=none')
      expect(String(spy.mock.calls[1]?.[0] ?? '')).toContain('attempt 2/2')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('logs httpStatus when the server returns an error Response', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ksh-fetch-http-'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl: typeof fetch = async () =>
      new Response('nope', { status: 503, statusText: 'Service Unavailable' })
    try {
      await expect(
        fetchKshInflationCsv({
          rawDir: tmp,
          fetchImpl,
          retries: 1,
          csvUrl: 'https://example.invalid/ara0040.csv'
        })
      ).rejects.toThrow(/HTTP 503/)
      const line = String(spy.mock.calls[0]?.[0] ?? '')
      expect(line).toContain('httpStatus=503')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
