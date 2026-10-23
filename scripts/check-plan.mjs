// Assertions for Plan my week and the ranking (v2 build step 6a):
// useMealPlanSuggest's real picking path with Supabase stubbed (the repeat
// rule, open days, the meal-type fallback), src/v2/lib/planRank.js (slot
// ranking, reasons, planWeek, package math against the shopping list) and
// leftover moves (src/v2/lib/slotFill.js).
// npm run check:plan
import fs from 'node:fs'
import { register } from 'node:module'
import {
  MACRO_WINDOW,
  STAKE_FACTORS,
  VALUE_STEP,
  mealTypePool,
  stakeFactor,
  onHandBefore,
  planWeek,
  recipeDays,
  repeatGap,
  sharingText,
  slotChoices,
  slotRanking,
  weekPurchases,
} from '../src/v2/lib/planRank.js'
import { generateShoppingItems, getDaysOfWeek, scoreRecipeForHousehold } from '../src/lib/utils.js'
import { addDays, mealNeeds, mealNeedsUncached, mealUses, prepareOnHand } from '../src/v2/lib/onHand.js'
import { entryById } from '../src/v2/lib/packages.js'

// The hook and the Week page helpers import React, the Supabase client and
// extensionless paths; the loader stands those in (scripts/stubs/).
register('./stubs/loader.mjs', import.meta.url)
const { useMealPlanSuggest } = await import('../src/hooks/useMealPlanSuggest.js')
const { leftoverMoveTargets, placeMeal } = await import('../src/v2/lib/slotFill.js')
const { rankPickerRecipes } = await import('../src/v2/lib/swap.js')
const { openDaysLabel, planDoneText } = await import('../src/v2/lib/weekModel.js')

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

const library = JSON.parse(fs.readFileSync(new URL('./fixtures/plan-library.json', import.meta.url), 'utf8'))
const members = [library.member]
const recipe = (start) => library.recipes.find((r) => r.title.startsWith(start))
const taco = recipe('Taco Mac')
const crispy = recipe('Crispy Chili')
const hotHoney = recipe('Hot Honey')
const firecracker = recipe('Firecracker')
const herby = recipe('Herby Chicken')
const muffins = recipe('Sourdough')
const entrees = [taco, crispy, hotHoney, firecracker, herby]
const short = (r) => r?.title.split(' ')[0]
// One person: people × (1 + up to 2 leftovers).
const servingsFor = (r) => Math.min(3, Number(r.servings))

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WEEK = '2026-10-25'
const NEXT = '2026-11-01'
const PREV = '2026-10-18'

// ── Plan my week: the hook's picking path (Supabase stubbed)

async function suggestOnce({ recipes, recent = [], fromIdx = 0, current = [], next = [], prev = [], bypass = false, mealTypes = ['Dinner'] }) {
  globalThis.__supabaseWrites.length = 0
  const { suggest } = useMealPlanSuggest({
    weekStartDate: WEEK,
    nextWeekStartDate: NEXT,
    thisWeekStartDate: '2026-01-04', // far away: no on-hand for these scenarios
    recipes,
    recentRecipeIds: recent,
    activeMembers: members,
    currentMealPlan: { id: `plan-${WEEK}`, entries: current },
    nextWeekMealPlan: { id: `plan-${NEXT}`, entries: next },
    previousWeekMealPlan: { id: `plan-${PREV}`, entries: prev },
    days: getDaysOfWeek(WEEK).slice(fromIdx),
    keepEntryIds: current.map((e) => e.id),
  })
  const result = await suggest({ mealTypes, bypassRecencyFilter: bypass })
  const inserted = globalThis.__supabaseWrites.filter((w) => w.op === 'insert' && w.table === 'meal_plan_entries').flatMap((w) => w.rows)
  // Every meal around the planned week as day numbers (−7…−1 last week, 7+ next week).
  const offset = { [`plan-${PREV}`]: -1, [`plan-${WEEK}`]: 0, [`plan-${NEXT}`]: 1 }
  const meals = [
    ...prev.map((e) => ({ ...e, meal_plan_id: `plan-${PREV}` })),
    ...current.map((e) => ({ ...e, meal_plan_id: `plan-${WEEK}` })),
    ...next.map((e) => ({ ...e, meal_plan_id: `plan-${NEXT}` })),
    ...inserted,
  ].map((e) => ({ ...e, pos: offset[e.meal_plan_id] * 7 + DAYS.indexOf(e.day_of_week) }))
  return { result, inserted, meals }
}

// "Taco Taco* Taco* - …" for the planned week's dinners (* = leftover).
const lineOf = ({ meals }, recipes) => DAYS.map((d, i) => {
  const e = meals.find((m) => m.pos === i && /dinner/i.test(m.meal_type))
  return e ? `${short(recipes.find((r) => r.id === e.recipe_id))}${e.is_leftover ? '*' : ''}` : '-'
}).join(' ')

// The longest run of one recipe on consecutive dinners, and the smallest gap
// between a cook (with its leftovers) and another meal of the same recipe.
function weekRules({ meals, inserted }) {
  const byPos = new Map(meals.filter((m) => /dinner/i.test(m.meal_type)).map((m) => [m.pos, m.recipe_id]))
  let longest = 0
  let run = 0
  let prevId = null
  for (let p = -7; p <= 13; p++) {
    const id = byPos.get(p) ?? null
    run = id && id === prevId ? run + 1 : id ? 1 : 0
    longest = Math.max(longest, run)
    prevId = id
  }
  let minGap = Infinity
  for (const cook of inserted.filter((e) => !e.is_leftover)) {
    const block = meals.filter((m) => m.id === cook.id || m.original_entry_id === cook.id).map((m) => m.pos)
    const others = meals.filter((m) => m.recipe_id === cook.recipe_id && m.id !== cook.id && m.original_entry_id !== cook.id).map((m) => m.pos)
    minGap = Math.min(minGap, repeatGap(others, block))
  }
  return { longest, minGap }
}

async function scenario(label, opts, runs = 200) {
  const out = { longest: 0, minGap: Infinity, lines: new Set(), openDays: new Set(), repeats: new Set(), reasons: new Set(), unreported: 0 }
  for (let i = 0; i < runs; i++) {
    const r = await suggestOnce(opts)
    if (!r.result.ok) {
      out.reasons.add(r.result.reason)
      continue
    }
    const rules = weekRules(r)
    out.longest = Math.max(out.longest, rules.longest)
    out.minGap = Math.min(out.minGap, rules.minGap)
    out.lines.add(lineOf(r, opts.recipes))
    for (const o of r.result.openDays) out.openDays.add(o.dayOfWeek)
    for (const t of r.result.repeats) out.repeats.add(t)
    // Days planned with no dinner must be exactly the ones reported open.
    const planned = DAYS.slice(opts.fromIdx ?? 0)
    const empty = planned.filter((d, i) => !r.meals.some((m) => m.pos === DAYS.indexOf(d) && /dinner/i.test(m.meal_type)) && i >= 0)
    const reported = r.result.openDays.map((o) => o.dayOfWeek)
    if (JSON.stringify(empty) !== JSON.stringify(reported)) out.unreported++
  }
  return { label, ...out, lines: [...out.lines], openDays: [...out.openDays], repeats: [...out.repeats], reasons: [...out.reasons] }
}

