import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { formatFetchError, logFetchAttemptFailure } from './fetch-errors.ts'
import { MNB_BUBOR_XLS_URL } from './types.ts'

export interface FetchMnbBuborOptions {
  /** Directory for ephemeral raw XLS (gitignored). */
  rawDir: string
  /** Optional fetch impl (tests). */
  fetchImpl?: typeof fetch
  /** Override XLS URL (tests). */
  xlsUrl?: string
  /** Max attempts including first try. */
  retries?: number
  backoffMs?: number
}

export interface FetchMnbBuborResult {
  /** Raw XLS bytes as received from MNB. */
  xlsBytes: Uint8Array
  xlsUrl: string
  rawPath: string
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch MNB bubor2.xls (official BUBOR fixings workbook). ADR 0045.
 * Hard-fail after retries; each attempt logs httpStatus vs httpResponse=none + undici cause.
 */
export async function fetchMnbBuborXls(
  options: FetchMnbBuborOptions
): Promise<FetchMnbBuborResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  const backoffMs = options.backoffMs ?? 500
  const xlsUrl = options.xlsUrl ?? MNB_BUBOR_XLS_URL

  await mkdir(options.rawDir, { recursive: true })
  const rawPath = path.join(options.rawDir, 'bubor2.xls')

  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    const started = Date.now()
    let httpStatus: number | undefined
    try {
      const res = await fetchImpl(xlsUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.ms-excel,application/octet-stream,*/*',
          'Accept-Encoding': 'gzip, deflate'
        }
      })
      if (!res.ok) {
        httpStatus = res.status
        throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim() + ` for ${xlsUrl}`)
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.byteLength < 256) {
        httpStatus = res.status
        throw new Error(
          `MNB bubor2.xls too small (${buf.byteLength} bytes) HTTP ${res.status} for ${xlsUrl}`
        )
      }
      await writeFile(rawPath, buf)
      return { xlsBytes: buf, xlsUrl, rawPath }
    } catch (err) {
      lastError = err
      logFetchAttemptFailure({
        label: 'MNB bubor2.xls',
        attempt,
        retries,
        elapsedMs: Date.now() - started,
        err,
        httpStatus,
        url: xlsUrl
      })
      if (attempt < retries) await sleep(backoffMs * attempt)
    }
  }
  throw new Error(
    `Failed to fetch MNB bubor2.xls after ${retries} attempts: ${formatFetchError(lastError)}`
  )
}
