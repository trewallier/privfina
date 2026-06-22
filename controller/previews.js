function createLoanPreviewSync({
  principalInput,
  annualRateInput,
  termValueInput,
  termUnitInput,
  monthlyPreviewInput,
  totalRepaymentPreviewInput,
  totalInterestPreviewInput,
  createLoanRepaymentPreview,
  calculateFixedRateLoanFromSpecInputs
}) {
  return function syncLoanPreview() {
    if (!monthlyPreviewInput || !totalRepaymentPreviewInput || !totalInterestPreviewInput) {
      return
    }

    try {
      const principal = Number(principalInput?.value)
      const annualRateInputValue = Number(annualRateInput?.value)
      const termValue = Number(termValueInput?.value)
      const termUnit = termUnitInput?.value || 'months'
      const termMonths = termUnit === 'years' ? termValue * 12 : termValue

      if (typeof calculateFixedRateLoanFromSpecInputs === 'function') {
        const specOutputs = calculateFixedRateLoanFromSpecInputs(
          {
            principal,
            annualInterestRatePct: annualRateInputValue,
            termMonths
          },
          { createLoanRepaymentPreview }
        )

        monthlyPreviewInput.value = specOutputs.monthlyPayment.toFixed(2)
        totalRepaymentPreviewInput.value = specOutputs.totalPaid.toFixed(2)
        totalInterestPreviewInput.value = specOutputs.totalInterest.toFixed(2)
        return
      }

      const preview = createLoanRepaymentPreview({
        principal,
        annualRate: annualRateInputValue,
        termMonths
      })

      monthlyPreviewInput.value = preview.monthlyInstallment.toFixed(2)
      totalRepaymentPreviewInput.value = preview.totalRepayment.toFixed(2)
      totalInterestPreviewInput.value = preview.totalInterest.toFixed(2)
    } catch {
      monthlyPreviewInput.value = '—'
      totalRepaymentPreviewInput.value = '—'
      totalInterestPreviewInput.value = '—'
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
  createInvestmentMaturityPreview
}) {
  const syncInvestmentPreview = () => {
    if (!purchasePreviewInput || !maturityPreviewInput || !gainPreviewInput) {
      return
    }

    try {
      const subtype = String(subtypeInput?.value || 'regular-bond')
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
        principal: Number(principalInput?.value),
        purchasePrice: Number(purchasePriceInput?.value),
        annualRate: Number(annualRateInput?.value),
        spreadRate: Number(spreadRateInput?.value),
        yearlyInflationRaw: String(yearlyInflationInput?.value || ''),
        saleDate: String(saleDateInput?.value || ''),
        saleValue: Number(saleValueInput?.value)
      })

      purchasePreviewInput.value = preview.purchaseAmount.toFixed(2)
      maturityPreviewInput.value = preview.maturityAmount.toFixed(2)
      gainPreviewInput.value = preview.gainAmount.toFixed(2)
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
    } catch {
      purchasePreviewInput.value = '—'
      maturityPreviewInput.value = '—'
      gainPreviewInput.value = '—'
      if (discountYieldPreviewInput) {
        discountYieldPreviewInput.value = '—'
      }
      if (discountCurrentValuePreviewInput) {
        discountCurrentValuePreviewInput.value = '—'
      }
      if (inflationSchedulePreviewInput) {
        inflationSchedulePreviewInput.value = '—'
      }
    }
  }

  const bindEvents = () => {
    ;['input', 'change'].forEach((eventName) => {
      subtypeInput?.addEventListener(eventName, syncInvestmentPreview)
      issueDateInput?.addEventListener(eventName, syncInvestmentPreview)
      transactionDateInput?.addEventListener(eventName, syncInvestmentPreview)
      dueDateInput?.addEventListener(eventName, syncInvestmentPreview)
      principalInput?.addEventListener(eventName, syncInvestmentPreview)
      purchasePriceInput?.addEventListener(eventName, syncInvestmentPreview)
      annualRateInput?.addEventListener(eventName, syncInvestmentPreview)
      spreadRateInput?.addEventListener(eventName, syncInvestmentPreview)
      yearlyInflationInput?.addEventListener(eventName, syncInvestmentPreview)
      saleDateInput?.addEventListener(eventName, syncInvestmentPreview)
      saleValueInput?.addEventListener(eventName, syncInvestmentPreview)
      couponPeriodInput?.addEventListener(eventName, syncInvestmentPreview)
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
  syncLoanPreview
}) {
  ;['input', 'change'].forEach((eventName) => {
    principalInput?.addEventListener(eventName, syncLoanPreview)
    annualRateInput?.addEventListener(eventName, syncLoanPreview)
    termValueInput?.addEventListener(eventName, syncLoanPreview)
    termUnitInput?.addEventListener(eventName, syncLoanPreview)
  })
}

export { createLoanPreviewSync, createInvestmentPreviewSync, bindLoanPreviewEvents }
