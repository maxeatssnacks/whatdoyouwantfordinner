import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { outDir, readCredentials, readPosthogHosts, readSupabaseEnv } from './env.js'
import { inferOnHand, onHandWindow, prepareOnHand, weekRollovers } from '../src/v2/lib/onHand.js'

// Analytics events the app sent, per page, as the PostHog stub received them,
// and analytics requests that went anywhere else (blocked; a run fails on them).
const sentEvents = new WeakMap()
const leaks = new WeakMap()

// A PostHog request on a host the stub doesn't cover: a host named for it,
// or one of its paths (capture, batch, session replay, flags) carrying the
// version or compression parameter posthog-js adds to everything it sends.
const ANALYTICS_PATH = /^\/(e|i\/v0\/e|batch|capture|engage|track|s|decide|flags)(\/|$)/i
const looksLikePosthog = (url) => /posthog/i.test(url.hostname)
  || (ANALYTICS_PATH.test(url.pathname) && (url.searchParams.has('ver') || url.searchParams.has('compression')))

// Collects console errors and uncaught page errors for the summary, and
// stubs PostHog so test runs never reach analytics: every *.posthog.com host
// and every VITE_POSTHOG_HOST in the dev env files go to the stub, which keeps
// the events it receives (analyticsEvents / waitForEvent). Any other request
// on a PostHog path is blocked and recorded (assertNoAnalyticsLeaks).
export async function instrument(page) {
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ path: safePath(page), text: msg.text().slice(0, 300) })
  })
  page.on('pageerror', (err) => consoleErrors.push({ path: safePath(page), text: `[uncaught] ${err.message}`.slice(0, 300) }))
  const events = []
  const leaked = []
  sentEvents.set(page, events)
  leaks.set(page, leaked)

  const stubHosts = new Set(readPosthogHosts().map((origin) => new URL(origin).host))
  const ownHosts = new Set(['localhost:3000', '127.0.0.1:3000'])
  try { ownHosts.add(new URL(readSupabaseEnv().url).host) } catch { /* no Supabase URL */ }
  const isPosthog = (url) => /(^|\.)posthog\.com$/i.test(url.hostname) || stubHosts.has(url.host)
  const isLeak = (url) => !isPosthog(url) && !ownHosts.has(url.host) && looksLikePosthog(url)

  await page.route(isPosthog, (route) => {
    events.push(...decodePosthog(route.request()))
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route(isLeak, (route) => {
    leaked.push(route.request().url().split('?')[0])
    return route.abort()
  })
  // A backstop for anything a route didn't see.
  page.on('request', (request) => {
    try {
      const url = new URL(request.url())
      const where = request.url().split('?')[0]
      if (isLeak(url) && !leaked.includes(where)) leaked.push(where)
    } catch { /* not a URL */ }
  })

  // PostHog drops every event from a browser that looks automated (a
  // "HeadlessChrome" user agent or brand, navigator.webdriver), so nothing
  // would reach the stub: test pages look like an ordinary Chrome to it.
  // Beacons go out as fetches, so the routes above see them too.
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
    Navigator.prototype.sendBeacon = function sendBeacon(url, body) {
      fetch(url, { method: 'POST', body, keepalive: true, credentials: 'omit' }).catch(() => {})
      return true
    }
  })
  return consoleErrors
}

/** Analytics requests that went somewhere other than the stub (they were blocked). */
export function analyticsLeaks(page) {
  return leaks.get(page) ?? []
}

