// A meal later this week short of something already bought this week (v2
// build step 7b). When a correction says a checked-off item is gone ("the
// kale's gone" on Thursday, and Saturday's dinner needs kale), the checked
// line stays as it was (it's the record of what was bought), and the missing
// amount goes back on this week's list as a line of its own to buy: "More
// kale · 1 bunch". Plain JS, so Node checks import it; useWeekShoppingList
// adds the lines after generateShoppingItems.
//
// The line's key is the entry's id with AGAIN after it ("kale:again"), so it
// never merges with the checked line, toggles on its own, and isn't a
// package entry: what's on hand doesn't count it as bought (it can't cover
// the meal it's for and take itself off the list again). Once that meal's
// day has passed it goes, or stays hidden when it was checked, like any
// checked line no meal needs.
import { entryById, choosePackage, formatPackage } from './packages.js'

export const AGAIN = ':again'
const EPSILON = 1e-6
const round2 = (n) => Math.round(n * 100) / 100

/** Whether a list line is a "more of" line. */
export const isAgainLine = (item) => typeof item?.key === 'string' && item.key.endsWith(AGAIN)

/**
 * What this week's meals from today on still need of each key after what's
 * on hand (every live lot, this week's list included) has gone to them, from
 * inferOnHand's byEntry supply. `titles`: entry id → meal title.
 * → { [key]: { amount, unit, meals: [title] } }
 */
export function weekShortfall(onHand, { weekStart, today, titles = {} } = {}) {
  const out = {}
  for (const [id, meal] of Object.entries(onHand?.byEntry ?? {})) {
    if (meal.weekStart !== weekStart || (today && meal.date < today)) continue
    for (const s of meal.supply ?? []) {
      const short = round2(s.need - s.got)
      if (!(short > EPSILON)) continue
      const k = (out[s.key] ??= { amount: 0, unit: s.unit, meals: [] })
      k.amount = round2(k.amount + short)
      const title = titles[id]
      if (title && !k.meals.includes(title)) k.meals.push(title)
    }
  }
  return out
}

/**
 * The list with a "more of" line for each key whose line is checked off and
 * whose meals are short (weekShortfall), right after that line. A gap under
 * a tenth of the smallest package (as the list treats on hand) adds nothing.
 * A "more of" line keeps what it was (checked, bought, Already have) by its
 * key from `previousItems`; a checked one no meal needs any more stays,
 * hidden. → a new array
 */
export function withShortfallLines(items = [], shortfall = {}, { previousItems = [], sizeChoices = {} } = {}) {
  const prevAgain = new Map((previousItems ?? []).filter(isAgainLine).map((p) => [p.key, p]))
  const base = items.filter((i) => !isAgainLine(i))
  const out = []
  const added = new Set()
  for (const item of base) {
    out.push(item)
    if (!item.checked || item.hidden || !item.key) continue
    const entry = entryById(item.key)
    const gap = shortfall[item.key]
    if (!entry?.sizes?.length || !gap || gap.unit !== entry.unit) continue
    const smallest = Math.min(...entry.sizes.map((s) => s.size))
    if (gap.amount < 0.1 * smallest) continue
    const key = `${item.key}${AGAIN}`
    const prev = prevAgain.get(key)
    const choice = sizeChoices?.[entry.id]
    const preferred = choice && choice.unit === entry.unit ? Number(choice.size) : null
    const p = choosePackage(entry, gap.amount, preferred)
    if (!p) continue
    const pkg = { count: p.count, size: p.size.size, unit: entry.unit, label: p.size.label, text: formatPackage(p) }
    const checked = !!prev?.checked
    out.push({
      name: `more ${item.name}`,
      amount: gap.amount,
      unit: entry.unit,
      parts: [{ amount: gap.amount, unit: entry.unit }],
      category: item.category,
      checked,
      key,
      again: item.key,
      need: gap.amount,
      needUnit: entry.unit,
      // A checked line keeps the package it was checked at.
      package: checked && prev?.bought?.package ? prev.bought.package : pkg,
      leftover: p.over,
      meals: gap.meals ?? [],
      have: prev?.haveSetByUser ? !!prev.have : false,
      haveSetByUser: !!prev?.haveSetByUser,
      staple: false,
      ...(checked && prev?.bought ? { bought: prev.bought } : {}),
    })
    added.add(key)
  }
  for (const [key, prev] of prevAgain) {
    if (!added.has(key) && prev.checked) out.push({ ...prev, hidden: true })
  }
  return out
}
