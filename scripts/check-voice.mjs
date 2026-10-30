// Assertions for voice changes (v2 build step 7a): the parse-changes prompt
// and schema (one source, the function file), who gets voice (everyone
// since 7c), the date rules, the context builder, the test set through the
// resolver (recorded model answers in scripts/fixtures/voice/), the checks,
// and on-hand corrections applied and undone as row operations. 7b: meal
// changes as row operations. 7c: live listening as a state machine (and the
// recognizer wrapper with a stand-in SpeechRecognition), the probe's iOS
// version, and one-off meals (their add and undo, and the real
// useMealChanges hook on in-memory tables with the stubs in scripts/stubs/).
// npm run check:voice
import fs from 'node:fs'
import { register } from 'node:module'
import { loadVoicePrompt } from './voice-prompt.mjs'
import { fixtureContext, PLANS, RECIPES, SLOTS, summarize, thisWeekList, USER } from './voice-fixture.mjs'
import { heardText, LISTEN, listenRun, liveWords, micMode, msToWords } from '../src/v2/lib/voice/listen.js'
import { speechApi, startListening, wentDeaf } from '../src/v2/lib/voice/recognition.js'
import { iosVersionOf } from '../src/v2/lib/voice/probe.js'
import { sameQuickMeal } from '../src/v2/lib/quickMeal.js'
import { calendar, saidDate, timeOfDay } from '../src/v2/lib/voice/dates.js'
import { nothingUnderstood, resolveChanges, resolvedCounts, typesLabel } from '../src/v2/lib/voice/resolve.js'
import { applyToTable, correctionRowFor, planCorrections, planUndo, rowFingerprint } from '../src/v2/lib/voice/corrections.js'
import { barText, canUndoAny, onHandTitle, reviewTitle, sameWords } from '../src/v2/lib/voice/words.js'
import { inferOnHand, prepareOnHand, withAdjustment } from '../src/v2/lib/onHand.js'
import { buildVoiceContext } from '../src/v2/lib/voice/context.js'
import { weekShortfall, withShortfallLines } from '../src/v2/lib/shortfall.js'

// The meal changes import the picker's ranking and placement, which import
// extensionless paths; the loader stands those in (scripts/stubs/).
register('./stubs/loader.mjs', import.meta.url)
const mc = await import('../src/v2/lib/mealChanges.js')
const { useMealChanges } = await import('../src/hooks/useMealChanges.js')

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

// ── Who gets voice: everyone since 7c; the "Speech test" link stays admin-only

{
  const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
  const provider = src('v2/components/voice/VoiceProvider.jsx')
  check('no admin gate: gate.js is gone, the mic opens voice for everyone, no coming-soon sheet in the shell',
    [fs.existsSync(new URL('../src/v2/lib/voice/gate.js', import.meta.url)), /micSheetFor|enabled/.test(provider), /VoiceComingSoonSheet/.test(src('v2/layout/AppShell.jsx'))], [false, false, false])
  check('… the "Speech test" link is for admins only (the probe’s route is admin-only too)',
    [/const canProbe = profile\?\.is_admin === true/.test(provider), /canProbe=\{canProbe\}/.test(provider), /<AdminRoute>\s*<VoiceProbe \/>/.test(src('App.jsx'))], [true, true, true])
  const week = src('v2/pages/Week.jsx')
  check('Empty-A’s “Tell us what’s in the fridge” and Empty-D’s “Say what’s there” open the voice sheet',
    [/onFridge=\{\(\) => voice\.open\('empty_week'\)\}/.test(week), /onSay=\{\(\) => voice\.open\('empty_on_hand'\)\}/.test(week)], [true, true])
}

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
  check('on hand: keys, short names (sorted by them) and words for what’s left', context.on_hand.map((i) => `${i.key} (${i.name}): ${i.left}`),
    ['dill (dill): About a bunch', 'egg (egg): 12 eggs', 'feta (feta): About 8 oz', 'green-onion (green onion): About a bunch', 'kale (kale): About a bunch', 'lemon (lemon): 2 lemons', 'greek-yogurt (yogurt): About 2 lb'])
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
    resolve([{ type: 'eating_out', said: 'eating out tomorrow night', meal: 'm1' }]), ['[apply] eating_out m3'])
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
    ['[not_changed] Salt is a pantry staple; it isn’t tracked', '[not_changed] Quinoa isn’t on hand'])
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
  const answered = fixtureContext({ adjustments: [{ ingredient_key: 'feta', as_of: today, answer: 'about_half', amount: 4, unit: 'oz', source: 'voice' }] })
  check('the answer already in effect today changes nothing',
    resolveChanges({ changes: [{ type: 'on_hand', said: 'half the feta', item: 'feta', key: 'feta', answer: 'about_half' }] }, { today, refs: answered.refs, items: answered.items, recipes: RECIPES, slots: SLOTS }).items.map(summarize),
    ['[not_changed] Feta is already set to that'])
  check('moves: onto its own leftover’s slot is fine; onto another meal isn’t; same slot is already there',
    resolve([
      { type: 'move', said: 'frittata to Sunday', meal: 'm5', to_date: '2026-10-18' },
      { type: 'move', said: 'orzo to Wednesday', meal: 'm7', to_date: '2026-10-21' },
      { type: 'move', said: 'move the salmon to Friday', meal: 'm3', to_date: '2026-10-16' },
    ]),
    ['[apply] move m5 → 2026-10-18 Dinner', '[apply] move m7 → 2026-10-21 Dinner', '[not_changed] Salmon rice bowls is already on Friday'])
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
    ['[apply] swap m5 use_up:kale', '[not_changed] Nothing planned for Mon lunch', '[not_changed] Didn’t catch which meal'])
  check('a ref the context doesn’t have, next to a date, counts as none: the meal planned in that slot',
    resolve([
      { type: 'swap', said: 'Make Saturday the broccoli feta frittata', meal: '<UNKNOWN>', recipe: 'Broccoli & feta frittata', date: '2026-10-17', slot: 'Dinner' },
      { type: 'skip', said: 'skip it', meal: 'm99', date: '2026-10-16', slot: 'Dinner' },
      { type: 'skip', said: 'skip that one', meal: 'm99' },
    ]),
    ['[apply] swap m5 Broccoli & feta frittata', '[apply] skip m3', '[not_changed] Couldn’t find that meal'])
  check('skip on an empty slot: nothing to skip; eating out there: a new entry (7b)',
    resolve([{ type: 'skip', said: 'skip lunch Monday', date: '2026-10-19', slot: 'Lunch' }, { type: 'eating_out', said: 'eating out Monday', date: '2026-10-19', slot: 'Dinner' }]),
    ['[not_changed] Nothing planned for Mon lunch', '[apply] eating_out 2026-10-19 Dinner'])
  check('an unknown change type', resolve([{ type: 'plan_week', said: 'plan next week' }]), ['[not_changed] Didn’t catch that'])
  check('not understood: the reason, or "Didn’t catch that" for not a change',
    resolve([], [{ said: 'and the thing on Sunday', why: 'no meal on Sunday' }, { said: 'banana', why: 'not a change' }]),
    ['[not_changed] No meal on Sunday', '[not_changed] Didn’t catch that'])
  check('nothing understood: no changes and nothing that sounded like one',
    [nothingUnderstood({ changes: [], not_understood: [{ said: 'banana', why: 'not a change' }] }), nothingUnderstood({ changes: [] }), nothingUnderstood({ changes: [], not_understood: [{ said: 'x', why: 'which meal?' }] }), nothingUnderstood({ changes: [{ type: 'skip' }] })],
    [true, true, false, false])
  const mixed = resolveChanges(answers.answers['2'], { today, refs: ctx.refs, items: ctx.items, recipes: RECIPES, slots: SLOTS })
  check('counts and types for analytics (labels and counts only)', [resolvedCounts(mixed.items), typesLabel(mixed.types)], [{ apply: 2, notChanged: 1, notDone: 0 }, 'on_hand:2,eating_out:1'])
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

