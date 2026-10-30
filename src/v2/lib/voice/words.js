// Words for voice changes: Review's rows (A2) and the bar (B2). Plain JS.
import { shortAmountText } from '../onHand.js'
import { shortDayOf } from './dates.js'

export const capitalize = (s) => {
  const t = String(s ?? '').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

/** "Fri 16" */
export const dayLabel = (date) => `${shortDayOf(date)} ${Number(String(date).slice(8, 10))}`

/** "Fri dinner" (Review's eyebrow; shown in capitals). */
export const slotLabel = (date, slot) => `${shortDayOf(date)} ${String(slot ?? '').toLowerCase()}`

const ANSWER_WORDS = { a_little: 'a little', about_half: 'about half', plenty: 'plenty' }
const COUNTED = new Set(['egg', 'muffin', 'each'])

/**
 * An on-hand change in plain words (7a3, the Week page's short names): "Kale
 * used up", "Feta about half left", "Eggs 6 left", "Feta 4 oz left".
 */
export function onHandTitle(item) {
  const name = capitalize(item.name)
  if (item.answer === 'used_up' || (item.answer === 'amount' && !(item.amount > 0))) return `${name} used up`
  if (item.answer !== 'amount') return `${name} ${ANSWER_WORDS[item.answer] ?? 'some'} left`
  const amount = COUNTED.has(item.unit) ? String(Math.round(item.amount)) : shortAmountText(item.key, item.amount, item.name)
  return `${name} ${amount} left`
}

/** The bar's words for an on-hand change: "Feta used up.", "Feta about half left." */
export function onHandBarWords(item) {
  return `${onHandTitle(item)}.`
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * The bar (B2): { strong: "2 changes made.", rest } where rest says what
 * wasn't changed ("1 not changed.", "1 couldn't be saved.") or, when
 * everything went in, the first on-hand change in words.
 */
export function barText(result) {
  const done = result.items.filter((i) => i.status === 'applied')
  const failed = result.items.filter((i) => i.status === 'failed').length
  const notChanged = result.items.filter((i) => i.status === 'not_changed').length
  const notDone = result.items.filter((i) => i.status === 'not_done').length
  const strong = `${plural(done.length, 'change', 'changes')} made.`
  const rest = []
  if (failed) rest.push(`${failed} couldn’t be saved.`)
  if (notChanged) rest.push(`${notChanged} not changed.`)
  if (notDone) rest.push(`${notDone} not done yet.`)
  if (!rest.length) {
    const first = done.find((i) => i.type === 'on_hand')
    if (first) rest.push(onHandBarWords(first))
  }
  return { strong, rest: rest.join(' ') }
}

const plainWords = (s) => String(s ?? '').toLowerCase().replace(/[“”"‘’'.,!?;:]/g, '').replace(/\s+/g, ' ').trim()

/** Whether a change's words are the whole of what was said ("Out of milk." and "out of milk"). */
export function sameWords(said, text) {
  const a = plainWords(said)
  return !!a && a === plainWords(text)
}

/** Whether Review shows Undo all: something in the batch was applied (it may be undone since). */
export function canUndoAny(result) {
  return result.items.some((i) => i.status === 'applied' || i.status === 'undone' || i.status === 'undo_skipped')
}

/** Review's title (A2): "3 changes to your week", or "Nothing changed". */
export function reviewTitle(result) {
  const n = result.items.filter((i) => i.status === 'applied' || i.status === 'undone' || i.status === 'undo_skipped').length
  return n ? `${plural(n, 'change', 'changes')} to your week` : 'Nothing changed'
}
