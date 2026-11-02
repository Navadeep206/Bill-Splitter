import { Check, CircleAlert, Loader2, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Balance, Bill, Share } from '@/lib/api'
import { formatCents, formatPaidAt, joinNames } from '@/lib/money'
import type { PayState } from '@/lib/use-payments'
import { cn } from '@/lib/utils'

type BillCardProps = {
  bill: Bill
  people: Balance[]
  payments: Record<string, PayState>
  onPay: (bill: Bill, share: Share, label: string) => void
  onRecheck: (shareId: string) => void
}

export function BillCard({ bill, people, payments, onPay, onRecheck }: BillCardProps) {
  const names = new Map(people.map((p) => [p.memberId, p.name]))
  const paidCount = bill.shares.filter((s) => s.paidAt !== null).length
  const total = bill.shares.length
  const inBill = new Set(bill.shares.map((s) => s.memberId))
  const joinedLater = people.filter((p) => !inBill.has(p.memberId)).map((p) => p.name)

  return (
    <Card
      role="article"
      aria-label={bill.title}
      className="gap-3.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-semibold text-lg wrap-anywhere">{bill.title}</h3>
          <p className="text-muted-foreground text-sm">
            {paidCount === total
              ? `All ${total} shares paid`
              : `${paidCount} of ${total} shares paid`}
          </p>
        </div>
        <p className="money font-semibold text-2xl leading-tight">{formatCents(bill.totalCents)}</p>
      </div>

      <SplitBar shares={bill.shares} label={`${paidCount} of ${total} shares paid`} />

      {joinedLater.length > 0 && (
        <p className="text-[13px] text-muted-foreground wrap-anywhere">
          Split {total} {total === 1 ? 'way' : 'ways'}: {joinNames(joinedLater)} joined after this
          bill was added.
        </p>
      )}

      <ul>
        {bill.shares.map((share) => (
          <ShareRow
            key={share.id}
            billTitle={bill.title}
            share={share}
            name={names.get(share.memberId) ?? 'Former member'}
            payment={payments[share.id]}
            onPay={(label) => onPay(bill, share, label)}
            onRecheck={() => onRecheck(share.id)}
          />
        ))}
      </ul>
    </Card>
  )
}

// One segment per share, sized by amount. Paid segments fill in when the server confirms.
function SplitBar({ shares, label }: { shares: Share[]; label: string }) {
  return (
    <div role="img" aria-label={label} className="flex h-3 gap-[3px]">
      {shares.map((share) => (
        <span
          key={share.id}
          style={{ flexGrow: share.amountCents, flexBasis: 0 }}
          className={cn(
            'min-w-1.5 rounded-[4px] border-[1.5px] motion-safe:transition-colors motion-safe:duration-500',
            share.paidAt ? 'border-primary bg-primary' : 'border-input bg-card',
          )}
        />
      ))}
    </div>
  )
}

type ShareRowProps = {
  billTitle: string
  share: Share
  name: string
  payment: PayState | undefined
  onPay: (label: string) => void
  onRecheck: () => void
}

function ShareRow({ billTitle, share, name, payment, onPay, onRecheck }: ShareRowProps) {
  const amount = formatCents(share.amountCents)
  const who = `${name}’s ${amount} share of ${billTitle}`
  const busy =
    payment?.status === 'paying' ||
    payment?.status === 'checking' ||
    (payment?.status === 'conflict' && payment.checking)
  const retry =
    payment?.status === 'failed' ||
    payment?.status === 'not-paid' ||
    payment?.status === 'unconfirmed'

  return (
    <li className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-divider border-t py-2.5">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="min-w-0 font-medium wrap-anywhere">{name}</span>
        <span className="money text-body-subtle">{amount}</span>
      </div>

      {share.paidAt ? (
        <span className="ml-auto flex min-h-11 items-center gap-1.5 font-semibold text-sm text-success motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
          <Check className="size-4" aria-hidden="true" />
          Paid
          <span className="font-normal text-muted-foreground">{formatPaidAt(share.paidAt)}</span>
        </span>
      ) : busy ? (
        <Button type="button" variant="secondary" className="ml-auto" disabled aria-busy="true">
          <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          {payment?.status === 'paying' ? 'Marking as paid…' : 'Checking…'}
        </Button>
      ) : payment?.status === 'conflict' ? (
        <Button
          type="button"
          variant="secondary"
          className="ml-auto"
          onClick={onRecheck}
          aria-label={`Check again whether ${who} is marked as paid`}
        >
          Check again
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="ml-auto"
          onClick={() => onPay(who)}
          aria-label={retry ? `Try marking ${who} as paid again` : `Mark ${who} as paid`}
        >
          {retry ? 'Try again' : 'Mark as paid'}
        </Button>
      )}

      <ShareMessage paid={share.paidAt !== null} payment={payment} />
    </li>
  )
}

function ShareMessage({ paid, payment }: { paid: boolean; payment: PayState | undefined }) {
  const wide = 'basis-full motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'

  if (paid) {
    return payment?.status === 'done' ? (
      <p role="status" className={cn(wide, 'text-body-subtle text-sm')}>
        {payment.note}
      </p>
    ) : null
  }

  switch (payment?.status) {
    case 'failed':
      return (
        <Alert variant="destructive" className={wide}>
          <CircleAlert aria-hidden="true" />
          <AlertDescription>
            Couldn’t mark it as paid: {payment.message} Nothing changed. You can try again.
          </AlertDescription>
        </Alert>
      )
    case 'checking':
      return (
        <Alert variant="warning" role="status" className={wide}>
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            <strong>Couldn’t confirm it was marked as paid.</strong> {payment.reason} It may or may
            not have gone through. Checking now…
          </AlertDescription>
        </Alert>
      )
    case 'not-paid':
      return (
        <Alert variant="warning" role="status" className={wide}>
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            We checked: it wasn’t marked as paid, and nothing changed. You can try again.
          </AlertDescription>
        </Alert>
      )
    case 'conflict':
      return (
        <Alert variant="warning" role="status" className={wide}>
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            This share was already marked as paid from another tab or device, so nothing changed.
            {payment.checking
              ? ' Loading the latest details…'
              : ' We couldn’t load the latest details yet. Check again to update the page.'}
          </AlertDescription>
        </Alert>
      )
    case 'unconfirmed':
      return (
        <Alert variant="warning" role="status" className={wide}>
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            <strong>Couldn’t confirm it was marked as paid</strong>, and we couldn’t reach the
            server to check. Trying again is safe: it repeats the same request, so it can’t be
            marked twice.
          </AlertDescription>
        </Alert>
      )
    default:
      return null
  }
}
