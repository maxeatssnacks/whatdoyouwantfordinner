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
// - Corrections (step 5c, on_hand_adjustments, migration 018): a "How much is
//   left?" answer is an anchor. At the start of its day (as_of), the amount
//   left of that ingredient from earlier weeks than that day's week becomes
//   the answer: less than inferred comes off the oldest lots first, more goes
//   onto the newest live lot; use-by dates don't change. Later meals use from
//   it and later purchases add to it. Without rows, the pure inference.
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
 * ignored), with a date and an amount. → [{ key, asOf, amount, answer }]
 */
export function anchorsFrom(adjustments = []) {
  const out = []
  for (const a of adjustments) {
    const entry = entryById(a?.ingredient_key)
    const amount = Number(a?.amount)
    if (!entry || entry.staple || entry.skip || a.unit !== entry.unit || !parseDate(a.as_of) || !(amount >= 0)) continue
    out.push({ key: entry.id, asOf: a.as_of, amount, answer: a.answer ?? null })
  }
  return out.sort((a, b) => a.asOf.localeCompare(b.asOf) || a.key.localeCompare(b.key))
}

// The lots a correction on `date` is about: that key's, bought in an earlier
// week than the date's, and not past their use-by (finished ones included, so
// "more" has somewhere to go). Oldest first.
function anchorLots(state, key, date) {
  const week = weekStartOf(date)
  return state.lots.filter((l) => l.key === key && l.weekStart < week && date <= l.useBy)
}

// Sets that key's amount from earlier weeks to the answer, at the start of
// its day. Mutates the state's lots.
function applyAnchor(state, anchor) {
  const lots = anchorLots(state, anchor.key, anchor.asOf)
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
  for (const lot of lots) if (lot.amount < FINISHED_SHARE * lot.size) lot.amount = 0
}

// What's left from earlier weeks of each key on `date` (its live lots): the
// amount and what those lots were bought as. → { [key]: { amount, packageAmount } }
function amountsOn(state, date) {
  const out = {}
  for (const lot of state.lots) {
    if (lot.weekStart >= weekStartOf(date) || !isLive(lot, date)) continue
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
 * Runs the window: lots from the lists, then corrections (at the start of
 * their day) and every cook entry in date order. Days before today count as
 * cooked; later ones are taken in order the same way.
 * → { bought, byEntry: { [entryId]: { date, weekStart, ...mealUses } }, end, now }
 *   bought: the lots as bought; end: the state after the last meal;
 *   now (with `today`): per key, what's left from earlier weeks at the start
 *   of today: { inferred (before today's correction), amount (after it),
 *   packageAmount, answer (today's, if any) }.
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
  const takeNow = () => {
    if (now || !today) return
    anchorThrough(addDays(today, -1))
    const before = amountsOn(state, today)
    const answers = anchors.filter((a) => a.asOf === today)
    anchorThrough(today)
    const after = amountsOn(state, today)
    now = {}
    for (const key of new Set([...Object.keys(before), ...answers.map((a) => a.key)])) {
      now[key] = {
        inferred: before[key]?.amount ?? 0,
        amount: after[key]?.amount ?? 0,
        packageAmount: before[key]?.packageAmount ?? after[key]?.packageAmount ?? 0,
        answer: answers.find((a) => a.key === key)?.answer ?? null,
      }
    }
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
  return { bought, byEntry, end: state, now: now ?? {} }
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

/** The preselected "How much is left?" answer (its label) for an amount out of what was bought. */
export function leftAnswer(amount, packageAmount) {
  const share = packageAmount > 0 ? amount / packageAmount : 0
  if (share < 0.35) return 'A little'
  if (share < 0.65) return 'About half'
  return 'Plenty'
}

/** How many items the meal sheet and the popover list (the reason names up to two). */
export const SHOWN_ITEMS = 3

/**
 * A meal's on-hand data as the Week page's rollover pieces take it (the same
 * shape as the sample data in rolloverPreview.js), or null when it earns no
 * reason. Real data: no dollar amounts (savings null, step 8), no Sample tag.
 * Up to 3 items: finished ones first, then the soonest use-by; allItems has
 * every item that earns a reason, in that order (the sheet keeps the rows it
 * opened "How much is left?" with, wherever an answer moves them).
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
      name: u.name,
      amount: amountText(u.key, u.before, u.name),
      useBy: label?.text ?? null,
      soon: !!label?.soon,
      left: leftAnswer(u.before, u.packageAmount),
      finishes: u.finishes,
    }
    const n = now?.[u.key]
    if (n && n.packageAmount > 0) {
      item.left = n.answer ? answerByKey(n.answer)?.label ?? item.left : leftAnswer(n.inferred, n.packageAmount)
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
