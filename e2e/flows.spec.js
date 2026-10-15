// Opt-in (--flows): exercises the Week page's write paths on the test
// account's OWN plan only — plan the week, check the planning rules, swap a
// meal, remove a meal through the confirm, move a leftover, then re-plan so
// the account ends with every day from today on planned. Reads results from
// the app's own network responses; never touches other accounts.
import { test, expect } from '@playwright/test'
import {
  expandPastDays,
  instrument,
  login,
  openCard,
  planWeekDinner,
  settle,
  setVariants,
  sheet,
  shotPath,
  stepRunner,
  writeResults,
} from './helpers.js'

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
// Mirrors MAX_LEFTOVERS_PER_COOK and the 4-day look-ahead in src/lib/utils.js.
const MAX_LEFTOVERS = 2
const LOOK_AHEAD = 4

// Latest rows the app fetched, captured from its own Supabase responses.
function captureData(page) {
  const data = { entriesByPlan: {}, plansByWeek: {}, members: null }
  page.on('response', async (res) => {
    if (res.request().method() !== 'GET' || !res.ok()) return
    const url = new URL(res.url())
    if (!url.pathname.startsWith('/rest/v1/')) return
    let body
    try { body = await res.json() } catch { return }
    if (url.pathname.endsWith('/meal_plan_entries') && url.searchParams.get('select')?.includes('recipe:recipes')) {
      const planId = (url.searchParams.get('meal_plan_id') || '').replace(/^eq\./, '')
      if (planId && Array.isArray(body)) data.entriesByPlan[planId] = body
    } else if (url.pathname.endsWith('/meal_plans') && url.searchParams.get('week_start_date')) {
      const week = url.searchParams.get('week_start_date').replace(/^eq\./, '')
      if (Array.isArray(body) && body[0]?.id) data.plansByWeek[week] = body[0].id
    } else if (url.pathname.endsWith('/household_members') && Array.isArray(body) && !url.searchParams.get('id')) {
      data.members = body
    }
  })
  return data
}

const isDinner = (e) => String(e.meal_type).toLowerCase() === 'dinner'
const dayIdx = (e) => DAYS.indexOf(e.day_of_week)
// Everything Plan my week must leave alone on a day, as one comparable string.
const fingerprint = (e) => [e.id, e.day_of_week, e.meal_type, e.recipe_id, e.servings, !!e.is_leftover, e.original_entry_id].join('|')

