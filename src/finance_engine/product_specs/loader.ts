import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loadFixedRateLoanProductSpec } from './fixed_rate_loan'
import {
  loadHomeSavingsProductSpec,
  type HomeSavingsProductSpec
} from './home_savings'
import {
  loadMortgageLoanProductSpec,
  type MortgageLoanProductSpec
} from './mortgage_loan'

export const DEFAULT_FIXED_RATE_LOAN_PRODUCT_SPEC_PATH =
  'docs/product-specs/products/loans/fixed-rate-loan/product.yaml'
export const DEFAULT_PRODUCT_SCHEMA_PATH = 'docs/product-specs/schema/v2/product.schema.json'

export const MORTGAGE_LOAN_PRODUCT_SPEC_PATHS = {
  'otp-1x1': 'docs/product-specs/products/loans/otp-1x1/product.yaml',
  'otp-zold': 'docs/product-specs/products/loans/otp-zold/product.yaml',
  'vegig-fix': 'docs/product-specs/products/loans/vegig-fix/product.yaml',
  'csok-plusz': 'docs/product-specs/products/loans/csok-plusz/product.yaml',
  'falusi-csok': 'docs/product-specs/products/loans/falusi-csok/product.yaml',
  'otthon-start': 'docs/product-specs/products/loans/otthon-start/product.yaml',
  'videki-otthonfelujitasi':
    'docs/product-specs/products/loans/videki-otthonfelujitasi/product.yaml',
  'fixed-rate-mortgage': 'docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml'
} as const

export type MortgageLoanProductCode = keyof typeof MORTGAGE_LOAN_PRODUCT_SPEC_PATHS

export const HOME_SAVINGS_PRODUCT_SPEC_PATHS = {
  'premium-plusz-10x30':
    'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
  'premium-plusz-4x10':
    'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
  'premium-plusz-8x30':
    'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
  'premium-4x10': 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
  'premium-8x30': 'docs/product-specs/products/home-savings/premium-8x30/product.yaml'
} as const

export type HomeSavingsProductCode = keyof typeof HOME_SAVINGS_PRODUCT_SPEC_PATHS

export interface ProductSpecFieldDefinition {
  name: string
  type: string
  label: string
  required: boolean
  unit?: string
  description?: string
  constraints?: Record<string, unknown>
}

export interface ProductSpecUiSection {
  id: string
  title: string
  fieldNames: string[]
}

export interface NormalizedFixedRateLoanProductSpec {
  specVersion: string
  kind: string
  id: string
  family: string
  variant: string
  productCode: string
  displayName: string
  engine: Record<string, unknown>
  inputs: ProductSpecFieldDefinition[]
  outputs: ProductSpecFieldDefinition[]
  ui: {
    formTitle: string
    sections: ProductSpecUiSection[]
  }
  derivedVariables?: ProductSpecFieldDefinition[]
  assumptions?: string[]
  exampleRefs?: string[]
}

export interface FixedRateLoanProductSpecLoaderOptions {
  rootDir?: string
  productSpecPath?: string
  productSchemaPath?: string
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`)
  }
  return value
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`)
  }
  return value
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`)
  }
  return value.map((entry, index) => asString(entry, `${label}[${index}]`))
}

function asFieldDefinitions(value: unknown, label: string): ProductSpecFieldDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`)
  }

  return value.map((entry, index) => {
    const field = asObject(entry, `${label}[${index}]`)
    const constraints = field.constraints

    return {
      name: asString(field.name, `${label}[${index}].name`),
      type: asString(field.type, `${label}[${index}].type`),
      label: asString(field.label, `${label}[${index}].label`),
      required: asBoolean(field.required, `${label}[${index}].required`),
      unit: typeof field.unit === 'string' ? field.unit : undefined,
      description: typeof field.description === 'string' ? field.description : undefined,
      constraints: constraints && typeof constraints === 'object' && !Array.isArray(constraints)
        ? (constraints as Record<string, unknown>)
        : undefined
    }
  })
}

