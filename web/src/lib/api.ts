// The only place that talks to the server. Components get back an ApiResult and never
// call fetch themselves, so every failure is handled the same way.

export type Home = { id: string; name: string }
export type Member = { id: string; homeId: string; name: string }
export type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}
export type Balance = { memberId: string; name: string; outstandingCents: number }

export type ApiFailure =
  | { kind: 'http'; status: number; message: string }
  | { kind: 'timeout'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'bad-response'; message: string }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure }

const TIMEOUT_MS = 8000

// ---------- shape checks for successful responses ----------

type Guard<T> = (value: unknown) => value is T

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isString = (v: unknown): v is string => typeof v === 'string'
const isCents = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)

const isHome: Guard<Home> = (v): v is Home => isRecord(v) && isString(v.id) && isString(v.name)

const isMember: Guard<Member> = (v): v is Member =>
  isRecord(v) && isString(v.id) && isString(v.homeId) && isString(v.name)

const isShare: Guard<Share> = (v): v is Share =>
  isRecord(v) &&
  isString(v.id) &&
  isString(v.memberId) &&
  isCents(v.amountCents) &&
  (v.paidAt === null || isString(v.paidAt))

const isBill: Guard<Bill> = (v): v is Bill =>
  isRecord(v) &&
  isString(v.id) &&
  isString(v.homeId) &&
  isString(v.title) &&
  isCents(v.totalCents) &&
  Array.isArray(v.shares) &&
  v.shares.every(isShare)

const isBalance: Guard<Balance> = (v): v is Balance =>
  isRecord(v) && isString(v.memberId) && isString(v.name) && isCents(v.outstandingCents)

const isBillList: Guard<{ bills: Bill[] }> = (v): v is { bills: Bill[] } =>
  isRecord(v) && Array.isArray(v.bills) && v.bills.every(isBill)

const isBalanceList: Guard<{ balances: Balance[] }> = (v): v is { balances: Balance[] } =>
  isRecord(v) && Array.isArray(v.balances) && v.balances.every(isBalance)

// ---------- request ----------

function parseJson(text: string): unknown {
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function httpFailure(status: number, body: unknown): ApiFailure {
  const serverMessage =
    isRecord(body) && isString(body.error) && body.error.trim() !== '' ? body.error : null
  if (status >= 500) {
    return { kind: 'http', status, message: `The server had a problem (error ${status}).` }
  }
  return {
    kind: 'http',
    status,
    message: serverMessage ?? `The server turned the request down (error ${status}).`,
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  guard: Guard<T>,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(path, {
      method,
      signal: controller.signal,
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    // Read text first: an error page can be HTML or empty, not JSON.
    const body = parseJson(await response.text())
    if (!response.ok) return { ok: false, error: httpFailure(response.status, body) }
    if (!guard(body)) {
      return {
        ok: false,
        error: { kind: 'bad-response', message: 'The server sent a reply we couldn’t read.' },
      }
    }
    return { ok: true, data: body }
  } catch {
    if (controller.signal.aborted) {
      return {
        ok: false,
        error: {
          kind: 'timeout',
          message: `The server didn’t answer within ${TIMEOUT_MS / 1000} seconds.`,
        },
      }
    }
    return {
      ok: false,
      error: {
        kind: 'network',
        message: 'You seem to be offline. Check your internet connection.',
      },
    }
  } finally {
    clearTimeout(timer)
  }
}

const home = (homeId: string) => `/api/homes/${encodeURIComponent(homeId)}`

export const api = {
  createHome: (name: string) => request('POST', '/api/homes', isHome, { body: { name } }),
  home: (homeId: string) => request('GET', home(homeId), isHome),
  bills: (homeId: string) => request('GET', `${home(homeId)}/bills`, isBillList),
  balances: (homeId: string) => request('GET', `${home(homeId)}/balances`, isBalanceList),
  addMember: (homeId: string, name: string) =>
    request('POST', `${home(homeId)}/members`, isMember, { body: { name } }),
  addBill: (homeId: string, title: string, totalCents: number) =>
    request('POST', `${home(homeId)}/bills`, isBill, { body: { title, totalCents } }),
  // No body on purpose: the server reads only the URL and the Idempotency-Key header.
  payShare: (billId: string, shareId: string, idempotencyKey: string) =>
    request(
      'POST',
      `/api/bills/${encodeURIComponent(billId)}/shares/${encodeURIComponent(shareId)}/pay`,
      isShare,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    ),
}
