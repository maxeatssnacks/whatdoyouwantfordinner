// What's left from earlier weeks (v2 build step 5b): what saved shopping lists
// assumed got bought, minus what the planned meals use, in date order. Plain
// JS (no React or Vite imports), so Node imports it too:
// scripts/check-on-hand.mjs and the e2e tests.
//
// - Lots (lotsFromLists): every line on a saved list with a package entry key
//   and a package, that isn't in Already have and isn't a staple. A checked
//   line uses what it was checked at (bought: package and day); others use
//   their package and the list's first save (created_at, local date, never
//   before its week starts). Amount = count × size, in the entry's unit; it
//   keeps until that day + the entry's `keeps` (packageSizes.js). Lists saved
//   before step 4 have no keys or packages, so they add nothing.
// - Use (mealUses / applyMeal): every cook entry (leftovers skipped, quick
//   meals included) in date order, its ingredients matched and converted the
//   way the shopping list does (findLineEntry with notes, toEntryUnit with
//   scale and containerSize), scaled by entry servings ÷ recipe servings.
//   Loose items, eggs and muffins round up per meal. Each use takes from the
//   oldest live lot first: bought for the meal's week or an earlier one, and
//   not past its use-by on the meal's day. A use that won't convert takes the
//   whole lot. What's left under 10% of one package counts as finished.
// - Reasons: a meal's reason only names what was bought in an earlier week
//   than its own (sharing within a week is step 6), and only fresh items
//   (keeps 14 days or less) or items the meal finishes. Most valuable first
//   (6c); the line, the popover and the sheet name the same items in that
//   order (7a3).
// - Corrections (step 5c, on_hand_adjustments, migration 018): an answer is
//   an anchor. At the start of its day (as_of), the amount left of that
//   ingredient in the anchor's lots becomes the answer: less than inferred
//   comes off the oldest lots first, more goes onto the newest live lot;
//   use-by dates don't change, and the lots count as confirmed. Later meals
//   use from it and later purchases add to it. Without rows, the pure
//   inference. Which lots (7a3): a voice correction ("the kale is gone") is
//   about everything bought before its day that's still live, this week's
//   purchases included; "How much is left?" on a meal and "I need this" on
//   the shopping list are about what those name, the lots from weeks before
//   the day's week (as in 5c).
// - Confirmed (step 5d): a lot is confirmed when its line was checked when
//   bought (it has a bought record) or a correction set its key's amount.
//   Uses split what came from confirmed lots from what's only inferred, and
//   weekOnHand sums them for a week's meals, for the shopping list: only
//   confirmed leftovers trim it.
import { choosePackage, entryById, findLineEntry, toEntryUnit } from './packages.js'
import { formatLocalDateString, parseRecipeIngredientsJsonb } from '../../lib/utils.js'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']
export const WINDOW_WEEKS = 4
export const FRESH_DAYS = 14
const FINISHED_SHARE = 0.1
const LABEL_MAX_KEEPS = 30
const SOON_DAYS = 2
const ROUND_UP_UNITS = new Set(['each', 'egg', 'muffin'])
const EPSILON = 1e-6
// "How much is left?" answers: the stored key, the button's label, and the
// share of what was bought that it means.
export const ANSWERS = [
  { key: 'used_up', label: 'Used up', share: 0 },
  { key: 'a_little', label: 'A little', share: 0.2 },
  { key: 'about_half', label: 'About half', share: 0.5 },
  { key: 'plenty', label: 'Plenty', share: 0.8 },
]
const answerByKey = (key) => ANSWERS.find((a) => a.key === key) ?? null
export const answerByLabel = (label) => ANSWERS.find((a) => a.label === label) ?? null

// ── Dates (local, YYYY-MM-DD)

function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str ?? ''))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

export function addDays(str, days) {
  const d = parseDate(str)
  if (!d) return null
  d.setDate(d.getDate() + days)
  return formatLocalDateString(d)
}

function weekStartOf(str) {
  const d = parseDate(str)
  if (!d) return null
  d.setDate(d.getDate() - d.getDay())
  return formatLocalDateString(d)
}

function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86_400_000)
}

function localDateOf(timestamp) {
  if (!timestamp) return null
  const d = new Date(timestamp)
  return Number.isNaN(d.getTime()) ? null : formatLocalDateString(d)
}

const later = (a, b) => (a > b ? a : b)
const round = (n) => Math.round(n * 1000) / 1000
const round2 = (n) => Math.round(n * 100) / 100
const sum = (list) => list.reduce((n, x) => n + x, 0)

/** The weeks on-hand reads for a shown week: the 4 before it and that week. */
export function onHandWindow(weekStart) {
  return { from: addDays(weekStart, -7 * WINDOW_WEEKS), to: weekStart }
}

// ── Inputs

/**
 * The rows the calculation needs, from the reads (useOnHand): `lists` are
 * shopping_lists rows with meal_plan.week_start_date, `plans` are meal_plans
 * rows with their entries, `adjustments` are on_hand_adjustments rows.
 * `freshPlans` (optional) are plans the page already holds, fresher than the
 * read; their entries replace that week's. With `weekStart` (the shown week),
 * corrections from before its window are left out.
 * → { lists: [{ weekStart, created_at, items }], plans: [{ weekStart, entries }], adjustments }
 */