{
  const a = await scenario('A', { recipes: [taco] })
  check('A. one recipe (Taco Mac): the same week every run', a.lines, ['Taco Taco* Taco* - Taco Taco* Taco*'])
  check('A. Wednesday is left open, Taco Mac repeats', [a.openDays, a.repeats], [['wednesday'], ['Taco Mac']])
  check('A. longest run 3, at least one free day between meals of a recipe, open days reported', [a.longest, a.minGap >= 2, a.unreported], [3, true, 0])

  for (const [label, recipes] of [['B. Taco Mac + Firecracker', [taco, firecracker]], ['C. Taco Mac + Hot Honey', [taco, hotHoney]], ['E. the 6 published, "Plan anyway"', library.recipes]]) {
    const s = await scenario(label, { recipes, bypass: true })
    check(`${label}: longest run ≤ 3, never right next to another meal of the recipe, open days reported`, [s.longest <= 3, s.minGap >= 2, s.unreported, s.reasons], [true, true, 0, []])
  }

  const entreeIds = entrees.map((r) => r.id)
  const d = await suggestOnce({ recipes: library.recipes, recent: entreeIds })
  check('D. the test account today (every entree recent): plans without asking (6c: no "Plan anyway")', [d.result.ok, d.inserted.filter((e) => !e.is_leftover).length > 0], [true, true])
  const d2 = await scenario('D2', { recipes: library.recipes, recent: entreeIds }, 50)
  check('D: dinners from the entrees only, never the muffins', d2.lines.every((l) => !l.includes('Sourdough')), true)

  const f = await scenario('F', {
    recipes: [taco, hotHoney],
    current: [{ id: 'kept-sat', recipe_id: taco.id, day_of_week: 'saturday', meal_type: 'Dinner', is_leftover: true, servings: 1 }],
  })
  check('F. a Taco Mac leftover kept on Saturday: Hot Honey isn\'t cooked again right after its own leftovers', f.lines, ['Hot Hot* Hot* - Hot Hot* Taco*'])
  check('F. Wednesday is left open', [f.openDays, f.minGap >= 2], [['wednesday'], true])

  const g = await scenario('G', { recipes: [taco, hotHoney, crispy], recent: [taco.id, hotHoney.id] })
  check('G. three recipes, two recent (recency on): Crispy Chili first, then the recent ones fill the gaps (6b2: no repeat, no open day)', [g.lines, g.openDays, g.repeats], [['Crispy Crispy* Crispy* Hot Hot* Hot* Taco'], [], []])

  // Neighbouring weeks count: last Saturday's Taco Mac, and next Monday's.
  const h = await scenario('H', { recipes: [taco, hotHoney], prev: [{ id: 'prev-sat', recipe_id: taco.id, day_of_week: 'saturday', meal_type: 'Dinner', is_leftover: false, servings: 1 }] })
  check('H. Taco Mac cooked last Saturday: Sunday is never Taco Mac', [h.lines.every((l) => l.startsWith('Hot')), h.minGap >= 2], [true, true])
  const i = await scenario('I', { recipes: [taco, hotHoney], next: [{ id: 'next-mon', recipe_id: taco.id, day_of_week: 'monday', meal_type: 'Dinner', is_leftover: false, servings: 1 }] })
  check('I. Taco Mac on next Monday: no Taco Mac meal ends this Sunday-to-Sunday week next to it', [i.minGap >= 2, i.longest <= 3], [true, true])

  // From Wednesday on, with Taco Mac's leftover on Tuesday and nothing else:
  // nothing can go Wednesday, but Thursday on can.
  const tue = await suggestOnce({
    recipes: [taco],
    fromIdx: 3,
    current: [{ id: 'kept-tue', recipe_id: taco.id, day_of_week: 'tuesday', meal_type: 'Dinner', is_leftover: true, servings: 1 }],
  })
  check('Only Taco Mac, its leftover on Tuesday, planning from Wednesday: Wednesday open, Thursday cooks', [lineOf(tue, [taco]), tue.result.openDays], ['- - Taco* - Taco Taco* Taco*', [{ dayOfWeek: 'wednesday', mealType: 'Dinner' }]])
  const onlyWed = await suggestOnce({
    recipes: [taco],
    fromIdx: 3,
    current: [
      { id: 'kept-tue', recipe_id: taco.id, day_of_week: 'tuesday', meal_type: 'Dinner', is_leftover: true, servings: 1 },
      ...['thursday', 'friday', 'saturday'].map((d) => ({ id: `kept-${d}`, recipe_id: hotHoney.id, day_of_week: d, meal_type: 'Dinner', is_leftover: true, servings: 1 })),
    ],
  })
  check('Every day it could fill would sit right after a meal of the recipe: nothing changes, and it says which days', [onlyWed.result.reason, onlyWed.result.openDays, globalThis.__supabaseWrites.filter((w) => w.op === 'delete').length], ['no-different-recipes', [{ dayOfWeek: 'wednesday', mealType: 'Dinner' }], 0])

  // Nothing tagged for a meal type at all: it still plans from every recipe.
  const bf = await suggestOnce({ recipes: entrees, mealTypes: ['Breakfast'], bypass: true })
  check('Breakfast with nothing tagged breakfast: planned from the other recipes, as before', [bf.result.ok, bf.inserted.filter((e) => !e.is_leftover).length > 0], [true, true])
}

// ── The Plan my week sheet's words

{
  const wed = { dayOfWeek: 'wednesday', mealType: 'Dinner' }
  check('done step: a day left open', planDoneText({ openDays: [wed], types: ['Dinner'] }), 'Your week is planned. Wednesday is left open: there weren’t enough different recipes.')
  check('done step: two days', planDoneText({ openDays: [wed, { dayOfWeek: 'friday', mealType: 'Dinner' }], types: ['Dinner'] }), 'Your week is planned. Wednesday and Friday are left open: there weren’t enough different recipes.')
  check('done step: repeats keep today\'s message', planDoneText({ repeats: ['Taco Mac'], types: ['Dinner'] }), 'Your week is planned, but there weren’t enough different recipes, so Taco Mac comes up more than once.')
  check('done step: both', planDoneText({ repeats: ['Taco Mac'], openDays: [wed], types: ['Dinner'] }), 'Your week is planned, but there weren’t enough different recipes, so Taco Mac comes up more than once and Wednesday is left open.')
  check('done step: more than one meal type names the meal', openDaysLabel([{ dayOfWeek: 'wednesday', mealType: 'Lunch' }], ['Dinner', 'Lunch']), 'Wednesday’s lunch')
}

// ── mealTypePool and the repeat rule's pieces

{
  check('pool: dinner takes the entrees that aren\'t recent', mealTypePool({ base: library.recipes, eligible: [muffins, taco], mealType: 'Dinner' }).recipes.map(short), ['Taco'])
  check('pool: every entree recent → needsBypass, no snacks for dinner', mealTypePool({ base: library.recipes, eligible: [muffins], mealType: 'Dinner' }), { recipes: [], needsBypass: true })
  check('pool: nothing tagged breakfast → every eligible recipe', mealTypePool({ base: library.recipes, eligible: [muffins, taco], mealType: 'Breakfast' }).recipes.map(short), ['Sourdough', 'Taco'])
  check('gap: overlap 0, the next day 1, one free day 2, none Infinity', [repeatGap([2], [1, 2, 3]), repeatGap([0], [1, 2]), repeatGap([4], [1, 2]), repeatGap([], [1])], [0, 1, 2, null])
  const days = recipeDays([{ weekOffset: -1, entries: [{ recipe_id: 'a', day_of_week: 'saturday' }] }, { weekOffset: 0, entries: [{ recipe_id: 'b', day_of_week: 'tuesday' }] }, { weekOffset: 1, entries: [{ recipe_id: 'a', day_of_week: 'monday' }] }])
  check('recipeDays: last week −1, next week 8', [days.get('a'), days.get('b')], [[-1, 8], [2]])
  const choices = slotChoices({
    candidates: [
      { recipe: { id: 'a', title: 'A' }, block: [0, 1] }, // next to last Saturday
      { recipe: { id: 'b', title: 'B' }, block: [4, 5] }, // two days after Tuesday
      { recipe: { id: 'c', title: 'C' }, block: [4] },
    ],
    days,
  })
  check('slotChoices: a meal next to last Saturday\'s doesn\'t qualify; a recipe on the week is a repeat', [choices.fresh.map((c) => c.recipe.id), choices.repeats.map((c) => [c.recipe.id, c.gap])], [['c'], [['b', 2]]])
  const tie = slotChoices({
    candidates: [{ recipe: { id: 'x', title: 'X' }, block: [5] }, { recipe: { id: 'y', title: 'Y' }, block: [5] }, { recipe: { id: 'z', title: 'Z' }, block: [5] }],
    days: new Map([['x', [2]], ['y', [1]], ['z', [1]]]),
    score: (r) => ({ x: 90, y: 80, z: 95 })[r.id],
  })
  check('slotChoices: repeats by biggest gap, then macro score', tie.repeats.map((c) => c.recipe.id), ['z', 'y', 'x'])
}

// ── Leftover moves: at most 4 days after the cook, today or later