// ── This week's purchases: voice corrects anything bought on or before today (7a3, 7a4)

{
  // The kale case: this week's list, first saved today (Thursday) and not
  // checked off, has a bunch of kale. It counts as bought on the week's
  // Sunday (11 Oct; keeps 5 days: good till Fri 16), so it's on hand today.
  const thu = '2026-10-15'
  const kaleList = (lines) => [thisWeekList(lines, { checked: false, savedOn: thu })]
  const gone = { changes: [{ type: 'on_hand', said: 'The kale is gone', item: 'kale', key: 'kale', answer: 'used_up' }], not_understood: [] }
  const resolveOn = (ctx, answer = gone) => resolveChanges(answer, { today: thu, refs: ctx.refs, items: ctx.items, recipes: RECIPES, slots: SLOTS }).items
  check('"The kale is gone" with no kale on any list: not on hand', resolveOn(fixtureContext({ lists: kaleList([['feta', 1, 8]]) })).map(summarize), ['[not_changed] Kale isn’t on hand'])
  const ctx = fixtureContext({ lists: kaleList([['kale', 1, 1]]) })
  const items = resolveOn(ctx)
  check('… with kale on this week’s list (saved today, not checked off): the context lists it, and the change applies', [ctx.context.on_hand.find((i) => i.key === 'kale'), items.map(summarize)],
    [{ key: 'kale', name: 'kale', left: 'About a bunch' }, ['[apply] on_hand kale used_up']])
  check('… Review’s row in plain words: "Kale used up", "Was about a bunch"', [items[0].title, items[0].line], ['Kale used up', 'Was about a bunch'])
  const [op] = planCorrections(items.map((i) => ({ ...i, id: 'kale-1' })), [], thu)
  check('… the row it writes (source voice: everything bought on or before today)', op.after,
    { ingredient_key: 'kale', as_of: thu, answer: 'used_up', amount: 0, unit: 'bunch', inferred_amount: 1, package_amount: 1, source: 'voice' })
  const saved = fixtureContext({ lists: kaleList([['kale', 1, 1]]), adjustments: [op.after] })
  check('… once saved, voice reads it as gone, and saying it again changes nothing', [saved.items.kale.amount, resolveOn(saved).map(summarize)], [0, ['[not_changed] Kale is already set to that']])
  check('… by Saturday it has spoiled (good till Friday): not on hand', resolveChanges(gone, { today: '2026-10-17', ...(({ refs, items: it }) => ({ refs, items: it }))(fixtureContext({ today: '2026-10-17', lists: kaleList([['kale', 1, 1]]) })), recipes: RECIPES, slots: SLOTS }).items.map(summarize), ['[not_changed] Kale isn’t on hand'])
  const milk = resolveOn(ctx, { changes: [{ type: 'on_hand', said: 'Out of milk', item: 'milk', answer: 'used_up' }], not_understood: [] })
  check('"Out of milk" with no milk: "Milk isn’t on hand"', milk.map((i) => [i.status, i.title, i.line]), [['not_changed', 'Milk isn’t on hand', '“Out of milk”']])
}

// ── Words: the bar and Review

{
  const item = (status, extra = {}) => ({ id: 'x', type: 'on_hand', status, key: 'feta', name: 'feta', answer: 'about_half', amount: 4, ...extra })
  check('bar: N changes made, then the first on-hand change in words', barText({ items: [item('applied'), item('applied', { key: 'egg', name: 'eggs', answer: 'used_up' })] }), { strong: '2 changes made.', rest: 'Feta about half left.' })
  check('bar: used up, and one change', barText({ items: [item('applied', { answer: 'used_up', amount: 0 })] }), { strong: '1 change made.', rest: 'Feta used up.' })
  check('bar: what wasn’t changed or saved instead', barText({ items: [item('applied'), item('applied'), item('not_changed'), item('failed'), item('not_done', { type: 'skip' })] }),
    { strong: '2 changes made.', rest: '1 couldn’t be saved. 1 not changed. 1 not done yet.' })
  check('Review titles', [reviewTitle({ items: [item('applied'), item('applied'), item('applied')] }), reviewTitle({ items: [item('undone')] }), reviewTitle({ items: [item('not_changed')] })],
    ['3 changes to your week', '1 change to your week', 'Nothing changed'])
  check('Review’s words: plain, the Week page’s short names ("Kale used up", "Feta about half left")',
    [onHandTitle(item('applied')), onHandTitle(item('applied', { key: 'kale', name: 'kale', answer: 'used_up', unit: 'bunch' })), onHandTitle(item('applied', { answer: 'a_little' })), onHandTitle(item('applied', { answer: 'plenty' })),
      onHandTitle(item('applied', { key: 'egg', name: 'eggs', answer: 'amount', amount: 6, unit: 'egg' })), onHandTitle(item('applied', { answer: 'amount', amount: 4, unit: 'oz' })), onHandTitle(item('applied', { answer: 'amount', amount: 0, unit: 'oz' }))],
    ['Feta about half left', 'Kale used up', 'Feta a little left', 'Feta plenty left', 'Eggs 6 left', 'Feta 4 oz left', 'Feta used up'])
  check('Review: a "Not changed" row’s words go when they’re all that was said', [sameWords('Out of milk.', 'out of milk'), sameWords('“Out of milk”', 'Out of milk.'), sameWords('out of milk', 'Out of milk and the kale is gone'), sameWords('', '')], [true, true, false, false])
  check('Review: Undo all only when something was applied (and stays, disabled, once it\'s all undone)',
    [canUndoAny({ items: [item('not_changed'), item('not_done', { type: 'skip' })] }), canUndoAny({ items: [item('applied'), item('not_changed')] }), canUndoAny({ items: [item('undone')] })], [false, true, true])
}


// ── Meal changes as row operations (7b): eating out, skip, move, swap, add, undo

