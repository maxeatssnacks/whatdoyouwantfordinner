// Assertions for what's on hand from earlier weeks (src/v2/lib/onHand.js):
// lots from saved lists, use by planned meals, reasons and their words.
// npm run check:on-hand
import {
  amountText,
  applyMeal,
  inferOnHand,
  lotsFromLists,
  mealUses,
  prepareOnHand,
  reasonText,
  rolloverFor,
  useByLabel,
  weekRollovers,
} from '../src/v2/lib/onHand.js'
import { entryById } from '../src/v2/lib/packages.js'
import { generateShoppingItems } from '../src/lib/utils.js'

let failed = 0
let passed = 0
function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
  } else {
    failed++
    console.log(`FAIL  ${name}\n      expected ${e}\n      got      ${a}`)
  }
}

// Weeks (Sunday starts): two back, last week, this week (today is Mon 10-19), next week.
const W_2 = '2026-10-04'
const W0 = '2026-10-11'
const W1 = '2026-10-18'
const W2 = '2026-10-25'
const TODAY = '2026-10-19'

const recipe = (title, servings, ingredients, extra = {}) => ({ id: title, title, servings, ingredients, ...extra })
const cook = (id, day, r, servings = null, mealType = 'dinner') => ({ id, day_of_week: day, meal_type: mealType, is_leftover: false, servings, recipe: r })
const left = (id, day, r, servings, of) => ({ id, day_of_week: day, meal_type: 'dinner', is_leftover: true, original_entry_id: of, servings, recipe: r })
const plan = (weekStart, entries) => ({ weekStart, entries })
const pkgItem = (key, count, size, extra = {}) => {
  const e = entryById(key)
  return { key, name: e.display ?? key.replace(/-/g, ' '), package: { count, size, unit: e.unit, label: '', text: '' }, have: false, staple: !!e.staple, checked: false, ...extra }
}
const list = (weekStart, savedOn, items) => ({ weekStart, created_at: `${savedOn}T12:00:00`, items })
const uses = (result, id) => result.byEntry[id]
const brief = (u) => u.items.map((i) => [i.key, i.before, i.used, i.finishes])

const fetaR = (oz) => recipe(`Feta ${oz}`, 1, [{ name: 'feta', amount: oz, unit: 'oz' }])

