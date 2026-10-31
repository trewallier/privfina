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

function extractFormHtml(indexHtml: string, formId: string): string {
  const match = indexHtml.match(new RegExp(`<form id="${formId}">[\\s\\S]*?<\\/form>`))
  if (!match) {
    throw new Error(`${formId} not found in index.html`)
  }
  return match[0]
}

describe('investment field help and dedicated hosts', () => {
  const indexHtml = readRepoFile('public/index.html')
  const simplifiedFormHtml = extractFormHtml(indexHtml, 'investment-form')
  const commercialFormHtml = extractFormHtml(indexHtml, 'commercial-investment-form')

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

  it('keeps generic bond subtypes on the simplified investment form', () => {
    expect(simplifiedFormHtml).toContain('id="investment-subtype"')
    expect(simplifiedFormHtml).toContain('value="regular-bond"')
    expect(simplifiedFormHtml).toContain('value="discount-bond"')
    expect(simplifiedFormHtml).toContain('value="inflation-linked-bond"')
    expect(simplifiedFormHtml).toContain('value="custom-bond"')
    expect(simplifiedFormHtml).not.toContain('id="investment-dkj-wrap"')
    expect(simplifiedFormHtml).not.toContain('id="investment-pmap-wrap"')
    expect(simplifiedFormHtml).not.toContain('id="investment-bmap-wrap"')
    expect(simplifiedFormHtml).toContain('id="investment-form-status"')
    expect(simplifiedFormHtml).toContain('data-help-button="investment-category-help"')
  })

  it('hosts DKJ/PMAP/BMAP on the commercial investment form', () => {
    expect(commercialFormHtml).toContain('id="commercial-investment-product"')
    expect(commercialFormHtml).not.toContain('id="commercial-investment-readiness-hint"')
    expect(commercialFormHtml).not.toMatch(/Readiness:\s*fully-spec-backed/)
    expect(commercialFormHtml).toContain('id="investment-dkj-wrap"')
    expect(commercialFormHtml).toContain('id="investment-pmap-wrap"')
    expect(commercialFormHtml).toContain('id="investment-bmap-wrap"')
    expect(commercialFormHtml).toContain('id="commercial-investment-form-status"')
    expect(commercialFormHtml).toContain('id="dkj-face-value"')
    expect(commercialFormHtml).toContain('id="pmap-previous-year-inflation-pct"')
    expect(commercialFormHtml).toContain('id="commercial-investment-maturity-preview-help"')
  })

  it('keeps adapter input ids present in the commercial investment form markup', () => {
    for (const adapter of Object.values(DKJ_FRONTEND_FIELD_ADAPTER)) {
      expect(commercialFormHtml).toContain(`id="${adapter.inputId}"`)
    }
    for (const adapter of Object.values(PMAP_FRONTEND_FIELD_ADAPTER)) {
      expect(commercialFormHtml).toContain(`id="${adapter.inputId}"`)
    }
    for (const adapter of Object.values(BMAP_FRONTEND_FIELD_ADAPTER)) {
      expect(commercialFormHtml).toContain(`id="${adapter.inputId}"`)
    }
  })

  it('exposes both simplified and commercial investment entry points in the shell', () => {
    expect(indexHtml).toContain('id="open-investment-box"')
    expect(indexHtml).toContain('id="open-commercial-investment-box"')
    expect(indexHtml).toContain('data-add-type="investment"')
    expect(indexHtml).toContain('data-add-type="commercial-investment"')
    expect(indexHtml).toContain('id="commercial-investment-box"')
  })
})