export function prepareOnHand({ lists = [], plans = [], adjustments = [] } = {}, freshPlans = [], { weekStart = null } = {}) {
  const planByWeek = new Map()
  for (const p of plans) {
    if (p?.week_start_date && !planByWeek.has(p.week_start_date)) planByWeek.set(p.week_start_date, p)
  }
  for (const p of freshPlans) {
    if (p?.week_start_date && planByWeek.has(p.week_start_date)) {
      planByWeek.set(p.week_start_date, { ...planByWeek.get(p.week_start_date), id: p.id, entries: p.entries ?? [] })
    }
  }
  const listByPlan = new Map()
  for (const l of lists) {
    const weekStart = l?.meal_plan?.week_start_date ?? l?.weekStart
    const plan = planByWeek.get(weekStart)
    if (!plan || l.meal_plan_id !== plan.id || listByPlan.has(plan.id)) continue
    listByPlan.set(plan.id, { weekStart, created_at: l.created_at, items: l.items })
  }
  const from = weekStart ? onHandWindow(weekStart).from : null
  return {
    lists: [...listByPlan.values()],
    plans: [...planByWeek.entries()].map(([week, p]) => ({ weekStart: week, entries: p.entries ?? [] })),
    adjustments: (adjustments ?? []).filter((a) => a?.as_of && (!from || a.as_of >= from)),
  }
}

/** Correction rows with `row` added: it replaces that ingredient's answer for its day (earlier days stay). */
export function withAdjustment(adjustments = [], row) {
  return [...adjustments.filter((a) => !(a.ingredient_key === row.ingredient_key && a.as_of === row.as_of)), row]
}

/**
 * Corrections that apply, oldest day first: rows for a package entry that
 * isn't a staple, in that entry's unit (a row saved in another unit is
 * ignored), with a date and an amount. `scope` is which lots the answer is
 * about: 'bought' (everything bought before its day: voice) or 'earlier'
 * (lots from weeks before its day's week: the meal sheet, the shopping list,
 * and rows without a source). → [{ key, asOf, amount, answer, scope }]
 */
export function anchorsFrom(adjustments = []) {
  const out = []
  for (const a of adjustments) {
    const entry = entryById(a?.ingredient_key)
    const amount = Number(a?.amount)
    if (!entry || entry.staple || entry.skip || a.unit !== entry.unit || !parseDate(a.as_of) || !(amount >= 0)) continue
    out.push({ key: entry.id, asOf: a.as_of, amount, answer: a.answer ?? null, scope: a.source === 'voice' ? 'bought' : 'earlier' })
  }
  return out.sort((a, b) => a.asOf.localeCompare(b.asOf) || a.key.localeCompare(b.key))
}

// Whether a lot counts for `date` in a scope: 'earlier', bought in an earlier
// week than the date's; 'bought', bought before the date (this week's
// purchases included; a lot is never bought before its week starts).
function inScope(lot, date, scope) {
  return scope === 'bought' ? lot.boughtOn < date : lot.weekStart < weekStartOf(date)
}

// The lots a correction on `date` is about: that key's, in its scope, and not
// past their use-by (finished ones included, so "more" has somewhere to go).
// Oldest first.
function anchorLots(state, key, date, scope) {
  return state.lots.filter((l) => l.key === key && inScope(l, date, scope) && date <= l.useBy)
}

// Sets that key's amount in the anchor's lots to the answer, at the start of
// its day. Mutates the state's lots.
function applyAnchor(state, anchor) {
  const lots = anchorLots(state, anchor.key, anchor.asOf, anchor.scope)
  if (!lots.length) return
  const total = sum(lots.map((l) => l.amount))
  if (anchor.amount < total - EPSILON) {
    let off = total - anchor.amount
    for (const lot of lots) {
      if (off <= EPSILON) break
      const t = Math.min(off, lot.amount)
      lot.amount = round(lot.amount - t)
      off -= t
    }
  } else if (anchor.amount > total + EPSILON) {
    const newest = lots[lots.length - 1]
    newest.amount = round(newest.amount + (anchor.amount - total))
  }
  for (const lot of lots) {
    if (lot.amount < FINISHED_SHARE * lot.size) lot.amount = 0
    lot.confirmed = true
  }
}

// What's left of each key on `date` in a scope (its live lots: from earlier
// weeks, or everything bought before the date): the amount and what those
// lots were bought as. → { [key]: { amount, packageAmount } }
function amountsOn(state, date, scope = 'earlier') {
  const out = {}
  for (const lot of state.lots) {
    if (!inScope(lot, date, scope) || !isLive(lot, date)) continue
    const k = (out[lot.key] ??= { amount: 0, packageAmount: 0 })
    k.amount = round2(k.amount + lot.amount)
    k.packageAmount = round2(k.packageAmount + lot.packageAmount)
  }
  return out
}

/**
 * The amount an answer means for an item: its share of what was bought for
 * that key in the live lots (packageAmount). Counted things (eggs, muffins,
 * loose items) round to whole ones, at least one unless "Used up".
 */
