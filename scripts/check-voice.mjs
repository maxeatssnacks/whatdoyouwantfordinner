// Assertions for voice changes (v2 build step 7a): the parse-changes prompt
// and schema (one source, the function file), the admin gate, the date
// rules, the context builder, the test set through the resolver (recorded
// model answers in scripts/fixtures/voice/), the checks, and on-hand
// corrections applied and undone as row operations.
// npm run check:voice
import fs from 'node:fs'
import { loadVoicePrompt } from './voice-prompt.mjs'
import { fixtureContext, RECIPES, SLOTS, summarize, USER } from './voice-fixture.mjs'
import { micSheetFor } from '../src/v2/lib/voice/gate.js'
import { calendar, saidDate, timeOfDay } from '../src/v2/lib/voice/dates.js'
import { nothingUnderstood, resolveChanges, resolvedCounts, typesLabel } from '../src/v2/lib/voice/resolve.js'
import { applyToTable, correctionRowFor, planCorrections, planUndo, rowFingerprint } from '../src/v2/lib/voice/corrections.js'
import { barText, onHandTitle, reviewTitle } from '../src/v2/lib/voice/words.js'

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

// ── The prompt, the schema and the request: one source (the function file)

{
  const p = loadVoicePrompt()
  const schema = p.SUBMIT_CHANGES.input_schema
  const change = schema.properties.changes.items
  // Not strict: the API couldn't compile this schema (400 "Schema is too
  // complex" after about 150 s, 2026-10-29); the resolver checks every field.
  check('the tool is named submit_changes and isn’t strict', [p.SUBMIT_CHANGES.name, 'strict' in p.SUBMIT_CHANGES], ['submit_changes', false])
  check('every change type is in the schema', change.properties.type.enum, ['on_hand', 'eating_out', 'skip', 'move', 'swap', 'add'])
  check('every field the resolver reads is in the schema',
    ['meal', 'date', 'slot', 'to_date', 'to_slot', 'item', 'key', 'answer', 'amount', 'unit', 'recipe', 'with', 'use_up', 'text', 'said'].filter((f) => !change.properties[f]), [])
  const objects = []
  const walk = (s) => {
    if (s?.type === 'object') objects.push(s)
    for (const v of Object.values(s?.properties ?? {})) walk(v)
    if (s?.items) walk(s.items)
  }
  walk(schema)
  check('every object closes additionalProperties', objects.every((o) => o.additionalProperties === false), true)
  const req = p.buildRequest('claude-haiku-5-5', '{"today":"2026-10-15"}', 'out of eggs')
  check('the request: forced tool call, thinking off, no sampling parameters, the prompt cached',
    [req.tool_choice, req.thinking, 'temperature' in req, 'top_p' in req, req.system[0].cache_control, req.messages.length, req.messages[0].role],
    [{ type: 'tool', name: 'submit_changes' }, { type: 'disabled' }, false, false, { type: 'ephemeral' }, 1, 'user'])
  check('the request carries the context and the words, labelled', req.messages[0].content, 'CONTEXT\n{"today":"2026-10-15"}\n\nSAID\nout of eggs')
  check('answers: refusal, cut off, no tool call, a tool call',
    [p.readAnswer({ stop_reason: 'refusal' }), p.readAnswer({ stop_reason: 'max_tokens' }), p.readAnswer({ content: [{ type: 'text', text: 'hi' }] }),
      p.readAnswer({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'submit_changes', input: { changes: [{ type: 'skip', said: 'x' }] } }] })],
    [{ error: 'refusal' }, { error: 'too_long' }, { error: 'model' }, { changes: [{ type: 'skip', said: 'x' }], not_understood: [] }])
  const fn = fs.readFileSync(new URL('../supabase/functions/parse-changes/index.ts', import.meta.url), 'utf8')
  check('the function: claude-haiku-5-5, 30 a day in voice_calls, auth.getUser, a model timeout',
    [/const MODEL = 'claude-haiku-5-5'/.test(fn), /DAILY_LIMIT = 30/.test(fn), /from\('voice_calls'\)/.test(fn), /auth\.getUser\(token\)/.test(fn), /MODEL_TIMEOUT_MS = 10_000/.test(fn)],
    [true, true, true, true, true])
  const hook = fs.readFileSync(new URL('../src/hooks/useVoiceChanges.js', import.meta.url), 'utf8')
  const ms = (src, name) => Number(src.match(new RegExp(`${name} = ([\\d_]+)`))?.[1].replace(/_/g, ''))
  check('the app waits 5 s longer than the function’s model timeout (its own work before the call)',
    ms(hook, 'PARSE_TIMEOUT_MS') - ms(fn, 'MODEL_TIMEOUT_MS'), 5000)
  const logged = fn.match(/type ModelCall = \{([^}]*)\}/)?.[1].match(/^\s*(\w+):/gm)?.map((k) => k.trim().replace(':', ''))
  check('one log line per model call: how long, how it ended and token counts, never the words',
    logged, ['model', 'ms', 'http_status', 'stop_reason', 'timed_out', 'result', 'error_type', 'input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'])
  check('every way a model call ends logs that line first',
    (fn.match(/logModelCall\(call\)\s*\n\s*(return|if)/g) ?? []).length, 3)
  check('the function never logs the text, the context or the answer',
    (fn.match(/console\.(log|error|warn)\([^)]*\)/g) ?? []).filter((l) => /text|context|answer\b|changes|call\.input/.test(l.replace(/\[parse-changes\]|answer\.error/g, ''))), [])
}

