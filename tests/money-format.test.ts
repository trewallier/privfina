import { describe, expect, it } from 'vitest'
import { formatMoneyAmount, parseMoneyAmount } from '../public/controller/money-format.js'

describe('money amount formatting', () => {
  it('groups thousands with spaces', () => {
    expect(formatMoneyAmount(5000)).toBe('5 000.00')
    expect(formatMoneyAmount(1_000_000)).toBe('1 000 000.00')
    expect(formatMoneyAmount(12_000_000)).toBe('12 000 000.00')
    expect(formatMoneyAmount(101_128)).toBe('101 128.00')
  })

  it('preserves two decimal places and negative sign', () => {
    expect(formatMoneyAmount(12.5)).toBe('12.50')
    expect(formatMoneyAmount(-2000)).toBe('−2 000.00')
  })

  it('parses spaced and plain numeric strings', () => {
    expect(parseMoneyAmount('5 000')).toBe(5000)
    expect(parseMoneyAmount('1 000 000.50')).toBe(1000000.5)
    expect(parseMoneyAmount('101128.00')).toBe(101128)
    expect(parseMoneyAmount(12_000_000)).toBe(12_000_000)
  })
})
