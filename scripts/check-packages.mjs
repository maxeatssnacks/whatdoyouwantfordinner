// Assertions for the package rules (src/v2/lib/packages.js) and the shopping
// list generation that uses them (generateShoppingItems in src/lib/utils.js).
// npm run check:packages
import { entryById, findEntry, findLineEntry, linePackage, normalizeName } from '../src/v2/lib/packages.js'
import { formatShoppingItemQuantity, formatShoppingList, generateShoppingItems } from '../src/lib/utils.js'

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

const pick = (key, amount, unit, preferredSize = null) => {
  const r = linePackage(entryById(key), [{ amount, unit }], { preferredSize })
  return r.package ? { text: r.package.text, need: r.need, leftover: r.leftover } : { text: null, need: r.need }
}
const keyOf = (name) => findEntry(name)?.entry.id ?? null

// ── Rounding (feta is sold as 4, 6 and 8 oz)
check('feta: need 4 oz → 4 oz', pick('feta', 4, 'oz'), { text: '4 oz', need: 4, leftover: 0 })
check('feta: need 5 oz → 6 oz, 1 oz over', pick('feta', 5, 'oz'), { text: '6 oz', need: 5, leftover: 1 })
check('feta: need 10 oz → 2 × 6 oz (2 packages like 2 × 8 oz, less left over)', pick('feta', 10, 'oz'), { text: '2 × 6 oz', need: 10, leftover: 2 })
check('feta: grams convert (113 g → 4 oz)', pick('feta', 113, 'g').text, '4 oz')
check('feta: cups use the entry (1 cup crumbled = 5 oz → 6 oz)', pick('feta', 1, 'cup'), { text: '6 oz', need: 5, leftover: 1 })
check('feta: a chosen size replaces smallest-that-fits (10 oz with 8 oz → 2 × 8 oz)', pick('feta', 10, 'oz', 8), { text: '2 × 8 oz', need: 10, leftover: 6 })
check('feta: a chosen size that is enough alone (5 oz with 8 oz → 8 oz)', pick('feta', 5, 'oz', 8).text, '8 oz')
check('feta: a chosen size the table no longer has is ignored', pick('feta', 5, 'oz', 7).text, '6 oz')
check('loose: 1.5 onions → 2', pick('onion', 1.5, 'whole'), { text: '2', need: 1.5, leftover: 0.5 })
check('loose: 1 onion → 1', pick('onion', 1, 'whole').text, '1')
check('bunches: 1.5 bunches of cilantro → 2 bunches', pick('cilantro', 1.5, 'whole').text, '2 bunches')
check('bunches: ½ cup chopped cilantro → 1 bunch', pick('cilantro', 0.5, 'cup').text, '1 bunch')
check('garlic: 4 cloves → 1 head', pick('garlic', 4, 'whole').text, '1 head')
check('garlic: 12 cloves → 2 heads', pick('garlic', 12, 'whole').text, '2 heads')
check('eggs: 3 → ½ dozen', pick('egg', 3, 'whole').text, '½ dozen')
check('eggs: 24 → 2 dozen (2 cartons like 2 × 18, less left over)', pick('egg', 24, 'whole').text, '2 dozen')
check('eggs: 30 → 2 × 18 eggs (the fewest cartons; not 5 × ½ dozen)', pick('egg', 30, 'whole'), { text: '2 × 18 eggs', need: 30, leftover: 6 })
check('broth: 2 cups chicken broth → one 32 oz carton, not 2 × 14.5 oz cans', pick('chicken-broth', 2, 'cup'), { text: '32 oz carton', need: 16, leftover: 16 })
check('broth: 5 cups → 2 × 32 oz carton (fewest packages)', pick('chicken-broth', 5, 'cup').text, '2 × 32 oz carton')
check('ground beef: 2 lb + 10 oz → 3 lb', linePackage(entryById('ground-beef'), [{ amount: 2, unit: 'lb' }, { amount: 10, unit: 'oz' }]).package.text, '3 lb')
check('no entry: sourdough discard', keyOf('sourdough discard'), null)
check('own unit: "1 bunch" of green onions → 1 bunch', pick('green-onion', 1, 'bunch').text, '1 bunch')
check('can: "1 can" crushed tomatoes → 28 oz can (the standard can)', pick('crushed-tomatoes', 1, 'can').text, '28 oz can')

