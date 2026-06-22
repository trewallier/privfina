import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export interface DkjProductSpec {
  specVersion: 'v1alpha1'
  kind: 'financial-product'
  id: 'government-security.dkj.standard'
  family: 'government-security'
  variant: 'dkj'
}

export function parseDkjProductSpecYaml(yamlText: string): unknown {
  return YAML.parse(yamlText)
}

function buildValidationError(errors: string[]): Error {
  return new Error(`Product spec validation failed: ${errors.join('; ')}`)
}

export function validateDkjProductSpec(productSpec: unknown, productSchema: unknown): void {
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

function assertValidDkjProductSpec(spec: unknown): asserts spec is DkjProductSpec {
  const candidate = spec as Partial<DkjProductSpec>
  if (candidate.id !== 'government-security.dkj.standard') {
    throw new Error('Product spec id must be government-security.dkj.standard.')
  }
  if (candidate.family !== 'government-security' || candidate.variant !== 'dkj') {
    throw new Error('Product spec must describe government-security/dkj family and variant.')
  }
}

export function loadDkjProductSpecYamlFromFiles(rootDir = '.'): DkjProductSpec {
  const productSpecPath = resolve(rootDir, 'docs/product-specs/products/government-securities/dkj/product.yaml')
  const productSchemaPath = resolve(rootDir, 'docs/product-specs/schema/v1/product.schema.json')

  const yamlText = readFileSync(productSpecPath, 'utf8')
  const productSchemaText = readFileSync(productSchemaPath, 'utf8')
  const productSchema = JSON.parse(productSchemaText)

  const parsed = parseDkjProductSpecYaml(yamlText)
  validateDkjProductSpec(parsed, productSchema)
  assertValidDkjProductSpec(parsed)
  return parsed
}

export interface DkjSpecInputs {
  faceValue: number
  purchasePricePct: number
  termMonths: number
  settlementDate: string
  maturityDate?: string
  remainingDays?: number
}

export function mapDkjSpecInputsToInvestmentInput(specInputs: DkjSpecInputs) {
  const faceValue = Number(specInputs.faceValue)
  const purchasePricePct = Number(specInputs.purchasePricePct)
  if (!Number.isFinite(faceValue) || faceValue <= 0) {
    throw new Error('faceValue must be a positive number')
  }
  if (!Number.isFinite(purchasePricePct) || purchasePricePct <= 0) {
    throw new Error('purchasePricePct must be a positive number')
  }

  const purchasePrice = (faceValue * purchasePricePct) / 100

  return {
    subtype: 'discount-bond',
    principal: faceValue,
    purchasePrice,
    issueDate: String(specInputs.settlementDate || '').trim(),
    transactionDate: String(specInputs.settlementDate || '').trim(),
    dueDate: typeof specInputs.maturityDate === 'string' ? specInputs.maturityDate : undefined
  }
}
