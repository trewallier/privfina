import { formatMoneyAmount, parseMoneyAmount } from './money-format.js'

const WHOLE_FORINT = Object.freeze({ fractionDigits: 0 })

function normalizePreviewGracePeriodMonths(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return 0
  }

  const gracePeriodMonths = Number(value)
  if (!Number.isInteger(gracePeriodMonths) || gracePeriodMonths < 0) {
    throw new Error('Grace period months must be a non-negative integer.')
  }

  return gracePeriodMonths
}

function createLoanPreviewSync({
  principalInput,
  annualRateInput,
  termValueInput,
  termUnitInput,
  gracePeriodMonthsInput,
  capitalizeInterestAtGraceEndInput,
  /** Optional product picker (commercial composer); value is productCode. */
  productCodeInput,
  monthlyPreviewInput,
  totalRepaymentPreviewInput,
  totalInterestPreviewInput,
  /** Optional commercial packaging previews (single THM number, fee total). */
  feesPreviewInput,
  thmPreviewInput,
  /** Optional () => ({ activeDiscountNames, includeOptionalFeeNames }). */
  readCommercialPackaging,
  createLoanRepaymentPreview,
  calculateFixedRateLoanFromSpecInputs
}) {
  return function syncLoanPreview() {
    if (!monthlyPreviewInput || !totalRepaymentPreviewInput || !totalInterestPreviewInput) {
      return
    }

    const clearCommercialExtras = () => {
      if (feesPreviewInput) feesPreviewInput.value = '—'
      if (thmPreviewInput) thmPreviewInput.value = '—'
    }

    try {
      const principal = parseMoneyAmount(principalInput?.value)
      const annualRateInputValue = Number(annualRateInput?.value)
      const termValue = Number(termValueInput?.value)
      const termUnit = termUnitInput?.value || 'months'
      const termMonths = termUnit === 'years' ? termValue * 12 : termValue
      const gracePeriodMonths = normalizePreviewGracePeriodMonths(gracePeriodMonthsInput?.value)
      const capitalizeInterestAtGraceEnd =
        gracePeriodMonths > 0 && Boolean(capitalizeInterestAtGraceEndInput?.checked)
      const productCode = String(productCodeInput?.value || '').trim()
      const packaging =
        typeof readCommercialPackaging === 'function' ? readCommercialPackaging() || {} : {}

      if (typeof calculateFixedRateLoanFromSpecInputs === 'function') {
        const specOutputs = calculateFixedRateLoanFromSpecInputs(
          {
            principal,
            annualInterestRatePct: annualRateInputValue,
            termMonths,
            gracePeriodMonths,
            capitalizeInterestAtGraceEnd,
            ...(productCode ? { productCode } : {}),
            ...(packaging.activeDiscountNames
              ? { activeDiscountNames: packaging.activeDiscountNames }
              : {}),
            ...(packaging.includeOptionalFeeNames
              ? { includeOptionalFeeNames: packaging.includeOptionalFeeNames }
              : {})
          },
          {
            createLoanRepaymentPreview,
            ...(productCode ? { productCode } : {})
          }
        )

        monthlyPreviewInput.value = formatMoneyAmount(specOutputs.monthlyPayment)
        totalRepaymentPreviewInput.value = formatMoneyAmount(specOutputs.totalPaid)
        totalInterestPreviewInput.value = formatMoneyAmount(specOutputs.totalInterest)
        if (feesPreviewInput) {
          feesPreviewInput.value =
            specOutputs.totalCreditCostFees === undefined
              ? '—'
              : formatMoneyAmount(specOutputs.totalCreditCostFees)
        }
        if (thmPreviewInput) {
          thmPreviewInput.value =
            specOutputs.thmPct === undefined ? '—' : `${Number(specOutputs.thmPct).toFixed(1)}%`
        }
        return
      }

      const preview = createLoanRepaymentPreview({
        principal,
        annualRate: annualRateInputValue,
        termMonths,
        gracePeriodMonths,
        capitalizeInterestAtGraceEnd
      })

      monthlyPreviewInput.value = formatMoneyAmount(preview.monthlyInstallment)
      totalRepaymentPreviewInput.value = formatMoneyAmount(preview.totalRepayment)
      totalInterestPreviewInput.value = formatMoneyAmount(preview.totalInterest)
      clearCommercialExtras()
    } catch {
      monthlyPreviewInput.value = '—'
      totalRepaymentPreviewInput.value = '—'
      totalInterestPreviewInput.value = '—'
      clearCommercialExtras()
    }
  }
}