{
  const week = getDaysOfWeek(PREV) // Sun 10-18 … Sat 10-24
  const names = (list) => list.map((d) => d.name.slice(0, 3))
  const dinner = (day, extra = {}) => ({ day_of_week: day, meal_type: 'Dinner', ...extra })
  check('the 7-day leftover: cooked Thu 10-15, on Mon 10-19, Sun–Wed taken: nothing to move to (Thu 10-22 is 7 days on)',
    names(leftoverMoveTargets({ days: week, dayName: 'monday', date: '2026-10-19', cookDate: '2026-10-15', mealType: 'Dinner', entries: [dinner('sunday'), dinner('monday'), dinner('tuesday'), dinner('wednesday')], today: '2026-10-19' })), [])
  check('cooked Sunday, leftover Monday: Tue to Thu (4 days at most), not Fri or Sat',
    names(leftoverMoveTargets({ days: week, dayName: 'monday', date: '2026-10-19', cookDate: '2026-10-18', mealType: 'Dinner', entries: [dinner('sunday'), dinner('monday')], today: '2026-10-18' })), ['tue', 'wed', 'thu'])
  check('the same on Wednesday: today or later only (Wed, Thu)',
    names(leftoverMoveTargets({ days: week, dayName: 'monday', date: '2026-10-19', cookDate: '2026-10-18', mealType: 'Dinner', entries: [dinner('sunday'), dinner('monday')], today: '2026-10-21' })), ['wed', 'thu'])
  check('a dinner on Wednesday blocks it; a lunch doesn\'t',
    names(leftoverMoveTargets({ days: week, dayName: 'monday', date: '2026-10-19', cookDate: '2026-10-18', mealType: 'Dinner', entries: [dinner('sunday'), dinner('monday'), dinner('wednesday'), { day_of_week: 'tuesday', meal_type: 'Lunch' }], today: '2026-10-18' })), ['tue', 'thu'])
  check('cooked last Friday (10-16), leftover Sunday: Mon and Tue (10-20 is 4 days on)',
    names(leftoverMoveTargets({ days: week, dayName: 'sunday', date: '2026-10-18', cookDate: '2026-10-16', mealType: 'Dinner', entries: [dinner('sunday')], today: '2026-10-18' })), ['mon', 'tue'])
}

// ── The ranking

{
  // After Hot Honey on Sunday (3 servings), what fits Wednesday?
  const plan = [{ recipe: hotHoney, servings: 3, date: '2026-10-18' }]
  const fourCandidates = [taco, crispy, firecracker, herby].map((r) => ({ recipe: r, servings: servingsFor(r) }))
  const ranked = slotRanking({ candidates: fourCandidates, date: '2026-10-21', plan, members })
  check('after Hot Honey on Sunday (by value): Firecracker rescues the most and leaves the least fresh waste',
    ranked.map((r) => [short(r.recipe), r.rescued, r.addedWaste, r.value]), [['Firecracker', 0.91, 3.12, -2.21], ['Taco', 0.42, 7.84, -7.42], ['Crispy', 0.43, 8.59, -8.16], ['Herby', 0.15, 10.42, -10.28]])
  check('… Taco Mac and Crispy Chili are within $2 of each other, so macro score orders them (96.5, 94.4)', ranked.slice(1, 3).map((r) => Math.round(r.macro * 10) / 10), [96.5, 94.4])
  check('… what Firecracker shares, most valuable first ($0.91: green beans and green onions; rice, soy sauce and honey count nothing)', ranked[0].sharedItems.map((i) => [i.name, i.value]), [['green beans', 0.72], ['scallions', 0.19]])
  check('… pantry sharing earns no words (Crispy Chili shares honey and soy sauce)', ranked.find((r) => short(r.recipe) === 'Crispy').reason, null)
  const byShare = slotRanking({ candidates: fourCandidates, date: '2026-10-21', plan, members, rankBy: 'share' })
  check('(old share scoring, for comparison) Firecracker first (5 of its 12 packages shared); Herby and Taco Mac tie, Herby leaves less fresh waste',
    byShare.map((r) => [short(r.recipe), Math.round(r.share * 1000) / 1000, r.wasteAvoided]), [['Firecracker', 0.417, 1.725], ['Crispy', 0.167, 0], ['Herby', 0.111, 1], ['Taco', 0.111, 0.99]])
  check('(old share scoring) Firecracker\'s reason names what it shares, finished first', byShare[0].reason, 'Shares the green beans and scallions with Sunday')
  void valueOf

  // A recipe outside the macro window ranks after every recipe in it, however much it shares.
  const heavy = { ...firecracker, id: 'heavy', title: 'Heavy Firecracker', calories: firecracker.calories * 2.5, protein_g: firecracker.protein_g * 0.5 }
  const best = Math.max(...[taco, crispy, herby].map((r) => scoreRecipeForHousehold(r, members)))
  const withHeavy = slotRanking({ candidates: [taco, crispy, herby, heavy].map((r) => ({ recipe: r, servings: servingsFor(r) })), date: '2026-10-21', plan, members })
  check(`outside the window (more than ${MACRO_WINDOW} points under the best): last, though it shares the most`,
    [scoreRecipeForHousehold(heavy, members) < best - MACRO_WINDOW, withHeavy.map((r) => short(r.recipe)).at(-1), withHeavy.at(-1).inWindow, withHeavy.at(-1).notBought], [true, 'Heavy', false, 5])
  const withHeavyShare = slotRanking({ candidates: [taco, crispy, herby, heavy].map((r) => ({ recipe: r, servings: servingsFor(r) })), date: '2026-10-21', plan, members, rankBy: 'share' })
  check('(old share scoring) the window holds there too', withHeavyShare.map((r) => short(r.recipe)).at(-1), 'Heavy')

  // Nothing on hand and nothing else planned: today's picker order.
  const picker = rankPickerRecipes({ recipes: library.recipes, slot: 'Dinner', activeMembers: members }).recipes
  const empty = slotRanking({ candidates: picker.map((r) => ({ recipe: r, servings: servingsFor(r) })), date: '2026-10-21', members })
  check('nothing on hand, nothing planned (by value): the least fresh waste first, in $2 steps (Hot Honey $5.10 and Firecracker $5.14, then Taco Mac and Crispy Chili ~$8.60, then Herby $11.20)',
    empty.map((r) => [short(r.recipe), -r.value]), [['Hot', 5.1], ['Firecracker', 5.14], ['Taco', 8.6], ['Crispy', 8.59], ['Herby', 11.2]])
  check('… and no reasons', empty.map((r) => r.reason), picker.map(() => null))
  const emptyShare = slotRanking({ candidates: picker.map((r) => ({ recipe: r, servings: servingsFor(r) })), date: '2026-10-21', members, rankBy: 'share' })
  const byMacro = [...picker].sort((x, y) => scoreRecipeForHousehold(y, members) - scoreRecipeForHousehold(x, members) || x.title.localeCompare(y.title) || x.id.localeCompare(y.id))
  check('(old share scoring) nothing on hand, nothing planned: macro score, title, id (the picker\'s order before 6c)', emptyShare.map((r) => r.recipe.id), byMacro.map((r) => r.id))
  const sameScore = [{ ...taco, id: 'b-2', title: 'Same' }, { ...taco, id: 'b-1', title: 'Same' }, { ...taco, id: 'a', title: 'Apple' }]
  check('… ties by title, then id', slotRanking({ candidates: sameScore, date: '2026-10-21', members }).map((r) => r.recipe.id), ['a', 'b-1', 'b-2'])
}

// What's on hand from last week: Firecracker on Thursday and Crispy Chili on
// Saturday, every line checked off when bought (as the e2e fixture does).
const W0 = '2026-10-11'
const W1 = '2026-10-18'
const lastWeek = [
  { id: 'lw-thu', day_of_week: 'thursday', meal_type: 'Dinner', is_leftover: false, servings: 2, recipe: firecracker, recipe_id: firecracker.id },
  { id: 'lw-sat', day_of_week: 'saturday', meal_type: 'Dinner', is_leftover: false, servings: 3, recipe: crispy, recipe_id: crispy.id },
]
const lastWeekList = generateShoppingItems(lastWeek).map((i) => (i.package && !i.have
  ? { ...i, checked: true, bought: { package: i.package, need: i.need, needUnit: i.needUnit, on: '2026-10-17' } }
  : i))
const rowsWith = (thisWeek = []) => ({
  lists: [{ weekStart: W0, created_at: '2026-10-17T12:00:00', items: lastWeekList }],
  plans: [{ weekStart: W0, entries: lastWeek }, { weekStart: W1, entries: thisWeek }],
  adjustments: [],
})

