/**
 * Commercial home-savings composer host — UI orchestration extracted from
 * app-controller (ROADMAP §5e schedule-usable follow-up). No domain math here;
 * adapters + instruments.js own calculation.
 */
import {
  buildHomeSavingsProductOptions,
  findHomeSavingsProduct,
  findHomeSavingsProductById
} from './home-savings-product-metadata.js'
import {
  applyHomeSavingsProductSelection,
  mapFormDataToHomeSavingsSpecInputs
} from './home-savings-form.js'
import {
  calculateHomeSavingsFromSpecInputs,
  calculateHomeSavingsScheduleFromSpecInputs
} from './home-savings-calculation-adapter.js'
import { setFormStatus } from './field-chrome.js'

function formatDepositBoundsHelp(product) {
  const min = Number(product?.minMonthlyDeposit)
  const max = Number(product?.maxMonthlyDeposit)
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return 'Contractual monthly deposit for the selected product.'
  }
  const formatBound = (value) => value.toLocaleString('hu-HU')
  return `Contractual monthly deposit (${formatBound(min)}–${formatBound(max)} Ft).`
}

function createHomeSavingsComposerHost({
  resolveHomeSavingsSchedule,
  createHomeSavingsInstrumentBundle,
  formatMoneyAmount,
  getInstrumentBundles,
  upsertInstrumentBundle,
  openComposerBox,
  collapseComposerBoxes,
  notifySaved,
  rerender,
  extendDateRange,
  reportError
} = {}) {
  const form = document.getElementById('home-savings-form')
  const productInput = document.getElementById('home-savings-product')
  const submitButton = document.getElementById('home-savings-submit')
  const cancelButton = document.getElementById('home-savings-cancel-edit')
  const readinessHint = document.getElementById('home-savings-readiness-hint')
  const eligibilityHint = document.getElementById('home-savings-eligibility-hint')
  const discountHint = document.getElementById('home-savings-discount-hint')
  const premiumHint = document.getElementById('home-savings-premium-hint')
  const formStatus = document.getElementById('home-savings-form-status')
  const monthlyDepositHelp = document.querySelector(
    '#home-savings-monthly-deposit-help p'
  )
  const previewInputs = {
    openingFee: document.getElementById('home-savings-opening-fee-preview'),
    accountFeeMonthly: document.getElementById('home-savings-account-fee-monthly-preview'),
    totalDeposits: document.getElementById('home-savings-total-deposits-preview'),
    totalAccountFees: document.getElementById('home-savings-total-account-fees-preview'),
    premiumRate: document.getElementById('home-savings-premium-rate-preview'),
    premiumAmount: document.getElementById('home-savings-premium-amount-preview'),
    terminalPayout: document.getElementById('home-savings-terminal-payout-preview'),
    ebkmPct: document.getElementById('home-savings-ebkm-preview')
  }

  let editingId = null

  function setStatus(message, level = 'info') {
    setFormStatus(formStatus, message, level)
  }

  function syncDepositHelp(product) {
    if (!monthlyDepositHelp || !product) {
      return
    }
    monthlyDepositHelp.textContent = formatDepositBoundsHelp(product)
  }

  function syncProductUi({ forceDefaults = false } = {}) {
    if (!form || !productInput) {
      return
    }

    const product = applyHomeSavingsProductSelection({
      form,
      productCode: productInput.value,
      readinessElement: readinessHint,
      eligibilityElement: eligibilityHint,
      discountElement: discountHint,
      premiumElement: premiumHint,
      forceDefaults
    })
    syncDepositHelp(product)
  }

  function clearPreview() {
    if (previewInputs.openingFee) previewInputs.openingFee.value = '—'
    if (previewInputs.accountFeeMonthly) previewInputs.accountFeeMonthly.value = '—'
    if (previewInputs.totalDeposits) previewInputs.totalDeposits.value = '—'
    if (previewInputs.totalAccountFees) previewInputs.totalAccountFees.value = '—'
    if (previewInputs.premiumRate) previewInputs.premiumRate.value = '—'
    if (previewInputs.premiumAmount) previewInputs.premiumAmount.value = '—'
    if (previewInputs.terminalPayout) previewInputs.terminalPayout.value = '—'
    if (previewInputs.ebkmPct) previewInputs.ebkmPct.value = '—'
  }

  function syncPreview() {
    if (!form || !productInput) {
      return
    }

    try {
      const formData = new FormData(form)
      const product = findHomeSavingsProduct(productInput.value)
      if (!product) {
        clearPreview()
        setStatus('', 'info')
        return
      }

      const monthlyDepositRaw = String(formData.get('monthlyDeposit') || '').trim()
      const termRaw = String(formData.get('termMonths') || '').trim()
      const startDate = String(formData.get('startDate') || '').trim()
      if (!monthlyDepositRaw || !termRaw || !startDate) {
        clearPreview()
        setStatus('', 'info')
        return
      }

      const specInputs = mapFormDataToHomeSavingsSpecInputs(formData, product)
      const outputs = calculateHomeSavingsScheduleFromSpecInputs(specInputs, {
        resolveHomeSavingsSchedule
      })

      if (previewInputs.openingFee) {
        previewInputs.openingFee.value = formatMoneyAmount(outputs.accountOpeningFee)
      }
      if (previewInputs.accountFeeMonthly) {
        previewInputs.accountFeeMonthly.value = formatMoneyAmount(outputs.accountFeeMonthly)
      }
      if (previewInputs.totalDeposits) {
        previewInputs.totalDeposits.value = formatMoneyAmount(outputs.totalDeposits)
      }
      if (previewInputs.totalAccountFees) {
        previewInputs.totalAccountFees.value = formatMoneyAmount(outputs.totalAccountFees)
      }
      if (previewInputs.premiumRate) {
        previewInputs.premiumRate.value = `${Number(outputs.premiumRatePct).toFixed(0)}%`
      }
      if (previewInputs.premiumAmount) {
        previewInputs.premiumAmount.value = formatMoneyAmount(outputs.premiumAmount)
      }
      if (previewInputs.terminalPayout) {
        previewInputs.terminalPayout.value = formatMoneyAmount(outputs.terminalPayout)
      }
      if (previewInputs.ebkmPct) {
        const ebkmPct = Number(outputs.ebkmPct)
        previewInputs.ebkmPct.value = Number.isFinite(ebkmPct)
          ? `${ebkmPct.toFixed(2)}%`
          : '—'
      }
      setStatus('', 'info')
    } catch (error) {
      clearPreview()
      const message =
        error instanceof Error ? error.message : 'Home-savings preview failed.'
      setStatus(message, 'warning')
    }
  }

  function resetForm() {
    editingId = null
    if (form) {
      form.reset()
      delete form.dataset.housingTouched
    }
    if (productInput && productInput.options.length > 0) {
      productInput.value = productInput.options[0].value
    }
    if (submitButton) {
      submitButton.textContent = 'Add Home Savings'
    }
    if (cancelButton) {
      cancelButton.hidden = true
    }
    setStatus('', 'info')
    syncProductUi({ forceDefaults: true })
    syncPreview()
  }

  function startEdit(id) {
    const instrumentBundles = getInstrumentBundles?.() || []
    const bundle = instrumentBundles.find(
      (entry) => entry.id === id && entry.instrumentType === 'home-savings'
    )
    if (!bundle || !form) {
      return
    }

    const config = bundle.config || {}
    const product =
      findHomeSavingsProductById(bundle.productId) ||
      findHomeSavingsProduct(config.productCode) ||
      findHomeSavingsProductById(config.productId)
    if (!product) {
      return
    }

    editingId = id
    productInput.value = product.productCode
    form.querySelector('#home-savings-label').value = bundle.label || product.displayName
    form.querySelector('#home-savings-start-date').value = config.startDate || ''
    form.querySelector('#home-savings-monthly-deposit').value =
      config.monthlyDeposit !== undefined ? formatMoneyAmount(config.monthlyDeposit) : ''
    form.querySelector('#home-savings-term-months').value =
      config.termMonths !== undefined ? String(config.termMonths) : String(product.defaultTermMonths)
    form.querySelector('#home-savings-contract-amount').value =
      config.contractAmount !== undefined ? formatMoneyAmount(config.contractAmount) : ''
    form.querySelector('#home-savings-category').value = config.category || 'home-savings'
    form.querySelector('#home-savings-description').value = config.description || ''
    form.querySelector('#home-savings-housing-purpose').checked = config.housingPurpose !== false
    form.dataset.housingTouched = '1'

    syncProductUi({ forceDefaults: false })
    const openingFeeSelect = form.querySelector('#home-savings-opening-fee-mode')
    if (openingFeeSelect) {
      openingFeeSelect.value = config.openingFeeMode || product.defaultOpeningFeeMode
    }

    if (submitButton) {
      submitButton.textContent = 'Save Home Savings'
    }
    if (cancelButton) {
      cancelButton.hidden = false
    }
    setStatus('', 'info')
    syncPreview()
    openComposerBox?.('home-savings')
  }

  function bootstrapProductPicker() {
    if (!productInput) {
      return
    }
    buildHomeSavingsProductOptions().forEach((option) => {
      const element = document.createElement('option')
      element.value = option.value
      element.textContent = option.label
      productInput.appendChild(element)
    })
    if (!productInput.value && productInput.options.length > 0) {
      productInput.value = productInput.options[0].value
    }
  }

  function handleSubmit(event) {
    event.preventDefault()

    try {
      const formData = new FormData(form)
      const productCode = String(formData.get('productCode') || '').trim()
      const product = findHomeSavingsProduct(productCode)
      if (!product) {
        throw new Error('Select a home-savings product.')
      }

      const instrumentBundles = getInstrumentBundles?.() || []
      const specInputs = mapFormDataToHomeSavingsSpecInputs(formData, product)
      const outputs = calculateHomeSavingsFromSpecInputs(specInputs, {
        createHomeSavingsInstrumentBundle,
        id: editingId || undefined,
        label: String(formData.get('label') || '').trim() || product.displayName,
        category: String(formData.get('category') || '').trim() || 'home-savings',
        description: String(formData.get('description') || '').trim() || undefined,
        createdAt: editingId
          ? instrumentBundles.find((entry) => entry.id === editingId)?.createdAt
          : undefined
      })

      const bundle = outputs.bundle
      if (!bundle || !bundle.generatedFlows.length) {
        throw new Error('Home-savings inputs did not produce any cash flows.')
      }

      upsertInstrumentBundle?.(bundle)

      const firstDate = bundle.generatedFlows[0].date
      const lastDate = bundle.generatedFlows[bundle.generatedFlows.length - 1].date
      extendDateRange?.(firstDate, lastDate)

      resetForm()
      collapseComposerBoxes?.()
      notifySaved?.('Home savings saved.')
      rerender?.()
      setStatus('', 'info')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save home-savings instrument.'
      setStatus(message, 'error')
      reportError?.(message)
    }
  }

  function bindEvents() {
    if (productInput) {
      productInput.addEventListener('change', () => {
        syncProductUi({ forceDefaults: true })
        syncPreview()
      })
    }
    if (form) {
      form.addEventListener('input', () => {
        syncPreview()
      })
      form.addEventListener('change', (event) => {
        if (event.target && event.target.name === 'housingPurpose') {
          form.dataset.housingTouched = '1'
        }
        syncPreview()
      })
      form.addEventListener('submit', handleSubmit)
    }
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        resetForm()
        collapseComposerBoxes?.()
      })
    }
  }

  function initialize() {
    bootstrapProductPicker()
    bindEvents()
    syncProductUi({ forceDefaults: true })
    syncPreview()
  }

  return {
    initialize,
    syncProductUi,
    syncPreview,
    resetForm,
    startEdit,
    getEditingId: () => editingId,
    isEditing: (id) => editingId === id
  }
}

export { createHomeSavingsComposerHost, formatDepositBoundsHelp }
