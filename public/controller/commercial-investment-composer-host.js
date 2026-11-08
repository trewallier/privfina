/**
 * Commercial investment composer host — UI orchestration extracted from
 * app-controller (ADR 0040). Family productCode trees remain here until the
 * registry layer; adapters + instruments.js own calculation.
 */
import { createInvestmentPreviewSync } from './previews.js'
import {
  BMAP_PRODUCT_SPEC,
  applyBmapSpecToForm,
  setBmapFieldVisibility,
  mapFormDataToBmapSpecInputs
} from './bmap-form.js'
import {
  calculateBmapFromSpecInputs,
  generateBmapInstrumentBundleFromSpecInputs
} from './bmap-calculation-adapter.js'
import {
  DKJ_PRODUCT_SPEC,
  applyDkjSpecToForm,
  setDkjFieldVisibility,
  mapFormDataToDkjSpecInputs,
  mapDkjSpecInputsToInvestmentBundleInput
} from './dkj-form.js'
import { calculateDkjFromSpecInputs } from './dkj-calculation-adapter.js'
import {
  PMAP_PRODUCT_SPEC,
  applyPmapSpecToForm,
  setPmapFieldVisibility,
  mapFormDataToPmapSpecInputs,
  generatePmapInstrumentBundleFromSpecInputs
} from './pmap-form.js'
import { calculatePmapFromSpecInputs } from './pmap-calculation-adapter.js'
import {
  FIXMAP_PRODUCT_SPEC,
  applyFixmapSpecToForm,
  setFixmapFieldVisibility,
  mapFormDataToFixmapSpecInputs,
  generateFixmapInstrumentBundleFromSpecInputs
} from './fixmap-form.js'
import { calculateFixmapFromSpecInputs } from './fixmap-calculation-adapter.js'
import {
  buildCommercialInvestmentProductOptions,
  findCommercialInvestmentProduct
} from './investment-product-metadata.js'
import {
  applyFieldChrome,
  setFormStatus,
  clearFieldValidity,
  applyInvestmentFieldValidity
} from './field-chrome.js'
import {
  formatMoneyAmount as formatMoneyAmountDefault,
  isMultipleOfDenomination
} from './money-format.js'
import {
  createMarketDataLoader,
  latestQuoteForId,
  resolveQuoteForPurchaseDate
} from './market-data-loader.js'
import {
  MARKET_MARKETABLE_REQUIRED_FIELDS,
  budapestTodayIso,
  buildMarketAutofillPatch,
  formatOfferingAttributionDisclaimer,
  formatPurchaseOutsideSaleWindowHint,
  formatSeriesMaturityStatusHint,
  formatSeriesOptionLabel,
  marketableFieldsMissingFromPatch,
  resolveSaleWindow
} from './market-data-autofill.js'
import {
  browserTodayIso,
  ensureDefaultPurchaseDateValue,
  resolveSeriesSelectValue
} from './market-data-composer.js'
import {
  migrateBmapConfigForEdit,
  migratePmapConfigForEdit,
  migrateFixmapConfigForEdit
} from './govsec-config-migrate.js'

const COMMERCIAL_INVESTMENT_FAMILY_TITLE = 'Commercial Investment'
const COMMERCIAL_INVESTMENT_PRODUCT_OPTIONS = buildCommercialInvestmentProductOptions()

function createCommercialInvestmentComposerHost({
  formatMoneyAmount = formatMoneyAmountDefault,
  getInstrumentBundles,
  upsertInstrumentBundle,
  openComposerBox,
  collapseComposerBoxes,
  notifySaved,
  rerender,
  extendDateRange,
  reportError,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentBundle,
  closeInfoPopup
} = {}) {
  const commercialInvestmentForm = document.getElementById('commercial-investment-form')
  const commercialInvestmentBox = document.getElementById('commercial-investment-box')
  const commercialInvestmentProductInput = document.getElementById(
    'commercial-investment-product'
  )
  const commercialInvestmentMarketRow = document.getElementById(
    'commercial-investment-market-row'
  )
  const commercialInvestmentSeriesInput = document.getElementById(
    'commercial-investment-series'
  )
  const commercialInvestmentMarketHint = document.getElementById(
    'commercial-investment-market-hint'
  )
  const commercialInvestmentMarketAttribution = document.getElementById(
    'commercial-investment-market-attribution'
  )
  const commercialInvestmentFormStatus = document.getElementById(
    'commercial-investment-form-status'
  )
  const commercialInvestmentSubmitButton = document.getElementById(
    'commercial-investment-submit'
  )
  const commercialInvestmentCancelButton = document.getElementById(
    'commercial-investment-cancel-edit'
  )
const marketDataLoader = createMarketDataLoader()
let commercialMarketFamilyState = {
  family: null,
  series: [],
  latest: null,
  available: false,
  asOf: null,
  generatedAt: null,
  couponsById: {},
  offeringsById: {},
  priceCalendar: null
}

function formatCommercialMarketUpdatedHint(generatedAt) {
  if (!generatedAt) {
    return ''
  }
  const raw = String(generatedAt).trim()
  if (!raw) {
    return ''
  }
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) {
    return `Database updated ${raw}`
  }
  const dateLabel = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(parsed)
  return `Database updated ${dateLabel}`
}

