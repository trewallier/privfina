import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export interface BmapProductSpec {
  specVersion: 'v1alpha1'
  kind: 'financial-product'
  id: 'government-security.bmap.standard'
  family: 'government-security'
  variant: 'bmap'
}

function buildValidationError(errors: string[]): Error {
  return new Error(`Product spec validation failed: ${errors.join('; ')}`)
}

export function parseBmapProductSpecYaml(yamlText: string): unknown {
  return YAML.parse(yamlText)
}

export function validateBmapProductSpec(productSpec: unknown, productSchema: unknown): void {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validate = ajv.compile(productSchema as object)
  const valid = validate(productSpec)

  if (!valid) {
    const errors = (validate.errors ?? []).map((entry) => {
      const path = entry.instancePath || '/'
      return `${path} ${entry.message ?? 'is invalid'}`
    })
    throw buildValidationError(errors)
  }
}

function assertValidBmapProductSpec(spec: unknown): asserts spec is BmapProductSpec {
  const candidate = spec as Partial<BmapProductSpec>
  if (candidate.id !== 'government-security.bmap.standard') {
    throw new Error('Product spec id must be government-security.bmap.standard.')
  }
  if (candidate.family !== 'government-security' || candidate.variant !== 'bmap') {
    throw new Error('Product spec must describe government-security/bmap family and variant.')
  }
}

export function loadBmapProductSpecYamlFromFiles(rootDir = '.'): BmapProductSpec {
  const productSpecPath = resolve(rootDir, 'docs/product-specs/products/government-securities/bmap/product.yaml')
  const productSchemaPath = resolve(rootDir, 'docs/product-specs/schema/v1/product.schema.json')

  const yamlText = readFileSync(productSpecPath, 'utf8')
  const productSchemaText = readFileSync(productSchemaPath, 'utf8')
  const productSchema = JSON.parse(productSchemaText)

  const parsed = parseBmapProductSpecYaml(yamlText)
  validateBmapProductSpec(parsed, productSchema)
  assertValidBmapProductSpec(parsed)
  return parsed
}