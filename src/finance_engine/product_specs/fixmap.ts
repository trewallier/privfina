import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export interface FixmapProductSpec {
  specVersion: 'v2alpha3'
  kind: 'financial-product'
  id: 'government-security.fixmap.standard'
  family: 'government-security'
  variant: 'fixmap'
  productCode: 'fixmap'
}

export function parseFixmapProductSpecYaml(yamlText: string): unknown {
  return YAML.parse(yamlText)
}

function buildValidationError(errors: string[]): Error {
  return new Error(`Product spec validation failed: ${errors.join('; ')}`)
}

export function validateFixmapProductSpec(productSpec: unknown, productSchema: unknown): void {
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

function assertValidFixmapProductSpec(spec: unknown): asserts spec is FixmapProductSpec {
  const candidate = spec as Partial<FixmapProductSpec>
  if (candidate.id !== 'government-security.fixmap.standard') {
    throw new Error('Product spec id must be government-security.fixmap.standard.')
  }
  if (candidate.family !== 'government-security' || candidate.variant !== 'fixmap') {
    throw new Error('Product spec must describe government-security/fixmap family and variant.')
  }
}

export function loadFixmapProductSpecYamlFromFiles(rootDir = '.'): FixmapProductSpec {
  const productSpecPath = resolve(
    rootDir,
    'docs/product-specs/products/government-securities/fixmap/product.yaml'
  )
  const productSchemaPath = resolve(rootDir, 'docs/product-specs/schema/v2/product.schema.json')

  const yamlText = readFileSync(productSpecPath, 'utf8')
  const productSchemaText = readFileSync(productSchemaPath, 'utf8')
  const productSchema = JSON.parse(productSchemaText)

  const parsed = parseFixmapProductSpecYaml(yamlText)
  validateFixmapProductSpec(parsed, productSchema)
  assertValidFixmapProductSpec(parsed)
  return parsed
}
