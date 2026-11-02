import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CircleAlert, Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

export const Route = createFileRoute('/')({
  component: StartPage,
})

// Accepts a full link (".../homes/<id>") or just the ID.
// Returns null for a link that can't be decoded, such as one containing "%ZZ".
function homeIdFrom(input: string): string | null {
  const text = input.trim()
  const match = /\/homes\/([^/?#]+)/.exec(text)
  if (!match?.[1]) return text
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function StartPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex max-w-[960px] flex-col gap-10 px-6 pt-18 pb-20">
        <div className="flex max-w-[640px] flex-col gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
          <h1 className="text-balance font-bold text-[44px] leading-[1.1] tracking-[-0.025em]">
            Split the bills for your shared home
          </h1>
          <p className="text-pretty text-body-subtle text-lg">
            Add rent, electricity or internet once. Everyone sees their share, pays it, and can
            check who still owes what.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-stretch gap-6">
          <CreateHomeCard />
          <OpenHomeCard />
        </div>
      </main>
    </>
  )
}

function CreateHomeCard() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() === '') {
      setError('Enter a name for your home, like “Maple Street Flat”.')
      return
    }
    setBusy(true)
    const result = await api.createHome(name.trim())
    setBusy(false)
    if (!result.ok) {
      const { error } = result
      setError(
        error.kind === 'http' && error.status < 500
          ? `The home wasn’t created. ${error.message} You can try again.`
          : `We couldn’t confirm the home was created. ${error.message} If you try again and the first one went through, you’ll have two homes with this name.`,
      )
      return
    }
    await navigate({ to: '/homes/$homeId', params: { homeId: result.data.id } })
  }

  return (
    <Card aria-labelledby="create-h" className="gap-5 p-7">
      <div className="flex flex-col gap-1">
        <h2 id="create-h" className="font-bold text-[22px]">
          Create a new home
        </h2>
        <p className="text-[15px] text-muted-foreground">
          Start here if nobody in your home has set one up yet.
        </p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="home-name">Home name</Label>
          <Input
            id="home-name"
            autoComplete="off"
            placeholder="e.g. Maple Street Flat"
            maxLength={100}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'home-name-err' : undefined}
          />
          {error && (
            <Alert id="home-name-err" variant="destructive" className="border-0 bg-transparent p-0">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <Button type="submit" className="self-start" disabled={busy} aria-busy={busy || undefined}>
          {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
          {busy ? 'Creating home…' : 'Create home'}
        </Button>
      </form>
    </Card>
  )
}

function OpenHomeCard() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const homeId = homeIdFrom(value)
    if (homeId === null) {
      setError(
        'That link isn’t valid. Paste the whole link again, or just the ID at the end of it.',
      )
      return
    }
    if (homeId === '') {
      setError('Paste a home link or ID.')
      return
    }
    await navigate({ to: '/homes/$homeId', params: { homeId } })
  }

  return (
    <Card aria-labelledby="open-h" className="gap-5 p-7">
      <div className="flex flex-col gap-1">
        <h2 id="open-h" className="font-bold text-[22px]">
          Open an existing home
        </h2>
        <p className="text-[15px] text-muted-foreground">
          Ask a housemate to send you the home link.
        </p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="home-id">Home ID or link</Label>
          <Input
            id="home-id"
            className="money"
            autoComplete="off"
            placeholder="Paste the link or ID"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'home-id-help home-id-err' : 'home-id-help'}
          />
          <p id="home-id-help" className="text-[13px] text-muted-foreground">
            Paste the whole link or just the ID at the end of it.
          </p>
          {error && (
            <p id="home-id-err" role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" variant="secondary" className="self-start">
          Open home
        </Button>
      </form>
    </Card>
  )
}
