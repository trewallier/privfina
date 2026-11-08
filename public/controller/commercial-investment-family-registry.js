/**
 * Commercial investment family registry (ADR 0040).
 * Host orchestration dispatches through lookup — no productCode forests in the host.
 * Coupon-bearing entries (pmap/bmap/fixmap) share helpers from
 * commercial-investment-coupon-profile.js; §6j follow-ons register on that profile.
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
import {
  couponBearingDomPrefix,
  buildCouponBearingMarketFieldSelectors,
  buildCouponBearingInputIds,
  buildCouponBearingFieldLabelClass,
  buildCouponBearingPurchaseOrSettlementSelector,
  readCouponBearingMarketFields,
  populateCouponBearingEditFields
} from './commercial-investment-coupon-profile.js'

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

function registerCouponBearingFamily({
  productCode,
  discountYieldPreview = false,
  discountCurrentValuePreview = false,
  inflationSchedulePreview = false,
  productSpec,
  applySpecToForm,
  setFieldVisibility,
  mapFormDataToSpecInputs,
  migrateConfigForEdit,
  buildBundle,
  populateEditOptions = {}
}) {
  const prefix = couponBearingDomPrefix(productCode)
  registerCommercialInvestmentFamily({
    productCode,
    marketFamily: productCode,
    composerProfile: 'coupon-bearing',
    hostWrapId: `investment-${prefix}-wrap`,
    discountYieldPreview,
    discountCurrentValuePreview,
    inflationSchedulePreview,
    denomination: { formField: 'principal', unit: productSpec.denominationUnit },
    productSpec,
    fieldLabelClass: buildCouponBearingFieldLabelClass(prefix),
    inputIds: buildCouponBearingInputIds(prefix),
    marketFieldSelectors: buildCouponBearingMarketFieldSelectors(prefix),
    purchaseOrSettlementSelector: buildCouponBearingPurchaseOrSettlementSelector(prefix),
    applySpecToForm,
    setFieldVisibility,
    mapFormDataToSpecInputs,
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
  migrateConfigForEdit: migratePmapConfigForEdit,
  buildBundle(formData, meta) {
    const specInputs = mapFormDataToPmapSpecInputs(formData)
    return generatePmapInstrumentBundleFromSpecInputs(specInputs, {
      ...meta,
      label: meta.label || PMAP_PRODUCT_SPEC.ui.formTitle
    })
  }
  // populateEditOptions defaults: transactionDate + couponPeriod fallbacks on
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
  migrateConfigForEdit: migrateFixmapConfigForEdit,
  buildBundle(formData, meta) {
    const specInputs = mapFormDataToFixmapSpecInputs(formData)
    return generateFixmapInstrumentBundleFromSpecInputs(specInputs, {
      ...meta,
      label: meta.label || FIXMAP_PRODUCT_SPEC.ui.formTitle
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

export {
  getCommercialInvestmentFamily,
  listCommercialInvestmentFamilies,
  listCommercialInvestmentFamilyCodes,
  resolveCommercialInvestmentProductCodeFromBundle
}