// ── Lots, used down in date order
{
  const r = inferOnHand({
    lists: [list(W0, W0, [pkgItem('feta', 1, 6)])],
    plans: [plan(W0, [cook('a', 'monday', fetaR(4))]), plan(W1, [cook('b', 'sunday', fetaR(3))])],
  })
  check('feta: 6 oz bought, a meal uses 4 (same week, so no reason)', brief(uses(r, 'a')), [])
  check('feta: 2 left, the next week\'s meal finishes it', brief(uses(r, 'b')), [['feta', 2, 2, true]])
  check('feta: its reason', uses(r, 'b').reason, 'Uses the rest of the feta')
  check('feta: nothing left after', r.end.lots.map((l) => l.amount), [0])
}
{
  const r = inferOnHand({
    lists: [list(W0, W0, [pkgItem('feta', 1, 6)])],
    plans: [plan(W0, [cook('a', 'monday', fetaR(4))]), plan(W1, [cook('b', 'monday', fetaR(3))])],
  })
  check('use-by: feta bought Sun 10-11 keeps 7 days; a meal on Mon 10-19 gets none', brief(uses(r, 'b')), [])
  check('use-by: and it\'s still there, unused, past its use-by', r.end.lots.map((l) => l.amount), [2])
}
{
  // The list was saved with a feta meal on it; the meal was removed later.
  const items = generateShoppingItems([cook('gone', 'monday', fetaR(5))])
  const r = inferOnHand({ lists: [list(W0, W0, items)], plans: [plan(W0, []), plan(W1, [cook('b', 'sunday', fetaR(3))])] })
  check('removed after shopping: the 6 oz bought stays on hand', brief(uses(r, 'b')), [['feta', 6, 3, false]])
  check('removed after shopping: "Uses leftover feta"', uses(r, 'b').reason, 'Uses leftover feta')
}
{
  const r4 = recipe('Feta bake', 4, [{ name: 'feta', amount: 4, unit: 'oz' }])
  const r = inferOnHand({
    lists: [list(W0, W0, [pkgItem('feta', 1, 6)])],
    plans: [plan(W0, [cook('a', 'monday', r4, 2)]), plan(W1, [cook('b', 'sunday', fetaR(1))])],
  })
  check('servings: 2 of a 4-serving recipe uses 2 oz, leaving 4', brief(uses(r, 'b')), [['feta', 4, 1, false]])
}
{
  const r4 = recipe('Feta bake', 4, [{ name: 'feta', amount: 4, unit: 'oz' }])
  const r = inferOnHand({
    lists: [list(W0, W0, [pkgItem('feta', 1, 6)])],
    plans: [plan(W0, [cook('a', 'monday', r4), left('l1', 'tuesday', r4, 4, 'a'), left('l2', 'wednesday', r4, 4, 'a')]), plan(W1, [cook('b', 'sunday', fetaR(1))])],
  })
  check('leftovers: their entries use nothing (the cook counted once)', brief(uses(r, 'b')), [['feta', 2, 1, false]])
}
{
  const lots = lotsFromLists([list(W0, W0, [
    pkgItem('olive-oil', 1, 16.9, { have: true }),
    pkgItem('vegetable-oil', 1, 48, { have: false }),
    pkgItem('feta', 1, 6, { have: true }),
  ])])
  check('not bought: staples (even moved out of Already have) and Already have', lots.length, 0)
}
{
  const lots = lotsFromLists([list(W0, W0, [
    pkgItem('feta', 1, 8, { checked: true, bought: { package: { count: 1, size: 6, unit: 'oz' }, need: 5, needUnit: 'oz', on: '2026-10-17' } }),
    pkgItem('ricotta', 1, 15, { checked: true, hidden: true, bought: { package: { count: 1, size: 15, unit: 'oz' }, need: 8, needUnit: 'oz', on: '2026-10-16' } }),
    pkgItem('sour-cream', 1, 8, { checked: true }),
  ])])
  check('checked: uses what was bought and that day (6 oz on 10-17, use by 10-24)', lots.find((l) => l.key === 'feta') && [lots.find((l) => l.key === 'feta').amount, lots.find((l) => l.key === 'feta').boughtOn, lots.find((l) => l.key === 'feta').useBy], [6, '2026-10-17', '2026-10-24'])
  check('checked: a hidden checked line still counts', lots.some((l) => l.key === 'ricotta'), true)
  check('checked: a line checked before 5a (no bought) uses its package and the list\'s day', [lots.find((l) => l.key === 'sour-cream').amount, lots.find((l) => l.key === 'sour-cream').boughtOn], [8, W0])
}
{
  const lots = lotsFromLists([list(W1, '2026-10-12', [pkgItem('feta', 1, 6)])])
  check('first save: never before its week starts', lots[0].boughtOn, W1)
  const old = lotsFromLists([list(W0, W0, [{ name: 'feta', unit: 'oz', amount: 6, checked: false, category: 'Dairy & Eggs' }])])
  check('old lists (before step 4): ignored', old.length, 0)
}
{
  const eggR = (n, servings = 1) => recipe(`Eggs ${n}`, servings, [{ name: 'egg', amount: n, unit: 'whole' }])
  const r = inferOnHand({
    lists: [list(W0, W0, [pkgItem('egg', 1, 6)])],
    plans: [plan(W0, [cook('a', 'monday', eggR(1, 4), 3)]), plan(W1, [cook('b', 'sunday', eggR(5))])],
  })
  check('eggs: 0.75 of an egg rounds up to 1, leaving 5', brief(uses(r, 'b')), [['egg', 5, 5, true]])
  check('eggs: "2 eggs" style amount', rolloverFor(uses(r, 'b'), TODAY).items[0].amount, '5 eggs')
}
{
  const quick = recipe('Yogurt bowl', 1, [{ name: 'Greek yogurt', amount: 170, unit: 'g' }, { name: 'apple', amount: 1, unit: 'whole' }], { recipe_type: 'quick' })
  const r = inferOnHand({
    lists: [list(W0, W0, [pkgItem('greek-yogurt', 1, 16)])],
    plans: [plan(W0, []), plan(W1, [cook('q', 'monday', quick, 1, 'breakfast')])],
  })
  check('quick meal: uses last week\'s yogurt', brief(uses(r, 'q')), [['greek-yogurt', 16, 6, false]])
  check('quick meal: reason and still need', [uses(r, 'q').reason, uses(r, 'q').stillNeed], ['Uses leftover greek yogurt', ['apple']])
}
{
  const handful = recipe('Salad', 1, [{ name: 'feta', amount: 1, unit: 'handful' }])
  const r = inferOnHand({ lists: [list(W0, W0, [pkgItem('feta', 1, 6)])], plans: [plan(W0, []), plan(W1, [cook('b', 'sunday', handful)])] })
  check('won\'t convert: "1 handful" takes the whole lot', brief(uses(r, 'b')), [['feta', 6, 6, true]])
}
{
  const r = inferOnHand({ lists: [list(W0, W0, [pkgItem('feta', 1, 6)])], plans: [plan(W0, []), plan(W1, [cook('b', 'sunday', fetaR(5.5))])] })
  check('under 10% of a package left (0.5 of 6 oz) counts as finished', brief(uses(r, 'b')), [['feta', 6, 5.5, true]])
}
{
  const honeyR = (oz) => recipe(`Honey ${oz}`, 1, [{ name: 'honey', amount: oz, unit: 'oz' }])
  const r = inferOnHand({
    lists: [list(W_2, W_2, [pkgItem('honey', 1, 12)]), list(W0, W0, [pkgItem('honey', 1, 12)])],
    plans: [plan(W_2, []), plan(W0, []), plan(W1, [cook('b', 'sunday', honeyR(14))])],
  })
  check('FIFO: the older lot goes first (12 of it, then 2 of the newer)', r.end.lots.map((l) => [l.weekStart, l.amount]), [[W_2, 0], [W0, 10]])
  check('pantry: honey used but not finished gives no reason', [uses(r, 'b').uses.length, uses(r, 'b').items.length, uses(r, 'b').reason], [1, 0, null])
  const done = inferOnHand({
    lists: [list(W0, W0, [pkgItem('honey', 1, 12)])],
    plans: [plan(W0, [cook('a', 'monday', honeyR(10))]), plan(W1, [cook('b', 'sunday', honeyR(3))])],
  })
  check('pantry: finished, it earns a reason', uses(done, 'b').reason, 'Uses the rest of the honey')
}
{
  // This week's list leaves green beans over; next week's meal is named from
  // it after this week's meals take their share. Within this week: no reason.
  const beans = (oz) => recipe(`Beans ${oz}`, 1, [{ name: 'green beans', amount: oz, unit: 'oz' }])
  const r = inferOnHand({
    lists: [list(W1, W1, [pkgItem('green-bean', 1, 16, { name: 'green beans' })])],
    plans: [plan(W1, [cook('mon', 'monday', beans(4)), cook('thu', 'thursday', beans(3.2))]), plan(W2, [cook('next', 'sunday', beans(6))])],
  })
  check('within a week: sharing this week\'s list is never a reason', [brief(uses(r, 'mon')), brief(uses(r, 'thu'))], [[], []])
  check('next week: named from this week\'s list after this week\'s meals (16 − 7.2 = 8.8)', brief(uses(r, 'next')), [['green-bean', 8.8, 6, false]])
  check('next week: "Uses leftover green beans"', uses(r, 'next').reason, 'Uses leftover green beans')
  const shown = weekRollovers(r, { weekStart: W1, thisWeek: W1, today: TODAY })
  check('weekRollovers: none this week', Object.keys(shown), [])
  const next = weekRollovers(r, { weekStart: W2, thisWeek: W1, today: TODAY })
  check('weekRollovers: next week has its meal', Object.keys(next), ['next'])
  check('weekRollovers: two weeks ahead and past weeks get none', [Object.keys(weekRollovers(r, { weekStart: '2026-11-01', thisWeek: W1, today: TODAY })), Object.keys(weekRollovers(r, { weekStart: W0, thisWeek: W1, today: TODAY }))], [[], []])
}
{
  // Past days of the current week get no reason, today and later do.
  const r = inferOnHand({
    lists: [list(W0, '2026-10-17', [pkgItem('feta', 1, 8)])],
    plans: [plan(W0, []), plan(W1, [cook('sun', 'sunday', fetaR(2)), cook('mon', 'monday', fetaR(2))])],
  })
  check('past days: Sunday used feta (it counts as cooked) but shows no reason; Monday does', Object.keys(weekRollovers(r, { weekStart: W1, thisWeek: W1, today: TODAY })), ['mon'])
  check('past days: Monday sees what Sunday left (8 − 2 = 6)', brief(uses(r, 'mon')), [['feta', 6, 2, false]])
}
{
  // The flows fixture's shape: last week's real list from its meal; this week's meal finishes it.
  const firecracker = recipe('Firecracker Meatballs', 2, [{ name: 'Green Beans', amount: 6, unit: 'oz' }, { name: 'Soy Sauce', amount: 2, unit: 'tbsp' }, { name: 'Salt', amount: 0.5, unit: 'tsp' }])
  const hotHoney = recipe('Hot Honey Pork Stir Fry', 5, [{ name: 'green beans', amount: 12, unit: 'oz' }, { name: 'ground pork', amount: 2, unit: 'lb' }, { name: 'soy sauce', amount: 3, unit: 'tbsp' }, { name: 'oil', amount: 1, unit: 'tbsp' }, { name: 'red bell pepper', amount: 1, unit: 'whole' }])
  const lastWeek = [cook('fc', 'thursday', firecracker, 2)]
  const items = generateShoppingItems(lastWeek)
  const r = inferOnHand({ lists: [list(W0, '2026-10-14', items)], plans: [plan(W0, lastWeek), plan(W1, [cook('hh', 'monday', hotHoney, 3)])] })
  check('fixture shape: 6 oz of a 12 oz bag left; Monday\'s stir fry finishes it', brief(uses(r, 'hh')), [['green-bean', 6, 6, true]])
  check('fixture shape: soy sauce is pantry and not finished, so only the beans are named', uses(r, 'hh').reason, 'Uses the rest of the green beans')
  check('fixture shape: still need leaves out the beans, soy sauce (on hand) and oil (staple)', uses(r, 'hh').stillNeed, ['ground pork', 'red bell pepper'])
  const roll = rolloverFor(uses(r, 'hh'), TODAY)
  check('fixture shape: the sheet\'s item (amount and use-by)', roll.items.map((i) => [i.name, i.amount, i.useBy, i.soon]), [['green beans', 'About 6 oz', 'Use by Wed', true]])
  check('rolloverFor: real data has no dollars, no Sample tag, no "Update what\'s left" yet', [roll.savings, roll.sample, roll.canUpdate], [null, false, false])
}
{
  const onHand = { lots: lotsFromLists([list(W0, W0, [pkgItem('feta', 1, 6)])]) }
  const before = JSON.stringify(onHand)
  const m = mealUses(fetaR(2), 1, onHand, '2026-10-18')
  check('mealUses: doesn\'t change the state it reads', JSON.stringify(onHand), before)
  check('mealUses: takes a recipe (a meal that isn\'t planned)', [m.reason, m.items[0].before], ['Uses leftover feta', 6])
  const after = applyMeal(onHand, fetaR(2), 1, '2026-10-18')
  check('applyMeal: returns the state after the meal', after.lots.map((l) => l.amount), [4])
}
{
  const read = {
    plans: [{ id: 'p0', week_start_date: W0, entries: [] }, { id: 'p1', week_start_date: W1, entries: [cook('old', 'monday', fetaR(1))] }, { id: 'p1b', week_start_date: W1, entries: [] }],
    lists: [
      { id: 'l0', meal_plan_id: 'p0', created_at: `${W0}T09:00:00`, items: [pkgItem('feta', 1, 6)], meal_plan: { week_start_date: W0 } },
      { id: 'l0b', meal_plan_id: 'p0', created_at: `${W0}T10:00:00`, items: [pkgItem('feta', 1, 6)], meal_plan: { week_start_date: W0 } },
    ],
  }
  const prepared = prepareOnHand(read, [{ id: 'p1', week_start_date: W1, entries: [cook('fresh', 'tuesday', fetaR(2))] }])
  check('prepareOnHand: one plan per week (the oldest), fresher entries from the page replace the read\'s', prepared.plans.map((p) => [p.weekStart, p.entries.map((e) => e.id)]), [[W0, []], [W1, ['fresh']]])
  check('prepareOnHand: one list per plan (the oldest)', prepared.lists.length, 1)
}

