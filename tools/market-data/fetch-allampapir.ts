import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AllampapirEnvelope } from './types.ts'

export const ALLAMPAPIR_BASE_URL = 'https://www.allampapir.hu'

export interface FetchAllampapirOptions {
  rawDir: string
  fetchImpl?: typeof fetch
  retries?: number
  backoffMs?: number
  baseUrl?: string
  userAgent?: string
}

export interface FetchAllampapirResult {
  papersMeta: AllampapirEnvelope
  pricesByPaper: Record<string, AllampapirEnvelope>
  papers: string[]
}

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; privfina-market-data/1.0; +https://github.com/trewallier/privfina)'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Minimal cookie jar for Set-Cookie / Cookie header round-trips. */
class CookieJar {
  private readonly cookies = new Map<string, string>()

  storeFromResponse(res: Response): void {
    const headers = res.headers as Headers & { getSetCookie?: () => string[] }
    const lines =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : (() => {
            const single = res.headers.get('set-cookie')
            return single ? [single] : []
          })()
    for (const line of lines) {
      const pair = line.split(';', 1)[0]
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      if (name) this.cookies.set(name, value)
    }
  }

  header(): string | null {
    if (this.cookies.size === 0) return null
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }
}

async function csrfBootstrap(
  baseUrl: string,
  jar: CookieJar,
  fetchImpl: typeof fetch,
  userAgent: string
): Promise<{ headerName: string; token: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': userAgent,
    Origin: baseUrl,
    Referer: `${baseUrl}/kincstari_arfolyamjegyzes/`
  }
  const cookie = jar.header()
  if (cookie) headers.Cookie = cookie

  const res = await fetchImpl(`${baseUrl}/api/csrf`, { method: 'GET', headers })
  jar.storeFromResponse(res)
  if (!res.ok) {
    throw new Error(`allampapir CSRF HTTP ${res.status}`)
  }
  const body = (await res.json()) as AllampapirEnvelope
  const data = body.data && typeof body.data === 'object' ? body.data : null
  const headerName = data && typeof data.headerName === 'string' ? data.headerName : ''
  const token = data && typeof data.token === 'string' ? data.token : ''
  if (!headerName || !token) {
    throw new Error(`allampapir CSRF missing token/headerName: ${JSON.stringify(body)}`)
  }
  return { headerName, token }
}

async function postJson(
  url: string,
  body: unknown,
  referer: string,
  baseUrl: string,
  jar: CookieJar,
  fetchImpl: typeof fetch,
  userAgent: string,
  retries: number,
  backoffMs: number
): Promise<{ status: number; envelope: AllampapirEnvelope }> {
  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { headerName, token } = await csrfBootstrap(baseUrl, jar, fetchImpl, userAgent)
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        Origin: baseUrl,
        Referer: referer,
        [headerName]: token
      }
      const cookie = jar.header()
      if (cookie) headers.Cookie = cookie

      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
      jar.storeFromResponse(res)
      const text = await res.text()
      let envelope: AllampapirEnvelope
      try {
        envelope = JSON.parse(text) as AllampapirEnvelope
      } catch {
        throw new Error(`allampapir invalid JSON HTTP ${res.status} for ${url}`)
      }
      if (res.status === 403 || envelope.message === 'csrf_failed') {
        throw new Error(`allampapir CSRF failed for ${url}`)
      }
      return { status: res.status, envelope }
    } catch (err) {
      lastError = err
      if (attempt < retries) await sleep(backoffMs * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function paperKeysFromMeta(meta: AllampapirEnvelope): string[] {
  const data = meta.data && typeof meta.data === 'object' ? meta.data : null
  const papers = data && typeof data.papers === 'object' && data.papers != null ? data.papers : null
  if (!papers || Array.isArray(papers)) {
    throw new Error('allampapir metadata missing data.papers object')
  }
  return Object.keys(papers as Record<string, unknown>).sort()
}

/**
 * CSRF + get_papers_with_prices + get_prices for every paper in data.papers.
 * Soft-ok: HTTP 404 or empty data.data arrays (e.g. 1MAP).
 */
export async function fetchAllampapirSnapshots(
  options: FetchAllampapirOptions
): Promise<FetchAllampapirResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  const backoffMs = options.backoffMs ?? 1000
  const baseUrl = (options.baseUrl ?? ALLAMPAPIR_BASE_URL).replace(/\/$/, '')
  const userAgent = options.userAgent ?? DEFAULT_UA
  const jar = new CookieJar()

  await mkdir(options.rawDir, { recursive: true })

  const metaResult = await postJson(
    `${baseUrl}/api/networkRate/get_papers_with_prices`,
    {},
    `${baseUrl}/kincstari_arfolyamjegyzes/`,
    baseUrl,
    jar,
    fetchImpl,
    userAgent,
    retries,
    backoffMs
  )
  if (metaResult.status !== 200 || metaResult.envelope.status !== true) {
    throw new Error(
      `allampapir metadata HTTP ${metaResult.status} status=${String(metaResult.envelope.status)} message=${String(metaResult.envelope.message)}`
    )
  }
  await writeFile(
    path.join(options.rawDir, 'papers_meta.json'),
    `${JSON.stringify(metaResult.envelope)}\n`,
    'utf8'
  )

  const papers = paperKeysFromMeta(metaResult.envelope)
  if (papers.length === 0) {
    throw new Error('allampapir metadata returned zero papers')
  }

  const pricesByPaper: Record<string, AllampapirEnvelope> = {}
  for (const paper of papers) {
    const { status, envelope } = await postJson(
      `${baseUrl}/api/networkRate/get_prices`,
      { paper },
      `${baseUrl}/kincstari_arfolyamjegyzes/${paper}`,
      baseUrl,
      jar,
      fetchImpl,
      userAgent,
      retries,
      backoffMs
    )
    await writeFile(
      path.join(options.rawDir, `prices_${paper}.json`),
      `${JSON.stringify(envelope)}\n`,
      'utf8'
    )
    if (status === 404) {
      pricesByPaper[paper] = envelope
      continue
    }
    if (status !== 200 || envelope.status !== true) {
      throw new Error(
        `allampapir get_prices ${paper} HTTP ${status} status=${String(envelope.status)} message=${String(envelope.message)}`
      )
    }
    const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : null
    if (!data || !Array.isArray(data.data)) {
      throw new Error(`allampapir get_prices ${paper} missing data.data array`)
    }
    pricesByPaper[paper] = envelope
  }

  return { papersMeta: metaResult.envelope, pricesByPaper, papers }
}
