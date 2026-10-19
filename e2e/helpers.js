import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { outDir, readCredentials, readPosthogHost } from './env.js'

// Analytics events the app sent, per page, as the PostHog stub received them.
const sentEvents = new WeakMap()

// Collects console errors and uncaught page errors for the summary, and
// stubs PostHog so test runs never reach analytics. The stub keeps the events
// it receives (analyticsEvents / waitForEvent), so steps can check that one fired.
export async function instrument(page) {
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ path: safePath(page), text: msg.text().slice(0, 300) })
  })
  page.on('pageerror', (err) => consoleErrors.push({ path: safePath(page), text: `[uncaught] ${err.message}`.slice(0, 300) }))
  const events = []
  sentEvents.set(page, events)
  const posthog = readPosthogHost().replace(/\/$/, '')
  if (posthog) {
    await page.route(`${posthog}/**`, (route) => {
      events.push(...decodePosthog(route.request()))
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })
    // PostHog drops every event from a browser that looks automated (a
    // "HeadlessChrome" user agent or brand, navigator.webdriver), so nothing
    // would reach the stub. Only while the stub is in place, the page looks
    // like an ordinary Chrome to it; events still go no further than the stub.
    await page.addInitScript(() => {
      const ua = navigator.userAgent.replace(/HeadlessChrome/g, 'Chrome')
      const data = navigator.userAgentData
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true })
      Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ua, configurable: true })
      if (data) {
        const brands = (data.brands || []).filter((b) => !/headless/i.test(b.brand))
        const view = { brands, mobile: data.mobile, platform: data.platform, getHighEntropyValues: (hints) => data.getHighEntropyValues(hints), toJSON: () => ({ brands, mobile: data.mobile, platform: data.platform }) }
        Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => view, configurable: true })
      }
    })
  }
  return consoleErrors
}

// A PostHog request's events: gzip ("gzip-js"), base64 form data or plain
// JSON, as one event, an array or { batch }. → [{ event, properties }]
function decodePosthog(request) {
  try {
    const body = request.postDataBuffer()
    if (!body?.length) return []
    let text
    if (body[0] === 0x1f && body[1] === 0x8b) text = zlib.gunzipSync(body).toString('utf8')
    else {
      text = body.toString('utf8')
      if (text.startsWith('data=')) {
        const data = decodeURIComponent(text.slice(5).split('&')[0])
        text = data.trim().startsWith('{') || data.trim().startsWith('[') ? data : Buffer.from(data, 'base64').toString('utf8')
      }
    }
    const parsed = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.batch) ? parsed.batch : [parsed]
    return list.filter((e) => e?.event).map((e) => ({ event: e.event, properties: e.properties ?? {} }))
  } catch {
    return []
  }
}

/** Every analytics event this page has sent so far (through the stub). */
export function analyticsEvents(page) {
  return sentEvents.get(page) ?? []
}

/**
 * Waits for an analytics event named `name` whose properties pass `match`,
 * sent after `since` (an analyticsEvents(page).length taken before the
 * action). PostHog sends in batches every few seconds. → its properties.
 */
export async function waitForEvent(page, name, { since = 0, match = () => true, timeout = 15_000 } = {}) {
  if (!readPosthogHost()) throw new Error('VITE_POSTHOG_HOST is not set, so analytics can\'t be checked')
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const hit = analyticsEvents(page).slice(since).find((e) => e.event === name && match(e.properties))
    if (hit) return hit.properties
    await page.waitForTimeout(250)
  }
  const seen = [...new Set(analyticsEvents(page).slice(since).map((e) => e.event))]
  throw new Error(`no "${name}" event within ${timeout / 1000}s (sent: ${seen.join(', ') || 'nothing'})`)
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
export const VARIANT_DEFAULTS = { weekHeader: 'A', mealCard: 'B', todayCard: 'A', rolloverSheet: 'A', flags: { sampleData: false } }

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

// ── Mobile nav (it slides away while the page scrolls down)

/** Whether the mobile nav is in view (always true where it doesn't hide, e.g. desktop). */
export async function navShown(page) {
  const nav = page.locator('[data-testid="mobile-nav"]')
  if (!(await nav.count()) || !(await nav.isVisible())) return true
  return (await nav.getAttribute('data-hidden')) !== 'true'
}

/** Brings the mobile nav back the way a person would: by scrolling up (to the top if needed). */
export async function showNav(page) {
  if (await navShown(page)) return
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(300)
  if (!(await navShown(page))) {
    await page.evaluate(() => window.scrollTo({ top: 0 }))
    await page.waitForTimeout(300)
  }
  if (!(await navShown(page))) throw new Error('the mobile nav did not come back after scrolling up')
  await page.waitForTimeout(250) // the 200 ms slide
}

/** A nav link, with the nav in view first. */
export async function navLink(page, name) {
  await showNav(page)
  return page.getByRole('link', { name, exact: true }).first()
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
