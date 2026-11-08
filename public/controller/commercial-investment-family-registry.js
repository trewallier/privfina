/**
 * Commercial investment family registry (ADR 0040).
 * Host orchestration dispatches through lookup — no productCode forests in the host.
 */
import {
  BMAP_PRODUCT_SPEC,
  applyBmapSpecToForm,
  setBmapFieldVisibility,
  mapFormDataToBmapSpecInputs
} from './bmap-form.js'
import { generateBmapInstrumentBundleFromSpecInputs } from './bmap-calculation-adapter.js'
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
import {
  FIXMAP_PRODUCT_SPEC,
  applyFixmapSpecToForm,
  setFixmapFieldVisibility,
  mapFormDataToFixmapSpecInputs,
  generateFixmapInstrumentBundleFromSpecInputs
} from './fixmap-form.js'
import {
  migrateBmapConfigForEdit,
  migratePmapConfigForEdit,
  migrateFixmapConfigForEdit
} from './govsec-config-migrate.js'

function readFormValue(form, selector) {
  return form?.querySelector(selector)?.value || ''
}

function populateCouponEditFields(form, prefix, migrated, formatMoneyAmount) {
  const principal = form.querySelector(`#${prefix}-principal`)
  const annualCouponRatePct = form.querySelector(`#${prefix}-annual-coupon-rate-pct`)
  const maturityDate = form.querySelector(`#${prefix}-maturity-date`)
  const purchaseDate = form.querySelector(`#${prefix}-purchase-date`)
  const issueDate = form.querySelector(`#${prefix}-issue-date`)
  const firstCouponDate = form.querySelector(`#${prefix}-first-coupon-date`)
  const couponSchedule = form.querySelector(`#${prefix}-coupon-schedule`)

  if (principal) {
    principal.value =
      migrated.principal !== undefined
        ? formatMoneyAmount(migrated.principal, { fractionDigits: 0 })
        : ''
  }
  if (annualCouponRatePct) {
    annualCouponRatePct.value =
      migrated.annualCouponRatePct !== undefined ? String(migrated.annualCouponRatePct) : ''
  }
  if (maturityDate) {
    maturityDate.value = migrated.maturityDate || ''
  }
  if (purchaseDate) {
    purchaseDate.value = migrated.purchaseDate || migrated.transactionDate || ''
  }
  if (issueDate) {
    issueDate.value = migrated.issueDate || ''
  }
  if (firstCouponDate) {
    firstCouponDate.value = migrated.firstCouponDate || migrated.couponPeriod || ''
  }
  if (couponSchedule) {
    couponSchedule.value = Array.isArray(migrated.couponSchedule)
      ? JSON.stringify(migrated.couponSchedule)
      : ''
  }
}

/** @type {Map<string, object>} */
const COMMERCIAL_INVESTMENT_FAMILY_BY_CODE = new Map()

function registerCommercialInvestmentFamily(entry) {
  COMMERCIAL_INVESTMENT_FAMILY_BY_CODE.set(entry.productCode, entry)
  return entry
}