// ── Canned goods: oz and g are the can's net weight; cups are drained; a bare
// "can" or "whole" is the standard can, and several multiply.
check('canned: 15 oz chickpeas → 1 can', pick('chickpeas', 15, 'oz').text, '15 oz can')
check('canned: 30 oz chickpeas → 2 cans', pick('chickpeas', 30, 'oz').text, '2 × 15 oz can')
check('canned: 425 g chickpeas (net weight) → 1 can', pick('chickpeas', 425, 'g').text, '15 oz can')
check('canned: 1½ cups chickpeas (drained) → 1 can', pick('chickpeas', 1.5, 'cup').text, '15 oz can')
check('canned: 28 oz crushed tomatoes → one 28 oz can', pick('crushed-tomatoes', 28, 'oz').text, '28 oz can')
check('canned: 14.5 oz crushed tomatoes → 14.5 oz can', pick('crushed-tomatoes', 14.5, 'oz').text, '14.5 oz can')
check('canned: 2 cans crushed tomatoes → 2 × 28 oz', pick('crushed-tomatoes', 2, 'can').text, '2 × 28 oz can')
check('canned: "1 whole" crushed tomatoes → 28 oz can', pick('crushed-tomatoes', 1, 'whole').text, '28 oz can')
check('canned: 1 can chickpeas → 15 oz can', pick('chickpeas', 1, 'can').text, '15 oz can')
check('canned: 1 can coconut milk; 13.5 oz and 400 g → 1 can', [pick('coconut-milk', 1, 'can').text, pick('coconut-milk', 13.5, 'oz').text, pick('coconut-milk', 400, 'g').text], ['13.5 fl oz can', '13.5 fl oz can', '13.5 fl oz can'])
check('canned: 1 can broth → 14.5 oz can; 14.5 oz → 1 can', [pick('chicken-broth', 1, 'can').text, pick('chicken-broth', 14.5, 'oz').text], ['14.5 oz can', '14.5 oz can'])
check('canned: cups of broth still follow the package rule (2 cups → 32 oz carton)', pick('chicken-broth', 2, 'cup').text, '32 oz carton')
check('slices: 3 slices of white bread → 1 loaf', [keyOf('bread, white'), pick('sandwich-bread', 3, 'slice').text], ['sandwich-bread', '1 loaf'])
check('english muffins: 8 → 2 × 6-pack', pick('english-muffin', 8, 'whole').text, '2 × 6-pack')
check('garlic: "3 cloves" as a unit → 1 head', pick('garlic', 3, 'cloves').text, '1 head')
check('can\'t convert: "1 whole" feta has no package', pick('feta', 1, 'whole'), { text: null, need: null })
check('can\'t convert: one part that won\'t convert drops the package', linePackage(entryById('feta'), [{ amount: 2, unit: 'oz' }, { amount: 1, unit: 'pinch' }]).package, null)
check('staple: salt', [findEntry('salt').entry.staple, findEntry('kosher salt').entry.id], [true, 'salt'])
check('staple: "pepper" is black pepper', findEntry('pepper').entry.id, 'black-pepper')
check('staple: spices have no package', pick('paprika', 2, 'tsp').text, null)
check('skip: water and ice', [findEntry('water').entry.skip, findEntry('warm water').entry.skip, findEntry('ice').entry.skip], [true, true, true])

