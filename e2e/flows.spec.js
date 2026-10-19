// Opt-in (--flows): exercises the Week page's write paths on the test
// account's OWN plan only — plan the week, check the planning rules, remove a
// meal through the confirm, move a leftover, then re-plan so the account ends
// with every day from today on planned. Then the meal picker on a day next
// week (always in the future): add a dinner from a suggestion, swap it from
// the picker and from Recipes (whose servings start where the picker's
// would), check a swap offers the old meal's leftover days, add "Something
// simple" on two days, edit it, remove everything it added and delete the
// quick meal it saved. Then this week's shopping list: checks that stick,
// quick taps, the keyboard, an item to Already have and back, a checked line
// that hides when its meal goes and comes back checked (with what was bought
// recorded), and a package size chosen and set back to the default. Reads
// results from the app's own network responses; never touches other
// accounts. "Something simple" calls the real parse-ingredients function once
// per run (it allows 20 a day per account); the leftover-days check stubs it.
import { test, expect } from '@playwright/test'
import { PACKAGE_ENTRIES } from '../src/v2/lib/packageSizes.js'
import { findLineEntry } from '../src/v2/lib/packages.js'
import { addDays, amountText, answerAmount } from '../src/v2/lib/onHand.js'
import { generateShoppingItems, parseRecipeIngredientsJsonb } from '../src/lib/utils.js'
import {
  analyticsEvents,
  assertNoAnalyticsLeaks,
  browserWeek,
  checkRollovers,
  closeSheet,
  navLink,
  expandPastDays,
  instrument,
  login,
  openCard,
  planWeekDinner,
  readOnHandRows,
  restGet,
  restSession,
  settle,
  setVariants,
  sheet,
  shotPath,
  stepRunner,
  waitForEvent,
  writeResults,
  expectedRollovers,
} from './helpers.js'

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
// Mirrors MAX_LEFTOVERS_PER_COOK and the 4-day look-ahead in src/lib/utils.js.
const MAX_LEFTOVERS = 2
const LOOK_AHEAD = 4

// Latest rows the app fetched, captured from its own Supabase responses,
// plus any recipe rows it created (quick meals).
function captureData(page) {
  const data = { entriesByPlan: {}, plansByWeek: {}, members: null, createdRecipes: [] }
  page.on('response', async (res) => {
    if (!res.ok()) return
    const url = new URL(res.url())
    if (!url.pathname.startsWith('/rest/v1/')) return
    const method = res.request().method()
    if (method === 'POST' && url.pathname.endsWith('/meal_plans')) {
      try {
        const body = await res.json()
        const plan = Array.isArray(body) ? body[0] : body
        if (plan?.id && plan.week_start_date) {
          data.plansByWeek[plan.week_start_date] = plan.id
          if (Array.isArray(plan.entries)) data.entriesByPlan[plan.id] = plan.entries
        }
      } catch { /* not JSON */ }
      return
    }
    if (method === 'POST' && url.pathname.endsWith('/recipes')) {
      try {
        const body = await res.json()
        data.createdRecipes.push(...(Array.isArray(body) ? body : [body]))
      } catch { /* not JSON */ }
      return
    }
    if (method !== 'GET') return
    let body
    try { body = await res.json() } catch { return }
    if (url.pathname.endsWith('/meal_plan_entries') && url.searchParams.get('select')?.includes('recipe:recipes')) {
      const planId = (url.searchParams.get('meal_plan_id') || '').replace(/^eq\./, '')
      if (planId && Array.isArray(body)) data.entriesByPlan[planId] = body
    } else if (url.pathname.endsWith('/meal_plans') && url.searchParams.get('week_start_date')?.startsWith('eq.')) {
      // The week's plan, with its entries embedded (one read since 2026-10-19).
      // (On-hand reads a range of weeks, gte./lte., with fewer fields; not that.)
      const week = url.searchParams.get('week_start_date').replace(/^eq\./, '')
      if (Array.isArray(body) && body[0]?.id) {
        data.plansByWeek[week] = body[0].id
        if (Array.isArray(body[0].entries)) data.entriesByPlan[body[0].id] = body[0].entries
      }
    } else if (url.pathname.endsWith('/household_members') && Array.isArray(body) && !url.searchParams.get('id')) {
      data.members = body
    }
  })
  return data
}

// Removes the test account's stored package size for one ingredient (back to
// "Smallest that fits"); → how many rows it removed.
async function deleteOwnSizeChoice(page, key) {
  const { url, headers, userId } = await restSession(page)
  const res = await page.request.delete(
    `${url}/rest/v1/package_size_choices?user_id=eq.${userId}&ingredient_key=eq.${encodeURIComponent(key)}`,
    { headers },
  )
  if (!res.ok()) throw new Error(`deleting the size choice: HTTP ${res.status()}`)
  return (await res.json()).length
}

// Deletes quick meal rows this run created, and any plan entries still using
// them (left if a step failed), as the test account.
async function deleteOwnQuickMeals(page, ids) {
  const { url, headers, userId } = await restSession(page)
  const inIds = `in.(${ids.join(',')})`
  const entries = await page.request.delete(`${url}/rest/v1/meal_plan_entries?recipe_id=${inIds}`, { headers })
  if (!entries.ok()) throw new Error(`deleting entries that use them: HTTP ${entries.status()}`)
  const recipes = await page.request.delete(
    `${url}/rest/v1/recipes?id=${inIds}&recipe_type=eq.quick&created_by=eq.${userId}`,
    { headers },
  )
  if (!recipes.ok()) throw new Error(`deleting quick meals: HTTP ${recipes.status()}`)
  const gone = await recipes.json()
  if (gone.length !== ids.length) throw new Error(`deleted ${gone.length} of ${ids.length} quick meals`)
  return { quickMealsDeleted: gone.length, entriesStillUsingThem: (await entries.json()).length }
}

const PARSE_URL = '**/functions/v1/parse-ingredients'
const STUB_ITEMS = [{ name: 'eggs', amount: 2, unit: 'whole', notes: '', calories: 144, protein: 12, carbs: 1, fat: 10 }]
// Used only when the account has reached parse-ingredients' daily limit.
const STUB_MEAL = [
  ...STUB_ITEMS,
  { name: 'English muffin', amount: 1, unit: 'whole', notes: '', calories: 134, protein: 5, carbs: 26, fat: 1 },
  { name: 'Greek yogurt', amount: 170, unit: 'g', notes: '', calories: 100, protein: 17, carbs: 6, fat: 1 },
  { name: 'apple', amount: 1, unit: 'whole', notes: '', calories: 95, protein: 0, carbs: 25, fat: 0 },
]

const isDinner = (e) => String(e.meal_type).toLowerCase() === 'dinner'
const dayIdx = (e) => DAYS.indexOf(e.day_of_week)
// Everything Plan my week must leave alone on a day, as one comparable string.
const fingerprint = (e) => [e.id, e.day_of_week, e.meal_type, e.recipe_id, e.servings, !!e.is_leftover, e.original_entry_id].join('|')

