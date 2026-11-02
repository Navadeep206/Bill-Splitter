import { createFileRoute, Link } from '@tanstack/react-router'
import { CircleCheck, ReceiptText, RefreshCw, TriangleAlert } from 'lucide-react'
import { useCallback, useState } from 'react'
import { AddBillCard } from '@/components/add-bill-card'
import { AppHeader } from '@/components/app-header'
import { BillCard } from '@/components/bill-card'
import { LoadErrorState, LoadingState, NotFoundState } from '@/components/page-states'
import { PeopleCard } from '@/components/people-card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Bill, Member } from '@/lib/api'
import { formatCents, joinNames } from '@/lib/money'
import { type HomeData, useHome } from '@/lib/use-home'
import { usePayments } from '@/lib/use-payments'

export const Route = createFileRoute('/homes/$homeId')({
  component: HomePage,
})

type Notice = { id: number; text: string }

function HomePage() {
  const { homeId } = Route.useParams()
  const { state, reload, refresh, update, refreshing, refreshFailed } = useHome(homeId)
  const [notice, setNotice] = useState<Notice | null>(null)

  const announce = useCallback((text: string) => {
    setNotice((current) => ({ id: (current?.id ?? 0) + 1, text }))
  }, [])

  const { payments, pay, recheck } = usePayments({ refresh, update, onPaid: announce })

  if (state.status === 'loading') return <LoadingState />
  if (state.status === 'error') {
    if (state.error.kind === 'http' && state.error.status === 404) {
      return <NotFoundState homeId={homeId} />
    }
    return <LoadErrorState message={state.error.message} onRetry={() => void reload()} />
  }

  const { home, bills, balances } = state.data
  const totalOwed = balances.reduce((sum, b) => sum + b.outstandingCents, 0)

  // Confirmed changes show right away. Each one is skipped if a reload already
  // brought it in, so nothing is ever counted twice.
  const billAdded = (bill: Bill) => {
    update((data: HomeData) => {
      if (data.bills.some((b) => b.id === bill.id)) return data
      return {
        ...data,
        bills: [bill, ...data.bills],
        balances: data.balances.map((b) => {
          const share = bill.shares.find((s) => s.memberId === b.memberId)
          return share ? { ...b, outstandingCents: b.outstandingCents + share.amountCents } : b
        }),
      }
    })
    announce(
      `${bill.title} (${formatCents(bill.totalCents)}) was added and split between ${bill.shares.length} ${bill.shares.length === 1 ? 'person' : 'people'}.`,
    )
    void refresh()
  }

  const personAdded = (member: Member) => {
    update((data: HomeData) => {
      if (data.balances.some((b) => b.memberId === member.id)) return data
      // A new person owes nothing yet.
      const person = { memberId: member.id, name: member.name, outstandingCents: 0 }
      return { ...data, balances: [...data.balances, person] }
    })
    announce(`${member.name} was added. They’ll be included in bills added from now on.`)
    void refresh()
  }

  return (
    <>
      <AppHeader>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground text-sm">
            Home ID <span className="money break-all text-foreground">{home.id}</span>
          </span>
          <CopyLinkButton />
          <Button asChild variant="ghost">
            <Link to="/">Open another home</Link>
          </Button>
        </div>
      </AppHeader>

      <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 pt-8 pb-18">
        <section
          aria-labelledby="home-name"
          className="flex flex-wrap items-end justify-between gap-5"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="font-semibold text-[13px] text-muted-foreground uppercase tracking-[0.06em]">
              Shared home
            </p>
            <h1
              id="home-name"
              className="font-bold text-[40px] leading-[1.1] tracking-[-0.02em] wrap-anywhere"
            >
              {home.name}
            </h1>
          </div>
          <dl className="flex flex-wrap gap-3">
            <div className="min-w-[140px] rounded-[14px] border bg-card px-5 py-3.5">
              <dt className="text-[13px] text-muted-foreground">People</dt>
              <dd className="money mt-0.5 font-semibold text-[28px] leading-tight">
                {balances.length}
              </dd>
            </div>
            <div className="min-w-[200px] rounded-[14px] bg-ink px-5 py-3.5 text-white">
              <dt className="text-[13px] text-ink-muted">Still owed in total</dt>
              <dd className="money mt-0.5 font-semibold text-[28px] leading-tight">
                {formatCents(totalOwed)}
              </dd>
            </div>
          </dl>
        </section>

        <div role="status" aria-live="polite">
          {notice && (
            <p
              key={notice.id}
              className="flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3 text-[15px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
            >
              <CircleCheck className="size-[18px] shrink-0 text-success" aria-hidden="true" />
              <span className="min-w-0 wrap-anywhere">{notice.text}</span>
            </p>
          )}
        </div>

        {refreshFailed && (
          <Alert variant="warning" role="status" className="items-center px-4 py-2.5">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <span>Couldn’t refresh. Showing the data loaded earlier.</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void refresh()}
                disabled={refreshing}
              >
                {refreshing ? 'Trying again…' : 'Try again'}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-start gap-6">
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
            <PeopleCard
              homeId={home.id}
              balances={balances}
              onAdded={personAdded}
              onUnsure={() => void refresh()}
            />
          </aside>

          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            <AddBillCard
              homeId={home.id}
              people={balances}
              onAdded={billAdded}
              onUnsure={() => void refresh()}
            />

            <section aria-labelledby="bills-h" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h2 id="bills-h" className="font-bold text-xl">
                  Bills{' '}
                  <span className="font-normal text-[15px] text-muted-foreground">
                    · newest first
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Legend />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void refresh()}
                    disabled={refreshing}
                    aria-busy={refreshing || undefined}
                  >
                    <RefreshCw
                      className={refreshing ? 'motion-safe:animate-spin' : undefined}
                      aria-hidden="true"
                    />
                    {refreshing ? 'Refreshing…' : 'Refresh latest'}
                  </Button>
                </div>
              </div>

              {bills.length === 0 ? (
                <NoBills names={balances.map((b) => b.name)} />
              ) : (
                bills.map((bill) => (
                  <BillCard
                    key={bill.id}
                    bill={bill}
                    people={balances}
                    payments={payments}
                    onPay={pay}
                    onRecheck={recheck}
                  />
                ))
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  )
}

function Legend() {
  return (
    <div className="flex gap-4 text-[13px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-3.5 rounded-[3px] bg-primary" />
        Paid
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-3.5 rounded-[3px] border-[1.5px] border-input bg-card"
        />
        Not paid yet
      </span>
    </div>
  )
}

function NoBills({ names }: { names: string[] }) {
  const focusBillTitle = () => document.getElementById('bill-title')?.focus()

  return (
    <section
      aria-labelledby="no-bills-h"
      className="flex flex-col items-center gap-2.5 rounded-[14px] border border-input border-dashed bg-card px-5 py-7 text-center"
    >
      <ReceiptText className="size-7 text-primary" aria-hidden="true" />
      <h3 id="no-bills-h" className="font-semibold text-lg">
        No bills yet
      </h3>
      <p className="max-w-[400px] text-body-subtle wrap-anywhere">
        {names.length === 0
          ? 'Add the people who live here first, then add your first shared bill.'
          : `Add your first shared bill, like rent or electricity. It will be split between ${joinNames(names)}.`}
      </p>
      {names.length > 0 && (
        <Button type="button" onClick={focusBillTitle}>
          Add the first bill
        </Button>
      )}
    </section>
  )
}

function CopyLinkButton() {
  const [label, setLabel] = useState('Copy home link')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLabel('Link copied')
    } catch {
      setLabel('Couldn’t copy. Copy the address bar instead.')
    }
    setTimeout(() => setLabel('Copy home link'), 2500)
  }

  return (
    <Button type="button" variant="ghost" onClick={copy} aria-live="polite">
      {label}
    </Button>
  )
}