export function answerAmount(answerKey, { key, packageAmount }) {
  const answer = answerByKey(answerKey)
  if (!answer) return null
  const amount = answer.share * (Number(packageAmount) || 0)
  if (!ROUND_UP_UNITS.has(entryById(key)?.unit)) return round2(amount)
  return answer.share === 0 ? 0 : Math.max(1, Math.round(amount))
}

/** Lots bought, oldest first: [{ key, name, weekStart, boughtOn, useBy, keeps, fresh, unit, size, packageAmount, amount }] */
export function lotsFromLists(lists = []) {
  const lots = []
  for (const list of lists) {
    const weekStart = list?.weekStart
    if (!parseDate(weekStart) || !Array.isArray(list.items)) continue
    const firstSave = later(localDateOf(list.created_at) ?? weekStart, weekStart)
    for (const item of list.items) {
      if (!item?.key || item.have || item.staple) continue
      const entry = entryById(item.key)
      if (!entry || entry.staple || entry.skip) continue
      const checkedAt = item.checked && item.bought?.package ? item.bought : null
      const pkg = checkedAt ? checkedAt.package : item.package
      if (!pkg || !(pkg.count > 0) || !(pkg.size > 0) || pkg.unit !== entry.unit) continue
      const boughtOn = checkedAt && parseDate(checkedAt.on) ? later(checkedAt.on, weekStart) : firstSave
      const amount = round(pkg.count * pkg.size)
      const keeps = Number(entry.keeps) || 7
      lots.push({
        key: item.key,
        name: plainName(item.name || entry.display || entry.id),
        weekStart,
        boughtOn,
        useBy: addDays(boughtOn, keeps),
        keeps,
        fresh: keeps <= FRESH_DAYS,
        unit: entry.unit,
        size: pkg.size,
        packageAmount: amount,
        amount,
        confirmed: !!checkedAt,
      })
    }
  }
  return lots.sort((a, b) => a.boughtOn.localeCompare(b.boughtOn) || a.weekStart.localeCompare(b.weekStart) || a.key.localeCompare(b.key))
}

/** Cook entries in date order (then slot, then id): [{ id, date, weekStart, recipe, servings }] */
export function mealsFromPlans(plans = []) {
  const meals = []
  for (const plan of plans) {
    for (const e of plan?.entries ?? []) {
      if (!e?.recipe || e.is_leftover) continue
      const idx = DAY_NAMES.indexOf(String(e.day_of_week || '').toLowerCase())
      const date = idx === -1 ? null : addDays(plan.weekStart, idx)
      if (!date) continue
      const slot = SLOT_ORDER.indexOf(String(e.meal_type || '').toLowerCase())
      meals.push({ id: e.id, date, weekStart: plan.weekStart, slot: slot === -1 ? SLOT_ORDER.length : slot, recipe: e.recipe, servings: e.servings })
    }
  }
  return meals.sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot || String(a.id).localeCompare(String(b.id)))
}

// ── What's at stake (step 6b2; here since 6c)

/**
 * How much an opened package's unused part is at stake, by how long it keeps
 * once opened (packageSizes.js `keeps`): fast spoilers count fully, things
 * that keep count little, and staples or anything that keeps longer than 60
 * days count nothing (it carries over). → [{ upTo: days, factor }]
 */
export const STAKE_FACTORS = [
  { upTo: 5, factor: 1 },
  { upTo: 14, factor: 0.6 },
  { upTo: 30, factor: 0.25 },
  { upTo: 60, factor: 0.1 },
]

/** The shelf-life factor for a package entry (STAKE_FACTORS; 0 for staples and skipped entries). */
export function stakeFactor(entry) {
  if (!entry || entry.staple || entry.skip) return 0
  const keeps = Number(entry.keeps) || 7
  return STAKE_FACTORS.find((t) => keeps <= t.upTo)?.factor ?? 0
}

// A size's price; a size without one gets the nearest priced size's price per unit.
function sizePrice(entry, size) {
  const prices = entry?.prices
  if (!prices) return null
  if (prices[size] != null) return prices[size]
  const priced = Object.entries(prices).map(([s, p]) => [Number(s), p]).sort((a, b) => Math.abs(a[0] - size) - Math.abs(b[0] - size))[0]
  return priced ? (priced[1] / priced[0]) * size : null
}

/**
 * Dollars per entry unit of what the list buys for `amount` (choosePackage):
 * that package's price ÷ its size. 0 without prices (packageSizes.js PRICES).
 */
export function unitPrice(entry, amount) {
  const pkg = amount > EPSILON ? choosePackage(entry, amount) : null
  const price = pkg ? sizePrice(entry, pkg.size.size) : null
  return price != null ? price / pkg.size.size : 0
}

/**
 * What `amount` of a package (out of `packageAmount` bought) rescued or
 * wasted is worth, in dollars at stake: price × share of the package × the
 * shelf-life factor. For weighting only (Plan my week, the picker, and which
 * item a reason names first); never shown until step 8.
 */
export function stake(entry, amount, packageAmount) {
  return amount > EPSILON ? amount * unitPrice(entry, packageAmount) * stakeFactor(entry) : 0
}

// ── What a meal needs

