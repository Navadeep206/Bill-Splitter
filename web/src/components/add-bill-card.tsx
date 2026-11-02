import { CircleAlert, Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type Balance, type Bill } from '@/lib/api'
import { formatCents, joinNames, MAX_TOTAL_CENTS, parseDollars, splitCents } from '@/lib/money'

type AddBillCardProps = {
  homeId: string
  people: Balance[]
  onAdded: (bill: Bill) => void
  // The request may have reached the server, so the page reloads to show the truth.
  onUnsure: () => void
}

function amountError(amount: string): string {
  if (amount.trim() === '') return 'Enter the total amount.'
  const cents = parseDollars(amount)
  if (cents === null) return 'Use a number with at most 2 decimals, like 42 or 42.50.'
  if (cents === 0) return 'The amount must be more than $0.00.'
  if (cents > MAX_TOTAL_CENTS || !Number.isSafeInteger(cents))
    return `The amount can be at most ${formatCents(MAX_TOTAL_CENTS)}.`
  return ''
}

export function AddBillCard({ homeId, people, onAdded, onUnsure }: AddBillCardProps) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [titleErr, setTitleErr] = useState('')
  const [amountErr, setAmountErr] = useState('')
  const [serverErr, setServerErr] = useState('')
  const [busy, setBusy] = useState(false)
  const nobodyHere = people.length === 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitleErr =
      title.trim() === '' ? 'Enter what the bill is for, like “Water — November”.' : ''
    const nextAmountErr = amountError(amount)
    setTitleErr(nextTitleErr)
    setAmountErr(nextAmountErr)
    setServerErr('')
    const cents = parseDollars(amount)
    if (nextTitleErr || nextAmountErr || cents === null || nobodyHere) return

    setBusy(true)
    const result = await api.addBill(homeId, title.trim(), cents)
    setBusy(false)

    if (result.ok) {
      setTitle('')
      setAmount('')
      onAdded(result.data)
      return
    }
    const { error } = result
    if (error.kind === 'http' && error.status < 500) {
      setServerErr(
        `The bill wasn’t added. The server said: “${error.message}”. Your details are still here, so you can try again.`,
      )
      return
    }
    setServerErr(
      `We couldn’t confirm the bill was added. ${error.message} Check the list of bills below before trying again.`,
    )
    onUnsure()
  }

  return (
    <Card aria-labelledby="add-bill-h">
      <h2 id="add-bill-h" className="font-bold text-xl">
        Add a bill
      </h2>

      {nobodyHere && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>
            A bill is split between the people in this home, and there’s nobody here yet.{' '}
            <a href="#person-name" className="underline underline-offset-2">
              Add a person first
            </a>
            , then add the bill.
          </AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={submit}
        noValidate
        className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] items-start gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bill-title">What is it for?</Label>
          <Input
            id="bill-title"
            autoComplete="off"
            placeholder="e.g. Electricity — November"
            maxLength={100}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleErr('')
            }}
            aria-invalid={titleErr ? true : undefined}
            aria-describedby={titleErr ? 'title-err' : undefined}
          />
          {titleErr && (
            <p id="title-err" role="alert" className="text-destructive text-sm">
              {titleErr}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bill-amount">Total amount (USD)</Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="money -translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground"
            >
              $
            </span>
            <Input
              id="bill-amount"
              className="money pl-[26px]"
              inputMode="decimal"
              autoComplete="off"
              placeholder="42.50"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setAmountErr('')
              }}
              aria-invalid={amountErr ? true : undefined}
              aria-describedby={amountErr ? 'amount-help amount-err' : 'amount-help'}
            />
          </div>
          {amountErr && (
            <p id="amount-err" role="alert" className="text-destructive text-sm">
              {amountErr}
            </p>
          )}
          <p id="amount-help" className="text-[13px] text-muted-foreground">
            Whole dollars or dollars and cents, like 42 or 42.50.
          </p>
        </div>

        <SplitPreview amount={amount} people={people} />

        {serverErr && (
          <Alert variant="destructive" className="col-span-full px-3 py-2.5">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{serverErr}</AlertDescription>
          </Alert>
        )}

        <div className="col-span-full flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            It will be split between everyone who lives here now.
          </p>
          <Button type="submit" disabled={busy || nobodyHere} aria-busy={busy || undefined}>
            {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
            {busy ? 'Adding bill…' : 'Add bill'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function SplitPreview({ amount, people }: { amount: string; people: Balance[] }) {
  const cents = parseDollars(amount)
  // Uses the form's own check, so the preview and the submit never disagree about
  // which amounts are valid. The exact problem is shown once, next to the field.
  let hint = ''
  if (people.length === 0) hint = 'Add a person to see how bills will split.'
  else if (amount.trim() === '') hint = 'Type an amount to see each person’s share.'
  else if (amountError(amount)) hint = 'Fix the amount to see the split.'

  const parts = cents && people.length > 0 ? splitCents(cents, people.length) : []
  const extra = cents && people.length > 0 ? cents % people.length : 0
  const extraNames = people.slice(0, extra).map((p) => p.name)

  return (
    <div
      aria-live="polite"
      className="col-span-full flex flex-col gap-2.5 rounded-xl border border-subtle-border bg-subtle px-4 py-3.5"
    >
      <p className="font-semibold text-sm">Preview: how it will split</p>
      {hint || cents === null ? (
        <p className="text-muted-foreground text-sm">{hint}</p>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(120px,100%),1fr))] gap-2">
            {people.map((person, i) => (
              <li
                key={person.memberId}
                className="flex flex-col rounded-[10px] border border-subtle-border bg-card px-3 py-2"
              >
                <span className="truncate text-[13px] text-muted-foreground">{person.name}</span>
                <span className="money font-semibold">{formatCents(parts[i] ?? 0)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-muted-foreground">
            {extra > 0
              ? `${formatCents(cents)} doesn’t split evenly, so the extra ${extra}¢ ${extra === 1 ? 'goes' : 'go'} to ${joinNames(extraNames)}, who joined first.`
              : 'Everyone pays the same amount.'}
          </p>
        </>
      )}
    </div>
  )
}