{
  const state = onHandBefore(rowsWith(), '2026-10-21')
  const allFive = entrees.map((r) => ({ recipe: r, servings: servingsFor(r) }))
  const ranked = slotRanking({ candidates: allFive, date: '2026-10-21', onHand: state, members })
  check('with last week\'s leftovers on Wednesday (by value): Firecracker first (rescues $1.19, adds $2.94 of waste); Crispy Chili rescues the most ($2.27) but its new beef and cabbage leave $7.90',
    ranked.map((r) => [short(r.recipe), r.rescued, r.addedWaste, r.value]), [['Firecracker', 1.19, 2.94, -1.75], ['Crispy', 2.27, 7.9, -5.63], ['Hot', 1.01, 6.11, -5.1], ['Taco', 0.06, 7.89, -7.83], ['Herby', 0.14, 11.19, -11.05]])
  check('… Crispy Chili and Hot Honey are within $2 of each other, so macro score orders them (94.4, 94.0)', ranked.slice(1, 3).map((r) => short(r.recipe)), ['Crispy', 'Hot'])
  check('… reasons name the most valuable first: green beans ($0.90) and sour cream ($0.15), not the scallions it finishes ($0.12)',
    [ranked[0].reason, ranked[0].onHandItems.map((i) => [i.name, i.value])], ['Uses the rest of the green beans and leftover sour cream', [['green beans', 0.9], ['sour cream', 0.15], ['scallions', 0.12]]])
  check('… Crispy Chili\'s too: baby broccoli ($1.40) and cabbage ($0.68) before the scallions', ranked[1].reason, 'Uses the rest of the baby broccoli and leftover shredded cabbage')
  const shareRanked = slotRanking({ candidates: allFive, date: '2026-10-21', onHand: state, members, rankBy: 'share' })
  check('(old share scoring) Firecracker first, 9 of its 12 packages from on hand; reason finished first', [short(shareRanked[0].recipe), shareRanked[0].fromOnHand, shareRanked[0].alone, shareRanked[0].reason, shareRanked[0].useBy], ['Firecracker', 9, 12, 'Uses the rest of the green beans and scallions', '2026-10-24'])

  const both = slotRanking({ candidates: [{ recipe: firecracker, servings: 2 }], date: '2026-10-21', onHand: state, plan: [{ recipe: hotHoney, servings: 3, date: '2026-10-18' }], members })[0]
  check('on-hand words win the line over sharing words (the most valuable first)', both.reason, 'Uses the rest of the green beans and leftover sour cream')

  // A meal being replaced doesn't use up what's on hand.
  const wed = { id: 'w-wed', day_of_week: 'wednesday', meal_type: 'Dinner', is_leftover: false, servings: 2, recipe: firecracker, recipe_id: firecracker.id }
  const beans = (s) => Math.round(s.lots.filter((l) => l.key === 'green-bean' && l.weekStart === W0).reduce((n, l) => n + l.amount, 0) * 100) / 100
  const withWed = onHandBefore(rowsWith([wed]), '2026-10-22')
  const replacingWed = onHandBefore(rowsWith([wed]), '2026-10-22', { without: ['w-wed'] })
  check('replaced meals don\'t consume on hand: Wednesday\'s Firecracker takes the green beans, replacing it leaves them', [beans(withWed) < beans(replacingWed), beans(replacingWed)], [true, beans(state)])
  const days = getDaysOfWeek(W1).slice(3) // Wed 10-21 on
  const planned = planWeek({ days, slots: ['Dinner'], pool: entrees, members, onHand: rowsWith([wed]), replacing: [wed] })
  check('planWeek replacing Wednesday: its picks use last week\'s leftovers', planned.meals.every((m) => /^Uses /.test(m.reason ?? '')), true)
}

// ── Sharing words

{
  check('words: one day, finishes it', sharingText([{ name: 'rice', finishes: true, days: ['2026-10-18'] }]), 'Uses the rest of Sunday’s rice')
  check('words: shares', sharingText([{ name: 'green onions', finishes: false, days: ['2026-10-18'] }]), 'Shares the green onions with Sunday')
  check('words: two days', sharingText([{ name: 'cilantro', finishes: false, days: ['2026-10-19', '2026-10-22'] }]), 'Shares the cilantro with Mon and Thu')
  check('words: finishes, two days', sharingText([{ name: 'rice', finishes: true, days: ['2026-10-19', '2026-10-22'] }]), 'Uses the rest of the rice from Mon and Thu')
  check('words: two items of the same kind and days', sharingText([{ name: 'cilantro', finishes: false, days: ['2026-10-18'] }, { name: 'green onions', finishes: false, days: ['2026-10-18'] }]), 'Shares the cilantro and green onions with Sunday')
  check('words: finished first; a different kind stays off the line', sharingText([{ name: 'cilantro', finishes: false, days: ['2026-10-18'] }, { name: 'rice', finishes: true, days: ['2026-10-20'] }]), 'Uses the rest of Tuesday’s rice')
  check('words: none', sharingText([]), null)
}

// ── planWeek

{
  const days = getDaysOfWeek(WEEK)
  const keyOf = (w) => w.meals.map((m) => `${m.dayOfWeek.slice(0, 3)} ${short(m.recipe)} ${m.servings}`).join(', ')
  const first = planWeek({ days, slots: ['Dinner'], pool: entrees, members })
  check('the 5 entrees, a whole week (by value): Firecracker, Taco Mac, Hot Honey (24 packages)', [keyOf(first), first.score.bought, first.weeks], ['sun Firecracker 2, tue Taco 3, fri Hot 3', 24, 5])
  check('… Hot Honey shares Sunday\'s green beans (Taco Mac\'s beef would be four days old: ground beef keeps 2)', first.meals[2].reason, 'Shares the green beans with Sunday')
  const firstShare = planWeek({ days, slots: ['Dinner'], pool: entrees, members, rankBy: 'share' })
  check('(old share scoring) Crispy Chili, Firecracker, Hot Honey (26 packages)', [keyOf(firstShare), firstShare.score.bought], ['sun Crispy 3, wed Firecracker 2, fri Hot 3', 26])
  check('same inputs, same plan', keyOf(planWeek({ days, slots: ['Dinner'], pool: entrees, members })), keyOf(first))
  const replacing = first.meals.map((m, i) => ({ id: `r${i}`, recipe_id: m.recipe.id, day_of_week: m.dayOfWeek, meal_type: m.mealType, is_leftover: false }))
  const again = planWeek({ days, slots: ['Dinner'], pool: entrees, members, replacing })
  check('planning the same days again changes a recipe (not just the days), as complete a week', [keyOf(again), again.openDays.length, again.repeats.length], ['sun Crispy 3, wed Hot 3, sat Firecracker 2', 0, 0])
  const only = planWeek({ days, slots: ['Dinner'], pool: [taco], members })
  const onlyAgain = planWeek({ days, slots: ['Dinner'], pool: [taco], members, replacing: only.meals.map((m, i) => ({ id: `t${i}`, recipe_id: m.recipe.id, day_of_week: m.dayOfWeek, meal_type: m.mealType })) })
  check('one possible week: planning again gives it again; the repeat rule leaves Wednesday open', [keyOf(onlyAgain), only.openDays, only.repeats], [keyOf(only), [{ dayOfWeek: 'wednesday', mealType: 'Dinner' }], [taco.id]])
  const kept = [{ id: 'k', recipe_id: taco.id, recipe: taco, day_of_week: 'saturday', meal_type: 'Dinner', is_leftover: true, servings: 1, weekOffset: 0 }]
  const withKept = planWeek({ days, slots: ['Dinner'], pool: [taco, hotHoney], members, kept })
  check('planWeek uses the same repeat rule (scenario F)', [keyOf(withKept), withKept.openDays.map((o) => o.dayOfWeek)], ['sun Hot 3, thu Hot 3', ['wednesday']])
}

// ── The ranking's package math is the shopping list's

{
  const listCounts = (entries) => Object.fromEntries(generateShoppingItems(entries).filter((i) => i.package && !i.have).map((i) => [i.key, i.package.count]).sort())
  const rankCounts = (meals) => Object.fromEntries([...weekPurchases(meals).values()].filter((p) => p.count > 0).map((p) => [p.key, p.count]).sort())
  const asEntries = (meals) => meals.map((m, i) => ({ id: `e${i}`, recipe: m.recipe, servings: m.servings, is_leftover: false }))
  const fixtures = [
    ['Hot Honey (3) + Firecracker (2)', [{ recipe: hotHoney, servings: 3 }, { recipe: firecracker, servings: 2 }]],
    ['last week\'s fixture: Firecracker (2) + Crispy Chili (3)', lastWeek],
    ['every entree, a week\'s servings', entrees.map((r) => ({ recipe: r, servings: servingsFor(r) }))],
    ['larger households: Taco Mac 10, Herby Chicken 8, Hot Honey 6', [{ recipe: taco, servings: 10 }, { recipe: herby, servings: 8 }, { recipe: hotHoney, servings: 6 }]],
    ['the muffins and Herby Chicken (eggs, loose items)', [{ recipe: muffins, servings: 12 }, { recipe: herby, servings: 4 }]],
  ]
  for (const [label, meals] of fixtures) {
    const list = listCounts(asEntries(meals))
    check(`packages match generateShoppingItems: ${label} (${Object.values(list).reduce((n, c) => n + c, 0)} packages)`, rankCounts(meals), list)
  }
  const week = planWeek({ days: getDaysOfWeek(WEEK), slots: ['Dinner'], pool: entrees, members })
  check('packages match generateShoppingItems: planWeek\'s week', rankCounts(week.meals), listCounts(asEntries(week.meals)))
}

