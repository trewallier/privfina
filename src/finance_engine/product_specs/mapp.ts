import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export interface MappProductSpec {
  specVersion: 'v2alpha3'
  kind: 'financial-product'
  id: 'government-security.mapp.standard'
  family: 'government-security'
  variant: 'mapp'
  productCode: 'mapp'
}

export function parseMappProductSpecYaml(yamlText: string): unknown {
  return YAML.parse(yamlText)
}

function buildValidationError(errors: string[]): Error {
  return new Error(`Product spec validation failed: ${errors.join('; ')}`)
}

export function validateMappProductSpec(productSpec: unknown, productSchema: unknown): void {
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

function assertValidMappProductSpec(spec: unknown): asserts spec is MappProductSpec {
  const candidate = spec as Partial<MappProductSpec>
  if (candidate.id !== 'government-security.mapp.standard') {
    throw new Error('Product spec id must be government-security.mapp.standard.')
  }
  if (candidate.family !== 'government-security' || candidate.variant !== 'mapp') {
    throw new Error('Product spec must describe government-security/mapp family and variant.')
  }
}

export function loadMappProductSpecYamlFromFiles(rootDir = '.'): MappProductSpec {
  const productSpecPath = resolve(
    rootDir,
    'docs/product-specs/products/government-securities/mapp/product.yaml'
  )
  const productSchemaPath = resolve(rootDir, 'docs/product-specs/schema/v2/product.schema.json')

  const yamlText = readFileSync(productSpecPath, 'utf8')
  const productSchemaText = readFileSync(productSchemaPath, 'utf8')
  const productSchema = JSON.parse(productSchemaText)

  const parsed = parseMappProductSpecYaml(yamlText)
  validateMappProductSpec(parsed, productSchema)
  assertValidMappProductSpec(parsed)
  return parsed
}
