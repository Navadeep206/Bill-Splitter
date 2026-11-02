import { useCallback, useRef, useState } from 'react'
import { api, type Bill, type Share } from '@/lib/api'
import type { HomeData } from '@/lib/use-home'

// What the page knows about one share's payment, beyond what the server has told it.
export type PayState =
  | { status: 'paying' }
  | { status: 'checking'; reason: string }
  | { status: 'failed'; message: string }
  | { status: 'not-paid' }
  | { status: 'unconfirmed' }
  | { status: 'done'; note: string }
  // The server said "already paid with a different key", but the reload that should
  // show it failed. Only a read-only check is offered, never another payment.
  | { status: 'conflict'; checking: boolean }

const ALREADY_PAID =
  'This share was already marked as paid from another tab or device, so nothing changed.'

type Options = {
  refresh: () => Promise<HomeData | null>
  update: (change: (data: HomeData) => HomeData) => void
  onPaid: (message: string) => void
}

// Show a confirmed payment right away: the share is paid and its amount leaves
// that person's balance, so the bill and the totals never disagree.
function markPaid(data: HomeData, paid: Share): HomeData {
  if (isPaid(data, paid.id)) return data
  return {
    ...data,
    bills: data.bills.map((bill) => ({
      ...bill,
      shares: bill.shares.map((share) => (share.id === paid.id ? paid : share)),
    })),
    balances: data.balances.map((b) =>
      b.memberId === paid.memberId
        ? { ...b, outstandingCents: b.outstandingCents - paid.amountCents }
        : b,
    ),
  }
}

function isPaid(data: HomeData, shareId: string): boolean {
  return data.bills.some((bill) =>
    bill.shares.some((share) => share.id === shareId && share.paidAt !== null),
  )
}

export function usePayments({ refresh, update, onPaid }: Options) {
  const [payments, setPayments] = useState<Record<string, PayState>>({})

  // One Idempotency-Key per share, kept until the server confirms the payment.
  // Every retry of that payment sends the same key, so the server can never pay twice.
  const keys = useRef(new Map<string, string>())

  const set = useCallback((shareId: string, next: PayState) => {
    setPayments((current) => ({ ...current, [shareId]: next }))
  }, [])

  // Reload to show a share someone else already marked as paid.
  const recheck = useCallback(
    async (shareId: string) => {
      set(shareId, { status: 'conflict', checking: true })
      const fresh = await refresh()
      set(
        shareId,
        fresh && isPaid(fresh, shareId)
          ? { status: 'done', note: ALREADY_PAID }
          : { status: 'conflict', checking: false },
      )
    },
    [refresh, set],
  )

  const pay = useCallback(
    async (bill: Bill, share: Share, label: string) => {
      const key = keys.current.get(share.id) ?? crypto.randomUUID()
      keys.current.set(share.id, key)
      set(share.id, { status: 'paying' })

      const result = await api.payShare(bill.id, share.id, key)

      if (result.ok) {
        keys.current.delete(share.id)
        update((data) => markPaid(data, result.data))
        setPayments(({ [share.id]: _, ...rest }) => rest)
        onPaid(`${label} is marked as paid. The server confirmed it.`)
        void refresh()
        return
      }

      const { error } = result
      if (error.kind === 'http' && error.status === 409) {
        keys.current.delete(share.id)
        await recheck(share.id)
        return
      }

      if (error.kind === 'http' && error.status < 500) {
        set(share.id, { status: 'failed', message: error.message })
        return
      }

      // Timeout, lost connection, 5xx or an unreadable reply: the server may have saved it.
      set(share.id, { status: 'checking', reason: error.message })
      const fresh = await refresh()
      if (fresh === null) {
        set(share.id, { status: 'unconfirmed' })
      } else if (isPaid(fresh, share.id)) {
        keys.current.delete(share.id)
        set(share.id, {
          status: 'done',
          note: 'We checked with the server: it was marked as paid.',
        })
      } else {
        set(share.id, { status: 'not-paid' })
      }
    },
    [refresh, update, onPaid, set, recheck],
  )

  return { payments, pay, recheck }
}