test('flows: plan, remove, move, re-plan, meal picker', async ({ page }) => {
  // Longer than the default: a timeout would also skip the cleanup at the end.
  test.setTimeout(480_000)
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
    const after = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 14)
    return { today: fmt(d), todayIdx: d.getDay(), thisWeek: fmt(sunday), nextWeek: fmt(next), weekAfter: fmt(after) }
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

  // No recipe on more than 3 days in a row this week (a cook plus two
  // leftovers), unless the sheet said the pool ran out and named it: with one
  // fresh recipe left, repeating it runs days together (as checkVariety allows).
  const checkRuns = () => {
    const { after, outcome } = lastRun
    const dinners = after.filter(isDinner)
    const byDay = Object.fromEntries(dinners.map((e) => [e.day_of_week, e.recipe_id]))
    const titleOf = (id) => dinners.find((e) => e.recipe_id === id)?.recipe?.title ?? id
    let run = 0
    let longest = 0
    let longestId = null
    let prev = null
    for (const d of DAYS) {
      const id = byDay[d] ?? null
      run = id && id === prev ? run + 1 : id ? 1 : 0
      if (run > longest) { longest = run; longestId = id }
      prev = id
    }
    if (longest > 1 + MAX_LEFTOVERS) {
      const title = titleOf(longestId)
      if (!outcome.repeatNotice?.includes(title)) throw new Error(`${title} runs ${longest} days in a row`)
      return { longestRun: longest, note: `${title} repeats because the pool ran out, as the sheet said` }
    }
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

  // ── Meal picker, on next week only (every day there is in the future).
  const entriesOf = (week) => data.entriesByPlan[data.plansByWeek[week]] ?? []
  const goWeek = async (week) => {
    await page.goto(`/dashboard?week=${week}`)
    await settle(page)
    // An empty week shows its empty state; the days are one tap away.
    const empty = page.locator('[data-testid="empty-week"]')
    if (await empty.count()) {
      await empty.getByRole('button', { name: 'I’ll pick meals myself' }).click()
      await empty.waitFor({ state: 'detached' })
    }
  }
  const picker = sheet(page, 'meal-picker')
  const dateOf = (weekStart, dayName) => {
    const [y, m, d] = weekStart.split('-').map(Number)
    const x = new Date(y, m - 1, d + DAYS.indexOf(dayName))
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const openPickerFor = async (date, slot) => {
    const add = page.locator(`section[data-day="${date}"]`).getByRole('button', { name: /^Add a meal/ })
    if (!(await add.count())) throw new Error(`every slot on ${date} is taken`)
    await add.click()
    const addSheet = sheet(page, 'add-meal-sheet')
    await addSheet.waitFor()
    const free = (await addSheet.locator('ul button').allTextContents()).map((t) => t.trim())
    const name = slot ?? free.find((n) => n.toLowerCase() !== 'dinner')
    if (!name || !free.includes(name)) throw new Error(`slot ${slot ?? '(not Dinner)'} isn't free on ${date} (free: ${free.join(', ')})`)
    await addSheet.getByRole('button', { name, exact: true }).click()
    await picker.locator('[data-testid="picker-main"][data-mode="add"]').waitFor()
    return name
  }
  const openSwapFor = async (entryId) => {
    await openCard(page.locator(`[data-entry-id="${entryId}"]`))
    const ms = sheet(page, 'meal-sheet')
    await ms.waitFor()
    await ms.getByRole('button', { name: 'Swap' }).click()
    await picker.locator('[data-testid="picker-main"][data-mode="swap"]').waitFor()
  }
  const dinnersIn = (w, dayName) => entriesOf(w.nextWeek).filter((e) => e.day_of_week === dayName && isDinner(e))

  // A picked or swapped dinner's leftovers: at most the cap, the right count
  // for the free dinners in the 4 days after it (other entries stay put), all
  // of the new recipe, and it cooks people × (1 + leftovers) (the picker's
  // rule, and where a recipe page in slot mode starts its servings).
  const checkCookLeftovers = (w, cook) => {
    const people = data.members?.length ?? 0
    if (people !== 1) throw new Error(`test household has ${people} members; this check expects 1`)
    const dinners = [
      ...entriesOf(w.nextWeek).filter(isDinner).map((e) => ({ e, pos: dayIdx(e) })),
      ...entriesOf(w.weekAfter).filter(isDinner).map((e) => ({ e, pos: 7 + dayIdx(e) })),
    ]
    const own = dinners.filter(({ e }) => e.is_leftover && e.original_entry_id === cook.id)
    const takenByOthers = new Set(dinners.filter(({ e }) => e.id !== cook.id && e.original_entry_id !== cook.id).map(({ pos }) => pos))
    let free = 0
    for (let d = 1; d <= LOOK_AHEAD; d++) if (!takenByOthers.has(dayIdx(cook) + d)) free++
    const basis = Math.max(1, Math.floor(Number(cook.recipe?.servings)) || 1)
    const expected = Math.min(MAX_LEFTOVERS, Math.max(0, Math.floor(basis / people) - 1), free)
    if (own.length > MAX_LEFTOVERS) throw new Error(`${own.length} leftovers, cap is ${MAX_LEFTOVERS}`)
    if (own.length !== expected) throw new Error(`${own.length} leftovers, expected ${expected} (servings basis ${basis}, ${free} free days)`)
    if (own.some(({ e }) => e.recipe_id !== cook.recipe_id)) throw new Error('a leftover still has the old recipe')
    if (cook.servings !== people * (1 + own.length)) {
      throw new Error(`cooks ${cook.servings} with ${own.length} leftovers (expected ${people * (1 + own.length)})`)
    }
    return { servings: cook.servings, leftovers: own.length }
  }

  let picked = null // { w, dayName, date, entry }
  await step('picker: add a dinner from a suggestion (next week)', async () => {
    const w = await weekInfo()
    await goWeek(w.nextWeek)
    const dayName = ['wednesday', 'thursday', 'friday', 'saturday'].find((d) => !dinnersIn(w, d).length)
    if (!dayName) throw new Error('no free dinner next week, Wednesday to Saturday')
    const date = dateOf(w.nextWeek, dayName)
    await openPickerFor(date, 'Dinner')
    const first = picker.locator('[data-testid="picker-suggestion"]').first()
    if (!(await first.count())) throw new Error('no suggestions for Dinner')
    const recipeId = await first.getAttribute('data-recipe-id')
    await snap('06-picker-add')
    await first.click()
    await picker.waitFor({ state: 'detached', timeout: 20_000 })
    await settle(page)
    const inSlot = dinnersIn(w, dayName)
    if (inSlot.length !== 1) throw new Error(`the slot holds ${inSlot.length} entries`)
    if (inSlot[0].recipe_id !== recipeId || inSlot[0].is_leftover) throw new Error('the slot does not hold the picked recipe')
    picked = { w, dayName, date, entry: inSlot[0] }
    return { day: dayName, recipe: inSlot[0].recipe?.title, ...checkCookLeftovers(w, inSlot[0]) }
  })

  await step('picker: swap from a suggestion', async () => {
    if (!picked) throw new Error('nothing was added to swap')
    const { w, dayName } = picked
    await goWeek(w.nextWeek)
    await openSwapFor(picked.entry.id)
    const first = picker.locator('[data-testid="picker-suggestion"]').first()
    if (!(await first.count())) throw new Error('no suggestions to swap in')
    const recipeId = await first.getAttribute('data-recipe-id')
    if (recipeId === picked.entry.recipe_id) throw new Error('suggests the meal being replaced')
    await snap('07-picker-swap')
    await first.click()
    await sheet(page, 'meal-sheet').getByText(/^Swapped in /).waitFor({ timeout: 20_000 })
    await snap('08-swapped')
    await closeSheet(page, 'meal-sheet')
    await settle(page)
    const inSlot = dinnersIn(w, dayName)
    if (inSlot.length !== 1) throw new Error(`the slot holds ${inSlot.length} entries`)
    if (inSlot[0].id !== picked.entry.id) throw new Error('the entry was replaced by a new one instead of updated')
    if (inSlot[0].recipe_id !== recipeId) throw new Error('recipe did not change')
    const before = picked.entry.recipe?.title
    picked = { ...picked, entry: inSlot[0] }
    return { from: before, to: inSlot[0].recipe?.title, ...checkCookLeftovers(w, inSlot[0]) }
  })

  await step('picker: swap from "Choose from my recipes"', async () => {
    if (!picked) throw new Error('nothing was added to swap')
    const { w, dayName, date } = picked
    await goWeek(w.nextWeek)
    await openSwapFor(picked.entry.id)
    await picker.locator('[data-testid="picker-recipes"]').click()
    await page.waitForURL('**/recipes')
    await settle(page)
    const banner = (await page.locator('[data-testid="slot-banner"]').textContent()).trim()
    if (!banner.startsWith('Replacing Dinner on ')) throw new Error(`banner reads "${banner}"`)
    await snap('09-recipes-replacing')
    const current = picked.entry.recipe?.title ?? ''
    const cards = page.locator('a[href^="/recipes/"]')
    const n = await cards.count()
    let target = null
    for (let i = 0; i < n && !target; i++) {
      const text = await cards.nth(i).textContent()
      if (!text.includes(current) && !text.includes('Quick Meal')) target = cards.nth(i)
    }
    if (!target) throw new Error('no other recipe on /recipes')
    await target.click()
    const replace = page.getByRole('button', { name: /^Replace / })
    await replace.waitFor({ timeout: 15_000 })
    // The stepper starts at the picker's servings and can still change.
    const value = page.locator('[data-testid="servings-value"]').first()
    await value.waitFor({ timeout: 15_000 })
    const start = Number((await value.textContent()).trim())
    await page.getByRole('button', { name: 'Increase servings' }).first().click()
    const raised = Number((await value.textContent()).trim())
    if (raised !== start + 1) throw new Error(`the stepper went from ${start} to ${raised}`)
    await page.getByRole('button', { name: 'Decrease servings' }).first().click()
    await snap('13-recipe-servings')
    await replace.click()
    await page.waitForURL((u) => u.pathname === '/dashboard' && u.searchParams.get('day') === date, { timeout: 20_000 })
    await settle(page)
    const inSlot = dinnersIn(w, dayName)
    if (inSlot.length !== 1) throw new Error(`the slot holds ${inSlot.length} entries`)
    if (inSlot[0].id !== picked.entry.id) throw new Error('the entry was replaced by a new one instead of updated')
    if (inSlot[0].recipe_id === picked.entry.recipe_id) throw new Error('recipe did not change')
    if (inSlot[0].servings !== start) throw new Error(`saved ${inSlot[0].servings} servings, the stepper showed ${start}`)
    picked = { ...picked, entry: inSlot[0] }
    return { banner, to: inSlot[0].recipe?.title, recipeServings: inSlot[0].recipe?.servings, stepperStart: start, ...checkCookLeftovers(w, inSlot[0]) }
  })

  // Swapping a cooked meal for something simple frees its leftover days, so
  // "Also add to" offers them. Parsing is stubbed; nothing is saved.
  await step('picker: a swap offers the old meal\'s leftover days in "Also add to"', async () => {
    if (!picked) throw new Error('nothing was added to swap')
    const { w } = picked
    await goWeek(w.nextWeek)
    const leftoverDays = entriesOf(w.nextWeek)
      .filter((e) => e.is_leftover && e.original_entry_id === picked.entry.id)
      .map((e) => e.day_of_week)
    if (!leftoverDays.length) return { note: 'the test dinner has no leftovers in its own week' }
    await openSwapFor(picked.entry.id)
    let offered = []
    await page.route(PARSE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ingredients: STUB_ITEMS }) }))
    try {
      await picker.locator('[data-testid="simple-text"]').fill('2 eggs')
      await picker.locator('[data-testid="simple-parse"]').click()
      const review = picker.locator('[data-testid="simple-review"]')
      await review.waitFor()
      offered = (await review.locator('[role="group"][aria-label^="Also add to"] button').allTextContents()).map((t) => t.trim())
      await snap('14-swap-also-days')
    } finally {
      await page.unroute(PARSE_URL)
    }
    const long = (d) => d[0].toUpperCase() + d.slice(1)
    const missing = leftoverDays.filter((d) => !offered.some((t) => t.endsWith(`(${long(d)})`)))
    if (missing.length) throw new Error(`not offered: ${missing.join(', ')} (offered: ${offered.join(', ') || 'none'})`)
    await closeSheet(page, 'meal-picker')
    await sheet(page, 'meal-sheet').waitFor()
    await closeSheet(page, 'meal-sheet')
    return { leftoverDays: leftoverDays.map((d) => d.slice(0, 3)).join(' '), offered: offered.map((t) => t.replace(/ \(.*\)$/, '')).join(', ') }
  })

  await step('picker: remove the test dinner', async () => {
    if (!picked) return { note: 'nothing to remove' }
    await goWeek(picked.w.nextWeek)
    await openCard(page.locator(`[data-entry-id="${picked.entry.id}"]`))
    const ms = sheet(page, 'meal-sheet')
    await ms.waitFor()
    await ms.getByRole('button', { name: 'Remove from plan' }).click()
    await ms.getByRole('button', { name: 'Remove', exact: true }).click()
    await ms.waitFor({ state: 'detached', timeout: 15_000 })
    await settle(page)
    const left = [...entriesOf(picked.w.nextWeek), ...entriesOf(picked.w.weekAfter)]
      .filter((e) => e.id === picked.entry.id || e.original_entry_id === picked.entry.id)
    if (left.length) throw new Error(`${left.length} entries left behind`)
  })

  let simple = null // { w, slot, days: [dayName], recipe }
  await step('something simple: add with "Also add to" one more day', async () => {
    const w = await weekInfo()
    await goWeek(w.nextWeek)
    // Wednesday, or the first later day with a non-Dinner slot free.
    let slot = null
    let dayName = null
    for (const d of ['wednesday', 'thursday', 'friday']) {
      try {
        slot = await openPickerFor(dateOf(w.nextWeek, d))
        dayName = d
        break
      } catch {
        if (await sheet(page, 'add-meal-sheet').count()) await closeSheet(page, 'add-meal-sheet')
      }
    }
    if (!slot) throw new Error('no free non-Dinner slot next week, Wednesday to Friday')
    await picker.locator('[data-testid="simple-text"]').fill('2 eggs, an English muffin, Greek yogurt, an apple')
    await picker.locator('[data-testid="simple-parse"]').click()
    const review = picker.locator('[data-testid="simple-review"]')
    const failed = picker.locator('[data-testid="simple-entry"] [role="alert"]')
    await Promise.race([review.waitFor({ timeout: 60_000 }), failed.waitFor({ timeout: 60_000 })])
    // The real parse comes first. Only when the account has used its 20 a day
    // does the step go on with a stubbed parse (and says so in its result).
    let parse = 'real'
    if (await failed.count()) {
      const message = (await failed.textContent()).trim()
      if (!/daily limit/i.test(message)) throw new Error(`parse failed: ${message}`)
      parse = 'stubbed (the account reached its daily parse limit)'
      await page.route(PARSE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ingredients: STUB_MEAL }) }))
      try {
        await failed.getByRole('button', { name: 'Try again' }).click()
        await review.waitFor({ timeout: 15_000 })
      } finally {
        await page.unroute(PARSE_URL)
      }
    }
    const items = await review.locator('[data-testid="simple-item"]').count()
    const total = (await review.locator('[data-testid="simple-total"]').textContent()).trim()
    const cal = Number(total.match(/(\d+) cal/)?.[1] ?? 0)
    if (!items) throw new Error('no items parsed')
    if (!(cal > 0)) throw new Error(`total reads "${total}"`)
    const chips = review.locator('[role="group"][aria-label^="Also add to"] button')
    if (!(await chips.count())) throw new Error(`no other free ${slot} to also add to`)
    const alsoLabel = (await chips.first().textContent()).trim()
    await chips.first().click()
    await page.waitForTimeout(250) // colors fade over 150ms (src/index.css)
    await snap('10-simple-parsed')
    const title = await review.locator('[data-testid="simple-title"]').inputValue()
    await picker.locator('[data-testid="simple-submit"]').click()
    await picker.waitFor({ state: 'detached', timeout: 20_000 })
    await settle(page)
    const created = data.createdRecipes.find((r) => r.recipe_type === 'quick' && r.title === title)
    if (!created) throw new Error('no quick meal row was created')
    if (created.status !== 'draft') throw new Error(`quick meal saved with status "${created.status}" (should be private)`)
    const entries = entriesOf(w.nextWeek).filter((e) => e.recipe_id === created.id)
    if (entries.length !== 2) throw new Error(`${entries.length} entries use the quick meal, expected 2`)
    if (entries.some((e) => e.is_leftover || e.servings !== 1)) throw new Error('quick meal entries should be servings 1, no leftovers')
    if (entriesOf(w.nextWeek).some((e) => entries.some((q) => q.id === e.original_entry_id))) throw new Error('a quick meal got leftovers')
    for (const e of entries) {
      const card = page.locator(`[data-entry-id="${e.id}"]`)
      if ((await card.getAttribute('data-quick')) !== 'true' || !(await card.locator('[data-testid="quick-tag"]').count())) {
        throw new Error(`${e.day_of_week}'s card has no Quick tag`)
      }
    }
    simple = { w, slot, recipe: created, entries }
    return { slot, days: entries.map((e) => e.day_of_week.slice(0, 3)).join(' + '), also: alsoLabel, items, total, status: created.status, parse }
  })

  await step('something simple: edit updates every day it is planned', async () => {
    if (!simple) throw new Error('no quick meal to edit')
    await goWeek(simple.w.nextWeek)
    await openCard(page.locator(`[data-entry-id="${simple.entries[0].id}"]`))
    const ms = sheet(page, 'meal-sheet')
    await ms.waitFor()
    if (!(await ms.locator('[data-testid="quick-items"] li').count())) throw new Error('the meal sheet lists no items')
    await snap('11-quick-meal-sheet')
    await ms.getByRole('button', { name: 'Edit' }).click()
    const review = picker.locator('[data-testid="simple-review"]')
    await review.waitFor()
    await picker.getByText('It’s planned 2 times. Saving updates all 2.').waitFor({ timeout: 10_000 })
    const title = `${simple.recipe.title} (edited)`
    await review.locator('[data-testid="simple-title"]').fill(title)
    await snap('12-simple-edit')
    await picker.locator('[data-testid="simple-submit"]').click()
    await sheet(page, 'meal-sheet').getByText('Saved. Updated all 2 times it’s planned.').waitFor({ timeout: 20_000 })
    await closeSheet(page, 'meal-sheet')
    await settle(page)
    const entries = entriesOf(simple.w.nextWeek).filter((e) => e.recipe_id === simple.recipe.id)
    if (entries.length !== 2) throw new Error(`${entries.length} entries use the quick meal after editing`)
    const stale = entries.filter((e) => e.recipe?.title !== title)
    if (stale.length) throw new Error(`${stale.length} entries still show the old name`)
    for (const e of entries) {
      const shown = (await page.locator(`[data-entry-id="${e.id}"] button[aria-label$="Open details"]`).first().textContent()).trim()
      if (shown !== title) throw new Error(`${e.day_of_week}'s card reads "${shown}"`)
    }
    return { title }
  })

  await step('something simple: remove both', async () => {
    if (!simple) return { note: 'nothing to remove' }
    await goWeek(simple.w.nextWeek)
    for (const e of simple.entries) {
      await openCard(page.locator(`[data-entry-id="${e.id}"]`))
      const ms = sheet(page, 'meal-sheet')
      await ms.waitFor()
      await ms.getByRole('button', { name: 'Remove from plan' }).click()
      await ms.getByRole('button', { name: 'Remove', exact: true }).click()
      await ms.waitFor({ state: 'detached', timeout: 15_000 })
      await settle(page)
    }
    const left = entriesOf(simple.w.nextWeek).filter((e) => e.recipe_id === simple.recipe.id)
    if (left.length) throw new Error(`${left.length} quick meal entries left`)
  })

  // ── Shopping list, this week (the account's own list and size choices).
  const shoppingReady = async () => {
    await page.goto('/shopping')
    await settle(page)
    await page.locator('[data-testid="shopping-row"], [data-testid="have-section"]').first().waitFor({ timeout: 20_000 })
  }
  const listSaved = () => page.waitForResponse(
    (r) => r.url().includes('/rest/v1/shopping_lists') && ['PATCH', 'POST'].includes(r.request().method()) && r.ok(),
    { timeout: 15_000 },
  )
  const mainRow = (key) => page.locator(`[data-testid="shopping-row"][data-key="${key}"]`)
  const haveRow = (key) => page.locator(`[data-testid="have-row"][data-key="${key}"]`)
  const expandHave = async () => {
    const toggle = page.locator('[data-testid="have-toggle"]')
    if (!(await toggle.count())) return false
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    return true
  }
  const itemSheet = sheet(page, 'shopping-item-sheet')
  const openItem = async (row) => {
    await row.locator('[data-testid="shopping-qty"]').click()
    await itemSheet.waitFor()
  }
  const staples = new Set(PACKAGE_ENTRIES.filter((e) => e.staple).map((e) => e.id))
  const severalSizes = new Set(PACKAGE_ENTRIES.filter((e) => e.sizes.length >= 2).map((e) => e.id))
  const rowKeys = async () => page.locator('[data-testid="shopping-row"]').evaluateAll((els) => els.map((e) => e.dataset.key).filter(Boolean))

  // The first unchecked row, as a locator that survives reloads (by key, or by name).
  const uncheckedRow = async () => {
    const rows = page.locator('[data-testid="shopping-row"]')
    const n = await rows.count()
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i)
      if (await row.locator('[role="checkbox"]').isChecked()) continue
      const key = await row.getAttribute('data-key')
      const name = (await row.locator('[data-testid="shopping-toggle"]').textContent()).trim()
      const target = () => (key ? mainRow(key) : rows.filter({ hasText: name }).first())
      return { name, target, isChecked: () => target().locator('[role="checkbox"]').isChecked() }
    }
    throw new Error('every item on this week\'s list is checked')
  }
  // Leaves the item unchecked (after a reload), whatever a step did.
  const ensureUnchecked = async (item) => {
    await shoppingReady()
    if ((await item.target().count()) && (await item.isChecked())) {
      const saved = listSaved()
      await item.target().locator('[data-testid="shopping-toggle"]').click()
      await saved
    }
  }

  // Bought (checked) is remembered on reload and when coming back to the page
  // in the app (the saved list used to come from a 5-minute cache).
  await step('shopping: a checked item stays checked, then is unchecked', async () => {
    await shoppingReady()
    const item = await uncheckedRow()
    const { name, target, isChecked } = item
    try {
      let saved = listSaved()
      await target().locator('[data-testid="shopping-toggle"]').click()
      await saved
      if (!(await isChecked())) throw new Error('did not check')
      await (await navLink(page, 'Week')).click()
      await page.waitForURL('**/dashboard')
      await settle(page)
      await (await navLink(page, 'List')).click()
      await page.waitForURL('**/shopping')
      await settle(page)
      await target().waitFor({ timeout: 20_000 })
      if (!(await isChecked())) throw new Error('unchecked after going to Week and back')
      await shoppingReady()
      if (!(await isChecked())) throw new Error('unchecked after a reload')
      saved = listSaved()
      await target().locator('[data-testid="shopping-toggle"]').click()
      await saved
      await shoppingReady()
      if (await isChecked()) throw new Error('still checked after unchecking and a reload')
      return { item: name }
    } catch (err) {
      await ensureUnchecked(item).catch(() => {})
      throw err
    }
  })

  // Coming back to the list shows the cached copy at once while the saved list
  // is read fresh. A tap made before that read lands is kept and applied on top
  // of it, then saved (nothing is saved from the cached copy).
  await step('shopping: a tap before the fresh read lands is kept', async () => {
    const LIST = (url) => url.pathname.endsWith('/rest/v1/shopping_lists')
    let reads = 0
    let savesBeforeRead = 0
    let readLanded = false
    const slowRead = async (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        reads++
        const response = await route.fetch()
        await new Promise((r) => setTimeout(r, 2000))
        await route.fulfill({ response })
        readLanded = true
        return
      }
      if (!readLanded) savesBeforeRead++
      await route.continue()
    }
    await shoppingReady()
    const item = await uncheckedRow()
    const { name, target, isChecked } = item
    try {
      await (await navLink(page, 'Week')).click()
      await page.waitForURL('**/dashboard')
      await settle(page)
      await page.route(LIST, slowRead)
      const read = page.waitForResponse((r) => LIST(new URL(r.url())) && r.request().method() === 'GET', { timeout: 15_000 })
      await (await navLink(page, 'List')).click()
      await page.waitForURL('**/shopping')
      // The cached list is there before the read lands; tap at once.
      await target().waitFor({ timeout: 1500 })
      if (readLanded) throw new Error('the read landed before the cached list showed')
      await target().locator('[data-testid="shopping-toggle"]').click()
      if (!(await isChecked())) throw new Error('not checked right after the tap')
      await read
      await page.waitForTimeout(300)
      if (!(await isChecked())) throw new Error('unchecked once the fresh read landed')
      if (savesBeforeRead) throw new Error(`${savesBeforeRead} save(s) went out before the fresh read landed`)
      await listSaved()
      await page.unroute(LIST, slowRead)
      await shoppingReady()
      if (!(await isChecked())) throw new Error('unchecked after a reload')
      await ensureUnchecked(item)
      await shoppingReady()
      if (await isChecked()) throw new Error('still checked after unchecking and a reload')
      return { item: name, readDelay: '2 s', reads }
    } catch (err) {
      await page.unroute(LIST, slowRead).catch(() => {})
      await ensureUnchecked(item).catch(() => {})
      throw err
    }
  })

  // A slow connection: reading the saved list takes 2 s to come back (the
  // server answers at once; the answer arrives late). Check an item and leave
  // at once (its save is still waiting), come back: the list must show it
  // checked once the read lands, never regenerate from what the server had
  // before that save.
  await step('shopping: checked survives a slow read after leaving at once', async () => {
    const LIST = (url) => url.pathname.endsWith('/rest/v1/shopping_lists')
    const slowRead = async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const response = await route.fetch()
      await new Promise((r) => setTimeout(r, 2000))
      await route.fulfill({ response })
    }
    await shoppingReady()
    const item = await uncheckedRow()
    const { name, target, isChecked } = item
    await page.route(LIST, slowRead)
    try {
      await target().locator('[data-testid="shopping-toggle"]').click()
      // Straight to Week, before the 500 ms save would have fired.
      await (await navLink(page, 'Week')).click()
      await page.waitForURL('**/dashboard')
      const read = page.waitForResponse((r) => LIST(new URL(r.url())) && r.request().method() === 'GET', { timeout: 15_000 })
      await (await navLink(page, 'List')).click()
      await page.waitForURL('**/shopping')
      // Before the read lands the item is not shown unchecked.
      await page.waitForTimeout(800)
      if ((await target().count()) && !(await isChecked())) throw new Error('shown unchecked while the read was still pending')
      await read
      await target().waitFor({ timeout: 15_000 })
      if (!(await isChecked())) throw new Error('unchecked once the delayed read landed')
      await shoppingReady()
      if (!(await isChecked())) throw new Error('unchecked after a reload')
      const saved = listSaved()
      await target().locator('[data-testid="shopping-toggle"]').click()
      await saved
    } catch (err) {
      await page.unroute(LIST, slowRead)
      await ensureUnchecked(item).catch(() => {})
      throw err
    }
    await page.unroute(LIST, slowRead)
    await shoppingReady()
    if (await isChecked()) {
      await ensureUnchecked(item)
      throw new Error('still checked after unchecking and a reload')
    }
    return { item: name, readDelay: '2 s' }
  })

  // Quick taps in one group on a phone (touch, iPhone viewport), with saves
  // that take 1.5 s to come back: every tap counts at once, the group's
  // "remaining" drops by as many, and nothing unchecks when the saves land or
  // after a reload. Then each is unchecked again, the next tap landing just as
  // the previous save comes back.
  await step('shopping: quick taps in a group, with slow saves', async () => {
    const LIST = (url) => url.pathname.endsWith('/rest/v1/shopping_lists')
    let release = null // resolves the held save response
    let saves = 0
    let saveSent = null
    const slowSave = async (route) => {
      const method = route.request().method()
      if (method !== 'PATCH' && method !== 'POST') return route.continue()
      saves++
      const response = await route.fetch()
      saveSent?.()
      await Promise.race([new Promise((r) => setTimeout(r, 1500)), new Promise((r) => { release = r })])
      await route.fulfill({ response })
    }
    await shoppingReady()
    // The group with the most unchecked items.
    const groups = page.locator('[data-testid="shopping-category"]')
    let group = null
    let best = 0
    for (let i = 0; i < (await groups.count()); i++) {
      const g = groups.nth(i)
      const n = await g.locator('[data-testid="shopping-row"]:has([role="checkbox"][aria-checked="false"])').count()
      if (n > best) { best = n; group = g }
    }
    if (!group || best < 2) throw new Error('no group with two or more unchecked items')
    const category = await group.getAttribute('data-category')
    const groupLocator = () => page.locator(`[data-testid="shopping-category"][data-category="${category}"]`)
    const remaining = async () => Number(((await groupLocator().locator('[data-testid="remaining-count"]').textContent()) || '').match(/\d+/)?.[0])
    const rows = groupLocator().locator('[data-testid="shopping-row"]')
    const keys = await rows.evaluateAll((els) => els.filter((e) => e.querySelector('[role="checkbox"]').getAttribute('aria-checked') !== 'true').map((e) => e.dataset.key || e.textContent))
    const row = (k) => groupLocator().locator(`[data-testid="shopping-row"][data-key="${k}"]`)
    const checked = (k) => row(k).locator('[role="checkbox"]').isChecked()
    if (keys.some((k) => !k || k.includes(' '))) throw new Error(`a row in ${category} has no package key`)
    const tapped = []
    // Where everything sits: the scroll position, every row, every group
    // header and the page header. A tap mustn't move any of it.
    const layout = () => page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.top + window.scrollY), Math.round(r.height)] }
      return {
        scrollY: Math.round(window.scrollY),
        rows: [...document.querySelectorAll('[data-testid="shopping-row"]')].map(box),
        groups: [...document.querySelectorAll('[data-testid="shopping-category"] > div:first-child')].map(box),
        header: [...document.querySelectorAll('p')].filter((p) => /^(Week of|Cooking for|Meals this week)/.test(p.textContent.trim())).map(box),
      }
    })
    const moved = (a, b) => JSON.stringify(a) !== JSON.stringify(b)
    const firstMove = (now, was) => {
      for (const part of ['rows', 'groups', 'header']) {
        for (let i = 0; i < Math.max(now[part].length, was[part].length); i++) {
          if (JSON.stringify(now[part][i]) !== JSON.stringify(was[part][i])) return `${part} ${i + 1}: [top, height] ${JSON.stringify(was[part][i])} → ${JSON.stringify(now[part][i])}`
        }
      }
      return ''
    }
    await page.route(LIST, slowSave)
    try {
      const before = await remaining()
      // In the middle of the screen, clear of the floating nav, so no tap needs a scroll.
      await groupLocator().evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(300)
      const still = await layout()
      if (!still.header.length || !still.rows.length) throw new Error('nothing to measure')
      for (const k of keys) {
        await row(k).locator('[data-testid="shopping-toggle"]').tap()
        tapped.push(k)
        if (!(await checked(k))) throw new Error(`${k} wasn't checked right after its tap`)
        const now = await layout()
        if (now.scrollY !== still.scrollY) throw new Error(`the page scrolled from ${still.scrollY} to ${now.scrollY} on tapping ${k}`)
        if (moved(now.rows, still.rows) || moved(now.groups, still.groups) || moved(now.header, still.header)) throw new Error(`moved on tapping ${k}: ${firstMove(now, still)}`)
        await page.waitForTimeout(150)
      }
      const after = await remaining()
      if (after !== before - keys.length) throw new Error(`${category} remaining went ${before} → ${after} after ${keys.length} taps`)
      // Let the (held) saves land, then look again.
      await page.waitForTimeout(3500)
      const dropped = []
      for (const k of keys) if (!(await checked(k))) dropped.push(k)
      if (dropped.length) throw new Error(`unchecked once the saves landed: ${dropped.join(', ')}`)
      await shoppingReady()
      const lost = []
      for (const k of keys) if (!(await checked(k))) lost.push(k)
      if (lost.length) throw new Error(`unchecked after a reload: ${lost.join(', ')}`)

      // Uncheck each, tapping the next one the moment the previous save lands.
      for (let i = 0; i < keys.length; i++) {
        const sent = new Promise((r) => { saveSent = r })
        await row(keys[i]).locator('[data-testid="shopping-toggle"]').tap()
        if (await checked(keys[i])) throw new Error(`${keys[i]} still checked right after its tap`)
        await sent
        saveSent = null
        if (i + 1 < keys.length) {
          await Promise.all([Promise.resolve().then(() => release?.()), row(keys[i + 1]).locator('[data-testid="shopping-toggle"]').tap()])
          if (await checked(keys[i + 1])) throw new Error(`${keys[i + 1]} didn't uncheck when tapped as a save landed`)
          i++
          const sentNext = new Promise((r) => { saveSent = r })
          await sentNext
          saveSent = null
          release?.()
        } else {
          release?.()
        }
      }
      await page.waitForTimeout(3500)
      const stuck = []
      for (const k of keys) if (await checked(k)) stuck.push(k)
      if (stuck.length) throw new Error(`checked again once the saves landed: ${stuck.join(', ')}`)
    } finally {
      await page.unroute(LIST, slowSave)
      // The account ends with all of them unchecked.
      await shoppingReady()
      for (const k of tapped) {
        if (await row(k).count() && await checked(k)) {
          const saved = listSaved()
          await row(k).locator('[data-testid="shopping-toggle"]').tap()
          await saved
        }
      }
    }
    await shoppingReady()
    const left = []
    for (const k of keys) if (await checked(k)) left.push(k)
    if (left.length) throw new Error(`still checked after unchecking and a reload: ${left.join(', ')}`)
    return { category, taps: keys.length, saves, layout: 'no scroll, rows and headers in place' }
  })

  // Keyboard: Space and Enter toggle the row's button, with a visible focus
  // ring.
  await step('shopping: Space and Enter toggle a row', async () => {
    await shoppingReady()
    const item = await uncheckedRow()
    const toggle = item.target().locator('[data-testid="shopping-toggle"]')
    try {
      await toggle.focus()
      await page.keyboard.press('Space')
      if (!(await item.isChecked())) throw new Error('Space did not check it')
      const ring = await toggle.evaluate((el) => ({
        focusVisible: el.matches(':focus-visible'),
        shadow: getComputedStyle(el.querySelector('span[aria-hidden="true"]')).boxShadow,
      }))
      if (!ring.focusVisible || !ring.shadow || ring.shadow === 'none') throw new Error(`no visible focus ring (${JSON.stringify(ring)})`)
      const saved = listSaved()
      await page.keyboard.press('Enter')
      if (await item.isChecked()) throw new Error('Enter did not uncheck it')
      await saved.catch(() => {})
      await shoppingReady()
      if (await item.isChecked()) throw new Error('checked after a reload')
      return { item: item.name }
    } catch (err) {
      await ensureUnchecked(item).catch(() => {})
      throw err
    }
  })

  await step('shopping: move an item to Already have and back', async () => {
    await shoppingReady()
    const key = (await rowKeys()).find((k) => !staples.has(k))
    if (!key) throw new Error('no non-staple item with a package entry on this week\'s list')
    const name = (await mainRow(key).locator('[data-testid="shopping-toggle"]').textContent()).trim()
    await openItem(mainRow(key))
    let saved = listSaved()
    await itemSheet.getByRole('button', { name: 'I already have this' }).click()
    await itemSheet.waitFor({ state: 'detached' })
    await saved
    if (await mainRow(key).count()) throw new Error('still in the list after "I already have this"')
    await expandHave()
    if (!(await haveRow(key).count())) throw new Error('not in Already have')
    await shoppingReady()
    await expandHave()
    if (!(await haveRow(key).count())) throw new Error('not in Already have after a reload')
    await snap('15-shopping-already-have')
    await openItem(haveRow(key))
    saved = listSaved()
    await itemSheet.getByRole('button', { name: 'I need this' }).click()
    await itemSheet.waitFor({ state: 'detached' })
    await saved
    await shoppingReady()
    if (!(await mainRow(key).count())) throw new Error('not back in the list after "I need this" and a reload')
    return { item: name, key }
  })

  // Checking a line records what was bought on it. When its only meal is
  // removed the line hides (not shown, counted or copied) but stays in the
  // saved list, checked, with that record; with the meal back it shows
  // checked again. The meal goes through its sheet and comes back as the same
  // rows (REST, the account's own); the line ends unchecked.
  await step('shopping: a checked line keeps what was bought when its meal goes', async () => {
    const { url, headers, userId } = await restSession(page)
    await shoppingReady()
    const w = await weekInfo()
    const planId = data.plansByWeek[w.thisWeek]
    if (!planId) throw new Error('this week\'s plan was not read')
    // JSON compared with sorted keys (Postgres returns JSONB keys in its own order).
    const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
      : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
        : JSON.stringify(v ?? null))
    const savedItems = async () => {
      const res = await page.request.get(`${url}/rest/v1/shopping_lists?select=id,items&user_id=eq.${userId}&meal_plan_id=eq.${planId}`, { headers })
      if (!res.ok()) throw new Error(`reading the saved list: HTTP ${res.status()}`)
      const lists = await res.json()
      if (lists.length !== 1) throw new Error(`${lists.length} saved lists for this week`)
      return lists[0].items
    }
    const savedItem = async (key) => (await savedItems()).find((i) => i.key === key) ?? null

    // A line only one meal (one cook, by recipe title) needs.
    const cooks = currentEntries(w).filter((e) => !e.is_leftover && e.recipe)
    const cooksOf = (title) => cooks.filter((e) => e.recipe.title === title)
    const shown = new Set(await rowKeys())
    const item = (await savedItems()).find((i) => i.key && shown.has(i.key) && !i.checked && !i.have && !i.hidden
      && i.meals?.length === 1 && cooksOf(i.meals[0]).length === 1)
    if (!item) throw new Error('no line on this week\'s list that only one meal needs')
    const key = item.key
    const cook = cooksOf(item.meals[0])[0]
    const want = { package: item.package ?? null, need: item.need ?? null, needUnit: item.needUnit ?? null, on: w.today }

    // The meal and its leftovers as stored, to put back exactly (cook first).
    const rowsRes = await page.request.get(`${url}/rest/v1/meal_plan_entries?select=*&or=(id.eq.${cook.id},original_entry_id.eq.${cook.id})`, { headers })
    if (!rowsRes.ok()) throw new Error(`reading the meal's rows: HTTP ${rowsRes.status()}`)
    const stored = (await rowsRes.json()).sort((a, b) => Number(a.is_leftover) - Number(b.is_leftover))
    const putBack = async () => {
      const ids = stored.map((r) => r.id)
      const there = await (await page.request.get(`${url}/rest/v1/meal_plan_entries?select=id&id=in.(${ids.join(',')})`, { headers })).json()
      const missing = stored.filter((r) => !there.some((t) => t.id === r.id))
      for (const r of missing) {
        const res = await page.request.post(`${url}/rest/v1/meal_plan_entries`, { headers, data: r })
        if (!res.ok()) throw new Error(`putting back ${r.day_of_week}: HTTP ${res.status()}`)
      }
      return missing.length
    }

    const row = mainRow(key)
    const isChecked = () => row.locator('[role="checkbox"]').isChecked()
    let removed = false
    try {
      // Check it: the saved item has bought, and the event goes out.
      const since = analyticsEvents(page).length
      let saved = listSaved()
      await row.locator('[data-testid="shopping-toggle"]').click()
      await saved
      const sent = await waitForEvent(page, 'shopping_item_checked', { since, match: (p) => p.key === key && p.checked === true })
      const checked = await savedItem(key)
      if (!checked?.checked || stable(checked.bought) !== stable(want)) {
        throw new Error(`saved after checking: checked ${checked?.checked}, bought ${JSON.stringify(checked?.bought)}`)
      }

      // Remove its meal through the meal sheet (its leftovers go too).
      await reload()
      await openCard(page.locator(`[data-entry-id="${cook.id}"]`))
      const ms = sheet(page, 'meal-sheet')
      await ms.waitFor()
      await ms.getByRole('button', { name: 'Remove from plan' }).click()
      await ms.getByRole('button', { name: 'Remove', exact: true }).click()
      await ms.waitFor({ state: 'detached', timeout: 15_000 })
      removed = true
      await settle(page)

      // The list rebuilds without the meal: the line is hidden, not counted, not copied.
      saved = listSaved()
      await shoppingReady()
      await saved
      if (await row.count()) throw new Error('the line still shows after its meal was removed')
      if ((await expandHave()) && (await haveRow(key).count())) throw new Error('the line shows in Already have')
      const groups = await page.locator('[data-testid="shopping-category"]').evaluateAll((els) => els.map((g) => ({
        category: g.dataset.category,
        remaining: Number(g.querySelector('[data-testid="remaining-count"]').textContent.match(/\d+/)?.[0]),
        unchecked: g.querySelectorAll('[data-testid="shopping-row"] [role="checkbox"][aria-checked="false"]').length,
      })))
      const off = groups.find((g) => g.remaining !== g.unchecked)
      if (off) throw new Error(`${off.category} says ${off.remaining} remaining for ${off.unchecked} unchecked rows`)
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
      await page.getByRole('button', { name: 'Copy shopping list' }).click()
      await page.getByText(/^Copied \d+ items?$/).waitFor()
      const lines = (await page.evaluate(() => navigator.clipboard.readText())).split('\n').filter((l) => l.startsWith('- '))
      const rows = await page.locator('[data-testid="shopping-row"]').count()
      if (lines.length !== rows) throw new Error(`copied ${lines.length} lines for ${rows} rows`)
      const lower = `- ${String(item.name).toLowerCase()}`
      if (lines.some((l) => l.toLowerCase() === lower || l.toLowerCase().startsWith(`${lower},`))) throw new Error(`copied the hidden line "${item.name}"`)
      const hidden = await savedItem(key)
      if (!hidden?.hidden || !hidden.checked || stable(hidden.bought) !== stable(want)) {
        throw new Error(`saved after the meal went: hidden ${hidden?.hidden}, checked ${hidden?.checked}, bought ${JSON.stringify(hidden?.bought)}`)
      }

      // Put the meal back: the line returns, still checked, with the same record.
      await putBack()
      removed = false
      saved = listSaved()
      await shoppingReady()
      await saved
      await row.waitFor({ timeout: 15_000 })
      if (!(await isChecked())) throw new Error('the line came back unchecked')
      const back = await savedItem(key)
      if (back?.hidden || !back?.checked || stable(back.bought) !== stable(want)) {
        throw new Error(`saved with the meal back: hidden ${back?.hidden}, checked ${back?.checked}, bought ${JSON.stringify(back?.bought)}`)
      }

      // Unchecking removes the record.
      saved = listSaved()
      await row.locator('[data-testid="shopping-toggle"]').click()
      await saved
      const unchecked = await savedItem(key)
      if (unchecked?.checked || unchecked?.bought !== undefined) throw new Error(`saved after unchecking: checked ${unchecked?.checked}, bought ${JSON.stringify(unchecked?.bought)}`)
      return {
        item: item.name,
        key,
        meal: `${cook.day_of_week} ${cook.recipe.title}`,
        bought: `${want.package?.text ?? 'no package'} for ${want.need} ${want.needUnit ?? ''}, on ${want.on}`.replace(/ +,/, ','),
        hiddenThenBack: 'yes',
        analytics: `shopping_item_checked (key ${sent.key}, checked ${sent.checked})`,
        savedWhenHidden: hidden,
      }
    } finally {
      // The account ends with the meal in place and the line unchecked.
      if (removed) {
        const n = await putBack().catch((err) => { console.log(`[flows] putting the meal back failed: ${err.message}`); return 0 })
        if (n) console.log(`[flows] put back ${n} meal row(s)`)
      }
      await shoppingReady().catch(() => {})
      if ((await row.count()) && (await isChecked())) {
        const saved = listSaved()
        await row.locator('[data-testid="shopping-toggle"]').click()
        await saved.catch(() => {})
      }
    }
  })

  await step('shopping: a size choice is remembered, then set back to the default', async () => {
    await shoppingReady()
    const key = (await rowKeys()).find((k) => severalSizes.has(k))
    if (!key) throw new Error('no item on this week\'s list is sold in more than one size')
    const name = (await mainRow(key).locator('[data-testid="shopping-toggle"]').textContent()).trim()
    const options = itemSheet.locator('[data-testid="package-option"]')
    const selectedTitle = async () => (await itemSheet.locator('[data-testid="package-option"][data-selected="true"] .font-bold').textContent()).trim()
    try {
      await openItem(mainRow(key))
      if ((await selectedTitle()) !== 'Smallest that fits') throw new Error(`starts on "${await selectedTitle()}", not the default`)
      const before = (await mainRow(key).locator('[data-testid="shopping-qty"]').textContent()).trim()
      // The first size that isn't the one smallest-that-fits picks.
      const n = await options.count()
      let pick = null
      for (let i = 1; i < n && !pick; i++) {
        const label = (await options.nth(i).locator('.font-bold').textContent()).trim()
        if (!before.endsWith(label)) pick = { i, label }
      }
      if (!pick) throw new Error('every size gives the same package')
      await options.nth(pick.i).click()
      await itemSheet.locator('[data-testid="package-option"][data-selected="true"]').filter({ hasText: pick.label }).waitFor({ timeout: 15_000 })
      await closeSheet(page, 'shopping-item-sheet')
      const after = (await mainRow(key).locator('[data-testid="shopping-qty"]').textContent()).trim()
      if (!after.includes(pick.label)) throw new Error(`the line reads "${after}" after choosing ${pick.label}`)
      await shoppingReady()
      const reloaded = (await mainRow(key).locator('[data-testid="shopping-qty"]').textContent()).trim()
      if (reloaded !== after) throw new Error(`after a reload the line reads "${reloaded}", not "${after}"`)
      await openItem(mainRow(key))
      if ((await selectedTitle()) !== pick.label) throw new Error(`after a reload "${await selectedTitle()}" is in use, not ${pick.label}`)
      await snap('16-shopping-size-chosen')
      await options.first().click()
      await itemSheet.locator('[data-testid="package-option"][data-selected="true"]').filter({ hasText: 'Smallest that fits' }).waitFor({ timeout: 15_000 })
      await closeSheet(page, 'shopping-item-sheet')
      const reset = (await mainRow(key).locator('[data-testid="shopping-qty"]').textContent()).trim()
      if (reset !== before) throw new Error(`back on the default the line reads "${reset}", not "${before}"`)
      return { item: name, key, smallestThatFits: before, chosen: after }
    } finally {
      // The account ends with no stored choice, whatever happened above.
      const left = await deleteOwnSizeChoice(page, key)
      if (left) console.log(`[flows] removed a leftover size choice for ${key}`)
    }
  })

  // ── What's on hand (step 5b). First the account as it is: every card shows
  // the reason src/v2/lib/onHand.js works out from its rows (read through
  // REST), and none when nothing is on hand. Then a fixture, with the
  // account's own rows: a meal last Saturday and last week's saved list built
  // from that week's meals with generateShoppingItems (the fixture's fresh
  // line checked as bought that Saturday, so it keeps through this Saturday),
  // and the same recipe again in a free slot from today on. The recipe and
  // line are chosen by running onHand.js on those rows, so it holds on any
  // day; the expected reason comes from the rows as written. Checked on the
  // card, in the sheet (On hand list, Still need) and in the desktop popover.
  // Then "How much is left?" (step 5c) on the same meal: the selected answer
  // saves nothing, another one is saved at once, and "Used up" takes items
  // off until the reason and marker go. Everything is put back: the meals by
  // id, last week's list as it was, the run's corrections by key and day.
  let fixturePut = null
  await step('on hand: a real reason from last week\'s list (fixture)', async () => {
    const { url, headers, userId } = await restSession(page)
    const rest = async (method, pathAndQuery, data) => {
      const res = await page.request[method](`${url}/rest/v1/${pathAndQuery}`, { headers, ...(data !== undefined ? { data } : {}) })
      if (!res.ok()) throw new Error(`${method.toUpperCase()} ${pathAndQuery.split('?')[0]}: HTTP ${res.status()}`)
      const text = await res.text()
      return text ? JSON.parse(text) : null
    }
    const w = await browserWeek(page)
    const expectThisWeek = (rows) => expectedRollovers(page, { weekStart: w.thisWeek, thisWeek: w.thisWeek, today: w.today, rows })

    // The account as it is (read-only).
    await reload()
    const asIs = await checkRollovers(page, (await expectThisWeek()).rollovers)

    // The rows the fixture touches.
    const rows = await readOnHandRows(page, w.thisWeek)
    const lastPlan = rows.plans.find((p) => p.week_start_date === w.lastWeek)
    const thisPlan = rows.plans.find((p) => p.week_start_date === w.thisWeek)
    if (!lastPlan || !thisPlan) throw new Error('last week or this week has no meal plan row')
    const lastList = rows.lists.find((l) => l.meal_plan_id === lastPlan.id) ?? null
    const lastSaturday = addDays(w.lastWeek, 6)
    const SLOTS = ['Lunch', 'Snack', 'Breakfast']
    const taken = (plan, day, slot) => plan.entries.some((e) => e.day_of_week === day && String(e.meal_type).toLowerCase() === slot.toLowerCase())
    const lastSlot = SLOTS.find((s) => !taken(lastPlan, 'saturday', s))
    let target = null
    for (const day of DAYS.slice(w.todayIdx)) {
      const slot = SLOTS.find((s) => !taken(thisPlan, day, s))
      if (slot) { target = { day, slot }; break }
    }
    if (!lastSlot || !target) throw new Error('no free slot last Saturday or from today on for the fixture')

    // Choose: the first library recipe and fresh line (keeps 7–14 days) for
    // which the meal from today on earns a reason naming it.
    const library = (await restGet(page, 'recipes?select=id,title,servings,ingredients,recipe_type&status=eq.published&order=title.asc'))
      .filter((r) => r.recipe_type !== 'quick')
    const fixtureFor = (recipe, key) => {
      const lastEntry = { id: 'fixture-last', day_of_week: 'saturday', meal_type: lastSlot, is_leftover: false, original_entry_id: null, servings: recipe.servings, recipe }
      const targetEntry = { id: 'fixture-target', day_of_week: target.day, meal_type: target.slot, is_leftover: false, original_entry_id: null, servings: recipe.servings, recipe }
      const lastCooks = [...lastPlan.entries.filter((e) => !e.is_leftover && e.recipe), lastEntry]
      const items = generateShoppingItems(lastCooks).map((i) => (i.key === key && i.package
        ? { ...i, checked: true, bought: { package: i.package, need: i.need, needUnit: i.needUnit, on: lastSaturday } }
        : i))
      return { lastEntry, targetEntry, items }
    }
    const listCreatedAt = new Date(`${lastSaturday}T12:00:00`).toISOString()
    const withFixture = (fx) => ({
      ...rows,
      lists: [
        ...rows.lists.filter((l) => l.meal_plan_id !== lastPlan.id),
        { ...(lastList ?? { id: 'fixture-list', created_at: listCreatedAt }), meal_plan_id: lastPlan.id, items: fx.items, meal_plan: { week_start_date: w.lastWeek } },
      ],
      plans: rows.plans.map((p) => {
        if (p.id === lastPlan.id) return { ...p, entries: [...p.entries, fx.lastEntry] }
        if (p.id === thisPlan.id) return { ...p, entries: [...p.entries, fx.targetEntry] }
        return p
      }),
    })
    let chosen = null
    for (const recipe of library) {
      const keys = [...new Set(parseRecipeIngredientsJsonb(recipe)
        .map((ing) => findLineEntry(ing.name, ing.unit, { notes: ing.notes })?.entry)
        .filter((e) => e && !e.staple && !e.skip && e.keeps >= 7 && e.keeps <= 14)
        .map((e) => e.id))]
      for (const key of keys) {
        const fx = fixtureFor(recipe, key)
        if (!fx.items.some((i) => i.key === key && i.package)) continue
        const { rollovers } = await expectThisWeek(withFixture(fx))
        if (rollovers['fixture-target']?.items.some((i) => i.key === key)) { chosen = { recipe, key, fx }; break }
      }
      if (chosen) break
    }
    if (!chosen) throw new Error('no library recipe leaves something fresh that a meal from today on would use')

    const put = { entryIds: [], listId: null, lastListId: lastList?.id ?? null, listItems: lastList ? JSON.parse(JSON.stringify(lastList.items)) : null, answered: new Set(), answeredOn: w.today, pending: null }
    fixturePut = put
    try {
      // Write the fixture: the two meals, then last week's list.
      const insertEntry = async (planId, e) => {
        const [row] = await rest('post', 'meal_plan_entries', { meal_plan_id: planId, recipe_id: chosen.recipe.id, day_of_week: e.day_of_week, meal_type: e.meal_type, is_leftover: false, servings: e.servings })
        put.entryIds.push(row.id)
        return row.id
      }
      await insertEntry(lastPlan.id, chosen.fx.lastEntry)
      const targetId = await insertEntry(thisPlan.id, chosen.fx.targetEntry)
      if (lastList) {
        await rest('patch', `shopping_lists?id=eq.${lastList.id}&user_id=eq.${userId}`, { items: chosen.fx.items })
      } else {
        const [row] = await rest('post', 'shopping_lists', { user_id: userId, meal_plan_id: lastPlan.id, name: `Shopping List — Week of ${w.lastWeek}`, items: chosen.fx.items, created_at: listCreatedAt })
        put.listId = row.id
      }

      // Expected, from the rows as written.
      const { rollovers } = await expectThisWeek()
      const want = rollovers[targetId]
      if (!want) throw new Error('the fixture meal earns no reason once written')

      // The card.
      await reload()
      const seen = await checkRollovers(page, rollovers)
      const card = page.locator(`[data-entry-id="${targetId}"]`)
      // In the middle of the screen, clear of the floating nav.
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(400)
      await card.screenshot({ path: shotPath('flows', '17-on-hand-card') })

      // The sheet: variant A's On hand list (amount and use-by) and Still
      // need; no dollars and no "Update what's left" (step 5c).
      // Each item's name, amount and use-by, in whatever order the piece shows them.
      const asText = (i) => [i.name, i.amount, i.useBy].filter(Boolean).join(' ').toLowerCase()
      const onHandText = (loc) => loc.locator('[data-testid="on-hand-item"]').evaluateAll((els) => els.map((el) => el.innerText.replace(/\s+/g, ' ').trim().toLowerCase()))
      const sameItems = (shown) => shown.length === want.items.length
        && want.items.every((i, n) => [i.name, i.amount, i.useBy].filter(Boolean).every((part) => shown[n].includes(part.toLowerCase())))
      await openCard(card)
      const ms = sheet(page, 'meal-sheet')
      await ms.waitFor()
      const section = ms.locator('[data-testid="rollover-section"]')
      await section.waitFor()
      if ((await section.getAttribute('data-sample')) !== 'false') throw new Error('the sheet\'s section isn\'t real data')
      const sheetItems = await onHandText(section)
      if (!sameItems(sheetItems)) throw new Error(`the sheet lists ${JSON.stringify(sheetItems)}, expected ${JSON.stringify(want.items.map(asText))}`)
      if (sheetItems.length > 3) throw new Error(`the sheet lists ${sheetItems.length} items (at most 3)`)
      if (!(await section.getByRole('button', { name: /Update what/ }).count())) throw new Error('"Update what\'s left" is missing on a meal this week')
      if (await ms.getByText(/Saves about|\$\d/).count()) throw new Error('a dollar amount shows in the sheet')
      if (await ms.getByText('Sample', { exact: true }).count()) throw new Error('a Sample tag shows on real data')
      if (want.stillNeed.length && !(await section.innerText()).includes(want.stillNeed.join(', '))) throw new Error(`"Still need" doesn't read ${want.stillNeed.join(', ')}`)
      await page.waitForTimeout(350)
      await page.screenshot({ path: shotPath('flows', '18-on-hand-sheet') })
      await closeSheet(page, 'meal-sheet')

      // The desktop popover: focusing (or hovering) the reason shows it.
      let popItems
      try {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.waitForTimeout(400)
        const reason = page.locator(`[data-entry-id="${targetId}"] [data-testid="rollover-reason"]`)
        await reason.scrollIntoViewIfNeeded()
        await reason.locator('button').focus()
        const pop = reason.locator('[data-testid="rollover-popover"]')
        await pop.waitFor({ state: 'visible', timeout: 5000 })
        popItems = await onHandText(pop)
        if (!sameItems(popItems)) throw new Error(`the popover lists ${JSON.stringify(popItems)}, expected ${JSON.stringify(want.items.map(asText))}`)
        if (await pop.getByText(/Saves about|\$\d/).count()) throw new Error('a dollar amount shows in the popover')
        await page.screenshot({ path: shotPath('flows', '19-on-hand-popover-desktop') })
      } finally {
        await page.setViewportSize({ width: 390, height: 844 })
      }

      // "How much is left?" on the same meal.
      const saves = []
      const onSave = (req) => { if (req.url().includes('/rest/v1/on_hand_adjustments') && ['POST', 'PATCH'].includes(req.method())) saves.push(req.method()) }
      const savedRow = () => page.waitForResponse((r) => r.url().includes('/rest/v1/on_hand_adjustments') && ['POST', 'PATCH'].includes(r.request().method()), { timeout: 15_000 })
      const rowsFor = (key) => restGet(page, `on_hand_adjustments?select=*&user_id=eq.${userId}&ingredient_key=eq.${key}&as_of=eq.${w.today}`)
      let corrections
      page.on('request', onSave)
      try {
        await reload()
        const card2 = page.locator(`[data-entry-id="${targetId}"]`)
        await card2.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await openCard(card2)
        const ms2 = sheet(page, 'meal-sheet')
        await ms2.waitFor()
        const sec = ms2.locator('[data-testid="rollover-section"]')
        await sec.getByRole('button', { name: /Update what/ }).click()
        const control = (key) => sec.locator(`[data-testid="how-much-left"][data-key="${key}"]`)
        const selected = (key) => control(key).locator('button[aria-pressed="true"]').getAttribute('data-answer')
        const amountShown = async (key) => (await control(key).locator('[data-testid="how-much-left-amount"]').innerText()).trim().toLowerCase()
        await control(want.items[0].key).waitFor()

        // The answer that's selected saves nothing.
        const first = want.items[0]
        const preselected = await selected(first.key)
        await control(first.key).locator(`button[data-answer="${preselected}"]`).click()
        await page.waitForTimeout(1500)
        if (saves.length) throw new Error('picking the answer that was already selected saved a row')
        if ((await rowsFor(first.key)).length) throw new Error('a row exists after picking the selected answer')

        // Another answer is saved at once: About half (A little where About half is selected).
        const pick = want.items.find((i) => i.left !== 'About half') ?? first
        const answerKey = pick.left !== 'About half' ? 'about_half' : 'a_little'
        const before = await amountShown(pick.key)
        const since = analyticsEvents(page).length
        put.pending = savedRow()
        put.answered.add(pick.key)
        await control(pick.key).locator(`button[data-answer="${answerKey}"]`).click()
        // Selected at once (optimistic), and the row stays where it was.
        await control(pick.key).locator(`button[data-answer="${answerKey}"][aria-pressed="true"]`).waitFor({ timeout: 3000 })
          .catch(() => { throw new Error(`${answerKey} isn't selected after the tap`) })
        await put.pending
        const wantAmount = answerAmount(answerKey, pick.correction)
        const [row] = await rowsFor(pick.key)
        const rowOk = row && row.answer === answerKey && Number(row.amount) === wantAmount && row.unit === pick.correction.unit
          && Number(row.inferred_amount) === pick.correction.inferred && Number(row.package_amount) === pick.correction.packageAmount && row.source === 'meal_sheet'
        if (!rowOk) throw new Error(`the saved row is ${JSON.stringify(row)}; expected ${answerKey}, ${wantAmount} ${pick.correction.unit}`)
        const sent = await waitForEvent(page, 'on_hand_corrected', { since, match: (p) => p.key === pick.key && p.answer === answerKey })
        const expectedText = amountText(pick.key, wantAmount, pick.name).toLowerCase()
        await page.waitForTimeout(400)
        const after = await amountShown(pick.key)
        if (!after.includes(expectedText)) throw new Error(`after ${answerKey} the amount reads "${after}", expected "${expectedText}" (was "${before}")`)
        await page.screenshot({ path: shotPath('flows', '20-on-hand-how-much-left') })

        // "Used up", row by row (the first row showing each time): each
        // leaves the sheet and the meal's items; once nothing named is left,
        // the reason and marker go.
        const usedUp = []
        for (let i = 0; i < 10; i++) {
          if (!(await expectThisWeek()).rollovers[targetId]) break
          const key = await sec.locator('[data-testid="how-much-left"]').first().getAttribute('data-key')
          if (!key) throw new Error('the meal still has a reason but no "How much is left?" row shows')
          put.pending = savedRow()
          put.answered.add(key)
          await control(key).locator('button[data-answer="used_up"]').click()
          await control(key).waitFor({ state: 'detached', timeout: 5000 })
          await put.pending
          const [r] = await rowsFor(key)
          if (r?.answer !== 'used_up' || Number(r.amount) !== 0) throw new Error(`the "Used up" row for ${key} is ${JSON.stringify(r)}`)
          const still = (await expectThisWeek()).rollovers[targetId]
          if (still?.allItems.some((it) => it.key === key)) throw new Error(`${key} is still on hand for the meal after "Used up"`)
          usedUp.push(key)
          if (i === 0) await page.screenshot({ path: shotPath('flows', '21-on-hand-used-up') })
        }
        if ((await expectThisWeek()).rollovers[targetId]) throw new Error('the meal still earns a reason after everything named was used up')
        await sec.waitFor({ state: 'detached', timeout: 5000 })
        await closeSheet(page, 'meal-sheet')
        const cardsNow = await checkRollovers(page, (await expectThisWeek()).rollovers)
        if (await page.locator(`[data-entry-id="${targetId}"] [data-testid="rollover-reason"]`).count()) throw new Error('the card still shows a reason after everything named was used up')
        corrections = {
          selectedSavedNothing: `${first.key} (${preselected})`,
          answered: `${pick.key} ${answerKey}: ${before} → ${after} (row ${wantAmount} ${pick.correction.unit}, inferred ${pick.correction.inferred}, of ${pick.correction.packageAmount})`,
          usedUp: usedUp.join(', '),
          analytics: `on_hand_corrected (key ${sent.key}, answer ${sent.answer}, preselected ${sent.preselected})`,
          cardsAfter: `${cardsNow.withReason} with a reason`,
        }
      } finally {
        page.off('request', onSave)
      }
      return {
        asIs: asIs.expected ? `${asIs.expected} reason(s): ${asIs.reasons.join(' / ')}` : 'nothing on hand, no rollover UI',
        fixture: `${chosen.recipe.title} last Saturday (${lastSlot}) and ${target.day} (${target.slot}); ${chosen.key} checked as bought ${lastSaturday}`,
        reason: want.reason,
        items: want.items.map(asText).join(' / '),
        stillNeed: want.stillNeed.join(', '),
        cardsWithReason: seen.withReason,
        ...corrections,
      }
    } finally {
      // The run's corrections, by key and day (after any save still on its way).
      await put.pending?.catch(() => {})
      if (put.answered.size) await rest('delete', `on_hand_adjustments?user_id=eq.${userId}&as_of=eq.${put.answeredOn}&ingredient_key=in.(${[...put.answered].join(',')})`).catch((err) => console.log(`[flows] removing the run's corrections failed: ${err.message}`))
      // Put back exactly: the two meals by id, last week's list as it was.
      if (put.entryIds.length) await rest('delete', `meal_plan_entries?id=in.(${put.entryIds.join(',')})`).catch((err) => console.log(`[flows] removing fixture meals failed: ${err.message}`))
      if (lastList) await rest('patch', `shopping_lists?id=eq.${lastList.id}&user_id=eq.${userId}`, { items: put.listItems }).catch((err) => console.log(`[flows] restoring last week's list failed: ${err.message}`))
      if (put.listId) await rest('delete', `shopping_lists?id=eq.${put.listId}&user_id=eq.${userId}`).catch((err) => console.log(`[flows] removing the fixture list failed: ${err.message}`))
    }
  })

  // After the fixture: its rows are gone (by id), last week's list is as it
  // was, and the page matches the account as it is.
  await step('on hand: back as it was after the fixture', async () => {
    if (!fixturePut) return { note: 'no fixture was written' }
    const w = await browserWeek(page)
    const left = fixturePut.entryIds.length ? await restGet(page, `meal_plan_entries?select=id&id=in.(${fixturePut.entryIds.join(',')})`) : []
    if (left.length) throw new Error(`${left.length} fixture meal(s) still there`)
    if (fixturePut.listId && (await restGet(page, `shopping_lists?select=id&id=eq.${fixturePut.listId}`)).length) throw new Error('the fixture list is still there')
    if (fixturePut.answered.size) {
      const { userId } = await restSession(page)
      const rows = await restGet(page, `on_hand_adjustments?select=ingredient_key&user_id=eq.${userId}&as_of=eq.${fixturePut.answeredOn}&ingredient_key=in.(${[...fixturePut.answered].join(',')})`)
      if (rows.length) throw new Error(`${rows.length} of the run's corrections are still there`)
    }
    if (fixturePut.lastListId) {
      const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
        : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
          : JSON.stringify(v ?? null))
      const [now] = await restGet(page, `shopping_lists?select=items&id=eq.${fixturePut.lastListId}`)
      if (stable(now?.items) !== stable(fixturePut.listItems)) throw new Error('last week\'s list isn\'t back as it was')
    }
    await reload()
    const { rollovers } = await expectedRollovers(page, { weekStart: w.thisWeek, thisWeek: w.thisWeek, today: w.today })
    return { meals: 'removed', list: fixturePut.listId ? 'removed' : 'restored', corrections: `${fixturePut.answered.size} removed`, ...(await checkRollovers(page, rollovers)) }
  })

  // Runs even if a step above failed, so quick meals don't pile up on the
  // test account.
  await step('something simple: delete the quick meal the run saved', async () => {
    const ids = [...new Set(data.createdRecipes.filter((r) => r.recipe_type === 'quick').map((r) => r.id))]
    if (!ids.length) return { note: 'the run saved no quick meal' }
    return deleteOwnQuickMeals(page, ids)
  })

  await step('analytics: nothing went past the PostHog stub', () => assertNoAnalyticsLeaks(page))
  writeResults('flows', { project: 'flows', viewport: page.viewportSize(), results, consoleErrors })
  expect(results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`)).toEqual([])
})
