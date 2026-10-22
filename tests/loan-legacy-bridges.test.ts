import { describe, expect, it } from 'vitest'
import {
  mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  calculateFixedRateLoanLikeFromSpecInputs
} from '../public/controller/loan-legacy-bridges.js'

describe('loan legacy bridges', () => {
  it('maps loan-like spec inputs to the browser preview calculation shape', () => {
    expect(
      mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput({
        principal: 100000,
        annualInterestRatePct: 5,
        termMonths: 360,
        startDate: '2026-01-01'
      })
    ).toEqual({
      principal: 100000,
      annualRate: 0.05,
      termMonths: 360,
      gracePeriodMonths: 0,
      capitalizeInterestAtGraceEnd: false,
      interestDayCountConvention: '30/360',
      paymentRounding: 'none'
    })
  })

  it('maps legacy loan preview fields to product-spec outputs', () => {
    expect(
      mapLegacyLoanPreviewToSpecOutputs({
        monthlyInstallment: 536.82,
        termMonths: 360,
        totalInterest: 93255.2,
        totalRepayment: 193255.2
      })
    ).toEqual({
      monthlyPayment: 536.82,
      paymentCount: 360,
      totalInterest: 93255.2,
      totalPaid: 193255.2
    })
  })

  it('prefers explicit paymentCount from preview when grace reduces cash outflows', () => {
    expect(
      mapLegacyLoanPreviewToSpecOutputs({
        monthlyInstallment: 100,
        termMonths: 15,
        paymentCount: 12,
        totalInterest: 50,
        totalRepayment: 1200
      })
    ).toMatchObject({
      paymentCount: 12,
      monthlyPayment: 100
    })
  })

  it('delegates calculation through the provided preview function', () => {
    let calls = 0
    const outputs = calculateFixedRateLoanLikeFromSpecInputs(
      {
        principal: 1000,
        annualInterestRatePct: 12,
        termMonths: 12
      },
      {
        createLoanRepaymentPreview: (input) => {
          calls += 1
          expect(input).toEqual({
            principal: 1000,
            annualRate: 0.12,
            termMonths: 12,
            gracePeriodMonths: 0,
            capitalizeInterestAtGraceEnd: false,
            interestDayCountConvention: '30/360',
            paymentRounding: 'none'
          })
          return {
            monthlyInstallment: 88.85,
            termMonths: 12,
            totalInterest: 66.2,
            totalRepayment: 1066.2
          }
        }
      }
    )

    expect(calls).toBe(1)
    expect(outputs).toEqual({
      monthlyPayment: 88.85,
      paymentCount: 12,
      totalInterest: 66.2,
      totalPaid: 1066.2
    })
  })
})
