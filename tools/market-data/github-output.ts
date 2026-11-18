import { appendFileSync } from 'node:fs'

/** Append a key=value line to GITHUB_OUTPUT when running inside Actions. */
export function writeGithubOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT
  if (!out) return
  // Values are single-line by contract for this pipeline.
  if (key.includes('\n') || value.includes('\n') || key.includes('=')) {
    throw new Error(`Refusing to write unsafe GITHUB_OUTPUT entry for ${key}`)
  }
  appendFileSync(out, `${key}=${value}\n`, 'utf8')
}

/** Append markdown to the Actions job summary when GITHUB_STEP_SUMMARY is set. */
export function writeGithubStepSummary(markdown: string): void {
  const out = process.env.GITHUB_STEP_SUMMARY
  if (!out) return
  appendFileSync(out, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8')
}
