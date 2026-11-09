import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export interface BabaProductSpec {
  specVersion: 'v2alpha3'
  kind: 'financial-product'
  id: 'government-security.baba.standard'
  family: 'government-security'
  variant: 'baba'
  productCode: 'baba'
}

export function parseBabaProductSpecYaml(yamlText: string): unknown {
  return YAML.parse(yamlText)
}

function buildValidationError(errors: string[]): Error {
  return new Error(`Product spec validation failed: ${errors.join('; ')}`)
}

export function validateBabaProductSpec(productSpec: unknown, productSchema: unknown): void {
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

function assertValidBabaProductSpec(spec: unknown): asserts spec is BabaProductSpec {
  const candidate = spec as Partial<BabaProductSpec>
  if (candidate.id !== 'government-security.baba.standard') {
    throw new Error('Product spec id must be government-security.baba.standard.')
  }
  if (candidate.family !== 'government-security' || candidate.variant !== 'baba') {
    throw new Error('Product spec must describe government-security/baba family and variant.')
  }
}

export function loadBabaProductSpecYamlFromFiles(rootDir = '.'): BabaProductSpec {
  const productSpecPath = resolve(
    rootDir,
    'docs/product-specs/products/government-securities/baba/product.yaml'
  )
  const productSchemaPath = resolve(rootDir, 'docs/product-specs/schema/v2/product.schema.json')

  const yamlText = readFileSync(productSpecPath, 'utf8')
  const productSchemaText = readFileSync(productSchemaPath, 'utf8')
  const productSchema = JSON.parse(productSchemaText)

  const parsed = parseBabaProductSpecYaml(yamlText)
  validateBabaProductSpec(parsed, productSchema)
  assertValidBabaProductSpec(parsed)
  return parsed
}
