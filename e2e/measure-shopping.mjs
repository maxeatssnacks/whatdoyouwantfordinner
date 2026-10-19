// Measures how the Shopping page loads, as the test account, at iPhone size
// on a throttled network (CDP: ~150 ms latency, ~10 Mbps down, 5 Mbps up).
// Read-only: it opens pages and reads; nothing is changed.
//
//   node e2e/measure-shopping.mjs --base http://localhost:4173 --label prod [--runs 3] [--no-throttle] [--timeout 60]
//
// Two cases per run, each in a fresh browser context (signed in, empty cache):
// - warm: open the Week page, wait until it's loaded, tap "List";
// - cold: open /shopping directly.
// For each: every request (what, start, end, duration, size) from the tap (or
// navigation) on, and these moments: auth ready (the app shell renders), meal
// plan ready (this week's entries arrive), saved list ready (shopping_lists),
// size choices ready (package_size_choices), list generated, spinner gone
// (rows or the empty state show). Results go to e2e/screenshots/perf/<label>.json.
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from '@playwright/test'
import { ROOT, readCredentials, resolveChromium } from './env.js'

const args = process.argv.slice(2)
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const base = arg('--base', 'http://localhost:3000')
const label = arg('--label', 'adhoc')
const runs = Number(arg('--runs', 3))
const throttle = !args.includes('--no-throttle')
const timeout = Number(arg('--timeout', 60)) * 1000 // the dev server's unbundled modules can take minutes throttled
const NETWORK = { offline: false, latency: 150, downloadThroughput: (10 * 1e6) / 8, uploadThroughput: (5 * 1e6) / 8 }

const iphone = devices['iPhone 13']
const contextOptions = {
  baseURL: base,
  viewport: iphone.viewport,
  deviceScaleFactor: iphone.deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
  userAgent: iphone.userAgent,
}

// In the page from the start: when the app shell renders, when the list (or
// its empty state) shows, whether a full-page spinner showed, and when the
// list is generated (its existing console log).
const INIT = `(() => {
  const m = (window.__marks = {})
  const now = () => performance.timeOrigin + performance.now()
  const mark = (k) => { if (!(k in m)) m[k] = now() }
  window.__resetMarks = () => { for (const k of Object.keys(m)) delete m[k] }
  const check = () => {
    if (document.querySelector('nav[aria-label="Main"]')) mark('authReady')
    if (location.pathname === '/shopping') {
      if (document.querySelector('.animate-spin')) mark('spinnerShown')
      if (document.querySelector('[data-testid="shopping-row"], [data-testid="have-section"]') || (document.body && /No recipes in your meal plan/.test(document.body.innerText))) mark('listShown')
    }
  }
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true })
  const log = console.log
  console.log = function (...a) {
    if (typeof a[0] === 'string' && a[0].startsWith('[useWeekShoppingList] week query range')) mark('listGenerated')
    return log.apply(this, a)
  }
  window.__mark = mark
  // Newer code marks the generation with performance.mark instead of logging.
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'shopping:list-generated' && !('listGenerated' in m)) m.listGenerated = performance.timeOrigin + e.startTime
    }).observe({ type: 'mark', buffered: true })
  } catch (err) { /* no PerformanceObserver */ }
  // A skeleton counts as a loading state too.
  new MutationObserver(() => {
    if (location.pathname === '/shopping' && document.querySelector('[data-testid="shopping-skeleton"]')) mark('skeletonShown')
  }).observe(document, { subtree: true, childList: true })
})()`

function describe(url) {
  const u = new URL(url)
  if (u.pathname.startsWith('/rest/v1/')) {
    const table = u.pathname.slice('/rest/v1/'.length)
    const p = u.searchParams
    const bits = []
    if (p.get('week_start_date')) bits.push(`week ${p.get('week_start_date').replace(/^eq\./, '')}`)
    if (table === 'meal_plan_entries') bits.push(p.get('select')?.includes('recipe') ? 'with recipes' : '')
    if (table === 'meal_plans' && p.get('select')?.includes('meal_plan_entries')) bits.push('with entries')
    if (table === 'shopping_lists' && p.get('select')?.includes('meal_plans')) bits.push('by week')
    if (table === 'recipes') bits.push(p.get('recipe_type') ? `type ${p.get('recipe_type')}` : 'library')
    return `rest ${table}${bits.filter(Boolean).length ? ` (${bits.filter(Boolean).join(', ')})` : ''}`
  }
  if (u.pathname.startsWith('/auth/v1/')) return `auth ${u.pathname.slice('/auth/v1/'.length)}`
  if (u.pathname.startsWith('/functions/v1/')) return `function ${u.pathname.slice('/functions/v1/'.length)}`
  if (u.host.includes('posthog') || u.host.includes('i.posthog')) return 'posthog'
  return u.pathname + (u.search ? '?…' : '')
}