function buildCommercialMarketSeriesHint({
  series = null,
  quote = null,
  clampDate = null,
  clampReason = null
} = {}) {
  const parts = []
  if (series) {
    parts.push(formatSeriesMaturityStatusHint(series))
  }
  const lastPriceDay = quote?.d || null
  if (lastPriceDay) {
    parts.push(`Last market price ${lastPriceDay}`)
  }
  const updated = formatCommercialMarketUpdatedHint(commercialMarketFamilyState.generatedAt)
  if (updated) {
    parts.push(updated)
  } else if (commercialMarketFamilyState.asOf && !lastPriceDay) {
    parts.push(`Market data as of ${commercialMarketFamilyState.asOf}`)
  }
  if (clampDate) {
    if (clampReason === 'no_price') {
      parts.push(
        `No treasury prices that day (weekend/holiday) — purchase/settlement clamped to ${clampDate}`
      )
    } else if (clampReason === 'fetch_failed') {
      parts.push(
        `Price calendar fetch incomplete for that day — purchase/settlement clamped to ${clampDate}`
      )
    } else {
      parts.push(`Purchase/settlement clamped to ${clampDate}`)
    }
  }
  return parts.join(' · ')
}
const commercialInvestmentDiscountYieldWrap = document.getElementById(
  'commercial-investment-discount-yield-wrap'
)
const commercialInvestmentDiscountCurrentValueWrap = document.getElementById(
  'commercial-investment-discount-current-value-wrap'
)
const commercialInvestmentInflationScheduleWrap = document.getElementById(
  'commercial-investment-inflation-schedule-wrap'
)
const commercialInvestmentPurchasePreviewInput = document.getElementById(
  'commercial-investment-purchase-preview'
)
const commercialInvestmentMaturityPreviewInput = document.getElementById(
  'commercial-investment-maturity-preview'
)
const commercialInvestmentGainPreviewInput = document.getElementById(
  'commercial-investment-gain-preview'
)
const commercialInvestmentDiscountYieldPreviewInput = document.getElementById(
  'commercial-investment-discount-yield-preview'
)
const commercialInvestmentDiscountCurrentValuePreviewInput = document.getElementById(
  'commercial-investment-discount-current-value-preview'
)
const commercialInvestmentInflationSchedulePreviewInput = document.getElementById(
  'commercial-investment-inflation-schedule-preview'
)
const bmapPrincipalInput = document.getElementById('bmap-principal')
const bmapAnnualCouponRatePctInput = document.getElementById('bmap-annual-coupon-rate-pct')
const bmapMaturityDateInput = document.getElementById('bmap-maturity-date')
const bmapPurchaseDateInput = document.getElementById('bmap-purchase-date')
const bmapIssueDateInput = document.getElementById('bmap-issue-date')
const bmapFirstCouponDateInput = document.getElementById('bmap-first-coupon-date')
const dkjFaceValueInput = document.getElementById('dkj-face-value')
const dkjPurchasePricePctInput = document.getElementById('dkj-purchase-price-pct')
const dkjTermMonthsInput = document.getElementById('dkj-term-months')
const dkjSettlementDateInput = document.getElementById('dkj-settlement-date')
const dkjMaturityDateInput = document.getElementById('dkj-maturity-date')
const dkjRemainingDaysInput = document.getElementById('dkj-remaining-days')
const pmapPrincipalInput = document.getElementById('pmap-principal')
const pmapAnnualCouponRatePctInput = document.getElementById('pmap-annual-coupon-rate-pct')
const pmapMaturityDateInput = document.getElementById('pmap-maturity-date')
const pmapPurchaseDateInput = document.getElementById('pmap-purchase-date')
const pmapIssueDateInput = document.getElementById('pmap-issue-date')
const pmapFirstCouponDateInput = document.getElementById('pmap-first-coupon-date')
const fixmapPrincipalInput = document.getElementById('fixmap-principal')
const fixmapAnnualCouponRatePctInput = document.getElementById('fixmap-annual-coupon-rate-pct')
const fixmapMaturityDateInput = document.getElementById('fixmap-maturity-date')
const fixmapPurchaseDateInput = document.getElementById('fixmap-purchase-date')
const fixmapIssueDateInput = document.getElementById('fixmap-issue-date')
const fixmapFirstCouponDateInput = document.getElementById('fixmap-first-coupon-date')

  let commercialMarketApplyToken = 0
  let editingCommercialInvestmentId = null

  function setElementVisible(element, visible) {
    if (element) {
      element.hidden = !visible
    }
  }
function setCommercialInvestmentFamilyTitle() {
  if (!commercialInvestmentBox) return
  const summaryTitle = commercialInvestmentBox.querySelector('.summary-title')
  if (summaryTitle) {
    summaryTitle.textContent = COMMERCIAL_INVESTMENT_FAMILY_TITLE
  }
}
function rebuildCommercialInvestmentProductOptions() {
  if (!commercialInvestmentProductInput) return
  const previousValue = commercialInvestmentProductInput.value || 'dkj'
  commercialInvestmentProductInput.innerHTML = ''
  COMMERCIAL_INVESTMENT_PRODUCT_OPTIONS.filter((entry) => entry.available).forEach((entry) => {
    const option = document.createElement('option')
    option.value = entry.value
    option.textContent = entry.label
    commercialInvestmentProductInput.appendChild(option)
  })
  const availableValues = new Set(
    COMMERCIAL_INVESTMENT_PRODUCT_OPTIONS.map((entry) => entry.value)
  )
  commercialInvestmentProductInput.value = availableValues.has(previousValue)
    ? previousValue
    : COMMERCIAL_INVESTMENT_PRODUCT_OPTIONS[0]?.value || 'dkj'
}
function setCommercialInvestmentFormStatus(message, level = 'info') {
  setFormStatus(commercialInvestmentFormStatus, message, level)
}

function clearCommercialInvestmentFormErrors() {
  clearFieldValidity(commercialInvestmentForm)
  setCommercialInvestmentFormStatus('', 'info')
}

function reportCommercialInvestmentFormError(message) {
  const textMessage = String(message || 'Failed to save commercial investment.')
  applyInvestmentFieldValidity(commercialInvestmentForm, textMessage)
  setCommercialInvestmentFormStatus(textMessage, 'error')
}

/**
 * Blur snaps amounts to denominationUnit; submit still rejects non-multiples
 * (e.g. paste + Enter without blur).
 */
function assertCommercialInvestmentDenomination(productCode, formData) {
  if (productCode === 'dkj') {
    const unit = DKJ_PRODUCT_SPEC.denominationUnit
    const faceValue = formData.get('faceValue')
    if (
      !isMultipleOfDenomination(faceValue, unit, {
        minimum: unit
      })
    ) {
      throw new Error(`Face value must be a multiple of ${formatMoneyAmount(unit, { fractionDigits: 0 })} HUF.`)
    }
    return
  }
  if (productCode === 'pmap' || productCode === 'bmap' || productCode === 'fixmap') {
    const unit =
      productCode === 'pmap'
        ? PMAP_PRODUCT_SPEC.denominationUnit
        : productCode === 'fixmap'
          ? FIXMAP_PRODUCT_SPEC.denominationUnit
          : BMAP_PRODUCT_SPEC.denominationUnit
    const principal = formData.get('principal')
    if (!isMultipleOfDenomination(principal, unit, { minimum: unit })) {
      throw new Error(
        `Principal must be a multiple of ${formatMoneyAmount(unit, { fractionDigits: 0 })} HUF.`
      )
    }
  }
}

function setCommercialMarketHint(message, visible = Boolean(message)) {
  if (!commercialInvestmentMarketHint) {
    return
  }
  commercialInvestmentMarketHint.textContent = message || ''
  commercialInvestmentMarketHint.hidden = !visible
}

function setCommercialMarketAttribution({ calendar = null, offering = null } = {}) {
  if (!commercialInvestmentMarketAttribution) {
    return
  }
  const priceDisclaimer =
    calendar &&
    calendar.source &&
    typeof calendar.source.disclaimer === 'string' &&
    calendar.source.disclaimer.trim()
      ? calendar.source.disclaimer.trim()
      : ''
  const offeringDisclaimer = formatOfferingAttributionDisclaimer(offering)
  const disclaimer = [priceDisclaimer, offeringDisclaimer].filter(Boolean).join(' ')
  commercialInvestmentMarketAttribution.textContent = disclaimer
  commercialInvestmentMarketAttribution.hidden = !disclaimer
}