// ── The gate: admins only

check('the mic: voice for admins, coming soon for everyone else (and while the profile loads)',
  [micSheetFor({ is_admin: true }), micSheetFor({ is_admin: false }), micSheetFor({}), micSheetFor(null), micSheetFor(undefined)],
  ['voice', 'coming-soon', 'coming-soon', 'coming-soon', 'coming-soon'])

// ── Date rules

{
  const thu = '2026-10-15'
  check('tonight, today, tomorrow', [saidDate('eating out tonight', thu)?.date, saidDate('today', thu)?.date, saidDate('tomorrow night', thu)?.date], [thu, thu, '2026-10-16'])
  check('a weekday: its next date, today included', [saidDate('eating out Friday', thu)?.date, saidDate('on thursday', thu)?.date, saidDate('fri', thu)?.date], ['2026-10-16', thu, '2026-10-16'])
  check('a weekday that has passed this week means next week’s (Saturday 17 → Friday 23)', saidDate('eating out Friday', '2026-10-17')?.date, '2026-10-23')
  check('“tomorrow” late on Saturday is next week’s Sunday', saidDate('tomorrow', '2026-10-17')?.date, '2026-10-18')
  check('“next Friday”: the Friday of next week (from Thursday 15 and from Saturday 17)', [saidDate('next Friday', thu)?.date, saidDate('next friday', '2026-10-17')?.date], ['2026-10-23', '2026-10-23'])
  check('two different days, or none, name no date', [saidDate('swap Tuesday and Wednesday', thu), saidDate('a wedding', thu), saidDate('out of eggs', thu)], [null, null, null])
  check('the same day said twice is still that day', saidDate('tomorrow, Friday', thu)?.date, '2026-10-16')
  check('the calendar: 14 days from today', [calendar(thu).length, calendar(thu)[0].short, calendar(thu)[13].date], [14, 'Thu', '2026-10-28'])
  check('time of day', [8, 13, 19, 23, 2].map((h) => timeOfDay(new Date(2026, 9, 15, h))), ['morning', 'afternoon', 'evening', 'night', 'night'])
}

// ── The context: refs, no names, no ids

