import { Link } from '@tanstack/react-router'
import { CloudAlert, Loader2, SearchX } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const SLOW_AFTER_MS = 3000

export function LoadingState() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <AppHeader />
      <main aria-busy="true" className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 pt-8 pb-18">
        {slow ? (
          <p
            role="status"
            className="flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-3 text-[15px] motion-safe:animate-in motion-safe:fade-in"
          >
            <Loader2
              className="size-4 shrink-0 text-primary motion-safe:animate-spin"
              aria-hidden="true"
            />
            Still loading. The server is slower than usual, so we’ll keep waiting a few more
            seconds.
          </p>
        ) : (
          <p role="status" className="sr-only">
            Loading the home…
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-72" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-16 w-32 rounded-xl" />
          <Skeleton className="h-16 w-44 rounded-xl" />
        </div>
        <div className="flex flex-wrap gap-6">
          <Skeleton className="h-64 min-w-0 flex-[1_1_320px] rounded-2xl" />
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        </div>
      </main>
    </>
  )
}

function StateCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 pt-16 pb-18">
        <Card
          role="alert"
          aria-labelledby="state-title"
          className="gap-3 p-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
        >
          {icon}
          <h1 id="state-title" className="font-bold text-xl">
            {title}
          </h1>
          {children}
        </Card>
      </main>
    </>
  )
}

export function LoadErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateCard
      icon={<CloudAlert className="size-7 text-destructive" aria-hidden="true" />}
      title="We couldn’t load this home"
    >
      <p className="text-body-subtle">
        {message} Your bills and payments are safe. Try loading the page again.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
        <Button asChild variant="secondary">
          <Link to="/">Open a different home</Link>
        </Button>
      </div>
    </StateCard>
  )
}

export function NotFoundState({ homeId }: { homeId?: string }) {
  return (
    <StateCard
      icon={<SearchX className="size-7 text-muted-foreground" aria-hidden="true" />}
      title="We can’t find that home"
    >
      <p className="text-body-subtle">
        {homeId ? (
          <>
            No home has the ID <span className="money break-all text-foreground">{homeId}</span>.{' '}
          </>
        ) : (
          'There is nothing at this address. '
        )}
        Check the link for typos, or ask a housemate to send it again.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/">Open a different home</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/">Create a new home</Link>
        </Button>
      </div>
    </StateCard>
  )
}
