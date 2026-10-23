import {
  ONE_TIME_STORAGE_KEY,
  RECURRING_STORAGE_KEY,
  INSTRUMENT_BUNDLES_STORAGE_KEY,
  LIST_STATUS_STORAGE_KEY,
  STORAGE_SCHEMA_VERSION_KEY,
  loadList,
  saveList,
  loadObject,
  saveObject
} from './storage.js'
import {
  normalizeOneTimeFlows,
  ensureFlowIds,
  buildExportDocument,
  parseImportDocument,
  checkStorageSchemaVersion
} from './import-export.js'
import {
  createFolder,
  deleteFolder,
  emptyListStatus,
  moveItem,
  moveRootEntry,
  normalizeListStatus,
  reconcileListStatus,
  removeItemFromStatus,
  renameFolder,
  seedListStatusOrder,
  setFolderCollapsed
} from './list-status.js'
import { buildConfiguredRows } from './render.js'
import {
  normalizeInstrumentBundles,
  generateSalaryInstrumentBundle,
  generateSubscriptionInstrumentBundle,
  createLoanRepaymentPreview,
  generateLoanInstrumentBundle,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentBundle
} from './instruments.js'
import {
  normalizeRecurringDefinitions,
  parseIsoDate,
  parseRecurringSchedule
} from './recurrence.js'
import {
  upsertFlowById,
  removeFlowById,
  buildEffectiveFlows,
  calculateCumulativeSeries,
  suggestRange,
  extendRange
} from './flows.js'
import { sharedEvalResultCache } from './eval-cache.js'
import { renderConfiguredLists, renderChart } from './render.js'
import { createComposerManager } from './controller/composer.js'
import {
  createResponsiveShell,
  createToastController
} from './controller/responsive-shell.js'
import {
  createLoanPreviewSync,
  createInvestmentPreviewSync,
  bindLoanPreviewEvents
} from './controller/previews.js'
import {
  FIXED_RATE_LOAN_PRODUCT_SPEC,
  applyFixedRateLoanSpecToForm,
  mapFormDataToFixedRateLoanSpecInputs
} from './controller/fixed-rate-loan-form.js'
import {
  calculateFixedRateLoanFromSpecInputs,
  mapFixedRateLoanSpecInputsToLegacyLoanBundleInput
} from './controller/fixed-rate-loan-calculation-adapter.js'
import {
  FIXED_RATE_MORTGAGE_PRODUCT_SPEC,
  mapFormDataToFixedRateMortgageSpecInputs
} from './controller/fixed-rate-mortgage-form.js'
import { mapFixedRateMortgageSpecInputsToLegacyLoanBundleInput } from './controller/fixed-rate-mortgage-calculation-adapter.js'
import {
  buildCommercialLoanProductOptions,
  findCommercialLoanProduct,
  findCommercialLoanProductById
} from './controller/commercial-loan-product-metadata.js'
import {
  applyCommercialLoanProductSelection,
  mapFormDataToCommercialLoanSpecInputs
} from './controller/commercial-loan-form.js'
import {
  calculateCommercialLoanFromSpecInputs,
  mapCommercialLoanSpecInputsToLegacyLoanBundleInput
} from './controller/commercial-loan-calculation-adapter.js'
import {
  BMAP_PRODUCT_SPEC,
  applyBmapSpecToForm,
  setBmapFieldVisibility,
  mapFormDataToBmapSpecInputs
} from './controller/bmap-form.js'
import { generateBmapInstrumentBundleFromSpecInputs } from './controller/bmap-calculation-adapter.js'
import {
  DKJ_PRODUCT_SPEC,
  applyDkjSpecToForm,
  setDkjFieldVisibility,
  mapFormDataToDkjSpecInputs,
  mapDkjSpecInputsToInvestmentBundleInput
} from './controller/dkj-form.js'
import { calculateDkjFromSpecInputs } from './controller/dkj-calculation-adapter.js'
import {
  PMAP_PRODUCT_SPEC,
  applyPmapSpecToForm,
  setPmapFieldVisibility,
  mapFormDataToPmapSpecInputs,
  mapPmapSpecInputsToInvestmentBundleInput
} from './controller/pmap-form.js'
import { calculatePmapFromSpecInputs } from './controller/pmap-calculation-adapter.js'
import {
  buildSpecBackedInvestmentSubtypeOptions,
  buildSpecBackedInvestmentSubtypeUiConfig
} from './controller/investment-product-metadata.js'
import { buildGenericBondSubtypeUiConfig } from './controller/generic-bond-presentation.js'
import {
  applyFieldChrome,
  setFormStatus,
  clearFieldValidity,
  applyInvestmentFieldValidity
} from './controller/field-chrome.js'
import {
  formatMoneyAmount,
  parseMoneyAmount,
  bindMoneyAmountInputs
} from './controller/money-format.js'

const INVESTMENT_FAMILY_TITLE = 'Government Security Bonds'

function saveCashFlowList(key, value) {
  saveList(key, value)
  // Definition/bundle mutations invalidate all cached expand/evaluate results.
  sharedEvalResultCache.invalidateAll()
}

const GENERIC_BOND_SUBTYPE_OPTIONS = [
  { value: 'regular-bond', label: 'Regular bond' },
  { value: 'discount-bond', label: 'Discount bond' },
  { value: 'inflation-linked-bond', label: 'Inflation-linked bond' },
  { value: 'custom-bond', label: 'Custom bond' }
]

const SPEC_BACKED_BOND_SUBTYPE_OPTIONS = buildSpecBackedInvestmentSubtypeOptions()

const PRODUCT_BOND_SUBTYPE_OPTIONS = [
  ...SPEC_BACKED_BOND_SUBTYPE_OPTIONS
]