function setCommercialMarketRowVisible(visible) {
  if (commercialInvestmentMarketRow) {
    commercialInvestmentMarketRow.hidden = !visible
  }
  if (!visible) {
    setCommercialMarketHint('', false)
    setCommercialMarketAttribution({})
  }
}

function readCommercialMarketCurrentFields(family) {
  if (!commercialInvestmentForm) {
    return {}
  }
  if (family === 'dkj') {
    return {
      faceValue: commercialInvestmentForm.querySelector('#dkj-face-value')?.value || '',
      purchasePricePct:
        commercialInvestmentForm.querySelector('#dkj-purchase-price-pct')?.value || '',
      termMonths: commercialInvestmentForm.querySelector('#dkj-term-months')?.value || '',
      settlementDate: commercialInvestmentForm.querySelector('#dkj-settlement-date')?.value || '',
      maturityDate: commercialInvestmentForm.querySelector('#dkj-maturity-date')?.value || '',
      remainingDays: commercialInvestmentForm.querySelector('#dkj-remaining-days')?.value || ''
    }
  }
  if (family === 'pmap') {
    return {
      principal: commercialInvestmentForm.querySelector('#pmap-principal')?.value || '',
      annualCouponRatePct:
        commercialInvestmentForm.querySelector('#pmap-annual-coupon-rate-pct')?.value || '',
      maturityDate: commercialInvestmentForm.querySelector('#pmap-maturity-date')?.value || '',
      purchaseDate: commercialInvestmentForm.querySelector('#pmap-purchase-date')?.value || '',
      issueDate: commercialInvestmentForm.querySelector('#pmap-issue-date')?.value || '',
      firstCouponDate:
        commercialInvestmentForm.querySelector('#pmap-first-coupon-date')?.value || ''
    }
  }
  if (family === 'fixmap') {
    return {
      principal: commercialInvestmentForm.querySelector('#fixmap-principal')?.value || '',
      annualCouponRatePct:
        commercialInvestmentForm.querySelector('#fixmap-annual-coupon-rate-pct')?.value || '',
      maturityDate: commercialInvestmentForm.querySelector('#fixmap-maturity-date')?.value || '',
      purchaseDate: commercialInvestmentForm.querySelector('#fixmap-purchase-date')?.value || '',
      issueDate: commercialInvestmentForm.querySelector('#fixmap-issue-date')?.value || '',
      firstCouponDate:
        commercialInvestmentForm.querySelector('#fixmap-first-coupon-date')?.value || ''
    }
  }
  if (family === 'bmap') {
    return {
      principal: commercialInvestmentForm.querySelector('#bmap-principal')?.value || '',
      annualCouponRatePct:
        commercialInvestmentForm.querySelector('#bmap-annual-coupon-rate-pct')?.value || '',
      maturityDate: commercialInvestmentForm.querySelector('#bmap-maturity-date')?.value || '',
      purchaseDate: commercialInvestmentForm.querySelector('#bmap-purchase-date')?.value || '',
      issueDate: commercialInvestmentForm.querySelector('#bmap-issue-date')?.value || '',
      firstCouponDate:
        commercialInvestmentForm.querySelector('#bmap-first-coupon-date')?.value || ''
    }
  }
  return {}
}

function commercialMarketFieldSelectors(family) {
  const maps = {
    dkj: {
      purchasePricePct: '#dkj-purchase-price-pct',
      termMonths: '#dkj-term-months',
      maturityDate: '#dkj-maturity-date',
      remainingDays: '#dkj-remaining-days'
    },
    pmap: {
      annualCouponRatePct: '#pmap-annual-coupon-rate-pct',
      maturityDate: '#pmap-maturity-date',
      issueDate: '#pmap-issue-date',
      firstCouponDate: '#pmap-first-coupon-date',
      couponSchedule: '#pmap-coupon-schedule',
      dayCountConvention: '#pmap-day-count-convention'
    },
    fixmap: {
      annualCouponRatePct: '#fixmap-annual-coupon-rate-pct',
      maturityDate: '#fixmap-maturity-date',
      issueDate: '#fixmap-issue-date',
      firstCouponDate: '#fixmap-first-coupon-date',
      couponSchedule: '#fixmap-coupon-schedule',
      dayCountConvention: '#fixmap-day-count-convention'
    },
    bmap: {
      annualCouponRatePct: '#bmap-annual-coupon-rate-pct',
      maturityDate: '#bmap-maturity-date',
      issueDate: '#bmap-issue-date',
      firstCouponDate: '#bmap-first-coupon-date',
      couponSchedule: '#bmap-coupon-schedule',
      dayCountConvention: '#bmap-day-count-convention'
    }
  }
  return maps[family] || null
}

function commercialPurchaseOrSettlementInput(family) {
  if (family === 'dkj') {
    return dkjSettlementDateInput
  }
  if (family === 'pmap') {
    return pmapPurchaseDateInput
  }
  if (family === 'fixmap') {
    return fixmapPurchaseDateInput
  }
  if (family === 'bmap') {
    return bmapPurchaseDateInput
  }
  return null
}

function reapplyCommercialProductFieldChrome(family) {
  if (!commercialInvestmentForm) {
    return
  }
  if (family === 'bmap') {
    applyBmapSpecToForm({
      bmapForm: commercialInvestmentForm,
      bmapBox: commercialInvestmentBox
    })
  } else if (family === 'dkj') {
    applyDkjSpecToForm({
      investmentForm: commercialInvestmentForm,
      investmentBox: commercialInvestmentBox
    })
  } else if (family === 'pmap') {
    applyPmapSpecToForm({
      investmentForm: commercialInvestmentForm,
      investmentBox: commercialInvestmentBox
    })
  } else if (family === 'fixmap') {
    applyFixmapSpecToForm({
      investmentForm: commercialInvestmentForm,
      investmentBox: commercialInvestmentBox
    })
  }
}

function markCommercialMarketFieldChrome(
  family,
  input,
  { auto = false, unavailable = false } = {}
) {
  if (!input) {
    return
  }
  const label = input.closest('label')
  if (!label) {
    return
  }
  const title = label.querySelector('.label-title')
  const labelSpan =
    title?.querySelector(
      '.field-label, .dkj-field-label, .pmap-field-label, .fixmap-field-label, .bmap-field-label'
    ) || null
  const help = label.querySelector('.field-help p')
  const labelClassName =
    labelSpan?.className ||
    (family === 'dkj'
      ? 'dkj-field-label'
      : family === 'pmap'
        ? 'pmap-field-label'
        : family === 'fixmap'
          ? 'fixmap-field-label'
          : family === 'bmap'
            ? 'bmap-field-label'
            : 'field-label')
  applyFieldChrome(
    label,
    {
      label: labelSpan?.textContent?.trim() || input.name || 'Field',
      description: help?.textContent || '',
      required: Boolean(input.required) || input.hasAttribute('required'),
      role: 'input',
      auto,
      unavailable,
      helpId: input.id ? `${input.id}-help` : undefined,
      labelClassName
    },
    input
  )
}

