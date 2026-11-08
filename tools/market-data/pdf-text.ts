import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export class PdfTextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfTextError'
  }
}

export interface PdfToTextOptions {
  /** Override `pdftotext` binary path (tests / non-PATH installs). */
  pdftotextBin?: string
}

/**
 * Extract text from a PDF path using system `pdftotext -layout` (Poppler).
 * Pure ingest path for WebKincstár (ADR 0039); Vitest uses pre-extracted fixtures.
 */
export async function pdfFileToTextLayout(
  pdfPath: string,
  options?: PdfToTextOptions
): Promise<string> {
  const bin = options?.pdftotextBin ?? 'pdftotext'
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.stderr.on('data', (c: Buffer) => errChunks.push(c))
    child.on('error', (err) => {
      reject(
        new PdfTextError(
          `Failed to spawn ${bin}: ${err instanceof Error ? err.message : String(err)}. Install poppler-utils.`
        )
      )
    })
    child.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8').trim()
        reject(
          new PdfTextError(
            `${bin} exited ${code} for ${pdfPath}${stderr ? `: ${stderr}` : ''}`
          )
        )
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}

/**
 * Write PDF bytes to a temp file, run `pdftotext -layout`, then clean up.
 */
export async function pdfBytesToTextLayout(
  pdfBytes: Uint8Array,
  options?: PdfToTextOptions
): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'privfina-pdf-'))
  const pdfPath = path.join(dir, 'report.pdf')
  try {
    await writeFile(pdfPath, pdfBytes)
    return await pdfFileToTextLayout(pdfPath, options)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
