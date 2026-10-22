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
  mealTypePool,
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

// The hook and the Week page helpers import React, the Supabase client and
// extensionless paths; the loader stands those in (scripts/stubs/).
register('./stubs/loader.mjs', import.meta.url)
const { useMealPlanSuggest } = await import('../src/hooks/useMealPlanSuggest.js')
const { leftoverMoveTargets } = await import('../src/v2/lib/slotFill.js')
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
  check('D. the test account today (every entree recent): "Plan anyway", not muffins for dinner', [d.result.reason, d.result.canBypassRecency, d.result.mealTypes, d.inserted.length], ['no-eligible-recipes', true, ['Dinner'], 0])
  const d2 = await scenario('D2', { recipes: library.recipes, recent: entreeIds, bypass: true }, 50)
  check('D, then "Plan anyway": dinners from the entrees only', d2.lines.every((l) => !l.includes('Sourdough')), true)

  const f = await scenario('F', {
    recipes: [taco, hotHoney],
    current: [{ id: 'kept-sat', recipe_id: taco.id, day_of_week: 'saturday', meal_type: 'Dinner', is_leftover: true, servings: 1 }],
  })
  check('F. a Taco Mac leftover kept on Saturday: Hot Honey isn\'t cooked again right after its own leftovers', f.lines, ['Hot Hot* Hot* - Hot Hot* Taco*'])
  check('F. Wednesday is left open', [f.openDays, f.minGap >= 2], [['wednesday'], true])

  const g = await scenario('G', { recipes: [taco, hotHoney, crispy], recent: [taco.id, hotHoney.id] })
  check('G. three recipes, two recent (recency on): Crispy Chili twice with a free day between', [g.lines, g.openDays], [['Crispy Crispy* Crispy* - Crispy Crispy* Crispy*'], ['wednesday']])

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
  const ranked = slotRanking({ candidates: [taco, crispy, firecracker, herby].map((r) => ({ recipe: r, servings: servingsFor(r) })), date: '2026-10-21', plan, members })
  check('after Hot Honey on Sunday: Firecracker first for Wednesday (5 of its 12 packages shared)', [short(ranked[0].recipe), ranked[0].notBought, ranked[0].alone], ['Firecracker', 5, 12])
  check('… then by share of its own packages: Crispy (2 of 12); Herby (2 of 18) and Taco Mac (1 of 9) tie, and Herby leaves less fresh waste',
    ranked.map((r) => [short(r.recipe), Math.round(r.share * 1000) / 1000, r.wasteAvoided]), [['Firecracker', 0.417, 1.725], ['Crispy', 0.167, 0], ['Herby', 0.111, 1], ['Taco', 0.111, 0.99]])
  check('… Firecracker\'s reason names fresh items it shares', ranked[0].reason, 'Shares the green beans and scallions with Sunday')
  check('… pantry sharing earns no words (Crispy Chili shares honey and soy sauce)', ranked[1].reason, null)

  // A recipe outside the macro window ranks after every recipe in it, however much it shares.
  const heavy = { ...firecracker, id: 'heavy', title: 'Heavy Firecracker', calories: firecracker.calories * 2.5, protein_g: firecracker.protein_g * 0.5 }
  const best = Math.max(...[taco, crispy, herby].map((r) => scoreRecipeForHousehold(r, members)))
  const withHeavy = slotRanking({ candidates: [taco, crispy, herby, heavy].map((r) => ({ recipe: r, servings: servingsFor(r) })), date: '2026-10-21', plan, members })
  check(`outside the window (more than ${MACRO_WINDOW} points under the best): last, though it shares the most`,
    [scoreRecipeForHousehold(heavy, members) < best - MACRO_WINDOW, withHeavy.map((r) => short(r.recipe)).at(-1), withHeavy.at(-1).inWindow, withHeavy.at(-1).notBought], [true, 'Heavy', false, 5])

  // Nothing on hand and nothing else planned: today's picker order.
  const picker = rankPickerRecipes({ recipes: library.recipes, slot: 'Dinner', activeMembers: members }).recipes
  const empty = slotRanking({ candidates: picker.map((r) => ({ recipe: r, servings: servingsFor(r) })), date: '2026-10-21', members })
  check('nothing on hand, nothing planned: the picker\'s order today (macro score, title, id)', empty.map((r) => r.recipe.id), picker.map((r) => r.id))
  check('… and no reasons', empty.map((r) => r.reason), picker.map(() => null))
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
  const ranked = slotRanking({ candidates: entrees.map((r) => ({ recipe: r, servings: servingsFor(r) })), date: '2026-10-21', onHand: state, members })
  check('with last week\'s leftovers on Wednesday: Firecracker first, "Uses the rest of the green beans and scallions"', [short(ranked[0].recipe), ranked[0].reason], ['Firecracker', 'Uses the rest of the green beans and scallions'])
  check('… 9 of its 12 packages from on hand; then Crispy Chili (7 of 12)', ranked.slice(0, 2).map((r) => [short(r.recipe), r.fromOnHand, r.alone]), [['Firecracker', 9, 12], ['Crispy', 7, 12]])
  check('… the soonest use-by of what it uses', ranked[0].useBy, '2026-10-24')

  const both = slotRanking({ candidates: [{ recipe: firecracker, servings: 2 }], date: '2026-10-21', onHand: state, plan: [{ recipe: hotHoney, servings: 3, date: '2026-10-18' }], members })[0]
  check('on-hand words win the line over sharing words', both.reason, 'Uses the rest of the green beans and scallions')

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
  check('the 5 entrees, a whole week: Crispy Chili, Firecracker, Hot Honey (26 packages)', [keyOf(first), first.score.bought, first.weeks], ['sun Crispy 3, wed Firecracker 2, fri Hot 3', 26, 5])
  check('… Firecracker uses the rest of Sunday\'s ground beef', first.meals[1].reason, 'Uses the rest of Sunday’s ground beef')
  check('same inputs, same plan', keyOf(planWeek({ days, slots: ['Dinner'], pool: entrees, members })), keyOf(first))
  const replacing = first.meals.map((m, i) => ({ id: `r${i}`, recipe_id: m.recipe.id, day_of_week: m.dayOfWeek, meal_type: m.mealType, is_leftover: false }))
  const again = planWeek({ days, slots: ['Dinner'], pool: entrees, members, replacing })
  check('planning the same days again: the next-best week', [keyOf(again) !== keyOf(first), again.score.bought], [true, 26])
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

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
