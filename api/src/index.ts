import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { readJson, requireText } from './validation'

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

export default app
