import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, type Bill } from './api'
import { fetchHome } from './use-home'

afterEach(() => vi.restoreAllMocks())

function setup(paidAt: string | null, outstandingCents: number) {
  const bill: Bill = {
    id: 'bill',
    homeId: 'home',
    title: 'Electricity',
    totalCents: 1000,
    shares: [{ id: 'share', memberId: 'asha', amountCents: 1000, paidAt }],
  }
  vi.spyOn(api, 'home').mockResolvedValue({ ok: true, data: { id: 'home', name: 'Flat' } })
  vi.spyOn(api, 'bills').mockResolvedValue({ ok: true, data: { bills: [bill] } })
  vi.spyOn(api, 'balances').mockResolvedValue({
    ok: true,
    data: {
      balances: [
        { memberId: 'asha', name: 'Asha', outstandingCents },
        { memberId: 'ben', name: 'Ben', outstandingCents: 0 },
      ],
    },
  })
  return bill
}

describe('home data consistency during concurrent changes', () => {
  it('counts an unpaid bill even if the balance response predates its creation', async () => {
    setup(null, 0)
    const result = await fetchHome('home')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected home data')
    expect(result.data.balances).toEqual([
      { memberId: 'asha', name: 'Asha', outstandingCents: 1000 },
      { memberId: 'ben', name: 'Ben', outstandingCents: 0 },
    ])
  })

  it('does not count a paid share when the balance response predates its payment', async () => {
    setup('2026-11-02T00:00:00.000Z', 1000)
    const result = await fetchHome('home')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected home data')
    expect(result.data.balances.map((member) => member.outstandingCents)).toEqual([0, 0])
  })

  it('loads member names after bills so a concurrently added member can be named', async () => {
    const bill = setup(null, 1000)
    let billsRead = false
    const readBills = api.bills
    vi.mocked(readBills).mockImplementationOnce(async () => {
      await Promise.resolve()
      billsRead = true
      return { ok: true, data: { bills: [bill] } }
    })
    vi.mocked(api.balances).mockImplementationOnce(async () => {
      return {
        ok: true,
        data: {
          balances: billsRead ? [{ memberId: 'asha', name: 'Asha', outstandingCents: 1000 }] : [],
        },
      }
    })
    const result = await fetchHome('home')
    if (!result.ok) throw new Error('Expected home data')
    expect(result.data.balances).toEqual([
      { memberId: 'asha', name: 'Asha', outstandingCents: 1000 },
    ])
  })
})
