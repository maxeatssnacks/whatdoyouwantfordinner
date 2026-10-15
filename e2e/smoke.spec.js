// Real-data smoke test: logs in as the test account and screenshots the main
// screens at the project's viewport, including every Week page variant and
// sheet. Read-only — it opens and cancels sheets but never edits plan data.
import { test, expect } from '@playwright/test'
import {
  closeSheet,
  expandPastDays,
  instrument,
  login,
  openCard,
  settle,
  setVariants,
  sheet,
  shotPath,
  stepRunner,
  VARIANT_DEFAULTS,
  writeResults,
} from './helpers.js'

test('smoke: main screens', async ({ page }, testInfo) => {
  const project = testInfo.project.name
  const isMobile = project === 'mobile'
  const results = []
  const step = stepRunner(results)
  const consoleErrors = await instrument(page)

  // Full-page captures paint fixed elements where the first viewport ended
  // (mid-page), so the floating nav is hidden in them. Viewport shots (recipe
  // bottom, panel, mic, sheets) show it in place.
  const full = async (name) => page.screenshot({
    path: shotPath(project, name),
    fullPage: true,
    style: '.v2-shell > div.fixed { display: none !important; }',
  })
  const view = async (name) => page.screenshot({ path: shotPath(project, name) })
  const visit = async (path) => {
    const res = await page.goto(path)
    if (res && !res.ok()) throw new Error(`HTTP ${res.status()} for ${path}`)
    await settle(page)
    const at = new URL(page.url()).pathname
    if (at === '/login' || at === '/') throw new Error(`redirected to ${at} (session lost)`)
  }
  const weekReady = async () => {
    await page.locator('[data-testid="week-page"]').waitFor()
    await page.locator('[aria-label="Loading your week"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})
  }

  const loggedIn = await step('login', () => login(page))

  if (loggedIn) {
    // ── Week page, default variants
    await step('week (/dashboard)', async () => {
      await visit('/dashboard')
      await setVariants(page, {})
      await weekReady()
      await full('01-week')
      const cards = await page.locator('[data-testid="meal-card"], [data-testid="today-card"]').count()
      const empty = await page.locator('[data-testid="empty-week"]').count()
      return { visibleMeals: cards, emptyWeek: empty > 0 }
    })

    await step('/plan redirects to /dashboard with ?day=', async () => {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      await visit(`/plan?day=${day}`)
      const url = new URL(page.url())
      if (url.pathname !== '/dashboard' || url.searchParams.get('day') !== day) throw new Error(`landed on ${url.pathname}${url.search}`)
      await weekReady()
      await full('02-plan-redirect')
      return { landed: `${url.pathname}${url.search}` }
    })

    // ── Variants
    for (const h of ['A', 'C']) {
      await step(`week header ${h}`, async () => {
        await setVariants(page, { weekHeader: h })
        await weekReady()
        await page.locator('[data-testid="week-header"]').screenshot({ path: shotPath(project, `10-header-${h}`) })
      })
    }
    for (const m of ['A', 'B', 'C', 'D']) {
      await step(`meal card ${m}`, async () => {
        await setVariants(page, { mealCard: m })
        await weekReady()
        await expandPastDays(page)
        await full(`11-meal-${m}`)
      })
    }
    for (const t of ['A', 'B', 'C', 'D']) {
      await step(`today card ${t}`, async () => {
        await setVariants(page, { todayCard: t })
        await weekReady()
        const today = page.locator('section[aria-label$=", today"]')
        if (!(await today.count())) {
          await full(`12-today-${t}`)
          return { note: 'today is not in view (no section for today)' }
        }
        const hasCard = await today.locator('[data-testid="today-card"]').count()
        await today.screenshot({ path: shotPath(project, `12-today-${t}`) })
        return hasCard ? undefined : { note: 'nothing planned today, so no today card' }
      })
    }
    for (const r of ['A', 'D']) {
      await step(`meal sheet ${r} with sample data`, async () => {
        await setVariants(page, { rolloverSheet: r, flags: { sampleData: true } })
        await weekReady()
        await expandPastDays(page)
        if (r === 'A') await full('13-sample-data-week')
        const withSample = page.locator('[data-leftover="false"]:has-text("Sample")')
        const target = (await withSample.count()) ? withSample.first() : page.locator('[data-leftover="false"]').first()
        if (!(await target.count())) throw new Error('no cooked meal on this week to open')
        await openCard(target)
        await sheet(page, 'meal-sheet').waitFor()
        await page.waitForTimeout(350)
        await view(`14-sheet-${r}-sample`)
        const hasSection = await sheet(page, 'meal-sheet').locator('[data-testid="rollover-section"]').count()
        await closeSheet(page, 'meal-sheet')
        return hasSection ? undefined : { note: 'no sample rollover on the visible meals' }
      })
    }

    // ── Sheets (defaults, sample data off)
    await step('meal sheet', async () => {
      await setVariants(page, {})
      await weekReady()
      await expandPastDays(page)
      const cooked = page.locator('[data-leftover="false"]')
      if (!(await cooked.count())) throw new Error('no cooked meal to open')
      await openCard(cooked.first())
      await sheet(page, 'meal-sheet').waitFor()
      if (await sheet(page, 'meal-sheet').locator('[data-testid="rollover-section"]').count()) {
        throw new Error('sample rollover section shown with sample data off')
      }
      await page.waitForTimeout(350)
      await view('15-meal-sheet')
      await closeSheet(page, 'meal-sheet')
    })

    await step('leftover sheet', async () => {
      const leftover = page.locator('[data-leftover="true"]')
      if (!(await leftover.count())) return { note: 'no leftover planned this week' }
      await openCard(leftover.first())
      await sheet(page, 'leftover-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('16-leftover-sheet')
      await closeSheet(page, 'leftover-sheet')
    })

    await step('add-a-meal sheet', async () => {
      const add = page.getByRole('button', { name: /^Add a meal/ })
      if (!(await add.count())) return { note: 'every slot is planned' }
      await add.first().click()
      await sheet(page, 'add-meal-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('17-add-meal-sheet')
      await closeSheet(page, 'add-meal-sheet')
    })

    await step('plan my week sheet (open, cancel)', async () => {
      await page.locator('[data-testid="plan-week-open"]').click()
      await sheet(page, 'plan-week-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('18-plan-week-sheet')
      await sheet(page, 'plan-week-sheet').getByRole('button', { name: 'Cancel' }).click()
      await sheet(page, 'plan-week-sheet').waitFor({ state: 'detached' })
    })

    await step('cooking for sheet', async () => {
      const cluster = page.locator('[data-testid="cooking-for"]')
      const label = await cluster.getAttribute('aria-label')
      await cluster.click()
      await sheet(page, 'cooking-for-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('19-cooking-for-sheet')
      await closeSheet(page, 'cooking-for-sheet')
      return { label }
    })

    await step('variant panel open', async () => {
      await page.locator('button[aria-label="Design variants"]').click()
      await sheet(page, 'variant-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('07-variant-panel')
      await closeSheet(page, 'variant-sheet')
    })

    await step('mic placeholder open', async () => {
      const speak = isMobile
        ? page.locator('button[aria-label="Speak a change"]')
        : page.locator('header button', { hasText: 'Speak' })
      await speak.click()
      await expect(page.getByText('Voice changes are coming soon.')).toBeVisible()
      await page.waitForTimeout(350)
      await view('08-mic-placeholder')
      await closeSheet(page, 'coming-soon-sheet')
    })

    await step('past week: no Plan my week', async () => {
      const lastWeek = await page.evaluate(() => {
        const d = new Date()
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay() - 7)
        return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`
      })
      await visit(`/dashboard?week=${lastWeek}`)
      await weekReady()
      await full('20-past-week')
      if (await page.getByRole('button', { name: /Plan my week/ }).count()) throw new Error('Plan my week offered on a past week')
      return { week: lastWeek, emptyWeek: (await page.locator('[data-testid="empty-week"]').count()) > 0 }
    })

    // ── Other pages
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
      if (await page.locator('button[aria-label="Design variants"]').count()) {
        throw new Error('variant panel trigger shown outside the Week page')
      }
      return { recipe: recipeHref }
    })

    await step('shopping (/shopping)', async () => { await visit('/shopping'); await full('05-shopping') })
    await step('profile (/profile)', async () => { await visit('/profile'); await full('06-profile') })

    // Leave this browser profile on the default variants.
    await page.evaluate((v) => localStorage.setItem('wdywfd.v2.variants', v), JSON.stringify(VARIANT_DEFAULTS)).catch(() => {})
  } else {
    await view('00-login-failed').catch(() => {})
  }

  writeResults(project, { project, viewport: page.viewportSize(), results, consoleErrors })
  expect(results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`)).toEqual([])
})
