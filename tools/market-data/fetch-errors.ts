/**
 * Shared diagnostics for Node undici `fetch` failures in market-data ingest.
 *
 * Undici surfaces transport failures as `TypeError: fetch failed` with the
 * actionable detail on `error.cause` (code / message). HTTP status is only
 * available when a Response was received (`!res.ok` path).
 */

export type FetchFailureKind = 'no-http-response' | 'http-error' | 'other'

export interface FormattedFetchError {
  /** Single-line summary for thrown Error.message / final aggregate. */
  summary: string
  /** Whether a Response was observed (false for undici transport throws). */
  kind: FetchFailureKind
  httpStatus: number | null
}

function causeCode(cause: unknown): string | undefined {
  if (cause == null || typeof cause !== 'object') return undefined
  const code = (cause as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function causeMessage(cause: unknown): string | undefined {
  if (cause instanceof Error) return cause.message
  if (cause != null && typeof cause === 'object' && 'message' in cause) {
    const msg = (cause as { message?: unknown }).message
    return typeof msg === 'string' ? msg : undefined
  }
  return undefined
}

/** Surface undici `cause` (code / message) for thrown Error messages. */
export function formatFetchError(err: unknown): string {
  return describeFetchFailure(err).summary
}

/**
 * Classify a caught fetch/HTTP failure for logging.
 * Pass `httpStatus` when the failure was thrown after receiving a Response.
 */
export function describeFetchFailure(
  err: unknown,
  options?: { httpStatus?: number }
): FormattedFetchError {
  if (options?.httpStatus != null) {
    const status = options.httpStatus
    const base = err instanceof Error ? err.message : String(err)
    return {
      kind: 'http-error',
      httpStatus: status,
      summary: base.includes(`HTTP ${status}`) ? base : `HTTP ${status}: ${base}`
    }
  }

  if (!(err instanceof Error)) {
    return { kind: 'other', httpStatus: null, summary: String(err) }
  }

  const cause = (err as Error & { cause?: unknown }).cause
  const code = causeCode(cause)
  const cMsg = causeMessage(cause)

  // Undici transport: TypeError "fetch failed" (+ optional AbortError / TimeoutError).
  const looksLikeTransport =
    err.message === 'fetch failed' ||
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    Boolean(code?.startsWith('UND_ERR_')) ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN'

  if (looksLikeTransport || cause != null) {
    const parts = [err.name !== 'Error' ? `${err.name}: ${err.message}` : err.message]
    if (cMsg && cMsg !== err.message) parts.push(`cause=${cMsg}`)
    if (code) parts.push(`[${code}]`)
    return {
      kind: 'no-http-response',
      httpStatus: null,
      summary: parts.join(' ')
    }
  }

  return { kind: 'other', httpStatus: null, summary: err.message }
}

/**
 * Log one failed attempt to stderr (visible in Actions). Does not throw.
 */
export function logFetchAttemptFailure(options: {
  label: string
  attempt: number
  retries: number
  elapsedMs: number
  err: unknown
  httpStatus?: number
  url?: string
}): void {
  const described = describeFetchFailure(options.err, {
    httpStatus: options.httpStatus
  })
  const responseBit =
    described.kind === 'http-error'
      ? `httpStatus=${described.httpStatus}`
      : described.kind === 'no-http-response'
        ? 'httpResponse=none'
        : 'httpResponse=unknown'
  const urlBit = options.url ? ` url=${options.url}` : ''
  console.error(
    `[market-data] ${options.label} attempt ${options.attempt}/${options.retries} failed after ${options.elapsedMs}ms: ${responseBit}; ${described.summary}${urlBit}`
  )
}
