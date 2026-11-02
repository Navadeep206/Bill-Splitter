import { expect, test } from '@playwright/test'
import { API, markPaidButton, openHome, seedHome, totalOwed } from './helpers'

test('create a home, add people and split a bill', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Home name').fill('Test Flat')
  await page.getByRole('button', { name: 'Create home' }).click()
  await expect(page.getByText('Nobody lives here yet')).toBeVisible()

  for (const name of ['Asha', 'Ben', 'Chloe']) {
    await page.getByLabel('Add a person').fill(name)
    await page.getByRole('button', { name: 'Add person' }).click()
    await expect(page.getByRole('status').getByText(`${name} was added`)).toBeVisible()
  }

  await page.getByLabel('What is it for?').fill('Gas')
  await page.getByLabel('Total amount (USD)').fill('10')
  await expect(page.getByText('the extra 1¢ goes to Asha, who joined first')).toBeVisible()
  await page.getByRole('button', { name: 'Add bill' }).click()

  const bill = page.getByRole('article', { name: 'Gas' })
  await expect(bill.getByText('0 of 3 shares paid')).toBeVisible()
  await expect(bill.getByRole('listitem')).toHaveText([
    /Asha\s*\$3\.34/,
    /Ben\s*\$3\.33/,
    /Chloe\s*\$3\.33/,
  ])
  expect(await totalOwed(page)).toBe('$10.00')
})

test('a failed payment is retried with the same Idempotency-Key', async ({ page, request }) => {
  const { homeId } = await seedHome(request, ['Asha', 'Ben'], 1000)
  await openHome(page, homeId)

  const keys: string[] = []
  await page.route('**/shares/*/pay', async (route) => {
    keys.push(route.request().headers()['idempotency-key'] ?? '')
    if (keys.length === 1) {
      return route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Bad gateway</h1>' })
    }
    return route.continue()
  })

  await markPaidButton(page, 'Ben').click()
  await expect(page.getByText('We checked: it wasn’t marked as paid')).toBeVisible()
  await page.getByRole('button', { name: /^Try marking Ben’s/ }).click()
  await expect(
    page.getByText(/Ben’s .* is marked as paid\. The server confirmed it\./),
  ).toBeVisible()

  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
})

test('a lost reply is checked before offering a retry', async ({ page, request }) => {
  const { homeId } = await seedHome(request, ['Asha', 'Ben'], 1000)
  await openHome(page, homeId)

  // The server saves the payment, but the browser never gets the reply.
  await page.route('**/shares/*/pay', async (route) => {
    await route.fetch()
    await route.abort('connectionreset')
  })
  await markPaidButton(page, 'Asha').click()
  await expect(page.getByText('We checked with the server: it was marked as paid.')).toBeVisible()
  expect(await totalOwed(page)).toBe('$5.00')
})

test('slow loading and server errors keep the page usable', async ({ page, request }) => {
  const { homeId } = await seedHome(request, ['Asha'], 500)

  await page.route('**/api/homes/*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    await route.continue().catch(() => {})
  })
  await page.goto(`/homes/${homeId}`)
  await expect(page.getByText(/Still loading/)).toBeVisible()
  await page.unrouteAll({ behavior: 'ignoreErrors' })

  await page.route('**/api/homes/*/bills', (route) => route.fulfill({ status: 500, body: '' }))
  await page.goto(`/homes/${homeId}`)
  await expect(page.getByText('We couldn’t load this home')).toBeVisible()
  await expect(page.getByText('The server had a problem (error 500).')).toBeVisible()
  await page.unrouteAll()

  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Test Flat' })).toBeVisible()
})

test('a payment is still there after reloading the page', async ({ page, request }) => {
  const { homeId } = await seedHome(request, ['Asha', 'Ben'], 1000)
  await openHome(page, homeId)

  await markPaidButton(page, 'Asha').click()
  await expect(page.getByText(/Asha’s .* is marked as paid/)).toBeVisible()
  await page.reload()

  const asha = page.getByRole('article', { name: 'Gas' }).getByRole('listitem').first()
  await expect(asha).toContainText('Paid')
  expect(await totalOwed(page)).toBe('$5.00')
})

test('two tabs paying the same share at once pay it only once', async ({ browser, request }) => {
  const { homeId, members } = await seedHome(request, ['Asha', 'Ben'], 1000)
  const tabA = await (await browser.newContext()).newPage()
  const tabB = await (await browser.newContext()).newPage()
  await openHome(tabA, homeId)
  await openHome(tabB, homeId)

  await Promise.all([markPaidButton(tabA, 'Ben').click(), markPaidButton(tabB, 'Ben').click()])

  // One tab gets the confirmation; the other is told it was already paid.
  const confirmed = /Ben’s .* is marked as paid\. The server confirmed it\./
  const alreadyPaid = 'This share was already marked as paid from another tab or device'
  await expect(tabA.getByText(confirmed).or(tabA.getByText(alreadyPaid))).toBeVisible()
  await expect(tabB.getByText(confirmed).or(tabB.getByText(alreadyPaid))).toBeVisible()
  const confirmations =
    (await tabA.getByText(confirmed).count()) + (await tabB.getByText(confirmed).count())
  expect(confirmations).toBe(1)

  // The server counted Ben's share once.
  const balances = await (await request.get(`${API}/api/homes/${homeId}/balances`)).json()
  const ben = balances.balances.find((b: { memberId: string }) => b.memberId === members[1]?.id)
  expect(ben.outstandingCents).toBe(0)
})

test('"Refresh latest" shows a payment made by someone else', async ({ page, request }) => {
  const { homeId, bill } = await seedHome(request, ['Asha', 'Ben'], 1000)
  await openHome(page, homeId)
  expect(await totalOwed(page)).toBe('$10.00')

  // Ben pays from his own phone.
  const ben = bill?.shares[1]
  await request.post(`${API}/api/bills/${bill?.id}/shares/${ben?.id}/pay`, {
    headers: { 'Idempotency-Key': 'bens-phone' },
  })
  await page.getByRole('button', { name: 'Refresh latest' }).click()

  await expect(markPaidButton(page, 'Ben')).toHaveCount(0)
  expect(await totalOwed(page)).toBe('$5.00')
})

test('a failed refresh keeps the old data and says so', async ({ page, request }) => {
  const { homeId } = await seedHome(request, ['Asha', 'Ben'], 1000)
  await openHome(page, homeId)

  await page.route('**/api/homes/**', (route) => route.fulfill({ status: 500, body: '' }))
  await page.getByRole('button', { name: 'Refresh latest' }).click()
  await expect(page.getByText('Couldn’t refresh. Showing the data loaded earlier.')).toBeVisible()
  await expect(page.getByRole('article', { name: 'Gas' })).toBeVisible()

  await page.unrouteAll()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Couldn’t refresh. Showing the data loaded earlier.')).toHaveCount(0)
})