function clearCommercialMarketSourcedFields(family) {
  const map = commercialMarketFieldSelectors(family)
  if (!commercialInvestmentForm || !map) {
    return
  }
  Object.values(map).forEach((selector) => {
    const input = commercialInvestmentForm.querySelector(selector)
    if (!input) {
      return
    }
    delete input.dataset.marketSourced
    input.removeAttribute('title')
  })
  reapplyCommercialProductFieldChrome(family)
}

function syncCommercialMarketFieldChrome(family, sourcedNames = []) {
  const map = commercialMarketFieldSelectors(family)
  if (!commercialInvestmentForm || !map) {
    return
  }
  const sourced = new Set(sourcedNames)
  const marketable = MARKET_MARKETABLE_REQUIRED_FIELDS[family] || []
  reapplyCommercialProductFieldChrome(family)

  marketable.forEach((name) => {
    const selector = map[name]
    if (!selector) {
      return
    }
    const input = commercialInvestmentForm.querySelector(selector)
    if (!input) {
      return
    }
    const isSourced = sourced.has(name)
    const empty = !String(input.value ?? '').trim()
    if (isSourced) {
      input.dataset.marketSourced = 'true'
      input.title = 'Filled from published market data'
      markCommercialMarketFieldChrome(family, input, { auto: true })
    } else if (empty) {
      delete input.dataset.marketSourced
      input.title = 'Not available from published market data'
      markCommercialMarketFieldChrome(family, input, { unavailable: true })
    } else {
      delete input.dataset.marketSourced
      input.removeAttribute('title')
    }
  })
}

function applyCommercialMarketFields(family, fields) {
  if (!commercialInvestmentForm || !fields) {
    return
  }
  const map = commercialMarketFieldSelectors(family)
  if (!map) {
    return
  }
  Object.entries(fields).forEach(([name, value]) => {
    const selector = map[name]
    if (!selector) {
      return
    }
    const input = commercialInvestmentForm.querySelector(selector)
    if (!input) {
      return
    }
    if (name === 'couponSchedule') {
      input.value = Array.isArray(value) ? JSON.stringify(value) : ''
    } else {
      input.value = value == null ? '' : String(value)
    }
    input.dataset.marketSourced = 'true'
    if (input.type !== 'hidden') {
      input.title = 'Filled from published market data'
    }
  })
}

/** Empty marketable inputs not present in the new patch so series switches cannot leave stale rates. */
function clearMarketableFieldsMissingFromPatch(family, sourcedNames = []) {
  const map = commercialMarketFieldSelectors(family)
  if (!commercialInvestmentForm || !map) {
    return
  }
  marketableFieldsMissingFromPatch(family, sourcedNames).forEach((name) => {
    const selector = map[name]
    if (!selector) {
      return
    }
    const input = commercialInvestmentForm.querySelector(selector)
    if (!input) {
      return
    }
    input.value = ''
    delete input.dataset.marketSourced
    input.removeAttribute('title')
  })
}

/**
 * Rebuild series <select>.
 * - Pass `''` / `null` to force Manual entry.
 * - Omit the argument (undefined) to keep the current selection when still available.
 */
function rebuildCommercialMarketSeriesOptions(selectedId) {
  if (!commercialInvestmentSeriesInput) {
    return
  }
  const currentValue = commercialInvestmentSeriesInput.value || ''
  commercialInvestmentSeriesInput.innerHTML = ''
  const manual = document.createElement('option')
  manual.value = ''
  manual.textContent = 'Manual entry'
  commercialInvestmentSeriesInput.appendChild(manual)

  const todayIso = budapestTodayIso()
  commercialMarketFamilyState.series.forEach((entry) => {
    const option = document.createElement('option')
    option.value = entry.id
    option.textContent = formatSeriesOptionLabel(entry, todayIso)
    if (entry.status) {
      option.dataset.status = String(entry.status)
    }
    commercialInvestmentSeriesInput.appendChild(option)
  })

  const available = commercialMarketFamilyState.series.map((entry) => entry.id)
  commercialInvestmentSeriesInput.value = resolveSeriesSelectValue(
    selectedId,
    currentValue,
    available
  )
}

function clearCommercialMarketSelection() {
  if (commercialInvestmentSeriesInput) {
    commercialInvestmentSeriesInput.value = ''
  }
}

function resetCommercialMarketControls() {
  commercialMarketFamilyState = {
    family: null,
    series: [],
    latest: null,
    available: false,
    asOf: null,
    generatedAt: null,
    couponsById: {},
    offeringsById: {},
    priceCalendar: null
  }
  rebuildCommercialMarketSeriesOptions('')
  clearCommercialMarketSelection()
  setCommercialMarketRowVisible(false)
}

async function refreshCommercialMarketFamily(productCode) {
  const code = productCode || commercialInvestmentProductInput?.value || 'dkj'
  const token = ++commercialMarketApplyToken
  const [loaded, priceCalendar] = await Promise.all([
    marketDataLoader.loadFamily(code),
    marketDataLoader.loadPriceCalendar()
  ])
  if (token !== commercialMarketApplyToken) {
    return
  }

  commercialMarketFamilyState = {
    family: code,
    series: loaded.series || [],
    latest: loaded.latest,
    available: Boolean(loaded.available),
    asOf: loaded.asOf,
    generatedAt: loaded.generatedAt || null,
    couponsById: {},
    offeringsById: {},
    priceCalendar: priceCalendar || null
  }

  if (!commercialMarketFamilyState.available) {
    // Preserve a successfully loaded calendar across family soft-fail so the
    // WebKincstár disclaimer still shows when present (ROADMAP §6i / docs/spec.md).
    const calendar = commercialMarketFamilyState.priceCalendar
    resetCommercialMarketControls()
    commercialMarketFamilyState.priceCalendar = calendar
    setCommercialMarketHint(
      'Published market data unavailable — enter fields manually.',
      true
    )
    if (commercialInvestmentMarketRow) {
      commercialInvestmentMarketRow.hidden = false
    }
    if (commercialInvestmentSeriesInput) {
      commercialInvestmentSeriesInput.disabled = true
    }
    setCommercialMarketAttribution({ calendar })
    clearCommercialMarketSourcedFields(code)
    return
  }

  if (commercialInvestmentSeriesInput) {
    commercialInvestmentSeriesInput.disabled = false
  }

  setCommercialMarketRowVisible(true)
  // Product/family refresh always forces Manual entry.
  rebuildCommercialMarketSeriesOptions('')
  const updated = formatCommercialMarketUpdatedHint(commercialMarketFamilyState.generatedAt)
  const idleHint =
    updated ||
    (commercialMarketFamilyState.asOf
      ? `Market data as of ${commercialMarketFamilyState.asOf}`
      : 'Market data loaded')
  setCommercialMarketHint(idleHint, true)
  setCommercialMarketAttribution({ calendar: commercialMarketFamilyState.priceCalendar })
  clearCommercialMarketSourcedFields(code)
}