{
  const { context, refs } = fixtureContext()
  const text = JSON.stringify(context)
  check('meals from today on, in day and slot order, as m1…m8', context.meals.map((m) => `${m.ref} ${m.date.slice(8)} ${m.slot}${m.leftover_of ? ` <${m.leftover_of}` : ''}`),
    ['m1 15 Dinner', 'm2 16 Breakfast', 'm3 16 Dinner', 'm4 17 Lunch <m1', 'm5 17 Dinner', 'm6 18 Dinner <m5', 'm7 20 Dinner', 'm8 21 Dinner <m7'])
  check('refs map back to the entries on the device', Object.values(refs).map((r) => r.entryId), ['e-thu', 'e-fri-b', 'e-fri', 'e-sat-l', 'e-sat', 'e-sun', 'e-tue', 'e-wed'])
  check('no ids in the context (entries, plans, recipes, the person)', ['e-', 'plan-', 'r-', USER, 'u-'].filter((id) => text.includes(`"${id}`)), [])
  check('no past meals (Monday’s pork)', text.includes('Hot honey pork') && context.meals.some((m) => m.title === 'Hot honey pork stir fry'), false)
  check('quick meals: only the person’s own', context.quick_meals, ['Yogurt + Granola'])
  check('recipe titles, sorted, no quick meals', [context.recipes.length, context.recipes[0], context.recipes.includes('Yogurt + Granola')], [10, 'Black bean tacos', false])
  check('on hand: keys, names and words for what’s left', context.on_hand.map((i) => `${i.key}: ${i.left}`),
    ['dill: About a bunch', 'egg: 12 eggs', 'feta: About 8 oz', 'greek-yogurt: About 2 lb', 'green-onion: About a bunch', 'kale: About a bunch', 'lemon: 2 lemons'])
  check('dates, weeks, slots, time of day', [context.today, context.weekday, context.this_week, context.next_week, context.days.length, context.slots, context.time_of_day],
    ['2026-10-15', 'Thursday', '2026-10-11', '2026-10-18', 14, SLOTS, 'evening'])
  const sat = fixtureContext({ today: '2026-10-17', hour: 21 })
  check('a leftover of a meal before today is "earlier"', sat.context.meals[0], { ref: 'm1', date: '2026-10-17', slot: 'Lunch', title: 'Black bean tacos', leftover_of: 'earlier' })
  check('nothing personal: the keys sent are only these', Object.keys(context), ['today', 'weekday', 'time_of_day', 'this_week', 'next_week', 'days', 'slots', 'meals', 'on_hand', 'recipes', 'quick_meals'])
}

// ── The test set: 31 sentences and two other "today"s, through the resolver

const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/voice/cases.json', import.meta.url))).cases
const answers = JSON.parse(fs.readFileSync(new URL('./fixtures/voice/answers.json', import.meta.url)))
check('every case has a recorded answer', cases.filter((c) => !answers.answers[c.id]).map((c) => c.id), [])
for (const c of cases) {
  const ctx = fixtureContext({ today: c.today, hour: c.hour })
  const answer = answers.answers[c.id]
  if (!answer) continue
  const r = resolveChanges(answer, { today: c.today, refs: ctx.refs, items: ctx.items, recipes: RECIPES, slots: SLOTS })
  const got = nothingUnderstood(answer) ? 'nothing' : r.items.map(summarize)
  // `also`: other end results that tell the person the same thing.
  const accepted = [c.expect, ...(c.also ?? [])].find((e) => JSON.stringify(e) === JSON.stringify(got))
  check(`#${c.id} “${c.said}” (${answers.source})`, got, accepted ?? c.expect)
}

// ── The checks

