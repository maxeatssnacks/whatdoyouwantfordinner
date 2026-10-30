// Assertions for what's on hand (src/v2/lib/onHand.js): lots from saved
// lists, use by planned meals, corrections ("How much is left?", the
// shopping list, and voice, which reaches this week's purchases since 7a3),
// reasons and their words.
// npm run check:on-hand
import {
  amountText,
  answerAmount,
  applyMeal,
  correctionRow,
  inferOnHand,
  LINE_WIDTH,
  LINE_WIDTHS,
  lineWidth,
  lotsFromLists,
  mealUses,
  prepareOnHand,
  reasonText,
  rolloverFor,
  shortName,
  useByLabel,
  weekOnHand,
  weekRollovers,
  withAdjustment,
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
const creamR = (oz) => recipe(`Sour cream ${oz}`, 1, [{ name: 'sour cream', amount: oz, unit: 'oz' }])
const yogurtR = (oz, title = `Yogurt ${oz}`) => recipe(title, 1, [{ name: 'greek yogurt', amount: oz, unit: 'oz' }])

// ── Lots, used down in date order
{
  const r = inferOnHand({
    lists: [list(W0, W0, [pkgItem('feta', 1, 6)])],
    plans: [plan(W0, [cook('a', 'monday', fetaR(4))]), plan(W1, [cook('b', 'sunday', fetaR(3))])],
  })
  check('feta: 6 oz bought, a meal uses 4 (same week, so no reason)', brief(uses(r, 'a')), [])
  check('feta: 2 left, the next week\'s meal finishes it', brief(uses(r, 'b')), [['feta', 2, 2, true]])
  check('feta: its reason', uses(r, 'b').reason, 'Uses the rest of the feta')
  check('feta: last week\'s lot is finished; this week has no saved list, so its meals\' list buys a 4 oz pack for the 1 oz short (3 left)', r.end.lots.map((l) => [l.weekStart, l.source, l.amount]), [[W0, 'list', 0], [W1, 'menu', 3]])
}
{
  const r = inferOnHand({
    lists: [list(W0, W0, [pkgItem('feta', 1, 6)])],
    plans: [plan(W0, [cook('a', 'monday', fetaR(4))]), plan(W1, [cook('b', 'monday', fetaR(3))])],
  })
  check('use-by: feta bought Sun 10-11 keeps 7 days; a meal on Mon 10-19 gets none', brief(uses(r, 'b')), [])
  check('use-by: last week\'s 2 oz is still there, unused, past its use-by; this week\'s meals\' list bought a 4 oz pack (1 left)', r.end.lots.map((l) => [l.weekStart, l.amount]), [[W0, 2], [W1, 1]])
}
{
  // The list was saved with a feta meal on it; the meal was removed later.
  const items = generateShoppingItems([cook('gone', 'monday', fetaR(5))])
  const r = inferOnHand({ lists: [list(W0, W0, items)], plans: [plan(W0, []), plan(W1, [cook('b', 'sunday', fetaR(3))])] })
  check('removed after shopping: the 6 oz bought stays on hand', brief(uses(r, 'b')), [['feta', 6, 3, false]])
  check('removed after shopping: "Uses your feta"', uses(r, 'b').reason, 'Uses your feta')
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
  check('checked: counts what was bought (6 oz), bought at its week\'s start (Sun 10-11, use by 10-18), not the day it was checked (10-17); confirmed', lots.find((l) => l.key === 'feta') && [lots.find((l) => l.key === 'feta').amount, lots.find((l) => l.key === 'feta').boughtOn, lots.find((l) => l.key === 'feta').useBy, lots.find((l) => l.key === 'feta').confirmed], [6, W0, '2026-10-18', true])
  check('checked: a hidden checked line still counts', lots.some((l) => l.key === 'ricotta'), true)
  check('checked: a line checked before 5a (no bought) uses its package and the list\'s day', [lots.find((l) => l.key === 'sour-cream').amount, lots.find((l) => l.key === 'sour-cream').boughtOn], [8, W0])
}
{
  // 7a4: bought at the week's start, checked or not and whenever the list was saved.
  const lots = lotsFromLists([list(W1, '2026-10-22', [
    pkgItem('feta', 1, 6),
    pkgItem('dill', 1, 1, { checked: true, bought: { package: { count: 1, size: 1, unit: 'bunch' }, need: 1, needUnit: 'bunch', on: '2026-10-20' } }),
  ])])
  check('purchase dates: the week\'s Sunday, checked or not and whenever the list was saved (saved Thu 10-22, dill checked Tue 10-20); checked lines are confirmed',
    lots.map((l) => [l.key, l.boughtOn, l.useBy, l.confirmed, l.source]), [['dill', W1, '2026-10-25', true, 'list'], ['feta', W1, '2026-10-25', false, 'list']])
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
  check('quick meal: reason and still need', [uses(r, 'q').reason, uses(r, 'q').stillNeed], ['Uses your yogurt', ['apple']])
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
  check('next week: "Uses your green beans"', uses(r, 'next').reason, 'Uses your green beans')
  const shown = weekRollovers(r, { weekStart: W1, thisWeek: W1, today: TODAY })
  check('weekRollovers: none this week', Object.keys(shown), [])
  const next = weekRollovers(r, { weekStart: W2, thisWeek: W1, today: TODAY })
  check('weekRollovers: next week has its meal', Object.keys(next), ['next'])
  check('weekRollovers: two weeks ahead and past weeks get none', [Object.keys(weekRollovers(r, { weekStart: '2026-11-01', thisWeek: W1, today: TODAY })), Object.keys(weekRollovers(r, { weekStart: W0, thisWeek: W1, today: TODAY }))], [[], []])
}
{
  // Past days of the current week get no reason, today and later do. Yogurt
  // keeps 10 days, so last week's (bought Sun 10-11) is good till 10-21.
  const r = inferOnHand({
    lists: [list(W0, '2026-10-17', [pkgItem('greek-yogurt', 1, 16)])],
    plans: [plan(W0, []), plan(W1, [cook('sun', 'sunday', yogurtR(2)), cook('mon', 'monday', yogurtR(2))])],
  })
  check('past days: Sunday used yogurt (it counts as cooked) but shows no reason; Monday does', Object.keys(weekRollovers(r, { weekStart: W1, thisWeek: W1, today: TODAY })), ['mon'])
  check('past days: Monday sees what Sunday left (16 − 2 = 14)', brief(uses(r, 'mon')), [['greek-yogurt', 14, 2, false]])
}
{
  // The flows fixture's shape: last week's real list from its meal; this week's meal finishes it.
  const firecracker = recipe('Firecracker Meatballs', 2, [{ name: 'Green Beans', amount: 6, unit: 'oz' }, { name: 'Soy Sauce', amount: 2, unit: 'tbsp' }, { name: 'Salt', amount: 0.5, unit: 'tsp' }])
  const hotHoney = recipe('Hot Honey Pork Stir Fry', 5, [{ name: 'green beans', amount: 12, unit: 'oz' }, { name: 'ground pork', amount: 2, unit: 'lb' }, { name: 'soy sauce', amount: 3, unit: 'tbsp' }, { name: 'oil', amount: 1, unit: 'tbsp' }, { name: 'red bell pepper', amount: 1, unit: 'whole' }])
  const lastWeek = [cook('fc', 'thursday', firecracker, 2)]
  const items = generateShoppingItems(lastWeek)
  // Green beans keep 7 days: last week's (bought Sun 10-11) are good till Sunday 10-18.
  const r = inferOnHand({ lists: [list(W0, '2026-10-14', items)], plans: [plan(W0, lastWeek), plan(W1, [cook('hh', 'sunday', hotHoney, 3)])] })
  check('fixture shape: 6 oz of a 12 oz bag left; Sunday\'s stir fry finishes it', brief(uses(r, 'hh')), [['green-bean', 6, 6, true]])
  check('fixture shape: soy sauce is pantry and not finished, so only the beans are named', uses(r, 'hh').reason, 'Uses the rest of the green beans')
  check('fixture shape: still need leaves out the beans, soy sauce (on hand) and oil (staple)', uses(r, 'hh').stillNeed, ['ground pork', 'red bell pepper'])
  const roll = rolloverFor(uses(r, 'hh'), W1)
  check('fixture shape: the sheet\'s item (amount and use-by, seen on Sunday)', roll.items.map((i) => [i.name, i.amount, i.useBy, i.soon]), [['green beans', 'About 6 oz', 'Use by Sun', true]])
  check('rolloverFor: real data has no dollars, no Sample tag, no "Update what\'s left" yet', [roll.savings, roll.sample, roll.canUpdate], [null, false, false])
}
{
  const onHand = { lots: lotsFromLists([list(W0, W0, [pkgItem('feta', 1, 6)])]) }
  const before = JSON.stringify(onHand)
  const m = mealUses(fetaR(2), 1, onHand, '2026-10-18')
  check('mealUses: doesn\'t change the state it reads', JSON.stringify(onHand), before)
  check('mealUses: takes a recipe (a meal that isn\'t planned)', [m.reason, m.items[0].before], ['Uses your feta', 6])
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

// ── A week nobody saved a list for (7a4): the list its meals would have made
{
  // Last week's saved list has 8 oz sour cream (good till 10-25). This week has
  // meals but no saved list: Monday uses 4 oz sour cream and 6 oz greek yogurt.
  // Next Sunday's meal uses 6 oz yogurt.
  const creamYogurt = (oz, yogurtOz) => recipe(`Cream ${oz} yogurt ${yogurtOz}`, 1, [{ name: 'sour cream', amount: oz, unit: 'oz' }, { name: 'greek yogurt', amount: yogurtOz, unit: 'oz' }])
  const rows = {
    lists: [list(W0, W0, [pkgItem('sour-cream', 1, 8)])],
    plans: [plan(W0, []), plan(W1, [cook('mon', 'monday', creamYogurt(4, 6))]), plan(W2, [cook('n', 'sunday', yogurtR(6))])],
  }
  const menu = (r) => r.bought.filter((l) => l.source === 'menu').map((l) => [l.key, l.weekStart, l.boughtOn, l.packageAmount, l.confirmed])
  const plain = inferOnHand(rows, { today: TODAY })
  check('no saved list: this week\'s meals\' list buys the yogurt (a 16 oz tub, bought Sunday, inferred); the sour cream on hand at the week\'s start covers Monday, so none is bought',
    menu(plain), [['greek-yogurt', W1, W1, 16, false]])
  check('… its leftovers reach next week\'s line (16 − 6 = 10 left, Sunday uses 6)', [brief(uses(plain, 'n')), uses(plain, 'n').reason], [[['greek-yogurt', 10, 6, false]], 'Uses your yogurt'])
  const chosen = inferOnHand({ ...rows, sizeChoices: { 'greek-yogurt': { size: 32, unit: 'oz' } } }, { today: TODAY })
  check('… with the person\'s size choice (the 32 oz tub)', [menu(chosen), brief(uses(chosen, 'n'))], [[['greek-yogurt', W1, W1, 32, false]], [['greek-yogurt', 26, 6, false]]])
  const saved = inferOnHand({ ...rows, lists: [...rows.lists, list(W1, '2026-10-20', [])] }, { today: TODAY })
  check('a week with a saved list uses that list, even an empty one (next week, with no list, still gets its meals\' list)', [menu(saved).map(([key, week]) => `${key} ${week}`), brief(uses(saved, 'n'))], [[`greek-yogurt ${W2}`], []])
  const prepared = prepareOnHand({ plans: [{ id: 'p1', week_start_date: W1, entries: [cook('mon', 'monday', creamYogurt(4, 6))] }], lists: [], sizeChoices: { 'greek-yogurt': { size: 32, unit: 'oz' } } })
  check('prepareOnHand passes the size choices through', prepared.sizeChoices, { 'greek-yogurt': { size: 32, unit: 'oz' } })
}

// ── Corrections ("How much is left?", step 5c): anchors at the start of their day
const adj = (key, asOf, answer, amount, unit = entryById(key).unit) => ({ ingredient_key: key, as_of: asOf, answer, amount, unit })
check('answers: feta (6 oz bought) → 0, 1.2, 3, 4.8 oz', ['used_up', 'a_little', 'about_half', 'plenty'].map((a) => answerAmount(a, { key: 'feta', packageAmount: 6 })), [0, 1.2, 3, 4.8])
check('answers: eggs (½ dozen) round to whole eggs → 0, 1, 3, 5', ['used_up', 'a_little', 'about_half', 'plenty'].map((a) => answerAmount(a, { key: 'egg', packageAmount: 6 })), [0, 1, 3, 5])
check('answers: 2 lemons → 0, 1 (at least one), 1, 2', ['used_up', 'a_little', 'about_half', 'plenty'].map((a) => answerAmount(a, { key: 'lemon', packageAmount: 2 })), [0, 1, 1, 2])
check('answers: bunches stay fractional (1 bunch → 0.5)', answerAmount('about_half', { key: 'green-onion', packageAmount: 1 }), 0.5)
{
  // Sour cream (8 oz) on last week's list: bought Sun 10-11, keeps 14 days
  // (good till 10-25). Today, Mon 10-19, "About half" (4 oz); Thursday's meal uses 2.
  const rows = { lists: [list(W0, '2026-10-16', [pkgItem('sour-cream', 1, 8)])], plans: [plan(W0, []), plan(W1, [cook('thu', 'thursday', creamR(2))])] }
  const plain = inferOnHand(rows, { today: TODAY })
  check('correction: without one, Thursday sees the 8 oz', brief(uses(plain, 'thu')), [['sour-cream', 8, 2, false]])
  check('correction: "now" for today (inferred 8 of 8, no answer yet)', plain.now['sour-cream'], { inferred: 8, amount: 8, packageAmount: 8, answer: null })
  const r = inferOnHand({ ...rows, adjustments: [adj('sour-cream', TODAY, 'about_half', 4)] }, { today: TODAY })
  check('correction then a later meal: Thursday sees 4, uses 2', brief(uses(r, 'thu')), [['sour-cream', 4, 2, false]])
  check('correction: "now" keeps what was inferred and the answer', r.now['sour-cream'], { inferred: 8, amount: 4, packageAmount: 8, answer: 'about_half' })
  const roll = weekRollovers(r, { weekStart: W1, thisWeek: W1, today: TODAY }).thu
  check('correction: the item preselects today\'s answer and carries what saving needs', [roll.canUpdate, roll.items[0].left, roll.items[0].correction], [true, 'About half', { key: 'sour-cream', unit: 'oz', packageAmount: 8, inferred: 8, amount: 4, nowText: 'About 4 oz' }])
  const fresh = weekRollovers(plain, { weekStart: W1, thisWeek: W1, today: TODAY }).thu
  check('correction: with no answer the preselect comes from what\'s left now (8 of 8 → Plenty)', fresh.items[0].left, 'Plenty')
  // An amount said some other way (voice, step 7a: answer 'amount') selects the answer it's closest to.
  const said = inferOnHand({ ...rows, adjustments: [adj('sour-cream', TODAY, 'amount', 1.5)] }, { today: TODAY })
  check('an amount (1.5 of 8 oz) selects A little; the meal sees it', [weekRollovers(said, { weekStart: W1, thisWeek: W1, today: TODAY }).thu.items[0].left, brief(uses(said, 'thu'))], ['A little', [['sour-cream', 1.5, 1.5, true]]])
  check('correction: correctionRow for "A little"', correctionRow(fresh.items[0], 'a_little', TODAY),
    { ingredient_key: 'sour-cream', as_of: TODAY, answer: 'a_little', amount: 1.6, unit: 'oz', inferred_amount: 8, package_amount: 8, source: 'meal_sheet' })
  const used = inferOnHand({ ...rows, adjustments: [adj('sour-cream', TODAY, 'used_up', 0)] }, { today: TODAY })
  check('Used up: the meal no longer uses it, so no reason and no marker', [brief(uses(used, 'thu')), uses(used, 'thu').reason, Object.keys(weekRollovers(used, { weekStart: W1, thisWeek: W1, today: TODAY }))], [[], null, []])
  const replaced = withAdjustment([adj('sour-cream', TODAY, 'about_half', 4)], adj('sour-cream', TODAY, 'used_up', 0))
  check('same day: a second answer replaces the first', replaced.map((a) => a.answer), ['used_up'])
  const history = withAdjustment([adj('sour-cream', '2026-10-18', 'a_little', 1.6)], adj('sour-cream', TODAY, 'plenty', 6.4))
  check('same day: an earlier day\'s answer stays as history', history.map((a) => `${a.as_of} ${a.answer}`), ['2026-10-18 a_little', `${TODAY} plenty`])
  const latest = inferOnHand({ ...rows, adjustments: history }, { today: TODAY })
  check('history: the latest answer is what counts later (6.4 oz on Thursday)', brief(uses(latest, 'thu')), [['sour-cream', 6.4, 2, false]])
}
{
  // Used up today, then this week's list (saved today; bought on its Sunday) buys sour cream again: next week's meal sees the new 8 oz.
  const r = inferOnHand({
    lists: [list(W0, '2026-10-16', [pkgItem('sour-cream', 1, 8)]), list(W1, TODAY, [pkgItem('sour-cream', 1, 8)])],
    plans: [plan(W0, []), plan(W1, []), plan(W2, [cook('next', 'sunday', creamR(2))])],
    adjustments: [adj('sour-cream', TODAY, 'used_up', 0)],
  }, { today: TODAY })
  check('correction then a new purchase: the purchase adds to it (next week sees 8 oz, not 16)', brief(uses(r, 'next')), [['sour-cream', 8, 2, false]])
  check('correction then a new purchase: last week\'s lot stays 0; this week\'s 8 oz, less next week\'s 2', r.end.lots.map((l) => [l.weekStart, l.amount]), [[W0, 0], [W1, 6]])
}
{
  const honeyLists = [list(W_2, W_2, [pkgItem('honey', 1, 12)]), list(W0, W0, [pkgItem('honey', 1, 12)])]
  const base = { lists: honeyLists, plans: [plan(W_2, []), plan(W0, []), plan(W1, [])] }
  const less = inferOnHand({ ...base, adjustments: [adj('honey', TODAY, 'a_little', 6)] }, { today: TODAY })
  check('less than inferred comes off the oldest lot first (24 → 6: 0 and 6)', less.end.lots.map((l) => l.amount), [0, 6])
  const more = inferOnHand({ ...base, adjustments: [adj('honey', TODAY, 'plenty', 30)] }, { today: TODAY })
  check('more than inferred goes onto the newest live lot (24 → 30: 12 and 18)', more.end.lots.map((l) => l.amount), [12, 18])
  check('use-by dates don\'t change', more.end.lots.map((l) => l.useBy), less.bought.map((l) => l.useBy))
}
{
  const raw = {
    plans: [{ id: 'p0', week_start_date: W0, entries: [] }, { id: 'p1', week_start_date: W1, entries: [cook('thu', 'thursday', creamR(2))] }],
    lists: [{ id: 'l0', meal_plan_id: 'p0', created_at: '2026-10-16T12:00:00', items: [pkgItem('sour-cream', 1, 8)], meal_plan: { week_start_date: W0 } }],
    adjustments: [adj('sour-cream', '2026-09-19', 'used_up', 0), adj('sour-cream', TODAY, 'used_up', 0, 'fl oz')],
  }
  const prepared = prepareOnHand(raw, [], { weekStart: W1 })
  check('ignored: a correction from before the window (09-19; the window starts 09-20)', prepared.adjustments.map((a) => a.as_of), [TODAY])
  const r = inferOnHand(prepared, { today: TODAY })
  check('ignored: a correction in another unit than the entry\'s', brief(uses(r, 'thu')), [['sour-cream', 8, 2, false]])
  check('no rows: the pure inference', brief(uses(inferOnHand({ ...prepared, adjustments: [] }, { today: TODAY }), 'thu')), [['sour-cream', 8, 2, false]])
}
{
  // Next week's items can't be corrected (they name what this week's list will leave).
  const beans = recipe('Beans', 1, [{ name: 'green beans', amount: 2, unit: 'oz' }])
  const r = inferOnHand({ lists: [list(W1, W1, [pkgItem('green-bean', 1, 12, { name: 'green beans' })])], plans: [plan(W1, []), plan(W2, [cook('n', 'sunday', beans)])] }, { today: TODAY })
  const next = weekRollovers(r, { weekStart: W2, thisWeek: W1, today: TODAY }).n
  check('next week: shown, but without "Update what\'s left"', [next.reason, next.canUpdate, next.items[0].correction ?? null], ['Uses your green beans', false, null])
}
{
  // The line, the sheet and the popover cover the same 3 items, most valuable first (7a3).
  // Last week's list (bought Sun 10-11); the salad is this Sunday (10-18, today here), when the 7-day items are still good.
  const four = recipe('Big salad', 1, [
    { name: 'greek yogurt', amount: 8, unit: 'oz' },
    { name: 'feta', amount: 6, unit: 'oz' },
    { name: 'dill', amount: 0.25, unit: 'cup' },
    { name: 'green beans', amount: 2, unit: 'oz' },
  ])
  const r = inferOnHand({
    lists: [list(W0, '2026-10-17', [pkgItem('greek-yogurt', 1, 16), pkgItem('feta', 1, 6), pkgItem('dill', 1, 1), pkgItem('green-bean', 1, 12, { name: 'green beans' })])],
    plans: [plan(W0, []), plan(W1, [cook('m', 'sunday', four)])],
  }, { today: W1 })
  const roll = weekRollovers(r, { weekStart: W1, thisWeek: W1, today: W1 }).m
  check('3-item cap: four items earn a reason, three are listed', [uses(r, 'm').items.length, roll.items.length], [4, 3])
  check('3-item order: most valuable first (feta $2.69, yogurt $1.20, dill $0.30; dill before the beans at the same value: the name)', roll.items.map((i) => i.key), ['feta', 'greek-yogurt', 'dill'])
  check('3-item cap: the line names the same three, in that order (not all finished: "Uses your …")', [roll.reason, uses(r, 'm').items.map((i) => [i.key, i.value])], ['Uses your feta, yogurt and dill', [['feta', 2.69], ['greek-yogurt', 1.2], ['dill', 0.3], ['green-bean', 0.3]]])
  check('3-item cap: allItems keeps all four, in the same order (the sheet\'s answering rows find theirs there)', roll.allItems.map((i) => i.key), ['feta', 'greek-yogurt', 'dill', 'green-bean'])
  check('the Today card\'s line (228 px) fits the same three here', roll.reasonToday, 'Uses your feta, yogurt and dill')
}

// ── The reason names the most valuable item first (6c), not the finished one
{
  // Last week's list (bought Sun 10-11); the bowl is this Sunday (today here), while the 7-day items are good.
  const bowl = recipe('Feta bowl', 1, [
    { name: 'feta', amount: 3, unit: 'oz' },
    { name: 'green onions', amount: 0.5, unit: 'bunch' },
  ])
  const r = inferOnHand({
    lists: [list(W0, '2026-10-17', [pkgItem('feta', 1, 6), pkgItem('green-onion', 1, 1, { name: 'green onions' })])],
    plans: [plan(W0, [cook('sat', 'saturday', recipe('Last', 1, [{ name: 'green onions', amount: 0.5, unit: 'bunch' }]))]), plan(W1, [cook('m', 'sunday', bowl)])],
  }, { today: W1 })
  const m = uses(r, 'm')
  check('value order: half a 6 oz feta ($1.35) is named before the green onions it finishes ($0.39)',
    [m.reason, m.items.map((i) => [i.key, i.finishes, i.value])], ['Uses your feta and green onions', [['feta', false, 1.35], ['green-onion', true, 0.39]]])
  check('… and the sheet and popover list them in the line\'s order (7a3; before, finished first)', weekRollovers(r, { weekStart: W1, thisWeek: W1, today: W1 }).m.items.map((i) => i.key), ['feta', 'green-onion'])
}

// ── Confirmed and inferred (step 5d): what this week's meals take, for the shopping list
{
  const lots = lotsFromLists([list(W0, W0, [
    pkgItem('feta', 1, 8, { checked: true, bought: { package: { count: 1, size: 8, unit: 'oz' }, need: 2, needUnit: 'oz', on: '2026-10-16' } }),
    pkgItem('green-bean', 1, 12, { name: 'green beans' }),
  ])])
  check('confirmed: a line checked when bought (bought record) is; one that wasn\'t isn\'t (both bought on the week\'s Sunday)', lots.map((l) => [l.key, l.confirmed, l.boughtOn]), [['feta', true, W0], ['green-bean', false, W0]])
  const r = inferOnHand({ lists: [list(W0, '2026-10-16', [pkgItem('sour-cream', 1, 8)])], plans: [plan(W0, []), plan(W1, [])], adjustments: [adj('sour-cream', TODAY, 'about_half', 4)] }, { today: TODAY })
  check('confirmed: a correction makes that key\'s lots confirmed', r.end.lots.map((l) => [l.key, l.confirmed]), [['sour-cream', true]])
}
{
  // Last week: sour cream 8 oz (checked: confirmed; keeps 14 days, good till
  // 10-25) and greek yogurt 16 oz (not checked: inferred; keeps 10, good till
  // 10-21); last week's meal used 2 oz and 6 oz. This week: Sunday (past) and
  // Tuesday meals; this week's own list buys more of both.
  const creamYogurt = (oz, yogurtOz) => recipe(`Cream ${oz} yogurt ${yogurtOz}`, 1, [{ name: 'sour cream', amount: oz, unit: 'oz' }, { name: 'greek yogurt', amount: yogurtOz, unit: 'oz' }])
  const rows = {
    lists: [
      list(W0, '2026-10-16', [
        pkgItem('sour-cream', 1, 8, { checked: true, bought: { package: { count: 1, size: 8, unit: 'oz' }, need: 2, needUnit: 'oz', on: '2026-10-16' } }),
        pkgItem('greek-yogurt', 1, 16),
      ]),
      list(W1, W1, [pkgItem('sour-cream', 1, 8), pkgItem('greek-yogurt', 1, 16)]),
    ],
    plans: [plan(W0, [cook('lw', 'friday', creamYogurt(2, 6))]), plan(W1, [cook('sun', 'sunday', creamYogurt(1, 2)), cook('tue', 'tuesday', creamYogurt(4, 3))])],
  }
  const r = inferOnHand(rows, { today: TODAY })
  const week = weekOnHand(r, W1)
  check('weekOnHand: this week\'s meals (past days too) take 5 oz of last week\'s confirmed sour cream and 5 oz of the inferred yogurt',
    [week['sour-cream'].confirmed, week['sour-cream'].inferred, week['greek-yogurt'].confirmed, week['greek-yogurt'].inferred], [5, 0, 0, 5])
  check('weekOnHand: with the use-by of what they take, words, and the total the list skips (7a4)',
    [week['sour-cream'].confirmedUseBy, week['sour-cream'].confirmedText, week['greek-yogurt'].inferredUseBy, week['greek-yogurt'].inferredText, week['greek-yogurt'].amount, week['greek-yogurt'].useBy, week['greek-yogurt'].text],
    ['2026-10-25', '5 oz', '2026-10-21', '5 oz', 5, '2026-10-21', '5 oz'])
  check('weekOnHand: next week\'s meals aren\'t counted, and this week\'s own list never is', Object.keys(weekOnHand(r, W2)), [])
  const listItems = generateShoppingItems(rows.plans[1].entries, [], { onHand: week })
  const cream = listItems.find((i) => i.key === 'sour-cream')
  const yogurt = listItems.find((i) => i.key === 'greek-yogurt')
  check('the list: sour cream needs 5 oz, 5 confirmed on hand → covered, in Already have', [cream.need, cream.covered, cream.have, cream.package], [5, true, true, null])
  check('the list: yogurt only assumed (nobody checked it off) → covered too since 7a4, "5 oz on hand", no hint', [yogurt.covered, yogurt.have, yogurt.package, yogurt.onHand, 'onHandHint' in yogurt],
    [true, true, null, { amount: 5, useBy: '2026-10-21', text: '5 oz' }, false])
  // "A little" sour cream today: 0.2 × 8 = 1.6 oz from today on. Sunday (past)
  // took 1 oz before it; Tuesday gets 1.6 of the 4 it needs.
  const corrected = inferOnHand({ ...rows, adjustments: [adj('sour-cream', TODAY, 'a_little', 1.6)] }, { today: TODAY })
  const after = weekOnHand(corrected, W1)
  const creamAfter = generateShoppingItems(rows.plans[1].entries, [], { onHand: after }).find((i) => i.key === 'sour-cream')
  check('a correction changes the gap: on hand 1 + 1.6 = 2.6 oz → 2.4 oz to buy → an 8 oz tub', [after['sour-cream'].confirmed, !!creamAfter.covered, creamAfter.package.text], [2.6, false, '8 oz'])
  const usedUp = inferOnHand({ ...rows, adjustments: [adj('sour-cream', TODAY, 'used_up', 0)] }, { today: TODAY })
  const creamUsedUp = generateShoppingItems(rows.plans[1].entries, [], { onHand: weekOnHand(usedUp, W1) }).find((i) => i.key === 'sour-cream')
  check('Used up ("I need this" from the list): only what Sunday already took stays on hand → 4 oz to buy', [weekOnHand(usedUp, W1)['sour-cream'].confirmed, creamUsedUp.package.text], [1, '8 oz'])
  const yogurtUsedUp = inferOnHand({ ...rows, adjustments: [{ ...adj('greek-yogurt', TODAY, 'used_up', 0), source: 'shopping' }] }, { today: TODAY })
  const yogurtBack = generateShoppingItems(rows.plans[1].entries, [], { onHand: weekOnHand(yogurtUsedUp, W1) }).find((i) => i.key === 'greek-yogurt')
  check('"I need this" on an assumed leftover: the same Used up row puts the line back with a package (only Sunday\'s 2 oz stays counted)', [!!yogurtBack.covered, yogurtBack.have, yogurtBack.onHand?.amount, yogurtBack.package?.text], [false, false, 2, '5.3 oz cup'])
}

// ── Voice corrections reach this week's purchases (7a3)
{
  // Today is Thu 10-22. Last week's sour cream (bought Sun 10-11, good till
  // 10-25); this week's greek yogurt, 16 oz on this week's list (not checked
  // off, so only inferred; bought Sun 10-18, good till 10-28). Monday (past)
  // used 6 oz of it; Friday uses last week's sour cream; next Monday's dip
  // uses 8 oz of yogurt.
  const THU = '2026-10-22'
  const yogurtR = (oz, title = `Yogurt ${oz}`) => recipe(title, 1, [{ name: 'greek yogurt', amount: oz, unit: 'oz' }])
  const rows = {
    lists: [
      list(W0, '2026-10-16', [pkgItem('sour-cream', 1, 8)]),
      list(W1, W1, [pkgItem('greek-yogurt', 1, 16)]),
    ],
    plans: [
      plan(W0, []),
      plan(W1, [cook('mon', 'monday', yogurtR(6)), cook('fri', 'friday', creamR(2))]),
      plan(W2, [cook('next', 'monday', yogurtR(8, 'Yogurt dip'))]),
    ],
  }
  const said = (answer, amount, source = 'voice') => inferOnHand({ ...rows, adjustments: [{ ...adj('greek-yogurt', THU, answer, amount), source }] }, { today: THU })
  const plain = inferOnHand(rows, { today: THU })
  const nextWeek = (r) => weekRollovers(r, { weekStart: W2, thisWeek: W1, today: THU }).next ?? null
  const thisWeek = (r) => weekRollovers(r, { weekStart: W1, thisWeek: W1, today: THU })
  const nextList = (r) => generateShoppingItems(rows.plans[2].entries, [], { onHand: weekOnHand(r, W2) }).find((i) => i.key === 'greek-yogurt')
  const thisList = (r) => generateShoppingItems(rows.plans[1].entries, [], { onHand: weekOnHand(r, W1) })
  const line = (i) => [i.package?.text ?? null, !!i.covered, !!i.have, i.onHand?.amount ?? null]

  check('this week\'s purchase: voice reads it (nowAll: 16 − Monday\'s 6), the sheet doesn\'t (now)',
    [plain.nowAll['greek-yogurt'], plain.now['greek-yogurt'] ?? null], [{ inferred: 10, amount: 10, packageAmount: 16, answer: null }, null])
  check('before: next Monday names this week\'s yogurt (10 left, uses 8): card and popover', [brief(uses(plain, 'next')), nextWeek(plain).reason, nextWeek(plain).items.map((i) => [i.name, i.amount])],
    [[['greek-yogurt', 10, 8, false]], 'Uses your yogurt', [['yogurt', 'About 10 oz']]])
  check('before: next week\'s list skips the assumed yogurt (not checked off; 7a4): covered, in Already have, 8 oz on hand', line(nextList(plain)), [null, true, true, 8])

  const half = said('about_half', 8)
  check('Thursday by voice, "about half" (8 of 16 oz): what voice reads now', half.nowAll['greek-yogurt'], { inferred: 10, amount: 8, packageAmount: 16, answer: 'about_half' })
  check('… next week\'s projection follows: 8 left, the dip finishes it', brief(uses(half, 'next')), [['greek-yogurt', 8, 8, true]])
  check('… its card and popover follow', [nextWeek(half).reason, nextWeek(half).items.map((i) => [i.name, i.amount])], ['Uses the rest of the yogurt', [['yogurt', 'About 8 oz']]])
  check('… the anchored lot is confirmed; next week\'s list: still covered (8 on hand)', [half.end.lots.find((l) => l.key === 'greek-yogurt').confirmed, line(nextList(half))], [true, [null, true, true, 8]])
  const gone = said('used_up', 0)
  check('Thursday by voice, "the yogurt is gone": next Monday uses none, no reason, and the list buys a tub again',
    [brief(uses(gone, 'next')), nextWeek(gone), line(nextList(gone))], [[], null, ['16 oz tub', false, false, null]])
  check('this week\'s list doesn\'t change from a correction of this week\'s purchase (its lines are what was bought)',
    [JSON.stringify(thisList(half)) === JSON.stringify(thisList(plain)), JSON.stringify(thisList(gone)) === JSON.stringify(thisList(plain)), JSON.stringify(weekOnHand(gone, W1)) === JSON.stringify(weekOnHand(plain, W1))], [true, true, true])
  check('this week\'s meals: the sheet\'s items and answers are unchanged (Friday names last week\'s sour cream, not this week\'s yogurt)',
    [Object.keys(thisWeek(plain)), JSON.stringify(thisWeek(half)) === JSON.stringify(thisWeek(plain)), JSON.stringify(thisWeek(gone)) === JSON.stringify(thisWeek(plain))], [['fri'], true, true])
  check('the same answer from the meal sheet is about earlier weeks\' lots only: this week\'s yogurt stays as inferred',
    [brief(uses(said('about_half', 8, 'meal_sheet'), 'next')), brief(uses(said('used_up', 0, 'shopping'), 'next'))], [[['greek-yogurt', 10, 8, false]], [['greek-yogurt', 10, 8, false]]])
}
{
  // Both weeks' sour cream: 8 oz on last week's list (bought Sun 10-11, good till 10-25), 8 oz on this week's (Sun 10-18). Thursday, "the sour cream's gone".
  const THU = '2026-10-22'
  const base = { lists: [list(W0, '2026-10-16', [pkgItem('sour-cream', 1, 8)]), list(W1, W1, [pkgItem('sour-cream', 1, 8)])], plans: [plan(W0, []), plan(W1, [])] }
  const gone = (source) => inferOnHand({ ...base, adjustments: [{ ...adj('sour-cream', THU, 'used_up', 0), source }] }, { today: THU })
  check('by voice: both lots (everything bought on or before today)', gone('voice').end.lots.map((l) => [l.weekStart, l.amount]), [[W0, 0], [W1, 0]])
  check('from the meal sheet: last week\'s lot only (as before)', gone('meal_sheet').end.lots.map((l) => [l.weekStart, l.amount]), [[W0, 0], [W1, 8]])
  const some = inferOnHand({ ...base, adjustments: [{ ...adj('sour-cream', THU, 'a_little', 3.2), source: 'voice' }] }, { today: THU })
  check('by voice, less than inferred comes off the oldest lot first (16 → 3.2: 0 and 3.2), both confirmed', some.end.lots.map((l) => [l.weekStart, l.amount, l.confirmed]), [[W0, 0, true], [W1, 3.2, true]])
  const more = inferOnHand({ ...base, adjustments: [{ ...adj('sour-cream', THU, 'amount', 20), source: 'voice' }] }, { today: THU })
  check('by voice, more than inferred goes onto the newest lot (16 → 20: 8 and 12)', more.end.lots.map((l) => [l.weekStart, l.amount]), [[W0, 8], [W1, 12]])
}
{
  // Earlier weeks' lots only: a voice correction behaves exactly as before (as the sheet's does).
  const rows = { lists: [list(W0, '2026-10-16', [pkgItem('sour-cream', 1, 8)])], plans: [plan(W0, []), plan(W1, [cook('thu', 'thursday', creamR(2))]), plan(W2, [cook('n', 'sunday', creamR(1))])] }
  const run = (source) => inferOnHand({ ...rows, adjustments: [{ ...adj('sour-cream', TODAY, 'about_half', 4), ...(source ? { source } : {}) }] }, { today: TODAY })
  const same = (a, b) => JSON.stringify([a.byEntry, a.end, a.now]) === JSON.stringify([b.byEntry, b.end, b.now])
  check('earlier weeks only: voice, the meal sheet and a row without a source give the same result', [same(run('voice'), run('meal_sheet')), same(run('voice'), run(null))], [true, true])
  check('… and it\'s the 5c result (Thursday sees 4, uses 2)', brief(uses(run('voice'), 'thu')), [['sour-cream', 4, 2, false]])
}
{
  // The kale case (7a4). This week's list, first saved today (Thursday) and
  // not checked off, has a bunch of kale: bought on the week's Sunday (10-18,
  // keeps 5: good till Fri 10-23), not today. Voice reaches it, and next
  // Monday's meal doesn't count on kale that would have spoiled.
  const THU = '2026-10-22'
  const kaleR = recipe('Kale salad', 1, [{ name: 'kale', amount: 0.5, unit: 'bunch' }])
  const rows = { lists: [list(W1, THU, [pkgItem('kale', 1, 1)])], plans: [plan(W1, []), plan(W2, [cook('n', 'monday', kaleR)])] }
  const plain = inferOnHand(rows, { today: THU })
  const lot = plain.bought.find((l) => l.key === 'kale')
  check('the list saved today: bought on its Sunday, good till Friday; not confirmed (not checked off)', [lot.boughtOn, lot.useBy, lot.confirmed], [W1, '2026-10-23', false])
  check('… voice reads it (a bunch); next Monday\'s salad gets none of it (spoiled by Friday)', [plain.nowAll.kale, brief(uses(plain, 'n'))], [{ inferred: 1, amount: 1, packageAmount: 1, answer: null }, []])
  const gone = inferOnHand({ ...rows, adjustments: [{ ...adj('kale', THU, 'used_up', 0), source: 'voice' }] }, { today: THU })
  check('"The kale is gone" by voice reaches it', [gone.nowAll.kale.amount, gone.end.lots.find((l) => l.key === 'kale').amount], [0, 0])
  // Sunday itself: the week's list is bought that morning, so voice covers it that day.
  const sun = inferOnHand({ ...rows, adjustments: [{ ...adj('kale', W1, 'used_up', 0), source: 'voice' }] }, { today: W1 })
  check('bought today (the week\'s Sunday): voice covers it the same day', [sun.nowAll.kale.inferred, sun.nowAll.kale.amount], [1, 0])
}
{
  // Short names in a meal: "parmesan cheese" and "greek yogurt" from last week (keep 30 and 10 days).
  const bake = recipe('Parmesan bake', 1, [{ name: 'parmesan cheese', amount: 5, unit: 'oz' }, { name: 'greek yogurt', amount: 4, unit: 'oz' }])
  const lists = (extra = []) => [list(W0, '2026-10-17', [pkgItem('parmesan', 1, 5, { name: 'parmesan cheese' }), pkgItem('greek-yogurt', 1, 16), ...extra])]
  const r = inferOnHand({ lists: lists(), plans: [plan(W0, []), plan(W1, [cook('m', 'monday', bake)])] }, { today: TODAY })
  const roll = weekRollovers(r, { weekStart: W1, thisWeek: W1, today: TODAY }).m
  check('a meal\'s line, popover and sheet use the short names, in the same order', [roll.reason, roll.items.map((i) => i.name)], ['Uses your parmesan and yogurt', ['parmesan', 'yogurt']])
  const both = inferOnHand({ lists: lists([pkgItem('plain-yogurt', 1, 32)]), plans: [plan(W0, []), plan(W1, [cook('m', 'monday', bake)])] }, { today: TODAY })
  check('… with plain yogurt on hand too, "greek yogurt" stays', uses(both, 'm').reason, 'Uses your parmesan and greek yogurt')
}

// ── Words
const it = (name, finishes) => ({ name, finishes })
check('reason: one finished', reasonText([it('green beans', true)]), 'Uses the rest of the green beans')
check('reason: one not finished', reasonText([it('green onions', false)]), 'Uses your green onions')
check('reason: finished and not: never a mixed sentence', reasonText([it('green beans', true), it('green onions', false)]), 'Uses your green beans and green onions')
check('reason: everything it names finished → "Uses the rest of …"', reasonText([it('ricotta', true), it('yogurt', true)]), 'Uses the rest of the ricotta and yogurt')
check('reason: otherwise "Uses your …", three names when they fit', reasonText([it('ricotta', true), it('yogurt', false), it('kale', true)]), 'Uses your ricotta, yogurt and kale')
check('reason: the widths at 390px (text column less the icon): meal card, Today card, picker row', [LINE_WIDTHS, LINE_WIDTH], [{ card: 304, today: 228, picker: 240 }, 304])
const three = [it('green beans', false), it('sour cream', false), it('scallions', true)]
check('reason: as many names as fit on one line: three (297 px in a 304 px card), else two and "and 1 more" (288 px), else one and "and 2 more"',
  [reasonText(three), reasonText(three, { width: 290 }), reasonText(three, { width: LINE_WIDTHS.picker }), [297, 288].map((n, i) => Math.round(lineWidth(['Uses your green beans, sour cream and scallions', 'Uses your green beans, sour cream and 1 more'][i])) === n)],
  ['Uses your green beans, sour cream and scallions', 'Uses your green beans, sour cream and 1 more', 'Uses your green beans and 2 more', [true, true]])
check('reason: long names in a card: "baby broccoli, shredded cabbage and 1 more" is 398 px, so one name', reasonText([it('baby broccoli', true), it('shredded cabbage', true), it('scallions', true)]), 'Uses the rest of the baby broccoli and 2 more')
check('reason: two that don\'t fit (the picker row) → one and "and 1 more"', reasonText([it('green beans', true), it('scallions', true)], { width: LINE_WIDTHS.picker }), 'Uses the rest of the green beans and 1 more')
check('reason: at most three (the popover\'s), whatever is passed', reasonText([it('feta', false), it('kale', false), it('dill', false), it('basil', false)]), 'Uses your feta, kale and dill')
check('reason: the width fits what the cards measured ("Uses your cilantro, dill and scallions" 220 px in the browser)', Math.round(lineWidth('Uses your cilantro, dill and scallions')), 220)
check('reason: none', reasonText([]), null)
check('short names: words that don\'t help go ("ricotta cheese" → "ricotta", "parmesan cheese" → "parmesan", "panko breadcrumbs" → "panko", "crunchy chili garlic oil" → "chili garlic oil")',
  [shortName('ricotta', 'ricotta cheese'), shortName('parmesan', 'parmesan cheese'), shortName('panko', 'panko breadcrumbs'), shortName('chili-crisp', 'crunchy chili garlic oil')], ['ricotta', 'parmesan', 'panko', 'chili garlic oil'])
check('short names: "greek yogurt" → "yogurt", unless another yogurt is on hand', [shortName('greek-yogurt', 'greek yogurt'), shortName('greek-yogurt', 'greek yogurt', [{ key: 'plain-yogurt', name: 'plain yogurt' }])], ['yogurt', 'greek yogurt'])
check('short names: kept when the shorter name is another item ("cream cheese": "cream" is heavy cream) or there\'s nothing to drop',
  [shortName('cream-cheese', 'cream cheese'), shortName('sour-cream', 'sour cream'), shortName('green-onion', 'green onions'), shortName('broccolini', 'baby broccoli')], ['cream cheese', 'sour cream', 'green onions', 'baby broccoli'])
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
