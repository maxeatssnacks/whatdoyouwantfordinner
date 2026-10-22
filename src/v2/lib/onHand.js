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
//   (keeps 14 days or less) or items the meal finishes.
import { entryById, findLineEntry, toEntryUnit } from './packages.js'
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
// "How much is left?" (step 5c) options, as in rolloverPreview.js.
const LEFT = { little: 'A little', half: 'About half', plenty: 'Plenty' }

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
 * rows with their entries. `freshPlans` (optional) are plans the page already
 * holds, fresher than the read; their entries replace that week's.
 * → { lists: [{ weekStart, created_at, items }], plans: [{ weekStart, entries }] }
 */
export function prepareOnHand({ lists = [], plans = [] } = {}, freshPlans = []) {
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
  return {
    lists: [...listByPlan.values()],
    plans: [...planByWeek.entries()].map(([weekStart, p]) => ({ weekStart, entries: p.entries ?? [] })),
  }
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

// ── What a meal needs

function servingsScale(recipe, servings) {
  const base = Math.max(Number(recipe?.servings) || 1, 1)
  const cooked = servings != null && servings !== '' ? Math.max(Number(servings) || base, 1) : base
  return cooked / base
}

// Per package entry: the amount a meal needs in the entry's unit (null when a
// line won't convert), plus its other lines for "still need".
function mealNeeds(recipe, servings) {
  const scale = servingsScale(recipe, servings)
  const needs = new Map() // key → { entry, amount, name }
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
  const uses = []
  for (const [key, need] of needs) {
    const before = state.lots.filter((l) => l.key === key && isLive(l, date) && named(l))
    const amountBefore = sum(before.map((l) => l.amount))
    const packageAmount = sum(before.map((l) => l.packageAmount))
    const useBy = before.map((l) => l.useBy).sort()[0] ?? null
    const name = before[0]?.name ?? need.name
    const takes = take(state.lots, key, need.amount, date)
    const used = sum(takes.filter((t) => named(t.lot)).map((t) => t.amount))
    if (!(used > EPSILON)) continue
    const after = sum(state.lots.filter((l) => l.key === key && isLive(l, date) && named(l)).map((l) => l.amount))
    const keeps = Number(need.entry.keeps) || 7
    uses.push({
      key,
      name,
      unit: need.entry.unit,
      before: round2(amountBefore),
      used: round2(used),
      finishes: after <= EPSILON,
      useBy,
      keeps,
      fresh: keeps <= FRESH_DAYS,
      packageAmount: round2(packageAmount),
    })
  }
  const items = uses
    .filter((u) => u.fresh || u.finishes)
    .sort((a, b) => Number(b.finishes) - Number(a.finishes) || String(a.useBy).localeCompare(String(b.useBy)) || a.name.localeCompare(b.name))
  const covered = new Set(uses.map((u) => u.key))
  const stillNeed = []
  for (const line of lines) {
    if ((line.key && covered.has(line.key)) || stillNeed.includes(line.name)) continue
    stillNeed.push(line.name)
    if (stillNeed.length === 3) break
  }
  return { result: { items, uses, reason: reasonText(items), stillNeed }, state }
}

/**
 * What one meal of `recipe` (cooking `servings`) on `date` would use from
 * `onHand` (a state from inferOnHand or applyMeal), without changing it.
 * Takes a recipe, not an entry, so meals that aren't planned yet can be scored.
 * → { items, uses, reason, stillNeed }
 *   uses: everything it takes that was bought in an earlier week than its own
 *     [{ key, name, unit, before, used, finishes, useBy, keeps, fresh, packageAmount }]
 *   items: the uses that earn a reason (fresh, or finished), finished first
 *   reason: "Uses the rest of the green beans", or null
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
 * Runs the window: lots from the lists, then every cook entry in date order.
 * Days before today count as cooked; later ones are taken in order the same way.
 * → { bought, byEntry: { [entryId]: { date, weekStart, ...mealUses } }, end }
 *   bought: the lots as bought; end: the state after the last meal.
 */
export function inferOnHand({ lists = [], plans = [] } = {}) {
  const bought = lotsFromLists(lists)
  let state = { lots: bought.map((l) => ({ ...l })) }
  const byEntry = {}
  for (const meal of mealsFromPlans(plans)) {
    const { result } = runMeal(state, meal.recipe, meal.servings, meal.date)
    byEntry[meal.id] = { date: meal.date, weekStart: meal.weekStart, ...result }
    state = applyMeal(state, meal.recipe, meal.servings, meal.date)
  }
  return { bought, byEntry, end: state }
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

/**
 * Up to two items, finished ones first: "Uses the rest of the green beans",
 * "Uses leftover green onions", "Uses the rest of the green beans and
 * leftover green onions", "Uses the rest of the feta and dill". null if none.
 */
export function reasonText(items = []) {
  const [a, b] = items
  if (!a) return null
  const first = a.finishes ? `the rest of the ${a.name}` : `leftover ${a.name}`
  if (!b) return `Uses ${first}`
  let second = b.name
  if (b.finishes && !a.finishes) second = `the rest of the ${b.name}`
  if (!b.finishes && a.finishes) second = `leftover ${b.name}`
  return `Uses ${first} and ${second}`
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

/** The preselected "How much is left?" answer for an amount out of what was bought. */
function leftAnswer(before, packageAmount) {
  const share = packageAmount > 0 ? before / packageAmount : 0
  if (share < 0.35) return LEFT.little
  if (share < 0.65) return LEFT.half
  return LEFT.plenty
}

/**
 * A meal's on-hand data as the Week page's rollover pieces take it (the same
 * shape as the sample data in rolloverPreview.js), or null when it earns no
 * reason. Real data: no dollar amounts (savings null, step 8), no Sample tag,
 * no "Update what's left" yet (step 5c).
 */
export function rolloverFor(meal, today) {
  if (!meal?.items?.length || !meal.reason) return null
  return {
    sample: false,
    canUpdate: false,
    savings: null,
    reason: meal.reason,
    stillNeed: meal.stillNeed ?? [],
    items: meal.items.map((u) => {
      const label = useByLabel(u.useBy, u.keeps, today)
      return {
        key: u.key,
        name: u.name,
        amount: amountText(u.key, u.before, u.name),
        useBy: label?.text ?? null,
        soon: !!label?.soon,
        left: leftAnswer(u.before, u.packageAmount),
        finishes: u.finishes,
      }
    }),
  }
}

/**
 * Rollovers for the meals of a shown week, by entry id: on the current week
 * from today on, and on next week. Past weeks and past days get none.
 */
export function weekRollovers(onHand, { weekStart, thisWeek, today }) {
  const out = {}
  if (!onHand || (weekStart !== thisWeek && weekStart !== addDays(thisWeek, 7))) return out
  for (const [id, meal] of Object.entries(onHand.byEntry ?? {})) {
    if (meal.weekStart !== weekStart || meal.date < today) continue
    const rollover = rolloverFor(meal, today)
    if (rollover) out[id] = rollover
  }
  return out
}
