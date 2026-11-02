import { env, exports } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import app from '../src/index'
import { type Balance, type Bill, call, createBill, createHome, type Share } from './helpers'

function pay(billId: string, shareId: string, key: string) {
  return call<Share>('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
    headers: { 'Idempotency-Key': key },
  })
}

async function setup() {
  const { homeId, members } = await createHome(['Asha', 'Ben'])
  const bill = await createBill(homeId, 1000)
  const share = bill.body.shares[0]
  if (!share) throw new Error('Expected a share')
  return { homeId, members, bill: bill.body, share }
}

describe('payment edge cases', () => {
  it('allows only one of two concurrent payments with different keys', async () => {
    const { homeId, bill, share } = await setup()
    const results = await Promise.all([
      pay(bill.id, share.id, 'first'),
      pay(bill.id, share.id, 'second'),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((balance) => balance.outstandingCents)).toEqual([0, 500])
  })

  it('returns the same result for concurrent requests with the same key', async () => {
    const { homeId, bill, share } = await setup()
    const [first, second] = await Promise.all([
      pay(bill.id, share.id, 'retry'),
      pay(bill.id, share.id, 'retry'),
    ])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(first.body.paidAt).toEqual(expect.any(String))
    expect(second.body).toEqual(first.body)
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((balance) => balance.outstandingCents)).toEqual([0, 500])
  })

  it('scopes a payment key to each share', async () => {
    const { homeId, bill } = await setup()
    const results = await Promise.all(
      bill.shares.map((share) => pay(bill.id, share.id, 'same-key')),
    )

    expect(results.map((result) => result.status)).toEqual([200, 200])
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances.map((balance) => balance.outstandingCents)).toEqual([0, 0])
  })

  it('rejects a share belonging to a different bill without paying it', async () => {
    const { homeId, bill, share } = await setup()
    const other = await createBill(homeId, 500)

    expect((await pay(other.body.id, share.id, 'wrong-bill')).status).toBe(404)
    expect((await pay(bill.id, share.id, 'correct-bill')).status).toBe(200)
  })

  it('rejects a blank payment key', async () => {
    const { bill, share } = await setup()
    const result = await pay(bill.id, share.id, '   ')

    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: expect.any(String) })
  })

  it('compares the exact key supplied by the runtime, including trailing whitespace', async () => {
    const { bill, share } = await setup()
    expect((await pay(bill.id, share.id, 'abc')).status).toBe(200)
    const request = new Request(`http://localhost/api/bills/${bill.id}/shares/${share.id}/pay`, {
      method: 'POST',
    })
    // Fetch Headers normally strips ASCII space. Supply the raw runtime value directly.
    const header = vi.spyOn(request.headers, 'get').mockReturnValue('abc ')
    try {
      const response = await app.fetch(request, { DB: env.DB })
      expect(response.status).toBe(409)
    } finally {
      header.mockRestore()
    }
  })

  it('preserves non-ASCII whitespace in stored keys and retries', async () => {
    const { bill, share } = await setup()
    const key = 'abc\u00a0'
    const first = await pay(bill.id, share.id, key)
    const stored = await env.DB.prepare('SELECT paid_key AS paidKey FROM shares WHERE id = ?')
      .bind(share.id)
      .first<{ paidKey: string }>()
    expect(first.status).toBe(200)
    expect(stored?.paidKey).toBe(key)
    expect((await pay(bill.id, share.id, key)).body).toEqual(first.body)
    expect((await pay(bill.id, share.id, 'abc')).status).toBe(409)
  })

  it('accepts a 200-character key and rejects a longer key without paying', async () => {
    const { bill, share } = await setup()
    const tooLong = await pay(bill.id, share.id, 'k'.repeat(201))
    expect(tooLong.status).toBe(400)
    expect(tooLong.body).toEqual({ error: expect.any(String) })
    const accepted = await pay(bill.id, share.id, 'k'.repeat(200))
    expect(accepted.status).toBe(200)
    expect((await pay(bill.id, share.id, 'k'.repeat(200))).body).toEqual(accepted.body)
  })
})