async function resolveCommercialMarketQuoteLookup(seriesId, requestedDate) {
  const family = commercialMarketFamilyState.family
  if (!family || !seriesId) {
    return null
  }

  const latest = latestQuoteForId(commercialMarketFamilyState.latest?.quotes, seriesId)
  const quotesFile = await marketDataLoader.loadQuotes(family, seriesId)
  return resolveQuoteForPurchaseDate({
    requestedDate,
    latestQuote: latest,
    quotesFile,
    priceCalendar: commercialMarketFamilyState.priceCalendar
  })
}

async function applyCommercialMarketSelection() {
  const token = ++commercialMarketApplyToken
  const family = commercialMarketFamilyState.family
  const seriesId = commercialInvestmentSeriesInput?.value || ''
  if (!family) {
    return
  }
  if (!seriesId) {
    clearCommercialMarketSourcedFields(family)
    const updated = formatCommercialMarketUpdatedHint(commercialMarketFamilyState.generatedAt)
    const idleHint =
      updated ||
      (commercialMarketFamilyState.asOf
        ? `Market data as of ${commercialMarketFamilyState.asOf}`
        : commercialMarketFamilyState.available
          ? 'Market data loaded'
          : '')
    setCommercialMarketHint(idleHint, Boolean(idleHint))
    setCommercialMarketAttribution({ calendar: commercialMarketFamilyState.priceCalendar })
    syncCommercialInvestmentPreview()
    return
  }

  const series =
    commercialMarketFamilyState.series.find((entry) => entry.id === seriesId) || null
  const dateInput = commercialPurchaseOrSettlementInput(family)
  const requestedDate = String(dateInput?.value || '').trim()
  const lookup = await resolveCommercialMarketQuoteLookup(seriesId, requestedDate)
  if (token !== commercialMarketApplyToken) {
    return
  }
  if (commercialInvestmentSeriesInput?.value !== seriesId) {
    return
  }

  // Manual reset when the series has no quote history / latest at all (nearest-date
  // clamp still applies when any history exists for a mismatched purchase date).
  if (!lookup?.quote) {
    if (commercialInvestmentSeriesInput) {
      commercialInvestmentSeriesInput.value = ''
    }
    clearCommercialMarketSourcedFields(family)
    setCommercialMarketHint(
      'No published quote history for the selected series — switched to Manual entry.',
      true
    )
    syncCommercialInvestmentPreview()
    return
  }

  // Clamp purchase/settlement to the nearest valid quote date; never mark it auto.
  if (dateInput && lookup.clamped && lookup.date && dateInput.value !== lookup.date) {
    dateInput.value = lookup.date
  }

  const current = readCommercialMarketCurrentFields(family)
  if (family === 'dkj' && dateInput) {
    current.settlementDate = dateInput.value
  } else if ((family === 'pmap' || family === 'bmap' || family === 'fixmap') && dateInput) {
    current.purchaseDate = dateInput.value
  }

  let coupons = commercialMarketFamilyState.couponsById?.[seriesId] || null
  if (!coupons && (family === 'pmap' || family === 'bmap' || family === 'fixmap')) {
    coupons = await marketDataLoader.loadCoupons(family, seriesId)
    if (token !== commercialMarketApplyToken) {
      return
    }
    if (coupons) {
      commercialMarketFamilyState.couponsById = {
        ...(commercialMarketFamilyState.couponsById || {}),
        [seriesId]: coupons
      }
    }
  }

  const offeringsById = commercialMarketFamilyState.offeringsById || {}
  let offering
  if (Object.prototype.hasOwnProperty.call(offeringsById, seriesId)) {
    offering = offeringsById[seriesId]
  } else {
    offering = await marketDataLoader.loadOffering(family, seriesId)
    if (token !== commercialMarketApplyToken) {
      return
    }
    // Memoize hits and misses (null) so missing offerings do not re-fetch on every apply.
    commercialMarketFamilyState.offeringsById = {
      ...offeringsById,
      [seriesId]: offering
    }
  }

  const patch = buildMarketAutofillPatch({
    family,
    series,
    quote: lookup.quote,
    coupons,
    offering,
    current
  })
  clearMarketableFieldsMissingFromPatch(family, patch.sourced)
  applyCommercialMarketFields(family, patch.fields)
  syncCommercialMarketFieldChrome(family, patch.sourced)
  const periodRate =
    patch.fields.annualCouponRatePct != null &&
    Number.isFinite(Number(patch.fields.annualCouponRatePct))
      ? Number(patch.fields.annualCouponRatePct)
      : null
  const rateHint =
    periodRate != null
      ? `Period kamat ${periodRate.toLocaleString('hu-HU', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 3
        })}%`
      : ''
  const purchaseIso =
    family === 'dkj'
      ? String(current.settlementDate || dateInput?.value || '').trim()
      : String(current.purchaseDate || dateInput?.value || '').trim()
  const saleWindow = resolveSaleWindow(series, offering)
  const windowHint = formatPurchaseOutsideSaleWindowHint(purchaseIso, saleWindow)
  const baseHint = buildCommercialMarketSeriesHint({
    series,
    quote: lookup.quote,
    clampDate: lookup.clamped && lookup.date ? lookup.date : null,
    clampReason: lookup.clamped ? lookup.clampReason || null : null
  })
  const hint = [baseHint, rateHint, windowHint].filter(Boolean).join(' · ')
  setCommercialMarketHint(hint, Boolean(hint))
  setCommercialMarketAttribution({
    calendar: commercialMarketFamilyState.priceCalendar,
    offering
  })
  syncCommercialInvestmentPreview()
}

function ensureDefaultPurchaseDate(input) {
  ensureDefaultPurchaseDateValue(input, browserTodayIso())
}

