/**
 * Commercial investment family registry (ADR 0040).
 * Host orchestration dispatches through lookup — no productCode forests in the host.
 * Coupon-bearing entries (pmap/bmap/fixmap/mapp) share helpers from
 * commercial-investment-coupon-profile.js; §6j follow-ons register on that profile.
 *
 * Registry is the addition path for: preview adapters, marketable required fields,
 * picker migrationStatus, and hostWrapId (wrap visibility).
 */
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
  MAPP_PRODUCT_SPEC,
  applyMappSpecToForm,
  setMappFieldVisibility,
  mapFormDataToMappSpecInputs,
  generateMappInstrumentBundleFromSpecInputs
} from './mapp-form.js'
import { calculateMappFromSpecInputs } from './mapp-calculation-adapter.js'
import {
  migrateBmapConfigForEdit,
  migratePmapConfigForEdit,
  migrateFixmapConfigForEdit,
  migrateMappConfigForEdit
} from './govsec-config-migrate.js'
import {
  couponBearingDomPrefix,
  buildCouponBearingMarketFieldSelectors,
  buildCouponBearingInputIds,
  buildCouponBearingFieldLabelClass,
  buildCouponBearingPurchaseOrSettlementSelector,
  readCouponBearingMarketFields,
  populateCouponBearingEditFields
} from './commercial-investment-coupon-profile.js'
import { formatMoneyAmount as formatMoneyAmountDefault } from './money-format.js'

const WHOLE_FORINT = Object.freeze({ fractionDigits: 0 })

const COUPON_BEARING_MARKETABLE_REQUIRED_FIELDS = Object.freeze([
  'annualCouponRatePct',
  'maturityDate',
  'issueDate',
  'firstCouponDate',
  'couponSchedule',
  'dayCountConvention'
])

