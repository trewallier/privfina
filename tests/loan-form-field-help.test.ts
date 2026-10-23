import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import { FIXED_RATE_LOAN_PRODUCT_SPEC } from '../public/controller/fixed-rate-loan-form.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function extractLoanFormHtml(indexHtml: string): string {
  const match = indexHtml.match(/<form id="loan-form">[\s\S]*?<\/form>/)
  if (!match) {
    throw new Error('loan-form not found in index.html')
  }
  return match[0]
}

function extractHelpText(formHtml: string, helpId: string): string {
  const helpMatch = formHtml.match(new RegExp(`id="${helpId}"[\\s\\S]*?<p>([\\s\\S]*?)<\\/p>`))
  if (!helpMatch) {
    throw new Error(`Help block not found for ${helpId}`)
  }
  return helpMatch[1].replace(/\s+/g, ' ').trim()
}

const LOAN_FIELD_HELP_EXPECTATIONS: Array<{ inputId: string; helpId: string; text: string }> = [
  {
    inputId: 'loan-label',
    helpId: 'loan-label-help',
    text: 'Display name for this loan in the configured instruments list.'
  },
  {
    inputId: 'loan-start-date',
    helpId: 'loan-start-date-help',
    text: 'Date the loan starts and interest begins to accrue.'
  },
  {
    inputId: 'loan-principal',
    helpId: 'loan-principal-help',
    text: 'Initial borrowed amount used for amortization.'
  },
  {
    inputId: 'loan-annual-rate',
    helpId: 'loan-annual-rate-help',
    text: 'Nominal annual fixed interest rate in percent.'
  },
  {
    inputId: 'loan-term-value',
    helpId: 'loan-term-value-help',
    text: 'Loan duration count; combined with term unit to get total months, including any grace period.'
  },
  {
    inputId: 'loan-term-unit',
    helpId: 'loan-term-unit-help',
    text: 'Whether the term value is measured in months or years.'
  },
  {
    inputId: 'loan-repayment-day',
    helpId: 'loan-repayment-day-help',
    text: 'Calendar day used for each scheduled monthly repayment.'
  },
  {
    inputId: 'loan-category',
    helpId: 'loan-category-help',
    text: 'Optional tag for grouping this instrument in lists and reports.'
  },
  {
    inputId: 'loan-description',
    helpId: 'loan-description-help',
    text: 'Optional free-text notes for this loan.'
  },
  {
    inputId: 'loan-include-disbursement',
    helpId: 'loan-include-disbursement-help',
    text: 'When enabled, records the principal as an inflow on the start date.'
  },
  {
    inputId: 'loan-grace-period-months',
    helpId: 'loan-grace-period-months-help',
    text: 'Optional months at the start before amortizing repayments begin. Defaults to 0.'
  },
  {
    inputId: 'loan-capitalize-interest-at-grace-end',
    helpId: 'loan-capitalize-interest-at-grace-end-help',
    text: 'With a positive grace period, adds unpaid grace interest to principal at grace end instead of interest-only payments.'
  },
  {
    inputId: 'loan-monthly-preview',
    helpId: 'loan-monthly-preview-help',
    text: 'Estimated constant monthly payment after any grace period.'
  },
  {
    inputId: 'loan-total-repayment-preview',
    helpId: 'loan-total-repayment-preview-help',
    text: 'Estimated sum of all scheduled payments over the full term.'
  },
  {
    inputId: 'loan-total-interest-preview',
    helpId: 'loan-total-interest-preview-help',
    text: 'Estimated total interest cost over the full term.'
  }
]

describe('loan form field info popups', () => {
  const indexHtml = readRepoFile('public/index.html')
  const loanFormHtml = extractLoanFormHtml(indexHtml)
  const appController = readRepoFile('public/app-controller.js')

  it('provides an info chip and hidden help copy for every loan form field', () => {
    for (const field of LOAN_FIELD_HELP_EXPECTATIONS) {
      expect(loanFormHtml).toContain(`id="${field.inputId}"`)
      expect(loanFormHtml).toContain(`data-help-button="${field.helpId}"`)
      expect(loanFormHtml).toContain(`id="${field.helpId}"`)
      expect(extractHelpText(loanFormHtml, field.helpId)).toBe(field.text)
    }
  })

  it('keeps loan help markup on the investment-style label-title + info-chip pattern', () => {
    expect(loanFormHtml).toMatch(
      /class="label-title"><span class="loan-field-label">Principal<\/span>\s*<button type="button" class="info-chip" data-help-button="loan-principal-help"/
    )
    expect(loanFormHtml).toMatch(
      /class="label-title"><span class="loan-field-label">Capitalize Interest at End of Grace<\/span>\s*<button type="button" class="info-chip" data-help-button="loan-capitalize-interest-at-grace-end-help"/
    )
  })

  it('wires loan form info chips through the shared floating info popup handler', () => {
    expect(appController).toContain('document.getElementById(helpId)')
    expect(appController).toContain('loanForm')
    expect(appController).toContain('investmentForm')
    expect(appController).toContain('commercialLoanForm')
    expect(appController).toContain('commercialInvestmentForm')
    expect(appController).toContain("form.querySelectorAll('[data-help-button]')")
    expect(appController).toContain('toggleInvestmentInfoPopup(button)')
  })

  it('aligns product-spec field descriptions with loan info popup copy for mapped inputs', () => {
    const productYaml = YAML.parse(
      readRepoFile('docs/product-specs/products/loans/fixed-rate-loan/product.yaml')
    ) as { inputs: Array<{ name: string; description: string }> }

    const byName = new Map(productYaml.inputs.map((field) => [field.name, field.description]))

    expect(byName.get('principal')).toBe(extractHelpText(loanFormHtml, 'loan-principal-help'))
    expect(byName.get('annualInterestRatePct')).toBe(extractHelpText(loanFormHtml, 'loan-annual-rate-help'))
    expect(byName.get('startDate')).toBe(extractHelpText(loanFormHtml, 'loan-start-date-help'))
    expect(byName.get('gracePeriodMonths')).toBe(
      extractHelpText(loanFormHtml, 'loan-grace-period-months-help')
    )
    expect(byName.get('capitalizeInterestAtGraceEnd')).toBe(
      extractHelpText(loanFormHtml, 'loan-capitalize-interest-at-grace-end-help')
    )

    expect(FIXED_RATE_LOAN_PRODUCT_SPEC.inputs.find((field) => field.name === 'principal')?.description).toBe(
      byName.get('principal')
    )
  })
})