/** For a run's last step: throws if any analytics request went past the stub. */
export function assertNoAnalyticsLeaks(page) {
  const leaked = analyticsLeaks(page)
  if (leaked.length) throw new Error(`${leaked.length} analytics request(s) went past the PostHog stub (blocked): ${[...new Set(leaked)].slice(0, 3).join(', ')}`)
  return { stubbed: analyticsEvents(page).length }
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
// E2E_STEP_LOG=1 prints each step's name and time as it runs (for finding a
// step that hangs until the test's timeout).
export function stepRunner(results) {
  return async (name, fn) => {
    const t0 = Date.now()
    if (process.env.E2E_STEP_LOG) console.log(`[step] ${name} …`)
    try {
      const detail = await fn()
      if (process.env.E2E_STEP_LOG) console.log(`[step] ${name} ok ${Date.now() - t0} ms`)
      results.push({ name, ok: true, ...(detail ? { detail } : {}) })
      return true
    } catch (err) {
      if (process.env.E2E_STEP_LOG) console.log(`[step] ${name} FAILED ${Date.now() - t0} ms: ${String(err?.message || err).split('\n')[0]}`)
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
export const VARIANT_DEFAULTS = { weekHeader: 'A', mealCard: 'B', todayCard: 'A', flags: { sampleData: false } }

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

/**
 * Shows the app the signed-in account as an admin or not (step 7a: voice is
 * admin-only) by rewriting the profile read; the database isn't touched.
 * Takes effect from the next page load. → an async function that undoes it.
 */
export async function profileAs(page, { isAdmin }) {
  const PROFILE = (u) => u.pathname.endsWith('/rest/v1/profiles')
  await page.route(PROFILE, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const res = await route.fetch()
    const body = await res.json()
    const as = (p) => ({ ...p, is_admin: isAdmin })
    await route.fulfill({ response: res, json: Array.isArray(body) ? body.map(as) : as(body) })
  })
  return () => page.unroute(PROFILE)
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
 * There's no "Plan anyway" step since 6c (recent recipes fill gaps on their
 * own); if one shows up, that's a failure.
 * Throws with the sheet's own message on failure. `onDone` (optional) runs
 * while the done step shows (repeats or days left open), before Done.
 */
export async function planWeekDinner(page, { onDone = null } = {}) {
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

  // Resolves to { bypassed, repeatNotice, openDays, doneNote, scopeNote }:
  // whether "Plan anyway" was needed, the sheet's text when it had to repeat
  // recipes, and the days it said it left open (step 6a).
  let bypassed = false
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (!(await s.count())) return { bypassed, repeatNotice: null, openDays: [], doneNote: null, scopeNote }
    const note = s.locator('[data-testid="plan-week-done-note"]')
    if (await note.count()) {
      const doneNote = (await note.textContent()).trim()
      const repeats = Number(await note.getAttribute('data-repeats')) || 0
      const openDays = ((await note.getAttribute('data-open-days')) || '').split(',').filter(Boolean)
      if (onDone) await onDone({ doneNote, repeats, openDays })
      await s.locator('[data-testid="plan-week-done"]').click()
      await s.waitFor({ state: 'detached' })
      return { bypassed, repeatNotice: repeats ? doneNote : null, openDays, doneNote, scopeNote }
    }
    if (await s.getByRole('button', { name: 'Plan anyway' }).count()) throw new Error('Plan my week asked "Plan anyway" (dropped in 6c)')
    const alert = s.locator('[role="alert"]')
    if (await alert.count()) throw new Error(`Plan my week: ${(await alert.first().textContent()).trim()}`)
    await page.waitForTimeout(300)
  }
  throw new Error('Plan my week did not finish within 90s')
}

// ── REST as the test account, and what's on hand

// The test account's REST access through the browser's own session. RLS
// only allows the account's own rows; callers filter by it too.
export async function restSession(page) {
  const { url, anonKey } = readSupabaseEnv()
  if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env')
  const session = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k))
    const s = key ? JSON.parse(localStorage.getItem(key)) : null
    return s ? { token: s.access_token, userId: s.user?.id } : null
  })
  if (!session?.token || !session.userId) throw new Error('no signed-in session in the browser')
  const headers = { apikey: anonKey, Authorization: `Bearer ${session.token}`, Prefer: 'return=representation' }
  return { url, headers, userId: session.userId }
}

/** GET a REST path as the test account → JSON (throws on HTTP errors). */
export async function restGet(page, pathAndQuery) {
  const { url, headers } = await restSession(page)
  const res = await page.request.get(`${url}/rest/v1/${pathAndQuery}`, { headers })
  if (!res.ok()) throw new Error(`GET ${pathAndQuery.split('?')[0]}: HTTP ${res.status()}`)
  return res.json()
}

/** Today and this week as the app sees them, read in the browser. */
export async function browserWeek(page) {
  return page.evaluate(() => {
    const d = new Date()
    const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
    const shift = (n) => fmt(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + n))
    return { today: fmt(d), todayIdx: d.getDay(), thisWeek: fmt(sunday), lastWeek: shift(-7), nextWeek: shift(7) }
  })
}

const ON_HAND_RECIPE = 'id,title,servings,ingredients,recipe_type'
const ON_HAND_ENTRY = `id,day_of_week,meal_type,is_leftover,original_entry_id,servings,recipe:recipes(${ON_HAND_RECIPE})`