function createInvestmentPreviewSync({
  form,
  subtypeInput,
  issueDateInput,
  transactionDateInput,
  dueDateInput,
  principalInput,
  purchasePriceInput,
  annualRateInput,
  spreadRateInput,
  yearlyInflationInput,
  saleDateInput,
  saleValueInput,
  couponPeriodInput,
  purchasePreviewInput,
  maturityPreviewInput,
  gainPreviewInput,
  discountYieldPreviewInput,
  discountCurrentValuePreviewInput,
  inflationSchedulePreviewInput,
  createInvestmentMaturityPreview,
  calculateDkjFromSpecInputs,
  mapFormDataToDkjSpecInputs,
  calculatePmapFromSpecInputs,
  mapFormDataToPmapSpecInputs,
  calculateBmapFromSpecInputs,
  mapFormDataToBmapSpecInputs,
  onPreviewError,
  onPreviewSuccess,
  extraInputs = []
}) {
  const remainingDaysInput = form?.querySelector?.('#dkj-remaining-days') || null

  const clearPreviews = () => {
    if (purchasePreviewInput) purchasePreviewInput.value = '—'
    if (maturityPreviewInput) maturityPreviewInput.value = '—'
    if (gainPreviewInput) gainPreviewInput.value = '—'
    if (discountYieldPreviewInput) discountYieldPreviewInput.value = '—'
    if (discountCurrentValuePreviewInput) discountCurrentValuePreviewInput.value = '—'
    if (inflationSchedulePreviewInput) inflationSchedulePreviewInput.value = '—'
    if (remainingDaysInput) remainingDaysInput.value = ''
  }

  const syncInvestmentPreview = () => {
    if (!purchasePreviewInput || !maturityPreviewInput || !gainPreviewInput) {
      return
    }

    try {
      const subtype = String(subtypeInput?.value || 'regular-bond')

      if (subtype === 'dkj' && typeof calculateDkjFromSpecInputs === 'function' && typeof mapFormDataToDkjSpecInputs === 'function' && form) {
        const specInputs = mapFormDataToDkjSpecInputs(new FormData(form))
        const preview = calculateDkjFromSpecInputs(specInputs, { createInvestmentMaturityPreview })

        purchasePreviewInput.value = formatMoneyAmount(preview.purchaseAmount, WHOLE_FORINT)
        maturityPreviewInput.value = formatMoneyAmount(preview.redemptionValue, WHOLE_FORINT)
        gainPreviewInput.value = formatMoneyAmount(preview.grossGain, WHOLE_FORINT)
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
        if (typeof onPreviewSuccess === 'function') {
          onPreviewSuccess()
        }
        return
      }

      if (subtype === 'pmap' && typeof calculatePmapFromSpecInputs === 'function' && typeof mapFormDataToPmapSpecInputs === 'function' && form) {
        const specInputs = mapFormDataToPmapSpecInputs(new FormData(form))
        const preview = calculatePmapFromSpecInputs(specInputs, { createInvestmentMaturityPreview })

        purchasePreviewInput.value = formatMoneyAmount(preview.purchaseAmount, WHOLE_FORINT)
        maturityPreviewInput.value = formatMoneyAmount(specInputs.principal, WHOLE_FORINT)
        gainPreviewInput.value = formatMoneyAmount(
          Number(specInputs.principal) - Number(preview.purchaseAmount),
          WHOLE_FORINT
        )
        if (discountYieldPreviewInput) {
          discountYieldPreviewInput.value = '—'
        }
        if (discountCurrentValuePreviewInput) {
          discountCurrentValuePreviewInput.value = '—'
        }
        if (inflationSchedulePreviewInput) {
          inflationSchedulePreviewInput.value = `${preview.annualCouponRatePct.toFixed(4)}%`
        }
        if (typeof onPreviewSuccess === 'function') {
          onPreviewSuccess()
        }
        return
      }

      if (
        subtype === 'bmap' &&
        typeof calculateBmapFromSpecInputs === 'function' &&
        typeof mapFormDataToBmapSpecInputs === 'function' &&
        form
      ) {
        const specInputs = mapFormDataToBmapSpecInputs(new FormData(form))
        const preview = calculateBmapFromSpecInputs(specInputs, {
          createInvestmentMaturityPreview
        })

        purchasePreviewInput.value = formatMoneyAmount(preview.purchaseAmount, WHOLE_FORINT)
        maturityPreviewInput.value = formatMoneyAmount(specInputs.principal, WHOLE_FORINT)
        gainPreviewInput.value = formatMoneyAmount(
          Number(specInputs.principal) - Number(preview.purchaseAmount),
          WHOLE_FORINT
        )
        if (discountYieldPreviewInput) {
          discountYieldPreviewInput.value = '—'
        }
        if (discountCurrentValuePreviewInput) {
          discountCurrentValuePreviewInput.value = '—'
        }
        if (inflationSchedulePreviewInput) {
          inflationSchedulePreviewInput.value = `${preview.annualCouponRatePct.toFixed(4)}%`
        }
        if (typeof onPreviewSuccess === 'function') {
          onPreviewSuccess()
        }
        return
      }

      const transactionDateValue = String(transactionDateInput?.value || '')
      const dueDateValue = String(dueDateInput?.value || '')
      const effectivePurchaseDate = transactionDateValue
      const effectiveMaturityDate = dueDateValue

      const preview = createInvestmentMaturityPreview({
        subtype,
        purchaseDate: effectivePurchaseDate,
        maturityDate: effectiveMaturityDate,
        issueDate: String(issueDateInput?.value || ''),
        transactionDate: transactionDateValue,
        dueDate: dueDateValue,
        principal: parseMoneyAmount(principalInput?.value),
        purchasePrice: parseMoneyAmount(purchasePriceInput?.value),
        annualRate: Number(annualRateInput?.value),
        spreadRate: Number(spreadRateInput?.value),
        yearlyInflationRaw: String(yearlyInflationInput?.value || ''),
        saleDate: String(saleDateInput?.value || ''),
        saleValue: parseMoneyAmount(saleValueInput?.value)
      })

      purchasePreviewInput.value = formatMoneyAmount(preview.purchaseAmount)
      maturityPreviewInput.value = formatMoneyAmount(preview.maturityAmount)
      gainPreviewInput.value = formatMoneyAmount(preview.gainAmount)
      if (discountYieldPreviewInput) {
        discountYieldPreviewInput.value = preview.discountMetrics
          ? `${preview.discountMetrics.yieldPercent.toFixed(4)}%`
          : '—'
      }
      if (discountCurrentValuePreviewInput) {
        discountCurrentValuePreviewInput.value = preview.discountMetrics
          ? `${preview.discountMetrics.currentValuePercent.toFixed(4)}%`
          : '—'
      }
      if (inflationSchedulePreviewInput) {
        inflationSchedulePreviewInput.value = preview.inflationMetrics
          ? preview.inflationMetrics.accrualPeriods
              .map((period) => `${period.maturityDate}: rate=${period.effectiveAnnualRate.toFixed(4)}, factor=${period.accrualFactor.toFixed(6)}`)
              .join(' | ')
          : '—'
      }
      if (typeof onPreviewSuccess === 'function') {
        onPreviewSuccess()
      }
    } catch (error) {
      clearPreviews()
      if (typeof onPreviewError === 'function') {
        const message = error instanceof Error ? error.message : 'Investment preview failed.'
        onPreviewError(message, error)
      }
    }
  }

  const bindEvents = () => {
    const inputs = [
      subtypeInput,
      issueDateInput,
      transactionDateInput,
      dueDateInput,
      principalInput,
      purchasePriceInput,
      annualRateInput,
      spreadRateInput,
      yearlyInflationInput,
      saleDateInput,
      saleValueInput,
      couponPeriodInput,
      ...extraInputs
    ]
    ;['input', 'change'].forEach((eventName) => {
      inputs.forEach((input) => input?.addEventListener(eventName, syncInvestmentPreview))
    })
  }

  return {
    syncInvestmentPreview,
    bindEvents
  }
}

function bindLoanPreviewEvents({
  principalInput,
  annualRateInput,
  termValueInput,
  termUnitInput,
  gracePeriodMonthsInput,
  capitalizeInterestAtGraceEndInput,
  syncLoanPreview
}) {
  ;['input', 'change'].forEach((eventName) => {
    principalInput?.addEventListener(eventName, syncLoanPreview)
    annualRateInput?.addEventListener(eventName, syncLoanPreview)
    termValueInput?.addEventListener(eventName, syncLoanPreview)
    termUnitInput?.addEventListener(eventName, syncLoanPreview)
    gracePeriodMonthsInput?.addEventListener(eventName, syncLoanPreview)
    capitalizeInterestAtGraceEndInput?.addEventListener(eventName, syncLoanPreview)
  })
}

export { createLoanPreviewSync, createInvestmentPreviewSync, bindLoanPreviewEvents }