{
  const today = '2026-10-15'
  // The fixture's week (voice-fixture.mjs) with last week and the week after
  // next, as the hook reads them. The recipes not on the plan get
  // ingredients and a dinner tag, so "with" and "use up" have something to find.
  const ING = {
    'r-kale-orzo': [{ name: 'kale', amount: 1, unit: 'bunch' }, { name: 'feta cheese', amount: 4, unit: 'oz' }, { name: 'orzo', amount: 8, unit: 'oz' }],
    'r-thighs': [{ name: 'chicken thighs', amount: 1.5, unit: 'lb' }, { name: 'lemon', amount: 1, unit: 'whole' }],
    'r-soup': [{ name: 'chicken breast', amount: 1, unit: 'lb' }, { name: 'lemon', amount: 2, unit: 'whole' }, { name: 'dill', amount: 1, unit: 'bunch' }],
    'r-feta-frittata': [{ name: 'eggs', amount: 8, unit: 'whole' }, { name: 'feta cheese', amount: 4, unit: 'oz' }],
    'r-taco-mac': [{ name: 'ground beef', amount: 1, unit: 'lb' }],
    'r-pork': [{ name: 'pork tenderloin', amount: 1, unit: 'lb' }],
  }
  const recipes = RECIPES.map((r) => (ING[r.id] ? { ...r, ingredients: ING[r.id], meal_tags: ['entree'] } : r))
  const weeks = () => [{ id: 'plan-w_1', week_start_date: '2026-10-04', entries: [] }, ...PLANS, { id: 'plan-w2', week_start_date: '2026-10-25', entries: [] }]
  const fresh = () => mc.mealModel(weeks(), recipes)
  const fx = fixtureContext()
  const resolve = (changes) => resolveChanges({ changes }, { today, refs: fx.refs, items: fx.items, recipes, slots: SLOTS }).items
  const context = (people = 1) => {
    let n = 0
    return { today, people, newId: () => `new-${++n}`, recipes, activeMembers: [], recent: new Map(), lastCooked: new Map() }
  }
  // A batch as the hook runs it: each change on the week the ones before left.
  const run = (changes, { people = 1, model = fresh() } = {}) => {
    const ctx = { ...context(people), start: model }
    let m = model
    const steps = []
    for (const item of resolve(changes)) {
      if (item.status !== 'apply') {
        steps.push({ item, status: item.status, reason: item.reason })
        continue
      }
      const step = mc.planMealChange(m, item, ctx)
      steps.push({ item, ...step, id: item.id, plans: m.plans })
      if (step.status === 'applied') m = step.model
    }
    return { steps, model: m, start: model }
  }
  const at = (model, row) => (row ? `${mc.rowDate(model, row)} ${String(row.meal_type).toLowerCase()} ${row.kind ?? model.recipeOf(row.recipe_id)?.title ?? 'none'}${row.is_leftover ? ' (leftover)' : ''}${row.servings != null ? ` ×${row.servings}` : ''}` : 'none')
  const week = (model, from = today) => model.rows.map((r) => at(model, r)).filter((t) => t >= from).sort()
  const table = (rows) => JSON.stringify(rows.map(mc.plainRow).map((r) => Object.fromEntries(Object.entries(r).sort())).sort((a, b) => a.id.localeCompare(b.id)))
  const undoAll = (rows, steps, plans) => {
    let now = rows
    const out = []
    for (const step of steps.filter((s) => s.status === 'applied').reverse()) {
      const plan = mc.planMealUndo(step, now, { plans })
      out.push(plan.ok ? 'undone' : `skipped ${plan.date}`)
      if (plan.ok) now = mc.applyOps(now, plan.ops)
    }
    return { rows: now, out }
  }
  const line = (step) => (step.status === 'applied' ? step.words.line : `not changed: ${step.reason}`)

  {
    const { steps, model, start } = run([{ type: 'eating_out', said: 'We’re eating out Friday', meal: 'm3' }])
    const [s] = steps
    check('eating out Friday: the salmon moves to the next free dinner, Mon 19 (next week), its leftovers placed from there',
      [s.status, s.words, s.highlight, s.cardLines],
      ['applied', { eyebrow: 'Fri dinner', was: 'Salmon rice bowls', title: 'Eating out', line: 'Salmon rice bowls moved to Mon 19', bar: 'Eating out Fri dinner.' }, ['new-1', 'e-fri'], { 'new-1': 'Salmon rice bowls moved to Mon 19' }])
    check('… the week after it (today on)', week(model), [
      '2026-10-15 dinner Black bean tacos ×3', '2026-10-16 breakfast Yogurt + Granola ×1', '2026-10-16 dinner eating_out', '2026-10-17 dinner Cheddar broccoli frittata ×3',
      '2026-10-17 lunch Black bean tacos (leftover) ×3', '2026-10-18 dinner Cheddar broccoli frittata (leftover) ×3', '2026-10-19 dinner Salmon rice bowls ×3',
      '2026-10-20 dinner Chicken orzo ×3', '2026-10-21 dinner Chicken orzo (leftover) ×3', '2026-10-22 dinner Salmon rice bowls (leftover) ×3', '2026-10-23 dinner Salmon rice bowls (leftover) ×3'])
    check('… the rows: the cook keeps its id and moves week, the eating-out row has no recipe', s.ops.map((o) => `${o.op} ${o.row?.id ?? o.id}${o.op === 'update' ? ` ${JSON.stringify(mc.changedColumns(o.before, o.after))}` : o.row.kind ? ` ${o.row.kind} recipe:${o.row.recipe_id}` : ''}`),
      ['update e-fri {"day_of_week":"monday","meal_plan_id":"plan-w1"}', 'insert new-2', 'insert new-3', 'insert new-1 eating_out recipe:null'])
    const undo = mc.planMealUndo(s, model.rows, { plans: model.plans })
    check('… Undo: the new rows go, the cook goes back to Friday (same id)', undo.ops.map((o) => `${o.op} ${o.row?.id ?? o.id}`), ['delete new-1', 'delete new-3', 'delete new-2', 'update e-fri'])
    check('… and the table is back exactly', table(mc.applyOps(model.rows, undo.ops)), table(start.rows))
  }

  {
    const { steps, model } = run([{ type: 'eating_out', said: 'Eating out Tuesday', meal: 'm7' }])
    check('eating out Tuesday: the orzo moves to Wednesday (its own leftover’s day, within 4 days), new leftovers after it',
      [line(steps[0]), week(model, '2026-10-20')], ['Chicken orzo moved to Wed 21', [
        '2026-10-20 dinner eating_out', '2026-10-21 dinner Chicken orzo ×3', '2026-10-22 dinner Chicken orzo (leftover) ×3', '2026-10-23 dinner Chicken orzo (leftover) ×3']])
  }

  {
    // Taco Mac on Monday first: Sat to Tue are all taken, so Friday's salmon comes off.
    const { steps, model, start } = run([
      { type: 'add', said: 'Put Taco Mac on Monday', date: '2026-10-19', slot: 'Dinner', recipe: 'Taco Mac' },
      { type: 'eating_out', said: 'and we’re eating out Friday', meal: 'm3' },
    ])
    check('the order said: Taco Mac on Monday, then eating out Friday: no free dinner within 4 days, so the salmon is taken off',
      steps.map(line), ['With 2 leftovers after', 'Salmon rice bowls taken off'])
    check('… nothing of the salmon is left', model.rows.some((r) => r.recipe_id === 'r-salmon'), false)
    const back = undoAll(model.rows, steps, model.plans)
    check('… Undo all, newest first: both undone and the table is back exactly (the salmon by id, Taco Mac gone)', [back.out, table(back.rows) === table(start.rows)], [['undone', 'undone'], true])
    const reverse = run([
      { type: 'eating_out', said: 'We’re eating out Friday', meal: 'm3' },
      { type: 'add', said: 'and put Taco Mac on Monday', date: '2026-10-19', slot: 'Dinner', recipe: 'Taco Mac' },
    ])
    check('… said the other way round: the salmon goes to Monday first, so Taco Mac doesn’t fit', reverse.steps.map(line), ['Salmon rice bowls moved to Mon 19', 'not changed: Monday’s dinner is Salmon rice bowls'])
  }

  {
    const { steps, model } = run([{ type: 'eating_out', said: 'No dinner Sunday, we’re at my mum’s', meal: 'm6' }])
    check('eating out on a leftover: it moves to the next free day it can go to (Mon 19, within 4 days of Saturday’s cook)',
      [steps[0].words.was, line(steps[0]), week(model, '2026-10-17').filter((t) => /frittata|eating/.test(t))],
      ['Leftover Cheddar broccoli frittata', 'Leftover Cheddar broccoli frittata moved to Mon 19', ['2026-10-17 dinner Cheddar broccoli frittata ×3', '2026-10-18 dinner eating_out', '2026-10-19 dinner Cheddar broccoli frittata (leftover) ×3']])
    const full = run([
      { type: 'add', said: 'Put Taco Mac on Monday', date: '2026-10-19', slot: 'Dinner', recipe: 'Taco Mac' },
      { type: 'eating_out', said: 'No dinner Sunday', meal: 'm6' },
    ])
    check('… with Monday taken too: the leftover is taken off and Saturday’s cook goes down a round (LO-6: 3 → 2 for one person)',
      [line(full.steps[1]), full.steps[1].ops.map((o) => `${o.op} ${o.row?.id ?? o.id}${o.op === 'update' ? ` ${JSON.stringify(mc.changedColumns(o.before, o.after))}` : ''}`)],
      ['Leftover Cheddar broccoli frittata taken off', ['delete e-sun', 'update e-sat {"servings":2}', 'insert new-4']])
  }

  {
    const { steps, model, start } = run([{ type: 'skip', said: 'Skip dinner Saturday', meal: 'm5' }])
    check('skip a cooked dinner: a "Skipped" entry, and the frittata moves to Sunday (where its own leftover was)',
      [steps[0].words.title, line(steps[0]), week(model, '2026-10-17').slice(0, 4)],
      ['Skipped', 'Cheddar broccoli frittata moved to Sun 18', ['2026-10-17 dinner skipped', '2026-10-17 lunch Black bean tacos (leftover) ×3', '2026-10-18 dinner Cheddar broccoli frittata ×3', '2026-10-19 dinner Cheddar broccoli frittata (leftover) ×3']])
    const undo = mc.planMealUndo(steps[0], model.rows, { plans: model.plans })
    const inserts = undo.ops.filter((o) => o.op === 'insert').map((o) => (o.row.is_leftover ? 'leftover' : 'cook'))
    check('… Undo puts the old leftover back (same id) after the cook is home, and the table is back exactly',
      [inserts, table(mc.applyOps(model.rows, undo.ops)) === table(start.rows)], [['leftover'], true])
    const kinds = run([{ type: 'eating_out', said: 'eating out Friday', meal: 'm3' }, { type: 'skip', said: 'actually skip Friday', date: '2026-10-16', slot: 'Dinner' }])
    check('the same slot twice: the later one counts (Changed again later)', kinds.steps.map((s) => s.status === 'applied' ? s.words.title : s.reason), ['Changed again later in what you said', 'Skipped'])
  }

  {
    // Eating out, then (a second batch) skipped: the kind changes on the same row.
    const first = run([{ type: 'eating_out', said: 'eating out Friday', meal: 'm3' }])
    const ctx2 = buildVoiceContext({ now: new Date(2026, 9, 15, 19), today, plans: mc.modelPlans(first.model).filter((p) => ['2026-10-11', '2026-10-18'].includes(p.week_start_date)), onHand: fx.onHand, recipes, slots: SLOTS, userId: USER })
    check('the context: an eating-out entry is a meal titled "Eating out" (kind on its ref, no id)', [ctx2.context.meals.find((m) => m.date === '2026-10-16' && m.slot === 'Dinner'), ctx2.refs.m3.kind], [{ ref: 'm3', date: '2026-10-16', slot: 'Dinner', title: 'Eating out' }, 'eating_out'])
    const again = resolveChanges({ changes: [{ type: 'eating_out', said: 'eating out Friday', meal: 'm3' }] }, { today, refs: ctx2.refs, items: ctx2.items, recipes, slots: SLOTS }).items
    check('… eating out there again is "already"', again.map(summarize), ['[not_changed] Fri dinner is already eating out'])
    const skip = resolveChanges({ changes: [{ type: 'skip', said: 'skip Friday', meal: 'm3' }] }, { today, refs: ctx2.refs, items: ctx2.items, recipes, slots: SLOTS }).items
    const step = mc.planMealChange(first.model, skip[0], { ...context(), start: first.model })
    check('… skipping it changes the kind on the same row', [step.words.was, step.words.title, step.ops.map((o) => `${o.op} ${JSON.stringify(mc.changedColumns(o.before, o.after))}`)], ['Eating out', 'Skipped', ['update {"kind":"skipped"}']])
    const swap = resolveChanges({ changes: [{ type: 'swap', said: 'plan Taco Mac Friday instead', meal: 'm3', recipe: 'Taco Mac' }] }, { today, refs: ctx2.refs, items: ctx2.items, recipes, slots: SLOTS }).items
    const planned = mc.planMealChange(first.model, swap[0], { ...context(), start: first.model })
    check('… a swap plans a meal instead: the row gets the recipe and loses its kind', [planned.words.was, planned.words.title, mc.changedColumns(planned.ops[0].before, planned.ops[0].after)],
      ['Eating out', 'Taco Mac', { recipe_id: 'r-taco-mac', servings: 1, kind: null }])
    check('… an empty slot: eating out adds a row; skip has nothing to skip', run([
      { type: 'eating_out', said: 'eating out next Friday', date: '2026-10-23', slot: 'Dinner' },
      { type: 'skip', said: 'skip lunch Monday', date: '2026-10-19', slot: 'Lunch' },
    ]).steps.map((s) => (s.status === 'applied' ? s.ops.map((o) => `${o.op} ${o.row.kind} ${o.row.day_of_week} ${o.row.meal_plan_id}`).join() : s.reason)), ['insert eating_out friday plan-w1', 'Nothing planned for Mon lunch'])
  }

  {
    const { steps, model, start } = run([{ type: 'move', said: 'Move the frittata to Monday', meal: 'm5', to_date: '2026-10-19' }])
    check('move across weeks: the frittata to Mon 19, its Sunday leftover goes and new ones follow from Monday',
      [steps[0].words, week(model, '2026-10-17').filter((t) => /frittata/.test(t))],
      [{ eyebrow: 'Sat dinner', was: null, title: 'Cheddar broccoli frittata', line: 'Moved to Mon 19', bar: 'Cheddar broccoli frittata moved to Mon 19.' },
        ['2026-10-19 dinner Cheddar broccoli frittata ×3', '2026-10-22 dinner Cheddar broccoli frittata (leftover) ×3', '2026-10-23 dinner Cheddar broccoli frittata (leftover) ×3']])
    const undo = mc.planMealUndo(steps[0], model.rows, { plans: model.plans })
    check('… undone: back on Saturday with its Sunday leftover (same ids), the table exactly as it was', table(mc.applyOps(model.rows, undo.ops)), table(start.rows))
    check('… onto another meal, or a leftover past its 4 days: not changed', [
      line(run([{ type: 'move', said: 'move the frittata to Tuesday', meal: 'm5', to_date: '2026-10-20' }]).steps[0]),
      line(run([{ type: 'move', said: 'move the tacos leftovers to Wednesday lunch', meal: 'm4', to_date: '2026-10-21', to_slot: 'Lunch' }]).steps[0]),
    ], ['not changed: Tuesday’s dinner is Chicken orzo', 'not changed: Leftovers can only go in the 4 days after Thursday'])
  }

  {
    const pick = (said, extra) => {
      const { steps } = run([{ type: 'swap', said, ...extra }])
      return steps[0].status === 'applied' ? [steps[0].words.was, steps[0].words.title, steps[0].words.line] : steps[0].reason
    }
    check('swap with a named recipe', pick('Make Saturday the broccoli feta frittata', { meal: 'm5', recipe: 'Broccoli & feta frittata' }), ['Cheddar broccoli frittata', 'Broccoli & feta frittata', null])
    const ranked = mc.pickSwapRecipe(fresh(), context(), fresh().rows.find((r) => r.id === 'e-tue'), { withWords: ['chicken'] })
    check('swap with words ("something with chicken"): the picker’s first recipe that has chicken', pick('Something with chicken on Tuesday', { meal: 'm7', with: ['chicken'] }), ['Chicken orzo', ranked.recipe.title, 'Has chicken'])
    check('… it’s one of the chicken recipes, and the same every time', [['Lemon chicken soup', 'Sheet-pan chicken thighs'].includes(ranked.recipe.title), pick('Something with chicken on Tuesday', { meal: 'm7', with: ['chicken'] })[1]], [true, ranked.recipe.title])
    check('swap to use something up: the recipe that uses the kale', pick('Can we use up the kale on Saturday?', { meal: 'm5', use_up: ['kale'] }), ['Cheddar broccoli frittata', 'Kale & feta orzo', 'Uses the kale'])
    const top = mc.pickSwapRecipe(fresh(), context(), fresh().rows.find((r) => r.id === 'e-fri'), {})
    check('swap with no wish: the picker’s top for that slot (deterministic)', [pick('Swap the salmon for something else', { meal: 'm3' })[1], pick('Swap the salmon for something else', { meal: 'm3' })[1]], [top.recipe.title, top.recipe.title])
    check('… nothing fits the wish: not changed', pick('something with quinoa Tuesday', { meal: 'm7', with: ['quinoa'] }), 'No recipe with quinoa fits Tuesday')
    const { steps, model, start } = run([{ type: 'swap', said: 'Make Saturday the broccoli feta frittata', meal: 'm5', recipe: 'Broccoli & feta frittata' }])
    check('… the swap’s rows: the entry keeps its id, its old leftover goes, new ones follow (as the picker swaps)', steps[0].ops.map((o) => `${o.op} ${o.row?.id ?? o.id}`), ['update e-sat', 'delete e-sun', 'insert new-1', 'insert new-2'])
    check('… undone exactly', table(mc.applyOps(model.rows, mc.planMealUndo(steps[0], model.rows, { plans: model.plans }).ops)), table(start.rows))
  }

  {
    const { steps, model } = run([{ type: 'add', said: 'Put Taco Mac on Monday', date: '2026-10-19', slot: 'Dinner', recipe: 'Taco Mac' }])
    check('add: Taco Mac into Monday’s free dinner, as the picker adds it (people × (1 + leftovers))', [steps[0].words.title, week(model, '2026-10-19').filter((t) => /Taco Mac/.test(t))],
      ['Taco Mac', ['2026-10-19 dinner Taco Mac ×3', '2026-10-22 dinner Taco Mac (leftover) ×3', '2026-10-23 dinner Taco Mac (leftover) ×3']])
    check('… into a taken slot: not changed; a one-off meal without its parsed quick meal has nothing to add', [
      line(run([{ type: 'add', said: 'Add hot honey pork for Wednesday', date: '2026-10-21', slot: 'Dinner', recipe: 'Hot honey pork stir fry' }]).steps[0]),
      line(run([{ type: 'add', said: 'Lunch tomorrow is two eggs and toast', date: '2026-10-16', slot: 'Lunch', text: 'two eggs and toast' }]).steps[0]),
    ], ['not changed: Wednesday has the chicken orzo leftovers', 'not changed: Didn’t catch what to add'])
  }

  // ── One-off meals (7c): "lunch tomorrow is two eggs and toast"
  {
    const EGGS_TOAST = [{ name: 'eggs', amount: 2, unit: 'whole', calories: 144, protein: 12, carbs: 0, fat: 10 }, { name: 'toast', amount: 1, unit: 'whole', calories: 80, protein: 3, carbs: 15, fat: 1 }]
    const said = { type: 'add', said: 'Lunch tomorrow is two eggs and toast', date: '2026-10-16', slot: 'Lunch', text: 'two eggs and toast' }
    const [item] = resolve([said])
    check('the resolver: an add from words alone is applied (no longer "Not done yet"), with its text', [item.status, item.text, item.recipeId, item.title], ['apply', 'two eggs and toast', null, 'Two eggs and toast'])
    check('… a recipe that isn’t there but words that are: a one-off; one of the person’s quick meals by name: that quick meal',
      [resolve([{ ...said, recipe: 'Eggs and toast' }]).map((i) => [i.status, i.text]), resolve([{ type: 'add', said: 'lunch tomorrow is yogurt and granola', date: '2026-10-16', slot: 'Lunch', recipe: 'Yogurt + Granola' }]).map((i) => [i.status, i.recipeId, i.title])],
      [[['apply', 'two eggs and toast']], [['apply', 'r-yogurt', 'Yogurt + Granola (quick)']]])
    const start = fresh()
    const step = mc.planMealChange(start, { ...item, recipe: mc.oneOffRecipe({ title: 'Eggs + Toast', ingredients: EGGS_TOAST }, 'q-new') }, { ...context(), start })
    check('the add: Fri lunch, "Eggs + Toast (quick)", servings 1 and no leftovers (a quick meal)', [step.status, step.words, step.ops.map((o) => `${o.op} ${o.row.day_of_week} ${o.row.meal_type} ${o.row.recipe_id} ×${o.row.servings}`)],
      ['applied', { eyebrow: 'Fri lunch', was: null, title: 'Eggs + Toast (quick)', line: null, bar: 'Eggs + Toast added to Fri lunch.' }, ['insert friday Lunch q-new ×1']])
    check('… the week after it has the row with its quick meal (for the later changes in the batch)', week(step.model, '2026-10-16').filter((t) => t.startsWith('2026-10-16')), ['2026-10-16 breakfast Yogurt + Granola ×1', '2026-10-16 dinner Salmon rice bowls ×3', '2026-10-16 lunch Eggs + Toast ×1'])
    const undo = mc.planMealUndo(step, step.model.rows, { plans: step.model.plans })
    check('… Undo: the entry goes and the table is back exactly', [undo.ops.map((o) => o.op), table(mc.applyOps(step.model.rows, undo.ops)) === table(start.rows)], [['delete'], true])
    const change = { ...step, createdRecipeId: 'q-new' }
    check('… and its quick meal: removed when nothing uses it, kept when something else does, none when the change didn’t save one',
      [mc.quickMealUndo(change, []), mc.quickMealUndo(change, [{ id: 'sat-b', recipe_id: 'q-new' }]), mc.quickMealUndo(step, [])], ['remove', 'keep', null])
    check('a one-off into a taken slot: not changed (Friday’s breakfast is the yogurt)', mc.planMealChange(start, { ...item, slot: 'Breakfast', recipe: mc.oneOffRecipe({ title: 'Eggs + Toast', ingredients: EGGS_TOAST }) }, { ...context(), start }).reason, 'Friday’s breakfast is Yogurt + Granola')
    check('the same meal as a saved quick meal: same name and items (amounts and units); otherwise a new one', [
      sameQuickMeal({ label: 'Eggs + Toast', ingredients: EGGS_TOAST }, { title: 'eggs + toast', ingredients: EGGS_TOAST.map((i) => ({ ...i })) }),
      sameQuickMeal({ label: 'Eggs + Toast', ingredients: EGGS_TOAST }, { title: 'Eggs + Toast', ingredients: [{ ...EGGS_TOAST[0], amount: 3 }, EGGS_TOAST[1]] }),
      sameQuickMeal({ label: 'Eggs + Muffin', ingredients: EGGS_TOAST }, { title: 'Eggs + Toast', ingredients: EGGS_TOAST }),
      sameQuickMeal({ label: 'Eggs + Toast', ingredients: [] }, { title: 'Eggs + Toast', ingredients: [] }),
    ], [true, false, false, false])

    // The real hook (useMealChanges) on in-memory tables: the quick meal is
    // saved only when the add goes in, taken off again when its rows can't
    // be written, and removed on Undo unless something else uses it.
    const entries = new Map()
    const recipeRows = new Map(recipes.map((r) => [r.id, r]))
    const planIds = new Map(weeks().map((p) => [p.week_start_date, p.id]))
    for (const p of weeks()) for (const e of p.entries) entries.set(e.id, mc.plainRow({ ...e, meal_plan_id: e.meal_plan_id ?? p.id }))
    const startTable = table([...entries.values()])
    globalThis.__queryData = (key) => {
      if (key[0] !== 'mealPlan') return undefined
      const id = planIds.get(key[2]) ?? `plan-${key[2]}`
      return { id, week_start_date: key[2], entries: [...entries.values()].filter((e) => e.meal_plan_id === id).map((e) => ({ ...e, recipe: recipeRows.get(e.recipe_id) ?? null })) }
    }
    globalThis.__supabaseSelect = ({ table: t, filters }) => (t !== 'meal_plan_entries' ? undefined
      : [...entries.values()].filter((e) => (!filters.meal_plan_id || filters.meal_plan_id.includes(e.meal_plan_id)) && (!filters.recipe_id || e.recipe_id === filters.recipe_id)))
    globalThis.__supabaseWrite = ({ table: t, op, rows, filters }) => {
      if (t === 'recipes' && op === 'delete') recipeRows.delete(filters.id)
      if (t !== 'meal_plan_entries') return
      if (op === 'insert') for (const r of rows) entries.set(r.id, { ...r })
      if (op === 'delete') entries.delete(filters.id)
      if (op === 'update') entries.set(filters.id, { ...entries.get(filters.id), ...rows[0] })
    }
    const saved = []
    const hookCtx = {
      ...context(),
      extraRecipes: [],
      saveQuickMeal: async ({ title, ingredients }) => {
        const row = { ...mc.oneOffRecipe({ title, ingredients }, `q-${saved.length + 1}`), created_by: 'user-1' }
        saved.push(row.id)
        recipeRows.set(row.id, row)
        return row
      },
    }
    const hook = useMealChanges()
    const oneOff = { ...item, oneOff: { title: 'Eggs + Toast', ingredients: EGGS_TOAST }, title: 'Eggs + Toast (quick)' }
    const record = (r, id = item.id) => ({ id, ops: r.ops, date: r.date, plans: r.model?.plans ?? [], createdRecipeId: r.createdRecipeId ?? null })
    const quiet = async (fn) => {
      const was = console.error
      console.error = () => {}
      try { return await fn() } finally { console.error = was }
    }

    let out = await hook.apply([oneOff], hookCtx)
    let r = out.results[item.id]
    const lunch = [...entries.values()].find((e) => e.recipe_id === 'q-1')
    check('the hook: the quick meal is saved, then the entry written (Fri lunch, ×1)', [r.status, r.createdRecipeId, saved, lunch && `${lunch.day_of_week} ${lunch.meal_type} ×${lunch.servings}`], ['applied', 'q-1', ['q-1'], 'friday Lunch ×1'])
    let back = await hook.undo([record(r)])
    check('… Undo: the entry and the quick meal go; the table is back exactly', [back.undone, back.quickMeals, recipeRows.has('q-1'), table([...entries.values()]) === startTable],
      [[item.id], { removed: [item.id], kept: [] }, false, true])

    out = await hook.apply([oneOff], hookCtx)
    r = out.results[item.id]
    entries.set('also-sat', { id: 'also-sat', meal_plan_id: 'plan-w0', recipe_id: r.createdRecipeId, day_of_week: 'saturday', meal_type: 'Breakfast', is_leftover: false, original_entry_id: null, servings: 1 })
    back = await hook.undo([record(r)])
    check('… with something else using the quick meal (Saturday breakfast too): the entry goes, the quick meal stays',
      [back.undone, back.quickMeals, recipeRows.has(r.createdRecipeId), entries.has('also-sat'), [...entries.values()].filter((e) => e.recipe_id === r.createdRecipeId).length], [[item.id], { removed: [], kept: [item.id] }, true, true, 1])
    entries.delete('also-sat')

    const before = saved.length
    out = await hook.apply([{ ...oneOff, slot: 'Breakfast', eyebrow: 'Fri breakfast' }], hookCtx)
    check('… into a taken slot: not changed, and no quick meal saved', [out.results[item.id].status, out.results[item.id].reason, saved.length - before], ['not_changed', 'Friday’s breakfast is Yogurt + Granola', 0])

    globalThis.__supabaseFail = ({ table: t, op }) => (t === 'meal_plan_entries' && op === 'insert' ? { message: 'insert failed' } : null)
    out = await quiet(() => hook.apply([oneOff], hookCtx))
    globalThis.__supabaseFail = null
    const lost = saved[saved.length - 1]
    check('… its entry can’t be written: failed, and the quick meal it saved is taken off again', [out.results[item.id].status, recipeRows.has(lost), table([...entries.values()]) === startTable], ['failed', false, true])
    out = await quiet(() => hook.apply([oneOff], { ...hookCtx, saveQuickMeal: async () => { throw new Error('save failed') } }))
    check('… the quick meal can’t be saved: failed, nothing written', [out.results[item.id].status, table([...entries.values()]) === startTable], ['failed', true])
    globalThis.__queryData = null
    globalThis.__supabaseSelect = null
    globalThis.__supabaseWrite = null
  }

  {
    // Changed since: Monday's salmon was edited after the batch, so its undo is skipped; the other change is still undone.
    const { steps, model } = run([
      { type: 'eating_out', said: 'eating out Friday', meal: 'm3' },
      { type: 'add', said: 'Taco Mac next Friday', date: '2026-10-23', slot: 'Lunch', recipe: 'Taco Mac' },
    ])
    const edited = model.rows.map((r) => (r.id === 'e-fri' ? { ...r, servings: 5 } : r))
    check('Undo all when a row changed since: that change is skipped ("Monday changed since"), the other undone', undoAll(edited, steps, model.plans).out, ['undone', 'skipped 2026-10-19'])
    const taken = mc.applyOps(model.rows, [{ op: 'insert', row: { id: 'x', meal_plan_id: 'plan-w0', recipe_id: 'r-pork', day_of_week: 'friday', meal_type: 'Dinner', is_leftover: false, original_entry_id: null, servings: 1 } }])
    const kindDeleted = taken.filter((r) => r.kind !== 'eating_out')
    check('… or when the slot a row goes back to has something else in it now', mc.planMealUndo(steps[0], kindDeleted, { plans: model.plans }), { ok: false, date: '2026-10-16' })
    check('… a change whose row was deleted since is skipped too', mc.planMealUndo(steps[1], model.rows.filter((r) => r.recipe_id !== 'r-taco-mac' || r.is_leftover), { plans: model.plans }).ok, false)
  }

  {
    // "Changed while you were talking": the week as read has another meal there.
    const start = fresh()
    const moved = { ...start, rows: start.rows.map((r) => (r.id === 'e-fri' ? { ...r, recipe_id: 'r-pork', recipe: recipes.find((x) => x.id === 'r-pork') } : r)) }
    const item = resolve([{ type: 'eating_out', said: 'eating out Friday', meal: 'm3' }])[0]
    check('a meal that changed between the words and the write: not changed', mc.planMealChange(moved, item, { ...context(), start: moved }).reason, 'Friday changed while you were talking')
  }

  {
    // The follow-on offer and the shortfall line: Saturday's Broccoli & feta
    // frittata takes 4 oz of this week's 8 oz feta (checked off). "The feta's
    // gone" today leaves it short.
    const feta = recipes.find((r) => r.id === 'r-feta-frittata')
    const plan = { id: 'plan-w0', week_start_date: '2026-10-11', entries: [{ id: 'sat-f', meal_plan_id: 'plan-w0', day_of_week: 'saturday', meal_type: 'Dinner', recipe_id: feta.id, recipe: feta, is_leftover: false, original_entry_id: null, servings: 3 }] }
    const list = thisWeekList([['feta', 1, 8]])
    const rows = prepareOnHand({ lists: [list], plans: [plan], adjustments: [] }, [], { weekStart: '2026-10-11' })
    const before = inferOnHand(rows, { today })
    const item = { id: 'c1', type: 'on_hand', status: 'applied', key: 'feta', name: 'feta' }
    const gone = { ingredient_key: 'feta', as_of: today, answer: 'used_up', amount: 0, unit: 'oz', source: 'voice' }
    const after = inferOnHand({ ...rows, adjustments: withAdjustment(rows.adjustments, gone) }, { today })
    const model = mc.mealModel([plan], recipes)
    check('the follow-on offer: one row, "Sat’s Broccoli & feta frittata used the feta", never applied on its own',
      mc.followOnOffers({ before, after, items: [item], model, today }).map((o) => [o.title, o.entryId, o.date, o.slot]), [['Sat’s Broccoli & feta frittata used the feta', 'sat-f', '2026-10-17', 'Dinner']])
    check('… no offer when the meal still gets what it needs (about half left)', mc.followOnOffers({ before, after: inferOnHand({ ...rows, adjustments: withAdjustment(rows.adjustments, { ...gone, answer: 'about_half', amount: 4 }) }, { today }), items: [item], model, today }), [])
    const offer = mc.planMealChange(model, { id: 'c1-offer', type: 'swap', said: '', entryId: 'sat-f', date: '2026-10-17', slot: 'Dinner', with: [], useUp: [] }, { ...context(), start: model })
    check('… its Swap: the picker’s top for that slot, with the rows to undo it', [offer.status, offer.words.was, offer.ops[0].op], ['applied', 'Broccoli & feta frittata', 'update'])
    const short = weekShortfall(after, { weekStart: '2026-10-11', today, titles: { 'sat-f': feta.title } })
    check('the shortfall: Saturday is 4 oz of feta short (bought this week, now gone); the eggs were never on the list', short,
      { egg: { amount: 8, unit: 'egg', meals: ['Broccoli & feta frittata'] }, feta: { amount: 4, unit: 'oz', meals: ['Broccoli & feta frittata'] } })
    const items = list.items.map((i) => ({ ...i, category: 'Dairy' }))
    const lines = withShortfallLines(items, short)
    check('… the checked feta gets a line to buy after it ("More feta · 4 oz"); eggs have no checked line, so nothing', lines.map((l) => [l.key, l.name, l.checked, l.package?.text ?? null, l.meals ?? []]),
      [['feta', 'feta', true, '', []], ['feta:again', 'more feta', false, '4 oz', ['Broccoli & feta frittata']]])
  }

  {
    // The bar and Review words for meal changes.
    const item = (type, extra) => ({ id: type, type, status: 'applied', ...extra })
    check('bar: the first change in words, whatever its kind', [
      barText({ items: [item('eating_out', { bar: 'Eating out Fri dinner.' }), item('on_hand', { key: 'feta', name: 'feta', answer: 'used_up', amount: 0 })] }),
      barText({ items: [item('move', { bar: 'Salmon rice bowls moved to Mon 19.' })] }),
    ], [{ strong: '2 changes made.', rest: 'Eating out Fri dinner.' }, { strong: '1 change made.', rest: 'Salmon rice bowls moved to Mon 19.' }])
    check('short meal names: up to " with "', mc.shortTitle('Firecracker Meatballs with Roasted Green Beans & Sesame Rice'), 'Firecracker Meatballs')
  }
}