describe('validation and JSON errors', () => {
  it('rejects malformed JSON on each creation endpoint', async () => {
    const { homeId } = await createHome([])
    for (const path of [
      '/api/homes',
      `/api/homes/${homeId}/members`,
      `/api/homes/${homeId}/bills`,
    ]) {
      const response = await exports.default.fetch(
        new Request(`http://localhost${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: expect.any(String) })
    }
  })

  it.each([null, [], 'name', {}, { name: null }, { name: 1 }, { name: '' }, { name: '  \t\n' }])(
    'rejects invalid home and member names: %j',
    async (body) => {
      const { homeId } = await createHome([])
      for (const path of ['/api/homes', `/api/homes/${homeId}/members`]) {
        const result = await call('POST', path, { body })
        expect(result.status).toBe(422)
        expect(result.body).toEqual({ error: expect.any(String) })
      }
    },
  )

  it.each([undefined, null, 42, '', ' \t\n'])('rejects an invalid title: %j', async (title) => {
    const { homeId } = await createHome(['Asha'])
    const result = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title, totalCents: 100 },
    })
    expect(result.status).toBe(422)
    expect(result.body).toEqual({ error: expect.any(String) })
  })

  it.each([undefined, true, 1e20, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid or unsafe amount: %j',
    async (totalCents) => {
      const { homeId } = await createHome(['Asha'])
      const result = await call('POST', `/api/homes/${homeId}/bills`, {
        body: { title: 'Rent', totalCents },
      })
      expect(result.status).toBe(422)
    },
  )

  it('limits names and titles to 100 characters after trimming', async () => {
    const { homeId } = await createHome(['Asha'])
    for (const path of ['/api/homes', `/api/homes/${homeId}/members`]) {
      expect((await call('POST', path, { body: { name: 'n'.repeat(101) } })).status).toBe(422)
      expect((await call('POST', path, { body: { name: ` ${'n'.repeat(100)} ` } })).status).toBe(
        201,
      )
    }
    const path = `/api/homes/${homeId}/bills`
    const rejected = await call('POST', path, { body: { title: 't'.repeat(101), totalCents: 100 } })
    expect(rejected.status).toBe(422)
    expect(rejected.body).toEqual({ error: expect.any(String) })
    const accepted = await call<Bill>('POST', path, {
      body: { title: ` ${'t'.repeat(100)} `, totalCents: 100 },
    })
    expect(accepted.status).toBe(201)
    expect(accepted.body.title).toBe('t'.repeat(100))
  })

  it('trims home names, member names and titles', async () => {
    const home = await call<{ id: string; name: string }>('POST', '/api/homes', {
      body: { name: '  Flat 4B  ' },
    })
    const member = await call<{ name: string }>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: '  Asha  ' },
    })
    const bill = await call<Bill>('POST', `/api/homes/${home.body.id}/bills`, {
      body: { title: '  Rent  ', totalCents: 100 },
    })
    expect(home.body.name).toBe('Flat 4B')
    expect(member.body.name).toBe('Asha')
    expect(bill.body.title).toBe('Rent')
  })

  it('returns JSON for unknown routes', async () => {
    const response = await exports.default.fetch(new Request('http://localhost/api/unknown'))
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ error: expect.any(String) })
  })

  it('returns a generic JSON error for unexpected database failures', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = new Proxy(env.DB, {
      get() {
        throw new Error('Private database details')
      },
    })
    try {
      const response = await app.request(
        '/api/homes',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Test' }),
        },
        { DB: db },
      )
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Internal server error' })
      expect(logged).toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
  })
})

describe('bill snapshots and read endpoints', () => {
  it('rolls back the bill and earlier shares when a later share insert fails', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben'])
    const secondMember = members[1]
    if (!secondMember) throw new Error('Expected a second member')
    // The UUID comes from the API, not user input. Fail only this home's second share.
    await env.DB.prepare(`
      CREATE TRIGGER fail_test_share BEFORE INSERT ON shares
      WHEN NEW.member_id = '${secondMember.id}'
      BEGIN SELECT RAISE(ABORT, 'Test share failure'); END;
    `).run()
    try {
      const bill = await createBill(homeId, 1000)
      expect(bill.status).toBe(500)
      expect(bill.body).toEqual({ error: 'Internal server error' })
      expect((await call('GET', `/api/homes/${homeId}/bills`)).body).toEqual({ bills: [] })
      const shares = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM shares WHERE member_id IN (SELECT id FROM members WHERE home_id = ?)',
      )
        .bind(homeId)
        .first<{ count: number }>()
      expect(shares?.count).toBe(0)
    } finally {
      await env.DB.exec('DROP TRIGGER fail_test_share')
    }
  })

  it('allows zero-cent shares when the bill is smaller than the member count', async () => {
    const { homeId } = await createHome(['Asha', 'Ben', 'Chitra'])
    const bill = await createBill(homeId, 1)
    expect(bill.status).toBe(201)
    expect(bill.body.shares.map((share) => share.amountCents)).toEqual([1, 0, 0])
  })

  it('accepts the largest safe total and preserves the exact split', async () => {
    const { homeId } = await createHome(['Asha', 'Ben', 'Chitra'])
    const bill = await createBill(homeId, Number.MAX_SAFE_INTEGER)
    expect(bill.status).toBe(201)
    expect(bill.body.shares.map((share) => share.amountCents)).toEqual([
      3_002_399_751_580_331, 3_002_399_751_580_330, 3_002_399_751_580_330,
    ])
  })

  it('keeps balances exact by refusing a bill that would push the home total too high', async () => {
    const { homeId } = await createHome(['Asha'])
    const half = (Number.MAX_SAFE_INTEGER - 1) / 2
    expect((await createBill(homeId, half)).status).toBe(201)
    expect((await createBill(homeId, half)).status).toBe(201)

    const tooMuch = await createBill(homeId, 2)
    expect(tooMuch.status).toBe(422)
    expect(tooMuch.body).toEqual({ error: expect.any(String) })

    const result = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(result.body.balances[0]?.outstandingCents).toBe(Number.MAX_SAFE_INTEGER - 1)
    const bills = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
    expect(bills.body.bills).toHaveLength(2)
  })

  it('lets only one of two racing bills through when together they are too large', async () => {
    const { homeId } = await createHome(['Asha'])
    const over = (Number.MAX_SAFE_INTEGER + 1) / 2
    const results = await Promise.all([createBill(homeId, over), createBill(homeId, over)])
    expect(results.map((r) => r.status).sort()).toEqual([201, 422])
  })

  it('counts each home separately toward the limit', async () => {
    const first = await createHome(['Asha'])
    const second = await createHome(['Ben'])
    expect((await createBill(first.homeId, Number.MAX_SAFE_INTEGER)).status).toBe(201)
    expect((await createBill(second.homeId, Number.MAX_SAFE_INTEGER)).status).toBe(201)
  })

  it('does not change existing bills when a member joins later', async () => {
    const { homeId, bill } = await setup()
    const member = await call<{ id: string }>('POST', `/api/homes/${homeId}/members`, {
      body: { name: 'Chitra' },
    })

    const listed = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)
    expect(listed.body.bills).toEqual([bill])
    const balances = await call<{ balances: Balance[] }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances).toContainEqual({
      memberId: member.body.id,
      name: 'Chitra',
      outstandingCents: 0,
    })
  })

  it('returns home details and empty bills and balances for a new home', async () => {
    const { homeId } = await createHome([])
    const home = await call('GET', `/api/homes/${homeId}`)
    expect(home.status).toBe(200)
    expect(home.body).toEqual({ id: homeId, name: 'Test home' })
    expect((await call('GET', `/api/homes/${homeId}/bills`)).body).toEqual({ bills: [] })
    expect((await call('GET', `/api/homes/${homeId}/balances`)).body).toEqual({ balances: [] })
  })

  it('lists newest bills first, keeps share join order and includes payment state', async () => {
    const { homeId, members, bill, share } = await setup()
    const newest = await createBill(homeId, 301)
    const paid = await pay(bill.id, share.id, 'list-payment')
    const result = await call<{ bills: Bill[] }>('GET', `/api/homes/${homeId}/bills`)

    expect(result.status).toBe(200)
    expect(result.body.bills.map((item) => item.id)).toEqual([newest.body.id, bill.id])
    for (const item of result.body.bills) {
      expect(item.shares.map((item) => item.memberId)).toEqual(members.map((member) => member.id))
    }
    expect(result.body.bills[1]?.shares[0]).toEqual(paid.body)
  })

  it('keeps bills and balances isolated between homes', async () => {
    await setup()
    const { homeId, members } = await createHome(['Chitra'])
    const bill = await createBill(homeId, 100)
    expect((await call('GET', `/api/homes/${homeId}/bills`)).body).toEqual({ bills: [bill.body] })
    expect((await call('GET', `/api/homes/${homeId}/balances`)).body).toEqual({
      balances: [{ memberId: members[0]?.id, name: 'Chitra', outstandingCents: 100 }],
    })
  })

  it.each(['', '/bills', '/balances'])(
    'returns 404 for a missing home on GET %s',
    async (suffix) => {
      const result = await call('GET', `/api/homes/does-not-exist${suffix}`)
      expect(result.status).toBe(404)
      expect(result.body).toEqual({ error: expect.any(String) })
    },
  )
})
