import { describe, expect, it } from 'vitest'
import { formatCents, joinNames, MAX_TOTAL_CENTS, parseDollars, splitCents } from './money'

describe('parseDollars', () => {
  it.each([
    ['42', 4200],
    ['42.5', 4250],
    ['42.50', 4250],
    ['$42.50', 4250],
    ['$ 10', 1000],
    ['  7 ', 700],
    ['1,500', 150000],
    ['1,234,567.89', 123456789],
    ['0', 0],
    ['007', 700],
  ])('reads %j as %i cents', (input, cents) => {
    expect(parseDollars(input)).toBe(cents)
  })

  it.each(['', 'abc', '1,50', '12,34,567', '1,5000', '10.505', '10.', '.5', '-5', '1e3', '$'])(
    'rejects %j',
    (input) => {
      expect(parseDollars(input)).toBeNull()
    },
  )

  it('reads the largest exact amount exactly', () => {
    expect(parseDollars('90,071,992,547,409.91')).toBe(MAX_TOTAL_CENTS)
    expect(parseDollars('1000000000')).toBe(100_000_000_000)
  })

  it('returns amounts over the limit as numbers, so the form can say "at most"', () => {
    expect(parseDollars('90071992547409.92')).toBeGreaterThan(MAX_TOTAL_CENTS)
    expect(parseDollars('999999999999999999')).toBeGreaterThan(MAX_TOTAL_CENTS)
  })
})

describe('splitCents', () => {
  it('gives the extra cents to the first people, in join order', () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333])
    expect(splitCents(4510, 4)).toEqual([1128, 1128, 1127, 1127])
  })

  it('allows zero-cent shares', () => {
    expect(splitCents(1, 3)).toEqual([1, 0, 0])
  })

  it('always adds up to the total', () => {
    const parts = splitCents(100001, 7)
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(100001)
  })
})

describe('formatCents and joinNames', () => {
  it('formats whole cents as dollars', () => {
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(5)).toBe('$0.05')
    expect(formatCents(240000)).toBe('$2,400.00')
  })

  it('joins names the way the page writes them', () => {
    expect(joinNames(['Asha'])).toBe('Asha')
    expect(joinNames(['Asha', 'Ben'])).toBe('Asha and Ben')
    expect(joinNames(['Asha', 'Ben', 'Chloe'])).toBe('Asha, Ben and Chloe')
  })
})
