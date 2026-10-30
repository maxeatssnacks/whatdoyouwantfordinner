// The voice test set's week (step 7a; research report section 3), shared by
// npm run check:voice and scripts/voice-live.mjs so both build the same
// context. The design's week: today is Thu 15 Oct 2026, evening.
//
// Meals from today: m1 Thu dinner Black bean tacos; m2 Fri breakfast Yogurt
// + Granola (quick); m3 Fri dinner Salmon rice bowls; m4 Sat lunch tacos
// (leftover of m1); m5 Sat dinner Cheddar broccoli frittata; m6 Sun dinner
// frittata (leftover of m5); m7 Tue dinner Chicken orzo; m8 Wed dinner
// chicken orzo (leftover of m7). Monday's past meal never reaches the context.
// On hand from this week's list (bought on its Sunday, 11 Oct, every line
// checked off; since 7a4 what's bought counts from the week's start, so last
// week's fresh things would be gone by Thursday): feta, eggs, lemons, dill,
// green onions, kale, Greek yogurt. The package table has
// no cheddar, spinach or parsley, so the research set's spinach and parsley
// became kale and dill; cheddar stays as a thing that isn't on hand.
import { inferOnHand, prepareOnHand } from '../src/v2/lib/onHand.js'
import { entryById } from '../src/v2/lib/packages.js'
import { buildVoiceContext } from '../src/v2/lib/voice/context.js'

export const USER = 'u-me'
export const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

const recipe = (id, title, extra = {}) => ({ id, title, servings: 3, ingredients: [], recipe_type: 'standard', created_by: 'u-library', ...extra })
export const RECIPES = [
  recipe('r-tacos', 'Black bean tacos'),
  recipe('r-salmon', 'Salmon rice bowls'),
  recipe('r-frittata', 'Cheddar broccoli frittata'),
  recipe('r-feta-frittata', 'Broccoli & feta frittata'),
  recipe('r-orzo', 'Chicken orzo'),
  recipe('r-kale-orzo', 'Kale & feta orzo'),
  recipe('r-thighs', 'Sheet-pan chicken thighs'),
  recipe('r-soup', 'Lemon chicken soup'),
  recipe('r-pork', 'Hot honey pork stir fry'),
  recipe('r-taco-mac', 'Taco Mac'),
  recipe('r-yogurt', 'Yogurt + Granola', { recipe_type: 'quick', servings: 1, created_by: USER }),
  // Someone else's older public quick meal (the open thread): never sent.
  recipe('r-other-quick', 'Toast + Jam', { recipe_type: 'quick', servings: 1, created_by: 'u-someone' }),
]
const R = Object.fromEntries(RECIPES.map((r) => [r.id, r]))

const entry = (id, day, mealType, recipeId, extra = {}) => ({
  id, day_of_week: day, meal_type: mealType, recipe_id: recipeId, recipe: R[recipeId], is_leftover: false, original_entry_id: null, servings: 3, ...extra,
})
const leftover = (id, day, recipeId, of) => entry(id, day, 'Dinner', recipeId, { is_leftover: true, original_entry_id: of })

export const PLANS = [
  {
    id: 'plan-w0',
    week_start_date: '2026-10-11',
    entries: [
      entry('e-mon', 'monday', 'Dinner', 'r-pork'),
      entry('e-thu', 'thursday', 'Dinner', 'r-tacos'),
      entry('e-fri-b', 'friday', 'Breakfast', 'r-yogurt', { servings: 1 }),
      entry('e-fri', 'friday', 'Dinner', 'r-salmon'),
      { ...leftover('e-sat-l', 'saturday', 'r-tacos', 'e-thu'), meal_type: 'Lunch' },
      entry('e-sat', 'saturday', 'Dinner', 'r-frittata'),
    ],
  },
  {
    id: 'plan-w1',
    week_start_date: '2026-10-18',
    entries: [
      leftover('e-sun', 'sunday', 'r-frittata', 'e-sat'),
      entry('e-tue', 'tuesday', 'Dinner', 'r-orzo'),
      leftover('e-wed', 'wednesday', 'r-orzo', 'e-tue'),
    ],
  },
]

