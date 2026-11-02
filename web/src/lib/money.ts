// Money is always whole cents (integers). These helpers never use floating point.

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100).toLocaleString('en-US')
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}$${dollars}.${rest}`
}

// The largest amount that is still an exact whole number in JavaScript, and the most
// the server accepts for a bill ($90,071,992,547,409.91). The server also keeps each
// home's bills under this total in sum (api/migrations/0003_limit_home_total.sql).
export const MAX_TOTAL_CENTS = Number.MAX_SAFE_INTEGER

// "42", "42.5", "42.50", "$1,200.00", "$ 10" -> cents. Returns null when it is not a valid amount.
// Commas are allowed only as thousands separators, so "1,50" is rejected, not read as 150.
// Zero and amounts over the limit are returned as numbers, so the form can say exactly
// what is wrong ("more than $0.00" or "at most …").
export function parseDollars(input: string): number | null {
  const text = input.trim().replace(/^\$\s*/, '')
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match?.[1]) return null
  const whole = match[1].replaceAll(',', '')
  const dollars = Number(whole)
  const cents = Number((match[2] ?? '').padEnd(2, '0'))
  return dollars * 100 + cents
}

// Same rule as the server: equal parts, extra cents to the people who joined first.
export function splitCents(totalCents: number, people: number): number[] {
  const base = Math.floor(totalCents / people)
  const extra = totalCents % people
  return Array.from({ length: people }, (_, i) => base + (i < extra ? 1 : 0))
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const paidAtFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatPaidAt(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : paidAtFormat.format(date)
}