// ── Herbs: a tsp means dried (a staple); tbsp, cups, bunches, sprigs and
// "whole" stay fresh.
const lineKey = (name, unit) => findLineEntry(name, unit)?.entry.id ?? null
check('herbs: 1 tsp dill → dried dill, a staple', [lineKey('dill', 'tsp'), findLineEntry('dill', 'tsp').entry.staple], ['dried-dill', true])
check('herbs: ½ cup dill → 1 bunch (fresh)', [lineKey('dill', 'cup'), pick('dill', 0.5, 'cup').text], ['dill', '1 bunch'])
check('herbs: tbsp, bunch and "whole" stay fresh', [lineKey('dill', 'tbsp'), lineKey('dill', 'bunch'), lineKey('cilantro', 'whole')], ['dill', 'dill', 'cilantro'])
check('herbs: a tsp of each herb is its dried staple', ['dill', 'basil', 'oregano', 'thyme', 'parsley', 'rosemary', 'cilantro', 'sage', 'tarragon', 'mint'].map((h) => lineKey(h, 'tsp')), ['dried-dill', 'dried-basil', 'dried-oregano', 'dried-thyme', 'dried-parsley', 'dried-rosemary', 'dried-cilantro', 'dried-sage', 'dried-tarragon', 'dried-mint'])
check('herbs: "fresh dill" and "dried oregano leaves" in tsp are dried; "dried thyme" in tbsp is dried too', [lineKey('fresh dill', 'tsp'), lineKey('dried oregano leaves', 'tsp'), lineKey('dried thyme', 'tbsp')], ['dried-dill', 'dried-oregano', 'dried-thyme'])
check('herbs: a tsp of a non-herb is unchanged (garlic powder, salt)', [lineKey('garlic powder', 'tsp'), lineKey('salt', 'tsp')], ['garlic-powder', 'salt'])

// ── Common name variants of the exact-only words; staples start in Already have
const variants = {
  'kosher salt': 'salt', 'sea salt': 'salt', 'vegetable oil': 'vegetable-oil', 'canola oil': 'vegetable-oil',
  'avocado oil': 'avocado-oil', 'extra virgin olive oil': 'olive-oil', 'brown sugar': 'brown-sugar',
  'powdered sugar': 'powdered-sugar', 'unsalted butter': 'butter', 'salted butter': 'butter', 'red onion': 'red-onion',
  'yellow onion': 'onion', 'white onion': 'onion', 'whole milk': 'milk', '2% milk': 'milk', 'large eggs': 'egg',
  'brown rice': 'brown-rice', 'basmati rice': 'rice', 'long grain white rice': 'rice',
}
check('variants: each matches its entry', Object.keys(variants).map(keyOf), Object.values(variants))
check('variants: the staples among them are staples', Object.keys(variants).filter((n) => findEntry(n)?.entry.staple), ['kosher salt', 'sea salt', 'vegetable oil', 'canola oil', 'avocado oil', 'extra virgin olive oil', 'brown sugar', 'powdered sugar'])

// ── Matching prefers the most specific entry
check('coconut milk before milk', [keyOf('coconut milk'), keyOf('milk'), keyOf('whole milk')], ['coconut-milk', 'milk', 'milk'])
check('sour cream and cream cheese before cream', [keyOf('sour cream'), keyOf('cream cheese'), keyOf('heavy cream'), keyOf('cream')], ['sour-cream', 'cream-cheese', 'heavy-cream', 'heavy-cream'])
check('peppers kept apart from black pepper', [keyOf('red pepper flakes'), keyOf('crushed red pepper'), keyOf('red bell pepper'), keyOf('yellow bell pepper'), keyOf('black pepper')], ['red-pepper-flakes', 'red-pepper-flakes', 'red-bell-pepper', 'bell-pepper', 'black-pepper'])
check('garlic powder is not garlic', [keyOf('garlic powder'), keyOf('garlic'), keyOf('garlic cloves, minced')], ['garlic-powder', 'garlic', 'garlic'])
check('a product named after another stays unmatched', [keyOf('almond milk'), keyOf('sesame oil'), keyOf('cauliflower rice'), keyOf('pineapple'), keyOf('apple cider vinegar')], [null, null, null, null, null])
check('last words match ("extra virgin olive oil", "low sodium soy sauce")', [keyOf('light olive oil'), keyOf('low sodium soy sauce'), keyOf('93/7 lean ground beef')], ['olive-oil', 'soy-sauce', 'ground-beef'])
// Pitfalls of matching by last words: each gets its own entry or no match,
// never the wrong one.
const notWrong = (name, wrong) => {
  const key = keyOf(name)
  return key === null || !wrong.includes(key) ? 'ok' : `matched ${key}`
}
check('pitfall: peanut butter is not butter', [keyOf('peanut butter'), keyOf('creamy peanut butter')], ['peanut-butter', 'peanut-butter'])
check('pitfall: green onion and scallion are not onion', [keyOf('green onion'), keyOf('green onions'), keyOf('scallions')], ['green-onion', 'green-onion', 'green-onion'])
check('pitfall: sweet potato is not potato', [keyOf('sweet potato'), notWrong('sweet potatoes', ['potato'])], ['sweet-potato', 'ok'])
check('pitfall: almond flour is not flour and not a staple', [notWrong('almond flour', ['flour']), findEntry('almond flour')?.entry.staple ?? false], ['ok', false])
check('pitfall: coconut milk is not milk', keyOf('coconut milk'), 'coconut-milk')
check('pitfall: sour cream and cream cheese are not cream', [keyOf('sour cream'), keyOf('cream cheese')], ['sour-cream', 'cream-cheese'])
check('pitfall: red pepper flakes and bell pepper are not black pepper', [keyOf('red pepper flakes'), keyOf('bell pepper')], ['red-pepper-flakes', 'bell-pepper'])
check('pitfall: garlic powder is not fresh garlic', keyOf('garlic powder'), 'garlic-powder')
check('pitfall: chicken broth is not chicken', [keyOf('chicken broth'), notWrong('chicken broth', ['chicken', 'chicken-breast', 'chicken-thigh'])], ['chicken-broth', 'ok'])
check('pitfall: tomato paste is not tomatoes', notWrong('tomato paste', ['tomato', 'tomatoes', 'crushed-tomatoes', 'diced-tomatoes']), 'ok')

