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

/** What an on-hand change sets: "about half", "6 oz", or null for used up. */
function setTo(item) {
  if (item.answer === 'amount') return shortAmountText(item.key, item.amount, item.name)
  return ANSWER_WORDS[item.answer] ?? null
}

/** "Feta used up" / "Feta set to about half" / "Eggs set to 6 eggs". */
export function onHandTitle(item) {
  const name = capitalize(item.name)
  const to = setTo(item)
  return item.answer === 'used_up' || (item.answer === 'amount' && !(item.amount > 0)) ? `${name} used up` : `${name} set to ${to}`
}

/** The bar's words for an on-hand change: "Feta marked used up." */
export function onHandBarWords(item) {
  const name = capitalize(item.name)
  const to = setTo(item)
  return item.answer === 'used_up' || (item.answer === 'amount' && !(item.amount > 0)) ? `${name} marked used up.` : `${name} set to ${to}.`
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

/** Review's title (A2): "3 changes to your week", or "Nothing changed". */
export function reviewTitle(result) {
  const n = result.items.filter((i) => i.status === 'applied' || i.status === 'undone' || i.status === 'undo_skipped').length
  return n ? `${plural(n, 'change', 'changes')} to your week` : 'Nothing changed'
}
