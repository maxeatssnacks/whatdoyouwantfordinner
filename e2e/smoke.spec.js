// Real-data smoke test: logs in as the test account and screenshots the main
// screens at the project's viewport. Read-only — it never edits plan data.
import { test, expect } from '@playwright/test'
import { instrument, login, settle, shotPath, stepRunner, writeResults } from './helpers.js'

test('smoke: main screens', async ({ page }, testInfo) => {
  const project = testInfo.project.name
  const isMobile = project === 'mobile'
  const results = []
  const step = stepRunner(results)
  const consoleErrors = await instrument(page)

  // Full-page captures paint fixed elements where the first viewport ended
  // (mid-page), so the floating nav and variant tab are hidden in them. The
  // viewport shots below (recipe bottom, panel, mic) show the nav in place.
  const full = async (name) => page.screenshot({
    path: shotPath(project, name),
    fullPage: true,
    style: '.v2-shell > div.fixed, button[aria-label="Design variants"] { display: none !important; }',
  })
  const view = async (name) => page.screenshot({ path: shotPath(project, name) })
  const visit = async (path) => {
    const res = await page.goto(path)
    if (res && !res.ok()) throw new Error(`HTTP ${res.status()} for ${path}`)
    await settle(page)
    const at = new URL(page.url()).pathname
    if (at === '/login' || at === '/') throw new Error(`redirected to ${at} (session lost)`)
  }

  const loggedIn = await step('login', () => login(page))

  if (loggedIn) {
    await step('week (/dashboard)', async () => { await visit('/dashboard'); await full('01-week') })
    await step('plan (/plan)', async () => { await visit('/plan'); await full('02-plan') })

    let recipeHref = null
    await step('recipes (/recipes)', async () => {
      await visit('/recipes')
      await full('03-recipes')
      recipeHref = await page.locator('a[href^="/recipes/"]').first().getAttribute('href', { timeout: 10_000 })
      return { firstRecipe: recipeHref }
    })

    await step('recipe detail (scrolled to bottom)', async () => {
      if (!recipeHref) throw new Error('no recipe link found on /recipes')
      await visit(recipeHref)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(500)
      await view('04-recipe-detail-bottom')
      return { recipe: recipeHref }
    })

    await step('shopping (/shopping)', async () => { await visit('/shopping'); await full('05-shopping') })
    await step('profile (/profile)', async () => { await visit('/profile'); await full('06-profile') })

    await step('variant panel open', async () => {
      await visit('/dashboard')
      await page.locator('button[aria-label="Design variants"]').click()
      await expect(page.getByRole('dialog')).toContainText('Design variants')
      await page.waitForTimeout(400)
      await view('07-variant-panel')
      await page.keyboard.press('Escape')
    })

    await step('mic placeholder open', async () => {
      await visit('/dashboard')
      const speak = isMobile
        ? page.locator('button[aria-label="Speak a change"]')
        : page.locator('header button', { hasText: 'Speak' })
      await speak.click()
      await expect(page.getByText('Voice changes are coming soon.')).toBeVisible()
      await page.waitForTimeout(400)
      await view('08-mic-placeholder')
      await page.keyboard.press('Escape')
    })
  } else {
    await view('00-login-failed').catch(() => {})
  }

  writeResults(project, { project, viewport: page.viewportSize(), results, consoleErrors })
  expect(results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`)).toEqual([])
})