check('normalize: "Feta cheese, crumbled"', normalizeName('Feta cheese, crumbled'), 'feta cheese')
check('normalize: "bread, white"', normalizeName('bread, white'), 'white bread')
check('normalize: "Jalapeños (seeded)"', normalizeName('Jalapeños (seeded)'), 'jalapeno')

// ── Shopping list generation
const recipe = (title, servings, ingredients) => ({ title, servings, ingredients })
const entry = (r, servings = null) => ({ recipe: r, servings, is_leftover: false })
const byName = (items, name) => items.find((i) => i.name === name)

{
  const items = generateShoppingItems([
    entry(recipe('Salad', 1, [{ name: 'feta cheese, crumbled', amount: 0.5, unit: 'cup' }])),
    entry(recipe('Pasta', 1, [{ name: 'feta', amount: 2, unit: 'oz' }])),
  ])
  const feta = items.find((i) => i.key === 'feta')
  check('merge: two feta names make one line', items.filter((i) => i.key === 'feta').length, 1)
  check('merge: the line keeps the shorter name and both meals', [feta.name, feta.meals], ['feta', ['Salad', 'Pasta']])
  check('merge: the week\'s total gets one package (2.5 + 2 oz → 6 oz)', [feta.need, feta.needUnit, feta.package?.text, feta.leftover], [4.5, 'oz', '6 oz', 1.5])
  check('merge: amounts that don\'t combine stay apart (0.5 cup + 2 oz)', formatShoppingItemQuantity({ parts: feta.parts }), '0.5 cup + 2 oz')
}

{
  const items = generateShoppingItems([
    entry(recipe('Soup', 1, [{ name: 'onion', amount: 1, unit: 'whole' }, { name: 'sourdough discard', amount: 0.5, unit: 'cup' }])),
    entry(recipe('Stew', 1, [{ name: 'onion', amount: 100, unit: 'g' }, { name: 'sourdough discard', amount: 100, unit: 'g' }])),
    entry(recipe('Bread', 1, [{ name: 'sourdough discard', amount: 2, unit: 'tbsp' }, { name: 'water', amount: 1, unit: 'cup' }])),
  ])
  const onion = byName(items, 'onion')
  check('unit fix: 1 whole + 100 g onion is one onion line, not "101 whole"', formatShoppingItemQuantity({ parts: onion.parts }), '1 whole + 3.5 oz (100g)')
  check('unit fix: the onion line converts both (1 + 0.67 → 2 onions)', [onion.need, onion.package?.text], [1.67, '2'])
  const discard = byName(items, 'sourdough discard')
  check('unit fix: without an entry, cups and grams stay apart; cups and tbsp combine', formatShoppingItemQuantity(discard), '0.63 cup + 3.5 oz (100g)')
  check('unit fix: no entry means no package', [discard.key, discard.package], [null, null])
  check('skip: water never reaches the list', items.some((i) => i.name === 'water'), false)
}

