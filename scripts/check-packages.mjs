// Assertions for the package rules (src/v2/lib/packages.js) and the shopping
// list generation that uses them (generateShoppingItems in src/lib/utils.js).
// npm run check:packages
import { entryById, findEntry, linePackage, normalizeName } from '../src/v2/lib/packages.js'
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
check('feta: need 10 oz → 2 × 6 oz (ties with 3 × 4 oz on what is left; fewer packages)', pick('feta', 10, 'oz'), { text: '2 × 6 oz', need: 10, leftover: 2 })
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
check('eggs: 24 → 2 dozen (no leftover, fewest packages)', pick('egg', 24, 'whole').text, '2 dozen')
check('ground beef: 2 lb + 10 oz → 3 lb', linePackage(entryById('ground-beef'), [{ amount: 2, unit: 'lb' }, { amount: 10, unit: 'oz' }]).package.text, '3 lb')
check('no entry: sourdough discard', keyOf('sourdough discard'), null)
check('can\'t convert: "1 whole" feta has no package', pick('feta', 1, 'whole'), { text: null, need: null })
check('can\'t convert: one part that won\'t convert drops the package', linePackage(entryById('feta'), [{ amount: 2, unit: 'oz' }, { amount: 1, unit: 'pinch' }]).package, null)
check('staple: salt', [findEntry('salt').entry.staple, findEntry('kosher salt').entry.id], [true, 'salt'])
check('staple: "pepper" is black pepper', findEntry('pepper').entry.id, 'black-pepper')
check('staple: spices have no package', pick('paprika', 2, 'tsp').text, null)
check('skip: water and ice', [findEntry('water').entry.skip, findEntry('warm water').entry.skip, findEntry('ice').entry.skip], [true, true, true])

// ── Matching prefers the most specific entry
check('coconut milk before milk', [keyOf('coconut milk'), keyOf('milk'), keyOf('whole milk')], ['coconut-milk', 'milk', 'milk'])
check('sour cream and cream cheese before cream', [keyOf('sour cream'), keyOf('cream cheese'), keyOf('heavy cream'), keyOf('cream')], ['sour-cream', 'cream-cheese', 'heavy-cream', 'heavy-cream'])
check('peppers kept apart from black pepper', [keyOf('red pepper flakes'), keyOf('crushed red pepper'), keyOf('red bell pepper'), keyOf('yellow bell pepper'), keyOf('black pepper')], ['red-pepper-flakes', 'red-pepper-flakes', 'red-bell-pepper', 'bell-pepper', 'black-pepper'])
check('garlic powder is not garlic', [keyOf('garlic powder'), keyOf('garlic'), keyOf('garlic cloves, minced')], ['garlic-powder', 'garlic', 'garlic'])
check('a product named after another stays unmatched', [keyOf('peanut butter'), keyOf('almond milk'), keyOf('sesame oil'), keyOf('cauliflower rice')], [null, null, null, null])
check('last words match ("extra virgin olive oil", "low sodium soy sauce")', [keyOf('light olive oil'), keyOf('low sodium soy sauce'), keyOf('93/7 lean ground beef')], ['olive-oil', 'soy-sauce', 'ground-beef'])
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
  const chosen = generateShoppingItems(meals, [], { sizeChoices: { feta: { size: 8, unit: 'oz' } } })
  check('size choice: replaces smallest-that-fits', byName(chosen, 'feta').package.text, '8 oz')
  const stale = generateShoppingItems(meals, [], { sizeChoices: { feta: { size: 8, unit: 'fl oz' } } })
  check('size choice: one saved in another unit is ignored', byName(stale, 'feta').package.text, '6 oz')
  const text = formatShoppingList({ 'Dairy & Eggs': [byName(fresh, 'feta')], Produce: [byName(fresh, 'jalapeño')] })
  check('copy: includes the package', text, 'Shopping List\n\nProduce\n- Jalapeño, 2\n\nDairy & Eggs\n- Feta, 6 oz')
}

console.log(`check:packages — ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