registerCommercialInvestmentFamily({
  productCode: 'dkj',
  marketFamily: 'dkj',
  composerProfile: 'discount',
  hostWrapId: 'investment-dkj-wrap',
  discountYieldPreview: true,
  discountCurrentValuePreview: true,
  inflationSchedulePreview: false,
  denomination: { formField: 'faceValue', unit: DKJ_PRODUCT_SPEC.denominationUnit },
  productSpec: DKJ_PRODUCT_SPEC,
  fieldLabelClass: 'dkj-field-label',
  inputIds: [
    'dkj-face-value',
    'dkj-purchase-price-pct',
    'dkj-term-months',
    'dkj-settlement-date',
    'dkj-maturity-date',
    'dkj-remaining-days'
  ],
  marketFieldSelectors: {
    purchasePricePct: '#dkj-purchase-price-pct',
    termMonths: '#dkj-term-months',
    maturityDate: '#dkj-maturity-date',
    remainingDays: '#dkj-remaining-days'
  },
  purchaseOrSettlementSelector: '#dkj-settlement-date',
  applySpecToForm({ form, box, setAmountDefaultIfEmpty = false } = {}) {
    applyDkjSpecToForm({
      investmentForm: form,
      investmentBox: box,
      setAmountDefaultIfEmpty
    })
  },
  setFieldVisibility: setDkjFieldVisibility,
  mapFormDataToSpecInputs: mapFormDataToDkjSpecInputs,
  buildBundle(formData, meta, deps = {}) {
    const specInputs = mapFormDataToDkjSpecInputs(formData)
    const calculated = calculateDkjFromSpecInputs(specInputs, {
      createInvestmentMaturityPreview: deps.createInvestmentMaturityPreview
    })
    return deps.generateInvestmentInstrumentBundle(
      mapDkjSpecInputsToInvestmentBundleInput(
        { ...specInputs, remainingDays: calculated.remainingDays },
        {
          ...meta,
          label: meta.label || DKJ_PRODUCT_SPEC.ui.formTitle
        }
      )
    )
  },
  readCurrentMarketFields(form) {
    return {
      faceValue: readFormValue(form, '#dkj-face-value'),
      purchasePricePct: readFormValue(form, '#dkj-purchase-price-pct'),
      termMonths: readFormValue(form, '#dkj-term-months'),
      settlementDate: readFormValue(form, '#dkj-settlement-date'),
      maturityDate: readFormValue(form, '#dkj-maturity-date'),
      remainingDays: readFormValue(form, '#dkj-remaining-days')
    }
  },
  populateEdit(form, config, { formatMoneyAmount } = {}) {
    const faceValue = form.querySelector('#dkj-face-value')
    const purchasePricePct = form.querySelector('#dkj-purchase-price-pct')
    const termMonths = form.querySelector('#dkj-term-months')
    const settlementDate = form.querySelector('#dkj-settlement-date')
    const maturityDate = form.querySelector('#dkj-maturity-date')
    const remainingDays = form.querySelector('#dkj-remaining-days')
    if (faceValue) {
      faceValue.value =
        config.principal !== undefined
          ? formatMoneyAmount(config.principal, { fractionDigits: 0 })
          : ''
    }
    if (purchasePricePct) {
      purchasePricePct.value =
        config.purchasePricePct !== undefined
          ? String(config.purchasePricePct)
          : config.purchasePrice !== undefined && config.principal
            ? String((Number(config.purchasePrice) / Number(config.principal)) * 100)
            : ''
    }
    if (termMonths) {
      termMonths.value = config.termMonths !== undefined ? String(config.termMonths) : '12'
    }
    if (settlementDate) {
      settlementDate.value =
        config.transactionDate || config.purchaseDate || config.settlementDate || ''
    }
    if (maturityDate) {
      maturityDate.value = config.dueDate || config.maturityDate || ''
    }
    if (remainingDays) {
      remainingDays.value =
        config.remainingDays !== undefined ? String(config.remainingDays) : ''
    }
  }
})

registerCommercialInvestmentFamily({
  productCode: 'pmap',
  marketFamily: 'pmap',
  composerProfile: 'coupon-bearing',
  hostWrapId: 'investment-pmap-wrap',
  discountYieldPreview: false,
  discountCurrentValuePreview: false,
  inflationSchedulePreview: true,
  denomination: { formField: 'principal', unit: PMAP_PRODUCT_SPEC.denominationUnit },
  productSpec: PMAP_PRODUCT_SPEC,
  fieldLabelClass: 'pmap-field-label',
  inputIds: [
    'pmap-principal',
    'pmap-annual-coupon-rate-pct',
    'pmap-maturity-date',
    'pmap-purchase-date',
    'pmap-issue-date',
    'pmap-first-coupon-date'
  ],
  marketFieldSelectors: {
    annualCouponRatePct: '#pmap-annual-coupon-rate-pct',
    maturityDate: '#pmap-maturity-date',
    issueDate: '#pmap-issue-date',
    firstCouponDate: '#pmap-first-coupon-date',
    couponSchedule: '#pmap-coupon-schedule',
    dayCountConvention: '#pmap-day-count-convention'
  },
  purchaseOrSettlementSelector: '#pmap-purchase-date',
  applySpecToForm({ form, box, setAmountDefaultIfEmpty = false } = {}) {
    applyPmapSpecToForm({
      investmentForm: form,
      investmentBox: box,
      setAmountDefaultIfEmpty
    })
  },
  setFieldVisibility: setPmapFieldVisibility,
  mapFormDataToSpecInputs: mapFormDataToPmapSpecInputs,
  migrateConfigForEdit: migratePmapConfigForEdit,
  buildBundle(formData, meta) {
    const specInputs = mapFormDataToPmapSpecInputs(formData)
    return generatePmapInstrumentBundleFromSpecInputs(specInputs, {
      ...meta,
      label: meta.label || PMAP_PRODUCT_SPEC.ui.formTitle
    })
  },
  readCurrentMarketFields(form) {
    return {
      principal: readFormValue(form, '#pmap-principal'),
      annualCouponRatePct: readFormValue(form, '#pmap-annual-coupon-rate-pct'),
      maturityDate: readFormValue(form, '#pmap-maturity-date'),
      purchaseDate: readFormValue(form, '#pmap-purchase-date'),
      issueDate: readFormValue(form, '#pmap-issue-date'),
      firstCouponDate: readFormValue(form, '#pmap-first-coupon-date')
    }
  },
  populateEdit(form, config, { formatMoneyAmount } = {}) {
    const migrated = migratePmapConfigForEdit(config)
    populateCouponEditFields(form, 'pmap', migrated, formatMoneyAmount)
  }
})