function createFlowId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${prefix}-${Date.now()}`
}

function initController() {
  const oneTimeForm = document.getElementById('cash-flow-form')
  const recurringForm = document.getElementById('recurring-form')
  const salaryForm = document.getElementById('salary-form')
  const subscriptionForm = document.getElementById('subscription-form')
  const loanForm = document.getElementById('loan-form')
  const commercialLoanForm = document.getElementById('commercial-loan-form')
  const investmentForm = document.getElementById('investment-form')
  const oneTimeSubmitButton = document.getElementById('one-time-submit')
  const recurringSubmitButton = document.getElementById('recurring-submit')
  const salarySubmitButton = document.getElementById('salary-submit')
  const subscriptionSubmitButton = document.getElementById('subscription-submit')
  const loanSubmitButton = document.getElementById('loan-submit')
  const commercialLoanSubmitButton = document.getElementById('commercial-loan-submit')
  const investmentSubmitButton = document.getElementById('investment-submit')
  const oneTimeCancelButton = document.getElementById('one-time-cancel-edit')
  const recurringCancelButton = document.getElementById('recurring-cancel-edit')
  const salaryCancelButton = document.getElementById('salary-cancel-edit')
  const subscriptionCancelButton = document.getElementById('subscription-cancel-edit')
  const loanCancelButton = document.getElementById('loan-cancel-edit')
  const commercialLoanCancelButton = document.getElementById('commercial-loan-cancel-edit')
  const investmentCancelButton = document.getElementById('investment-cancel-edit')
  const schemaWarning = document.getElementById('schema-warning')
  const storageStatus = document.getElementById('storage-status')
  const exportButton = document.getElementById('export-json-button')
  const importInput = document.getElementById('import-json-input')
  const importButton = document.getElementById('import-json-button')
  const newFolderButton = document.getElementById('new-folder-button')
  const rows = document.getElementById('configured-flow-rows')
  const cards = document.getElementById('configured-flow-cards')
  const chart = document.getElementById('chart')
  const startInput = document.getElementById('range-start')
  const endInput = document.getElementById('range-end')
  const shellRoot = document.querySelector('main')
  const mobileNav = document.getElementById('mobile-nav')
  const appToast = document.getElementById('app-toast')
  const composeBackButton = document.getElementById('compose-back')
  const composeTitle = document.getElementById('compose-title')
  const addTypePicker = document.getElementById('add-type-picker')
  const flowComposer = document.getElementById('flow-composer')
  const toggleComposerButton = document.getElementById('toggle-composer')
  const openOneTimeBoxButton = document.getElementById('open-one-time-box')
  const openRecurringBoxButton = document.getElementById('open-recurring-box')
  const openSalaryBoxButton = document.getElementById('open-salary-box')
  const openSubscriptionBoxButton = document.getElementById('open-subscription-box')
  const openLoanBoxButton = document.getElementById('open-loan-box')
  const openCommercialLoanBoxButton = document.getElementById('open-commercial-loan-box')
  const openInvestmentBoxButton = document.getElementById('open-investment-box')
  const oneTimeBox = document.getElementById('one-time-box')
  const recurringBox = document.getElementById('recurring-box')
  const salaryBox = document.getElementById('salary-box')
  const subscriptionBox = document.getElementById('subscription-box')
  const loanBox = document.getElementById('loan-box')
  const commercialLoanBox = document.getElementById('commercial-loan-box')
  const investmentBox = document.getElementById('investment-box')
  const loanVariantInput = document.getElementById('loan-variant')
  const commercialLoanProductInput = document.getElementById('commercial-loan-product')
  const commercialLoanEligibilityHint = document.getElementById('commercial-loan-eligibility-hint')
  const commercialLoanDiscountHint = document.getElementById('commercial-loan-discount-hint')
  const commercialLoanPostSubsidyInfo = document.getElementById('commercial-loan-post-subsidy-info')
  const commercialLoanCommercialNote = document.getElementById('commercial-loan-commercial-note')
  const commercialLoanPrincipalInput = document.getElementById('commercial-loan-principal')
  const commercialLoanAnnualRateInput = document.getElementById('commercial-loan-annual-rate')
  const commercialLoanTermMonthsInput = document.getElementById('commercial-loan-term-months')
  const commercialLoanGracePeriodMonthsInput = document.getElementById(
    'commercial-loan-grace-period-months'
  )
  const commercialLoanMonthlyPreviewInput = document.getElementById('commercial-loan-monthly-preview')
  const commercialLoanTotalRepaymentPreviewInput = document.getElementById(
    'commercial-loan-total-repayment-preview'
  )
  const commercialLoanTotalInterestPreviewInput = document.getElementById(
    'commercial-loan-total-interest-preview'
  )
  const commercialLoanFeesPreviewInput = document.getElementById('commercial-loan-fees-preview')
  const commercialLoanThmPreviewInput = document.getElementById('commercial-loan-thm-preview')
  const investmentGenericCoreRow = document.getElementById('investment-generic-core-row')
  const investmentGenericSecondaryRow = document.getElementById('investment-generic-secondary-row')
  const investmentPreviewRow = document.getElementById('investment-preview-row')
  const investmentBmapWrap = document.getElementById('investment-bmap-wrap')
  const investmentDkjWrap = document.getElementById('investment-dkj-wrap')
  const investmentPmapWrap = document.getElementById('investment-pmap-wrap')
  const investmentFormStatus = document.getElementById('investment-form-status')
  const investmentPrincipalWrap = document.getElementById('investment-principal-wrap')
  const investmentPurchasePriceWrap = document.getElementById('investment-purchase-price-wrap')
  const investmentAnnualRateWrap = document.getElementById('investment-annual-rate-wrap')
  const bmapPrincipalInput = document.getElementById('bmap-principal')
  const bmapDkjBaseYieldPctInput = document.getElementById('bmap-dkj-base-yield-pct')
  const bmapInterestPremiumPctInput = document.getElementById('bmap-interest-premium-pct')
  const bmapStartDateInput = document.getElementById('bmap-start-date')
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
  const pmapInterestPremiumPctInput = document.getElementById('pmap-interest-premium-pct')
  const pmapPreviousYearInflationPctInput = document.getElementById('pmap-previous-year-inflation-pct')
  const pmapStartDateInput = document.getElementById('pmap-start-date')
  const pmapPurchaseDateInput = document.getElementById('pmap-purchase-date')
  const pmapIssueDateInput = document.getElementById('pmap-issue-date')
  const pmapFirstCouponDateInput = document.getElementById('pmap-first-coupon-date')
  const salaryScheduleModeInput = document.getElementById('salary-schedule-mode')
  const salaryCronWrap = document.getElementById('salary-cron-wrap')
  const salaryCustomWrap = document.getElementById('salary-custom-wrap')
  const loanPrincipalInput = document.getElementById('loan-principal')
  const loanAnnualRateInput = document.getElementById('loan-annual-rate')
  const loanTermValueInput = document.getElementById('loan-term-value')
  const loanTermUnitInput = document.getElementById('loan-term-unit')
  const loanGracePeriodMonthsInput = document.getElementById('loan-grace-period-months')
  const loanCapitalizeInterestAtGraceEndInput = document.getElementById(
    'loan-capitalize-interest-at-grace-end'
  )
  const loanMonthlyPreviewInput = document.getElementById('loan-monthly-preview')
  const loanTotalRepaymentPreviewInput = document.getElementById('loan-total-repayment-preview')
  const loanTotalInterestPreviewInput = document.getElementById('loan-total-interest-preview')
  const investmentSubtypeInput = document.getElementById('investment-subtype')
  const investmentIssueDateInput = document.getElementById('investment-issue-date')
  const investmentTransactionDateInput = document.getElementById('investment-transaction-date')
  const investmentDueDateInput = document.getElementById('investment-due-date')
  const investmentPrincipalInput = document.getElementById('investment-principal')
  const investmentPurchasePriceInput = document.getElementById('investment-purchase-price')
  const investmentAnnualRateInput = document.getElementById('investment-annual-rate')
  const investmentSpreadRateInput = document.getElementById('investment-spread-rate')
  const investmentYearlyInflationInput = document.getElementById('investment-yearly-inflation')
  const investmentSaleDateInput = document.getElementById('investment-sale-date')
  const investmentSaleValueInput = document.getElementById('investment-sale-value')
  const investmentCouponPeriodInput = document.getElementById('investment-coupon-period')
  const investmentPurchasePreviewInput = document.getElementById('investment-purchase-preview')
  const investmentMaturityPreviewInput = document.getElementById('investment-maturity-preview')
  const investmentGainPreviewInput = document.getElementById('investment-gain-preview')
  const investmentDiscountYieldPreviewInput = document.getElementById('investment-discount-yield-preview')
  const investmentDiscountCurrentValuePreviewInput = document.getElementById('investment-discount-current-value-preview')
  const investmentInflationSchedulePreviewInput = document.getElementById('investment-inflation-schedule-preview')
  const investmentIssueDateWrap = document.getElementById('investment-issue-date-wrap')
  const investmentTransactionDateWrap = document.getElementById('investment-transaction-date-wrap')
  const investmentDueDateWrap = document.getElementById('investment-due-date-wrap')
  const investmentSpreadRateWrap = document.getElementById('investment-spread-rate-wrap')
  const investmentYearlyInflationWrap = document.getElementById('investment-yearly-inflation-wrap')
  const investmentCouponPeriodWrap = document.getElementById('investment-coupon-period-wrap')
  const investmentSaleDateWrap = document.getElementById('investment-sale-date-wrap')
  const investmentSaleValueWrap = document.getElementById('investment-sale-value-wrap')
  const investmentDiscountYieldWrap = document.getElementById('investment-discount-yield-wrap')
  const investmentDiscountCurrentValueWrap = document.getElementById('investment-discount-current-value-wrap')
  const investmentInflationScheduleWrap = document.getElementById('investment-inflation-schedule-wrap')
  const investmentInfoPopup = document.getElementById('investment-info-popup')
  const investmentInfoPopupTitle = document.getElementById('investment-info-popup-title')
  const investmentInfoPopupText = document.getElementById('investment-info-popup-text')
  const investmentInfoPopupClose = document.getElementById('investment-info-popup-close')

  const investmentSubtypeUiConfig = {
    ...buildGenericBondSubtypeUiConfig(),
    ...buildSpecBackedInvestmentSubtypeUiConfig()
  }

  function setInvestmentFormStatus(message, level = 'info') {
    setFormStatus(investmentFormStatus, message, level)
  }

  function clearInvestmentFormErrors() {
    clearFieldValidity(investmentForm)
    setInvestmentFormStatus('', 'info')
  }

  function reportInvestmentFormError(message) {
    const text = String(message || 'Failed to save investment instrument.')
    applyInvestmentFieldValidity(investmentForm, text)
    setInvestmentFormStatus(text, 'error')
  }

  function applyGenericFieldChrome(subtype) {
    const ui = investmentSubtypeUiConfig[subtype] || investmentSubtypeUiConfig['regular-bond']
    const fields = ui.fields || {}
    const roleFor = (name) => {
      if (['maturityPreview', 'purchasePreview', 'gainPreview', 'discountYieldPreview', 'discountCurrentValuePreview', 'inflationSchedulePreview'].includes(name)) {
        return 'output'
      }
      if (name === 'annualRate' && ui.annualRateReadOnly) {
        return 'derived'
      }
      return 'input'
    }
    Object.entries(fields).forEach(([name, fieldMeta]) => {
      if (!fieldMeta?.inputId) return
      const input = investmentForm.querySelector(`#${fieldMeta.inputId}`)
      const label = input ? input.closest('label') : null
      if (!label) return
      const required = Boolean(ui.required?.[name] ?? fieldMeta.required)
      applyFieldChrome(
        label,
        {
          label: fieldMeta.label,
          description: fieldMeta.description || '',
          required,
          role: roleFor(name),
          helpId: `${fieldMeta.inputId}-help`,
          labelClassName: 'field-label'
        },
        input
      )
    })
  }

  if (
    !oneTimeForm ||
    !recurringForm ||
    !salaryForm ||
    !subscriptionForm ||
    !loanForm ||
    !investmentForm ||
    !oneTimeSubmitButton ||
    !recurringSubmitButton ||
    !salarySubmitButton ||
    !subscriptionSubmitButton ||
    !loanSubmitButton ||
    !investmentSubmitButton ||
    !oneTimeCancelButton ||
    !recurringCancelButton ||
    !salaryCancelButton ||
    !subscriptionCancelButton ||
    !loanCancelButton ||
    !investmentCancelButton ||
    !rows ||
    !chart ||
    !startInput ||
    !endInput
  ) {
    return
  }

  const schemaCheck = checkStorageSchemaVersion()
  if (schemaWarning) {
    if (schemaCheck.warnings.length > 0) {
      schemaWarning.hidden = false
      schemaWarning.textContent = schemaCheck.warnings.join(' ')
      console.warn(schemaWarning.textContent)
    } else {
      schemaWarning.hidden = true
      schemaWarning.textContent = ''
    }
  }

  function setStorageStatus(message, level) {
    if (!storageStatus) {
      return
    }

    storageStatus.textContent = message
    storageStatus.dataset.level = level || 'info'
  }

  let oneTimeFlows = ensureFlowIds(normalizeOneTimeFlows(loadList(ONE_TIME_STORAGE_KEY)), 'one')
  const rawRecurringFlows = loadList(RECURRING_STORAGE_KEY)
  let recurringFlows = ensureFlowIds(normalizeRecurringDefinitions(rawRecurringFlows), 'recurring')
  const rawInstrumentBundles = loadList(INSTRUMENT_BUNDLES_STORAGE_KEY)
  let instrumentBundles = ensureFlowIds(normalizeInstrumentBundles(rawInstrumentBundles), 'instrument')
  let listStatus = normalizeListStatus(loadObject(LIST_STATUS_STORAGE_KEY) || emptyListStatus())
  let editingOneTimeId = null
  let editingRecurringId = null
  let editingSalaryId = null
  let editingSubscriptionId = null
  let editingLoanId = null
  let editingCommercialLoanId = null
  let editingInvestmentId = null
  let activeInfoTrigger = null
  const excludedFlowIds = new Set()

  function knownConfiguredIds() {
    return [
      ...oneTimeFlows.map((flow) => flow.id),
      ...recurringFlows.map((flow) => flow.id),
      ...instrumentBundles.map((bundle) => bundle.id)
    ]
  }

  function persistListStatus(nextStatus) {
    listStatus = reconcileListStatus(nextStatus, knownConfiguredIds())
    saveObject(LIST_STATUS_STORAGE_KEY, listStatus)
  }

  function dateOrderedConfiguredIds() {
    const rows = buildConfiguredRows(oneTimeFlows, recurringFlows, instrumentBundles, () => true, {
      sortByDate: true
    })
    return rows.map((row) => row.id)
  }

  function syncListStatus() {
    const seeded = seedListStatusOrder(listStatus, dateOrderedConfiguredIds())
    persistListStatus(seeded)
  }

  syncListStatus()

  if (commercialLoanProductInput) {
    buildCommercialLoanProductOptions().forEach((option) => {
      const element = document.createElement('option')
      element.value = option.value
      element.textContent = option.label
      commercialLoanProductInput.appendChild(element)
    })
    if (!commercialLoanProductInput.value && commercialLoanProductInput.options.length > 0) {
      commercialLoanProductInput.value = commercialLoanProductInput.options[0].value
    }
  }

  function isFlowIncluded(id) {
    return !excludedFlowIds.has(id)
  }

  function setFlowIncluded(id, included) {
    if (included) {
      excludedFlowIds.delete(id)
      return
    }

    excludedFlowIds.add(id)
  }

  const toast = createToastController(appToast)
  const COMPOSE_TITLES = {
    'one-time': 'One-time flow',
    recurring: 'Recurring flow',
    salary: 'Salary instrument',
    subscription: 'Subscription instrument',
    loan: 'Simplified loan',
    'commercial-loan': 'Commercial loan',
    investment: 'Investment instrument'
  }

  function updateComposeTitle(type, pickingType) {
    if (!composeTitle) {
      return
    }

    if (pickingType) {
      composeTitle.textContent = 'Choose what to add'
      return
    }

    composeTitle.textContent = COMPOSE_TITLES[type] || 'Add cash flow'
  }

  const shell = createResponsiveShell({
    root: shellRoot,
    mobileNav,
    onViewChange: (view, state) => {
      updateComposeTitle(state.composeType, state.pickingType)
      if (view === 'browse' || view === 'chart') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  })
  shell.bindMedia()
  shell.bindMobileNav()

  const composerManager = createComposerManager({
    flowComposer,
    toggleComposerButton,
    boxes: {
      'one-time': oneTimeBox,
      recurring: recurringBox,
      salary: salaryBox,
      subscription: subscriptionBox,
      loan: loanBox,
      'commercial-loan': commercialLoanBox,
      investment: investmentBox
    },
    openButtons: {
      'one-time': openOneTimeBoxButton,
      recurring: openRecurringBoxButton,
      salary: openSalaryBoxButton,
      subscription: openSubscriptionBoxButton,
      loan: openLoanBoxButton,
      'commercial-loan': openCommercialLoanBoxButton,
      investment: openInvestmentBoxButton
    },
    onOpenBox: (type) => {
      shell.enterCompose(type)
      updateComposeTitle(type, false)
    },
    onCollapse: () => {
      if (shell.isNarrow()) {
        shell.exitCompose()
      }
    }
  })
  const { collapseComposerBoxes, openComposerBox } = composerManager

  function confirmDelete(label) {
    return window.confirm(`Delete this ${label}? This cannot be undone.`)
  }

  function notifySaved(message) {
    toast.show(message, 'success')
    setStorageStatus(message, 'success')
  }

  applyFixedRateLoanSpecToForm({ loanForm, loanBox })
  applyBmapSpecToForm({ bmapForm: investmentForm, bmapBox: investmentBox })
  applyDkjSpecToForm({ investmentForm, investmentBox })
  applyPmapSpecToForm({ investmentForm, investmentBox })

  function setInvestmentFamilyTitle() {
    if (!investmentBox) return
    const summaryTitle = investmentBox.querySelector('.summary-title')
    if (summaryTitle) {
      summaryTitle.textContent = INVESTMENT_FAMILY_TITLE
    }
  }

  function rebuildInvestmentSubtypeOptions() {
    if (!investmentSubtypeInput) return

    const previousValue = investmentSubtypeInput.value || 'regular-bond'
    const options = [
      ...GENERIC_BOND_SUBTYPE_OPTIONS,
      ...PRODUCT_BOND_SUBTYPE_OPTIONS.filter((entry) => entry.available)
    ]

    investmentSubtypeInput.innerHTML = ''
    options.forEach((entry) => {
      const option = document.createElement('option')
      option.value = entry.value
      option.textContent = entry.label
      investmentSubtypeInput.appendChild(option)
    })

    const availableValues = new Set(options.map((entry) => entry.value))
    investmentSubtypeInput.value = availableValues.has(previousValue)
      ? previousValue
      : 'regular-bond'
  }

  setInvestmentFamilyTitle()
  rebuildInvestmentSubtypeOptions()

  function resetOneTimeForm() {
    editingOneTimeId = null
    oneTimeForm.reset()
    oneTimeForm.querySelector('#direction').value = 'inflow'
    oneTimeSubmitButton.textContent = 'Add Cash Flow'
    oneTimeCancelButton.hidden = true
  }

  function resetRecurringForm() {
    editingRecurringId = null
    recurringForm.reset()
    recurringForm.querySelector('#recurring-direction').value = 'inflow'
    recurringSubmitButton.textContent = 'Add Recurring Cash Flow'
    recurringCancelButton.hidden = true
  }

  function applySalaryModeVisibility(mode) {
    const isCron = mode === 'cron-like'
    if (salaryCronWrap) {
      salaryCronWrap.hidden = !isCron
    }
    if (salaryCustomWrap) {
      salaryCustomWrap.hidden = isCron
    }
  }

  function setElementVisible(element, visible) {
    if (element) {
      element.hidden = !visible
    }
  }

  function setElementText(element, value) {
    if (element) {
      element.textContent = value
    }
  }

  function closeInvestmentInfoPopup() {
    if (!investmentInfoPopup) {
      return
    }

    investmentInfoPopup.hidden = true
    activeInfoTrigger = null
  }

  function getActiveInvestmentSubtype() {
    return investmentSubtypeInput ? investmentSubtypeInput.value : 'regular-bond'
  }

  function getHelpTextById(helpId) {
    if (!helpId) {
      return ''
    }

    const helpNode = document.getElementById(helpId)
    const helpParagraph = helpNode ? helpNode.querySelector('p') : null
    return helpParagraph ? helpParagraph.textContent.trim() : ''
  }

  function buildHelpText(helpId) {
    return getHelpTextById(helpId)
  }

  function getHelpTitle(button) {
    const aria = String(button.getAttribute('aria-label') || '').trim()
    if (aria) {
      return aria.replace(/\s+help$/i, '')
    }

    return 'Field info'
  }

  function positionInvestmentInfoPopup(triggerButton) {
    if (!investmentInfoPopup || !triggerButton) {
      return
    }

    const rect = triggerButton.getBoundingClientRect()
    const popupRect = investmentInfoPopup.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const margin = 10

    let left = rect.left + rect.width / 2 - popupRect.width / 2
    left = Math.max(margin, Math.min(left, viewportWidth - popupRect.width - margin))

    let top = rect.bottom + 8
    if (top + popupRect.height > viewportHeight - margin) {
      top = rect.top - popupRect.height - 8
    }
    top = Math.max(margin, top)

    investmentInfoPopup.style.left = `${left}px`
    investmentInfoPopup.style.top = `${top}px`
  }

  function toggleInvestmentInfoPopup(button) {
    if (!investmentInfoPopup || !investmentInfoPopupTitle || !investmentInfoPopupText || !button) {
      return
    }

    if (activeInfoTrigger === button && !investmentInfoPopup.hidden) {
      closeInvestmentInfoPopup()
      return
    }

    const helpId = button.getAttribute('data-help-button')
    const helpText = buildHelpText(helpId)
    investmentInfoPopupTitle.textContent = getHelpTitle(button)
    investmentInfoPopupText.textContent = helpText || 'No additional details available.'
    investmentInfoPopup.hidden = false
    activeInfoTrigger = button
    positionInvestmentInfoPopup(button)
  }

  function applyInvestmentSubtypeUi(subtype) {
    setInvestmentFamilyTitle()
    clearInvestmentFormErrors()

    const ui =
      investmentSubtypeUiConfig[subtype] || investmentSubtypeUiConfig['regular-bond']
    const dedicated = Boolean(ui.usesDedicatedHost)
    const isBmap = subtype === 'bmap'
    const isDkj = subtype === 'dkj'
    const isPmap = subtype === 'pmap'

    setBmapFieldVisibility(investmentForm, isBmap)
    setDkjFieldVisibility(investmentForm, isDkj)
    setPmapFieldVisibility(investmentForm, isPmap)

    setElementVisible(investmentGenericCoreRow, !dedicated)
    setElementVisible(investmentGenericSecondaryRow, !dedicated)
    setElementVisible(investmentPreviewRow, true)

    const genericInputs = [
      investmentIssueDateInput,
      investmentTransactionDateInput,
      investmentDueDateInput,
      investmentPrincipalInput,
      investmentPurchasePriceInput,
      investmentAnnualRateInput,
      investmentSpreadRateInput,
      investmentYearlyInflationInput,
      investmentCouponPeriodInput,
      investmentSaleDateInput,
      investmentSaleValueInput
    ]
    const bmapInputs = [
      bmapPrincipalInput,
      bmapDkjBaseYieldPctInput,
      bmapInterestPremiumPctInput,
      bmapStartDateInput,
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
      pmapInterestPremiumPctInput,
      pmapPreviousYearInflationPctInput,
      pmapStartDateInput,
      pmapPurchaseDateInput,
      pmapIssueDateInput,
      pmapFirstCouponDateInput
    ]

    ;[...genericInputs, ...bmapInputs, ...dkjInputs, ...pmapInputs].forEach((input) => {
      if (!input) return
      input.disabled = true
      if (!dedicated) {
        // leave required to chrome below for generics
      } else {
        input.required = false
      }
    })

    if (isBmap) {
      bmapInputs.forEach((input) => {
        if (input) input.disabled = false
      })
      applyBmapSpecToForm({ bmapForm: investmentForm, bmapBox: investmentBox })
      setElementVisible(investmentDiscountYieldWrap, false)
      setElementVisible(investmentDiscountCurrentValueWrap, false)
      setElementVisible(investmentInflationScheduleWrap, false)
      return
    }

    if (isDkj) {
      dkjInputs.forEach((input) => {
        if (input) input.disabled = false
      })
      applyDkjSpecToForm({ investmentForm, investmentBox })
      setElementVisible(investmentDiscountYieldWrap, true)
      setElementVisible(investmentDiscountCurrentValueWrap, true)
      setElementVisible(investmentInflationScheduleWrap, false)
      return
    }

    if (isPmap) {
      pmapInputs.forEach((input) => {
        if (input) input.disabled = false
      })
      applyPmapSpecToForm({ investmentForm, investmentBox })
      setElementVisible(investmentDiscountYieldWrap, false)
      setElementVisible(investmentDiscountCurrentValueWrap, false)
      setElementVisible(investmentInflationScheduleWrap, true)
      return
    }

    genericInputs.forEach((input) => {
      if (input) input.disabled = false
    })

    const showInflationControls =
      subtype === 'inflation-linked-bond' || subtype === 'custom-bond'

    setElementVisible(investmentIssueDateWrap, ui.visible.issueDate)
    setElementVisible(investmentTransactionDateWrap, ui.visible.transactionDate)
    setElementVisible(investmentDueDateWrap, ui.visible.dueDate)
    setElementVisible(investmentPrincipalWrap, ui.visible.principal !== false)
    setElementVisible(investmentPurchasePriceWrap, ui.visible.purchasePrice !== false)
    setElementVisible(investmentAnnualRateWrap, ui.visible.annualRate !== false)
    setElementVisible(investmentSpreadRateWrap, showInflationControls && ui.visible.spreadRate)
    setElementVisible(investmentYearlyInflationWrap, showInflationControls && ui.visible.yearlyInflation)
    setElementVisible(investmentCouponPeriodWrap, ui.visible.couponPeriod)
    setElementVisible(investmentSaleDateWrap, ui.visible.saleDate)
    setElementVisible(investmentSaleValueWrap, ui.visible.saleValue)
    setElementVisible(investmentDiscountYieldWrap, ui.visible.discountYieldPreview)
    setElementVisible(
      investmentDiscountCurrentValueWrap,
      ui.visible.discountCurrentValuePreview
    )
    setElementVisible(investmentInflationScheduleWrap, ui.visible.inflationSchedulePreview)

    if (investmentAnnualRateInput) {
      investmentAnnualRateInput.readOnly = Boolean(ui.annualRateReadOnly)
      if (ui.annualRateReadOnly) {
        investmentAnnualRateInput.value = ''
      }
    }

    applyGenericFieldChrome(subtype)
  }

  function resetSalaryForm() {
    editingSalaryId = null
    salaryForm.reset()
    if (salaryScheduleModeInput) {
      salaryScheduleModeInput.value = 'custom-monthly-working-day'
      applySalaryModeVisibility('custom-monthly-working-day')
    }
    salarySubmitButton.textContent = 'Add Salary Instrument'
    salaryCancelButton.hidden = true
  }

  function resetSubscriptionForm() {
    editingSubscriptionId = null
    subscriptionForm.reset()
    subscriptionSubmitButton.textContent = 'Add Subscription Instrument'
    subscriptionCancelButton.hidden = true
  }

  function resetLoanForm() {
    editingLoanId = null
    loanForm.reset()
    if (loanVariantInput) {
      loanVariantInput.value = 'fixed-rate-standard'
    }
    loanSubmitButton.textContent = 'Add Loan Instrument'
    loanCancelButton.hidden = true
    syncLoanPreview()
  }

  function readCommercialLoanPackagingFromForm() {
    if (!commercialLoanForm) {
      return { activeDiscountNames: [], includeOptionalFeeNames: [] }
    }
    const activeDiscountNames = [
      ...commercialLoanForm.querySelectorAll('input[name="activeDiscountNames"]:checked')
    ].map((input) => input.value)
    const includeOptionalFeeNames = [
      ...commercialLoanForm.querySelectorAll('input[name="includeOptionalFeeNames"]:checked')
    ].map((input) => input.value)
    return { activeDiscountNames, includeOptionalFeeNames }
  }

  function syncCommercialLoanProductUi({
    forceDefaults = false,
    activeDiscountNames,
    includeOptionalFeeNames
  } = {}) {
    if (!commercialLoanForm || !commercialLoanProductInput) {
      return
    }

    applyCommercialLoanProductSelection({
      form: commercialLoanForm,
      productCode: commercialLoanProductInput.value,
      eligibilityElement: commercialLoanEligibilityHint,
      discountElement: commercialLoanDiscountHint,
      postSubsidyElement: commercialLoanPostSubsidyInfo,
      commercialNoteElement: commercialLoanCommercialNote,
      forceDefaults,
      activeDiscountNames,
      includeOptionalFeeNames
    })
  }

  function resetCommercialLoanForm() {
    editingCommercialLoanId = null
    if (commercialLoanForm) {
      commercialLoanForm.reset()
    }
    if (commercialLoanProductInput && commercialLoanProductInput.options.length > 0) {
      commercialLoanProductInput.value = commercialLoanProductInput.options[0].value
    }
    if (commercialLoanSubmitButton) {
      commercialLoanSubmitButton.textContent = 'Add Commercial Loan'
    }
    if (commercialLoanCancelButton) {
      commercialLoanCancelButton.hidden = true
    }
    syncCommercialLoanProductUi({ forceDefaults: true })
    syncCommercialLoanPreview()
  }

  function resetInvestmentForm() {
    editingInvestmentId = null
    investmentForm.reset()
    clearInvestmentFormErrors()
    if (investmentSubtypeInput) {
      investmentSubtypeInput.value = 'regular-bond'
      applyInvestmentSubtypeUi('regular-bond')
    }
    closeInvestmentInfoPopup()
    investmentSubmitButton.textContent = 'Add Investment Instrument'
    investmentCancelButton.hidden = true
    syncInvestmentPreview()
  }

  const syncLoanPreview = createLoanPreviewSync({
    principalInput: loanPrincipalInput,
    annualRateInput: loanAnnualRateInput,
    termValueInput: loanTermValueInput,
    termUnitInput: loanTermUnitInput,
    gracePeriodMonthsInput: loanGracePeriodMonthsInput,
    capitalizeInterestAtGraceEndInput: loanCapitalizeInterestAtGraceEndInput,
    monthlyPreviewInput: loanMonthlyPreviewInput,
    totalRepaymentPreviewInput: loanTotalRepaymentPreviewInput,
    totalInterestPreviewInput: loanTotalInterestPreviewInput,
    createLoanRepaymentPreview,
    calculateFixedRateLoanFromSpecInputs
  })

  const syncCommercialLoanPreview = createLoanPreviewSync({
    principalInput: commercialLoanPrincipalInput,
    annualRateInput: commercialLoanAnnualRateInput,
    termValueInput: commercialLoanTermMonthsInput,
    termUnitInput: { value: 'months' },
    gracePeriodMonthsInput: commercialLoanGracePeriodMonthsInput,
    capitalizeInterestAtGraceEndInput: { checked: false },
    productCodeInput: commercialLoanProductInput,
    monthlyPreviewInput: commercialLoanMonthlyPreviewInput,
    totalRepaymentPreviewInput: commercialLoanTotalRepaymentPreviewInput,
    totalInterestPreviewInput: commercialLoanTotalInterestPreviewInput,
    feesPreviewInput: commercialLoanFeesPreviewInput,
    thmPreviewInput: commercialLoanThmPreviewInput,
    readCommercialPackaging: readCommercialLoanPackagingFromForm,
    createLoanRepaymentPreview,
    calculateFixedRateLoanFromSpecInputs: calculateCommercialLoanFromSpecInputs
  })

  const investmentPreviewController = createInvestmentPreviewSync({
    form: investmentForm,
    subtypeInput: investmentSubtypeInput,
    issueDateInput: investmentIssueDateInput,
    transactionDateInput: investmentTransactionDateInput,
    dueDateInput: investmentDueDateInput,
    principalInput: investmentPrincipalInput,
    purchasePriceInput: investmentPurchasePriceInput,
    annualRateInput: investmentAnnualRateInput,
    spreadRateInput: investmentSpreadRateInput,
    yearlyInflationInput: investmentYearlyInflationInput,
    saleDateInput: investmentSaleDateInput,
    saleValueInput: investmentSaleValueInput,
    couponPeriodInput: investmentCouponPeriodInput,
    purchasePreviewInput: investmentPurchasePreviewInput,
    maturityPreviewInput: investmentMaturityPreviewInput,
    gainPreviewInput: investmentGainPreviewInput,
    discountYieldPreviewInput: investmentDiscountYieldPreviewInput,
    discountCurrentValuePreviewInput: investmentDiscountCurrentValuePreviewInput,
    inflationSchedulePreviewInput: investmentInflationSchedulePreviewInput,
    createInvestmentMaturityPreview,
    calculateDkjFromSpecInputs,
    mapFormDataToDkjSpecInputs,
    calculatePmapFromSpecInputs,
    mapFormDataToPmapSpecInputs,
    onPreviewError: (message) => {
      applyInvestmentFieldValidity(investmentForm, message)
      setInvestmentFormStatus(message, 'warning')
    },
    onPreviewSuccess: () => {
      clearFieldValidity(investmentForm)
      if (investmentFormStatus?.dataset.level === 'warning') {
        setInvestmentFormStatus('', 'info')
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
      pmapInterestPremiumPctInput,
      pmapPreviousYearInflationPctInput,
      pmapStartDateInput,
      pmapPurchaseDateInput,
      pmapIssueDateInput,
      pmapFirstCouponDateInput,
      bmapPrincipalInput,
      bmapDkjBaseYieldPctInput,
      bmapInterestPremiumPctInput,
      bmapStartDateInput,
      bmapPurchaseDateInput,
      bmapIssueDateInput,
      bmapFirstCouponDateInput
    ]
  })
  const { syncInvestmentPreview } = investmentPreviewController

  function startCommercialLoanEdit(id) {
    const bundle = instrumentBundles.find((entry) => entry.id === id && entry.instrumentType === 'loan')
    if (!bundle || !commercialLoanForm) {
      return
    }

    const config = bundle.config || {}
    const product =
      findCommercialLoanProductById(bundle.productId) ||
      findCommercialLoanProduct(config.commercialProductCode)
    if (!product) {
      return
    }

    editingCommercialLoanId = id
    commercialLoanProductInput.value = product.productCode
    commercialLoanForm.querySelector('#commercial-loan-label').value =
      bundle.label || product.displayName
    commercialLoanForm.querySelector('#commercial-loan-start-date').value = config.startDate || ''
    commercialLoanForm.querySelector('#commercial-loan-principal').value =
      config.principal !== undefined ? formatMoneyAmount(config.principal) : ''
    commercialLoanForm.querySelector('#commercial-loan-annual-rate').value =
      config.baseAnnualInterestRatePct !== undefined
        ? String(config.baseAnnualInterestRatePct)
        : config.annualRate !== undefined
          ? String(Number(config.annualRate) * 100)
          : ''
    commercialLoanForm.querySelector('#commercial-loan-term-months').value =
      config.termValue !== undefined
        ? String(config.termValue)
        : config.termMonths !== undefined
          ? String(config.termMonths)
          : String(product.defaultTermMonths)
    commercialLoanForm.querySelector('#commercial-loan-grace-period-months').value =
      config.gracePeriodMonths !== undefined
        ? String(config.gracePeriodMonths)
        : String(product.defaultGracePeriodMonths)
    commercialLoanForm.querySelector('#commercial-loan-repayment-day').value =
      config.repaymentDayOfMonth !== undefined ? String(config.repaymentDayOfMonth) : '1'
    commercialLoanForm.querySelector('#commercial-loan-category').value = config.category || 'loan'
    commercialLoanForm.querySelector('#commercial-loan-description').value = config.description || ''
    commercialLoanForm.querySelector('#commercial-loan-include-disbursement').checked =
      config.includeDisbursement !== false

    syncCommercialLoanProductUi({
      forceDefaults: false,
      activeDiscountNames: Array.isArray(config.activeDiscountNames)
        ? config.activeDiscountNames
        : undefined,
      includeOptionalFeeNames: Array.isArray(config.includeOptionalFeeNames)
        ? config.includeOptionalFeeNames
        : undefined
    })
    const purposeSelect = commercialLoanForm.querySelector('#commercial-loan-purpose')
    if (purposeSelect && config.loanPurpose) {
      purposeSelect.value = config.loanPurpose
    }

    commercialLoanSubmitButton.textContent = 'Save Commercial Loan'
    commercialLoanCancelButton.hidden = false
    syncCommercialLoanPreview()
    openComposerBox('commercial-loan')
  }

  function startLoanEdit(id) {
    const bundle = instrumentBundles.find((entry) => entry.id === id && entry.instrumentType === 'loan')
    if (!bundle) {
      return
    }

    if (findCommercialLoanProductById(bundle.productId)) {
      startCommercialLoanEdit(id)
      return
    }

    const config = bundle.config || {}
    const isMortgage = bundle.productId === FIXED_RATE_MORTGAGE_PRODUCT_SPEC.id
    editingLoanId = id
    if (loanVariantInput) {
      loanVariantInput.value = isMortgage ? 'fixed-rate-mortgage' : 'fixed-rate-standard'
    }
    loanForm.querySelector('#loan-label').value =
      bundle.label ||
      (isMortgage
        ? FIXED_RATE_MORTGAGE_PRODUCT_SPEC.ui.formTitle
        : FIXED_RATE_LOAN_PRODUCT_SPEC.ui.formTitle)
    loanForm.querySelector('#loan-start-date').value = config.startDate || ''
    loanForm.querySelector('#loan-principal').value =
      config.principal !== undefined ? formatMoneyAmount(config.principal) : ''
    loanForm.querySelector('#loan-annual-rate').value =
      config.annualRate !== undefined ? String(Number(config.annualRate) * 100) : ''
    loanForm.querySelector('#loan-term-value').value =
      config.termValue !== undefined
        ? String(config.termValue)
        : config.termMonths !== undefined && config.termMonths % 12 === 0
          ? String(config.termMonths / 12)
          : config.termMonths !== undefined
            ? String(config.termMonths)
            : ''
    loanForm.querySelector('#loan-term-unit').value = config.termUnit || (config.termMonths && config.termMonths % 12 === 0 ? 'years' : 'months')
    loanForm.querySelector('#loan-repayment-day').value = config.repaymentDayOfMonth !== undefined ? String(config.repaymentDayOfMonth) : '1'
    loanForm.querySelector('#loan-category').value = config.category || 'loan'
    loanForm.querySelector('#loan-description').value = config.description || ''
    loanForm.querySelector('#loan-include-disbursement').checked = config.includeDisbursement !== false
    loanForm.querySelector('#loan-grace-period-months').value =
      config.gracePeriodMonths !== undefined ? String(config.gracePeriodMonths) : '0'
    loanForm.querySelector('#loan-capitalize-interest-at-grace-end').checked =
      Boolean(config.capitalizeInterestAtGraceEnd)

    loanSubmitButton.textContent = 'Save Loan Instrument'
    loanCancelButton.hidden = false
    syncLoanPreview()
    openComposerBox('loan')
  }

  function startInvestmentEdit(id) {
    const bundle = instrumentBundles.find((entry) => entry.id === id && entry.instrumentType === 'investment')
    if (!bundle) {
      return
    }

    const config = bundle.config || {}
    const productId = bundle.productId || config.productId
    const subtypeFromConfig =
      productId === BMAP_PRODUCT_SPEC.id || config.subtype === 'bmap'
        ? 'bmap'
        : productId === DKJ_PRODUCT_SPEC.id || config.subtype === 'dkj'
          ? 'dkj'
          : productId === PMAP_PRODUCT_SPEC.id
            ? 'pmap'
            : config.subtype || 'regular-bond'
    editingInvestmentId = id
    investmentForm.querySelector('#investment-label').value = bundle.label || 'Investment'
    investmentForm.querySelector('#investment-subtype').value = subtypeFromConfig
    investmentForm.querySelector('#investment-category').value = config.category || 'investment'
    investmentForm.querySelector('#investment-description').value = config.description || ''

    if (subtypeFromConfig === 'bmap') {
      investmentForm.querySelector('#bmap-principal').value =
        config.principal !== undefined ? formatMoneyAmount(config.principal) : ''
      investmentForm.querySelector('#bmap-dkj-base-yield-pct').value =
        config.dkjBaseYieldPct !== undefined ? String(config.dkjBaseYieldPct) : ''
      investmentForm.querySelector('#bmap-interest-premium-pct').value =
        config.interestPremiumPct !== undefined ? String(config.interestPremiumPct) : ''
      investmentForm.querySelector('#bmap-start-date').value = config.startDate || ''
      investmentForm.querySelector('#bmap-purchase-date').value = config.purchaseDate || ''
      investmentForm.querySelector('#bmap-issue-date').value = config.issueDate || ''
      investmentForm.querySelector('#bmap-first-coupon-date').value = config.firstCouponDate || ''
    } else if (subtypeFromConfig === 'dkj') {
      investmentForm.querySelector('#dkj-face-value').value =
        config.principal !== undefined ? formatMoneyAmount(config.principal) : ''
      investmentForm.querySelector('#dkj-purchase-price-pct').value =
        config.purchasePricePct !== undefined
          ? String(config.purchasePricePct)
          : config.purchasePrice !== undefined && config.principal
            ? String((Number(config.purchasePrice) / Number(config.principal)) * 100)
            : ''
      investmentForm.querySelector('#dkj-term-months').value =
        config.termMonths !== undefined ? String(config.termMonths) : '12'
      investmentForm.querySelector('#dkj-settlement-date').value =
        config.transactionDate || config.purchaseDate || config.settlementDate || ''
      investmentForm.querySelector('#dkj-maturity-date').value =
        config.dueDate || config.maturityDate || ''
      investmentForm.querySelector('#dkj-remaining-days').value =
        config.remainingDays !== undefined ? String(config.remainingDays) : ''
    } else if (subtypeFromConfig === 'pmap') {
      investmentForm.querySelector('#pmap-principal').value =
        config.principal !== undefined ? formatMoneyAmount(config.principal) : ''
      investmentForm.querySelector('#pmap-interest-premium-pct').value =
        config.interestPremiumPct !== undefined
          ? String(config.interestPremiumPct)
          : config.spreadRate !== undefined
            ? String(Number(config.spreadRate) * 100)
            : ''
      investmentForm.querySelector('#pmap-previous-year-inflation-pct').value =
        config.previousYearAverageInflationPct !== undefined
          ? String(config.previousYearAverageInflationPct)
          : ''
      investmentForm.querySelector('#pmap-start-date').value =
        config.startDate || config.issueDate || ''
      investmentForm.querySelector('#pmap-purchase-date').value =
        config.purchaseDate || config.transactionDate || ''
      investmentForm.querySelector('#pmap-issue-date').value = config.issueDate || ''
      investmentForm.querySelector('#pmap-first-coupon-date').value =
        config.firstCouponDate || config.couponPeriod || ''
    } else {
      investmentForm.querySelector('#investment-issue-date').value = config.issueDate || ''
      investmentForm.querySelector('#investment-transaction-date').value =
        config.transactionDate || config.purchaseDate || ''
      investmentForm.querySelector('#investment-due-date').value =
        config.dueDate || config.maturityDate || ''
      investmentForm.querySelector('#investment-principal').value =
        config.principal !== undefined ? formatMoneyAmount(config.principal) : ''
      investmentForm.querySelector('#investment-purchase-price').value =
        config.purchasePrice !== undefined ? formatMoneyAmount(config.purchasePrice) : ''
      investmentForm.querySelector('#investment-annual-rate').value =
        config.annualRate !== undefined ? String(config.annualRate) : ''
      investmentForm.querySelector('#investment-spread-rate').value =
        config.spreadRate !== undefined ? String(config.spreadRate) : ''
      investmentForm.querySelector('#investment-yearly-inflation').value =
        config.yearlyInflationRaw ||
        (Array.isArray(config.yearlyInflation)
          ? config.yearlyInflation.map((entry) => `${entry.year}:${entry.rate}`).join(', ')
          : '')
      investmentForm.querySelector('#investment-coupon-period').value = config.couponPeriod || ''
      investmentForm.querySelector('#investment-sale-date').value = config.saleDate || ''
      investmentForm.querySelector('#investment-sale-value').value =
        config.saleValue !== undefined ? formatMoneyAmount(config.saleValue) : ''
    }

    investmentSubmitButton.textContent = 'Save Investment Instrument'
    investmentCancelButton.hidden = false
    applyInvestmentSubtypeUi(subtypeFromConfig)
    syncInvestmentPreview()
    openComposerBox('investment')
  }

  function resetRangeIfEmpty() {
    if (oneTimeFlows.length || recurringFlows.length || instrumentBundles.length) {
      return
    }

    const fallbackDate = new Date().toISOString().slice(0, 10)
    startInput.value = fallbackDate
    endInput.value = fallbackDate
  }

  function startOneTimeEdit(id) {
    const target = oneTimeFlows.find((flow) => flow.id === id)
    if (!target) {
      return
    }

    editingOneTimeId = id
    oneTimeForm.querySelector('#date').value = target.date
    oneTimeForm.querySelector('#amount').value = formatMoneyAmount(target.amount)
    oneTimeForm.querySelector('#direction').value = target.direction
    oneTimeForm.querySelector('#category').value = target.category || 'general'
    oneTimeSubmitButton.textContent = 'Save Cash Flow'
    oneTimeCancelButton.hidden = false
    openComposerBox('one-time')
  }

  function startRecurringEdit(id) {
    const target = recurringFlows.find((flow) => flow.id === id)
    if (!target) {
      return
    }

    editingRecurringId = id
    recurringForm.querySelector('#period').value = target.period
    recurringForm.querySelector('#start-date').value = target.startDate
    recurringForm.querySelector('#end-date').value = target.endDate || ''
    recurringForm.querySelector('#occurrences').value =
      target.occurrences !== undefined ? String(target.occurrences) : ''
    recurringForm.querySelector('#recurring-amount').value = formatMoneyAmount(target.amount)
    recurringForm.querySelector('#recurring-direction').value = target.direction
    recurringForm.querySelector('#recurring-category').value = target.category || 'general'
    recurringSubmitButton.textContent = 'Save Recurring Cash Flow'
    recurringCancelButton.hidden = false
    openComposerBox('recurring')
  }

  function startSalaryEdit(id) {
    const bundle = instrumentBundles.find(
      (entry) => entry.id === id && entry.instrumentType === 'salary'
    )
    if (!bundle) {
      return
    }

    const config = bundle.config || {}
    editingSalaryId = id
    salaryForm.querySelector('#salary-label').value = bundle.label || 'Salary'
    salaryForm.querySelector('#salary-start-date').value = config.startDate || ''
    salaryForm.querySelector('#salary-end-date').value = config.endDate || ''
    salaryForm.querySelector('#salary-occurrences').value =
      config.occurrences !== undefined ? String(config.occurrences) : ''
    salaryForm.querySelector('#salary-amount').value =
      config.amount !== undefined ? formatMoneyAmount(config.amount) : ''
    salaryForm.querySelector('#salary-category').value = config.category || 'salary'
    salaryForm.querySelector('#salary-description').value = config.description || ''
    salaryForm.querySelector('#salary-schedule-mode').value =
      config.scheduleMode || 'custom-monthly-working-day'
    salaryForm.querySelector('#salary-cron-period').value = config.cronPeriod || ''
    salaryForm.querySelector('#salary-target-day').value =
      config.targetDayOfMonth !== undefined ? String(config.targetDayOfMonth) : '10'
    salaryForm.querySelector('#salary-business-day-convention').value =
      config.businessDayConvention || 'preceding'
    salaryForm.querySelector('#salary-holidays').value = Array.isArray(config.holidays)
      ? config.holidays.join(', ')
      : ''

    applySalaryModeVisibility(config.scheduleMode || 'custom-monthly-working-day')
    salarySubmitButton.textContent = 'Save Salary Instrument'
    salaryCancelButton.hidden = false
    openComposerBox('salary')
  }

  function startSubscriptionEdit(id) {
    const bundle = instrumentBundles.find(
      (entry) => entry.id === id && entry.instrumentType === 'subscription'
    )
    if (!bundle) {
      return
    }

    const config = bundle.config || {}
    editingSubscriptionId = id
    subscriptionForm.querySelector('#subscription-label').value = bundle.label || 'Subscription'
    subscriptionForm.querySelector('#subscription-period').value = config.period || ''
    subscriptionForm.querySelector('#subscription-start-date').value = config.startDate || ''
    subscriptionForm.querySelector('#subscription-end-date').value = config.endDate || ''
    subscriptionForm.querySelector('#subscription-occurrences').value =
      config.occurrences !== undefined ? String(config.occurrences) : ''
    subscriptionForm.querySelector('#subscription-amount').value =
      config.amount !== undefined ? formatMoneyAmount(config.amount) : ''
    subscriptionForm.querySelector('#subscription-category').value = config.category || 'subscription'
    subscriptionForm.querySelector('#subscription-description').value = config.description || ''

    subscriptionSubmitButton.textContent = 'Save Subscription Instrument'
    subscriptionCancelButton.hidden = false
    openComposerBox('subscription')
  }

  if (JSON.stringify(oneTimeFlows) !== JSON.stringify(loadList(ONE_TIME_STORAGE_KEY))) {
    saveCashFlowList(ONE_TIME_STORAGE_KEY, oneTimeFlows)
  }

  if (JSON.stringify(recurringFlows) !== JSON.stringify(rawRecurringFlows)) {
    saveCashFlowList(RECURRING_STORAGE_KEY, recurringFlows)
  }

  if (JSON.stringify(instrumentBundles) !== JSON.stringify(rawInstrumentBundles)) {
    saveCashFlowList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)
  }

  composerManager.bindEvents()

  if (addTypePicker) {
    addTypePicker.addEventListener('click', (event) => {
      const button = event.target.closest('[data-add-type]')
      if (!button || !addTypePicker.contains(button)) {
        return
      }

      const type = button.getAttribute('data-add-type')
      if (!type) {
        return
      }

      openComposerBox(type)
    })
  }

  if (composeBackButton) {
    composeBackButton.addEventListener('click', () => {
      const state = shell.getState()
      if (state.view === 'compose' && !state.pickingType && state.composeType) {
        resetOneTimeForm()
        resetRecurringForm()
        resetSalaryForm()
        resetSubscriptionForm()
        resetLoanForm()
        resetCommercialLoanForm()
        resetInvestmentForm()
        collapseComposerBoxes({ notify: false })
        shell.enterTypePicker()
        updateComposeTitle(null, true)
        return
      }

      resetOneTimeForm()
      resetRecurringForm()
      resetSalaryForm()
      resetSubscriptionForm()
      resetLoanForm()
      resetCommercialLoanForm()
      resetInvestmentForm()
      collapseComposerBoxes({ notify: false })
      shell.exitCompose()
    })
  }

  if (salaryScheduleModeInput) {
    salaryScheduleModeInput.addEventListener('change', () => {
      applySalaryModeVisibility(salaryScheduleModeInput.value)
    })
  }

  ;[loanForm, investmentForm, commercialLoanForm].filter(Boolean).forEach((form) => {
    form.querySelectorAll('[data-help-button]').forEach((button) => {
      button.addEventListener('click', () => {
        toggleInvestmentInfoPopup(button)
      })
    })
    form.querySelectorAll('[data-help-close]').forEach((button) => {
      button.addEventListener('click', () => {
        const helpId = button.getAttribute('data-help-close')
        const helpNode = helpId ? document.getElementById(helpId) : null
        if (helpNode) {
          helpNode.hidden = true
        }
        closeInvestmentInfoPopup()
      })
    })
  })

  bindMoneyAmountInputs(document)

  investmentInfoPopupClose?.addEventListener('click', closeInvestmentInfoPopup)
  window.addEventListener('resize', () => {
    if (activeInfoTrigger && !investmentInfoPopup?.hidden) {
      positionInvestmentInfoPopup(activeInfoTrigger)
    }
  })
  window.addEventListener('scroll', () => {
    if (activeInfoTrigger && !investmentInfoPopup?.hidden) {
      positionInvestmentInfoPopup(activeInfoTrigger)
    }
  }, true)
  document.addEventListener('click', (event) => {
    if (!investmentInfoPopup || investmentInfoPopup.hidden) {
      return
    }

    const target = event.target
    if (!(target instanceof Node)) {
      return
    }

    const clickedInfoButton =
      target instanceof Element && target.closest('[data-help-button]')
    if (investmentInfoPopup.contains(target) || clickedInfoButton) {
      return
    }

    closeInvestmentInfoPopup()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeInvestmentInfoPopup()
    }
  })

  if (investmentSubtypeInput) {
    investmentSubtypeInput.addEventListener('change', () => {
      applyInvestmentSubtypeUi(investmentSubtypeInput.value)
      syncInvestmentPreview()
    })
  }

  bindLoanPreviewEvents({
    principalInput: loanPrincipalInput,
    annualRateInput: loanAnnualRateInput,
    termValueInput: loanTermValueInput,
    termUnitInput: loanTermUnitInput,
    gracePeriodMonthsInput: loanGracePeriodMonthsInput,
    capitalizeInterestAtGraceEndInput: loanCapitalizeInterestAtGraceEndInput,
    syncLoanPreview
  })
  bindLoanPreviewEvents({
    principalInput: commercialLoanPrincipalInput,
    annualRateInput: commercialLoanAnnualRateInput,
    termValueInput: commercialLoanTermMonthsInput,
    termUnitInput: null,
    gracePeriodMonthsInput: commercialLoanGracePeriodMonthsInput,
    capitalizeInterestAtGraceEndInput: null,
    syncLoanPreview: syncCommercialLoanPreview
  })
  if (commercialLoanProductInput) {
    commercialLoanProductInput.addEventListener('change', () => {
      syncCommercialLoanProductUi({ forceDefaults: true })
      syncCommercialLoanPreview()
    })
  }
  if (commercialLoanForm) {
    commercialLoanForm.addEventListener('change', (event) => {
      const target = event.target
      if (
        target &&
        (target.name === 'activeDiscountNames' || target.name === 'includeOptionalFeeNames')
      ) {
        syncCommercialLoanPreview()
      }
    })
  }
  investmentPreviewController.bindEvents()

  applySalaryModeVisibility(
    salaryScheduleModeInput ? salaryScheduleModeInput.value : 'custom-monthly-working-day'
  )
  applyInvestmentSubtypeUi(investmentSubtypeInput ? investmentSubtypeInput.value : 'regular-bond')
  syncCommercialLoanProductUi({ forceDefaults: true })
  syncLoanPreview()
  syncCommercialLoanPreview()
  syncInvestmentPreview()

  const defaultRange = suggestRange([
    ...oneTimeFlows.map((entry) => ({ date: entry.date })),
    ...recurringFlows.map((entry) => ({ date: entry.startDate })),
    ...instrumentBundles.flatMap((bundle) =>
      (bundle.generatedFlows || []).map((flow) => ({
        date: flow.date
      }))
    )
  ])
  startInput.value = defaultRange.startDate
  endInput.value = defaultRange.endDate

  function handleListDrop(payload, target) {
    if (!payload || !target) {
      return
    }

    if (payload.kind === 'folder') {
      if (target.type === 'folder') {
        const folderRootIndex = listStatus.rootOrder.findIndex(
          (entry) => entry.kind === 'folder' && entry.id === target.folderId
        )
        if (folderRootIndex < 0) {
          return
        }
        persistListStatus(
          moveRootEntry(listStatus, { kind: 'folder', id: payload.id }, folderRootIndex)
        )
        rerender()
        return
      }

      persistListStatus(
        moveRootEntry(listStatus, { kind: 'folder', id: payload.id }, target.index)
      )
      rerender()
      return
    }

    if (payload.kind !== 'item') {
      return
    }

    if (target.type === 'folder') {
      persistListStatus(
        moveItem(listStatus, payload.id, {
          type: 'folder',
          folderId: target.folderId,
          index: target.index
        })
      )
      rerender()
      return
    }

    persistListStatus(
      moveItem(listStatus, payload.id, {
        type: 'root',
        index: target.index
      })
    )
    rerender()
  }

  function rerender() {
    syncListStatus()

    renderConfiguredLists({
      oneTimeFlows,
      recurringFlows,
      instrumentBundles,
      listStatus,
      tableBody: rows,
      cardsContainer: cards,
      isFlowIncluded,
      onToggleInclude: (id, included) => {
        setFlowIncluded(id, included)
        rerender()
      },
      onEditOneTime: (id) => {
        startOneTimeEdit(id)
      },
      onDeleteOneTime: (id) => {
        if (!confirmDelete('one-time cash flow')) {
          return
        }

        oneTimeFlows = removeFlowById(oneTimeFlows, id)
        excludedFlowIds.delete(id)
        persistListStatus(removeItemFromStatus(listStatus, id))
        saveCashFlowList(ONE_TIME_STORAGE_KEY, oneTimeFlows)

        if (editingOneTimeId === id) {
          resetOneTimeForm()
        }

        resetRangeIfEmpty()
        rerender()
      },
      onEditRecurring: (id) => {
        startRecurringEdit(id)
      },
      onDeleteRecurring: (id) => {
        if (!confirmDelete('recurring cash flow')) {
          return
        }

        recurringFlows = removeFlowById(recurringFlows, id)
        excludedFlowIds.delete(id)
        persistListStatus(removeItemFromStatus(listStatus, id))
        saveCashFlowList(RECURRING_STORAGE_KEY, recurringFlows)

        if (editingRecurringId === id) {
          resetRecurringForm()
        }

        resetRangeIfEmpty()
        rerender()
      },
      onEditInstrument: (id) => {
        const target = instrumentBundles.find((bundle) => bundle.id === id)
        if (!target) {
          return
        }

        if (target.instrumentType === 'salary') {
          startSalaryEdit(id)
        } else if (target.instrumentType === 'subscription') {
          startSubscriptionEdit(id)
        } else if (target.instrumentType === 'loan') {
          startLoanEdit(id)
        } else if (target.instrumentType === 'investment') {
          startInvestmentEdit(id)
        }
      },
      onDeleteInstrument: (id) => {
        if (!confirmDelete('instrument')) {
          return
        }

        instrumentBundles = removeFlowById(instrumentBundles, id)
        excludedFlowIds.delete(id)
        persistListStatus(removeItemFromStatus(listStatus, id))
        saveCashFlowList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)

        if (editingSalaryId === id) {
          resetSalaryForm()
        }

        if (editingSubscriptionId === id) {
          resetSubscriptionForm()
        }

        if (editingLoanId === id) {
          resetLoanForm()
        }

        if (editingCommercialLoanId === id) {
          resetCommercialLoanForm()
        }

        if (editingInvestmentId === id) {
          resetInvestmentForm()
        }

        resetRangeIfEmpty()
        rerender()
      },
      onToggleFolder: (folderId, collapsed) => {
        persistListStatus(setFolderCollapsed(listStatus, folderId, collapsed))
        rerender()
      },
      onRenameFolder: (folderId, name) => {
        persistListStatus(renameFolder(listStatus, folderId, name))
        rerender()
      },
      onDeleteFolder: (folderId) => {
        persistListStatus(deleteFolder(listStatus, folderId))
        rerender()
      },
      onListDrop: handleListDrop
    })

    const startDate = startInput.value
    const endDate = endInput.value
    if (!startDate || !endDate || startDate > endDate) {
      chart.innerHTML = '<div class="empty">Select a valid date range.</div>'
      return
    }

    try {
      const includedOneTime = oneTimeFlows.filter((flow) => isFlowIncluded(flow.id))
      const includedRecurring = recurringFlows.filter((flow) => isFlowIncluded(flow.id))
      const includedBundles = instrumentBundles.filter((bundle) => isFlowIncluded(bundle.id))
      const effectiveFlows = buildEffectiveFlows(
        includedOneTime,
        includedRecurring,
        startDate,
        endDate,
        includedBundles
      )
      const series = calculateCumulativeSeries(effectiveFlows)
      renderChart(series, chart, {
        startDate,
        endDate
      })
    } catch (error) {
      chart.innerHTML = `<div class="empty">${error.message}</div>`
    }
  }

  oneTimeForm.addEventListener('submit', (event) => {
    event.preventDefault()

    const formData = new FormData(oneTimeForm)
    const amount = parseMoneyAmount(formData.get('amount'))
    const date = String(formData.get('date') || '')
    const direction = String(formData.get('direction') || 'inflow')
    const category = String(formData.get('category') || '').trim() || 'general'

    if (!date || !Number.isFinite(amount) || amount < 0) {
      return
    }

    const oneTimeFlow = {
      id: editingOneTimeId || createFlowId('one'),
      date,
      amount,
      direction,
      category
    }

    oneTimeFlows = upsertFlowById(oneTimeFlows, oneTimeFlow)
    saveCashFlowList(ONE_TIME_STORAGE_KEY, oneTimeFlows)

    const updatedRange = extendRange(startInput.value, endInput.value, date, date)
    startInput.value = updatedRange.startDate
    endInput.value = updatedRange.endDate

    resetOneTimeForm()
    collapseComposerBoxes()
    notifySaved('One-time cash flow saved.')
    rerender()
  })

  recurringForm.addEventListener('submit', (event) => {
    event.preventDefault()

    const formData = new FormData(recurringForm)
    const period = String(formData.get('period') || '').trim()
    const startDate = String(formData.get('startDate') || '')
    const endDate = String(formData.get('endDate') || '').trim()
    const occurrencesRaw = String(formData.get('occurrences') || '').trim()
    const amount = parseMoneyAmount(formData.get('amount'))
    const direction = String(formData.get('direction') || 'inflow')
    const category = String(formData.get('category') || '').trim() || 'general'

    const hasEndDate = endDate.length > 0
    const hasOccurrences = occurrencesRaw.length > 0
    if (!hasEndDate && !hasOccurrences) {
      return
    }

    const occurrences = hasOccurrences ? Number(occurrencesRaw) : undefined
    if (hasOccurrences && (!Number.isInteger(occurrences) || occurrences <= 0)) {
      return
    }

    if (!startDate || !period || !Number.isFinite(amount) || amount < 0) {
      return
    }

    try {
      parseRecurringSchedule(period)
      const parsedStart = parseIsoDate(startDate)
      if (hasEndDate) {
        const parsedEnd = parseIsoDate(endDate)
        if (parsedEnd.getTime() < parsedStart.getTime()) {
          return
        }
      }
    } catch {
      return
    }

    const recurringFlow = {
      id: editingRecurringId || createFlowId('recurring'),
      period,
      startDate,
      endDate: hasEndDate ? endDate : undefined,
      occurrences,
      amount,
      direction,
      category
    }

    recurringFlows = upsertFlowById(recurringFlows, recurringFlow)
    saveCashFlowList(RECURRING_STORAGE_KEY, recurringFlows)

    const updatedRange = extendRange(startInput.value, endInput.value, startDate, endDate || startDate)
    startInput.value = updatedRange.startDate
    endInput.value = updatedRange.endDate

    resetRecurringForm()
    collapseComposerBoxes()
    notifySaved('Recurring cash flow saved.')
    rerender()
  })

  salaryForm.addEventListener('submit', (event) => {
    event.preventDefault()

    try {
      const formData = new FormData(salaryForm)
      const bundle = generateSalaryInstrumentBundle({
        id: editingSalaryId || undefined,
        label: String(formData.get('label') || '').trim() || 'Salary',
        startDate: String(formData.get('startDate') || '').trim(),
        endDate: String(formData.get('endDate') || '').trim() || undefined,
        occurrences: String(formData.get('occurrences') || '').trim(),
        amount: parseMoneyAmount(formData.get('amount')),
        category: String(formData.get('category') || '').trim() || 'salary',
        description: String(formData.get('description') || '').trim() || undefined,
        scheduleMode: String(formData.get('scheduleMode') || 'custom-monthly-working-day'),
        cronPeriod: String(formData.get('cronPeriod') || '').trim(),
        targetDayOfMonth: Number(formData.get('targetDayOfMonth') || 10),
        businessDayConvention: String(formData.get('businessDayConvention') || 'preceding'),
        holidaysRaw: String(formData.get('holidays') || '').trim(),
        createdAt: editingSalaryId
          ? instrumentBundles.find((entry) => entry.id === editingSalaryId)?.createdAt
          : undefined
      })

      if (!bundle || !bundle.generatedFlows.length) {
        return
      }

      instrumentBundles = upsertFlowById(instrumentBundles, bundle)
      saveCashFlowList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)

      const firstDate = bundle.generatedFlows[0].date
      const lastDate = bundle.generatedFlows[bundle.generatedFlows.length - 1].date
      const updatedRange = extendRange(startInput.value, endInput.value, firstDate, lastDate)
      startInput.value = updatedRange.startDate
      endInput.value = updatedRange.endDate

      resetSalaryForm()
      collapseComposerBoxes()
      notifySaved('Salary instrument saved.')
      rerender()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save salary instrument.'
      setStorageStatus(message, 'error')
    }
  })

  subscriptionForm.addEventListener('submit', (event) => {
    event.preventDefault()

    try {
      const formData = new FormData(subscriptionForm)
      const bundle = generateSubscriptionInstrumentBundle({
        id: editingSubscriptionId || undefined,
        label: String(formData.get('label') || '').trim() || 'Subscription',
        period: String(formData.get('period') || '').trim(),
        startDate: String(formData.get('startDate') || '').trim(),
        endDate: String(formData.get('endDate') || '').trim() || undefined,
        occurrences: String(formData.get('occurrences') || '').trim(),
        amount: parseMoneyAmount(formData.get('amount')),
        category: String(formData.get('category') || '').trim() || 'subscription',
        description: String(formData.get('description') || '').trim() || undefined,
        createdAt: editingSubscriptionId
          ? instrumentBundles.find((entry) => entry.id === editingSubscriptionId)?.createdAt
          : undefined
      })

      if (!bundle || !bundle.generatedFlows.length) {
        return
      }

      instrumentBundles = upsertFlowById(instrumentBundles, bundle)
      saveCashFlowList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)

      const firstDate = bundle.generatedFlows[0].date
      const lastDate = bundle.generatedFlows[bundle.generatedFlows.length - 1].date
      const updatedRange = extendRange(startInput.value, endInput.value, firstDate, lastDate)
      startInput.value = updatedRange.startDate
      endInput.value = updatedRange.endDate

      resetSubscriptionForm()
      collapseComposerBoxes()
      notifySaved('Subscription instrument saved.')
      rerender()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save subscription instrument.'
      setStorageStatus(message, 'error')
    }
  })

  oneTimeCancelButton.addEventListener('click', () => {
    resetOneTimeForm()
    collapseComposerBoxes()
  })

  recurringCancelButton.addEventListener('click', () => {
    resetRecurringForm()
    collapseComposerBoxes()
  })

  salaryCancelButton.addEventListener('click', () => {
    resetSalaryForm()
    collapseComposerBoxes()
  })

  subscriptionCancelButton.addEventListener('click', () => {
    resetSubscriptionForm()
    collapseComposerBoxes()
  })

  loanCancelButton.addEventListener('click', () => {
    resetLoanForm()
    collapseComposerBoxes()
  })

  if (commercialLoanCancelButton) {
    commercialLoanCancelButton.addEventListener('click', () => {
      resetCommercialLoanForm()
      collapseComposerBoxes()
    })
  }

  investmentCancelButton.addEventListener('click', () => {
    resetInvestmentForm()
    collapseComposerBoxes()
  })

  loanForm.addEventListener('submit', (event) => {
    event.preventDefault()

    try {
      const formData = new FormData(loanForm)
      const variant = String(formData.get('loanVariant') || 'fixed-rate-standard')
      const submittedTermUnit =
        String(formData.get('termUnit') || 'months').trim().toLowerCase() === 'years'
          ? 'years'
          : 'months'
      const submittedTermValue = Number(formData.get('termValue'))
      const extrasBase = {
        id: editingLoanId || undefined,
        repaymentDayOfMonth: Number(formData.get('repaymentDayOfMonth')),
        includeDisbursement: formData.get('includeDisbursement') === 'on',
        category: String(formData.get('category') || '').trim() || 'loan',
        description: String(formData.get('description') || '').trim() || undefined,
        createdAt: editingLoanId
          ? instrumentBundles.find((entry) => entry.id === editingLoanId)?.createdAt
          : undefined
      }

      let bundle
      if (variant === 'fixed-rate-mortgage') {
        const mortgageInputs = mapFormDataToFixedRateMortgageSpecInputs(formData)
        const termMonths =
          submittedTermUnit === 'years' ? submittedTermValue * 12 : submittedTermValue
        const gracePeriodMonths = Number(formData.get('gracePeriodMonths') || 0)
        const capitalizeInterestAtGraceEnd =
          gracePeriodMonths > 0 && formData.get('capitalizeInterestAtGraceEnd') === 'on'
        bundle = generateLoanInstrumentBundle(
          mapFixedRateMortgageSpecInputsToLegacyLoanBundleInput(
            {
              ...mortgageInputs,
              termMonths,
              gracePeriodMonths,
              capitalizeInterestAtGraceEnd
            },
            {
              ...extrasBase,
              label:
                String(formData.get('label') || '').trim() ||
                FIXED_RATE_MORTGAGE_PRODUCT_SPEC.ui.formTitle
            }
          )
        )
      } else {
        const specInputs = mapFormDataToFixedRateLoanSpecInputs(formData)
        bundle = generateLoanInstrumentBundle(
          mapFixedRateLoanSpecInputsToLegacyLoanBundleInput(specInputs, {
            ...extrasBase,
            label:
              String(formData.get('label') || '').trim() || FIXED_RATE_LOAN_PRODUCT_SPEC.ui.formTitle,
            gracePeriodMonths: specInputs.gracePeriodMonths,
            capitalizeInterestAtGraceEnd: specInputs.capitalizeInterestAtGraceEnd,
            termValue: submittedTermValue,
            termUnit: submittedTermUnit
          })
        )
      }

      if (!bundle || !bundle.generatedFlows.length) {
        return
      }

      instrumentBundles = upsertFlowById(instrumentBundles, bundle)
      saveCashFlowList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)

      const firstDate = bundle.generatedFlows[0].date
      const lastDate = bundle.generatedFlows[bundle.generatedFlows.length - 1].date
      const updatedRange = extendRange(startInput.value, endInput.value, firstDate, lastDate)
      startInput.value = updatedRange.startDate
      endInput.value = updatedRange.endDate

      resetLoanForm()
      collapseComposerBoxes()
      notifySaved('Loan instrument saved.')
      rerender()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save loan instrument.'
      setStorageStatus(message, 'error')
    }
  })

  if (commercialLoanForm) {
    commercialLoanForm.addEventListener('submit', (event) => {
      event.preventDefault()

      try {
        const formData = new FormData(commercialLoanForm)
        const productCode = String(formData.get('productCode') || '').trim()
        const product = findCommercialLoanProduct(productCode)
        if (!product) {
          throw new Error('Select a commercial mortgage product.')
        }

        const specInputs = mapFormDataToCommercialLoanSpecInputs(formData, product)
        const bundle = generateLoanInstrumentBundle(
          mapCommercialLoanSpecInputsToLegacyLoanBundleInput(specInputs, {
            id: editingCommercialLoanId || undefined,
            label: String(formData.get('label') || '').trim() || product.displayName,
            repaymentDayOfMonth: Number(formData.get('repaymentDayOfMonth')),
            includeDisbursement: formData.get('includeDisbursement') === 'on',
            category: String(formData.get('category') || '').trim() || 'loan',
            description: String(formData.get('description') || '').trim() || undefined,
            createdAt: editingCommercialLoanId
              ? instrumentBundles.find((entry) => entry.id === editingCommercialLoanId)?.createdAt
              : undefined
          })
        )

        if (!bundle || !bundle.generatedFlows.length) {
          return
        }

        instrumentBundles = upsertFlowById(instrumentBundles, bundle)
        saveCashFlowList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)

        const firstDate = bundle.generatedFlows[0].date
        const lastDate = bundle.generatedFlows[bundle.generatedFlows.length - 1].date
        const updatedRange = extendRange(startInput.value, endInput.value, firstDate, lastDate)
        startInput.value = updatedRange.startDate
        endInput.value = updatedRange.endDate

        resetCommercialLoanForm()
        collapseComposerBoxes()
        notifySaved('Commercial loan saved.')
        rerender()
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to save commercial loan instrument.'
        setStorageStatus(message, 'error')
      }
    })
  }

  function persistInvestmentBundle(bundle) {
    if (!bundle || !bundle.generatedFlows || !bundle.generatedFlows.length) {
      throw new Error('Investment inputs did not produce any cash flows. Check required dates and amounts.')
    }

    instrumentBundles = upsertFlowById(instrumentBundles, bundle)
    saveCashFlowList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)

    const firstDate = bundle.generatedFlows[0].date
    const lastDate = bundle.generatedFlows[bundle.generatedFlows.length - 1].date
    const updatedRange = extendRange(startInput.value, endInput.value, firstDate, lastDate)
    startInput.value = updatedRange.startDate
    endInput.value = updatedRange.endDate

    clearInvestmentFormErrors()
    resetInvestmentForm()
    collapseComposerBoxes()
    notifySaved('Investment instrument saved.')
    rerender()
  }

  investmentForm.addEventListener('submit', (event) => {
    event.preventDefault()
    clearInvestmentFormErrors()

    try {
      const formData = new FormData(investmentForm)
      const subtype = String(formData.get('subtype') || 'regular-bond')
      const meta = {
        id: editingInvestmentId || undefined,
        label: String(formData.get('label') || '').trim(),
        category: String(formData.get('category') || '').trim() || 'investment',
        description: String(formData.get('description') || '').trim() || undefined,
        createdAt: editingInvestmentId
          ? instrumentBundles.find((entry) => entry.id === editingInvestmentId)?.createdAt
          : undefined
      }

      if (subtype === 'bmap') {
        const specInputs = mapFormDataToBmapSpecInputs(formData)
        const bundle = generateBmapInstrumentBundleFromSpecInputs(
          specInputs,
          {
            ...meta,
            label: meta.label || BMAP_PRODUCT_SPEC.ui.formTitle
          },
          { createInvestmentMaturityPreview }
        )
        persistInvestmentBundle(bundle)
        return
      }

      if (subtype === 'dkj') {
        const specInputs = mapFormDataToDkjSpecInputs(formData)
        calculateDkjFromSpecInputs(specInputs, { createInvestmentMaturityPreview })
        const bundle = generateInvestmentInstrumentBundle(
          mapDkjSpecInputsToInvestmentBundleInput(specInputs, {
            ...meta,
            label: meta.label || DKJ_PRODUCT_SPEC.ui.formTitle
          })
        )
        persistInvestmentBundle(bundle)
        return
      }

      if (subtype === 'pmap') {
        const specInputs = mapFormDataToPmapSpecInputs(formData)
        calculatePmapFromSpecInputs(specInputs, { createInvestmentMaturityPreview })
        const bundle = generateInvestmentInstrumentBundle(
          mapPmapSpecInputsToInvestmentBundleInput(specInputs, {
            ...meta,
            label: meta.label || PMAP_PRODUCT_SPEC.ui.formTitle
          })
        )
        persistInvestmentBundle(bundle)
        return
      }

      const rawTransactionDate = String(formData.get('transactionDate') || '').trim()
      const rawDueDate = String(formData.get('dueDate') || '').trim()

      const bundle = generateInvestmentInstrumentBundle({
        id: meta.id,
        label: meta.label || 'Investment',
        subtype,
        purchaseDate: rawTransactionDate,
        maturityDate: rawDueDate,
        issueDate: String(formData.get('issueDate') || '').trim(),
        transactionDate: rawTransactionDate,
        dueDate: rawDueDate,
        principal: parseMoneyAmount(formData.get('principal')),
        purchasePrice: parseMoneyAmount(formData.get('purchasePrice')),
        annualRate: Number(formData.get('annualRate')),
        spreadRate: Number(formData.get('spreadRate')),
        yearlyInflationRaw: String(formData.get('yearlyInflationRaw') || '').trim(),
        saleDate: String(formData.get('saleDate') || '').trim(),
        saleValue: parseMoneyAmount(formData.get('saleValue')),
        couponPeriod: String(formData.get('couponPeriod') || '').trim(),
        category: meta.category,
        description: meta.description,
        createdAt: meta.createdAt
      })

      persistInvestmentBundle(bundle)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save investment instrument.'
      reportInvestmentFormError(message)
    }
  })

  startInput.addEventListener('change', rerender)
  endInput.addEventListener('change', rerender)

  if (newFolderButton) {
    newFolderButton.addEventListener('click', () => {
      const name = window.prompt('Folder name', 'Folder')
      if (name === null) {
        return
      }
      persistListStatus(createFolder(listStatus, name))
      rerender()
    })
  }

  if (exportButton) {
    exportButton.addEventListener('click', () => {
      syncListStatus()
      const exportDoc = buildExportDocument(oneTimeFlows, recurringFlows, instrumentBundles, listStatus)
      const blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const stamp = exportDoc.exportedAt.slice(0, 10)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `privfina-export-v${exportDoc.schemaVersion}-${stamp}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setStorageStatus(`Exported JSON backup with schema v${exportDoc.schemaVersion}.`, 'success')
    })
  }

  if (importButton && importInput) {
    importButton.addEventListener('click', async () => {
      const file = importInput.files && importInput.files[0]
      if (!file) {
        setStorageStatus('Select a JSON file to import.', 'warning')
        return
      }

      try {
        const raw = await file.text()
        const parsed = JSON.parse(raw)
        const imported = parseImportDocument(parsed)

        oneTimeFlows = imported.oneTimeFlows
        recurringFlows = imported.recurringFlows
        instrumentBundles = imported.instrumentBundles
        excludedFlowIds.clear()
        listStatus = normalizeListStatus(imported.listStatus || emptyListStatus())
        persistListStatus(listStatus)
        saveCashFlowList(ONE_TIME_STORAGE_KEY, oneTimeFlows)
        saveCashFlowList(RECURRING_STORAGE_KEY, recurringFlows)
        saveCashFlowList(INSTRUMENT_BUNDLES_STORAGE_KEY, instrumentBundles)
        localStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, String(imported.schemaVersion))

        const importedRange = suggestRange([
          ...oneTimeFlows.map((entry) => ({ date: entry.date })),
          ...recurringFlows.map((entry) => ({ date: entry.startDate })),
          ...instrumentBundles.flatMap((bundle) =>
            (bundle.generatedFlows || []).map((flow) => ({
              date: flow.date
            }))
          )
        ])
        startInput.value = importedRange.startDate
        endInput.value = importedRange.endDate

        const extra = imported.warnings.length > 0 ? ` ${imported.warnings.join(' ')}` : ''
        setStorageStatus(
          `Imported ${oneTimeFlows.length} one-time, ${recurringFlows.length} recurring, and ${instrumentBundles.length} instrument bundles (schema v${imported.schemaVersion}).${extra}`,
          imported.warnings.length > 0 ? 'warning' : 'success'
        )
        rerender()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import JSON data.'
        setStorageStatus(message, 'error')
      }
    })
  }

  rerender()
}

export { initController }