/** The rows useOnHand reads for a shown week, read the same way through REST (read-only). */
export async function readOnHandRows(page, weekStart) {
  const { userId } = await restSession(page)
  const { from, to } = onHandWindow(weekStart)
  const [lists, plans, adjustments, choices] = await Promise.all([
    restGet(page, `shopping_lists?select=id,meal_plan_id,items,created_at,meal_plan:meal_plans!inner(week_start_date)&user_id=eq.${userId}&meal_plan.week_start_date=gte.${from}&meal_plan.week_start_date=lte.${to}&order=created_at.asc`),
    restGet(page, `meal_plans?select=id,week_start_date,created_at,entries:meal_plan_entries(${ON_HAND_ENTRY})&user_id=eq.${userId}&week_start_date=gte.${from}&week_start_date=lte.${to}&order=created_at.asc`),
    restGet(page, `on_hand_adjustments?select=ingredient_key,as_of,answer,amount,unit,inferred_amount,package_amount,source&user_id=eq.${userId}&as_of=gte.${from}`),
    restGet(page, `package_size_choices?select=ingredient_key,size,unit&user_id=eq.${userId}`).catch(() => []),
  ])
  const sizeChoices = Object.fromEntries(choices.map((r) => [r.ingredient_key, { size: Number(r.size), unit: r.unit }]))
  return { lists, plans, adjustments, sizeChoices }
}

/**
 * What the Week page should show for a week, worked out by src/v2/lib/onHand.js
 * from rows read through REST (or given). → { rollovers: { [entryId]: rollover }, onHand }
 */
export async function expectedRollovers(page, { weekStart, thisWeek, today, rows = null }) {
  const onHand = inferOnHand(prepareOnHand(rows ?? (await readOnHandRows(page, weekStart)), [], { weekStart }), { today })
  return { rollovers: weekRollovers(onHand, { weekStart, thisWeek, today }), onHand }
}

/** Every meal card on the page with the reason it shows (null if none). */
export async function rolloverCards(page) {
  return page.locator('[data-testid="meal-card"], [data-testid="today-card"]').evaluateAll((els) => els.map((el) => {
    const reason = el.querySelector('[data-testid="rollover-reason"]')
    return {
      id: el.dataset.entryId,
      today: el.dataset.testid === 'today-card',
      reason: reason?.querySelector('[data-testid="rollover-reason-text"]')?.textContent.trim() ?? null,
      sample: reason ? reason.dataset.sample === 'true' : false,
    }
  }))
}

/**
 * Checks the Week page against the expected rollovers: every card shows
 * exactly its expected reason (none when none), and nothing is sample data.
 * Waits a little for the on-hand reads to land. With nothing expected, there
 * must be no rollover UI on the page at all. → a summary
 */
export async function checkRollovers(page, rollovers, { timeout = 10_000 } = {}) {
  const expectedIds = Object.keys(rollovers)
  const deadline = Date.now() + timeout
  let cards = []
  let wrong = []
  for (;;) {
    cards = await rolloverCards(page)
    // The Today card shows its own (narrower) line since 7a3.
    const want = (c) => (c.today ? rollovers[c.id]?.reasonToday ?? rollovers[c.id]?.reason : rollovers[c.id]?.reason) ?? null
    wrong = cards.filter((c) => c.sample || c.reason !== want(c))
    if (!wrong.length || Date.now() > deadline) break
    await page.waitForTimeout(250)
  }
  if (wrong.length) {
    throw new Error(`reasons differ from on-hand: ${wrong.slice(0, 3).map((c) => `${c.id.slice(0, 8)} shows ${JSON.stringify(c.reason)}${c.sample ? ' (sample)' : ''}, expected ${JSON.stringify((c.today ? rollovers[c.id]?.reasonToday : null) ?? rollovers[c.id]?.reason ?? null)}`).join('; ')}`)
  }
  if (!expectedIds.length) {
    const ui = await page.locator('[data-testid="rollover-reason"], [data-testid="rollover-section"]').count()
    if (ui) throw new Error(`nothing is on hand but ${ui} rollover element(s) show`)
  }
  const shown = cards.filter((c) => c.reason)
  return {
    cards: cards.length,
    withReason: shown.length,
    expected: expectedIds.length,
    notOnPage: expectedIds.filter((id) => !cards.some((c) => c.id === id)).length,
    reasons: shown.map((c) => c.reason),
  }
}

// ── Meal entry writes answered in memory (smoke stays read-only, 7b)

/**
 * Answers meal_plan_entries writes (insert, update, delete by id or by
 * original_entry_id) in memory and shows them in every read of the weeks and
 * entries, so the app's voice and eating-out changes, and their undo, run
 * end to end without touching the database. Reads go to the database and the
 * overlay is laid on top. → { state(), table(planIds), undo() }: state() says
 * what's written ({ inserted, patched, deleted } counts); table(planIds) is
 * the overlaid rows of those plans (id, plan, day, slot, recipe, kind,
 * leftover, servings); undo() removes the routes.
 */