// A line on a list: checked off (with what was bought) or not.
const line = (key, count, size, checked) => {
  const e = entryById(key)
  const pkg = { count, size, unit: e.unit, label: '', text: '' }
  return { key, name: e.display ?? key.replace(/-/g, ' '), package: pkg, have: false, staple: false, checked, ...(checked ? { bought: { package: pkg, need: count * size, needUnit: e.unit, on: '2026-10-12' } } : {}) }
}

/**
 * This week's list (the week of 11 Oct): [[key, count, size]], every line
 * checked off unless `checked` is false, first saved on `savedOn`. Whatever
 * the save or check-off day, it counts as bought on the week's Sunday (7a4).
 */
export function thisWeekList(lines, { checked = true, savedOn = '2026-10-10' } = {}) {
  return { id: 'list-w0', meal_plan_id: 'plan-w0', created_at: `${savedOn}T09:00:00`, meal_plan: { week_start_date: '2026-10-11' }, items: lines.map(([key, count, size]) => line(key, count, size, checked)) }
}
export const ON_HAND_ROWS = {
  lists: [thisWeekList([['feta', 1, 8], ['egg', 1, 12], ['lemon', 2, 1], ['dill', 1, 1], ['green-onion', 1, 1], ['kale', 1, 1], ['greek-yogurt', 1, 32]])],
  plans: [{ id: 'plan-w_1', week_start_date: '2026-10-04', created_at: '2026-10-04T08:00:00', entries: [] }, ...PLANS],
  adjustments: [],
}

/**
 * The context, refs and on-hand items for a case: `today` (YYYY-MM-DD) at
 * `hour` local time, with optional extra correction rows, and `lists` in place
 * of the fixture's own (thisWeekList).
 */
export function fixtureContext({ today = '2026-10-15', hour = 19, adjustments = [], lists = null } = {}) {
  const [y, m, d] = today.split('-').map(Number)
  const weekStart = PLANS.find((p) => p.week_start_date <= today && today < addDays(p.week_start_date, 7))?.week_start_date ?? '2026-10-11'
  const onHand = inferOnHand(prepareOnHand({ ...ON_HAND_ROWS, lists: lists ?? ON_HAND_ROWS.lists, adjustments }, [], { weekStart }), { today })
  const built = buildVoiceContext({ now: new Date(y, m - 1, d, hour), today, plans: PLANS, onHand, recipes: RECIPES, slots: SLOTS, userId: USER })
  return { ...built, onHand, recipes: RECIPES, slots: SLOTS }
}

function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number)
  const x = new Date(y, m - 1, d + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** One line per resolved change, as the cases' `expect` lists them. */
export function summarize(item) {
  const s = item.status
  if (s === 'not_changed') return `[not_changed] ${item.reason}`
  const where = item.ref ?? `${item.date} ${item.slot}`
  switch (item.type) {
    case 'on_hand': return `[${s}] on_hand ${item.key} ${item.answer}${item.answer === 'amount' ? ` ${item.amount}` : ''}`
    case 'eating_out':
    case 'skip': return `[${s}] ${item.type} ${where}`
    case 'move': return `[${s}] move ${item.ref} → ${item.toDate} ${item.toSlot}`
    case 'swap': {
      const recipe = item.recipeId ? RECIPES.find((r) => r.id === item.recipeId)?.title : null
      const wish = recipe ?? (item.with?.length ? `with:${item.with.join('+')}` : item.useUp?.length ? `use_up:${item.useUp.join('+')}` : '-')
      return `[${s}] swap ${item.ref} ${wish}`
    }
    case 'add': {
      const recipe = item.recipeId ? RECIPES.find((r) => r.id === item.recipeId)?.title : null
      return `[${s}] add ${item.date} ${item.slot} ${recipe ?? item.text}`
    }
    default: return `[${s}] ${item.type}`
  }
}
