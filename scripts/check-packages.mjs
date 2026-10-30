// Assertions for the package rules (src/v2/lib/packages.js), the package
// table (src/v2/lib/packageSizes.js) and the shopping list generation that
// uses them (generateShoppingItems and friends in src/lib/utils.js).
// npm run check:packages
import { entryById, findEntry, findLineEntry, linePackage, normalizeName, statedContainerSize } from '../src/v2/lib/packages.js'
import { PACKAGE_ENTRIES } from '../src/v2/lib/packageSizes.js'
import { checkedChange, formatShoppingItemQuantity, formatShoppingList, generateShoppingItems, shoppingWeekEnded } from '../src/lib/utils.js'

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
check('herbs: "dried oregano leaves" in tsp is dried; "dried thyme" in tbsp is dried too', [lineKey('dried oregano leaves', 'tsp'), lineKey('dried thyme', 'tbsp')], ['dried-oregano', 'dried-thyme'])
check('herbs: a tsp of a non-herb is unchanged (garlic powder, salt)', [lineKey('garlic powder', 'tsp'), lineKey('salt', 'tsp')], ['garlic-powder', 'salt'])

// ── Line notes (2026-10-19): "fresh" keeps an herb fresh in any unit, and a can
// or package size stated in the notes or the name picks the entry's size
// within 5% of it instead of the standard can.
const noteKey = (name, unit, notes) => findLineEntry(name, unit, { notes })?.entry.id ?? null
check('fresh: "1 tsp fresh thyme" is not the dried staple (no fresh thyme entry yet)', noteKey('fresh thyme', 'tsp', ''), null)
check('fresh: basil in tsp with notes "fresh" stays fresh basil', noteKey('basil', 'tsp', 'fresh'), 'basil')
check('fresh: "fresh dill" in tsp stays fresh dill', noteKey('fresh dill', 'tsp', ''), 'dill')
check('fresh: notes "Fresh, chopped" count too', noteKey('cilantro', 'tsp', 'Fresh, chopped'), 'cilantro')
check('fresh unchanged: a tsp of basil with no notes is dried', noteKey('basil', 'tsp', ''), 'dried-basil')
check('fresh unchanged: "freshly ground black pepper" is black pepper', noteKey('freshly ground black pepper', 'tsp', ''), 'black-pepper')
check('fresh unchanged: notes that don\'t say fresh ("finely chopped") leave a tsp of oregano dried', noteKey('oregano', 'tsp', 'finely chopped'), 'dried-oregano')
check('fresh unchanged: 1 cup basil with notes "fresh" (the Herby Chicken Meatball Bowl line) is fresh basil', noteKey('basil', 'cup', 'fresh'), 'basil')

// A line's package as the list works it out, notes included.
const pickLine = (name, amount, unit, notes = '') => {
  const m = findLineEntry(name, unit, { notes })
  if (!m) return null
  const r = linePackage(m.entry, [{ amount, unit, scale: m.scale, containerSize: m.containerSize }])
  return r.package ? r.package.text : null
}
check('stated size: notes parse ("can (420g)", "15 oz can", "1 (14.5 oz) can", "28-ounce can", "can (400 ml)")',
  ['can (420g)', '15 oz can', '1 (14.5 oz) can', '28-ounce can', 'can (400 ml)'].map(statedContainerSize),
  [{ amount: 420, unit: 'g' }, { amount: 15, unit: 'oz' }, { amount: 14.5, unit: 'oz' }, { amount: 28, unit: 'oz' }, { amount: 400, unit: 'ml' }])
check('stated size: none without a container word or a unit ("about 6 oz", "canned, drained", "1 can")',
  ['about 6 oz', 'canned, drained', '1 can'].map(statedContainerSize), [null, null, null])
