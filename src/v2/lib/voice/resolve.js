// From parse-changes' answer to changes the app can make (v2 build step 7a).
// Every ref, date, slot, recipe and on-hand key is checked here, on the
// device, before anything is written; anything that doesn't check out
// becomes a "Not changed" row with the reason. In 7a only on-hand changes
// are applied; the meal changes resolve and show as "Not done yet" (7b).
// Plain JS, so Node checks import it.
import { answerAmount, ANSWERS, plainName } from '../onHand.js'
import { entryById, findLineEntry, toEntryUnit, unitKind } from '../packages.js'
import { mealTypesMatch } from '../../../lib/utils.js'
import { DEFAULT_SLOTS } from './context.js'
import { calendar, dayNameOf, saidDate } from './dates.js'
import { capitalize, dayLabel, onHandTitle, slotLabel } from './words.js'

export const CHANGE_TYPES = ['on_hand', 'eating_out', 'skip', 'move', 'swap', 'add']
/** The change types this round applies; the others show as "Not done yet". */
export const APPLIED_TYPES = new Set(['on_hand'])

const ANSWER_KEYS = new Set(ANSWERS.map((a) => a.key))
const COUNTED_UNITS = new Set(['each', 'egg', 'muffin'])
const EPSILON = 1e-6
const round2 = (n) => Math.round(n * 100) / 100
const longDay = (date) => capitalize(dayNameOf(date))
const quoted = (s) => `“${String(s ?? '').trim()}”`

/**
 * A said amount in the entry's unit, or null. Plurals count too ("2
 * lemons", "6 eggs"): for things counted one by one, a unit that isn't a
 * weight or volume is a count of them.
 */
function saidAmount(entry, amount, unit) {
  const n = Number(amount)
  if (amount == null || !Number.isFinite(n) || n < 0 || !unit) return null
  const u = String(unit).trim().toLowerCase()
  const converted = toEntryUnit(entry, n, u) ?? toEntryUnit(entry, n, u.replace(/(?<=[^aeiou])es$|s$/, ''))
  if (converted != null) return converted
  return COUNTED_UNITS.has(entry.unit) && !['weight', 'volume'].includes(unitKind(u)) ? n : null
}

/**
 * → { items, types } where items are, in the order said:
 *   { id, type, status: 'apply' | 'not_changed' | 'not_done', said, reason?,
 *     eyebrow, was?, title, line?, ...what the change needs }
 * and types counts the model's changes by type ({ on_hand: 2, eating_out: 1 }).
 * `items` (context's on-hand items), `refs` (context's meal refs), `recipes`
 * (what the person can plan), `slots` (their slot names).
 */