// ── Live listening (7c): the state machine, with made-up times (ms)

{
  const ev = (type, t, extra = {}) => ({ type, t, ...extra })
  const said = (s) => [s.outcome?.kind ?? null, s.outcome?.text ?? null, s.endedBy]
  const finalRun = listenRun([ev('audiostart', 300), ev('result', 1400, { interim: 'we’re out' }), ev('result', 2000, { interim: 'we’re out of eggs' }), ev('result', 3000, { finals: 'We’re out of eggs' }), ev('end', 3100)])
  check('interim words, then a final: sent as soon as the final comes (the end after it changes nothing)', said(finalRun), ['send', 'We’re out of eggs', 'final'])
  check('… ms to the first words (from the tap)', msToWords(finalRun), 1400)
  const mid = listenRun([ev('audiostart', 300), ev('result', 1400, { interim: 'we’re out' }), ev('result', 2000, { interim: 'we’re out of eggs' })])
  check('the live words: the newest (not in the interim words before) in the lighter colour', [liveWords(mid), liveWords(listenRun([ev('result', 900, { interim: 'skip' })]))], [{ settled: 'we’re out', newest: 'of eggs' }, { settled: '', newest: 'skip' }])
  const stopInterim = [ev('audiostart', 200), ev('result', 1500, { interim: 'skip friday' }), ev('stop', 3000)]
  check('Stop with interim words only: nothing for a second, then the interim words are sent',
    [said(listenRun([...stopInterim, ev('tick', 3800)])), said(listenRun([...stopInterim, ev('tick', 3000 + LISTEN.stopGraceMs)]))], [[null, null, null], ['send', 'skip friday', 'stop']])
  check('… a final within the second is sent instead; the recognizer ending sends what it has',
    [said(listenRun([...stopInterim, ev('result', 3400, { finals: 'Skip Friday' })])), said(listenRun([...stopInterim, ev('end', 3300)]))], [['send', 'Skip Friday', 'stop'], ['send', 'skip friday', 'stop']])
  check('… Stop before any words: "Didn’t hear anything" after the second', said(listenRun([ev('audiostart', 200), ev('stop', 900), ev('tick', 1900)])), ['didnt_hear', null, 'stop'])
  check('8 s with nothing heard after audiostart: "Didn’t hear anything", ended by deaf (not at 7.9 s)',
    [said(listenRun([ev('audiostart', 500), ev('tick', 8400)])), said(listenRun([ev('audiostart', 500), ev('tick', 500 + LISTEN.silenceMs)]))], [[null, null, null], ['didnt_hear', null, 'deaf']])
  check('… speechstart counts as heard: no deaf at 8 s; the 30 s cap ends it', [said(listenRun([ev('audiostart', 500), ev('speechstart', 2000), ev('tick', 9000)])), said(listenRun([ev('audiostart', 500), ev('speechstart', 2000), ev('tick', LISTEN.capMs)]))],
    [[null, null, null], ['didnt_hear', null, 'silence']])
  check('the 30 s cap: words heard are sent; no audiostart (a prompt left open) is "Didn’t hear anything"',
    [said(listenRun([ev('audiostart', 100), ev('result', 1000, { interim: 'we’re out of' }), ev('speechstart', 1000), ev('tick', 29_999)])), said(listenRun([ev('audiostart', 100), ev('result', 1000, { interim: 'we’re out of' }), ev('tick', LISTEN.capMs)])), said(listenRun([ev('tick', 29_000), ev('tick', LISTEN.capMs)]))],
    [[null, null, null], ['send', 'we’re out of', 'stop'], ['didnt_hear', null, 'silence']])
  check('the mic not allowed (and service-not-allowed, no mic): "The mic is off"', ['not-allowed', 'service-not-allowed', 'audio-capture'].map((e) => said(listenRun([ev('error', 50, { error: e })]))),
    [['denied', null, 'denied'], ['denied', null, 'denied'], ['denied', null, 'denied']])
  check('the recognizer’s own no-speech, or an end with nothing: "Didn’t hear anything"; an end after words sends them',
    [said(listenRun([ev('audiostart', 100), ev('error', 6000, { error: 'no-speech' })])), said(listenRun([ev('audiostart', 100), ev('end', 5000)])), said(listenRun([ev('audiostart', 100), ev('result', 900, { interim: 'out of milk' }), ev('end', 2000)]))],
    [['didnt_hear', null, 'silence'], ['didnt_hear', null, 'silence'], ['send', 'out of milk', 'final']])
  check('another error (network): typing when nothing was heard, the words when some were',
    [said(listenRun([ev('error', 400, { error: 'network' })])), said(listenRun([ev('result', 900, { interim: 'out of milk' }), ev('error', 1200, { error: 'network' })]))], [['typing', null, 'error'], ['send', 'out of milk', 'error']])
  check('Cancel ends the run; nothing after an outcome changes it', [said(listenRun([ev('result', 900, { interim: 'out of' }), ev('cancel', 1000), ev('result', 1100, { finals: 'Out of milk' })]))], [['cancelled', null, 'cancel']])
  check('the words so far: finals then interim', heardText({ finals: 'We’re out of eggs.', interim: ' and  milk ' }), 'We’re out of eggs. and milk')
  check('what the mic opens: listening with speech recognition; typing without it, or after a deaf run (why, for voice_captured)',
    [micMode({ hasApi: true, deaf: false }), micMode({ hasApi: false, deaf: false }), micMode({ hasApi: true, deaf: true })],
    [{ mode: 'listen', fallback: 'none' }, { mode: 'type', fallback: 'no_speech_api' }, { mode: 'type', fallback: 'deaf' }])

  // The recognizer wrapper with a stand-in SpeechRecognition, a clock and the tick.
  const made = []
  class FakeSR {
    constructor() { made.push(this); this.calls = [] }
    start() { this.calls.push('start') }
    stop() { this.calls.push('stop') }
    abort() { this.calls.push('abort') }
  }
  const saved = { window: globalThis.window, performance: globalThis.performance, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }
  let clock = 0
  const ticks = []
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true })
  globalThis.setInterval = (fn) => { ticks.push(fn); return ticks.length }
  globalThis.clearInterval = (id) => { ticks[id - 1] = null }
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1'
  globalThis.window = { webkitSpeechRecognition: FakeSR, navigator: { userAgent: iphone, language: 'en-US' } }
  try {
    const ended = []
    const first = startListening({ onEnd: (st) => ended.push(st.endedBy) })
    const rec1 = made[0]
    check('a run: a fresh recognizer started at once (in the tap), interim results on, continuous off', [made.length, rec1.calls, rec1.interimResults, rec1.continuous, rec1.lang], [1, ['start'], true, false, 'en-US'])
    clock = 300
    rec1.onaudiostart()
    clock = 1400
    rec1.onresult({ results: [Object.assign([{ transcript: 'we’re out of eggs' }], { isFinal: false })] })
    clock = 2600
    rec1.onresult({ results: [Object.assign([{ transcript: 'We’re out of eggs' }], { isFinal: true })] })
    check('… a final result: sent, the recognizer aborted (the mic goes off), onEnd once', [first.state().outcome, rec1.calls, ended], [{ kind: 'send', text: 'We’re out of eggs' }, ['start', 'abort'], ['final']])
    check('… not deaf, so the mic listens next time', [wentDeaf(), micMode({ hasApi: !!speechApi(), deaf: wentDeaf() }).mode], [false, 'listen'])
    const second = startListening({ onEnd: (st) => ended.push(st.endedBy) })
    const rec2 = made[1]
    clock = 10_000
    rec2.onaudiostart()
    clock = 10_000 + LISTEN.silenceMs
    ticks[ticks.length - 1]()
    check('the second run goes deaf (audiostart, then nothing for 8 s): "Didn’t hear anything", aborted', [made.length, second.state().outcome, second.state().endedBy, rec2.calls], [2, { kind: 'didnt_hear' }, 'deaf', ['start', 'abort']])
    check('… deaf → the next mic tap in this page session opens typing', [wentDeaf(), micMode({ hasApi: !!speechApi(), deaf: wentDeaf() })], [true, { mode: 'type', fallback: 'deaf' }])
    const third = startListening({})
    made[2].onerror({ error: 'not-allowed' })
    check('a mic that isn’t allowed: "The mic is off"', third.state().outcome, { kind: 'denied' })
    globalThis.window.navigator.userAgent = iphone.replace('Version/27.0 Mobile/15E148 Safari/604.1', 'CriOS/140.0 Mobile/15E148 Safari/604.1')
    check('Chrome on the iPhone has the object but no speech: counts as none (typing)', [speechApi(), startListening({})], [null, null])
    globalThis.window = { navigator: { userAgent: 'Firefox' } }
    check('Firefox: no speech recognition', speechApi(), null)
  } finally {
    globalThis.window = saved.window
    Object.defineProperty(globalThis, 'performance', { value: saved.performance, configurable: true, writable: true })
    globalThis.setInterval = saved.setInterval
    globalThis.clearInterval = saved.clearInterval
  }
}

// ── The probe (v2): the iOS version from Safari's Version/

check('iOS 27 with the user agent frozen at 18.7: 27.0 from Version/, said to be frozen', iosVersionOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1'),
  { ios: '27.0', fromUserAgent: '18.7', safari: '27.0', frozen: true })
check('… iOS 17 (not frozen): the user agent’s OS; no Version/ (a web view): the OS as given; not an iPhone: nothing', [
  iosVersionOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1').ios,
  iosVersionOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'),
  iosVersionOf('Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0').ios,
], ['17.5', { ios: '18.7', fromUserAgent: '18.7', safari: null, frozen: false }, null])

console.log(`check:voice — ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