function asUiSections(value: unknown, label: string): ProductSpecUiSection[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`)
  }

  return value.map((entry, index) => {
    const section = asObject(entry, `${label}[${index}]`)

    return {
      id: asString(section.id, `${label}[${index}].id`),
      title: asString(section.title, `${label}[${index}].title`),
      fieldNames: asStringArray(section.fieldNames, `${label}[${index}].fieldNames`)
    }
  })
}

function normalizeFixedRateLoanProductSpec(spec: unknown): NormalizedFixedRateLoanProductSpec {
  const candidate = asObject(spec, 'Fixed-rate loan product spec')
  const ui = asObject(candidate.ui, 'ui')

  return {
    specVersion: asString(candidate.specVersion, 'specVersion'),
    kind: asString(candidate.kind, 'kind'),
    id: asString(candidate.id, 'id'),
    family: asString(candidate.family, 'family'),
    variant: asString(candidate.variant, 'variant'),
    productCode: asString(candidate.productCode, 'productCode'),
    displayName: asString(candidate.displayName, 'displayName'),
    engine: asObject(candidate.engine, 'engine'),
    inputs: asFieldDefinitions(candidate.inputs, 'inputs'),
    outputs: asFieldDefinitions(candidate.outputs, 'outputs'),
    ui: {
      formTitle: asString(ui.formTitle, 'ui.formTitle'),
      sections: asUiSections(ui.sections, 'ui.sections')
    },
    derivedVariables: candidate.derivedVariables
      ? asFieldDefinitions(candidate.derivedVariables, 'derivedVariables')
      : undefined,
    assumptions: candidate.assumptions
      ? asStringArray(candidate.assumptions, 'assumptions')
      : undefined,
    exampleRefs: candidate.exampleRefs
      ? asStringArray(candidate.exampleRefs, 'exampleRefs')
      : undefined
  }
}

function readUtf8File(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8')
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read file at ${filePath}: ${details}`)
  }
}

function readJsonFile(filePath: string): unknown {
  const text = readUtf8File(filePath)
  try {
    return JSON.parse(text)
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse JSON at ${filePath}: ${details}`)
  }
}

export function loadFixedRateLoanProductSpecFromFiles(
  options: FixedRateLoanProductSpecLoaderOptions = {}
): NormalizedFixedRateLoanProductSpec {
  const rootDir = options.rootDir ?? '.'
  const productSpecPath = resolve(rootDir, options.productSpecPath ?? DEFAULT_FIXED_RATE_LOAN_PRODUCT_SPEC_PATH)
  const productSchemaPath = resolve(rootDir, options.productSchemaPath ?? DEFAULT_PRODUCT_SCHEMA_PATH)

  const productYamlText = readUtf8File(productSpecPath)
  const productSchema = readJsonFile(productSchemaPath)

  try {
    const validated = loadFixedRateLoanProductSpec(productYamlText, productSchema)
    return normalizeFixedRateLoanProductSpec(validated)
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to load fixed-rate loan product spec from ${productSpecPath} using schema ${productSchemaPath}: ${details}`
    )
  }
}

export interface MortgageLoanProductSpecLoaderOptions {
  rootDir?: string
  productSpecPath?: string
  productSchemaPath?: string
  productCode?: MortgageLoanProductCode
}

export function loadMortgageLoanProductSpecFromFiles(
  options: MortgageLoanProductSpecLoaderOptions = {}
): MortgageLoanProductSpec {
  const rootDir = options.rootDir ?? '.'
  const productCode = options.productCode ?? 'otp-1x1'
  const defaultPath = MORTGAGE_LOAN_PRODUCT_SPEC_PATHS[productCode]
  const productSpecPath = resolve(rootDir, options.productSpecPath ?? defaultPath)
  const productSchemaPath = resolve(rootDir, options.productSchemaPath ?? DEFAULT_PRODUCT_SCHEMA_PATH)

  const productYamlText = readUtf8File(productSpecPath)
  const productSchema = readJsonFile(productSchemaPath)

  try {
    return loadMortgageLoanProductSpec(productYamlText, productSchema)
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to load mortgage-loan product spec from ${productSpecPath} using schema ${productSchemaPath}: ${details}`
    )
  }
}

export interface HomeSavingsProductSpecLoaderOptions {
  rootDir?: string
  productSpecPath?: string
  productSchemaPath?: string
  productCode?: HomeSavingsProductCode
}

export function loadHomeSavingsProductSpecFromFiles(
  options: HomeSavingsProductSpecLoaderOptions = {}
): HomeSavingsProductSpec {
  const rootDir = options.rootDir ?? '.'
  const productCode = options.productCode ?? 'premium-plusz-10x30'
  const defaultPath = HOME_SAVINGS_PRODUCT_SPEC_PATHS[productCode]
  const productSpecPath = resolve(rootDir, options.productSpecPath ?? defaultPath)
  const productSchemaPath = resolve(rootDir, options.productSchemaPath ?? DEFAULT_PRODUCT_SCHEMA_PATH)

  const productYamlText = readUtf8File(productSpecPath)
  const productSchema = readJsonFile(productSchemaPath)

  try {
    return loadHomeSavingsProductSpec(productYamlText, productSchema)
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to load home-savings product spec from ${productSpecPath} using schema ${productSchemaPath}: ${details}`
    )
  }
}