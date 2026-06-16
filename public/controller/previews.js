function createLoanPreviewSync({
  principalInput,
  annualRateInput,
  termValueInput,
  termUnitInput,
  monthlyPreviewInput,
  totalRepaymentPreviewInput,
  totalInterestPreviewInput,
  createLoanRepaymentPreview
}) {
  return function syncLoanPreview() {
    if (!monthlyPreviewInput || !totalRepaymentPreviewInput || !totalInterestPreviewInput) {
      return
    }

    try {
      const principal = Number(principalInput?.value)
      const annualRate = Number(annualRateInput?.value)
      const termValue = Number(termValueInput?.value)
      const termUnit = termUnitInput?.value || 'months'
      const termMonths = termUnit === 'years' ? termValue * 12 : termValue
      const preview = createLoanRepaymentPreview({
        principal,
        annualRate,
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
  principalInput,
  purchasePriceInput,
  annualRateInput,
  spreadRateInput,
  yearlyInflationInput,
  couponPeriodInput,
  purchasePreviewInput,
  maturityPreviewInput,
  gainPreviewInput,
  createInvestmentMaturityPreview
}) {
  const purchaseDateInput = form ? form.querySelector('#investment-purchase-date') : null
  const maturityDateInput = form ? form.querySelector('#investment-maturity-date') : null

  const syncInvestmentPreview = () => {
    if (!purchasePreviewInput || !maturityPreviewInput || !gainPreviewInput) {
      return
    }

    try {
      const preview = createInvestmentMaturityPreview({
        subtype: String(subtypeInput?.value || 'regular-bond'),
        purchaseDate: String(purchaseDateInput?.value || ''),
        maturityDate: String(maturityDateInput?.value || ''),
        principal: Number(principalInput?.value),
        purchasePrice: Number(purchasePriceInput?.value),
        annualRate: Number(annualRateInput?.value),
        spreadRate: Number(spreadRateInput?.value),
        yearlyInflationRaw: String(yearlyInflationInput?.value || '')
      })

      purchasePreviewInput.value = preview.purchaseAmount.toFixed(2)
      maturityPreviewInput.value = preview.maturityAmount.toFixed(2)
      gainPreviewInput.value = preview.gainAmount.toFixed(2)
    } catch {
      purchasePreviewInput.value = '—'
      maturityPreviewInput.value = '—'
      gainPreviewInput.value = '—'
    }
  }

  const bindEvents = () => {
    ;['input', 'change'].forEach((eventName) => {
      subtypeInput?.addEventListener(eventName, syncInvestmentPreview)
      principalInput?.addEventListener(eventName, syncInvestmentPreview)
      purchasePriceInput?.addEventListener(eventName, syncInvestmentPreview)
      annualRateInput?.addEventListener(eventName, syncInvestmentPreview)
      spreadRateInput?.addEventListener(eventName, syncInvestmentPreview)
      yearlyInflationInput?.addEventListener(eventName, syncInvestmentPreview)
      couponPeriodInput?.addEventListener(eventName, syncInvestmentPreview)
      purchaseDateInput?.addEventListener(eventName, syncInvestmentPreview)
      maturityDateInput?.addEventListener(eventName, syncInvestmentPreview)
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