function applyCommercialInvestmentProductUi(productCode) {
  setCommercialInvestmentFamilyTitle()
  clearCommercialInvestmentFormErrors()

  const code = productCode || commercialInvestmentProductInput?.value || 'dkj'

  void refreshCommercialMarketFamily(code)

  const isBmap = code === 'bmap'
  const isDkj = code === 'dkj'
  const isPmap = code === 'pmap'
  const isFixmap = code === 'fixmap'

  setBmapFieldVisibility(commercialInvestmentForm, isBmap)
  setDkjFieldVisibility(commercialInvestmentForm, isDkj)
  setPmapFieldVisibility(commercialInvestmentForm, isPmap)
  setFixmapFieldVisibility(commercialInvestmentForm, isFixmap)

  const bmapInputs = [
    bmapPrincipalInput,
    bmapAnnualCouponRatePctInput,
    bmapMaturityDateInput,
    bmapPurchaseDateInput,
    bmapIssueDateInput,
    bmapFirstCouponDateInput
  ]
  const dkjInputs = [
    dkjFaceValueInput,
    dkjPurchasePricePctInput,
    dkjTermMonthsInput,
    dkjSettlementDateInput,
    dkjMaturityDateInput,
    dkjRemainingDaysInput
  ]
  const pmapInputs = [
    pmapPrincipalInput,
    pmapAnnualCouponRatePctInput,
    pmapMaturityDateInput,
    pmapPurchaseDateInput,
    pmapIssueDateInput,
    pmapFirstCouponDateInput
  ]
  const fixmapInputs = [
    fixmapPrincipalInput,
    fixmapAnnualCouponRatePctInput,
    fixmapMaturityDateInput,
    fixmapPurchaseDateInput,
    fixmapIssueDateInput,
    fixmapFirstCouponDateInput
  ]

  ;[...bmapInputs, ...dkjInputs, ...pmapInputs, ...fixmapInputs].forEach((input) => {
    if (!input) return
    input.disabled = true
    input.required = false
  })

  // Seed face/principal defaults only on create; edit populate overwrites afterward.
  const setAmountDefaultIfEmpty = !editingCommercialInvestmentId

  if (isBmap) {
    bmapInputs.forEach((input) => {
      if (input) input.disabled = false
    })
    applyBmapSpecToForm({
      bmapForm: commercialInvestmentForm,
      bmapBox: commercialInvestmentBox,
      setAmountDefaultIfEmpty
    })
    ensureDefaultPurchaseDate(bmapPurchaseDateInput)
    setElementVisible(commercialInvestmentDiscountYieldWrap, false)
    setElementVisible(commercialInvestmentDiscountCurrentValueWrap, false)
    setElementVisible(commercialInvestmentInflationScheduleWrap, false)
    return
  }

  if (isDkj) {
    dkjInputs.forEach((input) => {
      if (input) input.disabled = false
    })
    applyDkjSpecToForm({
      investmentForm: commercialInvestmentForm,
      investmentBox: commercialInvestmentBox,
      setAmountDefaultIfEmpty
    })
    setElementVisible(commercialInvestmentDiscountYieldWrap, true)
    setElementVisible(commercialInvestmentDiscountCurrentValueWrap, true)
    setElementVisible(commercialInvestmentInflationScheduleWrap, false)
    return
  }

  if (isPmap) {
    pmapInputs.forEach((input) => {
      if (input) input.disabled = false
    })
    applyPmapSpecToForm({
      investmentForm: commercialInvestmentForm,
      investmentBox: commercialInvestmentBox,
      setAmountDefaultIfEmpty
    })
    ensureDefaultPurchaseDate(pmapPurchaseDateInput)
    setElementVisible(commercialInvestmentDiscountYieldWrap, false)
    setElementVisible(commercialInvestmentDiscountCurrentValueWrap, false)
    setElementVisible(commercialInvestmentInflationScheduleWrap, true)
    return
  }

  if (isFixmap) {
    fixmapInputs.forEach((input) => {
      if (input) input.disabled = false
    })
    applyFixmapSpecToForm({
      investmentForm: commercialInvestmentForm,
      investmentBox: commercialInvestmentBox,
      setAmountDefaultIfEmpty
    })
    ensureDefaultPurchaseDate(fixmapPurchaseDateInput)
    setElementVisible(commercialInvestmentDiscountYieldWrap, false)
    setElementVisible(commercialInvestmentDiscountCurrentValueWrap, false)
    setElementVisible(commercialInvestmentInflationScheduleWrap, true)
  }
}
const commercialInvestmentPreviewController = createInvestmentPreviewSync({
  form: commercialInvestmentForm,
  subtypeInput: commercialInvestmentProductInput,
  purchasePreviewInput: commercialInvestmentPurchasePreviewInput,
  maturityPreviewInput: commercialInvestmentMaturityPreviewInput,
  gainPreviewInput: commercialInvestmentGainPreviewInput,
  discountYieldPreviewInput: commercialInvestmentDiscountYieldPreviewInput,
  discountCurrentValuePreviewInput: commercialInvestmentDiscountCurrentValuePreviewInput,
  inflationSchedulePreviewInput: commercialInvestmentInflationSchedulePreviewInput,
  createInvestmentMaturityPreview,
  calculateDkjFromSpecInputs,
  mapFormDataToDkjSpecInputs,
  calculatePmapFromSpecInputs,
  mapFormDataToPmapSpecInputs,
  calculateFixmapFromSpecInputs,
  mapFormDataToFixmapSpecInputs,
  calculateBmapFromSpecInputs,
  mapFormDataToBmapSpecInputs,
  onPreviewError: (message) => {
    applyInvestmentFieldValidity(commercialInvestmentForm, message)
    setCommercialInvestmentFormStatus(message, 'warning')
  },
  onPreviewSuccess: () => {
    clearFieldValidity(commercialInvestmentForm)
    if (commercialInvestmentFormStatus?.dataset.level === 'warning') {
      setCommercialInvestmentFormStatus('', 'info')
    }
  },
  extraInputs: [
    dkjFaceValueInput,
    dkjPurchasePricePctInput,
    dkjTermMonthsInput,
    dkjSettlementDateInput,
    dkjMaturityDateInput,
    dkjRemainingDaysInput,
    pmapPrincipalInput,
    pmapAnnualCouponRatePctInput,
    pmapMaturityDateInput,
    pmapPurchaseDateInput,
    pmapIssueDateInput,
    pmapFirstCouponDateInput,
    fixmapPrincipalInput,
    fixmapAnnualCouponRatePctInput,
    fixmapMaturityDateInput,
    fixmapPurchaseDateInput,
    fixmapIssueDateInput,
    fixmapFirstCouponDateInput,
    bmapPrincipalInput,
    bmapAnnualCouponRatePctInput,
    bmapMaturityDateInput,
    bmapPurchaseDateInput,
    bmapIssueDateInput,
    bmapFirstCouponDateInput
  ]
})
const { syncInvestmentPreview: syncCommercialInvestmentPreview } =
  commercialInvestmentPreviewController

  function persistCommercialBundle(bundle) {
    if (!bundle || !bundle.generatedFlows || !bundle.generatedFlows.length) {
      throw new Error(
        'Investment inputs did not produce any cash flows. Check required dates and amounts.'
      )
    }
    upsertInstrumentBundle?.(bundle)
    const firstDate = bundle.generatedFlows[0].date
    const lastDate = bundle.generatedFlows[bundle.generatedFlows.length - 1].date
    extendDateRange?.(firstDate, lastDate)
    clearCommercialInvestmentFormErrors()
    resetForm()
    notifySaved?.('Commercial investment saved.')
    collapseComposerBoxes?.()
    rerender?.()
  }