check('can size: "1 whole" crushed tomatoes, notes "can (420g)" → the 14.5 oz can (Taco Mac)', pickLine('crushed tomatoes', 1, 'whole', 'can (420g)'), '14.5 oz can')
check('can size: 2 of them → 2 × 14.5 oz can', pickLine('crushed tomatoes', 2, 'whole', 'can (420g)'), '2 × 14.5 oz can')
check('can size: 0.6 of one (a scaled recipe) → 14.5 oz can', pickLine('crushed tomatoes', 0.6, 'whole', 'can (420g)'), '14.5 oz can')
check('can size: "420 g" with notes "can (420g)" is one 14.5 oz can, not the 28 oz', pickLine('crushed tomatoes', 420, 'g', 'can (420g)'), '14.5 oz can')
check('can size: "1 can" with notes "28 oz can" → 28 oz can', pickLine('crushed tomatoes', 1, 'can', '28 oz can'), '28 oz can')
check('can size: in the name ("15 oz can chickpeas", 1 can) → 15 oz can', pickLine('15 oz can chickpeas', 1, 'can'), '15 oz can')
check('can size: coconut milk "1 can (400 ml)" → 13.5 fl oz can', pickLine('coconut milk', 1, 'whole', '1 can (400 ml)'), '13.5 fl oz can')
check('can size: broth "1 (32 oz) carton" → 32 oz carton', pickLine('chicken broth', 1, 'whole', '1 (32 oz) carton'), '32 oz carton')
check('package size: "1 package" cream cheese, notes "8 oz package" → 8 oz block (a bare "whole" has no conversion)',
  [pickLine('cream cheese', 1, 'package', '8 oz package'), pickLine('cream cheese', 1, 'whole', '')], ['8 oz block', null])
check('can size: outside 5% ("can (10 oz)") → the standard 28 oz can, as before', pickLine('crushed tomatoes', 1, 'whole', 'can (10 oz)'), '28 oz can')
check('can size unchanged: "1 whole" crushed tomatoes with no notes → 28 oz can', pickLine('crushed tomatoes', 1, 'whole'), '28 oz can')
check('can size unchanged: 15 oz chickpeas, notes "canned, drained" → 15 oz can', pickLine('chickpeas', 15, 'oz', 'canned, drained'), '15 oz can')
check('can size unchanged: 1½ cups chickpeas (drained) → 15 oz can', pickLine('chickpeas', 1.5, 'cup', 'canned, drained'), '15 oz can')
check('can size unchanged: feta "1 whole", notes "about 6 oz" (no container word) → no package', pickLine('feta', 1, 'whole', 'about 6 oz'), null)
check('can size unchanged: 2 cups chicken broth → 32 oz carton', pickLine('chicken broth', 2, 'cup'), '32 oz carton')

// ── Shelf life: every entry says how many days a partly used package keeps.
const keeps = Object.fromEntries(PACKAGE_ENTRIES.map((e) => [e.id, e.keeps]))
check('keeps: every entry has a whole number of days', PACKAGE_ENTRIES.filter((e) => !Number.isInteger(e.keeps) || e.keeps < 1).map((e) => e.id), [])
check('keeps: the classes (ground meat 2, opened cans 4, kale 5, feta 7, yogurt 10, eggs 28, rice 180)',
  ['ground-beef', 'chickpeas', 'kale', 'feta', 'greek-yogurt', 'egg', 'rice'].map((k) => keeps[k]), [2, 4, 5, 7, 10, 28, 180])
check('keeps: staples and spices are pantry (60 or more)', PACKAGE_ENTRIES.filter((e) => e.staple && e.keeps < 60).map((e) => e.id), [])

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
  const marked = first.map((i) => ({ ...i, checked: true, have: true, haveSetByUser: true }))
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

{
  const tacoMac = generateShoppingItems([entry(recipe('Taco Mac', 4, [
    { name: 'crushed tomatoes', amount: 1, unit: 'whole', notes: 'can (420g)' },
    { name: 'basil', amount: 1, unit: 'tsp', notes: 'fresh' },
  ]))])
  check('notes in generation: the stated can and fresh basil', tacoMac.map((i) => [i.key, i.package?.text ?? null]), [['basil', '0.75 oz pack'], ['crushed-tomatoes', '14.5 oz can']])
}