// ── The needs cache (6b)

{
  const parity = (recipe, servings) => {
    const show = (r) => JSON.stringify({ needs: [...r.needs].map(([k, n]) => [k, n.amount, n.raw, n.name, n.entry.id]), lines: r.lines })
    return show(mealNeeds(recipe, servings)) === show(mealNeedsUncached(recipe, servings))
  }
  const cases = library.recipes.flatMap((r) => [undefined, 1, 2, 3, 5, 8, 12].map((sv) => [r, sv]))
  check(`needs cache: the same needs as matching every time (${cases.length} recipe × servings cases, twice)`, cases.every(([r, sv]) => parity(r, sv) && parity(r, sv)), true)
  const copy = JSON.parse(JSON.stringify(firecracker))
  check('needs cache: a refetched copy of an unchanged recipe gets the cached result', mealNeeds(copy, 2) === mealNeeds(firecracker, 2), true)
  const edited = { ...copy, ingredients: copy.ingredients.map((i, n) => (n === 0 ? { ...i, amount: Number(i.amount) * 3 } : i)) }
  check('needs cache: an edited recipe (same id) is matched again', [mealNeeds(edited, 2) === mealNeeds(firecracker, 2), parity(edited, 2)], [false, true])
}

// ── Plan my week with the ranking (6b): the hook with on-hand

const W2 = '2026-10-25' // next week, when this week is W1
const W3 = '2026-11-01' // the week after next
const planOf = (week, entries) => ({ id: `plan-${week}`, week_start_date: week, entries })
// The on-hand read for a week, in the shape useOnHand's query returns.
const onHandRead = ({ lists = [], plans = [] }) => ({ lists, plans, adjustments: [] })
const lastWeekRead = (thisWeekEntries = []) => onHandRead({
  lists: [{ id: 'list-w0', meal_plan_id: `plan-${W0}`, items: lastWeekList, created_at: '2026-10-17T12:00:00', meal_plan: { week_start_date: W0 } }],
  plans: [planOf(W0, lastWeek), planOf(W1, thisWeekEntries)],
})
const withRecipe = (rows, recipes) => rows.map((e) => ({ ...e, recipe: recipes.find((r) => r.id === e.recipe_id) }))

async function planWith({ week, thisWeek = W1, recipes = entrees, current = [], next = [], prev = [], fromIdx = 0, onHandData = {}, bypass = true, recentMeals = [], historyMeals = null }) {
  globalThis.__supabaseWrites.length = 0
  globalThis.__queryReads.length = 0
  globalThis.__posthogEvents.length = 0
  globalThis.__onHandData = onHandData
  const days = getDaysOfWeek(week).slice(fromIdx)
  const planned = new Set(days.map((d) => d.name))
  // As the Week page keeps them: leftovers of cooks not being replaced.
  const all = [...prev, ...current, ...next]
  const keepEntryIds = current.filter((e) => {
    if (!e.is_leftover) return false
    const cook = all.find((c) => c.id === e.original_entry_id)
    return !!cook && !(current.includes(cook) && planned.has(cook.day_of_week))
  }).map((e) => e.id)
  const { suggest } = useMealPlanSuggest({
    weekStartDate: week,
    nextWeekStartDate: addDays(week, 7),
    thisWeekStartDate: thisWeek,
    recipes,
    recentMeals,
    historyMeals,
    activeMembers: members,
    currentMealPlan: planOf(week, current),
    nextWeekMealPlan: planOf(addDays(week, 7), next),
    previousWeekMealPlan: planOf(addDays(week, -7), prev),
    days,
    keepEntryIds,
  })
  const result = await suggest({ mealTypes: ['Dinner'], bypassRecencyFilter: bypass })
  const writes = [...globalThis.__supabaseWrites]
  const inserted = writes.filter((w) => w.op === 'insert' && w.table === 'meal_plan_entries').flatMap((w) => w.rows)
  const cooks = inserted.filter((e) => !e.is_leftover)
  return {
    result,
    writes,
    inserted,
    cooks,
    picks: cooks.map((e) => `${e.day_of_week.slice(0, 3)} ${short(recipes.find((r) => r.id === e.recipe_id))}`),
    reads: globalThis.__queryReads.map((k) => k[2]),
    events: [...globalThis.__posthogEvents],
  }
}

{
  // This week from Wednesday, with last week's leftovers (every line checked).
  const withLeftovers = await planWith({ week: W1, fromIdx: 3, onHandData: { [W1]: lastWeekRead() } })
  const without = await planWith({ week: W1, thisWeek: '2026-01-04', fromIdx: 3 })
  check('this week: on-hand is read for the week being planned', withLeftovers.reads, [W1])
  check('with last week\'s leftovers: Crispy Chili Wednesday (its baby broccoli and cabbage), Firecracker Saturday', withLeftovers.picks, ['wed Crispy', 'sat Firecracker'])
  check('… without them (a week with no on-hand): sharing only, another week', [without.picks, without.reads], [['wed Firecracker', 'fri Taco'], []])
  const rows = prepareOnHand(lastWeekRead(), [], { weekStart: W1 })
  const first = withLeftovers.cooks[0]
  const firstUses = mealUses(entrees.find((r) => r.id === first.recipe_id), first.servings, onHandBefore(rows, '2026-10-21'), '2026-10-21')
  check('… the first meal uses last week\'s leftovers (its card names the most valuable first, as the ranking does)', firstUses.reason, 'Uses the rest of the baby broccoli and leftover shredded cabbage')
  const sent = withLeftovers.events.find((e) => e.event === 'meal_slot_filled')?.properties
  check('analytics: meal_slot_filled (suggest) adds counts only', sent && Object.keys(sent).sort(), ['count', 'on_hand_packages', 'open_days', 'recent_used', 'replan', 'shared_packages', 'source'])
  check('… packages from on hand, shared, open days, not a re-plan', sent && [sent.on_hand_packages > 0, Number.isInteger(sent.shared_packages), sent.open_days, sent.replan], [true, true, 0, false])

  // A Firecracker dinner on Wednesday being replaced doesn't use up the green beans.
  const wedCook = { id: 'w1-wed', meal_plan_id: `plan-${W1}`, recipe_id: firecracker.id, day_of_week: 'wednesday', meal_type: 'Dinner', is_leftover: false, original_entry_id: null, servings: 2, recipe: firecracker }
  const wedLeftover = { id: 'w1-thu', meal_plan_id: `plan-${W1}`, recipe_id: firecracker.id, day_of_week: 'thursday', meal_type: 'Dinner', is_leftover: true, original_entry_id: 'w1-wed', servings: 2, recipe: firecracker }
  const replacing = await planWith({ week: W1, fromIdx: 3, current: [wedCook, wedLeftover], onHandData: { [W1]: lastWeekRead([wedCook, wedLeftover]) } })
  check('replaced meals don\'t consume on hand: replacing Wednesday\'s Firecracker plans the same week as with nothing there', replacing.picks, withLeftovers.picks)
  check('… a re-plan (it replaced a meal)', replacing.events.find((e) => e.event === 'meal_slot_filled')?.properties.replan, true)

  // Next week: what this week's list leaves after this week's meals (only inferred: nothing checked).
  const monCook = { id: 'w1-mon', meal_plan_id: `plan-${W1}`, recipe_id: hotHoney.id, day_of_week: 'monday', meal_type: 'Dinner', is_leftover: false, original_entry_id: null, servings: 3, recipe: hotHoney }
  const thisList = generateShoppingItems([monCook])
  const nextRead = onHandRead({
    lists: [{ id: 'list-w1', meal_plan_id: `plan-${W1}`, items: thisList, created_at: '2026-10-18T09:00:00', meal_plan: { week_start_date: W1 } }],
    plans: [planOf(W1, [monCook]), planOf(W2, [])],
  })
  const nextWeek = await planWith({ week: W2, prev: [monCook], onHandData: { [W2]: nextRead } })
  const nextWithout = await planWith({ week: W2, thisWeek: '2026-01-04', prev: [monCook] })
  const nextRows = prepareOnHand(nextRead, [], { weekStart: W2 })
  const sunday = nextWeek.cooks[0]
  const sundayUses = mealUses(entrees.find((r) => r.id === sunday.recipe_id), sunday.servings, onHandBefore(nextRows, W2), W2)
  const fromOnHand = (r) => r.events.find((e) => e.event === 'meal_slot_filled')?.properties.on_hand_packages
  check('next week: this week\'s projected leftovers (after Monday\'s meal) are read and used', [nextWeek.reads, nextWeek.picks, sundayUses.reason, fromOnHand(nextWeek)], [[W2], ['sun Firecracker', 'tue Taco', 'fri Hot'], 'Uses the rest of the green beans and leftover green onions', 9])
  check('… without them, the same week here, with nothing from on hand', [nextWithout.picks, fromOnHand(nextWithout)], [['sun Firecracker', 'tue Taco', 'fri Hot'], 0])

  // The week after next: no on-hand read; sharing and waste only (planWeek without on-hand).
  const later = await planWith({ week: W3 })
  const direct = planWeek({ days: getDaysOfWeek(W3), slots: ['Dinner'], pool: entrees, kept: [], onHand: null, members })
  check('the week after next: no on-hand read, the same week as planWeek on sharing alone', [later.reads, later.picks], [[], direct.meals.map((m) => `${m.dayOfWeek.slice(0, 3)} ${short(m.recipe)}`)])

  // Same inputs, same week; planning again changes a recipe when the pool has another.
  const once = await planWith({ week: W3 })
  check('same inputs, same week (nothing random)', once.inserted.map(({ id, original_entry_id, ...e }) => e), later.inserted.map(({ id, original_entry_id, ...e }) => e))
  const again = await planWith({ week: W3, current: withRecipe(once.inserted.filter((e) => e.meal_plan_id === `plan-${W3}`), entrees), next: withRecipe(once.inserted.filter((e) => e.meal_plan_id !== `plan-${W3}`), entrees) })
  const setOf = (r) => [...new Set(r.cooks.map((e) => e.recipe_id))].sort()
  check('planning again changes at least one recipe', [JSON.stringify(setOf(again)) !== JSON.stringify(setOf(once)), again.events.find((e) => e.event === 'meal_slot_filled')?.properties.replan], [true, true])
  const onlyTaco = await planWith({ week: W3, recipes: [taco] })
  const tacoAgain = await planWith({ week: W3, recipes: [taco], current: withRecipe(onlyTaco.inserted.filter((e) => e.meal_plan_id === `plan-${W3}`), [taco]), next: withRecipe(onlyTaco.inserted.filter((e) => e.meal_plan_id !== `plan-${W3}`), [taco]) })
  check('… and gives the same week when only one exists', tacoAgain.picks, onlyTaco.picks)
}

