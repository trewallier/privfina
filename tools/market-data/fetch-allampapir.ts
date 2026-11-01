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
  /** Reuse an existing CSRF session when chaining retailInterest in the same run. */
  session?: CsrfSession
}

export interface FetchAllampapirResult {
  papersMeta: AllampapirEnvelope
  pricesByPaper: Record<string, AllampapirEnvelope>
  papers: string[]
  /** CSRF jar used for this fetch — pass to retailInterest to avoid a second bootstrap. */
  session: CsrfSession
}

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; privfina-market-data/1.0; +https://github.com/trewallier/privfina)'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Minimal cookie jar for Set-Cookie / Cookie header round-trips. */
export class CookieJar {
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

export class AllampapirFetchError extends Error {
  readonly retryable: boolean
  readonly kind: 'csrf' | 'network' | 'http5xx' | 'http4xx' | 'shape'

  constructor(
    message: string,
    kind: AllampapirFetchError['kind'],
    retryable: boolean
  ) {
    super(message)
    this.name = 'AllampapirFetchError'
    this.kind = kind
    this.retryable = retryable
  }
}

/** One CSRF bootstrap per jar; refresh only on csrf_failed / 403. */
export class CsrfSession {
  headerName: string | null = null
  token: string | null = null

  constructor(
    readonly baseUrl: string,
    readonly jar: CookieJar,
    readonly fetchImpl: typeof fetch,
    readonly userAgent: string
  ) {}

  async ensure(): Promise<{ headerName: string; token: string }> {
    if (this.headerName && this.token) {
      return { headerName: this.headerName, token: this.token }
    }
    return this.refresh()
  }