// ── Bought record and hidden lines (checked lines no meal needs any more)
{
  const salad = entry(recipe('Salad', 1, [{ name: 'feta', amount: 3, unit: 'oz' }, { name: 'sourdough discard', amount: 1, unit: 'cup' }]))
  const soup = entry(recipe('Soup', 1, [{ name: 'onion', amount: 1, unit: 'whole' }]))
  const first = generateShoppingItems([salad, soup])
  const feta = first.find((i) => i.key === 'feta')
  check('checkedChange: checking records the package, need and day', checkedChange(feta, '2026-10-19'),
    { checked: true, bought: { package: feta.package, need: 3, needUnit: 'oz', on: '2026-10-19' } })
  check('checkedChange: a line with no package records null', checkedChange({ name: 'x', checked: false }, '2026-10-19').bought, { package: null, need: null, needUnit: null, on: '2026-10-19' })
  check('checkedChange: unchecking drops the record', checkedChange({ ...feta, checked: true, bought: {} }), { checked: false, bought: undefined })
  const bought = { package: feta.package, need: 3, needUnit: 'oz', on: '2026-10-19' }
  const marked = first.map((i) => (i.key === 'feta' || i.name === 'sourdough discard' ? { ...i, checked: true, bought } : i))
  const more = generateShoppingItems([salad, soup, entry(recipe('Pasta', 1, [{ name: 'feta', amount: 4, unit: 'oz' }]))], marked)
  const grown = more.find((i) => i.key === 'feta')
  check('bought: kept through a rebuild that changes the need (3 → 7 oz)', [grown.checked, grown.package.text, grown.bought], [true, '8 oz', bought])
  const gone = generateShoppingItems([soup], marked)
  check('hidden: checked lines no meal needs stay, hidden, checked, with bought', gone.filter((i) => i.hidden).map((i) => [i.name, i.checked, i.bought?.on]), [['feta', true, '2026-10-19'], ['sourdough discard', true, '2026-10-19']])
  check('hidden: only the onion is a normal line', gone.filter((i) => !i.hidden).map((i) => i.name), ['onion'])
  const unchecked = generateShoppingItems([soup], first)
  check('hidden: an unchecked line is dropped, as before', unchecked.map((i) => i.name), ['onion'])
  const still = generateShoppingItems([soup], gone)
  check('hidden: stays hidden through another rebuild', still.filter((i) => i.hidden).map((i) => i.name), ['feta', 'sourdough discard'])
  const back = generateShoppingItems([salad, soup], still)
  check('hidden: comes back checked, with bought, when a meal needs it again', back.map((i) => [i.name, !!i.hidden, i.checked, i.bought?.on ?? null]),
    [['onion', false, false, null], ['feta', false, true, '2026-10-19'], ['sourdough discard', false, true, '2026-10-19']])
  const legacy = generateShoppingItems([salad], [{ name: 'crumbled feta', checked: true }])
  check('hidden: an item saved before keys whose name matches a line isn\'t hidden', legacy.filter((i) => i.hidden).length, 0)
  const visible = (items) => {
    const groups = {}
    for (const i of items) if (!i.have && !i.hidden) (groups[i.category] ??= []).push(i)
    return groups
  }
  check('copy: hidden lines aren\'t copied', formatShoppingList(visible(gone)), 'Shopping List\n\nProduce\n- Onion, 1')
}