async function measure(browser, storageState, kind) {
  const context = await browser.newContext({ ...contextOptions, storageState })
  await context.addInitScript(INIT)
  // PostHog is not part of the page's work; keep it out of the numbers (any
  // PostHog host; on the dev server the posthog-js module itself is a local
  // request, which must load).
  await context.route((url) => url.hostname.includes('posthog'), (r) => r.fulfill({ status: 200, body: '{}' }))
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  if (throttle) await cdp.send('Network.emulateNetworkConditions', NETWORK)

  const requests = []
  const onDone = async (req, failed = false) => {
    const t = req.timing()
    const sizes = failed ? null : await req.sizes().catch(() => null)
    requests.push({
      what: describe(req.url()),
      url: req.url(),
      method: req.method(),
      type: req.resourceType(),
      start: t.startTime,
      end: t.responseEnd >= 0 ? t.startTime + t.responseEnd : null,
      bytes: sizes ? sizes.responseBodySize + sizes.responseHeadersSize : 0,
      failed,
    })
  }
  page.on('requestfinished', (r) => onDone(r))
  page.on('requestfailed', (r) => onDone(r, true))

  let t0
  if (kind === 'warm') {
    await page.goto('/dashboard', { timeout })
    await page.locator('[data-testid="week-page"]').waitFor({ timeout: timeout })
    await page.locator('[aria-label="Loading your week"]').waitFor({ state: 'detached', timeout: timeout }).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: timeout }).catch(() => {})
    await page.waitForTimeout(500)
    await page.evaluate(() => window.scrollTo(0, 0)) // the nav is in view at the top
    await page.waitForTimeout(300)
    requests.length = 0
    t0 = await page.evaluate(() => { window.__resetMarks(); window.__mark('authReady'); return performance.timeOrigin + performance.now() })
    await page.getByRole('link', { name: 'List', exact: true }).first().tap()
  } else {
    t0 = Date.now()
    await page.goto('/shopping', { timeout })
  }
  await page.waitForFunction(() => 'listShown' in window.__marks, null, { timeout: timeout })
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const marks = await page.evaluate(() => window.__marks)
  await context.close()

  const rel = (v) => (v == null ? null : Math.round(v - t0))
  const rows = requests
    .filter((r) => r.start >= t0 - 5)
    .sort((a, b) => a.start - b.start)
    .map((r) => ({ ...r, start: rel(r.start), end: rel(r.end), ms: r.end != null ? Math.round(r.end - r.start) : null }))
  const last = (pred) => rows.filter(pred).reduce((m, r) => (r.end != null && (m == null || r.end > m) ? r.end : m), null)
  const milestones = {
    authReady: kind === 'warm' ? 0 : rel(marks.authReady),
    mealPlanReady: last((r) => r.what.startsWith('rest meal_plan_entries') || r.what.includes('with entries')) ?? 'cached',
    savedListReady: last((r) => r.what.startsWith('rest shopping_lists') && r.method === 'GET') ?? 'cached',
    sizeChoicesReady: last((r) => r.what.startsWith('rest package_size_choices')) ?? 'cached',
    listGenerated: rel(marks.listGenerated),
    spinnerShown: marks.spinnerShown != null,
    skeletonShown: marks.skeletonShown != null,
    spinnerGone: rel(marks.listShown),
  }
  return { kind, milestones, requests: rows }
}

const browser = await chromium.launch({ executablePath: resolveChromium() })
const { email, password } = readCredentials()
const login = await browser.newContext(contextOptions)
const lp = await login.newPage()
await lp.goto('/login')
await lp.locator('input[type="email"]').fill(email)
await lp.locator('input[type="password"]').fill(password)
await lp.locator('button[type="submit"]').click()
await lp.waitForURL('**/dashboard', { timeout: 30_000 })
const storageState = await login.storageState()
await login.close()

const out = { label, base, throttle: throttle ? NETWORK : null, at: new Date().toISOString(), runs: [] }
for (let i = 0; i < runs; i++) {
  for (const kind of ['warm', 'cold']) out.runs.push(await measure(browser, storageState, kind))
}
await browser.close()

const dir = path.join(ROOT, 'e2e', 'screenshots', 'perf')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, `${label}.json`), JSON.stringify(out, null, 2))

const median = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
console.log(`Shopping load, ${label} (${base}), ${throttle ? '150 ms / 10 Mbps' : 'no throttling'}, ${runs} runs`)
for (const kind of ['warm', 'cold']) {
  const rs = out.runs.filter((r) => r.kind === kind)
  const keys = Object.keys(rs[0].milestones)
  console.log(`\n${kind}: median of ${rs.length} (each run)`)
  for (const k of keys) console.log(`  ${k.padEnd(17)} ${String(median(rs.map((r) => r.milestones[k])) ?? rs.map((r) => r.milestones[k])[0]).padStart(6)}   ${rs.map((r) => r.milestones[k]).join(' / ')}`)
  const pick = rs[Math.floor((rs.length - 1) / 2)]
  const js = pick.requests.filter((r) => r.type === 'script')
  console.log(`  requests in one run: ${pick.requests.length} (${js.length} scripts, ${Math.round(js.reduce((n, r) => n + r.bytes, 0) / 1024)} KB of JS)`)
  for (const r of pick.requests.filter((r) => r.type !== 'script' || js.length <= 12)) {
    console.log(`    ${String(r.start).padStart(5)} → ${String(r.end ?? '—').padStart(5)}  ${String(r.ms ?? '—').padStart(5)} ms  ${String(Math.round(r.bytes / 1024)).padStart(4)} KB  ${r.method.padEnd(5)} ${r.what}${r.failed ? ' (failed)' : ''}`)
  }
  if (js.length > 12) {
    const first = Math.min(...js.map((r) => r.start))
    const lastEnd = Math.max(...js.map((r) => r.end ?? 0))
    console.log(`    ${String(first).padStart(5)} → ${String(lastEnd).padStart(5)}  ${js.length} JS modules (dev server), ${Math.round(js.reduce((n, r) => n + r.bytes, 0) / 1024)} KB`)
  }
}