export async function entriesInMemory(page) {
  const known = new Map() // id → entry as read (with its recipe)
  const recipes = new Map()
  const inserted = new Map()
  const patched = new Map()
  const deleted = new Set()
  // Reads select different columns (on-hand's leave out recipe_id), so what's
  // known about a row is merged, never replaced by a narrower read.
  const remember = (e) => {
    if (!e?.id) return
    const was = known.get(e.id)
    known.set(e.id, { ...(was ?? {}), ...e, ...(was?.recipe && e.recipe ? { recipe: { ...was.recipe, ...e.recipe } } : {}) })
    if (e.recipe?.id) recipes.set(e.recipe.id, { ...(recipes.get(e.recipe.id) ?? {}), ...e.recipe })
  }
  const view = (row) => {
    const patch = patched.get(row.id)
    const out = { ...row, ...(patch ?? {}) }
    if (patch && 'recipe_id' in patch) out.recipe = patch.recipe_id ? recipes.get(patch.recipe_id) ?? null : null
    return out
  }
  // A plan's entries with the overlay: its own rows (unless deleted or moved
  // away), rows moved into it, and rows inserted into it.
  const entriesOf = (planId, real) => {
    const own = new Set(real.map((e) => e.id))
    const rows = real.filter((e) => !deleted.has(e.id)).map(view).filter((e) => e.meal_plan_id === planId)
    for (const [id, e] of known) {
      if (!own.has(id) && !deleted.has(id) && patched.get(id)?.meal_plan_id === planId) rows.push(view(e))
    }
    for (const r of inserted.values()) {
      if (r.meal_plan_id === planId) rows.push({ ...r, recipe: r.recipe_id ? recipes.get(r.recipe_id) ?? null : null })
    }
    return rows
  }
  const idFrom = (q, key) => (q.get(key) ?? '').replace(/^eq\./, '') || null

  const PLANS = (u) => u.pathname.endsWith('/rest/v1/meal_plans')
  await page.route(PLANS, async (route) => {
    const req = route.request()
    if (req.method() !== 'GET' || !(new URL(req.url()).searchParams.get('select') ?? '').includes('meal_plan_entries')) return route.fallback()
    const res = await route.fetch()
    const body = await res.json().catch(() => null)
    const lay = (plan) => {
      if (!plan || !Array.isArray(plan.entries)) return plan
      for (const e of plan.entries) remember({ ...e, meal_plan_id: e.meal_plan_id ?? plan.id })
      return { ...plan, entries: entriesOf(plan.id, plan.entries.map((e) => ({ ...e, meal_plan_id: e.meal_plan_id ?? plan.id }))) }
    }
    await route.fulfill({ response: res, json: Array.isArray(body) ? body.map(lay) : lay(body) })
  })

  const ENTRIES = (u) => u.pathname.endsWith('/rest/v1/meal_plan_entries')
  await page.route(ENTRIES, async (route) => {
    const req = route.request()
    const q = new URL(req.url()).searchParams
    const method = req.method()
    if (method === 'GET') {
      const res = await route.fetch()
      const body = await res.json().catch(() => null)
      const plans = (q.get('meal_plan_id') ?? '').match(/^in\.\((.*)\)$/)?.[1]?.split(',') ?? null
      if (!Array.isArray(body) || !plans) return route.fulfill({ response: res, json: body })
      for (const e of body) if (!known.has(e.id)) remember(e)
      let rows = plans.flatMap((p) => entriesOf(p, body.filter((e) => e.meal_plan_id === p)))
      if (q.get('recipe_id') === 'not.is.null') rows = rows.filter((e) => e.recipe_id)
      return route.fulfill({ response: res, json: rows.map(({ recipe, ...r }) => (q.get('select')?.includes('recipe') ? { ...r, recipe } : r)) })
    }
    if (method === 'POST') {
      const body = JSON.parse(req.postData() ?? '[]')
      for (const r of [].concat(body)) {
        // A row put back (undo) is the row as it was, with any differences as a patch.
        if (deleted.has(r.id) && known.has(r.id)) {
          deleted.delete(r.id)
          patched.set(r.id, { ...r })
        } else {
          inserted.set(r.id, { ...r })
        }
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    if (method === 'PATCH') {
      const id = idFrom(q, 'id')
      const patch = JSON.parse(req.postData() ?? '{}')
      if (id && inserted.has(id)) inserted.set(id, { ...inserted.get(id), ...patch })
      else if (id) patched.set(id, { ...(patched.get(id) ?? {}), ...patch })
      return route.fulfill({ status: 204, body: '' })
    }
    if (method === 'DELETE') {
      const id = idFrom(q, 'id')
      const of = idFrom(q, 'original_entry_id')
      const gone = id ? [id] : [...known.values(), ...inserted.values()].filter((e) => (patched.get(e.id)?.original_entry_id ?? e.original_entry_id) === of).map((e) => e.id)
      for (const g of gone) {
        if (inserted.has(g)) inserted.delete(g)
        else deleted.add(g)
      }
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })

  return {
    // What's written and not put back: a patch that sets a row back to what it was counts as nothing.
    state: () => {
      const diff = (id, p) => Object.entries(p).filter(([k, v]) => (known.get(id)?.[k] ?? null) !== (v ?? null)).map(([k, v]) => `${k}: ${JSON.stringify(known.get(id)?.[k] ?? null)} → ${JSON.stringify(v ?? null)}`)
      const changed = [...patched].filter(([id, p]) => diff(id, p).length)
      return { inserted: inserted.size, patched: changed.length, deleted: deleted.size, ...(changed.length ? { diffs: changed.map(([id, p]) => diff(id, p).join(', ')) } : {}) }
    },
    table: (planIds) => planIds.flatMap((p) => entriesOf(p, [...known.values()].filter((e) => e.meal_plan_id === p)))
      .map((e) => ({ id: e.id, plan: e.meal_plan_id, day: e.day_of_week, slot: String(e.meal_type).toLowerCase(), recipe: e.recipe_id ?? null, kind: e.kind ?? null, leftover: !!e.is_leftover, servings: e.servings ?? null })),
    undo: async () => {
      await page.unroute(PLANS)
      await page.unroute(ENTRIES)
    },
  }
}

/**
 * A stand-in SpeechRecognition in every page from the next load (step 7c),
 * so live listening runs the same in headless Chromium (whose own would
 * need a mic and Google's servers). Set what a run does before the mic tap
 * with setSpeech(page, { mode, words }):
 *   'absent'   no speech recognition (the default: the mic opens typing)
 *   'final'    audiostart, the words one at a time as interim results, then
 *              a final result and end
 *   'interim'  audiostart and the interim words, then nothing (Stop gets no
 *              final and no end: the app sends the interim words after a second)
 *   'deaf'     start and audiostart, then nothing (WebKit bug 321436)
 *   'denied'   the error not-allowed, then end
 * Each run is logged in window.__speech.runs ({ mode, calls }).
 */
export async function fakeSpeech(page) {
  await page.addInitScript(() => {
    const speech = { mode: 'absent', words: 'We’re out of eggs and we’re eating out Friday', step: 250, runs: [] }
    window.__speech = speech
    class FakeSpeechRecognition {
      constructor() {
        this.run = { mode: speech.mode, calls: [] }
        this.timers = []
        speech.runs.push(this.run)
      }

      later(ms, fn) { this.timers.push(setTimeout(fn, ms)) }

      fire(type, extra = {}) { this[`on${type}`]?.({ type, ...extra }) }

      result(text, isFinal) {
        const alt = [{ transcript: text, confidence: 0.9 }]
        alt.isFinal = isFinal
        this.fire('result', { resultIndex: 0, results: [alt] })
      }

      start() {
        this.run.calls.push('start')
        const { mode } = this.run
        if (mode === 'denied') {
          this.later(50, () => { this.fire('error', { error: 'not-allowed' }); this.fire('end') })
          return
        }
        this.later(20, () => this.fire('start'))
        this.later(60, () => this.fire('audiostart'))
        if (mode === 'deaf') return
        const words = speech.words.split(' ')
        this.later(150, () => this.fire('speechstart'))
        words.forEach((_, i) => this.later(300 + i * speech.step, () => this.result(words.slice(0, i + 1).join(' ').toLowerCase(), false)))
        if (mode === 'final') this.later(300 + words.length * speech.step + 200, () => { this.result(speech.words, true); this.fire('end') })
      }

      stop() { this.run.calls.push('stop') }

      abort() {
        this.run.calls.push('abort')
        this.timers.forEach(clearTimeout)
        this.later(0, () => { this.fire('error', { error: 'aborted' }); this.fire('end') })
      }
    }
    const get = () => (speech.mode === 'absent' ? undefined : FakeSpeechRecognition)
    Object.defineProperty(window, 'SpeechRecognition', { get, configurable: true })
    Object.defineProperty(window, 'webkitSpeechRecognition', { get, configurable: true })
  })
}

/** What the stand-in recognizer does from the next mic tap: { mode, words }. */
export async function setSpeech(page, { mode, words = null }) {
  await page.evaluate(({ mode: m, words: w }) => {
    window.__speech.mode = m
    if (w) window.__speech.words = w
  }, { mode, words })
}
