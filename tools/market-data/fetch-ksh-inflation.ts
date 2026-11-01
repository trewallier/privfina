import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { KSH_ARA0040_CSV_URL } from './types.ts'

export interface FetchKshInflationOptions {
  /** Directory for ephemeral raw CSV (gitignored). */
  rawDir: string
  /** Optional fetch impl (tests). */
  fetchImpl?: typeof fetch
  /** Override CSV URL (tests). */
  csvUrl?: string
  /** Max attempts including first try. */
  retries?: number
  backoffMs?: number
}

export interface FetchKshInflationResult {
  /** Raw CSV bytes as received from KSH (typically ISO-8859-2). */
  csvBytes: Uint8Array
  csvUrl: string
  rawPath: string
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch KSH STADAT ara0040 CSV (Összesen CPI table). Prefer CSV over HTML (ADR 0037).
 */
export async function fetchKshInflationCsv(
  options: FetchKshInflationOptions
): Promise<FetchKshInflationResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  const backoffMs = options.backoffMs ?? 500
  const csvUrl = options.csvUrl ?? KSH_ARA0040_CSV_URL

  await mkdir(options.rawDir, { recursive: true })
  const rawPath = path.join(options.rawDir, 'ara0040.csv')

  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(csvUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/csv,text/plain,*/*',
          'Accept-Encoding': 'gzip, deflate'
        }
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${csvUrl}`)
      }
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.byteLength < 64) {
        throw new Error(`KSH ara0040 CSV too small (${buf.byteLength} bytes)`)
      }
      await writeFile(rawPath, buf)
      return { csvBytes: buf, csvUrl, rawPath }
    } catch (err) {
      lastError = err
      if (attempt < retries) await sleep(backoffMs * attempt)
    }
  }
  throw new Error(
    `Failed to fetch KSH ara0040 CSV after ${retries} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}
