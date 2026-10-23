import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  applyCommercialLoanFieldHelpToForm,
  getCommercialLoanFieldHelp
} from '../public/controller/commercial-loan-field-help.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function extractCommercialLoanFormHtml(indexHtml: string): string {
  const match = indexHtml.match(/<form id="commercial-loan-form">[\s\S]*?<\/form>/)
  if (!match) {
    throw new Error('commercial-loan-form not found in index.html')
  }
  return match[0]
}

describe('commercial loan schema field info hints', () => {
  const indexHtml = readRepoFile('public/index.html')
  const formHtml = extractCommercialLoanFormHtml(indexHtml)
  const appController = readRepoFile('public/app-controller.js')

  it('exposes info chips and help blocks for commercial inputs and outputs', () => {
    const helpIds = [
      'commercial-loan-product-help',
      'commercial-loan-principal-help',
      'commercial-loan-annual-rate-help',
      'commercial-loan-term-months-help',
      'commercial-loan-grace-period-months-help',
      'commercial-loan-purpose-help',
      'commercial-loan-monthly-preview-help',
      'commercial-loan-total-repayment-preview-help',
      'commercial-loan-total-interest-preview-help',
      'commercial-loan-fees-preview-help',
      'commercial-loan-thm-preview-help'
    ]

    for (const helpId of helpIds) {
      expect(formHtml).toContain(`data-help-button="${helpId}"`)
      expect(formHtml).toContain(`id="${helpId}"`)
    }
  })

  it('wires commercial loan info chips through the shared floating info popup handler', () => {
    expect(appController).toContain('commercialLoanForm')
    expect(appController).toContain('commercialInvestmentForm')
    expect(appController).toContain("form.querySelectorAll('[data-help-button]')")
    expect(appController).toContain('toggleInvestmentInfoPopup(button)')
  })

  it('aligns otp-1x1 product.yaml descriptions with commercial field help', () => {
    const productYaml = YAML.parse(
      readRepoFile('docs/product-specs/products/loans/otp-1x1/product.yaml')
    ) as {
      inputs: Array<{ name: string; description: string }>
      outputs: Array<{ name: string; description: string }>
    }

    const help = getCommercialLoanFieldHelp('otp-1x1')
    const inputs = new Map(productYaml.inputs.map((field) => [field.name, field.description]))
    const outputs = new Map(productYaml.outputs.map((field) => [field.name, field.description]))

    expect(help.principal).toBe(inputs.get('principal'))
    expect(help.annualInterestRatePct).toBe(inputs.get('annualInterestRatePct'))
    expect(help.termMonths).toBe(inputs.get('termMonths'))
    expect(help.startDate).toBe(inputs.get('startDate'))
    expect(help.loanPurpose).toBe(inputs.get('loanPurpose'))
    expect(help.monthlyPayment).toBe(outputs.get('monthlyPayment'))
    expect(help.totalInterest).toBe(outputs.get('totalInterest'))
    expect(help.totalPaid).toBe(outputs.get('totalPaid'))
    expect(help.thmPct).toBe(outputs.get('thmPct'))
  })

  it('updates help paragraph copy when a product is applied to the form', () => {
    const paragraphs = new Map<string, { textContent: string }>()
    const form = {
      querySelector(selector: string) {
        if (!selector.startsWith('#')) {
          return null
        }
        const id = selector.slice(1)
        let paragraph = paragraphs.get(id)
        if (!paragraph) {
          paragraph = { textContent: '' }
          paragraphs.set(id, paragraph)
        }
        return {
          id,
          querySelector(inner: string) {
            return inner === 'p' ? paragraph : null
          }
        }
      }
    }

    applyCommercialLoanFieldHelpToForm(form as unknown as HTMLFormElement, 'csok-plusz')
    const help = getCommercialLoanFieldHelp('csok-plusz')
    expect(paragraphs.get('commercial-loan-principal-help')?.textContent).toBe(help.principal)
    expect(paragraphs.get('commercial-loan-grace-period-months-help')?.textContent).toBe(
      help.gracePeriodMonths
    )
  })
})