{
  const today = '2026-10-15'
  const ctx = fixtureContext()
  const resolve = (changes, notUnderstood = [], extra = {}) => resolveChanges({ changes, not_understood: notUnderstood }, { today, refs: ctx.refs, items: ctx.items, recipes: RECIPES, slots: SLOTS, ...extra }).items.map(summarize)
  check('the words win over the model’s ref: “tomorrow night” with m1 (tonight) → Friday’s dinner, m3',
    resolve([{ type: 'eating_out', said: 'eating out tomorrow night', meal: 'm1' }]), ['[not_done] eating_out m3'])
  check('the words name a day with no such meal', resolve([{ type: 'skip', said: 'skip Monday', meal: 'm5' }]), ['[not_changed] No dinner planned on Monday'])
  check('an unknown ref', resolve([{ type: 'skip', said: 'skip it', meal: 'm42' }]), ['[not_changed] Couldn’t find that meal'])
  check('a date more than two weeks away, a past date, an unknown slot',
    resolve([
      { type: 'add', said: 'put taco mac on the 30th', date: '2026-10-30', slot: 'Dinner', recipe: 'Taco Mac' },
      { type: 'eating_out', said: 'eating out on the 14th', date: '2026-10-14', slot: 'Dinner' },
      { type: 'add', said: 'brunch Sunday is pancakes', date: '2026-10-18', slot: 'Brunch', text: 'pancakes' },
    ]),
    ['[not_changed] That’s more than two weeks away', '[not_changed] Wednesday has passed', '[not_changed] Didn’t catch which meal'])
  check('a staple isn’t tracked; an unknown food isn’t on hand',
    resolve([{ type: 'on_hand', said: 'out of salt', item: 'salt', answer: 'used_up' }, { type: 'on_hand', said: 'out of quinoa', item: 'quinoa', answer: 'used_up' }]),
    ['[not_changed] Salt is a pantry staple; it isn’t tracked', '[not_changed] Quinoa isn’t on hand from earlier weeks'])
  check('the model’s key isn’t needed: the words find the entry',
    resolve([{ type: 'on_hand', said: 'the scallions are gone', item: 'scallions', answer: 'used_up' }]), ['[apply] on_hand green-onion used_up'])
  check('the same food twice: the later one counts',
    resolve([{ type: 'on_hand', said: 'a little feta', item: 'feta', key: 'feta', answer: 'a_little' }, { type: 'on_hand', said: 'no, plenty of feta', item: 'feta', key: 'feta', answer: 'plenty' }]),
    ['[not_changed] Changed again later in what you said', '[apply] on_hand feta plenty'])
  check('amounts: plurals count; a unit that won’t convert falls back to the answer; none at all is not changed',
    resolve([
      { type: 'on_hand', said: '2 lemons', item: 'lemon', key: 'lemon', answer: 'plenty', amount: 2, unit: 'lemons' },
      { type: 'on_hand', said: 'a handful of feta', item: 'feta', key: 'feta', answer: 'a_little', amount: 1, unit: 'handful' },
      { type: 'on_hand', said: 'some dill', item: 'dill', key: 'dill' },
      { type: 'on_hand', said: '4 oz of yogurt', item: 'yogurt', key: 'greek-yogurt', answer: 'a_little', amount: 4, unit: 'oz' },
    ]),
    ['[apply] on_hand lemon amount 2', '[apply] on_hand feta a_little', '[not_changed] Didn’t catch how much dill is left', '[apply] on_hand greek-yogurt amount 4'])
  const answered = fixtureContext({ adjustments: [{ ingredient_key: 'feta', as_of: today, answer: 'about_half', amount: 4, unit: 'oz' }] })
  check('the answer already in effect today changes nothing',
    resolveChanges({ changes: [{ type: 'on_hand', said: 'half the feta', item: 'feta', key: 'feta', answer: 'about_half' }] }, { today, refs: answered.refs, items: answered.items, recipes: RECIPES, slots: SLOTS }).items.map(summarize),
    ['[not_changed] Feta is already set to that'])
  check('moves: onto its own leftover’s slot is fine; onto another meal isn’t; same slot is already there',
    resolve([
      { type: 'move', said: 'frittata to Sunday', meal: 'm5', to_date: '2026-10-18' },
      { type: 'move', said: 'orzo to Wednesday', meal: 'm7', to_date: '2026-10-21' },
      { type: 'move', said: 'move the salmon to Friday', meal: 'm3', to_date: '2026-10-16' },
    ]),
    ['[not_done] move m5 → 2026-10-18 Dinner', '[not_done] move m7 → 2026-10-21 Dinner', '[not_changed] Salmon rice bowls is already on Friday'])
  check('swaps: not a leftover; a named recipe must exist and differ',
    resolve([
      { type: 'swap', said: 'swap Sunday', meal: 'm6' },
      { type: 'swap', said: 'Tuesday make it lasagna', meal: 'm7', recipe: 'Lasagna' },
      { type: 'swap', said: 'Tuesday chicken orzo', meal: 'm7', recipe: 'chicken orzo' },
    ]),
    ['[not_changed] Sun dinner is leftovers; swap the meal they come from', '[not_changed] No recipe called “Lasagna”', '[not_changed] Tuesday is already Chicken orzo'])
  check('swaps by date and slot instead of a ref: the meal planned there; none there, or no meal or day, is not changed',
    resolve([
      { type: 'swap', said: 'use up the kale on Saturday', date: '2026-10-17', slot: 'Dinner', use_up: ['kale'] },
      { type: 'swap', said: 'something else for lunch Monday', date: '2026-10-19', slot: 'Lunch' },
      { type: 'swap', said: 'use up the kale', use_up: ['kale'] },
    ]),
    ['[not_done] swap m5 use_up:kale', '[not_changed] Nothing planned for Mon lunch', '[not_changed] Didn’t catch which meal'])
  check('a ref the context doesn’t have, next to a date, counts as none: the meal planned in that slot',
    resolve([
      { type: 'swap', said: 'Make Saturday the broccoli feta frittata', meal: '<UNKNOWN>', recipe: 'Broccoli & feta frittata', date: '2026-10-17', slot: 'Dinner' },
      { type: 'skip', said: 'skip it', meal: 'm99', date: '2026-10-16', slot: 'Dinner' },
      { type: 'skip', said: 'skip that one', meal: 'm99' },
    ]),
    ['[not_done] swap m5 Broccoli & feta frittata', '[not_done] skip m3', '[not_changed] Couldn’t find that meal'])
  check('skip on an empty slot: nothing to skip; eating out there: a new entry (7b)',
    resolve([{ type: 'skip', said: 'skip lunch Monday', date: '2026-10-19', slot: 'Lunch' }, { type: 'eating_out', said: 'eating out Monday', date: '2026-10-19', slot: 'Dinner' }]),
    ['[not_changed] Nothing planned for Mon lunch', '[not_done] eating_out 2026-10-19 Dinner'])
  check('an unknown change type', resolve([{ type: 'plan_week', said: 'plan next week' }]), ['[not_changed] Didn’t catch that'])
  check('not understood: the reason, or "Didn’t catch that" for not a change',
    resolve([], [{ said: 'and the thing on Sunday', why: 'no meal on Sunday' }, { said: 'banana', why: 'not a change' }]),
    ['[not_changed] No meal on Sunday', '[not_changed] Didn’t catch that'])
  check('nothing understood: no changes and nothing that sounded like one',
    [nothingUnderstood({ changes: [], not_understood: [{ said: 'banana', why: 'not a change' }] }), nothingUnderstood({ changes: [] }), nothingUnderstood({ changes: [], not_understood: [{ said: 'x', why: 'which meal?' }] }), nothingUnderstood({ changes: [{ type: 'skip' }] })],
    [true, true, false, false])
  const mixed = resolveChanges(answers.answers['2'], { today, refs: ctx.refs, items: ctx.items, recipes: RECIPES, slots: SLOTS })
  check('counts and types for analytics (labels and counts only)', [resolvedCounts(mixed.items), typesLabel(mixed.types)], [{ apply: 1, notChanged: 1, notDone: 1 }, 'on_hand:2,eating_out:1'])
}

