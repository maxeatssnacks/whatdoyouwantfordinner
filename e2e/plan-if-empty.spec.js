// Opt-in (--plan-if-empty): if the test account's current week has no meals,
// plans it through the app's own "Suggest my week" flow on mobile /plan so the
// smoke screenshots show real meal cards. Does nothing when the week has meals.
import { test, expect } from '@playwright/test'
import { instrument, login, settle, stepRunner, writeResults } from './helpers.js'

test('plan the current week if it is empty', async ({ page }) => {
  const results = []
  const step = stepRunner(results)
  const consoleErrors = await instrument(page)
  const dialogs = []
  // Bypass-recency confirm is accepted; any alert is recorded as a failure reason.
  page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.accept() })

  const filledSlots = () => page.locator('section[data-day] button:not(:has-text("Add "))').count()

  await step('login', () => login(page))
  let before = 0
  await step('check current week', async () => {
    await page.goto('/plan')
    await settle(page)
    before = await filledSlots()
    return { filledSlotsBefore: before }
  })

  if (before === 0 && results.every((r) => r.ok)) {
    await step('suggest my week (dinner)', async () => {
      await page.locator('button[aria-label="Suggest my week"]').click()
      const confirm = page.getByRole('button', { name: /^Suggest \d+ meals$/ })
      await confirm.click()
      // The sheet closes only once suggest has finished writing.
      await expect(page.getByRole('dialog')).toBeHidden({ timeout: 60_000 })
      await settle(page)
      const after = await filledSlots()
      const alerts = dialogs.filter((d) => d.startsWith('alert'))
      if (alerts.length) throw new Error(alerts.join(' | '))
      if (after === 0) throw new Error('suggest finished but the week is still empty')
      return { filledSlotsAfter: after, dialogs }
    })
  }

  writeResults('plan-if-empty', { project: 'plan-if-empty', results, consoleErrors, planned: before === 0 })
  expect(results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`)).toEqual([])
})