  async refresh(): Promise<{ headerName: string; token: string }> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': this.userAgent,
      Origin: this.baseUrl,
      Referer: `${this.baseUrl}/kincstari_arfolyamjegyzes/`
    }
    const cookie = this.jar.header()
    if (cookie) headers.Cookie = cookie

    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/csrf`, { method: 'GET', headers })
    } catch (err) {
      throw new AllampapirFetchError(
        `allampapir CSRF network error: ${err instanceof Error ? err.message : String(err)}`,
        'network',
        true
      )
    }
    this.jar.storeFromResponse(res)
    if (!res.ok) {
      const kind = res.status >= 500 ? 'http5xx' : res.status === 403 ? 'csrf' : 'http4xx'
      throw new AllampapirFetchError(
        `allampapir CSRF HTTP ${res.status}`,
        kind,
        kind === 'http5xx' || kind === 'csrf'
      )
    }
    const body = (await res.json()) as AllampapirEnvelope
    const data = body.data && typeof body.data === 'object' ? body.data : null
    const headerName = data && typeof data.headerName === 'string' ? data.headerName : ''
    const token = data && typeof data.token === 'string' ? data.token : ''
    if (!headerName || !token) {
      throw new AllampapirFetchError(
        `allampapir CSRF missing token/headerName: ${JSON.stringify(body)}`,
        'shape',
        false
      )
    }
    this.headerName = headerName
    this.token = token
    return { headerName, token }
  }

  invalidate(): void {
    this.headerName = null
    this.token = null
  }
}

export async function postJsonWithSession(
  url: string,
  body: unknown,
  referer: string,
  session: CsrfSession,
  retries: number,
  backoffMs: number
): Promise<{ status: number; envelope: AllampapirEnvelope }> {
  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { headerName, token } = await session.ensure()
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'User-Agent': session.userAgent,
        Origin: session.baseUrl,
        Referer: referer,
        [headerName]: token
      }
      const cookie = session.jar.header()
      if (cookie) headers.Cookie = cookie

      let res: Response
      try {
        res = await session.fetchImpl(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        })
      } catch (err) {
        throw new AllampapirFetchError(
          `allampapir network error for ${url}: ${err instanceof Error ? err.message : String(err)}`,
          'network',
          true
        )
      }
      session.jar.storeFromResponse(res)
      const text = await res.text()
      let envelope: AllampapirEnvelope
      try {
        envelope = JSON.parse(text) as AllampapirEnvelope
      } catch {
        if (res.status >= 500) {
          throw new AllampapirFetchError(
            `allampapir invalid JSON HTTP ${res.status} for ${url}`,
            'http5xx',
            true
          )
        }
        throw new AllampapirFetchError(
          `allampapir invalid JSON HTTP ${res.status} for ${url}`,
          'shape',
          false
        )
      }
      if (res.status === 403 || envelope.message === 'csrf_failed') {
        session.invalidate()
        throw new AllampapirFetchError(`allampapir CSRF failed for ${url}`, 'csrf', true)
      }
      if (res.status >= 500) {
        throw new AllampapirFetchError(
          `allampapir HTTP ${res.status} for ${url}`,
          'http5xx',
          true
        )
      }
      // Soft 404 and other 2xx/4xx with parseable JSON are returned to the caller.
      return { status: res.status, envelope }
    } catch (err) {
      lastError = err
      const retryable =
        err instanceof AllampapirFetchError ? err.retryable : true /* unknown → retry */
      if (!retryable || attempt >= retries) break
      await sleep(backoffMs * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function paperKeysFromMeta(meta: AllampapirEnvelope): string[] {
  const data = meta.data && typeof meta.data === 'object' ? meta.data : null
  const papers = data && typeof data.papers === 'object' && data.papers != null ? data.papers : null
  if (!papers || Array.isArray(papers)) {
    throw new AllampapirFetchError(
      'allampapir metadata missing data.papers object',
      'shape',
      false
    )
  }
  return Object.keys(papers as Record<string, unknown>).sort()
}

/**
 * CSRF once per jar + get_papers_with_prices + get_prices for every paper in data.papers.
 * Soft-ok: HTTP 404 or empty data.data arrays (e.g. 1MAP).
 * Retries CSRF / network / 5xx; hard-fails non-retryable 4xx / shape errors.
 */
export async function fetchAllampapirSnapshots(
  options: FetchAllampapirOptions
): Promise<FetchAllampapirResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  const backoffMs = options.backoffMs ?? 1000
  const baseUrl = (options.baseUrl ?? ALLAMPAPIR_BASE_URL).replace(/\/$/, '')
  const userAgent = options.userAgent ?? DEFAULT_UA
  const session =
    options.session ??
    new CsrfSession(baseUrl, new CookieJar(), fetchImpl, userAgent)

  await mkdir(options.rawDir, { recursive: true })

  const metaResult = await postJsonWithSession(
    `${baseUrl}/api/networkRate/get_papers_with_prices`,
    {},
    `${baseUrl}/kincstari_arfolyamjegyzes/`,
    session,
    retries,
    backoffMs
  )
  await writeFile(
    path.join(options.rawDir, 'papers_meta.json'),
    `${JSON.stringify(metaResult.envelope)}\n`,
    'utf8'
  )
  if (metaResult.status !== 200 || metaResult.envelope.status !== true) {
    throw new AllampapirFetchError(
      `allampapir metadata HTTP ${metaResult.status} status=${String(metaResult.envelope.status)} message=${String(metaResult.envelope.message)}`,
      metaResult.status >= 400 && metaResult.status < 500 ? 'http4xx' : 'shape',
      false
    )
  }

  const papers = paperKeysFromMeta(metaResult.envelope)
  if (papers.length === 0) {
    throw new AllampapirFetchError('allampapir metadata returned zero papers', 'shape', false)
  }

  const pricesByPaper: Record<string, AllampapirEnvelope> = {}
  for (const paper of papers) {
    const { status, envelope } = await postJsonWithSession(
      `${baseUrl}/api/networkRate/get_prices`,
      { paper },
      `${baseUrl}/kincstari_arfolyamjegyzes/${paper}`,
      session,
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
      throw new AllampapirFetchError(
        `allampapir get_prices ${paper} HTTP ${status} status=${String(envelope.status)} message=${String(envelope.message)}`,
        status >= 400 && status < 500 ? 'http4xx' : 'shape',
        false
      )
    }
    const data = envelope.data && typeof envelope.data === 'object' ? envelope.data : null
    if (!data || !Array.isArray(data.data)) {
      throw new AllampapirFetchError(
        `allampapir get_prices ${paper} missing data.data array`,
        'shape',
        false
      )
    }
    pricesByPaper[paper] = envelope
  }

  return { papersMeta: metaResult.envelope, pricesByPaper, papers, session }
}