// ── Corrections: apply and undo as row operations

{
  const today = '2026-10-15'
  const ctx = fixtureContext()
  const items = resolveChanges({
    changes: [
      { type: 'on_hand', said: 'about half the feta', item: 'feta', key: 'feta', answer: 'about_half' },
      { type: 'on_hand', said: 'out of eggs', item: 'egg', key: 'egg', answer: 'used_up' },
      { type: 'on_hand', said: 'half a dozen eggs', item: 'egg', key: 'egg', answer: 'about_half', amount: 6, unit: 'egg' },
      { type: 'eating_out', said: 'eating out friday', meal: 'm3' },
    ],
  }, { today, refs: ctx.refs, items: ctx.items, recipes: RECIPES, slots: SLOTS }).items
  // Today's table before: a "How much is left?" answer for feta from the
  // meal sheet, and yesterday's for kale (not touched).
  const sheetFeta = { ingredient_key: 'feta', as_of: today, answer: 'a_little', amount: 1.6, unit: 'oz', inferred_amount: 8, package_amount: 8, source: 'meal_sheet', created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z' }
  const kale = { ingredient_key: 'kale', as_of: '2026-10-14', answer: 'plenty', amount: 0.8, unit: 'bunch', inferred_amount: 1, package_amount: 1, source: 'meal_sheet' }
  const table = [sheetFeta, kale]
  const ops = planCorrections(items, table.filter((r) => r.as_of === today), today)
  check('one row per item to apply (the later egg change counts), with what was there before',
    ops.map((op) => [op.id, op.key, op.before?.answer ?? null, op.after.answer, op.after.amount, op.after.source]),
    [['c1', 'feta', 'a_little', 'about_half', 4, 'voice'], ['c3', 'egg', null, 'amount', 6, 'voice']])
  check('the row: today, the entry’s unit, what was inferred and bought',
    correctionRowFor(items[0], today), { ingredient_key: 'feta', as_of: today, answer: 'about_half', amount: 4, unit: 'oz', inferred_amount: 8, package_amount: 8, source: 'voice' })
  const after = applyToTable(table, ops.map((op) => ({ action: 'upsert', row: op.after })))
  check('applied: feta replaced, eggs added, kale untouched', after.map(rowFingerprint).sort(), [
    rowFingerprint(ops[1].after), rowFingerprint(ops[0].after), rowFingerprint(kale)].sort())
  const undo = planUndo(ops, after.filter((r) => r.as_of === today))
  check('undo: newest first; feta put back as it was, the egg row deleted', undo.map((w) => [w.id, w.action]), [['c3', 'delete'], ['c1', 'restore']])
  const back = applyToTable(after, undo)
  check('undone: the table is back exactly (fingerprints and timestamps)', JSON.stringify(back.sort((a, b) => a.ingredient_key.localeCompare(b.ingredient_key))), JSON.stringify([sheetFeta, kale].sort((a, b) => a.ingredient_key.localeCompare(b.ingredient_key))))
  // Changed since: feta answered again from the meal sheet after the voice change.
  const changed = applyToTable(after, [{ action: 'upsert', row: { ...ops[0].after, answer: 'plenty', amount: 6.4, source: 'meal_sheet' } }])
  const undo2 = planUndo(ops, changed.filter((r) => r.as_of === today))
  check('a row changed since is skipped; the other is still undone', undo2.map((w) => [w.id, w.action]), [['c3', 'delete'], ['c1', 'skip']])
  check('a row deleted since is skipped too', planUndo([ops[1]], []).map((w) => w.action), ['skip'])
  check('fingerprints ignore timestamps and number formats', rowFingerprint({ ...ops[0].after, amount: '4', created_at: 'x' }) === rowFingerprint(ops[0].after), true)
}

// ── Words: the bar and Review

{
  const item = (status, extra = {}) => ({ id: 'x', type: 'on_hand', status, key: 'feta', name: 'feta', answer: 'about_half', amount: 4, ...extra })
  check('bar: N changes made, then the first on-hand change in words', barText({ items: [item('applied'), item('applied', { key: 'egg', name: 'eggs', answer: 'used_up' })] }), { strong: '2 changes made.', rest: 'Feta set to about half.' })
  check('bar: used up, and one change', barText({ items: [item('applied', { answer: 'used_up', amount: 0 })] }), { strong: '1 change made.', rest: 'Feta marked used up.' })
  check('bar: what wasn’t changed or saved instead', barText({ items: [item('applied'), item('applied'), item('not_changed'), item('failed'), item('not_done', { type: 'skip' })] }),
    { strong: '2 changes made.', rest: '1 couldn’t be saved. 1 not changed. 1 not done yet.' })
  check('Review titles', [reviewTitle({ items: [item('applied'), item('applied'), item('applied')] }), reviewTitle({ items: [item('undone')] }), reviewTitle({ items: [item('not_changed')] })],
    ['3 changes to your week', '1 change to your week', 'Nothing changed'])
  check('on-hand titles', [onHandTitle(item('applied')), onHandTitle(item('applied', { answer: 'used_up' })), onHandTitle(item('applied', { key: 'egg', name: 'eggs', answer: 'amount', amount: 6 })), onHandTitle(item('applied', { answer: 'amount', amount: 0 }))],
    ['Feta set to about half', 'Feta used up', 'Eggs set to 6 eggs', 'Feta used up'])
}

console.log(`check:voice — ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
