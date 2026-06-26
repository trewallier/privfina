import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export interface PmapProductSpec {
  specVersion: 'v1alpha1'
  kind: 'financial-product'
  id: 'government-security.pmap.standard'
  family: 'government-security'
  variant: 'pmap'
}

export function parsePmapProductSpecYaml(yamlText: string): unknown {
  return YAML.parse(yamlText)
}

function buildValidationError(errors: string[]): Error {
  return new Error(`Product spec validation failed: ${errors.join('; ')}`)
}

export function validatePmapProductSpec(productSpec: unknown, productSchema: unknown): void {
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

function assertValidPmapProductSpec(spec: unknown): asserts spec is PmapProductSpec {
  const candidate = spec as Partial<PmapProductSpec>
  if (candidate.id !== 'government-security.pmap.standard') {
    throw new Error('Product spec id must be government-security.pmap.standard.')
  }
  if (candidate.family !== 'government-security' || candidate.variant !== 'pmap') {
    throw new Error('Product spec must describe government-security/pmap family and variant.')
  }
}

export function loadPmapProductSpecYamlFromFiles(rootDir = '.'): PmapProductSpec {
  const productSpecPath = resolve(rootDir, 'docs/product-specs/products/government-securities/pmap/product.yaml')
  const productSchemaPath = resolve(rootDir, 'docs/product-specs/schema/v1/product.schema.json')

  const yamlText = readFileSync(productSpecPath, 'utf8')
  const productSchemaText = readFileSync(productSchemaPath, 'utf8')
  const productSchema = JSON.parse(productSchemaText)

  const parsed = parsePmapProductSpecYaml(yamlText)
  validatePmapProductSpec(parsed, productSchema)
  assertValidPmapProductSpec(parsed)
  return parsed
}