// ── What's on hand trims the list (step 5d; assumed leftovers too since 7a4).
{
  const beans = entry(recipe('Stir fry', 1, [{ name: 'green beans', amount: 14.4, unit: 'oz' }]))
  const honey = entry(recipe('Glaze', 1, [{ name: 'honey', amount: 0.3, unit: 'cup' }]))
  const oil = entry(recipe('Fry', 1, [{ name: 'olive oil', amount: 2, unit: 'tbsp' }]))
  const discard = entry(recipe('Bread', 1, [{ name: 'sourdough discard', amount: 1, unit: 'cup' }]))
  // weekOnHand's shape (src/v2/lib/onHand.js): confirmed, inferred, and their total.
  const oh = (confirmed, inferred = 0) => ({
    confirmed, inferred,
    confirmedUseBy: confirmed ? '2026-10-24' : null, inferredUseBy: inferred ? '2026-10-23' : null,
    confirmedText: confirmed ? `${confirmed} oz` : null, inferredText: inferred ? `${inferred} oz` : null,
    amount: confirmed + inferred, useBy: inferred ? '2026-10-23' : '2026-10-24', text: `${confirmed + inferred} oz`,
  })
  const one = (meals, onHand, previous = [], extra = {}) => generateShoppingItems(meals, previous, { onHand, ...extra })
  const short = one([beans], { 'green-bean': oh(6) })[0]
  check('short: 14.4 oz green beans, 6 oz confirmed on hand → a 12 oz bag, still on the list', [short.package.text, short.need, short.onHand, short.have, !!short.covered], ['12 oz bag', 14.4, { amount: 6, useBy: '2026-10-24', text: '6 oz' }, false, false])
  const glaze = one([honey], { honey: oh(3.6) })[0]
  check('covered: honey the week needs, all confirmed on hand → Already have, "3.6 oz on hand"', [glaze.covered, glaze.have, glaze.package, formatShoppingItemQuantity(glaze)], [true, true, null, '3.6 oz on hand'])
  const assumed = one([beans], { 'green-bean': oh(0, 6) })[0]
  check('assumed (7a4): the same 6 oz, not checked off, trims the line too → a 12 oz bag, no hint', [assumed.package.text, assumed.onHand, 'onHandHint' in assumed, assumed.have], ['12 oz bag', { amount: 6, useBy: '2026-10-23', text: '6 oz' }, false, false])
  const assumedGlaze = one([honey], { honey: oh(0, 3.6) })[0]
  check('assumed (7a4): honey only assumed on hand covers the line → Already have, "3.6 oz on hand"', [assumedGlaze.covered, assumedGlaze.have, assumedGlaze.package, formatShoppingItemQuantity(assumedGlaze)], [true, true, null, '3.6 oz on hand'])
  const mixed = one([beans], { 'green-bean': oh(4, 2) })[0]
  check('confirmed and assumed add up (4 + 2 = 6 oz, the earliest use-by)', [mixed.package.text, mixed.onHand], ['12 oz bag', { amount: 6, useBy: '2026-10-23', text: '6 oz' }])
  // "I need this" on a covered line saves a Used up correction (the Shopping page), so what's on hand for it drops to what earlier days already took; here nothing.
  const back = one([honey], {}, [assumedGlaze])[0]
  check('"I need this" on an assumed leftover: once the Used up correction is in, the line is back with its package', [back.have, !!back.covered, back.package.text, back.onHand ?? null], [false, false, '12 oz', null])
  const nearly = one([beans], { 'green-bean': oh(13.5) })[0]
  check('covered: a gap under 10% of the smallest size (0.9 oz; 10% of a 12 oz bag is 1.2) counts as covered', [nearly.covered, nearly.have, formatShoppingItemQuantity(nearly)], [true, true, '13.5 oz on hand'])
  const gapOver = one([beans], { 'green-bean': oh(13) })[0]
  check('short: a gap of 1.4 oz (over 10%) still buys a 12 oz bag', [!!gapOver.covered, gapOver.package.text], [false, '12 oz bag'])
  const insist = one([honey], { honey: oh(3.6) }, [{ key: 'honey', name: 'honey', have: false, haveSetByUser: true }])[0]
  check('the person\'s choice wins: "I need this" keeps a covered line on the list, with its full package', [insist.have, !!insist.covered, insist.package.text, insist.haveSetByUser], [false, false, '12 oz', true])
  const keep = one([beans], { 'green-bean': oh(6) }, [{ key: 'green-bean', name: 'green beans', have: true, haveSetByUser: true }])[0]
  check('the person\'s choice wins: "I already have this" on a short line stays', [keep.have, keep.haveSetByUser], [true, true])
  const olderHave = one([beans], {}, [{ key: 'green-bean', name: 'green beans', have: true, staple: false }])[0]
  const olderDefault = one([honey], { honey: oh(3.6) }, [{ key: 'honey', name: 'honey', have: false, staple: false }])[0]
  check('older items (no haveSetByUser): have ≠ staple is the person\'s choice; have = staple isn\'t', [olderHave.have, olderHave.haveSetByUser, olderDefault.have, olderDefault.haveSetByUser, !!olderDefault.covered], [true, true, true, false, true])
  const generated = one([beans], { 'green-bean': oh(6) })[0]
  check('new items always say whether it was the person\'s choice (so the older-item rule never misreads them)', typeof generated.haveSetByUser, 'boolean')
  const checkedLine = one([beans], { 'green-bean': oh(6) }, [{ key: 'green-bean', name: 'green beans', checked: true, bought: { package: { count: 1, size: 16, unit: 'oz' }, need: 14.4, needUnit: 'oz', on: '2026-10-18' } }])[0]
  check('checked lines aren\'t changed by on-hand (full package, no on-hand)', [checkedLine.package.text, checkedLine.onHand ?? null, !!checkedLine.covered], ['1 lb', null, false])
  const checkedShort = one([beans], {}, [{ key: 'green-bean', name: 'green beans', checked: true, onHand: { amount: 6, useBy: '2026-10-24', text: '6 oz' }, bought: { package: { count: 1, size: 12, unit: 'oz' }, need: 14.4, needUnit: 'oz', on: '2026-10-19' } }])[0]
  check('a line checked while short keeps its gap package, whatever on-hand says later', [checkedShort.package.text, checkedShort.onHand.amount], ['12 oz bag', 6])
  const staple = one([oil], { 'olive-oil': oh(1) })[0]
  check('staples are unchanged (Already have, no on-hand)', [staple.have, staple.onHand ?? null, !!staple.covered], [true, null, false])
  const noKey = one([discard], { 'sourdough discard': oh(1) })[0]
  check('a line without a key is unchanged', [noKey.key, noKey.onHand ?? null, noKey.package], [null, null, null])
  const chosen = one([beans], { 'green-bean': oh(6) }, [], { sizeChoices: { 'green-bean': { size: 32, unit: 'oz' } } })[0]
  check('a size choice applies to the gap (2 lb for the 8.4 oz left to buy)', chosen.package.text, '2 lb')
  const week = one([beans, honey, oil], { 'green-bean': oh(6), honey: oh(3.6) })
  const groups = {}
  for (const i of week) if (!i.have && !i.hidden) (groups[i.category] ??= []).push(i)
  check('copy: covered lines (Already have) are left out; short lines copy their smaller package', formatShoppingList(groups), 'Shopping List\n\nProduce\n- Green beans, 12 oz bag')
  check('remaining counts: only the short line still to buy', week.filter((i) => !i.have && !i.hidden && !i.checked).map((i) => i.name), ['green beans'])
}

