// Opt-in (--plan-if-empty): if the test account's current week has no meals,
// plans it (Dinner) through the Week page's own "Plan my week" flow so the
// smoke screenshots show real meal cards. Does nothing when the week has meals.
import { test, expect } from '@playwright/test'
import { assertNoAnalyticsLeaks, instrument, login, planWeekDinner, settle, stepRunner, writeResults } from './helpers.js'

test('plan the current week if it is empty', async ({ page }) => {
  const results = []
  const step = stepRunner(results)
  const consoleErrors = await instrument(page)

  await step('login', () => login(page))
  let empty = false
  await step('check current week', async () => {
    await page.goto('/dashboard')
    await settle(page)
    empty = (await page.locator('[data-testid="empty-week"]').count()) > 0
    return { empty }
  })

  if (empty && results.every((r) => r.ok)) {
    await step('plan my week (dinner)', async () => {
      await planWeekDinner(page)
      await settle(page)
      const cards = await page.locator('[data-testid="meal-card"], [data-testid="today-card"]').count()
      if (cards === 0) throw new Error('planning finished but the week shows no meals')
      return { visibleMealsAfter: cards }
    })
  }

  await step('analytics: nothing went past the PostHog stub', () => assertNoAnalyticsLeaks(page))
  writeResults('plan-if-empty', { project: 'plan-if-empty', results, consoleErrors, planned: empty })
  expect(results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`)).toEqual([])
})