function readFormValue(form, selector) {
  return form?.querySelector(selector)?.value || ''
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
  migrationStatus: 'fully-spec-backed',
  discountYieldPreview: true,
  discountCurrentValuePreview: true,
  inflationSchedulePreview: false,
  denomination: { formField: 'faceValue', unit: DKJ_PRODUCT_SPEC.denominationUnit },
  productSpec: DKJ_PRODUCT_SPEC,
  fieldLabelClass: 'dkj-field-label',
  marketableRequiredFields: Object.freeze([
    'purchasePricePct',
    'termMonths',
    'maturityDate',
    'remainingDays'
  ]),
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
  calculateFromSpecInputs: calculateDkjFromSpecInputs,
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

function registerCouponBearingFamily({
  productCode,
  discountYieldPreview = false,
  discountCurrentValuePreview = false,
  inflationSchedulePreview = false,
  migrationStatus = 'fully-spec-backed',
  productSpec,
  applySpecToForm,
  setFieldVisibility,
  mapFormDataToSpecInputs,
  calculateFromSpecInputs,
  migrateConfigForEdit,
  buildBundle,
  populateEditOptions = {},
  marketableRequiredFields = COUPON_BEARING_MARKETABLE_REQUIRED_FIELDS
}) {
  const prefix = couponBearingDomPrefix(productCode)
  registerCommercialInvestmentFamily({
    productCode,
    marketFamily: productCode,
    composerProfile: 'coupon-bearing',
    hostWrapId: `investment-${prefix}-wrap`,
    migrationStatus,
    discountYieldPreview,
    discountCurrentValuePreview,
    inflationSchedulePreview,
    denomination: { formField: 'principal', unit: productSpec.denominationUnit },
    productSpec,
    fieldLabelClass: buildCouponBearingFieldLabelClass(prefix),
    marketableRequiredFields,
    inputIds: buildCouponBearingInputIds(prefix),
    marketFieldSelectors: buildCouponBearingMarketFieldSelectors(prefix),
    purchaseOrSettlementSelector: buildCouponBearingPurchaseOrSettlementSelector(prefix),
    applySpecToForm,
    setFieldVisibility,
    mapFormDataToSpecInputs,
    calculateFromSpecInputs,
    migrateConfigForEdit,
    buildBundle,
    readCurrentMarketFields(form) {
      return readCouponBearingMarketFields(form, prefix)
    },
    populateEdit(form, config, { formatMoneyAmount } = {}) {
      const migrated = migrateConfigForEdit(config)
      populateCouponBearingEditFields(
        form,
        prefix,
        migrated,
        formatMoneyAmount,
        populateEditOptions
      )
    }
  })
}

registerCouponBearingFamily({
  productCode: 'pmap',
  inflationSchedulePreview: true,
  productSpec: PMAP_PRODUCT_SPEC,
  applySpecToForm({ form, box, setAmountDefaultIfEmpty = false } = {}) {
    applyPmapSpecToForm({
      investmentForm: form,
      investmentBox: box,
      setAmountDefaultIfEmpty
    })
  },
  setFieldVisibility: setPmapFieldVisibility,
  mapFormDataToSpecInputs: mapFormDataToPmapSpecInputs,
  calculateFromSpecInputs: calculatePmapFromSpecInputs,
  migrateConfigForEdit: migratePmapConfigForEdit,
  buildBundle(formData, meta) {
    const specInputs = mapFormDataToPmapSpecInputs(formData)
    return generatePmapInstrumentBundleFromSpecInputs(specInputs, {
      ...meta,
      label: meta.label || PMAP_PRODUCT_SPEC.ui.formTitle
    })
  }
  // populateEditOptions omitted: defaults keep transactionDate + couponPeriod fallbacks.
})

registerCouponBearingFamily({
  productCode: 'bmap',
  productSpec: BMAP_PRODUCT_SPEC,
  applySpecToForm({ form, box, setAmountDefaultIfEmpty = false } = {}) {
    applyBmapSpecToForm({
      bmapForm: form,
      bmapBox: box,
      setAmountDefaultIfEmpty
    })
  },
  setFieldVisibility: setBmapFieldVisibility,
  mapFormDataToSpecInputs: mapFormDataToBmapSpecInputs,
  calculateFromSpecInputs: calculateBmapFromSpecInputs,
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
  // BMÁP edit historically did not fall back to transactionDate / couponPeriod.
  populateEditOptions: {
    allowTransactionDateFallback: false,
    allowCouponPeriodFallback: false
  }
})

registerCouponBearingFamily({
  productCode: 'fixmap',
  inflationSchedulePreview: true,
  productSpec: FIXMAP_PRODUCT_SPEC,
  applySpecToForm({ form, box, setAmountDefaultIfEmpty = false } = {}) {
    applyFixmapSpecToForm({
      investmentForm: form,
      investmentBox: box,
      setAmountDefaultIfEmpty
    })
  },
  setFieldVisibility: setFixmapFieldVisibility,
  mapFormDataToSpecInputs: mapFormDataToFixmapSpecInputs,
  calculateFromSpecInputs: calculateFixmapFromSpecInputs,
  migrateConfigForEdit: migrateFixmapConfigForEdit,
  buildBundle(formData, meta) {
    const specInputs = mapFormDataToFixmapSpecInputs(formData)
    return generateFixmapInstrumentBundleFromSpecInputs(specInputs, {
      ...meta,
      label: meta.label || FIXMAP_PRODUCT_SPEC.ui.formTitle
    })
  }
})

registerCouponBearingFamily({
  productCode: 'mapp',
  inflationSchedulePreview: true,
  migrationStatus: 'fully-spec-backed',
  productSpec: MAPP_PRODUCT_SPEC,
  marketableRequiredFields: Object.freeze([
    ...COUPON_BEARING_MARKETABLE_REQUIRED_FIELDS,
    'couponFrequencyMonths'
  ]),
  applySpecToForm({ form, box, setAmountDefaultIfEmpty = false } = {}) {
    applyMappSpecToForm({
      investmentForm: form,
      investmentBox: box,
      setAmountDefaultIfEmpty
    })
  },
  setFieldVisibility: setMappFieldVisibility,
  mapFormDataToSpecInputs: mapFormDataToMappSpecInputs,
  calculateFromSpecInputs: calculateMappFromSpecInputs,
  migrateConfigForEdit: migrateMappConfigForEdit,
  buildBundle(formData, meta) {
    const specInputs = mapFormDataToMappSpecInputs(formData)
    return generateMappInstrumentBundleFromSpecInputs(specInputs, {
      ...meta,
      label: meta.label || MAPP_PRODUCT_SPEC.ui.formTitle
    })
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

/**
 * Apply live commercial preview for a registry family (discount vs coupon-bearing).
 * Used by previews.js so commercial subtypes do not need per-productCode forests.
 */
function applyCommercialInvestmentLivePreview(
  entry,
  form,
  targets = {},
  deps = {}
) {
  if (!entry || !form || typeof entry.mapFormDataToSpecInputs !== 'function') {
    return false
  }
  if (typeof entry.calculateFromSpecInputs !== 'function') {
    return false
  }
  const formatMoneyAmount = deps.formatMoneyAmount || formatMoneyAmountDefault
  const {
    purchasePreviewInput,
    maturityPreviewInput,
    gainPreviewInput,
    discountYieldPreviewInput,
    discountCurrentValuePreviewInput,
    inflationSchedulePreviewInput
  } = targets

  const formData = deps.formData != null ? deps.formData : new FormData(form)
  const specInputs = entry.mapFormDataToSpecInputs(formData)
  const preview = entry.calculateFromSpecInputs(specInputs, {
    createInvestmentMaturityPreview: deps.createInvestmentMaturityPreview
  })

  if (entry.composerProfile === 'discount') {
    if (purchasePreviewInput) {
      purchasePreviewInput.value = formatMoneyAmount(preview.purchaseAmount, WHOLE_FORINT)
    }
    if (maturityPreviewInput) {
      maturityPreviewInput.value = formatMoneyAmount(preview.redemptionValue, WHOLE_FORINT)
    }
    if (gainPreviewInput) {
      gainPreviewInput.value = formatMoneyAmount(preview.grossGain, WHOLE_FORINT)
    }
    const remainingSelector = entry.marketFieldSelectors?.remainingDays
    const remainingDaysInput = remainingSelector
      ? form.querySelector(remainingSelector)
      : null
    if (remainingDaysInput && preview.remainingDays != null) {
      remainingDaysInput.value = String(preview.remainingDays)
    }
    if (discountYieldPreviewInput) {
      discountYieldPreviewInput.value = `${preview.annualizedYieldPct.toFixed(4)}%`
    }
    if (discountCurrentValuePreviewInput) {
      discountCurrentValuePreviewInput.value = `${preview.simpleReturnPct.toFixed(4)}%`
    }
    if (inflationSchedulePreviewInput) {
      inflationSchedulePreviewInput.value = '—'
    }
    return true
  }

  if (entry.composerProfile === 'coupon-bearing') {
    if (purchasePreviewInput) {
      purchasePreviewInput.value = formatMoneyAmount(preview.purchaseAmount, WHOLE_FORINT)
    }
    if (maturityPreviewInput) {
      maturityPreviewInput.value = formatMoneyAmount(specInputs.principal, WHOLE_FORINT)
    }
    if (gainPreviewInput) {
      gainPreviewInput.value = formatMoneyAmount(
        Number(specInputs.principal) - Number(preview.purchaseAmount),
        WHOLE_FORINT
      )
    }
    if (discountYieldPreviewInput) {
      discountYieldPreviewInput.value = '—'
    }
    if (discountCurrentValuePreviewInput) {
      discountCurrentValuePreviewInput.value = '—'
    }
    if (inflationSchedulePreviewInput) {
      inflationSchedulePreviewInput.value = `${preview.annualCouponRatePct.toFixed(4)}%`
    }
    return true
  }

  return false
}

/** Frozen map of marketable required field names by productCode (derived from registry). */
function buildMarketMarketableRequiredFields() {
  const out = {}
  for (const entry of listCommercialInvestmentFamilies()) {
    out[entry.productCode] = Object.freeze([...(entry.marketableRequiredFields || [])])
  }
  return Object.freeze(out)
}

export {
  getCommercialInvestmentFamily,
  listCommercialInvestmentFamilies,
  listCommercialInvestmentFamilyCodes,
  resolveCommercialInvestmentProductCodeFromBundle,
  applyCommercialInvestmentLivePreview,
  buildMarketMarketableRequiredFields,
  COUPON_BEARING_MARKETABLE_REQUIRED_FIELDS
}
