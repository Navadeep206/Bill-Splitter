import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { splitShares } from './split'
import { readJson, requireText, requireTotalCents } from './validation'

type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
type Bill = { id: string; homeId: string; title: string; totalCents: number; shares: Share[] }

const app = new Hono<{ Bindings: Env }>()

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status)
  }
  console.error(error)
  return c.json({ error: 'Internal server error' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

async function requireHome(db: D1Database, id: string) {
  const home = await db
    .prepare('SELECT id, name FROM homes WHERE id = ?')
    .bind(id)
    .first<{ id: string; name: string }>()
  if (!home) throw new HTTPException(404, { message: 'Home not found' })
  return home
}

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.post('/api/homes', async (c) => {
  const body = await readJson(c.req.raw)
  const home = { id: crypto.randomUUID(), name: requireText(body.name, 'name', 100) }
  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)')
    .bind(home.id, home.name)
    .run()
  return c.json(home, 201)
})

app.get('/api/homes/:homeId', async (c) => {
  return c.json(await requireHome(c.env.DB, c.req.param('homeId')))
})

app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  await requireHome(c.env.DB, homeId)
  const body = await readJson(c.req.raw)
  const member = { id: crypto.randomUUID(), homeId, name: requireText(body.name, 'name', 100) }
  await c.env.DB.prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)')
    .bind(member.id, member.homeId, member.name)
    .run()
  return c.json(member, 201)
})

app.post('/api/homes/:homeId/bills', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  await requireHome(db, homeId)
  const body = await readJson(c.req.raw)
  const title = requireText(body.title, 'title', 100)
  const totalCents = requireTotalCents(body.totalCents)
  const members = await db
    .prepare('SELECT id FROM members WHERE home_id = ? ORDER BY seq')
    .bind(homeId)
    .all<{ id: string }>()
  if (members.results.length === 0) {
    throw new HTTPException(422, { message: 'Home has no members' })
  }

  // This member list is the bill's snapshot; later joins do not change it.
  const shares: Share[] = splitShares(
    totalCents,
    members.results.map((member) => member.id),
  ).map((share) => ({ id: crypto.randomUUID(), ...share, paidAt: null }))
  const bill: Bill = { id: crypto.randomUUID(), homeId, title, totalCents, shares }
  // The database refuses a bill that would push the home's total past
  // Number.MAX_SAFE_INTEGER (migration 0003), even when two bills race.
  try {
    await db.batch([
      db
        .prepare('INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)')
        .bind(bill.id, homeId, title, totalCents),
      ...shares.map((share) =>
        db
          .prepare('INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)')
          .bind(share.id, bill.id, share.memberId, share.amountCents),
      ),
    ])
  } catch (error) {
    if (error instanceof Error && error.message.includes('home total too large')) {
      throw new HTTPException(422, {
        message: 'This bill would make the home’s total too large to add up exactly',
      })
    }
    throw error
  }
  return c.json(bill, 201)
})

app.get('/api/homes/:homeId/bills', async (c) => {
  const db = c.env.DB
  const homeId = c.req.param('homeId')
  await requireHome(db, homeId)
  const bills = await db
    .prepare(
      'SELECT id, home_id AS homeId, title, total_cents AS totalCents FROM bills WHERE home_id = ? ORDER BY seq DESC',
    )
    .bind(homeId)
    .all<Omit<Bill, 'shares'>>()
  const shares = await db
    .prepare(`
    SELECT s.id, s.bill_id AS billId, s.member_id AS memberId,
      s.amount_cents AS amountCents, s.paid_at AS paidAt
    FROM shares s
    JOIN bills b ON b.id = s.bill_id
    JOIN members m ON m.id = s.member_id
    WHERE b.home_id = ? ORDER BY m.seq
  `)
    .bind(homeId)
    .all<Share & { billId: string }>()

  const byBill = new Map<string, Share[]>()
  for (const { billId, ...share } of shares.results) {
    const list = byBill.get(billId)
    if (list) list.push(share)
    else byBill.set(billId, [share])
  }
  return c.json({
    bills: bills.results.map((bill) => ({ ...bill, shares: byBill.get(bill.id) ?? [] })),
  })
})

app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const key = c.req.header('Idempotency-Key')
  if (!key || key.trim().length === 0) {
    throw new HTTPException(400, { message: 'Idempotency-Key is required' })
  }
  if (key.length > 200) {
    throw new HTTPException(400, { message: 'Idempotency-Key must be at most 200 characters' })
  }

  const db = c.env.DB
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const bill = await db.prepare('SELECT id FROM bills WHERE id = ?').bind(billId).first()
  if (!bill) throw new HTTPException(404, { message: 'Bill not found' })

  // Only the first request can change an unpaid share, even when requests race.
  const paid = await db
    .prepare(`
    UPDATE shares SET paid_at = ?, paid_key = ?
    WHERE id = ? AND bill_id = ? AND paid_at IS NULL
    RETURNING id, member_id AS memberId, amount_cents AS amountCents, paid_at AS paidAt
  `)
    .bind(new Date().toISOString(), key, shareId, billId)
    .first<Share>()
  if (paid) return c.json(paid)

  const share = await db
    .prepare(`
    SELECT id, member_id AS memberId, amount_cents AS amountCents,
      paid_at AS paidAt, paid_key AS paidKey
    FROM shares WHERE id = ? AND bill_id = ?
  `)
    .bind(shareId, billId)
    .first<Share & { paidKey: string | null }>()
  if (!share) throw new HTTPException(404, { message: 'Share not found' })
  if (share.paidKey !== key) {
    throw new HTTPException(409, { message: 'Share already paid with a different key' })
  }
  const { paidKey: _paidKey, ...result } = share
  return c.json(result)
})

app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')
  await requireHome(c.env.DB, homeId)
  const balances = await c.env.DB.prepare(`
    SELECT m.id AS memberId, m.name, COALESCE(SUM(s.amount_cents), 0) AS outstandingCents
    FROM members m
    LEFT JOIN shares s ON s.member_id = m.id AND s.paid_at IS NULL
    WHERE m.home_id = ?
    GROUP BY m.seq ORDER BY m.seq
  `)
    .bind(homeId)
    .all<{ memberId: string; name: string; outstandingCents: number }>()
  return c.json({ balances: balances.results })
})

export default app
