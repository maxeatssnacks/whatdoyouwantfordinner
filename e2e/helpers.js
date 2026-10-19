import fs from 'node:fs'
import path from 'node:path'
import { outDir, readCredentials, readPosthogHost } from './env.js'

// Collects console errors and uncaught page errors for the summary, and
// stubs PostHog so test runs never reach analytics.
export async function instrument(page) {
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ path: safePath(page), text: msg.text().slice(0, 300) })
  })
  page.on('pageerror', (err) => consoleErrors.push({ path: safePath(page), text: `[uncaught] ${err.message}`.slice(0, 300) }))
  const posthog = readPosthogHost().replace(/\/$/, '')
  if (posthog) {
    await page.route(`${posthog}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  }
  return consoleErrors
}

function safePath(page) {
  try { return new URL(page.url()).pathname } catch { return '' }
}

// Logs in through the real login page. The password is typed into the field
// and never logged.
export async function login(page) {
  const { email, password } = readCredentials()
  if (!email || !password) throw new Error('E2E_EMAIL / E2E_PASSWORD missing from .env.local')
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  try {
    await page.waitForURL('**/dashboard', { timeout: 20_000 })
  } catch {
    const visibleError = await page.locator('[role="alert"], .text-error').first().textContent().catch(() => null)
    throw new Error(`Login did not reach /dashboard${visibleError ? `: ${visibleError.trim()}` : ''}`)
  }
}

// Network quiet plus a beat for skeletons to swap out.
export async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(700)
}

export function shotPath(project, name) {
  const dir = outDir()
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${project}-${name}.png`)
}

export function writeResults(project, payload) {
  const dir = outDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${project}.results.json`), JSON.stringify(payload, null, 2))
}

// Runs one named step, recording pass/fail without aborting the walk.
export function stepRunner(results) {
  return async (name, fn) => {
    try {
      const detail = await fn()
      results.push({ name, ok: true, ...(detail ? { detail } : {}) })
      return true
    } catch (err) {
      results.push({ name, ok: false, error: String(err?.message || err).split('\n')[0] })
      return false
    }
  }
}

// ── Field font sizes ──────────────────────────────────────────────────

// iOS Safari zooms in when a text field under 16px gets focus, and the zoom
// carries over to the next page. Every visible input, textarea, select and
// rich-text editor inside `scope` must compute to at least 16px. Resolves to
// the number of fields checked; throws naming any that are smaller.
export async function assertFieldsAtLeast16(page, where, scope = 'body') {
  const fields = await page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return null
    const notText = new Set(['hidden', 'checkbox', 'radio', 'range', 'file', 'color', 'submit', 'button', 'reset', 'image'])
    return [...root.querySelectorAll('input, textarea, select, [contenteditable="true"]')]
      .filter((el) => !(el.tagName === 'INPUT' && notText.has(el.type)))
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => ({
        field: `${el.tagName.toLowerCase()}${el.type && el.tagName === 'INPUT' ? `[${el.type}]` : ''} "${el.getAttribute('aria-label') || el.placeholder || el.name || el.id || ''}"`.slice(0, 60),
        px: parseFloat(getComputedStyle(el).fontSize),
      }))
  }, scope)
  if (fields === null) throw new Error(`${where}: ${scope} not found`)
  const small = fields.filter((f) => f.px < 16)
  if (small.length) throw new Error(`${where}: under 16px: ${small.map((f) => `${f.field} ${f.px}px`).join(', ')}`)
  return fields.length
}

// ── Week page helpers ─────────────────────────────────────────────────

const VARIANT_KEY = 'wdywfd.v2.variants'
export const VARIANT_DEFAULTS = { weekHeader: 'A', mealCard: 'B', todayCard: 'D', rolloverSheet: 'A', flags: { sampleData: false, tapLog: false } }

/** Sets design variants (and the sample-data flag) for this browser, then reloads the Week page. */
export async function setVariants(page, overrides = {}) {
  const value = {
    ...VARIANT_DEFAULTS,
    ...overrides,
    flags: { ...VARIANT_DEFAULTS.flags, ...(overrides.flags || {}) },
  }
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [VARIANT_KEY, JSON.stringify(value)])
  await page.goto('/dashboard')
  await settle(page)
}

/** The open sheet (role=dialog) by its test id. */
export function sheet(page, testId) {
  return page.locator(`[role="dialog"][data-testid="${testId}"]`)
}

export async function closeSheet(page, testId) {
  await sheet(page, testId).getByRole('button', { name: 'Close' }).click()
  await sheet(page, testId).waitFor({ state: 'detached', timeout: 10_000 })
}

/** Opens a meal card's sheet (stretched title button). */
export async function openCard(card) {
  await card.locator('button[aria-label$="Open details"]').first().click()
}

/** Expands the collapsed past-days row if present, so every card is in the DOM. */
export async function expandPastDays(page) {
  const row = page.locator('[data-testid="past-days"]')
  if (await row.count() && (await row.getAttribute('aria-expanded')) === 'false') {
    await row.click()
    await page.waitForTimeout(200)
  }
}

/**
 * Plans the displayed week with Dinner only, through the Plan my week sheet.
 * Takes the in-sheet "Plan anyway" step if every recipe was used recently.
 * Throws with the sheet's own message on failure.
 */
export async function planWeekDinner(page) {
  await page.locator('[data-testid="plan-week-open"]').click()
  const s = sheet(page, 'plan-week-sheet')
  await s.waitFor()
  const chips = s.locator('[role="group"][aria-label="Meal types to plan"] button')
  const names = await chips.allTextContents()
  const dinner = names.findIndex((n) => n.trim().toLowerCase() === 'dinner')
  if (dinner === -1) throw new Error('no Dinner meal slot')
  if ((await chips.nth(dinner).getAttribute('aria-pressed')) !== 'true') await chips.nth(dinner).click()
  for (let i = 0; i < names.length; i++) {
    if (i !== dinner && (await chips.nth(i).getAttribute('aria-pressed')) === 'true') await chips.nth(i).click()
  }
  // No note on Sundays or future weeks; textContent() would wait for one.
  const note = s.locator('[data-testid="plan-scope-note"]')
  const scopeNote = (await note.count()) ? await note.textContent() : null
  await s.locator('[data-testid="plan-week-confirm"]').click()

  // Resolves to { bypassed, repeatNotice, scopeNote }: whether "Plan anyway"
  // was needed, and the sheet's text when it had to repeat recipes.
  let bypassed = false
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (!(await s.count())) return { bypassed, repeatNotice: null, scopeNote }
    const repeats = s.locator('[data-testid="plan-week-repeats"]')
    if (await repeats.count()) {
      const repeatNotice = (await repeats.textContent()).trim()
      await s.locator('[data-testid="plan-week-done"]').click()
      await s.waitFor({ state: 'detached' })
      return { bypassed, repeatNotice, scopeNote }
    }
    const anyway = s.getByRole('button', { name: 'Plan anyway' })
    if (await anyway.count()) {
      await anyway.click()
      bypassed = true
    }
    const alert = s.locator('[role="alert"]')
    if (await alert.count()) throw new Error(`Plan my week: ${(await alert.first().textContent()).trim()}`)
    await page.waitForTimeout(300)
  }
  throw new Error('Plan my week did not finish within 90s')
}