// ── A list whose week has ended is never rebuilt or saved again.
check('week ended: Sunday to Saturday of its own week, no', ['2026-10-18', '2026-10-21', '2026-10-24'].map((d) => shoppingWeekEnded('2026-10-18', d)), [false, false, false])
check('week ended: from the next Sunday on, yes', ['2026-10-25', '2026-10-26', '2026-11-30'].map((d) => shoppingWeekEnded('2026-10-18', d)), [true, true, true])
check('week ended: a future week, no', shoppingWeekEnded('2026-10-25', '2026-10-19'), false)
check('week ended: across a month (week of Oct 25 ends Nov 1)', [shoppingWeekEnded('2026-10-25', '2026-10-31'), shoppingWeekEnded('2026-10-25', '2026-11-01')], [false, true])
check('week ended: Dates work (local time, just after midnight Sunday)', [shoppingWeekEnded(new Date(2026, 9, 18), new Date(2026, 9, 24, 23, 59)), shoppingWeekEnded(new Date(2026, 9, 18), new Date(2026, 9, 25, 0, 1))], [false, true])
check('week ended: not a date → no', [shoppingWeekEnded(null, '2026-10-25'), shoppingWeekEnded('next week', '2026-10-25'), shoppingWeekEnded('2026-10-18', 'soon')], [false, false, false])

console.log(`check:packages — ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