export function resolveChanges(answer, { today, refs = {}, items = {}, recipes = [], slots = DEFAULT_SLOTS, applied = APPLIED_TYPES } = {}) {
  const changes = Array.isArray(answer?.changes) ? answer.changes : []
  const notUnderstood = Array.isArray(answer?.not_understood) ? answer.not_understood : []
  const days = new Set(calendar(today).map((d) => d.date))
  const slotNames = slots?.length ? slots : DEFAULT_SLOTS
  const allMeals = Object.values(refs)
  const mealsAt = (date, slot) => allMeals.filter((r) => r.date === date && mealTypesMatch(r.slot, slot))
  const slotOf = (name) => (name ? slotNames.find((s) => mealTypesMatch(s, name)) ?? null : null)
  const recipeByTitle = (title) => {
    const t = String(title ?? '').trim().toLowerCase()
    return t ? recipes.find((r) => String(r.title ?? '').trim().toLowerCase() === t) ?? null : null
  }
  /** "Saturday’s dinner is Cheddar broccoli frittata" / "Wednesday has the chicken orzo leftovers" */
  const takenBy = (meal) => (meal.isLeftover
    ? `${longDay(meal.date)} has the ${meal.title.toLowerCase()} leftovers`
    : `${longDay(meal.date)}’s ${meal.slot.toLowerCase()} is ${meal.title}`)

  const types = {}
  const out = []
  const notChanged = (c, reason) => ({ type: c.type ?? 'unknown', status: 'not_changed', said: c.said ?? '', reason, eyebrow: 'Not changed', title: reason, line: c.said ? quoted(c.said) : null })

  // A date the change names: the words win over the model's date when they
  // name one day ("tonight", "tomorrow", a weekday, "next Friday").
  const dateFor = (c, modelDate) => saidDate(c.said, today)?.date ?? modelDate ?? null
  const dateProblem = (date) => {
    if (!date) return 'Didn’t catch which day'
    if (date < today) return `${longDay(date)} has passed`
    if (!days.has(date)) return 'That’s more than two weeks away'
    return null
  }

  // The planned meal a change is about: its ref, unless the words name
  // another day, then the meal in the same slot that day. → { meal } | { reason }
  const mealFor = (c, { checkWords = true } = {}) => {
    if (!c.meal) return { reason: 'Didn’t catch which meal' }
    let meal = refs[c.meal]
    if (!meal) return { reason: 'Couldn’t find that meal' }
    const said = checkWords ? saidDate(c.said, today) : null
    if (said && said.date !== meal.date) {
      const there = mealsAt(said.date, meal.slot)
      if (there.length !== 1) return { reason: there.length ? `Two meals on ${longDay(said.date)}; say which` : `No ${meal.slot.toLowerCase()} planned on ${longDay(said.date)}` }
      meal = there[0]
    }
    return { meal }
  }

  // A ref the context doesn't have counts as none when the change also names
  // a day (the model has filled meal with "<UNKNOWN>" next to the right date).
  const namesDay = (c) => !!(c.date || saidDate(c.said, today))
  const hasRef = (c) => !!c.meal && (!!refs[c.meal] || !namesDay(c))

  // The planned meal in the slot a change names by its date and slot instead
  // of a ref (the model does this for swaps too). → { meal } | { reason }
  const mealInSlot = (c) => {
    const date = dateFor(c, c.date)
    const slot = slotOf(c.slot ?? 'Dinner')
    const problem = dateProblem(date) ?? (slot ? null : 'Didn’t catch which meal')
    if (problem) return { reason: problem }
    const there = mealsAt(date, slot)
    if (there.length > 1) return { reason: `Two meals on ${longDay(date)}; say which` }
    return there.length ? { meal: there[0] } : { reason: `Nothing planned for ${slotLabel(date, slot)}` }
  }

  for (const c of changes) {
    const type = CHANGE_TYPES.includes(c?.type) ? c.type : null
    if (!type) {
      out.push(notChanged(c ?? {}, 'Didn’t catch that'))
      continue
    }
    types[type] = (types[type] ?? 0) + 1
    const said = String(c.said ?? '')
    const status = applied.has(type) ? 'apply' : 'not_done'

    if (type === 'on_hand') {
      const words = String(c.item ?? '').trim()
      const key = c.key && items[c.key] ? c.key : findLineEntry(words)?.entry?.id ?? (c.key && entryById(c.key) ? c.key : null)
      const entry = key ? entryById(key) : null
      const label = capitalize(words || (entry ? plainName(entry.display ?? entry.id.replace(/-/g, ' ')) : 'That'))
      if (entry?.staple) {
        out.push(notChanged(c, `${label} is a pantry staple; it isn’t tracked`))
        continue
      }
      const item = key ? items[key] : null
      if (!item) {
        out.push(notChanged(c, `${label} isn’t on hand from earlier weeks`))
        continue
      }
      // A number that converts to the entry's unit is kept as said; otherwise the answer.
      let answerKey = ANSWER_KEYS.has(c.answer) ? c.answer : null
      let amount = null
      const converted = saidAmount(entry, c.amount, c.unit)
      if (converted != null) {
        answerKey = 'amount'
        amount = COUNTED_UNITS.has(entry.unit) ? Math.round(converted) : round2(converted)
      }
      if (!answerKey) {
        out.push(notChanged(c, `Didn’t catch how much ${item.name} is left`))
        continue
      }
      if (answerKey !== 'amount') amount = answerAmount(answerKey, { key, packageAmount: item.packageAmount })
      if (item.answer && (item.answer === answerKey || answerKey === 'amount') && Math.abs((item.amount ?? 0) - amount) < EPSILON) {
        out.push(notChanged(c, `${capitalize(item.name)} is already set to that`))
        continue
      }
      const change = { key, name: item.name, answer: answerKey, amount }
      out.push({
        type,
        status,
        said,
        ...change,
        unit: item.unit,
        inferred: item.inferred,
        packageAmount: item.packageAmount,
        before: { amount: item.amount, answer: item.answer, left: item.left },
        eyebrow: 'On hand',
        title: onHandTitle(change),
        line: `Was ${item.left.charAt(0).toLowerCase()}${item.left.slice(1)}`,
      })
      continue
    }

    if (type === 'eating_out' || type === 'skip') {
      const what = type === 'eating_out' ? 'Eating out' : 'Skipped'
      let meal = null
      let date = null
      let slot = null
      if (hasRef(c)) {
        const found = mealFor(c)
        if (found.reason) {
          out.push(notChanged(c, found.reason))
          continue
        }
        meal = found.meal
        date = meal.date
        slot = meal.slot
      } else {
        date = dateFor(c, c.date)
        slot = slotOf(c.slot ?? 'Dinner')
        const problem = dateProblem(date) ?? (slot ? null : 'Didn’t catch which meal')
        if (problem) {
          out.push(notChanged(c, problem))
          continue
        }
        const there = mealsAt(date, slot)
        if (there.length > 1) {
          out.push(notChanged(c, `Two meals on ${longDay(date)}; say which`))
          continue
        }
        meal = there[0] ?? null
        if (!meal && type === 'skip') {
          out.push(notChanged(c, `Nothing planned for ${slotLabel(date, slot)}`))
          continue
        }
      }
      out.push({
        type,
        status,
        said,
        ref: meal?.ref ?? null,
        entryId: meal?.entryId ?? null,
        date,
        slot,
        eyebrow: slotLabel(date, slot),
        was: meal?.title ?? null,
        title: what,
        line: status === 'not_done' ? 'Not done yet' : null,
      })
      continue
    }

    if (type === 'move') {
      const found = mealFor(c, { checkWords: false })
      if (found.reason) {
        out.push(notChanged(c, found.reason))
        continue
      }
      const meal = found.meal
      const fromWords = saidDate(c.said, today)?.date
      const toDate = fromWords && fromWords !== meal.date ? fromWords : c.to_date ?? null
      const toSlot = slotOf(c.to_slot) ?? meal.slot
      const problem = dateProblem(toDate)
      if (problem) {
        out.push(notChanged(c, problem))
        continue
      }
      if (toDate === meal.date && mealTypesMatch(toSlot, meal.slot)) {
        out.push(notChanged(c, `${meal.title} is already on ${longDay(toDate)}`))
        continue
      }
      // Its own leftovers don't count: they move with it.
      const blocking = mealsAt(toDate, toSlot).filter((m) => !(m.isLeftover && m.cookEntryId === meal.entryId))
      if (blocking.length) {
        out.push(notChanged(c, takenBy(blocking[0])))
        continue
      }
      out.push({
        type,
        status,
        said,
        ref: meal.ref,
        entryId: meal.entryId,
        date: meal.date,
        slot: meal.slot,
        toDate,
        toSlot,
        eyebrow: slotLabel(meal.date, meal.slot),
        was: null,
        title: `${meal.title} to ${dayLabel(toDate)}`,
        line: status === 'not_done' ? 'Not done yet' : null,
      })
      continue
    }

    if (type === 'swap') {
      const found = !hasRef(c) && namesDay(c) ? mealInSlot(c) : mealFor(c)
      if (found.reason) {
        out.push(notChanged(c, found.reason))
        continue
      }
      const meal = found.meal
      if (meal.isLeftover) {
        out.push(notChanged(c, `${slotLabel(meal.date, meal.slot)} is leftovers; swap the meal they come from`))
        continue
      }
      let recipe = null
      if (c.recipe) {
        recipe = recipeByTitle(c.recipe)
        if (!recipe) {
          out.push(notChanged(c, `No recipe called ${quoted(c.recipe)}`))
          continue
        }
        if (recipe.id === meal.recipeId) {
          out.push(notChanged(c, `${capitalize(dayNameOf(meal.date))} is already ${recipe.title}`))
          continue
        }
      }
      const withWords = (Array.isArray(c.with) ? c.with : []).map((w) => String(w).trim()).filter(Boolean)
      const useUp = (Array.isArray(c.use_up) ? c.use_up : []).map((w) => String(w).trim()).filter(Boolean)
        .map((w) => (items[w] ? w : findLineEntry(w)?.entry?.id ?? w))
      const wish = recipe ? recipe.title
        : withWords.length ? `Something with ${withWords.join(' and ')}`
          : useUp.length ? `Something that uses up the ${useUp.map((k) => items[k]?.name ?? k.replace(/-/g, ' ')).join(' and ')}`
            : 'Something else'
      out.push({
        type,
        status,
        said,
        ref: meal.ref,
        entryId: meal.entryId,
        date: meal.date,
        slot: meal.slot,
        recipeId: recipe?.id ?? null,
        with: withWords,
        useUp,
        eyebrow: slotLabel(meal.date, meal.slot),
        was: meal.title,
        title: wish,
        line: status === 'not_done' ? 'Not done yet' : null,
      })
      continue
    }

    // add
    const date = dateFor(c, c.date)
    const slot = slotOf(c.slot ?? 'Dinner')
    const problem = dateProblem(date) ?? (slot ? null : 'Didn’t catch which meal')
    if (problem) {
      out.push(notChanged(c, problem))
      continue
    }
    const there = mealsAt(date, slot)
    if (there.length) {
      out.push(notChanged(c, takenBy(there[0])))
      continue
    }
    const recipe = c.recipe ? recipeByTitle(c.recipe) : null
    if (c.recipe && !recipe) {
      out.push(notChanged(c, `No recipe called ${quoted(c.recipe)}`))
      continue
    }
    const text = String(c.text ?? '').trim()
    if (!recipe && !text) {
      out.push(notChanged(c, 'Didn’t catch what to add'))
      continue
    }
    out.push({
      type,
      status,
      said,
      date,
      slot,
      recipeId: recipe?.id ?? null,
      text: recipe ? null : text,
      eyebrow: slotLabel(date, slot),
      was: null,
      title: recipe ? recipe.title : capitalize(text),
      line: status === 'not_done' ? 'Not done yet' : null,
    })
  }

  // The same food, or the same meal, said twice: the later one counts.
  const seen = new Map()
  for (let i = out.length - 1; i >= 0; i--) {
    const it = out[i]
    if (it.status === 'not_changed') continue
    const target = it.type === 'on_hand' ? `key:${it.key}` : it.entryId ? `meal:${it.entryId}` : `slot:${it.date}|${String(it.slot).toLowerCase()}`
    if (seen.has(target)) {
      out[i] = { ...notChanged(it, 'Changed again later in what you said'), type: it.type }
    } else {
      seen.set(target, i)
    }
  }

  for (const n of notUnderstood) {
    const said = String(n?.said ?? '').trim()
    const why = String(n?.why ?? '').trim()
    out.push(notChanged({ type: 'unknown', said }, why && why !== 'not a change' ? capitalize(why) : 'Didn’t catch that'))
  }

  return { items: out.map((it, i) => ({ id: `c${i + 1}`, ...it })), types }
}

/**
 * Nothing in the words was a change (A3's "Didn't catch that"): no changes,
 * and nothing that sounded like one ("which meal?" is a reason to show, not
 * nothing).
 */
export function nothingUnderstood(answer) {
  const changes = Array.isArray(answer?.changes) ? answer.changes : []
  const notUnderstood = Array.isArray(answer?.not_understood) ? answer.not_understood : []
  return changes.length === 0 && notUnderstood.every((n) => !String(n?.why ?? '').trim() || /not a change/i.test(n.why))
}

/** Counts for the bar and analytics. */
export function resolvedCounts(items = []) {
  const count = (s) => items.filter((i) => i.status === s).length
  return { apply: count('apply'), notChanged: count('not_changed'), notDone: count('not_done') }
}

/** "on_hand:2,eating_out:1" (analytics: labels and counts only). */
export function typesLabel(types = {}) {
  return CHANGE_TYPES.filter((t) => types[t]).map((t) => `${t}:${types[t]}`).join(',')
}
