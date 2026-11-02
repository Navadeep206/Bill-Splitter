import { Check, CircleAlert, Loader2, UserPlus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type Balance, type Member } from '@/lib/api'
import { formatCents } from '@/lib/money'

type PeopleCardProps = {
  homeId: string
  balances: Balance[]
  onAdded: (member: Member) => void
  // The request may have reached the server, so the page reloads to show the truth.
  onUnsure: () => void
}

export function PeopleCard({ homeId, balances, onAdded, onUnsure }: PeopleCardProps) {
  const empty = balances.length === 0

  return (
    <Card aria-labelledby="people-h" className="gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="people-h" className="font-bold text-xl">
          People
        </h2>
        {!empty && (
          <span className="text-[13px] text-muted-foreground">In the order they joined</span>
        )}
      </div>

      {empty ? (
        <div className="flex flex-col gap-2 py-2">
          <UserPlus className="size-6 text-primary" aria-hidden="true" />
          <h3 className="font-semibold text-lg">Nobody lives here yet</h3>
          <p className="text-body-subtle">
            Add everyone who shares the bills, starting with yourself. Bills can be added once at
            least one person is here.
          </p>
        </div>
      ) : (
        <ul>
          {balances.map((person) => (
            <li
              key={person.memberId}
              className="flex items-center justify-between gap-3 border-divider border-t py-3"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar aria-hidden="true">
                  <AvatarFallback>{person.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="truncate font-medium">{person.name}</span>
              </span>
              {person.outstandingCents > 0 ? (
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-muted-foreground text-xs">Still owes</span>
                  <span className="money font-semibold">
                    {formatCents(person.outstandingCents)}
                  </span>
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold text-sm text-success">
                  <Check className="size-4" aria-hidden="true" />
                  Owes nothing
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddPersonForm homeId={homeId} primary={empty} onAdded={onAdded} onUnsure={onUnsure} />
    </Card>
  )
}

function AddPersonForm({
  homeId,
  primary,
  onAdded,
  onUnsure,
}: {
  homeId: string
  primary: boolean
  onAdded: (member: Member) => void
  onUnsure: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') {
      setError('Enter a name to add a person.')
      return
    }
    setBusy(true)
    const result = await api.addMember(homeId, trimmed)
    setBusy(false)
    if (!result.ok) {
      const { error } = result
      if (error.kind === 'http' && error.status < 500) {
        setError(`${error.message} The person wasn’t added, so you can try again.`)
        return
      }
      // Timeout, lost connection, 5xx or an unreadable reply: they may have been added.
      setError(
        `We couldn’t confirm the person was added. ${error.message} Check the list above before trying again.`,
      )
      onUnsure()
      return
    }
    setName('')
    setError('')
    onAdded(result.data)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 border-divider border-t pt-4">
      <Label htmlFor="person-name">Add a person</Label>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-0 flex-[1_1_160px]">
          <Input
            id="person-name"
            autoComplete="off"
            placeholder="Their name"
            maxLength={100}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby="person-help person-err"
          />
        </div>
        <Button
          type="submit"
          variant={primary ? 'default' : 'secondary'}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
          {busy ? 'Adding…' : 'Add person'}
        </Button>
      </div>
      {error && (
        <Alert id="person-err" variant="destructive" className="border-0 bg-transparent p-0">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p id="person-help" className="text-[13px] text-muted-foreground">
        New people are only included in bills added after they join.
      </p>
    </form>
  )
}