registerCommercialInvestmentFamily({
  productCode: 'bmap',
  marketFamily: 'bmap',
  composerProfile: 'coupon-bearing',
  hostWrapId: 'investment-bmap-wrap',
  discountYieldPreview: false,
  discountCurrentValuePreview: false,
  inflationSchedulePreview: false,
  denomination: { formField: 'principal', unit: BMAP_PRODUCT_SPEC.denominationUnit },
  productSpec: BMAP_PRODUCT_SPEC,
  fieldLabelClass: 'bmap-field-label',
  inputIds: [
    'bmap-principal',
    'bmap-annual-coupon-rate-pct',
    'bmap-maturity-date',
    'bmap-purchase-date',
    'bmap-issue-date',
    'bmap-first-coupon-date'
  ],
  marketFieldSelectors: {
    annualCouponRatePct: '#bmap-annual-coupon-rate-pct',
    maturityDate: '#bmap-maturity-date',
    issueDate: '#bmap-issue-date',
    firstCouponDate: '#bmap-first-coupon-date',
    couponSchedule: '#bmap-coupon-schedule',
    dayCountConvention: '#bmap-day-count-convention'
  },
  purchaseOrSettlementSelector: '#bmap-purchase-date',
  applySpecToForm({ form, box, setAmountDefaultIfEmpty = false } = {}) {
    applyBmapSpecToForm({
      bmapForm: form,
      bmapBox: box,
      setAmountDefaultIfEmpty
    })
  },
  setFieldVisibility: setBmapFieldVisibility,
  mapFormDataToSpecInputs: mapFormDataToBmapSpecInputs,
  migrateConfigForEdit: migrateBmapConfigForEdit,
  buildBundle(formData, meta, deps = {}) {
    const specInputs = mapFormDataToBmapSpecInputs(formData)
    return generateBmapInstrumentBundleFromSpecInputs(
      specInputs,
      {
        ...meta,
        label: meta.label || BMAP_PRODUCT_SPEC.ui.formTitle
      },
      { createInvestmentMaturityPreview: deps.createInvestmentMaturityPreview }
    )
  },
  readCurrentMarketFields(form) {
    return {
      principal: readFormValue(form, '#bmap-principal'),
      annualCouponRatePct: readFormValue(form, '#bmap-annual-coupon-rate-pct'),
      maturityDate: readFormValue(form, '#bmap-maturity-date'),
      purchaseDate: readFormValue(form, '#bmap-purchase-date'),
      issueDate: readFormValue(form, '#bmap-issue-date'),
      firstCouponDate: readFormValue(form, '#bmap-first-coupon-date')
    }
  },
  populateEdit(form, config, { formatMoneyAmount } = {}) {
    const migrated = migrateBmapConfigForEdit(config)
    // BMÁP edit historically did not fall back to transactionDate / couponPeriod.
    if (form.querySelector('#bmap-principal')) {
      form.querySelector('#bmap-principal').value =
        migrated.principal !== undefined
          ? formatMoneyAmount(migrated.principal, { fractionDigits: 0 })
          : ''
    }
    if (form.querySelector('#bmap-annual-coupon-rate-pct')) {
      form.querySelector('#bmap-annual-coupon-rate-pct').value =
        migrated.annualCouponRatePct !== undefined ? String(migrated.annualCouponRatePct) : ''
    }
    if (form.querySelector('#bmap-maturity-date')) {
      form.querySelector('#bmap-maturity-date').value = migrated.maturityDate || ''
    }
    if (form.querySelector('#bmap-purchase-date')) {
      form.querySelector('#bmap-purchase-date').value = migrated.purchaseDate || ''
    }
    if (form.querySelector('#bmap-issue-date')) {
      form.querySelector('#bmap-issue-date').value = migrated.issueDate || ''
    }
    if (form.querySelector('#bmap-first-coupon-date')) {
      form.querySelector('#bmap-first-coupon-date').value = migrated.firstCouponDate || ''
    }
    if (form.querySelector('#bmap-coupon-schedule')) {
      form.querySelector('#bmap-coupon-schedule').value = Array.isArray(migrated.couponSchedule)
        ? JSON.stringify(migrated.couponSchedule)
        : ''
    }
  }
})