// ── Words
const it = (name, finishes) => ({ name, finishes })
check('reason: one finished', reasonText([it('green beans', true)]), 'Uses the rest of the green beans')
check('reason: one not finished', reasonText([it('green onions', false)]), 'Uses leftover green onions')
check('reason: finished and not', reasonText([it('green beans', true), it('green onions', false)]), 'Uses the rest of the green beans and leftover green onions')
check('reason: both finished', reasonText([it('feta', true), it('dill', true)]), 'Uses the rest of the feta and dill')
check('reason: neither finished', reasonText([it('green onions', false), it('dill', false)]), 'Uses leftover green onions and dill')
check('reason: none', reasonText([]), null)
check('amounts: oz', [amountText('feta', 6), amountText('feta', 2.4), amountText('feta', 0.6), amountText('rice', 28.75)], ['About 6 oz', 'About 2½ oz', 'Under 1 oz', 'About 1¾ lb'])
check('amounts: fl oz', amountText('soy-sauce', 8.1), 'About 8 fl oz')
check('amounts: bunches and heads', [amountText('green-onion', 0.5), amountText('green-onion', 0.96), amountText('green-onion', 1.5), amountText('garlic', 0.25), amountText('kale', 0.7)], ['About half a bunch', 'About a bunch', 'About 1½ bunches', 'About a quarter of a head', 'About three quarters of a bunch'])
check('amounts: never "0.06 bunch" (a sliver reads "A little")', amountText('green-onion', 0.06), 'A little of a bunch')
check('amounts: counted things', [amountText('egg', 5), amountText('egg', 1), amountText('lemon', 1, 'lemon'), amountText('lemon', 2, 'lemon'), amountText('sweet-potato', 2, 'sweet potato'), amountText('english-muffin', 4)], ['5 eggs', '1 egg', '1 lemon', '2 lemons', '2 sweet potatoes', '4 muffins'])
check('use-by: 2 days or less → "Use by", highlighted', useByLabel('2026-10-21', 7, TODAY), { text: 'Use by Wed', soon: true })
check('use-by: today → "Use by Mon"', useByLabel(TODAY, 7, TODAY), { text: 'Use by Mon', soon: true })
check('use-by: later this week → "Good till Sat"', useByLabel('2026-10-24', 7, TODAY), { text: 'Good till Sat', soon: false })
check('use-by: more than 6 days away → a date', useByLabel('2026-10-30', 14, TODAY), { text: 'Good till Oct 30', soon: false })
check('use-by: none when it keeps over 30 days', useByLabel('2027-04-12', 180, TODAY), null)

console.log(`check:on-hand — ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
