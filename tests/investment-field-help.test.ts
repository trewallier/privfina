import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import { DKJ_PRODUCT_SPEC, DKJ_FRONTEND_FIELD_ADAPTER } from '../public/controller/dkj-form.js'
import { BMAP_PRODUCT_SPEC, BMAP_FRONTEND_FIELD_ADAPTER } from '../public/controller/bmap-form.js'
import {
  FIXMAP_PRODUCT_SPEC,
  FIXMAP_FRONTEND_FIELD_ADAPTER
} from '../public/controller/fixmap-form.js'
import { PMAP_PRODUCT_SPEC, PMAP_FRONTEND_FIELD_ADAPTER } from '../public/controller/pmap-form.js'

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

function assertEmbeddedInputDescriptionsMatchYaml(
  embeddedSpec: { inputs: Array<{ name: string; description?: string }> },
  yamlSpec: { inputs: Array<{ name: string; description?: string }> }
) {
  const embeddedByName = new Map(embeddedSpec.inputs.map((field) => [field.name, field]))
  for (const field of yamlSpec.inputs) {
    const embedded = embeddedByName.get(field.name)
    if (!embedded) continue
    expect(embedded.description).toBe(field.description)
  }
}

describe('investment field help and dedicated hosts', () => {
  const indexHtml = readRepoFile('public/index.html')
  const simplifiedFormHtml = extractFormHtml(indexHtml, 'investment-form')
  const commercialFormHtml = extractFormHtml(indexHtml, 'commercial-investment-form')

  it('keeps embedded DKJ/BMAP/PMAP/FixMÁP input descriptions aligned with YAML', () => {
    const dkj = YAML.parse(
      readRepoFile('docs/product-specs/products/government-securities/dkj/product.yaml')
    ) as any
    const bmap = YAML.parse(
      readRepoFile('docs/product-specs/products/government-securities/bmap/product.yaml')
    ) as any
    const pmap = YAML.parse(
      readRepoFile('docs/product-specs/products/government-securities/pmap/product.yaml')
    ) as any
    const fixmap = YAML.parse(
      readRepoFile('docs/product-specs/products/government-securities/fixmap/product.yaml')
    ) as any

    expect(DKJ_PRODUCT_SPEC.specVersion).toBe(dkj.specVersion)
    expect(BMAP_PRODUCT_SPEC.specVersion).toBe(bmap.specVersion)
    expect(PMAP_PRODUCT_SPEC.specVersion).toBe(pmap.specVersion)
    expect(FIXMAP_PRODUCT_SPEC.specVersion).toBe(fixmap.specVersion)

    assertEmbeddedInputDescriptionsMatchYaml(DKJ_PRODUCT_SPEC, dkj)
    assertEmbeddedInputDescriptionsMatchYaml(BMAP_PRODUCT_SPEC, bmap)
    assertEmbeddedInputDescriptionsMatchYaml(PMAP_PRODUCT_SPEC, pmap)
    assertEmbeddedInputDescriptionsMatchYaml(FIXMAP_PRODUCT_SPEC, fixmap)
  })

  it('keeps investment-field-help.js free of product field maps', () => {
    const helpSource = readRepoFile('public/controller/investment-field-help.js')
    expect(helpSource).toContain('SHARED_INVESTMENT_UI_HELP')
    expect(helpSource).not.toMatch(/\bDKJ_FIELD_HELP\b/)
    expect(helpSource).not.toMatch(/\bBMAP_FIELD_HELP\b/)
    expect(helpSource).not.toMatch(/\bPMAP_FIELD_HELP\b/)
    expect(helpSource).not.toMatch(/\bFIXMAP_FIELD_HELP\b/)
    expect(helpSource).not.toMatch(/\bgetDkjFieldHelp\b/)
    expect(helpSource).not.toMatch(/\bgetBmapFieldHelp\b/)
    expect(helpSource).not.toMatch(/\bgetPmapFieldHelp\b/)
  })

  it('keeps generic bond subtypes on the simplified investment form', () => {
    expect(simplifiedFormHtml).toContain('id="investment-subtype"')
    expect(simplifiedFormHtml).toContain('value="regular-bond"')
    expect(simplifiedFormHtml).toContain('value="discount-bond"')
    expect(simplifiedFormHtml).toContain('value="inflation-linked-bond"')
    expect(simplifiedFormHtml).toContain('value="custom-bond"')
    expect(simplifiedFormHtml).not.toContain('id="investment-dkj-wrap"')
    expect(simplifiedFormHtml).not.toContain('id="investment-pmap-wrap"')
    expect(simplifiedFormHtml).not.toContain('id="investment-fixmap-wrap"')
    expect(simplifiedFormHtml).not.toContain('id="investment-bmap-wrap"')
    expect(simplifiedFormHtml).toContain('id="investment-form-status"')
    expect(simplifiedFormHtml).toContain('data-help-button="investment-category-help"')
  })

  it('hosts DKJ/PMAP/FixMÁP/BMAP on the commercial investment form', () => {
    expect(commercialFormHtml).toContain('id="commercial-investment-product"')
    expect(commercialFormHtml).not.toContain('id="commercial-investment-readiness-hint"')
    expect(commercialFormHtml).not.toMatch(/Readiness:\s*fully-spec-backed/)
    expect(commercialFormHtml).toContain('id="investment-dkj-wrap"')
    expect(commercialFormHtml).toContain('id="investment-pmap-wrap"')
    expect(commercialFormHtml).toContain('id="investment-fixmap-wrap"')
    expect(commercialFormHtml).toContain('id="investment-bmap-wrap"')
    expect(commercialFormHtml).toContain('id="commercial-investment-form-status"')
    expect(commercialFormHtml).toContain('id="dkj-face-value"')
    expect(commercialFormHtml).toContain('id="pmap-annual-coupon-rate-pct"')
    expect(commercialFormHtml).toContain('id="pmap-maturity-date"')
    expect(commercialFormHtml).toContain('id="fixmap-annual-coupon-rate-pct"')
    expect(commercialFormHtml).toContain('id="fixmap-maturity-date"')
    expect(commercialFormHtml).toContain('id="bmap-annual-coupon-rate-pct"')
    expect(commercialFormHtml).toContain('id="bmap-maturity-date"')
    expect(commercialFormHtml).toContain('id="commercial-investment-maturity-preview-help"')
  })

  it('keeps adapter input ids present in the commercial investment form markup', () => {
    for (const adapter of Object.values(DKJ_FRONTEND_FIELD_ADAPTER)) {
      expect(commercialFormHtml).toContain(`id="${adapter.inputId}"`)
    }
    for (const adapter of Object.values(PMAP_FRONTEND_FIELD_ADAPTER)) {
      expect(commercialFormHtml).toContain(`id="${adapter.inputId}"`)
    }
    for (const adapter of Object.values(FIXMAP_FRONTEND_FIELD_ADAPTER)) {
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