registerCommercialInvestmentFamily({
  productCode: 'fixmap',
  marketFamily: 'fixmap',
  composerProfile: 'coupon-bearing',
  hostWrapId: 'investment-fixmap-wrap',
  discountYieldPreview: false,
  discountCurrentValuePreview: false,
  inflationSchedulePreview: true,
  denomination: { formField: 'principal', unit: FIXMAP_PRODUCT_SPEC.denominationUnit },
  productSpec: FIXMAP_PRODUCT_SPEC,
  fieldLabelClass: 'fixmap-field-label',
  inputIds: [
    'fixmap-principal',
    'fixmap-annual-coupon-rate-pct',
    'fixmap-maturity-date',
    'fixmap-purchase-date',
    'fixmap-issue-date',
    'fixmap-first-coupon-date'
  ],
  marketFieldSelectors: {
    annualCouponRatePct: '#fixmap-annual-coupon-rate-pct',
    maturityDate: '#fixmap-maturity-date',
    issueDate: '#fixmap-issue-date',
    firstCouponDate: '#fixmap-first-coupon-date',
    couponSchedule: '#fixmap-coupon-schedule',
    dayCountConvention: '#fixmap-day-count-convention'
  },
  purchaseOrSettlementSelector: '#fixmap-purchase-date',
  applySpecToForm({ form, box, setAmountDefaultIfEmpty = false } = {}) {
    applyFixmapSpecToForm({
      investmentForm: form,
      investmentBox: box,
      setAmountDefaultIfEmpty
    })
  },
  setFieldVisibility: setFixmapFieldVisibility,
  mapFormDataToSpecInputs: mapFormDataToFixmapSpecInputs,
  migrateConfigForEdit: migrateFixmapConfigForEdit,
  buildBundle(formData, meta) {
    const specInputs = mapFormDataToFixmapSpecInputs(formData)
    return generateFixmapInstrumentBundleFromSpecInputs(specInputs, {
      ...meta,
      label: meta.label || FIXMAP_PRODUCT_SPEC.ui.formTitle
    })
  },
  readCurrentMarketFields(form) {
    return {
      principal: readFormValue(form, '#fixmap-principal'),
      annualCouponRatePct: readFormValue(form, '#fixmap-annual-coupon-rate-pct'),
      maturityDate: readFormValue(form, '#fixmap-maturity-date'),
      purchaseDate: readFormValue(form, '#fixmap-purchase-date'),
      issueDate: readFormValue(form, '#fixmap-issue-date'),
      firstCouponDate: readFormValue(form, '#fixmap-first-coupon-date')
    }
  },
  populateEdit(form, config, { formatMoneyAmount } = {}) {
    const migrated = migrateFixmapConfigForEdit(config)
    populateCouponEditFields(form, 'fixmap', migrated, formatMoneyAmount)
  }
})

function getCommercialInvestmentFamily(productCode) {
  if (!productCode) return null
  return COMMERCIAL_INVESTMENT_FAMILY_BY_CODE.get(String(productCode)) || null
}

function listCommercialInvestmentFamilies() {
  return Array.from(COMMERCIAL_INVESTMENT_FAMILY_BY_CODE.values())
}

function listCommercialInvestmentFamilyCodes() {
  return Array.from(COMMERCIAL_INVESTMENT_FAMILY_BY_CODE.keys())
}

function resolveCommercialInvestmentProductCodeFromBundle(bundle) {
  if (!bundle) return null
  const config = bundle.config || {}
  const productId = bundle.productId || config.productId
  for (const entry of listCommercialInvestmentFamilies()) {
    if (productId === entry.productSpec.id || config.subtype === entry.productCode) {
      return entry.productCode
    }
  }
  return null
}

export {
  getCommercialInvestmentFamily,
  listCommercialInvestmentFamilies,
  listCommercialInvestmentFamilyCodes,
  resolveCommercialInvestmentProductCodeFromBundle
}