function resetForm() {
  editingCommercialInvestmentId = null
  if (commercialInvestmentForm) {
    commercialInvestmentForm.reset()
  }
  clearCommercialInvestmentFormErrors()
  if (commercialInvestmentProductInput && commercialInvestmentProductInput.options.length > 0) {
    commercialInvestmentProductInput.value = commercialInvestmentProductInput.options[0].value
  }
  resetCommercialMarketControls()
  applyCommercialInvestmentProductUi()
  closeInfoPopup?.()
  if (commercialInvestmentSubmitButton) {
    commercialInvestmentSubmitButton.textContent = 'Add Commercial Investment'
  }
  if (commercialInvestmentCancelButton) {
    commercialInvestmentCancelButton.hidden = true
  }
  syncCommercialInvestmentPreview()
}
function resolveCommercialInvestmentProductCode(bundle) {
  if (!bundle) return null
  const config = bundle.config || {}
  const productId = bundle.productId || config.productId
  if (productId === BMAP_PRODUCT_SPEC.id || config.subtype === 'bmap') return 'bmap'
  if (productId === DKJ_PRODUCT_SPEC.id || config.subtype === 'dkj') return 'dkj'
  if (productId === PMAP_PRODUCT_SPEC.id || config.subtype === 'pmap') return 'pmap'
  if (productId === FIXMAP_PRODUCT_SPEC.id || config.subtype === 'fixmap') return 'fixmap'
  return null
}
function startEdit(id) {
  const bundle = (getInstrumentBundles?.() || []).find(
    (entry) => entry.id === id && entry.instrumentType === 'investment'
  )
  if (!bundle || !commercialInvestmentForm) {
    return
  }

  const productCode = resolveCommercialInvestmentProductCode(bundle)
  if (!productCode) {
    return
  }

  const config = bundle.config || {}
  const product = findCommercialInvestmentProduct(productCode)
  editingCommercialInvestmentId = id
  commercialInvestmentProductInput.value = productCode
  commercialInvestmentForm.querySelector('#commercial-investment-label').value =
    bundle.label || product?.spec?.ui?.formTitle || product?.spec?.displayName || 'Investment'
  commercialInvestmentForm.querySelector('#commercial-investment-category').value =
    config.category || 'investment'
  commercialInvestmentForm.querySelector('#commercial-investment-description').value =
    config.description || ''

  // Same as product change: never let a mid-create series selection autofill
  // overwrite persisted bundle fields after async market refresh.
  clearCommercialMarketSelection()
  applyCommercialInvestmentProductUi(productCode)

  if (productCode === 'bmap') {
    const migrated = migrateBmapConfigForEdit(config)
    commercialInvestmentForm.querySelector('#bmap-principal').value =
      migrated.principal !== undefined
        ? formatMoneyAmount(migrated.principal, { fractionDigits: 0 })
        : ''
    commercialInvestmentForm.querySelector('#bmap-annual-coupon-rate-pct').value =
      migrated.annualCouponRatePct !== undefined ? String(migrated.annualCouponRatePct) : ''
    commercialInvestmentForm.querySelector('#bmap-maturity-date').value =
      migrated.maturityDate || ''
    commercialInvestmentForm.querySelector('#bmap-purchase-date').value =
      migrated.purchaseDate || ''
    commercialInvestmentForm.querySelector('#bmap-issue-date').value = migrated.issueDate || ''
    commercialInvestmentForm.querySelector('#bmap-first-coupon-date').value =
      migrated.firstCouponDate || ''
    commercialInvestmentForm.querySelector('#bmap-coupon-schedule').value = Array.isArray(
      migrated.couponSchedule
    )
      ? JSON.stringify(migrated.couponSchedule)
      : ''
  } else if (productCode === 'dkj') {
    commercialInvestmentForm.querySelector('#dkj-face-value').value =
      config.principal !== undefined
        ? formatMoneyAmount(config.principal, { fractionDigits: 0 })
        : ''
    commercialInvestmentForm.querySelector('#dkj-purchase-price-pct').value =
      config.purchasePricePct !== undefined
        ? String(config.purchasePricePct)
        : config.purchasePrice !== undefined && config.principal
          ? String((Number(config.purchasePrice) / Number(config.principal)) * 100)
          : ''
    commercialInvestmentForm.querySelector('#dkj-term-months').value =
      config.termMonths !== undefined ? String(config.termMonths) : '12'
    commercialInvestmentForm.querySelector('#dkj-settlement-date').value =
      config.transactionDate || config.purchaseDate || config.settlementDate || ''
    commercialInvestmentForm.querySelector('#dkj-maturity-date').value =
      config.dueDate || config.maturityDate || ''
    commercialInvestmentForm.querySelector('#dkj-remaining-days').value =
      config.remainingDays !== undefined ? String(config.remainingDays) : ''
  } else if (productCode === 'pmap') {
    const migrated = migratePmapConfigForEdit(config)
    commercialInvestmentForm.querySelector('#pmap-principal').value =
      migrated.principal !== undefined
        ? formatMoneyAmount(migrated.principal, { fractionDigits: 0 })
        : ''
    commercialInvestmentForm.querySelector('#pmap-annual-coupon-rate-pct').value =
      migrated.annualCouponRatePct !== undefined ? String(migrated.annualCouponRatePct) : ''
    commercialInvestmentForm.querySelector('#pmap-maturity-date').value =
      migrated.maturityDate || ''
    commercialInvestmentForm.querySelector('#pmap-purchase-date').value =
      migrated.purchaseDate || migrated.transactionDate || ''
    commercialInvestmentForm.querySelector('#pmap-issue-date').value = migrated.issueDate || ''
    commercialInvestmentForm.querySelector('#pmap-first-coupon-date').value =
      migrated.firstCouponDate || migrated.couponPeriod || ''
    commercialInvestmentForm.querySelector('#pmap-coupon-schedule').value = Array.isArray(
      migrated.couponSchedule
    )
      ? JSON.stringify(migrated.couponSchedule)
      : ''
  } else if (productCode === 'fixmap') {
    const migrated = migrateFixmapConfigForEdit(config)
    commercialInvestmentForm.querySelector('#fixmap-principal').value =
      migrated.principal !== undefined
        ? formatMoneyAmount(migrated.principal, { fractionDigits: 0 })
        : ''
    commercialInvestmentForm.querySelector('#fixmap-annual-coupon-rate-pct').value =
      migrated.annualCouponRatePct !== undefined ? String(migrated.annualCouponRatePct) : ''
    commercialInvestmentForm.querySelector('#fixmap-maturity-date').value =
      migrated.maturityDate || ''
    commercialInvestmentForm.querySelector('#fixmap-purchase-date').value =
      migrated.purchaseDate || migrated.transactionDate || ''
    commercialInvestmentForm.querySelector('#fixmap-issue-date').value = migrated.issueDate || ''
    commercialInvestmentForm.querySelector('#fixmap-first-coupon-date').value =
      migrated.firstCouponDate || migrated.couponPeriod || ''
    commercialInvestmentForm.querySelector('#fixmap-coupon-schedule').value = Array.isArray(
      migrated.couponSchedule
    )
      ? JSON.stringify(migrated.couponSchedule)
      : ''
  }

  commercialInvestmentSubmitButton.textContent = 'Save Commercial Investment'
  commercialInvestmentCancelButton.hidden = false
  syncCommercialInvestmentPreview()
  openComposerBox?.('commercial-investment')
}

  function bindCommercialPurchaseSettlementAutofill(input) {
    if (!input) {
      return
    }
    input.addEventListener('change', () => {
      if (!commercialInvestmentSeriesInput?.value) {
        return
      }
      void applyCommercialMarketSelection()
    })
  }

  function handleSubmit(event) {
    event.preventDefault()
    clearCommercialInvestmentFormErrors()

    try {
      const formData = new FormData(commercialInvestmentForm)
      const productCode = String(formData.get('productCode') || '').trim()
      const product = findCommercialInvestmentProduct(productCode)
      if (!product) {
        throw new Error('Select a commercial treasury investment product.')
      }

      const meta = {
        id: editingCommercialInvestmentId || undefined,
        label: String(formData.get('label') || '').trim(),
        category: String(formData.get('category') || '').trim() || 'investment',
        description: String(formData.get('description') || '').trim() || undefined,
        createdAt: editingCommercialInvestmentId
          ? (getInstrumentBundles?.() || []).find(
              (entry) => entry.id === editingCommercialInvestmentId
            )?.createdAt
          : undefined
      }

      assertCommercialInvestmentDenomination(productCode, formData)

      let bundle
      if (productCode === 'bmap') {
        const specInputs = mapFormDataToBmapSpecInputs(formData)
        bundle = generateBmapInstrumentBundleFromSpecInputs(
          specInputs,
          {
            ...meta,
            label: meta.label || BMAP_PRODUCT_SPEC.ui.formTitle
          },
          { createInvestmentMaturityPreview }
        )
      } else if (productCode === 'dkj') {
        const specInputs = mapFormDataToDkjSpecInputs(formData)
        const calculated = calculateDkjFromSpecInputs(specInputs, {
          createInvestmentMaturityPreview
        })
        bundle = generateInvestmentInstrumentBundle(
          mapDkjSpecInputsToInvestmentBundleInput(
            { ...specInputs, remainingDays: calculated.remainingDays },
            {
              ...meta,
              label: meta.label || DKJ_PRODUCT_SPEC.ui.formTitle
            }
          )
        )
      } else if (productCode === 'pmap') {
        const specInputs = mapFormDataToPmapSpecInputs(formData)
        bundle = generatePmapInstrumentBundleFromSpecInputs(specInputs, {
          ...meta,
          label: meta.label || PMAP_PRODUCT_SPEC.ui.formTitle
        })
      } else if (productCode === 'fixmap') {
        const specInputs = mapFormDataToFixmapSpecInputs(formData)
        bundle = generateFixmapInstrumentBundleFromSpecInputs(specInputs, {
          ...meta,
          label: meta.label || FIXMAP_PRODUCT_SPEC.ui.formTitle
        })
      } else {
        throw new Error(`Unsupported commercial investment product: ${productCode}`)
      }

      persistCommercialBundle(bundle)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save commercial investment.'
      reportCommercialInvestmentFormError(message)
      reportError?.(message)
    }
  }

  function bindEvents() {
    if (commercialInvestmentProductInput) {
      commercialInvestmentProductInput.addEventListener('change', () => {
        if (commercialInvestmentSeriesInput) {
          commercialInvestmentSeriesInput.value = ''
        }
        applyCommercialInvestmentProductUi(commercialInvestmentProductInput.value)
        syncCommercialInvestmentPreview()
      })
    }
    if (commercialInvestmentSeriesInput) {
      commercialInvestmentSeriesInput.addEventListener('change', () => {
        void applyCommercialMarketSelection()
      })
    }
    bindCommercialPurchaseSettlementAutofill(dkjSettlementDateInput)
    bindCommercialPurchaseSettlementAutofill(pmapPurchaseDateInput)
    bindCommercialPurchaseSettlementAutofill(fixmapPurchaseDateInput)
    bindCommercialPurchaseSettlementAutofill(bmapPurchaseDateInput)
    commercialInvestmentPreviewController.bindEvents()
    if (commercialInvestmentForm) {
      commercialInvestmentForm.addEventListener('submit', handleSubmit)
    }
    if (commercialInvestmentCancelButton) {
      commercialInvestmentCancelButton.addEventListener('click', () => {
        resetForm()
        collapseComposerBoxes?.()
      })
    }
  }

  function initialize() {
    applyBmapSpecToForm({
      bmapForm: commercialInvestmentForm,
      bmapBox: commercialInvestmentBox
    })
    applyDkjSpecToForm({
      investmentForm: commercialInvestmentForm,
      investmentBox: commercialInvestmentBox
    })
    applyPmapSpecToForm({
      investmentForm: commercialInvestmentForm,
      investmentBox: commercialInvestmentBox
    })
    applyFixmapSpecToForm({
      investmentForm: commercialInvestmentForm,
      investmentBox: commercialInvestmentBox
    })
    setCommercialInvestmentFamilyTitle()
    rebuildCommercialInvestmentProductOptions()
    bindEvents()
    applyCommercialInvestmentProductUi()
    syncCommercialInvestmentPreview()
  }

  return {
    initialize,
    resetForm,
    startEdit,
    getEditingId: () => editingCommercialInvestmentId,
    isEditing: (id) => editingCommercialInvestmentId === id,
    applyProductUi: applyCommercialInvestmentProductUi,
    syncPreview: () => syncCommercialInvestmentPreview()
  }
}


export { createCommercialInvestmentComposerHost }