// ── A failed save puts the old meals back (6b)

{
  const satCook = { id: 'old-sat', meal_plan_id: `plan-${W3}`, recipe_id: taco.id, day_of_week: 'saturday', meal_type: 'Dinner', is_leftover: false, original_entry_id: null, servings: 3, notes: null, recipe: taco }
  const sunLeft = { id: 'old-sun', meal_plan_id: `plan-${addDays(W3, 7)}`, recipe_id: taco.id, day_of_week: 'sunday', meal_type: 'Dinner', is_leftover: true, original_entry_id: 'old-sat', servings: 3, notes: null, recipe: taco }
  const wedCook = { id: 'old-wed', meal_plan_id: `plan-${W3}`, recipe_id: herby.id, day_of_week: 'wednesday', meal_type: 'Dinner', is_leftover: false, original_entry_id: null, servings: 2, notes: null, recipe: herby }
  const thuLeft = { id: 'old-thu', meal_plan_id: `plan-${W3}`, recipe_id: herby.id, day_of_week: 'thursday', meal_type: 'Dinner', is_leftover: true, original_entry_id: 'old-wed', servings: 2, notes: null, recipe: herby }
  const rowOf = ({ recipe, ...row }) => row
  // The new meals' insert fails (rows without ids); putting the old ones back works.
  const logError = console.error
  console.error = () => {} // the hook logs each failure; expected here
  globalThis.__supabaseFail = ({ table, op, rows }) => (table === 'meal_plan_entries' && op === 'insert' && rows.some((r) => !r.id) ? { message: 'insert failed' } : null)
  const failed = await planWith({ week: W3, current: [wedCook, thuLeft, satCook], next: [sunLeft] })
  const deleted = failed.writes.find((w) => w.op === 'delete')?.filters.id
  check('a failed save: the sheet hears the old meals are back', failed.result, { ok: false, reason: 'save-failed', restored: true })
  check('… the replaced meals were deleted first', [...(deleted ?? [])].sort(), ['old-sat', 'old-thu', 'old-wed'])
  check('… then the same rows went back, cooks before their leftovers (next week\'s leftover too)', failed.writes.filter((w) => w.op === 'insert').map((w) => w.rows), [[rowOf(wedCook), rowOf(satCook)], [rowOf(thuLeft), rowOf(sunLeft)]])
  check('… no analytics for a failed save', failed.events.length, 0)
  globalThis.__supabaseFail = ({ table, op }) => (table === 'meal_plan_entries' && op === 'insert' ? { message: 'insert failed' } : null)
  const lost = await planWith({ week: W3, current: [wedCook, thuLeft, satCook], next: [sunLeft] })
  check('… and if they can\'t be put back either, it says so', lost.result, { ok: false, reason: 'save-failed', restored: false })
  globalThis.__supabaseFail = null
  console.error = logError
}

// ── 6b2: re-planning with recency, recency as a preference, what's at stake

const inWeek = (rows, week) => rows.filter((e) => e.meal_plan_id === `plan-${week}`)
const otherWeeks = (rows, week) => rows.filter((e) => e.meal_plan_id !== `plan-${week}`)
// Meals as useRecentMealHistory returns them.
const historyOf = (rows) => rows.map((e) => {
  const week = e.meal_plan_id.replace('plan-', '')
  return { recipe_id: e.recipe_id, entry_id: e.id, original_entry_id: e.original_entry_id ?? null, week_start: week, date: addDays(week, DAYS.indexOf(e.day_of_week)) }
})

{
  // The Taco Mac week: next week planned once, then again, with recency that
  // includes next week's own meals (useRecentMealHistory reads every plan
  // from N weeks back on, the week being planned too). Last week: Herby.
  const lastHerby = [{ recipe_id: herby.id, entry_id: 'w1-herby', original_entry_id: null, week_start: W1, date: '2026-10-21' }]
  const first = await planWith({ week: W2, recentMeals: lastHerby, bypass: false })
  const recentAfter = [...lastHerby, ...historyOf(first.inserted)]
  const outside = entrees.filter((r) => !recentAfter.some((m) => m.recipe_id === r.id))
  check('the Taco Mac week, its cause: with the week\'s own meals counted as recent, one recipe is left outside the Recipe Variety Filter',
    [first.picks.length, outside.length], [3, 1])
  const again = await planWith({ week: W2, current: withRecipe(inWeek(first.inserted, W2), entrees), next: withRecipe(otherWeeks(first.inserted, W2), entrees), recentMeals: recentAfter, bypass: false })
  const setOf = (r) => [...new Set(r.cooks.map((e) => e.recipe_id))].sort().join(',')
  check('… fixed: the replaced meals don\'t count as recent, so the re-plan keeps a full week (no open day, no repeat) and changes a recipe',
    [again.result.ok, again.result.openDays, again.result.repeats, again.picks.length, setOf(again) !== setOf(first)], [true, [], [], 3, true])
  check('… Herby (last week, still recent) only fills a gap if nothing else can: here it isn\'t needed', [again.cooks.some((e) => e.recipe_id === herby.id), again.events[0]?.properties.recent_used], [false, 0])

  // Recent recipes fill the gaps, cooked longest ago first, before a repeat or an open day.
  const dated = [
    { recipe_id: taco.id, entry_id: 'x1', week_start: W1, date: '2026-10-22' },
    { recipe_id: hotHoney.id, entry_id: 'x2', week_start: W1, date: '2026-10-19' },
  ]
  const fill = await planWith({ week: W3, recipes: [crispy, taco, hotHoney], recentMeals: dated, bypass: false })
  check('recent recipes fill the gaps after the not-recent one, cooked longest ago first (Hot Honey 10-19 before Taco Mac 10-22), no repeat or open day',
    [fill.picks, fill.result.openDays, fill.result.repeats], [['sun Crispy', 'wed Hot', 'sat Taco'], [], []])
  check('… meal_slot_filled says 2 recent recipes filled gaps', fill.events.find((e) => e.event === 'meal_slot_filled')?.properties.recent_used, 2)
  const allRecent = await planWith({ week: W3, recipes: [crispy, taco, hotHoney], recentMeals: [...dated, { recipe_id: crispy.id, entry_id: 'x3', week_start: W1, date: '2026-10-20' }], bypass: false })
  check('every recipe tagged for the meal recent: Plan my week plans without asking (6c), recent ones by cooked longest ago (Hot Honey 10-19, Crispy Chili 10-20, Taco Mac 10-22)',
    [allRecent.result.ok, allRecent.picks, allRecent.events.find((e) => e.event === 'meal_slot_filled')?.properties.recent_used], [true, ['sun Hot', 'wed Crispy', 'sat Taco'], 3])
}

