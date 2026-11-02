import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--primary)" />
      <path d="M9 19L19 9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="9.5" cy="9.5" r="2.4" fill="#fff" />
      <circle cx="18.5" cy="18.5" r="2.4" fill="#fff" />
    </svg>
  )
}

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-2.5">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-2.5 font-bold text-[17px] text-foreground no-underline hover:text-foreground"
        >
          <Logo />
          <span>Bill splitter</span>
        </Link>
        {children}
      </div>
    </header>
  )
}
