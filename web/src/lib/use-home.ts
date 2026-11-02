import { useCallback, useEffect, useRef, useState } from 'react'
import { type ApiFailure, api, type Balance, type Bill, type Home } from '@/lib/api'

export type HomeData = { home: Home; bills: Bill[]; balances: Balance[] }

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiFailure }
  | { status: 'ready'; data: HomeData }

export async function fetchHome(homeId: string) {
  const [home, bills] = await Promise.all([api.home(homeId), api.bills(homeId)])
  if (!home.ok) return home
  if (!bills.ok) return bills
  // Members are append-only. Read them after bills so every share has a name,
  // including when someone joined while this page was loading.
  const balances = await api.balances(homeId)
  if (!balances.ok) return balances

  // These endpoints can observe different moments. Derive displayed balances
  // from the displayed shares so a concurrent change cannot be counted twice.
  const outstanding = new Map<string, number>()
  for (const bill of bills.data.bills) {
    for (const share of bill.shares) {
      if (share.paidAt === null) {
        outstanding.set(share.memberId, (outstanding.get(share.memberId) ?? 0) + share.amountCents)
      }
    }
  }
  return {
    ok: true as const,
    data: {
      home: home.data,
      bills: bills.data.bills,
      balances: balances.data.balances.map((member) => ({
        ...member,
        outstandingCents: outstanding.get(member.memberId) ?? 0,
      })),
    },
  }
}

// Loads one home. `reload` shows the loading state again; `refresh` keeps the current
// page on screen and returns the fresh data (or null if the refresh failed).
export function useHome(homeId: string) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // A failed background refresh keeps the old data on screen, so the page must say so.
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef(0)

  // Every load gets a number, and only the newest may change the page. A slow, older
  // response must not overwrite something newer, like a payment the server just confirmed.
  const latest = useRef(0)

  const reload = useCallback(async () => {
    const run = ++latest.current
    setState({ status: 'loading' })
    const result = await fetchHome(homeId)
    if (run !== latest.current) return
    setState(
      result.ok ? { status: 'ready', data: result.data } : { status: 'error', error: result.error },
    )
  }, [homeId])

  const refresh = useCallback(async (): Promise<HomeData | null> => {
    const run = ++latest.current
    inFlight.current++
    setRefreshing(true)
    const result = await fetchHome(homeId)
    inFlight.current--
    setRefreshing(inFlight.current > 0)
    if (run === latest.current) setRefreshFailed(!result.ok)
    if (!result.ok) return null
    if (run === latest.current) setState({ status: 'ready', data: result.data })
    return result.data
  }, [homeId])

  // Apply a change the server already confirmed, without waiting for a refresh.
  // Loads that started before this change are now out of date.
  const update = useCallback((change: (data: HomeData) => HomeData) => {
    latest.current++
    setState((current) =>
      current.status === 'ready' ? { status: 'ready', data: change(current.data) } : current,
    )
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { state, reload, refresh, update, refreshing, refreshFailed }
}