{
  // A re-plan only takes weeks as complete as the best. Taco Mac is already
  // on Wednesday (a meal that stays), so it could only come back as a repeat.
  const tacoWed = { id: 'k-wed', recipe_id: taco.id, recipe: taco, day_of_week: 'wednesday', meal_type: 'Dinner', is_leftover: false, servings: 3, weekOffset: 0 }
  const days = getDaysOfWeek(W3)
  const ids = (w) => w.meals.map((m) => m.recipe.id)
  const replacingOf = (w) => w.meals.map((m, i) => ({ id: `c${i}`, recipe_id: m.recipe.id, day_of_week: m.dayOfWeek, meal_type: m.mealType, is_leftover: false }))
  const pool5 = [hotHoney, crispy, firecracker, taco, herby]
  const firstWeek = planWeek({ days, slots: ['Dinner'], pool: pool5, kept: [tacoWed], members })
  const againWeek = planWeek({ days, slots: ['Dinner'], pool: pool5, kept: [tacoWed], members, replacing: replacingOf(firstWeek) })
  check('a re-plan stays as complete as the best (Taco Mac, already on Wednesday, would be a repeat, so it stays out) and brings in the recipe the first week didn\'t use (Herby)',
    [firstWeek.meals.map((m) => short(m.recipe)), againWeek.meals.map((m) => short(m.recipe)), againWeek.openDays.length, againWeek.repeats.length], [['Hot', 'Firecracker', 'Crispy'], ['Herby', 'Crispy'], 0, 0])
  // No other recipe fits without a repeat: the re-plan doesn't take Taco Mac
  // as a repeat to "change" the week, and fewer of the same recipes isn't a change either.
  const pool4 = [hotHoney, crispy, firecracker, taco]
  const first4 = planWeek({ days, slots: ['Dinner'], pool: pool4, kept: [tacoWed], members })
  const moved = planWeek({ days, slots: ['Dinner'], pool: pool4, kept: [tacoWed], members, replacing: replacingOf(first4) })
  check('… with no other recipe: no Taco Mac repeat, no open day, only the first week\'s recipes, in a different week',
    [moved.repeats.length, moved.openDays.length, ids(moved).every((id) => ids(first4).includes(id)), ids(moved).join() !== ids(first4).join()], [0, 0, true, true])
}

// What's at stake: a pack of ground chicken left from last week beats a spoonful of green onions; pantry counts nothing.
{
  const lastMeal = { title: 'Last week', id: 'lw', servings: 1, recipe_type: 'standard', meal_tags: ['entree'], ingredients: [
    { name: 'ground chicken', amount: 4, unit: 'oz' }, { name: 'green onions', amount: 1, unit: 'tbsp' }, { name: 'soy sauce', amount: 1, unit: 'tbsp' },
  ], calories: taco.calories / taco.servings, protein_g: taco.protein_g / taco.servings, carbs_g: taco.carbs_g / taco.servings, fat_g: taco.fat_g / taco.servings }
  const list = generateShoppingItems([{ id: 'lw', recipe: lastMeal, servings: 1 }]).map((i) => (i.package && !i.have ? { ...i, checked: true, bought: { package: i.package, need: i.need, needUnit: i.needUnit, on: '2026-10-17' } } : i))
  const rows = { lists: [{ weekStart: W0, created_at: '2026-10-17T12:00:00', items: list }], plans: [{ weekStart: W0, entries: [{ id: 'lw-sat', day_of_week: 'saturday', meal_type: 'Lunch', is_leftover: false, servings: 1, recipe: lastMeal }] }], adjustments: [] }
  const like = (id, title, ingredients) => ({ ...lastMeal, id, title, ingredients })
  const chicken = like('chicken', 'Chicken bowl', [{ name: 'ground chicken', amount: 12, unit: 'oz' }])
  const onions = like('onions', 'Onion rice', [{ name: 'green onions', amount: 1, unit: 'tbsp' }])
  const soy = like('soy', 'Soy noodles', [{ name: 'soy sauce', amount: 2, unit: 'tbsp' }])
  const state = onHandBefore(rows, '2026-10-19')
  const ranked = slotRanking({ candidates: [onions, soy, chicken].map((r) => ({ recipe: r, servings: 1 })), date: '2026-10-19', onHand: state, members })
  check('chicken beats green onions: 12 oz of a leftover 1 lb pack ($5.49, keeps 2 days) is worth $4.12; a tbsp of green onions $0.05; leftover soy sauce $0 (pantry)',
    ranked.map((r) => [short(r.recipe), r.rescued]), [['Chicken', 4.12], ['Onion', 0.05], ['Soy', 0]])
  check('… and the words name it (it uses all 12 oz that are left)', ranked[0].reason, 'Uses the rest of the ground chicken')

  // Differences under $2 don't reorder recipes: then cooked longest ago (or never) first, then macro score.
  const twin = (id, title, macroBoost) => ({ ...firecracker, id, title, protein_g: firecracker.protein_g * macroBoost })
  const a = twin('t-a', 'A twin', 1.0)
  const b = twin('t-b', 'B twin', 0.9)
  const c = twin('t-c', 'C twin', 0.8)
  const lastCooked = new Map([['t-a', '2026-10-15'], ['t-b', '2026-09-20']])
  const order = slotRanking({ candidates: [a, b, c].map((r) => ({ recipe: r, servings: 2 })), date: '2026-10-21', members, lastCooked })
  check(`within $${VALUE_STEP} of each other: never cooked first, then cooked longest ago (macro score only after that)`, order.map((r) => r.recipe.id), ['t-c', 't-b', 't-a'])
  const withChicken = slotRanking({ candidates: [a, b, c, chicken].map((r) => ({ recipe: r, servings: r === chicken ? 1 : 2 })), date: '2026-10-19', onHand: state, members, lastCooked })
  check('… a recipe worth $2 or more above them comes first whenever it was cooked', withChicken[0].recipe.id, 'chicken')
}

{
  check('shelf-life factors: keeps ≤5 days 1, 6–14 0.6, 15–30 0.25, 31–60 0.1, longer 0', STAKE_FACTORS.map((t) => [t.upTo, t.factor]), [[5, 1], [14, 0.6], [30, 0.25], [60, 0.1]])
  check('… ground beef 1, broccolini 1, green beans 0.6, eggs 0.25, mayonnaise 0.1, rice 0, olive oil (a staple) 0',
    ['ground-beef', 'broccolini', 'green-bean', 'egg', 'mayonnaise', 'rice', 'olive-oil'].map((k) => stakeFactor(entryById(k))), [1, 1, 0.6, 0.25, 0.1, 0, 0])
}

{
  // The 6b speed holds: a whole week from 100 recipes with on-hand, warm.
  const lines = entrees.flatMap((r) => r.ingredients)
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const synth = Array.from({ length: 100 }, (_, i) => ({ id: `syn-${i}`, title: `S${i}`, servings: 2 + Math.floor(rnd() * 5), ingredients: Array.from({ length: 8 + Math.floor(rnd() * 10) }, () => lines[Math.floor(rnd() * lines.length)]), meal_tags: ['entree'], recipe_type: 'standard', calories: 1800 + rnd() * 1500, protein_g: 80 + rnd() * 100, carbs_g: 150 + rnd() * 150, fat_g: 60 + rnd() * 60 }))
  const run = () => planWeek({ days: getDaysOfWeek(W1), slots: ['Dinner'], pool: synth, members, onHand: rowsWith() })
  run()
  const times = [0, 1, 2, 3, 4].map(() => { const t = performance.now(); run(); return performance.now() - t }).sort((x, y) => x - y)
  check(`speed: a whole week from 100 recipes with on-hand, warm, under 50 ms (median ${Math.round(times[2])} ms)`, times[2] < 50, true)
}

// ── 6c: the meal picker ranks by what's at stake