function servingsScale(recipe, servings) {
  const base = Math.max(Number(recipe?.servings) || 1, 1)
  const cooked = servings != null && servings !== '' ? Math.max(Number(servings) || base, 1) : base
  return cooked / base
}

// Matching a recipe's lines to package entries is the slow part of on-hand
// and of the step 6 ranking, and the same recipes are matched over and over
// (every meal in the window, every candidate for every slot). So mealNeeds is
// cached (step 6b): by recipe object, and across objects by recipe id, its
// servings and a hash of its ingredients (a refetched copy of an unchanged
// recipe hits; an edited one doesn't), then by the servings cooked. Results
// are shared: callers read them and never change them.
const NEEDS_CACHE_MAX = 5000
const needsByRecipe = new WeakMap() // recipe object → Map(servings → result)
const needsById = new Map() // `${id}|${fingerprint}` → Map(servings → result)
const fingerprints = new WeakMap()

function hashText(text) {
  let h = 0x811c9dc5 // FNV-1a, 32-bit
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

function needsCacheFor(recipe) {
  if (!recipe || typeof recipe !== 'object') return null
  let byServings = needsByRecipe.get(recipe)
  if (byServings) return byServings
  if (recipe.id != null) {
    let print = fingerprints.get(recipe)
    if (print == null) {
      const text = JSON.stringify(recipe.ingredients ?? null)
      print = `${recipe.servings ?? ''}:${text.length}:${hashText(text)}`
      fingerprints.set(recipe, print)
    }
    const key = `${recipe.id}|${print}`
    byServings = needsById.get(key)
    if (!byServings) {
      if (needsById.size >= NEEDS_CACHE_MAX) needsById.clear()
      byServings = new Map()
      needsById.set(key, byServings)
    }
  } else {
    byServings = new Map()
  }
  needsByRecipe.set(recipe, byServings)
  return byServings
}

/**
 * Per package entry (staples and skips left out): what one meal of `recipe`
 * cooking `servings` needs in the entry's unit, matched and converted the way
 * the shopping list does. `amount` rounds loose items, eggs and muffins up per
 * meal (what a meal takes from what's on hand); `raw` doesn't (what the
 * shopping list adds up across a week's meals). Both are null when a line
 * won't convert. `lines` are the meal's other lines in recipe order, for
 * "still need". Step 6's ranking (planRank.js) uses it for its package math.
 * Cached (above): the result is shared, so don't change it.
 * → { needs: Map(key → { entry, amount, raw, name }), lines: [{ key, name }] }
 */
export function mealNeeds(recipe, servings) {
  const cache = needsCacheFor(recipe)
  const servingsKey = String(servings ?? '')
  const hit = cache?.get(servingsKey)
  if (hit) return hit
  const result = matchNeeds(recipe, servings)
  cache?.set(servingsKey, result)
  return result
}

/** mealNeeds without the cache (check:plan compares the two). */
export function mealNeedsUncached(recipe, servings) {
  return matchNeeds(recipe, servings)
}

function matchNeeds(recipe, servings) {
  const scale = servingsScale(recipe, servings)
  const needs = new Map() // key → { entry, amount, raw, name }
  const lines = [] // { key, name } in recipe order, staples and skips left out
  for (const ing of parseRecipeIngredientsJsonb(recipe)) {
    if (!ing?.name) continue
    const raw = typeof ing.amount === 'number' ? ing.amount : parseFloat(ing.amount) || 0
    const match = findLineEntry(ing.name, ing.unit, { notes: ing.notes })
    if (match?.entry.skip || match?.entry.staple) continue
    if (!match) {
      lines.push({ key: null, name: plainName(ing.name) })
      continue
    }
    const { entry } = match
    const value = toEntryUnit(entry, raw * scale, ing.unit, match.scale, match.containerSize ?? null)
    const need = needs.get(entry.id) ?? { entry, amount: 0, name: plainName(entry.display ?? ing.name) }
    need.amount = need.amount == null || value == null ? null : need.amount + value
    needs.set(entry.id, need)
    lines.push({ key: entry.id, name: need.name })
  }
  for (const need of needs.values()) {
    need.raw = need.amount
    if (need.amount != null && ROUND_UP_UNITS.has(need.entry.unit)) need.amount = Math.ceil(need.amount - EPSILON)
  }
  return { needs, lines }
}

// ── Taking from lots

function isLive(lot, date) {
  return lot.amount > EPSILON && date >= lot.weekStart && date <= lot.useBy
}

// Takes `amount` (null: the whole oldest live lot) from a key's live lots,
// oldest first. Mutates the lots. → [{ lot, amount }]
function take(lots, key, amount, date) {
  const live = lots.filter((l) => l.key === key && isLive(l, date))
  const takes = []
  if (amount == null) {
    if (live[0]) {
      takes.push({ lot: live[0], amount: live[0].amount })
      live[0].amount = 0
    }
    return takes
  }
  let left = amount
  for (const lot of live) {
    if (left <= EPSILON) break
    const t = Math.min(left, lot.amount)
    lot.amount = round(lot.amount - t)
    if (lot.amount < FINISHED_SHARE * lot.size) lot.amount = 0
    left -= t
    takes.push({ lot, amount: t })
  }
  return takes
}

const copyState = (onHand) => ({ lots: (onHand?.lots ?? []).map((l) => ({ ...l })) })

// One meal against a state: what it uses (from lots it may name) and the state after.
function runMeal(onHand, recipe, servings, date, { earlierWeeksOnly = true } = {}) {
  const state = copyState(onHand)
  const mealWeek = weekStartOf(date)
  const named = (lot) => !earlierWeeksOnly || lot.weekStart < mealWeek
  const { needs, lines } = mealNeeds(recipe, servings)
  // What's on hand that day, for telling items apart in short names.
  const onHandNames = new Map()
  for (const l of state.lots) if (isLive(l, date) && !onHandNames.has(l.key)) onHandNames.set(l.key, l.name)
  const others = [...onHandNames].map(([key, name]) => ({ key, name }))
  const uses = []
  for (const [key, need] of needs) {
    const before = state.lots.filter((l) => l.key === key && isLive(l, date) && named(l))
    const amountBefore = sum(before.map((l) => l.amount))
    const packageAmount = sum(before.map((l) => l.packageAmount))
    const useBy = before.map((l) => l.useBy).sort()[0] ?? null
    const name = before[0]?.name ?? need.name
    const takes = take(state.lots, key, need.amount, date)
    const namedTakes = takes.filter((t) => named(t.lot))
    const used = sum(namedTakes.map((t) => t.amount))
    if (!(used > EPSILON)) continue
    const fromConfirmed = namedTakes.filter((t) => t.lot.confirmed)
    const fromInferred = namedTakes.filter((t) => !t.lot.confirmed)
    const earliest = (list) => list.map((t) => t.lot.useBy).sort()[0] ?? null
    const after = sum(state.lots.filter((l) => l.key === key && isLive(l, date) && named(l)).map((l) => l.amount))
    const keeps = Number(need.entry.keeps) || 7
    uses.push({
      key,
      name,
      short: shortName(key, name, others),
      unit: need.entry.unit,
      before: round2(amountBefore),
      used: round2(used),
      value: round2(stake(need.entry, used, packageAmount)),
      finishes: after <= EPSILON,
      useBy,
      keeps,
      fresh: keeps <= FRESH_DAYS,
      packageAmount: round2(packageAmount),
      confirmed: round2(sum(fromConfirmed.map((t) => t.amount))),
      inferred: round2(sum(fromInferred.map((t) => t.amount))),
      confirmedUseBy: earliest(fromConfirmed),
      inferredUseBy: earliest(fromInferred),
    })
  }
  // Most valuable first (6c, as Plan my week and the picker rank them), then
  // finished, the soonest use-by and the name: the line, the popover and the
  // sheet all name them in this order (7a3; before, the sheet and popover
  // listed finished first, then the soonest use-by, so they could show other
  // items than the line).
  const items = uses
    .filter((u) => u.fresh || u.finishes)
    .sort((a, b) => b.value - a.value || Number(b.finishes) - Number(a.finishes) || String(a.useBy).localeCompare(String(b.useBy)) || a.name.localeCompare(b.name))
  const covered = new Set(uses.map((u) => u.key))
  const stillNeed = []
  for (const line of lines) {
    if ((line.key && covered.has(line.key)) || stillNeed.includes(line.name)) continue
    stillNeed.push(line.name)
    if (stillNeed.length === 3) break
  }
  const reason = reasonText(items)
  const reasonToday = reasonText(items, { width: LINE_WIDTHS.today })
  return { result: { items, uses, reason, reasonToday, stillNeed }, state }
}

/**
 * What one meal of `recipe` (cooking `servings`) on `date` would use from
 * `onHand` (a state from inferOnHand or applyMeal), without changing it.
 * Takes a recipe, not an entry, so meals that aren't planned yet can be scored.
 * → { items, uses, reason, stillNeed }
 *   uses: everything it takes that was bought in an earlier week than its own
 *     [{ key, name, short, unit, before, used, value, finishes, useBy, keeps, fresh, packageAmount }]
 *   items: the uses that earn a reason (fresh, or finished), most valuable first
 *   reason: "Uses the rest of the green beans", "Uses your feta and dill", or
 *     null (for a meal card's width); reasonToday: the same for the Today card
 *   stillNeed: up to 3 of its other non-staple ingredients
 * options.earlierWeeksOnly (default true): false also names lots bought in the
 * meal's own week (sharing within a week, step 6).
 */
export function mealUses(recipe, servings, onHand, date, options) {
  return runMeal(onHand, recipe, servings, date, options).result
}

/** The state after a meal of `recipe` on `date` (it takes from every live lot, its own week's too). */
export function applyMeal(onHand, recipe, servings, date) {
  return runMeal(onHand, recipe, servings, date, { earlierWeeksOnly: false }).state
}

/**
 * Runs the window: lots from the lists, then corrections (at the start of
 * their day) and every cook entry in date order. Days before today count as
 * cooked; later ones are taken in order the same way.
 * → { bought, byEntry: { [entryId]: { date, weekStart, ...mealUses } }, end, now, nowAll }
 *   bought: the lots as bought; end: the state after the last meal;
 *   now (with `today`): per key, what's left from earlier weeks at the start
 *   of today: { inferred (before today's correction), amount (after it),
 *   packageAmount, answer (today's, if any) }. For "How much is left?" on
 *   this week's meals and the shopping list.
 *   nowAll (with `today`): the same for everything bought before today that's
 *   still live, this week's purchases included. For voice (7a3).
 */
export function inferOnHand({ lists = [], plans = [], adjustments = [] } = {}, { today = null } = {}) {
  const bought = lotsFromLists(lists)
  let state = { lots: bought.map((l) => ({ ...l })) }
  const anchors = anchorsFrom(adjustments)
  let next = 0
  const anchorThrough = (date) => {
    while (next < anchors.length && anchors[next].asOf <= date) applyAnchor(state, anchors[next++])
  }
  let now = null
  let nowAll = null
  const takeNow = () => {
    if (now || !today) return
    anchorThrough(addDays(today, -1))
    const scopes = ['earlier', 'bought']
    const before = scopes.map((s) => amountsOn(state, today, s))
    const answers = anchors.filter((a) => a.asOf === today)
    anchorThrough(today)
    const after = scopes.map((s) => amountsOn(state, today, s))
    // Keys with lots left in the scope, and the keys that today's answers in that scope set.
    const table = (i) => {
      const out = {}
      const said = answers.filter((a) => a.scope === scopes[i]).map((a) => a.key)
      for (const key of new Set([...Object.keys(before[i]), ...said])) {
        out[key] = {
          inferred: before[i][key]?.amount ?? 0,
          amount: after[i][key]?.amount ?? 0,
          packageAmount: before[i][key]?.packageAmount ?? after[i][key]?.packageAmount ?? 0,
          answer: answers.find((a) => a.key === key)?.answer ?? null,
        }
      }
      return out
    }
    now = table(0)
    nowAll = table(1)
  }
  const byEntry = {}
  for (const meal of mealsFromPlans(plans)) {
    if (today && meal.date >= today) takeNow()
    anchorThrough(meal.date)
    const { result } = runMeal(state, meal.recipe, meal.servings, meal.date)
    byEntry[meal.id] = { date: meal.date, weekStart: meal.weekStart, ...result }
    state = applyMeal(state, meal.recipe, meal.servings, meal.date)
  }
  takeNow()
  anchorThrough('9999-12-31')
  return { bought, byEntry, end: state, now: now ?? {}, nowAll: nowAll ?? {} }
}

// ── Words

/** "Feta cheese, crumbled" → "feta cheese"; "Green Beans" → "green beans". */
export function plainName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim()
}