{
  const meals = [entry(recipe('Tacos', 4, [
    { name: 'salt', amount: 1, unit: 'tsp' },
    { name: 'olive oil', amount: 2, unit: 'tbsp' },
    { name: 'feta', amount: 3, unit: 'oz' },
    { name: 'jalapeño', amount: 1, unit: 'whole' },
  ]), 8)]
  const fresh = generateShoppingItems(meals)
  check('staple: starts in Already have', [byName(fresh, 'salt').have, byName(fresh, 'salt').staple, byName(fresh, 'feta').have], [true, true, false])
  check('servings: 8 of a 4-serving recipe doubles amounts (3 oz → 6 oz feta)', byName(fresh, 'feta').package.text, '6 oz')
  check('category comes from the entry (salt in Canned & Pantry, not by keyword)', byName(fresh, 'salt').category, 'Canned & Pantry')
  const previous = [
    { name: 'salt', key: 'salt', have: false },
    { name: 'feta cheese', key: 'feta', have: true, checked: true },
  ]
  const again = generateShoppingItems(meals, previous)
  check('have: a staple moved out stays out', byName(again, 'salt').have, false)
  check('have and checked carry over by key across a name change', [byName(again, 'feta').have, byName(again, 'feta').checked], [true, true])
  // A line renamed as meals are added keeps its state (by key, not name).
  const salad = entry(recipe('Salad', 1, [{ name: 'feta cheese, crumbled', amount: 0.5, unit: 'cup' }]))
  const first = generateShoppingItems([salad])
  check('state: one meal names the line "feta cheese, crumbled"', first.map((i) => i.name), ['feta cheese, crumbled'])
  const marked = first.map((i) => ({ ...i, checked: true, have: true }))
  const renamed = generateShoppingItems([salad, entry(recipe('Pasta', 1, [{ name: 'feta', amount: 2, unit: 'oz' }]))], marked)
  check('state: adding a meal renames it "feta" and keeps checked and have', renamed.map((i) => [i.name, i.checked, i.have]), [['feta', true, true]])
  const unkeyed = generateShoppingItems([salad], [{ name: 'crumbled feta', checked: true }])
  check('state: an item saved before keys existed is matched through its name', unkeyed[0].checked, true)
  const otherName = generateShoppingItems([entry(recipe('Soup', 1, [{ name: 'sourdough discard', amount: 1, unit: 'cup' }]))], [{ name: 'sourdough discard', checked: true }])
  check('state: a line with no key carries over by name', otherName[0].checked, true)
  const chosen = generateShoppingItems(meals, [], { sizeChoices: { feta: { size: 8, unit: 'oz' } } })
  check('size choice: replaces smallest-that-fits', byName(chosen, 'feta').package.text, '8 oz')
  const stale = generateShoppingItems(meals, [], { sizeChoices: { feta: { size: 8, unit: 'fl oz' } } })
  check('size choice: one saved in another unit is ignored', byName(stale, 'feta').package.text, '6 oz')
  const text = formatShoppingList({ 'Dairy & Eggs': [byName(fresh, 'feta')], Produce: [byName(fresh, 'jalapeño')] })
  check('copy: includes the package', text, 'Shopping List\n\nProduce\n- Jalapeño, 2\n\nDairy & Eggs\n- Feta, 6 oz')
}

{
  const week = generateShoppingItems([
    entry(recipe('Salmon', 1, [{ name: 'dill', amount: 1, unit: 'tsp' }])),
    entry(recipe('Salad', 1, [{ name: 'dill', amount: 0.5, unit: 'cup' }])),
  ])
  check('herbs: dill both ways in one week → two lines (the dried staple and the fresh bunch)', week.map((i) => [i.name, i.key, i.staple, i.have, i.package?.text ?? null]), [['dill', 'dill', false, false, '1 bunch'], ['dried dill', 'dried-dill', true, true, null]])
}
{
  const staples = ['kosher salt', 'sea salt', 'vegetable oil', 'canola oil', 'avocado oil', 'extra virgin olive oil', 'brown sugar', 'powdered sugar']
  const items = generateShoppingItems([entry(recipe('Bake', 1, staples.map((name) => ({ name, amount: 1, unit: 'tbsp' }))))])
  check('variants: staple variants all start in Already have (none on the to-buy list)', items.filter((i) => !i.have).map((i) => i.name), [])
}

console.log(`check:packages — ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
