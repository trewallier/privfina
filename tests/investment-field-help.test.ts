import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  getDkjFieldHelp,
  getBmapFieldHelp,
  getPmapFieldHelp
} from '../public/controller/investment-field-help.js'
import { DKJ_FRONTEND_FIELD_ADAPTER } from '../public/controller/dkj-form.js'
import { PMAP_FRONTEND_FIELD_ADAPTER } from '../public/controller/pmap-form.js'
import { BMAP_FRONTEND_FIELD_ADAPTER } from '../public/controller/bmap-form.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function extractInvestmentFormHtml(indexHtml: string): string {
  const match = indexHtml.match(/<form id="investment-form">[\s\S]*?<\/form>/)
  if (!match) {
    throw new Error('investment-form not found in index.html')
  }
  return match[0]
}

describe('investment field help and dedicated hosts', () => {
  const indexHtml = readRepoFile('public/index.html')
  const formHtml = extractInvestmentFormHtml(indexHtml)

  it('keeps DKJ/BMAP/PMAP help copy aligned with YAML descriptions', () => {
    const dkj = YAML.parse(
      readRepoFile('docs/product-specs/products/government-securities/dkj/product.yaml')
    ) as any
    const bmap = YAML.parse(
      readRepoFile('docs/product-specs/products/government-securities/bmap/product.yaml')
    ) as any
    const pmap = YAML.parse(
      readRepoFile('docs/product-specs/products/government-securities/pmap/product.yaml')
    ) as any

    for (const field of dkj.inputs) {
      expect(getDkjFieldHelp(field.name)).toBe(field.description)
    }
    for (const field of bmap.inputs) {
      expect(getBmapFieldHelp(field.name)).toBe(field.description)
    }
    for (const field of pmap.inputs) {
      expect(getPmapFieldHelp(field.name)).toBe(field.description)
    }
  })

  it('exposes dedicated DKJ/PMAP/BMAP hosts and form-local status in the investment form', () => {
    expect(formHtml).toContain('id="investment-dkj-wrap"')
    expect(formHtml).toContain('id="investment-pmap-wrap"')
    expect(formHtml).toContain('id="investment-bmap-wrap"')
    expect(formHtml).toContain('id="investment-form-status"')
    expect(formHtml).toContain('id="dkj-face-value"')
    expect(formHtml).toContain('id="pmap-previous-year-inflation-pct"')
    expect(formHtml).toContain('id="investment-maturity-preview-help"')
    expect(formHtml).toContain('data-help-button="investment-category-help"')
  })

  it('keeps adapter input ids present in the investment form markup', () => {
    for (const adapter of Object.values(DKJ_FRONTEND_FIELD_ADAPTER)) {
      expect(formHtml).toContain(`id="${adapter.inputId}"`)
    }
    for (const adapter of Object.values(PMAP_FRONTEND_FIELD_ADAPTER)) {
      expect(formHtml).toContain(`id="${adapter.inputId}"`)
    }
    for (const adapter of Object.values(BMAP_FRONTEND_FIELD_ADAPTER)) {
      expect(formHtml).toContain(`id="${adapter.inputId}"`)
    }
  })
})
