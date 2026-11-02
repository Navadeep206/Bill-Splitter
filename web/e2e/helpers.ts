import type { APIRequestContext, Page } from '@playwright/test'

export const API = 'http://localhost:8787'

type Member = { id: string; name: string }
type Bill = { id: string; shares: { id: string; memberId: string }[] }

// Sets up a home straight through the API, so each test starts from known data.
export async function seedHome(request: APIRequestContext, names: string[], billCents?: number) {
  const home: { id: string } = await (
    await request.post(`${API}/api/homes`, { data: { name: 'Test Flat' } })
  ).json()
  const members: Member[] = []
  for (const name of names) {
    const res = await request.post(`${API}/api/homes/${home.id}/members`, { data: { name } })
    members.push(await res.json())
  }
  let bill: Bill | undefined
  if (billCents !== undefined) {
    const res = await request.post(`${API}/api/homes/${home.id}/bills`, {
      data: { title: 'Gas', totalCents: billCents },
    })
    bill = await res.json()
  }
  return { homeId: home.id, members, bill }
}

export async function openHome(page: Page, homeId: string) {
  await page.goto(`/homes/${homeId}`)
  await page.getByRole('heading', { name: 'Test Flat' }).waitFor()
}

export async function totalOwed(page: Page) {
  return (await page.locator('dd').nth(1).textContent()) ?? ''
}

// "Mark as paid" button for one person's share of the Gas bill.
export function markPaidButton(page: Page, name: string) {
  return page
    .getByRole('article', { name: 'Gas' })
    .getByRole('button', { name: new RegExp(`^Mark ${name}’s .* as paid$`) })
}