test('flows: plan, swap, remove, move, re-plan', async ({ page }) => {
  const results = []
  const step = stepRunner(results)
  const consoleErrors = await instrument(page)
  const data = captureData(page)
  const snap = (name) => page.screenshot({ path: shotPath('flows', name) })

  // Read in the browser each time, so a run near midnight uses the app's "today".
  const weekInfo = async () => page.evaluate(() => {
    const d = new Date()
    const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
    const next = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 7)
    return { today: fmt(d), todayIdx: d.getDay(), thisWeek: fmt(sunday), nextWeek: fmt(next) }
  })
  const currentEntries = (w) => data.entriesByPlan[data.plansByWeek[w.thisWeek]] ?? []
  const nextEntries = (w) => data.entriesByPlan[data.plansByWeek[w.nextWeek]] ?? []
  const reload = async () => {
    await page.goto('/dashboard')
    await settle(page)
    await expandPastDays(page)
  }

  // Plans Dinner through the sheet, then checks what Plan my week may change.
  let lastRun = null
  const planAndCheck = async (shot) => {
    await reload()
    const w = await weekInfo()
    const before = currentEntries(w)
    const beforeIds = new Set([...before, ...nextEntries(w)].map((e) => e.id))
    const pastBefore = before.filter((e) => dayIdx(e) < w.todayIdx).map(fingerprint).sort()
    // Leftovers from today on whose meal was cooked before today must stay.
    const cookedBefore = new Set(before.filter((e) => !e.is_leftover && dayIdx(e) < w.todayIdx).map((e) => e.id))
    const keptLeftovers = before.filter((e) => e.is_leftover && dayIdx(e) >= w.todayIdx && cookedBefore.has(e.original_entry_id))

    const outcome = await planWeekDinner(page)
    await reload()
    await snap(shot)
    if ((await weekInfo()).today !== w.today) throw new Error('the date changed during the run; run the flows again')

    const after = currentEntries(w)
    const afterNext = nextEntries(w)
    const pastAfter = after.filter((e) => dayIdx(e) < w.todayIdx).map(fingerprint).sort()
    if (JSON.stringify(pastAfter) !== JSON.stringify(pastBefore)) {
      throw new Error(`a day before today changed (${pastBefore.length} entries before, ${pastAfter.length} after)`)
    }
    const lostKept = keptLeftovers.filter((k) => !after.some((e) => e.id === k.id))
    if (lostKept.length) throw new Error(`${lostKept.length} leftover(s) from meals cooked before today were removed`)
    const unplanned = DAYS.slice(w.todayIdx).filter((d) => !after.some((e) => e.day_of_week === d && isDinner(e)))
    if (unplanned.length) throw new Error(`no dinner on ${unplanned.join(', ')}`)

    const runCooks = after.filter((e) => isDinner(e) && !e.is_leftover && !beforeIds.has(e.id))
    if (!runCooks.length) throw new Error('the run cooked nothing new')
    const early = runCooks.filter((e) => dayIdx(e) < w.todayIdx)
    if (early.length) throw new Error(`cooked on a day before today: ${early.map((e) => e.day_of_week).join(', ')}`)

    lastRun = { w, runCooks, beforeIds, after, afterNext, outcome }
    return {
      today: w.today,
      daysBeforeTodayUnchanged: pastBefore.length,
      keptLeftovers: keptLeftovers.length,
      cooks: runCooks.map((e) => e.day_of_week.slice(0, 3)).join(' '),
      planAnyway: outcome.bypassed,
      scopeNote: outcome.scopeNote,
    }
  }

  // Each recipe cooked at most once per run, unless the sheet said the
  // eligible pool ran out (and then only the recipes it named).
  const checkVariety = () => {
    const { runCooks, outcome } = lastRun
    const byRecipe = new Map()
    for (const c of runCooks) byRecipe.set(c.recipe_id, [...(byRecipe.get(c.recipe_id) ?? []), c])
    const twice = [...byRecipe.values()].filter((list) => list.length > 1).map((list) => list[0].recipe?.title ?? list[0].recipe_id)
    if (twice.length && !outcome.repeatNotice) throw new Error(`cooked more than once in one run: ${twice.join(', ')}`)
    const unnamed = twice.filter((t) => !outcome.repeatNotice?.includes(t))
    if (unnamed.length) throw new Error(`repeated without saying so: ${unnamed.join(', ')}`)
    return outcome.repeatNotice
      ? { note: `pool ran out, sheet said: ${outcome.repeatNotice}` }
      : { cooks: runCooks.length, distinctRecipes: byRecipe.size }
  }

  // Servings = people × (1 + leftovers), and each cook got every leftover the
  // cap and the free days after it allowed (days already taken before the run
  // stay taken; days 1–4 ahead, into next week).
  const checkServings = () => {
    const { runCooks, beforeIds, after, afterNext } = lastRun
    const people = data.members?.length ?? 0
    if (people !== 1) throw new Error(`test household has ${people} members; this check expects 1`)
    const dinners = [
      ...after.filter(isDinner).map((e) => ({ e, pos: dayIdx(e) })),
      ...afterNext.filter(isDinner).map((e) => ({ e, pos: 7 + dayIdx(e) })),
    ]
    const takenBefore = new Set(dinners.filter(({ e }) => beforeIds.has(e.id)).map(({ pos }) => pos))
    const report = []
    for (const cook of runCooks) {
      const leftovers = dinners.filter(({ e }) => e.is_leftover && e.original_entry_id === cook.id).length
      const recipeServings = Math.max(1, Math.floor(Number(cook.recipe?.servings)) || 1)
      let free = 0
      for (let d = 1; d <= LOOK_AHEAD; d++) if (!takenBefore.has(dayIdx(cook) + d)) free++
      const expected = Math.min(MAX_LEFTOVERS, Math.max(0, recipeServings - 1), free)
      report.push(`${cook.day_of_week.slice(0, 3)}:${cook.servings}`)
      if (cook.servings !== 1 + leftovers) throw new Error(`${cook.day_of_week} cooks ${cook.servings} but has ${leftovers} leftovers`)
      if (leftovers !== expected) throw new Error(`${cook.day_of_week} has ${leftovers} leftovers, expected ${expected}`)
    }
    return { cooks: report.join(' '), cap: 1 + MAX_LEFTOVERS }
  }

  // No recipe on more than 3 days in a row this week (a cook plus two leftovers).
  const checkRuns = () => {
    const byDay = Object.fromEntries(lastRun.after.filter(isDinner).map((e) => [e.day_of_week, e.recipe_id]))
    let run = 0
    let longest = 0
    let prev = null
    for (const d of DAYS) {
      const id = byDay[d] ?? null
      run = id && id === prev ? run + 1 : id ? 1 : 0
      longest = Math.max(longest, run)
      prev = id
    }
    if (longest > 1 + MAX_LEFTOVERS) throw new Error(`a recipe runs ${longest} days in a row`)
    return { longestRun: longest }
  }

  const ok = await step('login', () => login(page))
  if (!ok) {
    writeResults('flows', { project: 'flows', results, consoleErrors })
    expect(results.filter((r) => !r.ok)).toEqual([])
    return
  }

  await setVariants(page, {}) // default variants, sample data off

  const planned = await step('plan the week (Dinner): nothing before today changes', () => planAndCheck('01-planned'))
  if (planned) {
    await step('each recipe cooked at most once in the run', checkVariety)
    await step('cooked servings follow the leftover cap (one-person household)', checkServings)
    await step('no recipe more than 3 days in a row', checkRuns)
  }

  await step('swap a meal', async () => {
    await reload()
    const target = lastRun?.runCooks[0]
    if (!target) throw new Error('no meal from the run to swap')
    const w = lastRun.w
    const card = page.locator(`[data-entry-id="${target.id}"]`)
    await openCard(card)
    const s = sheet(page, 'meal-sheet')
    await s.waitFor()
    await s.getByRole('button', { name: /^Swap/ }).click()
    await s.getByText(/^Swapped in /).waitFor({ timeout: 15_000 })
    await snap('02-swapped')
    await s.getByRole('button', { name: 'Close' }).click()
    await settle(page)
    const after = currentEntries(w).find((e) => e.id === target.id)?.recipe_id
    if (!after || after === target.recipe_id) throw new Error('recipe did not change')
    return { entry: target.id, day: target.day_of_week }
  })

  await step('remove a meal through the confirm', async () => {
    await reload()
    const w = await weekInfo()
    const cooks = page.locator('[data-testid="meal-card"][data-leftover="false"], [data-testid="today-card"][data-leftover="false"]')
    const n = await cooks.count()
    if (!n) throw new Error('no cooked meal to remove')
    // The latest cooked meal, so its day frees up for the leftover move below.
    const card = cooks.nth(n - 1)
    const id = await card.getAttribute('data-entry-id')
    await openCard(card)
    const s = sheet(page, 'meal-sheet')
    await s.waitFor()
    await s.getByRole('button', { name: 'Remove from plan' }).click()
    await snap('03-remove-confirm')
    await s.getByRole('button', { name: 'Remove', exact: true }).click()
    await s.waitFor({ state: 'detached', timeout: 15_000 })
    await settle(page)
    if (await page.locator(`[data-entry-id="${id}"]`).count()) throw new Error('removed meal still shown')
    if (currentEntries(w).some((e) => e.id === id || e.original_entry_id === id)) throw new Error('meal or its leftovers still in the plan')
    return { removed: id }
  })

  await step('move a leftover', async () => {
    await reload()
    const w = await weekInfo()
    // Leftovers from today on, so the move doesn't touch a day that's passed.
    const upcoming = new Set(currentEntries(w).filter((e) => e.is_leftover && dayIdx(e) >= w.todayIdx).map((e) => e.id))
    const leftovers = page.locator('[data-leftover="true"]')
    const n = await leftovers.count()
    for (let i = 0; i < n; i++) {
      const card = leftovers.nth(i)
      const id = await card.getAttribute('data-entry-id')
      if (!upcoming.has(id)) continue
      await openCard(card)
      const s = sheet(page, 'leftover-sheet')
      await s.waitFor()
      const targets = s.locator('[role="group"][aria-label="Move to a different day"] button')
      if (await targets.count()) {
        await snap('04-leftover-sheet')
        const label = (await targets.first().textContent()).trim()
        await targets.first().click()
        await s.waitFor({ state: 'detached', timeout: 15_000 })
        await settle(page)
        const moved = currentEntries(w).find((e) => e.id === id)
        return { entry: id, movedTo: moved?.day_of_week, button: label }
      }
      await s.getByRole('button', { name: 'Close' }).click()
      await s.waitFor({ state: 'detached' })
    }
    return { note: 'no leftover from today on had a later free day to move to' }
  })

  const replanned = await step('re-plan the week: nothing before today changes', () => planAndCheck('05-replanned'))
  if (replanned) {
    await step('re-plan: each recipe cooked at most once in the run', checkVariety)
    await step('re-plan: cooked servings follow the leftover cap', checkServings)
    await step('re-plan: no recipe more than 3 days in a row', checkRuns)
  }

  writeResults('flows', { project: 'flows', viewport: page.viewportSize(), results, consoleErrors })
  expect(results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`)).toEqual([])
})