// Shorter names (7a3): words that don't tell the item apart go, only while
// the name still says which item it is. 'same': the shorter name still
// matches the same package entry ("ricotta cheese" → "ricotta", but "cream
// cheese" stays: "cream" is heavy cream). 'alone': no other item on hand has
// that word in its name ("greek yogurt" → "yogurt" unless plain yogurt is on
// hand too).
const SHORTER = [
  { from: /^(.+) cheese$/, to: '$1', check: 'same' },
  { from: /^greek (yogurt)$/, to: '$1', check: 'alone' },
  { from: /^panko breadcrumbs$/, to: 'panko', check: 'same' },
  { from: /^crunchy (.+)$/, to: '$1', check: 'same' },
]

/**
 * The name the line, the popover, the sheet and voice use for an item:
 * "ricotta", "yogurt", "panko", "chili garlic oil"; otherwise plainName's.
 * `others`: what else is on hand, [{ key, name }].
 */
export function shortName(key, name, others = []) {
  let out = plainName(name)
  for (const rule of SHORTER) {
    if (!rule.from.test(out)) continue
    const next = out.replace(rule.from, rule.to)
    const word = new RegExp(`\\b${next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    const clear = rule.check === 'same'
      ? findLineEntry(next)?.entry.id === key
      : !others.some((o) => o.key !== key && word.test(plainName(o.name)))
    if (clear) out = next
  }
  return out
}

/**
 * How wide the line may be at 390px, by where it shows: the text column less
 * the 14px icon and 6px gap. The meal card (variant B) 324px, the Today card
 * (variant A) 248px, the picker row 260px. Measured 2026-10-29.
 */
export const LINE_WIDTHS = { card: 304, today: 228, picker: 240 }
export const LINE_WIDTH = LINE_WIDTHS.card

// Advances of Lato Bold at 14px (the line's font), in px, measured in the
// browser (canvas measureText); anything else counts 7.5.
const ADVANCES = {
  a: 7.33, b: 7.98, c: 6.68, d: 7.98, e: 7.48, f: 4.91, g: 7.24, h: 7.96, i: 3.79, j: 3.77, k: 7.72, l: 3.79, m: 11.79,
  n: 7.96, o: 7.96, p: 7.92, q: 7.98, r: 5.72, s: 6.12, t: 5.42, u: 7.96, v: 7.47, w: 11.07, x: 7.56, y: 7.47, z: 6.57,
  U: 10.19, ' ': 2.7, ',': 3.15, '.': 3.15, '’': 3.15, "'": 3.33, '&': 10, '-': 5.03, '1': 8.12,
}

/** About how wide `text` is in the line's font, in px. */
export function lineWidth(text) {
  let w = 0
  for (const ch of String(text ?? '')) w += ADVANCES[ch] ?? ADVANCES[ch.toLowerCase()] ?? 7.5
  return w
}

const listWords = (names) => (names.length < 2 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/**
 * The line (7a3), for the items in the order given (up to 3, the ones the
 * popover and the sheet list): "Uses the rest of the ricotta and yogurt"
 * when the meal finishes all of them, otherwise "Uses your ricotta, yogurt
 * and kale". As many names as fit on one line in `width` (LINE_WIDTHS; the
 * meal card's by default): all three, else two and "and 1 more", else one
 * and "and 2 more". Short names (shortName). null if none.
 */
export function reasonText(items = [], { width = LINE_WIDTH } = {}) {
  const shown = items.slice(0, SHOWN_ITEMS)
  if (!shown.length) return null
  const names = shown.map((i) => i.short ?? plainName(i.name))
  const start = shown.every((i) => i.finishes) ? 'Uses the rest of the ' : 'Uses your '
  let text = null
  for (let n = names.length; n >= 1; n--) {
    const more = names.length - n
    text = `${start}${listWords([...names.slice(0, n), ...(more ? [`${more} more`] : [])])}`
    if (lineWidth(text) <= width) break
  }
  return text
}

const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' }
function mixed(n) {
  const whole = Math.floor(n + EPSILON)
  const part = FRACTIONS[Math.round((n - whole) * 4) / 4]
  return part ? `${whole || ''}${part}` : String(whole)
}

const COUNT_PLURALS = { bunch: 'bunches', head: 'heads', piece: 'pieces', loaf: 'loaves' }

function pluralName(name, count) {
  if (count === 1) return name
  const words = name.split(' ')
  const last = words.pop()
  let plural = `${last}s`
  if (/(s|x|ch|sh)$/.test(last) || /(potato|tomato)$/.test(last)) plural = `${last}es`
  else if (/[^aeiou]y$/.test(last)) plural = `${last.slice(0, -1)}ies`
  return [...words, plural].join(' ')
}

/**
 * An amount in a package entry's unit, friendly: "About 6 oz", "About 2½ oz",
 * "Under 1 oz", "About 1¾ lb", "About half a bunch", "About 1½ bunches",
 * "2 eggs", "1 lemon" (loose items are named; `name` is the item's).
 */
export function amountText(key, amount, name = '') {
  const entry = entryById(key)
  const n = Number(amount)
  if (!entry || !Number.isFinite(n)) return ''
  const unit = entry.unit
  if (unit === 'egg' || unit === 'muffin' || unit === 'each') {
    const count = Math.max(1, Math.round(n))
    const noun = unit === 'each' ? (name || plainName(entry.display ?? entry.id)) : unit
    return `${count} ${pluralName(noun, count)}`
  }
  if (entry.measure === 'count') {
    const q = Math.round(n * 4) / 4
    if (q === 0) return `A little of a ${unit}`
    if (q === 0.25) return `About a quarter of a ${unit}`
    if (q === 0.5) return `About half a ${unit}`
    if (q === 0.75) return `About three quarters of a ${unit}`
    if (q === 1) return `About a ${unit}`
    return `About ${mixed(q)} ${COUNT_PLURALS[unit] ?? `${unit}s`}`
  }
  if (unit === 'oz' && n >= 16) return `About ${mixed(Math.round((n / 16) * 4) / 4)} lb`
  if (n < 1) return `Under 1 ${unit}`
  if (n < 4) return `About ${mixed(Math.round(n * 2) / 2)} ${unit}`
  return `About ${Math.round(n)} ${unit}`
}

/** An amount as the shopping list's right side says it: "6 oz", "half a bunch", "5 eggs", "2 lemons". */
export function shortAmountText(key, amount, name = '') {
  const text = amountText(key, amount, name).replace(/^About /, '')
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/**
 * What a week's meals take from earlier weeks' leftovers, per package entry
 * key, summed over the week's cook entries (past days too): `confirmed` from
 * lots that were checked when bought or set by a correction, `inferred` from
 * the rest, each with the earliest use-by of what they take and its words.
 * It never depends on the week's own list. For the shopping list (step 5d).
 * → { [key]: { confirmed, inferred, confirmedUseBy, inferredUseBy, confirmedText, inferredText } }
 */
export function weekOnHand(onHand, weekStart) {
  const out = {}
  for (const meal of Object.values(onHand?.byEntry ?? {})) {
    if (meal.weekStart !== weekStart) continue
    for (const u of meal.uses ?? []) {
      const k = (out[u.key] ??= { name: u.name, confirmed: 0, inferred: 0, confirmedUseBy: null, inferredUseBy: null })
      k.confirmed = round2(k.confirmed + (u.confirmed ?? 0))
      k.inferred = round2(k.inferred + (u.inferred ?? 0))
      if (u.confirmedUseBy && (!k.confirmedUseBy || u.confirmedUseBy < k.confirmedUseBy)) k.confirmedUseBy = u.confirmedUseBy
      if (u.inferredUseBy && (!k.inferredUseBy || u.inferredUseBy < k.inferredUseBy)) k.inferredUseBy = u.inferredUseBy
    }
  }
  for (const [key, k] of Object.entries(out)) {
    k.confirmedText = k.confirmed > EPSILON ? shortAmountText(key, k.confirmed, k.name) : null
    k.inferredText = k.inferred > EPSILON ? shortAmountText(key, k.inferred, k.name) : null
    delete k.name
  }
  return out
}

/**
 * "Use by Wed" when it's 2 days or less from today (soon: true), "Good till
 * Sat" otherwise ("Good till Oct 30" when it's more than 6 days away), none
 * when the entry keeps more than 30 days. → { text, soon } | null
 */
export function useByLabel(useBy, keeps, today) {
  if (!useBy || !parseDate(today) || Number(keeps) > LABEL_MAX_KEEPS) return null
  const days = daysBetween(today, useBy)
  const d = parseDate(useBy)
  const when = days >= 0 && days <= 6
    ? d.toLocaleDateString('en-US', { weekday: 'short' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const soon = days <= SOON_DAYS
  return { text: `${soon ? 'Use by' : 'Good till'} ${when}`, soon }
}

/** The preselected "How much is left?" answer (its label) for an amount out of what was bought. */
export function leftAnswer(amount, packageAmount) {
  const share = packageAmount > 0 ? amount / packageAmount : 0
  if (share < 0.35) return 'A little'
  if (share < 0.65) return 'About half'
  return 'Plenty'
}

/** How many items the line, the meal sheet and the popover cover (the same ones). */
export const SHOWN_ITEMS = 3

/**
 * A meal's on-hand data as the Week page's rollover pieces take it (the same
 * shape as the sample data in rolloverPreview.js), or null when it earns no
 * reason. Real data: no dollar amounts (savings null, step 8), no Sample tag.
 * Up to 3 items, the ones the line covers, in its order (most valuable
 * first), with their short names; allItems has every item that earns a
 * reason, in that order (the sheet keeps the rows it opened "How much is
 * left?" with, wherever an answer moves them).
 * With `now` (inferOnHand's, for a meal on the current week) its items can be
 * corrected ("How much is left?", canUpdate): each gets `left` (today's answer,
 * or the one the amount left now suggests) and `correction` { key, unit,
 * packageAmount, inferred, amount, nowText } for saving an answer.
 */
export function rolloverFor(meal, today, now = null) {
  if (!meal?.items?.length || !meal.reason) return null
  const allItems = meal.items.map((u) => {
    const label = useByLabel(u.useBy, u.keeps, today)
    const item = {
      key: u.key,
      name: u.short ?? u.name,
      amount: amountText(u.key, u.before, u.name),
      useBy: label?.text ?? null,
      soon: !!label?.soon,
      left: leftAnswer(u.before, u.packageAmount),
      finishes: u.finishes,
    }
    const n = now?.[u.key]
    if (n && n.packageAmount > 0) {
      // An amount said some other way (voice, 'amount') selects the answer it's closest to.
      const answered = n.answer ? answerByKey(n.answer) : null
      item.left = answered ? answered.label
        : n.answer === 'amount' ? (n.amount > EPSILON ? leftAnswer(n.amount, n.packageAmount) : 'Used up')
          : leftAnswer(n.inferred, n.packageAmount)
      item.correction = {
        key: u.key,
        unit: u.unit,
        packageAmount: n.packageAmount,
        inferred: n.inferred,
        amount: n.amount,
        nowText: amountText(u.key, n.amount, u.name),
      }
    }
    return item
  })
  const items = allItems.slice(0, SHOWN_ITEMS)
  return {
    sample: false,
    canUpdate: items.some((i) => i.correction),
    savings: null,
    reason: meal.reason,
    reasonToday: meal.reasonToday ?? meal.reason,
    stillNeed: meal.stillNeed ?? [],
    items,
    allItems,
  }
}

/**
 * The on_hand_adjustments row for an answer to an item's "How much is left?"
 * (answerKey: 'used_up' | 'a_little' | 'about_half' | 'plenty'), as of today.
 * null when the item can't be corrected.
 */
export function correctionRow(item, answerKey, today, source = 'meal_sheet') {
  const c = item?.correction
  const amount = c ? answerAmount(answerKey, c) : null
  if (!c || amount == null) return null
  return {
    ingredient_key: c.key,
    as_of: today,
    answer: answerKey,
    amount,
    unit: c.unit,
    inferred_amount: c.inferred,
    package_amount: c.packageAmount,
    source,
  }
}

/**
 * Rollovers for the meals of a shown week, by entry id: on the current week
 * from today on, and on next week. Past weeks and past days get none. Only the
 * current week's can be corrected: a correction says what's left now of what
 * was bought before this week, which is what those meals name; next week's
 * name what this week's list will leave, which isn't known yet.
 */
export function weekRollovers(onHand, { weekStart, thisWeek, today }) {
  const out = {}
  if (!onHand || (weekStart !== thisWeek && weekStart !== addDays(thisWeek, 7))) return out
  const now = weekStart === thisWeek ? onHand.now ?? null : null
  for (const [id, meal] of Object.entries(onHand.byEntry ?? {})) {
    if (meal.weekStart !== weekStart || meal.date < today) continue
    const rollover = rolloverFor(meal, today, now)
    if (rollover) out[id] = rollover
  }
  return out
}
