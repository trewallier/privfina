import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyFieldChrome, INFO_CHIP_SIZE_PX } from '../public/controller/field-chrome.js'
import {
  FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER,
  FIXED_RATE_LOAN_OUTPUT_FIELD_ADAPTER,
  FIXED_RATE_LOAN_PRODUCT_SPEC,
  FIXED_RATE_LOAN_UI_FIELD_CHROME
} from '../public/controller/fixed-rate-loan-form.js'
import {
  COMMERCIAL_LOAN_FIELD_CHROME,
  resolveCommercialLoanFieldRequired
} from '../public/controller/commercial-loan-field-help.js'
import {
  HOME_SAVINGS_FIELD_CHROME,
  resolveHomeSavingsFieldRequired
} from '../public/controller/home-savings-field-help.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function extractStyleBlock(indexHtml: string): string {
  const match = indexHtml.match(/<style>([\s\S]*?)<\/style>/)
  if (!match) {
    throw new Error('style block not found in index.html')
  }
  return match[1]
}

function extractCssRuleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  if (!match) {
    throw new Error(`CSS rule not found for selector: ${selector}`)
  }
  return match[1]
}

describe('info-chip size consistency', () => {
  const indexHtml = readRepoFile('public/index.html')
  const css = extractStyleBlock(indexHtml)

  it('keeps INFO_CHIP_SIZE_PX aligned with the CSS custom property', () => {
    expect(INFO_CHIP_SIZE_PX).toBe(18)
    expect(css).toMatch(/--info-chip-size:\s*18px/)
  })

  it('defines button.info-chip after generic button padding so chips cannot collapse', () => {
    const buttonPaddingIdx = css.search(/button\s*\{[\s\S]*?padding:\s*9px\s+12px/)
    const infoChipIdx = css.search(/button\.info-chip\s*\{/)
    expect(buttonPaddingIdx).toBeGreaterThanOrEqual(0)
    expect(infoChipIdx).toBeGreaterThan(buttonPaddingIdx)

    const body = extractCssRuleBody(css, 'button.info-chip')
    expect(body).toMatch(/min-width:\s*var\(--info-chip-size\)/)
    expect(body).toMatch(/min-height:\s*var\(--info-chip-size\)/)
    expect(body).toMatch(/max-width:\s*var\(--info-chip-size\)/)
    expect(body).toMatch(/max-height:\s*var\(--info-chip-size\)/)
    expect(body).toMatch(/flex(?:-shrink)?:\s*0/)
    expect(body).toMatch(/padding:\s*0/)
    expect(body).toMatch(/box-sizing:\s*border-box/)
  })

  it('keeps info-chip hover soft after generic button:hover', () => {
    const buttonHoverIdx = css.search(/button:hover\s*\{/)
    const infoChipHoverIdx = css.search(/button\.info-chip:hover\s*\{/)
    expect(buttonHoverIdx).toBeGreaterThanOrEqual(0)
    expect(infoChipHoverIdx).toBeGreaterThan(buttonHoverIdx)
    expect(extractCssRuleBody(css, 'button.info-chip:hover')).toMatch(
      /background:\s*var\(--accent-soft\)/
    )
  })

  it('prevents role markers from shrinking in the label row', () => {
    expect(extractCssRuleBody(css, '.field-role-marker')).toMatch(/flex-shrink:\s*0/)
  })

  it('defines auto and unavailable role-marker styles', () => {
    expect(extractCssRuleBody(css, ".field-role-marker[data-role='auto']")).toMatch(
      /background:\s*#eef8f1/
    )
    expect(extractCssRuleBody(css, ".field-role-marker[data-role='unavailable']")).toMatch(
      /background:\s*#fff3ea/
    )
  })

  it('keeps a shared form-control min-height and date calendar affordance', () => {
    expect(css).toMatch(/--form-control-min-height:\s*calc\(1\.25em \+ 16px \+ 2px\)/)
    expect(css).toMatch(/min-height:\s*var\(--form-control-min-height\)/)
    expect(css).toMatch(/input\[type="date"\]::-webkit-calendar-picker-indicator/)
  })

  it('keeps folder-toggle free of accent fill / sticky iOS hover tint', () => {
    expect(extractCssRuleBody(css, '.folder-toggle')).toMatch(/background:\s*transparent/)
    expect(extractCssRuleBody(css, '.folder-toggle')).toMatch(
      /-webkit-tap-highlight-color:\s*transparent/
    )
    expect(css).toMatch(
      /\.folder-toggle:(?:hover|focus|focus-visible|active)[\s\S]*?background:\s*transparent/
    )
  })
})

describe('loan composer required/optional/calculated chrome', () => {
  const fixedRateLoanFormSrc = readRepoFile('public/controller/fixed-rate-loan-form.js')
  const commercialLoanFieldHelpSrc = readRepoFile('public/controller/commercial-loan-field-help.js')
  const commercialLoanFormSrc = readRepoFile('public/controller/commercial-loan-form.js')

  it('applies shared applyFieldChrome in the simplified loan composer', () => {
    expect(fixedRateLoanFormSrc).toContain("from './field-chrome.js'")
    expect(fixedRateLoanFormSrc).toContain('applyFieldChrome(')
    expect(fixedRateLoanFormSrc).toMatch(/role:\s*'output'/)
    expect(fixedRateLoanFormSrc).toMatch(/labelClassName:\s*'loan-field-label'/)
  })

  it('covers every simplified loan input/output with chrome metadata', () => {
    const specInputIds = Object.values(FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER).map(
      (entry) => entry.inputId
    )
    const uiInputIds = FIXED_RATE_LOAN_UI_FIELD_CHROME.map((entry) => entry.inputId)
    const outputInputIds = Object.values(FIXED_RATE_LOAN_OUTPUT_FIELD_ADAPTER).map(
      (entry) => entry.inputId
    )

    for (const field of FIXED_RATE_LOAN_PRODUCT_SPEC.inputs) {
      expect(FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER[field.name]).toBeTruthy()
    }

    expect(new Set([...specInputIds, ...uiInputIds, ...outputInputIds]).size).toBe(
      specInputIds.length + uiInputIds.length + outputInputIds.length
    )

    const requiredSpec = FIXED_RATE_LOAN_PRODUCT_SPEC.inputs.filter((field) => field.required)
    const optionalSpec = FIXED_RATE_LOAN_PRODUCT_SPEC.inputs.filter((field) => !field.required)
    expect(requiredSpec.map((field) => field.name)).toEqual(
      expect.arrayContaining(['principal', 'annualInterestRatePct', 'termMonths', 'startDate'])
    )
    expect(optionalSpec.map((field) => field.name)).toEqual(
      expect.arrayContaining(['gracePeriodMonths', 'capitalizeInterestAtGraceEnd'])
    )
    expect(FIXED_RATE_LOAN_UI_FIELD_CHROME.every((field) => field.required === false)).toBe(true)
    expect(Object.keys(FIXED_RATE_LOAN_OUTPUT_FIELD_ADAPTER)).toEqual(
      expect.arrayContaining(['monthlyPayment', 'totalPaid', 'totalInterest'])
    )
  })

  it('applies shared applyFieldChrome in the commercial loan composer', () => {
    expect(commercialLoanFieldHelpSrc).toContain("from './field-chrome.js'")
    expect(commercialLoanFieldHelpSrc).toContain('applyFieldChrome(')
    expect(commercialLoanFormSrc).toContain('applyCommercialLoanFieldChrome(form, product)')
  })

  it('marks commercial loan fields required/optional/calculated consistently', () => {
    const byId = Object.fromEntries(
      COMMERCIAL_LOAN_FIELD_CHROME.map((entry) => [entry.inputId, entry])
    )

    expect(byId['commercial-loan-principal'].required).toBe(true)
    expect(byId['commercial-loan-label'].required).toBe(false)
    expect(byId['commercial-loan-monthly-preview'].role).toBe('output')
    expect(byId['commercial-loan-thm-preview'].role).toBe('output')

    expect(
      resolveCommercialLoanFieldRequired(byId['commercial-loan-grace-period-months'], {
        graceRequired: true
      })
    ).toBe(true)
    expect(
      resolveCommercialLoanFieldRequired(byId['commercial-loan-grace-period-months'], {
        graceRequired: false
      })
    ).toBe(false)
  })
})

describe('home-savings composer required/optional/calculated chrome', () => {
  const homeSavingsFieldHelpSrc = readRepoFile('public/controller/home-savings-field-help.js')
  const homeSavingsFormSrc = readRepoFile('public/controller/home-savings-form.js')
  const indexHtml = readRepoFile('public/index.html')

  it('applies shared applyFieldChrome in the home-savings composer', () => {
    expect(homeSavingsFieldHelpSrc).toContain("from './field-chrome.js'")
    expect(homeSavingsFieldHelpSrc).toContain('applyFieldChrome(')
    expect(homeSavingsFormSrc).toContain('applyHomeSavingsFieldChrome(form, product)')
    expect(homeSavingsFieldHelpSrc).toMatch(/labelClassName:\s*'field-label'/)
    expect(indexHtml).toMatch(/home-savings[\s\S]*class="field-label"/)
  })

  it('marks home-savings fields required/optional/calculated consistently', () => {
    const byId = Object.fromEntries(
      HOME_SAVINGS_FIELD_CHROME.map((entry) => [entry.inputId, entry])
    )

    expect(byId['home-savings-monthly-deposit'].required).toBe(true)
    expect(byId['home-savings-contract-amount'].required).toBe(false)
    expect(byId['home-savings-label'].required).toBe(false)
    expect(byId['home-savings-opening-fee-preview'].role).toBe('output')
    expect(byId['home-savings-ebkm-preview'].role).toBe('output')
    expect(byId['home-savings-housing-purpose'].required).toBe(true)

    expect(resolveHomeSavingsFieldRequired(byId['home-savings-term-months'], {})).toBe(true)
    expect(HOME_SAVINGS_FIELD_CHROME.filter((entry) => entry.role === 'output')).toHaveLength(8)
    expect(HOME_SAVINGS_FIELD_CHROME.every((entry) => entry.inputId.startsWith('home-savings-'))).toBe(
      true
    )
  })

  it('dedupes field-label spans when chrome class differs from HTML class', () => {
    const fieldChromeSrc = readRepoFile('public/controller/field-chrome.js')
    expect(fieldChromeSrc).toContain('FIELD_LABEL_CLASS_SELECTOR')
    expect(fieldChromeSrc).toMatch(/node\.remove\(\)/)
  })

  it('supports auto and unavailable markers in applyFieldChrome source', () => {
    const fieldChromeSrc = readRepoFile('public/controller/field-chrome.js')
    expect(fieldChromeSrc).toContain("marker.textContent = 'auto'")
    expect(fieldChromeSrc).toContain("marker.textContent = 'unavailable'")
    expect(fieldChromeSrc).toContain("marker.dataset.role = 'auto'")
    expect(fieldChromeSrc).toContain("marker.dataset.role = 'unavailable'")
    // Keep import used for future DOM chrome tests.
    expect(typeof applyFieldChrome).toBe('function')
  })

  it('makes auto-populated inputs read-only while keeping selects FormData-safe', () => {
    const fieldChromeSrc = readRepoFile('public/controller/field-chrome.js')
    expect(fieldChromeSrc).toContain('function setControlMarketReadonly')
    expect(fieldChromeSrc).toContain('setControlMarketReadonly(control, true)')
    expect(fieldChromeSrc).toContain('control.readOnly = Boolean(readonly)')
    expect(fieldChromeSrc).toContain("control.tagName === 'SELECT'")
    expect(fieldChromeSrc).toContain("control.style.pointerEvents = readonly ? 'none' : ''")
  })
})