{
  const W3day = (name) => ({ name, date: getDaysOfWeek(W3).find((d) => d.name === name).date })
  const base = { recipes: library.recipes, activeMembers: members, weekStart: W3, today: '2026-10-22', people: 1 }
  const names = (res) => res.recipes.map(short)
  const why = (res, r) => res.items.get(r.id)

  // Nothing on hand, an empty week: Plan my week's order (least fresh waste in
  // $2 steps, then cooked longest ago, macro score, title, id), every slot.
  const dinner = rankPickerRecipes({ ...base, slot: 'Dinner', day: W3day('wednesday') })
  check('picker, empty week, nothing on hand, Dinner: Hot Honey and Firecracker (least waste, macro 94.0 and 91.4), then Taco Mac and Crispy Chili, then Herby', [names(dinner), dinner.relaxed, dinner.untagged], [['Hot', 'Firecracker', 'Taco', 'Crispy', 'Herby'], false, false])
  check('… Plan my week\'s first-slot order is the same', slotRanking({ candidates: entrees.map((r) => ({ recipe: r, servings: servingsFor(r) })), date: W3day('wednesday').date, members }).map((r) => short(r.recipe)), names(dinner))
  check('… Lunch takes the entrees too, same order', names(rankPickerRecipes({ ...base, slot: 'Lunch', day: W3day('wednesday') })), names(dinner))
  check('… Snack: the muffins only', names(rankPickerRecipes({ ...base, slot: 'Snack', day: W3day('wednesday') })), ['Sourdough'])
  const breakfast = rankPickerRecipes({ ...base, slot: 'Breakfast', day: W3day('wednesday') })
  check('… Breakfast, nothing tagged: untagged (Something simple leads), every recipe ranked the same way', [breakfast.untagged, breakfast.relaxed, names(breakfast)], [true, true, ['Sourdough', 'Hot', 'Firecracker', 'Taco', 'Crispy', 'Herby']])
  check('… no reasons on an empty week', dinner.recipes.map((r) => why(dinner, r).reason), [null, null, null, null, null])

  // Recency is a preference: the recent ones come after, cooked longest ago first.
  const someRecent = rankPickerRecipes({ ...base, slot: 'Dinner', day: W3day('wednesday'), recent: new Map([[taco.id, '2026-10-20'], [hotHoney.id, '2026-10-12']]) })
  check('picker groups: not recent first, then recent, cooked longest ago first (Hot Honey 10-12, Taco Mac 10-20); no relaxed note', [names(someRecent), someRecent.relaxed, someRecent.recipes.map((r) => why(someRecent, r).recent)],
    [['Firecracker', 'Crispy', 'Herby', 'Hot', 'Taco'], false, [false, false, false, true, true]])
  const allRecent = rankPickerRecipes({ ...base, slot: 'Dinner', day: W3day('wednesday'), recent: new Map([[taco.id, '2026-10-20'], [hotHoney.id, '2026-10-12'], [crispy.id, '2026-10-15'], [firecracker.id, '2026-10-18'], [herby.id, '2026-10-10']]) })
  check('… every tagged recipe recent: the relaxed note, oldest first, then the other meal types (as swap always fell back to)', [names(allRecent), allRecent.relaxed, allRecent.untagged], [['Herby', 'Hot', 'Crispy', 'Firecracker', 'Taco', 'Sourdough'], true, false])

  // Servings follow placeMeal: Thursday with Friday, Saturday, next Sunday and Monday taken → no leftovers.
  const cookOn = (id, r, day, servings = 1, extra = {}) => ({ id, recipe_id: r.id, recipe: r, day_of_week: day, meal_type: 'Dinner', is_leftover: false, servings, ...extra })
  const taken = [cookOn('f', crispy, 'friday'), cookOn('sa', herby, 'saturday')]
  const nextTaken = [cookOn('n1', firecracker, 'sunday'), cookOn('n2', firecracker, 'monday')]
  const thursday = rankPickerRecipes({ ...base, slot: 'Dinner', day: W3day('thursday'), currentEntries: taken, nextEntries: nextTaken, excludeIds: [crispy.id, herby.id] })
  const placed = placeMeal({ recipe: taco, people: 1, dayOfWeek: 'thursday', mealType: 'Dinner', weekStart: W3, today: '2026-10-22', currentEntries: taken, nextEntries: nextTaken, currentPlanId: 'a', nextPlanId: 'b' })
  check('servings follow placeMeal (no free day for leftovers: Taco Mac cooks 1, not 3)', [why(thursday, taco).servings, placed.servings, why(dinner, taco).servings], [1, 1, 3])

  // Sharing words, from the week's other cooks.
  const sunHot = [cookOn('s', hotHoney, 'sunday', 3), { id: 's1', recipe_id: hotHoney.id, recipe: hotHoney, day_of_week: 'monday', meal_type: 'Dinner', is_leftover: true, original_entry_id: 's', servings: 3 }]
  const tue = rankPickerRecipes({ ...base, slot: 'Dinner', day: W3day('tuesday'), currentEntries: sunHot, excludeIds: [hotHoney.id] })
  check('sharing words, one day: "Shares the green beans and scallions with Sunday"', [why(tue, firecracker).reason, why(tue, firecracker).reasonKind], ['Shares the green beans and scallions with Sunday', 'shared'])
  const twoDays = rankPickerRecipes({ ...base, slot: 'Dinner', day: W3day('tuesday'), currentEntries: [cookOn('s', hotHoney, 'sunday'), cookOn('m', crispy, 'monday')], excludeIds: [hotHoney.id, crispy.id] })
  check('sharing words, two days: "Shares the green onions with Sun and Mon"', why(twoDays, herby).reason, 'Shares the green onions with Sun and Mon')
  const finished = rankPickerRecipes({ ...base, slot: 'Dinner', day: W3day('monday'), currentEntries: [cookOn('s', taco, 'sunday', 3)], excludeIds: [taco.id] })
  check('sharing words, a finished package: "Uses the rest of Sunday’s ground beef" (Taco Mac buys 2 lb for 1.2)', why(finished, firecracker).reason, 'Uses the rest of Sunday’s ground beef')

  // Swapping with last week's leftovers on hand: the replaced meal neither shares nor takes from on hand.
  const p1 = (e) => ({ ...e, meal_plan_id: `plan-${W1}` })
  const mon = p1(cookOn('w1-mon', taco, 'monday'))
  const wed = p1(cookOn('w1-wed', firecracker, 'wednesday', 2))
  const thu = p1({ id: 'w1-thu', recipe_id: firecracker.id, recipe: firecracker, day_of_week: 'thursday', meal_type: 'Dinner', is_leftover: true, original_entry_id: 'w1-wed', servings: 2 })
  const week1 = [mon, wed, thu]
  const swapCtx = (day, date, replaceEntryId, onHand = rowsWith(week1)) => ({ recipes: library.recipes, slot: 'Dinner', activeMembers: members, people: 1, weekStart: W1, today: '2026-10-19', day: { name: day, date }, currentEntries: week1, replaceEntryId, excludeIds: week1.map((e) => e.recipe_id), onHand })
  const swap = rankPickerRecipes(swapCtx('wednesday', '2026-10-21', 'w1-wed'))
  check('swapping Wednesday\'s Firecracker: it takes nothing from on hand, so last week\'s green beans go to Hot Honey; on-hand words win over its sharing with Monday',
    swap.recipes.map((r) => [short(r), why(swap, r).reasonKind, why(swap, r).reason]), [['Crispy', 'on_hand', 'Uses the rest of the baby broccoli and leftover shredded cabbage'], ['Hot', 'on_hand', 'Uses the rest of the green beans and scallions'], ['Herby', 'on_hand', 'Uses the rest of the scallions']])
  const stays = rankPickerRecipes(swapCtx('friday', '2026-10-23', null))
  check('… when it stays (adding Friday), it took the beans, and it shares: Herby "Shares the green onions with Wednesday"', [why(stays, hotHoney).reason, why(stays, herby).reason], ['Shares the red bell pepper with Monday', 'Shares the green onions with Wednesday'])
  const later = rankPickerRecipes(swapCtx('wednesday', '2026-10-21', 'w1-wed', null))
  check('weeks after next (and past days, sample data): no on-hand, sharing words only', later.recipes.map((r) => why(later, r).reasonKind), ['shared', 'shared', 'shared'])
  check('same inputs, same order and words', JSON.stringify([names(swap), [...swap.items]]), JSON.stringify([names(rankPickerRecipes(swapCtx('wednesday', '2026-10-21', 'w1-wed'))), [...rankPickerRecipes(swapCtx('wednesday', '2026-10-21', 'w1-wed')).items]]))
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
