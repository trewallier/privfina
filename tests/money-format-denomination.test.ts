import { describe, expect, it } from 'vitest'
import {
  defaultDenominationAmount,
  formatMoneyAmount,
  snapToDenomination
} from '../public/controller/money-format.js'

describe('money-format denomination helpers', () => {
  it('defaults to the smallest non-zero valid denomination unit', () => {
    expect(defaultDenominationAmount(10000)).toBe(10000)
    expect(defaultDenominationAmount(1)).toBe(1)
    expect(defaultDenominationAmount(10000, { minimum: 10000 })).toBe(10000)
  })

  it('snaps face/principal amounts to denomination increments', () => {
    expect(snapToDenomination(14000, 10000)).toBe(10000)
    expect(snapToDenomination(15000, 10000)).toBe(20000)
    expect(snapToDenomination(16000, 10000)).toBe(20000)
    expect(snapToDenomination(9999, 10000)).toBe(10000)
    expect(snapToDenomination(1234.5, 1)).toBe(1235)
    expect(snapToDenomination('', 10000)).toBe(10000)
    expect(snapToDenomination('25 000', 10000)).toBe(30000)
  })

  it('formats snapped defaults for empty money inputs', () => {
    expect(formatMoneyAmount(defaultDenominationAmount(10000))).toBe('10 000.00')
    expect(formatMoneyAmount(defaultDenominationAmount(1))).toBe('1.00')
  })
})
